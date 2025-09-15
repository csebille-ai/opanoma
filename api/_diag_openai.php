<?php
header('content-type: application/json; charset=utf-8');
$apiKey = getenv('OPENAI_API_KEY');
if (!$apiKey) { http_response_code(500); echo json_encode(['ok'=>false,'err'=>'no api key']); exit; }

$endpoint = 'https://api.openai.com/v1/models';
$headers = [
  'Authorization: Bearer '.$apiKey,
  'Content-Type: application/json',
];

if (function_exists('curl_init')) {
  $ch = curl_init($endpoint);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => $headers,
    CURLOPT_TIMEOUT        => 20,
  ]);
  $resp   = curl_exec($ch);
  $errno  = curl_errno($ch);
  $err    = curl_error($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  echo json_encode(['ok'=> ($status>=200 && $status<300), 'status'=>$status, 'errno'=>$errno, 'err'=>$err, 'snippet'=> substr((string)$resp,0,240)]);
  exit;
} else {
  $ctx = stream_context_create(['http'=>[
    'method'=>'GET','header'=> "Authorization: Bearer $apiKey\r\nContent-Type: application/json\r\n",'timeout'=>20
  ]]);
  $resp = @file_get_contents($endpoint, false, $ctx);
  $status = 0;
  global $http_response_header;
  if (isset($http_response_header)) {
    foreach ($http_response_header as $h) if (preg_match('#^HTTP/\S+\s+(\d{3})#',$h,$m)) { $status=(int)$m[1]; break; }
  }
  echo json_encode(['ok'=> ($status>=200 && $status<300), 'status'=>$status, 'snippet'=> substr((string)$resp,0,240)]);
}
