<?php
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['ok'=>true,'file'=>__FILE__,'php'=>PHP_VERSION]);
