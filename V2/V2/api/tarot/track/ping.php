<?php
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['ok'=>true,'msg'=>'standalone ping','php'=>PHP_VERSION]);
