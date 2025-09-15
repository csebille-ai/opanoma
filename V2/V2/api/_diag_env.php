<?php
header('content-type: application/json; charset=utf-8');
echo json_encode([
  'php_version'=> PHP_VERSION,
  'curl_loaded'=> extension_loaded('curl'),
  'allow_url_fopen'=> (bool)ini_get('allow_url_fopen'),
  'api_key_present'=> (bool)getenv('OPENAI_API_KEY'),
  'script'=> __FILE__,
], JSON_UNESCAPED_UNICODE);
