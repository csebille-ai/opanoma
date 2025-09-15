<?php
declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if ($id <= 0) { http_response_code(400); echo "ID invalide"; exit; }

// DB
$docRoot = $_SERVER['DOCUMENT_ROOT'] ?? __DIR__ . '/../../..';
$homeDir = dirname($docRoot);
$dbFile  = $homeDir . '/data/tarot/tarot.db';
$pdo = new PDO('sqlite:' . $dbFile, null, null, [
  PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
  PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys=ON;');

// Draw
$stmt = $pdo->prepare("
  SELECT d.*, s.locale, s.build_version, s.page_url, s.referrer, s.ua, s.consent
  FROM draws d
  LEFT JOIN sessions s ON s.id = d.session_id
  WHERE d.id = :id
");
$stmt->execute([':id'=>$id]);
$draw = $stmt->fetch();
if (!$draw){ http_response_code(404); echo "Introuvable"; exit; }

// Cards
$stmtC = $pdo->prepare("SELECT * FROM draw_cards WHERE draw_id = :id ORDER BY idx ASC");
$stmtC->execute([':id'=>$id]);
$cards = $stmtC->fetchAll();

// Events
$stmtE = $pdo->prepare("SELECT * FROM events WHERE session_id = :sid ORDER BY ts ASC");
$stmtE->execute([':sid'=>$draw['session_id']]);
$events = $stmtE->fetchAll();

function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
?>
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tirage #<?= (int)$draw['id'] ?> – Détails</title>
<style>
  :root{ --ink:#1f1a1a; --bg:#f6efe8; --card:#fff; --line:#e6ddd5; --accent:#a34d57; }
  body{ margin:0; font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; color:var(--ink); background:var(--bg) }
  .wrap{ max-width:1100px; margin:0 auto; padding:20px }
  h1{ margin:0 0 12px }
  .grid{ display:grid; gap:12px; grid-template-columns:1fr 1fr }
  .card{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; box-shadow:0 6px 18px rgba(0,0,0,.06) }
  .muted{ color:#6b5f5a }
  pre{ white-space:pre-wrap; padding:12px; background:#faf7f3; border:1px solid #eadfd7; border-radius:8px; }
  table{ width:100%; border-collapse:collapse }
  th, td{ padding:8px; border-bottom:1px solid var(--line); vertical-align:top }
  th{ text-align:left; font-size:12px; color:#4a3e3c }
  .btn{ display:inline-block; padding:8px 12px; border-radius:999px; border:1px solid #ddd; background:#fff; text-decoration:none; font-weight:600 }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr } }
</style>
</head>
<body>
<div class="wrap">
  <p><a class="btn" href="index.php">← Retour</a></p>
  <h1>Tirage #<?= (int)$draw['id'] ?> <span class="muted">/ session <?=h($draw['session_id'])?></span></h1>

  <div class="grid" style="margin-bottom:12px">
    <div class="card">
      <h3>Infos tirage</h3>
      <table>
        <tr><th>Date</th><td><?=h($draw['created_at'])?></td></tr>
        <tr><th>Mode</th><td><?= (int)$draw['mode'] ?></td></tr>
        <tr><th>Thème</th><td><?= h($draw['theme'] ?? '—') ?></td></tr>
        <tr><th>Question</th><td><?= h($draw['question'] ?? '—') ?></td></tr>
        <tr><th>Positions</th><td><?= h($draw['positions']) ?></td></tr>
        <tr><th>Longueur</th><td><?= (int)$draw['interpretation_chars'] ?></td></tr>
      </table>
    </div>

    <div class="card">
      <h3>Contexte session</h3>
      <table>
        <tr><th>Locale</th><td><?= h($draw['locale']) ?></td></tr>
        <tr><th>Build</th><td><?= h($draw['build_version']) ?></td></tr>
        <tr><th>Page</th><td><?= h($draw['page_url']) ?></td></tr>
        <tr><th>Referrer</th><td><?= h($draw['referrer']) ?></td></tr>
        <tr><th>User-Agent</th><td><span class="muted"><?= h($draw['ua']) ?></span></td></tr>
        <tr><th>Consentement</th><td><?= $draw['consent'] ? 'oui' : 'non' ?></td></tr>
      </table>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <h3>Cartes</h3>
    <table>
      <thead><tr><th>#</th><th>Position</th><th>Label</th><th>Numéro</th><th>Slug</th><th>Mots-clés</th></tr></thead>
      <tbody>
      <?php foreach ($cards as $i=>$c): ?>
        <tr>
          <td><?= (int)$i ?></td>
          <td><?= h($c['position']) ?></td>
          <td><?= h($c['label']) ?></td>
          <td><?= (int)$c['number'] ?></td>
          <td><code><?= h($c['slug']) ?></code></td>
          <td><?= h($c['keywords']) ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>

  <div class="card" style="margin-bottom:12px">
    <h3>Interprétation</h3>
    <pre><?= h($draw['interpretation_text'] ?? '') ?></pre>
  </div>

  <div class="card">
    <h3>Événements (chronologie)</h3>
    <?php if (!$events): ?>
      <p class="muted">Aucun événement.</p>
    <?php else: ?>
      <table>
        <thead><tr><th>Horodatage</th><th>Type</th><th>Données</th></tr></thead>
        <tbody>
        <?php foreach ($events as $ev): ?>
          <tr>
            <td><?= h($ev['ts']) ?></td>
            <td><strong><?= h($ev['type']) ?></strong></td>
            <td><code><?= h($ev['data']) ?></code></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    <?php endif; ?>
  </div>
</div>
</body>
</html>
