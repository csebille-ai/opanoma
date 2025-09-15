<?php
declare(strict_types=1);

// --- Version de l’app (utile pour cache/logs) ---
if (!defined('APP_VERSION')) {
    define('APP_VERSION', '20250901');
}

/*
  Opanoma — Tarot Summarize API (prod)
  - Réponses JSON propres
  - CORS géré
  - Lecture input robuste
  - Clé lue via /home/ciyu0696/config.php (define('OPENAI_API_KEY', '...'))
  - Appel OpenAI + Fallback STUB
*/



// ---------- Utilitaire sortie JSON ----------
function jexit(int $code, array $payload): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

// ---------- Ping rapide ----------
if (isset($_GET['ping'])) {
  jexit(200, ['ok'=>true, 'msg'=>'summarize alive', 'php'=>PHP_VERSION]);
}

// ---------- Config & clé ----------
$cfg = '/home/ciyu0696/config.php';
if (!file_exists($cfg)) jexit(500, ['ok'=>false, 'error'=>"config introuvable: $cfg"]);
if (!is_readable($cfg)) jexit(500, ['ok'=>false, 'error'=>"config non lisible"]);

require_once $cfg; // doit définir OPENAI_API_KEY via define()

function get_openai_api_key(): string {
  // 1) ENV (au cas où)
  $env = getenv('OPENAI_API_KEY');
  if ($env && trim($env) !== '') return trim($env);

  // 2) Constante définie par config.php (recommandé)
  if (defined('OPENAI_API_KEY') && OPENAI_API_KEY) {
    return trim((string)OPENAI_API_KEY);
  }

  // 3) Variables éventuelles posées par config.php
  if (isset($GLOBALS['OPENAI_API_KEY']) && $GLOBALS['OPENAI_API_KEY']) {
    return trim((string)$GLOBALS['OPENAI_API_KEY']);
  }
  if (isset($GLOBALS['config']) && is_array($GLOBALS['config']) && !empty($GLOBALS['config']['OPENAI_API_KEY'])) {
    return trim((string)$GLOBALS['config']['OPENAI_API_KEY']);
  }

  return '';
}

// ---------- CORS ----------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host   = $_SERVER['HTTP_HOST']   ?? '';
if ($origin && stripos($origin, $host) !== false) {
  header("Access-Control-Allow-Origin: $origin");
  header('Vary: Origin');
} else {
  header("Access-Control-Allow-Origin: *");
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method === 'OPTIONS') { http_response_code(204); exit; }
if ($method !== 'POST')     { jexit(405, ['ok'=>false, 'error'=>'Method Not Allowed']); }

// ---------- Lecture input robuste ----------
$ct  = $_SERVER['CONTENT_TYPE'] ?? ($_SERVER['HTTP_CONTENT_TYPE'] ?? '');
$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
  if (!empty($_POST)) $raw = json_encode($_POST, JSON_UNESCAPED_UNICODE);
}
if ($raw === '' || $raw === false) {
  jexit(400, ['ok'=>false, 'error'=>'Empty body (php://input)']);
}

$payload = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($payload)) {
  jexit(400, ['ok'=>false, 'error'=>'Invalid JSON', 'detail'=>json_last_error_msg(), 'ct'=>$ct]);
}

// ---------- Extraction champs ----------
$theme = (string)($payload['theme'] ?? ($payload['user']['theme'] ?? 'général'));
$pos   = is_array($payload['positions'] ?? null) ? $payload['positions'] : [];
$cards = $payload['cards'] ?? ($payload['draw']['selected'] ?? []);
$qUser = '';
if (isset($payload['user']) && is_array($payload['user']) && array_key_exists('question', $payload['user'])) {
  $qUser = trim((string)$payload['user']['question']);
}
$q = $qUser;
// nettoyer d’anciens préambules collés dans la question
if ($q && preg_match('/format strict|concentre|ton empathique|structure\s*:/i', $q)) { $q = ''; }

if (!is_array($cards) || !count($cards) || !is_array($pos) || !count($pos)) {
  jexit(422, ['ok'=>false, 'error'=>'Missing positions or cards']);
}

// ---- Prépare inputs + meta ----
$nowUtc  = gmdate('c'); // horodatage ISO UTC
$drawSig = [
  'theme' => $theme,
  'q'     => $q,
  'pos'   => $pos,
  'cards' => array_map(function($c){
    return [
      'name'     => $c['name'] ?? ($c['label'] ?? ''),
      'number'   => isset($c['number']) ? (int)$c['number'] : null,
      'reversed' => !empty($c['reversed']) ? (bool)$c['reversed'] : false
    ];
  }, $cards)
];
$drawId = substr(sha1(json_encode($drawSig, JSON_UNESCAPED_UNICODE)), 0, 16);

$inputs = [
  'theme'     => $theme,
  'question'  => $q,
  'positions' => $pos,
  'cards'     => $cards,
];

$meta = [
  'draw_id'         => $drawId,
  'server_time_utc' => $nowUtc,
  'model'           => 'gpt-4o-mini',
  'mode'            => $mode,
  'version'         => APP_VERSION,
];

$nowUtc  = gmdate('c'); // ISO 8601 UTC
$drawSig = [
  'theme'=>$theme,
  'q'=>$q,
  'pos'=>$pos,
  // on “normalise” les cartes pour une empreinte stable
  'cards'=>array_map(function($c){
    return [
      'name'=>$c['name'] ?? ($c['label'] ?? ''),
      'number'=> isset($c['number']) ? (int)$c['number'] : null,
      'reversed'=> !empty($c['reversed']) ? (bool)$c['reversed'] : false
    ];
  }, $cards)
];
$drawId = substr(sha1(json_encode($drawSig, JSON_UNESCAPED_UNICODE)), 0, 16);


// ---------- OpenAI : messages ----------
function build_card_desc(array $cards, array $pos): array {
  $desc = [];
  foreach ($cards as $i => $c) {
    $position = $pos[$i] ?? ('Carte '.($i+1));
    $name = $c['name'] ?? $c['label'] ?? ('Carte '.($i+1));
    $num  = isset($c['number']) ? (int)$c['number'] : null;
    $kws  = $c['upright'] ?? $c['keywords'] ?? [];
    $line = $position.": ".$name.($num!==null ? " (#$num)" : '');
    if ($kws && is_array($kws) && count($kws)) $line .= " — ".implode(', ', array_slice($kws, 0, 3));
    $desc[] = $line;
  }
  return $desc;
}

// ---------- Tente OpenAI si clé dispo ----------
$apiKey = get_openai_api_key();
if ($apiKey !== '') {
  $desc = build_card_desc($cards, $pos);

  $system = "Tu es tarologue. Sortie : interprétation courte par position, ".
            "dans l’ordre fourni, style clair et bienveillant. Termine par une ligne “Conseil : …” unique.";

  $user   = trim(
    "Thème: ".ucfirst($theme)."\n".
    ($q !== '' ? "Question: « $q »\n" : "").
    "Positions: ".implode(' · ', $pos)."\n".
    "Cartes:\n- ".implode("\n- ", $desc)."\n\n".
    "Écris l’interprétation structurée par position, puis une ligne “Conseil : …”."
  );

  $body = json_encode([
    'model' => 'gpt-4o-mini',
    'messages' => [
      ['role'=>'system','content'=>$system],
      ['role'=>'user',  'content'=>$user],
    ],
    'temperature' => 0.7,
    'max_tokens'  => 800,
  ], JSON_UNESCAPED_UNICODE);

  $ch = curl_init('https://api.openai.com/v1/chat/completions');
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
      'Authorization: Bearer '.$apiKey,
      'Content-Type: application/json',
    ],
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $body,
    CURLOPT_TIMEOUT        => 20,
  ]);
  $resp = curl_exec($ch);
  $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $errn = curl_errno($ch);
  $errt = curl_error($ch);
  curl_close($ch);

  if ($errn) jexit(502, ['ok'=>false, 'error'=>'cURL error: '.$errt]);

  if ($resp && $http === 200) {
    $j = json_decode($resp, true);
    $llmText = $j['choices'][0]['message']['content'] ?? '';
    if (trim($llmText) !== '') {
      jexit(200, [
  'ok'   => true,
  'text' => $llmText,
  'data' => [
    'inputs' => $inputs,
    'meta'   => $meta + ['source'=>'llm']
  ]
]);

    }
    // sinon on passera au STUB
  } else {
    // retourne un message d’erreur, mais sans bloquer si tu préfères le STUB :
    // jexit(502, ['ok'=>false, 'error'=>"LLM HTTP $http", 'raw'=>substr((string)$resp,0,300)]);
    // Ici on retombe sur le STUB pour garantir une réponse.
  }
}

// ---------- Fallback STUB (garantit une réponse) ----------
function kw_for_number(int $n): array {
  static $map = [
    0=>['liberté','aventure'],1=>['début','action'],2=>['intuition','secret'],3=>['créativité','expression'],
    4=>['stabilité','structure'],5=>['guidance','tradition'],6=>['choix','valeurs'],7=>['volonté','mouvement'],
    8=>['équilibre','vérité'],9=>['introspection','prudence'],10=>['changement','cycle'],11=>['courage','maîtrise'],
    12=>['lâcher-prise','perspective'],13=>['transformation','renaissance'],14=>['harmonie','modération'],
    15=>['attachement','énergie brute'],16=>['révélation','libération'],17=>['espoir','inspiration'],
    18=>['émotions','subconscient'],19=>['succès','clarté'],20=>['appel','bilan'],21=>['accomplissement','ouverture']
  ];
  return $map[$n] ?? [];
}
function line_for_card(string $position, array $c): string {
  $name = (string)($c['name'] ?? ($c['label'] ?? 'Carte'));
  $kws  = [];
  if (!empty($c['upright']) && is_array($c['upright']))      $kws = $c['upright'];
  elseif (!empty($c['keywords']) && is_array($c['keywords'])) $kws = $c['keywords'];
  elseif (isset($c['number']))                                $kws = kw_for_number((int)$c['number']);
  $kwTxt = $kws ? ' — ' . implode(', ', array_slice($kws, 0, 3)) : '';
  return "• {$position} : {$name}{$kwTxt}.";
}

$introTheme = [
  'amour'=>"Focus relationnel, valeurs, communication et ouverture au lien.",
  'santé'=>"Angle bien-être/énergie/rythme — pas de conseil médical.",
  'argent'=>"Focus opportunités, gestion et réalisme.",
  'travail'=>"Focus mission, posture pro, compétences et collaborations."
];
$intro = $introTheme[$theme] ?? "Lecture générale, constructive et non fataliste.";

$lines = [];
$lines[] = "Thème : " . ucfirst($theme) . ($q !== '' ? " — Question : « $q »" : "");
$lines[] = "Structure : " . implode(' · ', $pos) . ".";
$lines[] = "";
foreach ($cards as $i => $c) {
  $position = $pos[$i] ?? ("Carte ".($i+1));
  $lines[]  = line_for_card($position, is_array($c) ? $c : []);
}
$lines[] = "";
$lines[] = "Lecture : $intro";
$lines[] = "Conseil : avance par petits pas, clarifie ton intention, et pose une action concrète dans les 72h.";

jexit(200, [
  'ok'   => true,
  'text' => implode("\n", $lines),
  'data' => [
    'inputs' => $inputs,
    'meta'   => $meta + ['source'=>'stub']
  ]
]);

