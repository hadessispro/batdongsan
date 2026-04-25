<?php
declare(strict_types=1);

$root = __DIR__;
$requestUri = (string)($_SERVER['REQUEST_URI'] ?? '/');
$path = parse_url($requestUri, PHP_URL_PATH);
$path = is_string($path) ? $path : '/';
$path = '/' . ltrim($path, '/');

$publicPath = $root . str_replace('/', DIRECTORY_SEPARATOR, $path);

if ($path !== '/' && is_file($publicPath)) {
    return false;
}

switch ($path) {
    case '/admin':
    case '/admin/':
        require $root . '/admin-login.php';
        return true;

    case '/admin/panel':
    case '/admin/panel/':
        require $root . '/admin.php';
        return true;

    case '/asset-version.js':
        require $root . '/asset-version.php';
        return true;
}

if ($path === '/' || $path === '/index.html') {
    readfile($root . '/index.html');
    return true;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo '404 Not Found';
return true;
