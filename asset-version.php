<?php
declare(strict_types=1);

require __DIR__ . '/api/bootstrap.php';

$config = bds_load_config();
$versionTag = bds_get_app_version_tag($config, __DIR__);

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

echo 'window.__BDS_ASSET_VERSION__ = ' . json_encode($versionTag, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . ';' . PHP_EOL;
