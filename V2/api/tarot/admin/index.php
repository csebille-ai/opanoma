<?php
declare(strict_types=1);

/**
 * Admin – Tarot (lecture seule)
 * Liste paginée + filtres + export CSV
 */

header('Content-Type: text/html; charset=utf-8');

// --- Localisation DB (même logique que track/index.php) ---
$docRoot = $_SERVER['DOCUMENT_ROOT'] ?? __DIR__ . '/../../..';
$homeDir = dirname($docRoot);
$dbFile  = $homeDir . '/data/tarot/tarot.db';

if (!is_file($dbFile)) {
  http_response_code(500);
  echo "<h1>DB introuvable</h1><p>" . htmlspecialchars($dbFile) . "</p>";
  exit;
}

// --- Connexion SQLite ---
$pdo = new PDO('sqlite:' . $dbFile, null, null, [
  PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
  PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  PDO::ATTR_EMULATE_PREPARES => false,
]);
$pdo->exec('PRAGMA foreign_keys=ON;');

// --- Filtres ---
$theme   = isset($_GET['theme']) && $_GET['theme'] !== '' ? (string)$_GET['theme'] : null;         // amour/santé/argent/travail/null
$q       = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
$from    = isset($_GET['from']) ? (string)$_GET['from'] : '';  // YYYY-MM-DD
$to      = isset($_GET['to']) ? (string)$_GET['to'] : '';      // YYYY-MM-DD
$perPage = max(5, min(100, (int)($_GET['per'] ?? 20)));
$page    = max(1, (int)($_GET['page'] ?? 1));
$offset  = ($page - 1) * $perPage;
$export  = isset($_GET['export']) && $_GET['export'] === 'csv';

// --- Conditions SQL ---
$where = [];
$params = [];
if ($theme) { $where[] = 'd.theme = :theme'; $params[':theme'] = $theme; }
if ($q !== '') {
  $where[] = '(LOWER(d.question) LIKE :q OR LOWER(d.interpretation_text) LIKE :q)';
  $params[':q'] = '%'.mb_strtolower($q, 'UTF-8').'%';
}
if ($from !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
  $where[] = "date(d.created_at) >= :from";
  $params[':from'] = $from;
}
if ($to !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
  $where[] = "date(d.created_at) <= :to";
  $params[':to'] = $to;
}
$whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

// --- Total ---
$total = (int)$pdo->prepare("SELECT COUNT(*) FROM draws d $whereSql")
  ->execute($params) ?: 0;
$stmtCnt = $pdo->prepare("SELECT COUNT(*) AS c FROM draws d $whereSql");
$stmtCnt->execute($params);
$total = (int)$stmtCnt->fetchColumn();

// --- Requête principale (liste) ---
$sql = "
  SELECT
    d.id, d.created_at, d.mode, d.theme, d.question,
    COALESCE(d.interpretation_chars, length(d.interpretation_text)) AS chars,
    d.session_id
  FROM draws d
  $whereSql
  ORDER BY d.created_at DESC, d.id DESC
  LIMIT :lim OFFSET :off
";
$stmt = $pdo->prepare($sql);
foreach ($params as $k=>$v) $stmt->bindValue($k, $v);
$stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
$stmt->bindValue(':off', $offset, PDO::PARAM_INT);
$stmt->execute();
$rows = $stmt->fetchAll();

// --- Export CSV si demandé ---
if ($export) {
  header('Content-Type: text/csv; charset=utf-8');
  header('Content-Disposition: attachment; filename="draws_export.csv"');
  $out = fopen('php://output', 'w');
  fputcsv($out, ['id','created_at','mode','theme','question','chars','session_id','cards']);
  // récupère un résumé des cartes (labels) pour chaque ligne
  $stmtCards = $pdo->prepare("SELECT label, number, position FROM draw_cards WHERE draw_id = :id ORDER BY idx ASC");
  foreach ($rows as $r) {
    $stmtCards->execute([':id'=>$r['id']]);
    $cards = $stmtCards->fetchAll();
    $summary = implode(' | ', array_map(fn($c)=>"{$c['position']}: {$c['label']} (#{$c['number']})", $cards));
    fputcsv($out, [$r['id'],$r['created_at'],$r['mode'],$r['theme'],$r['question'],$r['chars'],$r['session_id'],$summary]);
  }
  fclose($out);
  exit;
}

// --- Helpers ---
function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function url($params){
  $base = strtok($_SERVER['REQUEST_URI'],'?') ?: '/api/tarot/admin/';
  return $base . '?' . http_build_query(array_merge($_GET, $params));
}

// --- Pagination ---
$pages = (int)ceil(max(1,$total) / $perPage);
?>
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Admin – Tirages Tarot</title>
<style>
  :root{ --ink:#1f1a1a; --bg:#f6efe8; --card:#fff; --line:#e6ddd5; --accent:#a34d57; }
  body{ margin:0; font:14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:var(--ink); background:var(--bg) }
  .wrap{ max-width:1100px; margin:0 auto; padding:20px }
  h1{ margin:0 0 12px; }
  .card{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; box-shadow:0 6px 18px rgba(0,0,0,.06) }
  form.filters{ display:grid; gap:12px; grid-template-columns: repeat(6, 1fr); align-items:end; margin-bottom:14px }
  form.filters label{ font-weight:600; font-size:12px; display:block; margin-bottom:4px }
  form.filters input, form.filters select{ width:100%; padding:8px; border-radius:10px; border:1px solid #ddd }
  table{ width:100%; border-collapse:collapse }
  th, td{ padding:10px; border-bottom:1px solid var(--line); vertical-align:top }
  th{ text-align:left; font-size:12px; letter-spacing:.02em; color:#4a3e3c }
  .muted{ color:#6b5f5a }
  .toolbar{ display:flex; gap:10px; align-items:center; justify-content:space-between; margin:10px 0 }
  .btn{ display:inline-block; padding:8px 12px; border-radius:999px; border:1px solid #ddd; background:#fff; text-decoration:none; font-weight:600 }
  .btn.primary{ border-color:var(--accent); color:#fff; background:var(--accent) }
  .pagination{ display:flex; gap:6px; flex-wrap:wrap }
  .pagination a{ padding:6px 10px; border:1px solid #ddd; border-radius:999px; text-decoration:none }
  .pagination .current{ background:var(--accent); color:#fff; border-color:var(--accent) }
  code.q{ background:#f3eee8; padding:2px 6px; border-radius:6px }
  .truncate{ max-width:420px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
</style>
</head>
<body>
<div class="wrap">
  <h1>🗂️ Tirages – Admin (lecture seule)</h1>

  <div class="card" style="margin-bottom:12px">
    <form class="filters" method="get">
      <div>
        <label>Thème</label>
        <select name="theme">
          <option value="">— Tous —</option>
          <?php foreach (['amour','santé','argent','travail'] as $t): ?>
            <option value="<?=h($t)?>" <?= $theme===$t?'selected':''?>><?=h(ucfirst($t))?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div>
        <label>Recherche (question / interprétation)</label>
        <input type="search" name="q" value="<?=h($q)?>" placeholder="mots-clés…">
      </div>
      <div>
        <label>Du</label>
        <input type="date" name="from" value="<?=h($from)?>">
      </div>
      <div>
        <label>Au</label>
        <input type="date" name="to" value="<?=h($to)?>">
      </div>
      <div>
        <label>Par page</label>
        <select name="per">
          <?php foreach ([10,20,50,100] as $pp): ?>
            <option value="<?=$pp?>" <?=$perPage===$pp?'selected':''?>><?=$pp?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div>
        <button class="btn primary" type="submit">Filtrer</button>
      </div>
    </form>

    <div class="toolbar">
      <div class="muted"><?=$total?> résultat(s)</div>
      <div>
        <a class="btn" href="<?=h(url(['export'=>'csv','page'=>1]))?>">Exporter CSV (page courante)</a>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Date</th>
          <th>Mode</th>
          <th>Thème</th>
          <th>Question</th>
          <th>Long.</th>
          <th>Session</th>
          <th>Voir</th>
        </tr>
      </thead>
      <tbody>
      <?php if (!$rows): ?>
        <tr><td colspan="8" class="muted">Aucun tirage.</td></tr>
      <?php else: foreach ($rows as $r): ?>
        <tr>
          <td><?= (int)$r['id'] ?></td>
          <td><span class="muted"><?=h($r['created_at'])?></span></td>
          <td><?= (int)$r['mode'] ?></td>
          <td><?= h($r['theme'] ?? '—') ?></td>
          <td class="truncate"><?= h($r['question'] ?? '—') ?></td>
          <td><?= (int)$r['chars'] ?></td>
          <td><code class="q"><?= h($r['session_id']) ?></code></td>
          <td><a class="btn" href="view.php?id=<?= (int)$r['id'] ?>">Ouvrir</a></td>
        </tr>
      <?php endforeach; endif; ?>
      </tbody>
    </table>

    <?php if ($pages > 1): ?>
      <div class="pagination" style="margin-top:12px">
        <?php for ($p=1; $p<=$pages; $p++): ?>
          <?php if ($p === $page): ?>
            <span class="current"><?=$p?></span>
          <?php else: ?>
            <a href="<?=h(url(['page'=>$p]))?>"><?=$p?></a>
          <?php endif; ?>
        <?php endfor; ?>
      </div>
    <?php endif; ?>
  </div>
</div>
</body>
</html>
