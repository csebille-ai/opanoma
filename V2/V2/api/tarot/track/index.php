<?php
declare(strict_types=1);

/* Debug de routage (facultatif en dev)
if (isset($_GET['debug'])) {
  header('X-Realpath: ' . realpath(__FILE__));
  header('X-Dir: ' . __DIR__);
  header('X-Req-Uri: ' . ($_SERVER['REQUEST_URI'] ?? ''));
}
*/

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

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && isset($_GET['ping'])) {
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['ok'=>true,'msg'=>'track alive','php'=>PHP_VERSION], JSON_UNESCAPED_UNICODE);
  exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  http_response_code(405);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['ok'=>false,'error'=>'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
  exit;
}

// Lecture corps JSON
$raw = file_get_contents('php://input');
if ($raw === '' || $raw === false) { http_response_code(400); header('Content-Type: application/json'); echo json_encode(['ok'=>false,'error'=>'Empty body']); exit; }
if (strlen($raw) > 256*1024)       { http_response_code(413); header('Content-Type: application/json'); echo json_encode(['ok'=>false,'error'=>'Payload too large']); exit; }
$payload = json_decode($raw, true);
if (!is_array($payload))           { http_response_code(400); header('Content-Type: application/json'); echo json_encode(['ok'=>false,'error'=>'Invalid JSON']); exit; }

// TODO: ici, insère en SQLite si tu veux (session, user, draw, interpretation, events, consent)

header('Content-Type: application/json; charset=utf-8');
echo json_encode(['ok'=>true], JSON_UNESCAPED_UNICODE);
