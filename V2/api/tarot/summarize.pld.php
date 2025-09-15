<?php
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

/* Handlers d’erreur → toujours du JSON */
set_exception_handler(function($e){
  http_response_code(500);
  echo json_encode(['ok'=>false,'stage'=>'exception','message'=>$e->getMessage()], JSON_UNESCAPED_UNICODE);
});
set_error_handler(function($severity,$message,$file,$line){
  http_response_code(500);
  echo json_encode(['ok'=>false,'stage'=>'php-error','message'=>"$message @ $file:$line"], JSON_UNESCAPED_UNICODE);
  return true;
});

/* Clé API depuis fichier privé ou .htaccess SetEnv */
$privateCfg = __DIR__ . '/../../../config.php'; // /home/TONCOMPTE/config.php
if (is_file($privateCfg)) { require_once $privateCfg; }
$apiKey = getenv('OPENAI_API_KEY');
$hasCurl = function_exists('curl_init');
$allowFopen = (bool) ini_get('allow_url_fopen');

/* Debug rapide */
if (isset($_GET['debug'])) {
  echo json_encode([
    'ok' => true,
    'debug' => [
      'curl_available'    => $hasCurl,
      'allow_url_fopen'   => $allowFopen,
      'has_api_key'       => (bool)$apiKey,
      'php_version'       => PHP_VERSION,
      'script'            => __FILE__,
    ]
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

/* Lecture input */
$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) { http_response_code(400); echo json_encode(['ok'=>false,'message'=>'JSON invalide']); exit; }
if (empty($payload['cards']) || !is_array($payload['cards'])) { http_response_code(400); echo json_encode(['ok'=>false,'message'=>'"cards" manquant']); exit; }
if (!$apiKey) { http_response_code(500); echo json_encode(['ok'=>false,'message'=>'OPENAI_API_KEY absente']); exit; }

/* Mots-clés */
$KW = [
  0=>['liberté','spontanéité','aventure'], 1=>['début','potentiel','action'], 2=>['intuition','secret','patience'],
  3=>['créativité','expression','fertilité'], 4=>['stabilité','structure','autorité'], 5=>['guidance','tradition','enseignement'],
  6=>['choix','union','valeurs'], 7=>['volonté','victoire','déplacement'], 8=>['équilibre','vérité','responsabilité'],
  9=>['recherche','introspection','prudence'], 10=>['changement','cycle','opportunité'], 11=>['courage','maîtrise','compassion'],
  12=>['lâcher-prise','perspective','pause'], 13=>['transformation','fin','renaissance'], 14=>['harmonie','modération','alchimie'],
  15=>['attachement','tentation','énergie brute'], 16=>['révélation','rupture','libération'], 17=>['espoir','inspiration','guérison'],
  18=>['émotions','illusion','subconscient'], 19=>['succès','vitalité','clarté'], 20=>['appel','éveil','bilan'],
  21=>['accomplissement','intégration','ouverture'],
];

/* Formattage cartes */
$question = isset($payload['question']) ? trim((string)$payload['question']) : '';
$lines = [];
foreach ($payload['cards'] as $i => $c) {
  $pos = isset($c['position']) ? (string)$c['position'] : ('Carte '.($i+1));
  $nm  = isset($c['name']) ? (string)$c['name'] : ('Inconnue '.($i+1));
  $num = (isset($c['number']) && is_numeric($c['number'])) ? intval($c['number']) : null;
  $kws = ($num !== null && isset($KW[$num])) ? array_slice($KW[$num], 0, 2) : [];
  $kwtxt = $kws ? (' ['.implode(', ', $kws).']') : '';
  $lines[] = $pos.': '.$nm.$kwtxt;
}
$cards_list = implode("\n", $lines);

/* Prompt */
/* ===== Style & longueur (optionnels via payload) ===== */
$style = isset($payload['style']) ? (string)$payload['style'] : 'op-poetic'; // 'op-poetic' (défaut) | 'plain'
$preset = isset($payload['preset']) ? (string)$payload['preset'] : 'consult'; // 'consult' (120–180 mots) | 'newsletter' (80–120)

/* Contraintes de longueur selon preset */
$lenRules = [
  'consult'    => ['min'=>120, 'max'=>180],
  'newsletter' => ['min'=>80,  'max'=>120],
];
$len = $lenRules[$preset] ?? $lenRules['consult'];

$system = <<<SYS
Tu es tarologue bienveillant·e et élégant·e, écrivant en français clair.
Consignes générales (invariables) :
- Respecte strictement la structure suivante, sans titres supplémentaires :
  1) 🔹 Passé — {carte} : une phrase courte.
  2) 🔹 Présent — {carte} : une phrase courte.
  3) 🔹 Futur — {carte} : une phrase courte.
  4) 🧭 Synthèse : 1 phrase qui relie les trois cartes.
  5) ✨ Conseil : 1 phrase actionnable, douce et concrète.
- Interdits : prédictions médicales, juridiques, financières. Pas de “je ne suis qu’une IA”.
- Pas de listes à puces additionnelles, pas de markdown.

Style demandé : 
- Poétique sobre, imagé mais lisible, chaleureux, “voix Opanoma”.
- Vocabulaire lumineux, non dramatique, pas d’impératifs secs.
- Utilise 2–3 émojis maximum parmi : ✨🔮🌿🌞🌙💫🕊️.
Longueur totale (hors noms de cartes) : entre {$len['min']} et {$len['max']} mots.

Aide contextuelle (ne cite pas ce bloc) :
- Si les positions sont “Pour / Contre / Synthèse / Évolution / Issue”, adapte naturellement le sens (pas de rappel théorique).
- Utilise l’énergie des cartes sans dogme ; relie aux mots-clés sous-jacents.
SYS;

/* On rappelle les cartes + on injecte 1–2 mots-clés par carte pour guider le ton */
$user = "Question: ".($question !== '' ? $question : "—")."\n\nCartes (position – nom – indices) :\n".$cards_list."\n\nRédige maintenant.";

/* ===== Appel OpenAI ===== */
$body = [
  'model' => 'gpt-4o-mini',
  'temperature' => ($style === 'op-poetic' ? 0.8 : 0.6),
  'max_tokens'  => ($preset === 'newsletter' ? 220 : 280),
  'messages' => [
    ['role' => 'system', 'content' => $system],
    ['role' => 'user',   'content' => $user],
  ],
];


$endpoint = 'https://api.openai.com/v1/chat/completions';

/* Appel OpenAI — cURL si dispo, sinon file_get_contents */
if ($hasCurl) {
  $ch = curl_init($endpoint);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_HTTPHEADER     => [
      'Content-Type: application/json',
      'Authorization: Bearer '.$apiKey,
    ],
    CURLOPT_POSTFIELDS     => json_encode($body),
    CURLOPT_TIMEOUT        => 20,
  ]);
  $resp   = curl_exec($ch);
  $errno  = curl_errno($ch);
  $err    = curl_error($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($errno) { http_response_code(502); echo json_encode(['ok'=>false,'message'=>'Erreur réseau cURL: '.$err]); exit; }
  if ($status < 200 || $status >= 300) { http_response_code($status ?: 500); echo json_encode(['ok'=>false,'message'=>'OpenAI HTTP '.$status.' — '.$resp]); exit; }
} else {
  if (!$allowFopen) {
    http_response_code(500);
    echo json_encode(['ok'=>false,'message'=>'Ni cURL ni allow_url_fopen disponibles sur ce PHP.']); exit;
  }
  $ctx = stream_context_create([
    'http' => [
      'method'  => 'POST',
      'header'  => "Content-Type: application/json\r\nAuthorization: Bearer ".$apiKey."\r\n",
      'content' => json_encode($body),
      'timeout' => 20,
    ]
  ]);
  $resp = @file_get_contents($endpoint, false, $ctx);
  // Récupérer status via $http_response_header
  $status = 0;
  if (isset($http_response_header) && is_array($http_response_header)) {
    foreach ($http_response_header as $h) {
      if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) { $status = (int)$m[1]; break; }
    }
  }
  if ($resp === false || $status < 200 || $status >= 300) {
    http_response_code($status ?: 500);
    $errText = is_string($resp) ? $resp : 'file_get_contents a échoué';
    echo json_encode(['ok'=>false,'message'=>'OpenAI HTTP '.$status.' — '.$errText]); exit;
  }
}

/* Parse JSON OpenAI */
$json = json_decode($resp, true);
if (!is_array($json)) { http_response_code(502); echo json_encode(['ok'=>false,'message'=>'Réponse OpenAI non-JSON']); exit; }
$content = $json['choices'][0]['message']['content'] ?? '';
if (!$content) { http_response_code(502); echo json_encode(['ok'=>false,'message'=>'Réponse OpenAI vide']); exit; }

/* OK */
echo json_encode(['ok'=>true, 'text'=>$content], JSON_UNESCAPED_UNICODE);
