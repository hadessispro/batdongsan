<?php
declare(strict_types=1);

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$root = dirname(__DIR__);
$config = [
    'username' => getenv('BDS_ADMIN_USER') ?: 'admin',
    'password' => getenv('BDS_ADMIN_PASS') ?: 'admin123',
];

$localConfig = __DIR__ . '/config.local.php';
if (is_file($localConfig)) {
    $override = require $localConfig;
    if (is_array($override)) {
        $config = array_merge($config, $override);
    }
}

$resources = [
    'vr-hotspots' => $root . '/vr-hotspot-data.json',
    'vr-config' => $root . '/data/vr_config.json',
    'masterplan' => $root . '/data/masterplan.json',
    'buildings' => $root . '/data/buildings.json',
    'lots' => $root . '/frames/matbang/lot-data.json',
    'library' => $root . '/data/library.json',
    'vitri-config' => $root . '/data/vitri_config.json',
    'thamquan-config' => $root . '/data/thamquan_config.json',
];

$fileRoots = [
    'frames',
];

$allowedUploadExt = [
    'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg',
    'mp4', 'webm', 'mov',
    'pdf',
];

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        respond(['ok' => false, 'error' => 'Invalid JSON body: ' . json_last_error_msg()], 400);
    }

    return is_array($data) ? $data : [];
}

function require_admin(): void
{
    if (empty($_SESSION['bds_admin'])) {
        respond(['ok' => false, 'error' => 'Unauthorized'], 401);
    }
}

function safe_resource_path(string $resource, array $resources): string
{
    if (!isset($resources[$resource])) {
        respond(['ok' => false, 'error' => 'Unknown resource'], 404);
    }

    return $resources[$resource];
}

function load_json_file(string $path): array
{
    if (!is_file($path)) {
        respond(['ok' => false, 'error' => 'File not found'], 404);
    }

    $raw = file_get_contents($path);
    if ($raw === false) {
        respond(['ok' => false, 'error' => 'Cannot read file'], 500);
    }

    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        respond(['ok' => false, 'error' => 'Stored JSON is invalid: ' . json_last_error_msg()], 500);
    }

    return is_array($data) ? $data : [];
}

function save_json_file(string $path, array $data, string $root): void
{
    $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        respond(['ok' => false, 'error' => 'Cannot encode JSON'], 400);
    }

    $backupDir = $root . '/data/backups';
    if (!is_dir($backupDir) && !mkdir($backupDir, 0775, true) && !is_dir($backupDir)) {
        respond(['ok' => false, 'error' => 'Cannot create backup directory'], 500);
    }

    if (is_file($path)) {
        $name = basename($path, '.json');
        $stamp = date('Ymd-His');
        $backupPath = $backupDir . '/' . $name . '-' . $stamp . '.json';
        if (!copy($path, $backupPath)) {
            respond(['ok' => false, 'error' => 'Cannot create backup'], 500);
        }
    }

    $tmpPath = $path . '.tmp';
    if (file_put_contents($tmpPath, $encoded . PHP_EOL, LOCK_EX) === false) {
        respond(['ok' => false, 'error' => 'Cannot write temp file'], 500);
    }

    if (!rename($tmpPath, $path)) {
        @unlink($tmpPath);
        respond(['ok' => false, 'error' => 'Cannot replace JSON file'], 500);
    }
}

function normalize_relative_path(string $path): string
{
    $path = str_replace('\\', '/', trim($path));
    $path = preg_replace('#/+#', '/', $path) ?? '';
    $path = trim($path, '/');
    if ($path === '.' || $path === '') {
        return '';
    }
    foreach (explode('/', $path) as $part) {
        if ($part === '..' || $part === '') {
            respond(['ok' => false, 'error' => 'Invalid path'], 400);
        }
    }
    return $path;
}

function assert_file_area(string $relativePath, array $roots): void
{
    $first = explode('/', $relativePath)[0] ?? '';
    if (!in_array($first, $roots, true)) {
        respond(['ok' => false, 'error' => 'Path is not allowed'], 403);
    }
}

function absolute_file_path(string $root, string $relativePath, array $roots): string
{
    $relativePath = normalize_relative_path($relativePath);
    if ($relativePath === '') {
        return $root;
    }
    assert_file_area($relativePath, $roots);
    $path = $root . '/' . $relativePath;
    $parent = is_dir($path) ? $path : dirname($path);
    $realRoot = realpath($root);
    $realParent = realpath($parent);
    if ($realRoot === false || $realParent === false || strpos($realParent, $realRoot) !== 0) {
        respond(['ok' => false, 'error' => 'Invalid filesystem target'], 400);
    }
    return $path;
}

function file_kind(string $name, bool $isDir): string
{
    if ($isDir) return 'folder';
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'], true)) return 'image';
    if (in_array($ext, ['mp4', 'webm', 'mov'], true)) return 'video';
    if ($ext === 'json') return 'json';
    if ($ext === 'pdf') return 'pdf';
    if ($ext === 'js') return 'js';
    if ($ext === 'css') return 'css';
    if (in_array($ext, ['html', 'htm'], true)) return 'html';
    return 'file';
}

function list_files(string $root, string $relativePath, array $roots): array
{
    $relativePath = normalize_relative_path($relativePath);
    if ($relativePath === '') {
        return array_map(function (string $folder): array {
            return [
                'name' => $folder,
                'path' => $folder,
                'type' => 'folder',
                'isDir' => true,
                'size' => null,
                'url' => null,
            ];
        }, $roots);
    }

    $target = absolute_file_path($root, $relativePath, $roots);
    if (!is_dir($target)) {
        respond(['ok' => false, 'error' => 'Directory not found'], 404);
    }

    $items = [];
    foreach (scandir($target) ?: [] as $name) {
        if ($name === '.' || $name === '..') continue;
        if ($name[0] === '.' && $name !== '.htaccess') continue;
        $full = $target . '/' . $name;
        $rel = trim(($relativePath ? $relativePath . '/' : '') . $name, '/');
        $isDir = is_dir($full);
        $type = file_kind($name, $isDir);
        if (!$isDir && !in_array($type, ['image', 'video', 'pdf'], true)) {
            continue;
        }
        $items[] = [
            'name' => $name,
            'path' => $rel,
            'type' => $type,
            'isDir' => $isDir,
            'size' => $isDir ? null : filesize($full),
            'url' => $isDir ? null : $rel,
        ];
    }
    usort($items, function (array $a, array $b): int {
        if ($a['isDir'] !== $b['isDir']) return $a['isDir'] ? -1 : 1;
        return strcasecmp($a['name'], $b['name']);
    });
    return $items;
}

function safe_uploaded_name(string $name): string
{
    $name = basename(str_replace('\\', '/', $name));
    $name = preg_replace('/[^\pL\pN._ -]+/u', '-', $name) ?? 'upload';
    $name = trim($name, " .-\t\n\r\0\x0B");
    return $name !== '' ? $name : 'upload';
}

function unique_upload_path(string $dir, string $filename): string
{
    $base = pathinfo($filename, PATHINFO_FILENAME);
    $ext = pathinfo($filename, PATHINFO_EXTENSION);
    $candidate = $filename;
    $i = 1;
    while (file_exists($dir . '/' . $candidate)) {
        $candidate = $base . '-' . $i . ($ext !== '' ? '.' . $ext : '');
        $i++;
    }
    return $dir . '/' . $candidate;
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if ($action === 'status') {
    respond(['ok' => true, 'authenticated' => !empty($_SESSION['bds_admin'])]);
}

if ($action === 'login') {
    if ($method !== 'POST') {
        respond(['ok' => false, 'error' => 'Method not allowed'], 405);
    }

    $body = read_json_body();
    $username = (string)($body['username'] ?? '');
    $password = (string)($body['password'] ?? '');

    if (hash_equals((string)$config['username'], $username) && hash_equals((string)$config['password'], $password)) {
        $_SESSION['bds_admin'] = true;
        session_regenerate_id(true);
        respond(['ok' => true, 'authenticated' => true]);
    }

    respond(['ok' => false, 'error' => 'Sai tài khoản hoặc mật khẩu'], 401);
}

if ($action === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool)$params['secure'], (bool)$params['httponly']);
    }
    session_destroy();
    respond(['ok' => true]);
}

if ($action === 'list-files') {
    $pathParam = (string)($_GET['path'] ?? '');
    respond([
        'ok' => true,
        'path' => normalize_relative_path($pathParam),
        'items' => list_files($root, $pathParam, $fileRoots),
        'authenticated' => !empty($_SESSION['bds_admin']),
    ]);
}

if ($action === 'upload') {
    if ($method !== 'POST') {
        respond(['ok' => false, 'error' => 'Method not allowed'], 405);
    }
    require_admin();

    $pathParam = (string)($_POST['path'] ?? 'frames/galley');
    $pathParam = normalize_relative_path($pathParam);
    if ($pathParam === '') {
        $pathParam = 'frames/galley';
    }
    assert_file_area($pathParam, $fileRoots);
    $targetDir = absolute_file_path($root, $pathParam, $fileRoots);
    if (!is_dir($targetDir)) {
        respond(['ok' => false, 'error' => 'Upload folder not found'], 404);
    }

    if (empty($_FILES['file']) || !is_array($_FILES['file'])) {
        respond(['ok' => false, 'error' => 'Missing upload file'], 400);
    }
    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        respond(['ok' => false, 'error' => 'Upload failed'], 400);
    }

    $safeName = safe_uploaded_name((string)$file['name']);
    $ext = strtolower(pathinfo($safeName, PATHINFO_EXTENSION));
    if (!in_array($ext, $allowedUploadExt, true)) {
        respond(['ok' => false, 'error' => 'File type is not allowed'], 400);
    }

    $targetPath = unique_upload_path($targetDir, $safeName);
    if (!move_uploaded_file((string)$file['tmp_name'], $targetPath)) {
        respond(['ok' => false, 'error' => 'Cannot save uploaded file'], 500);
    }

    $relative = trim($pathParam . '/' . basename($targetPath), '/');
    respond([
        'ok' => true,
        'file' => [
            'name' => basename($targetPath),
            'path' => $relative,
            'type' => file_kind($relative, false),
            'size' => filesize($targetPath),
            'url' => $relative,
        ],
    ]);
}

if ($action === 'delete-file') {
    if ($method !== 'POST') {
        respond(['ok' => false, 'error' => 'Method not allowed'], 405);
    }
    require_admin();
    $body = read_json_body();
    $pathParam = normalize_relative_path((string)($body['path'] ?? ''));
    if ($pathParam === '') {
        respond(['ok' => false, 'error' => 'Missing file path'], 400);
    }
    $target = absolute_file_path($root, $pathParam, $fileRoots);
    if (!is_file($target)) {
        respond(['ok' => false, 'error' => 'Only files can be deleted here'], 400);
    }
    $type = file_kind($target, false);
    if (!in_array($type, ['image', 'video', 'pdf'], true)) {
        respond(['ok' => false, 'error' => 'File type is not allowed'], 400);
    }
    if (!unlink($target)) {
        respond(['ok' => false, 'error' => 'Cannot delete file'], 500);
    }
    respond(['ok' => true, 'deleted' => $pathParam]);
}

$resource = (string)($_GET['resource'] ?? '');
if ($resource === '') {
    respond(['ok' => false, 'error' => 'Missing resource'], 400);
}

$path = safe_resource_path($resource, $resources);

if ($method === 'GET') {
    respond([
        'ok' => true,
        'resource' => $resource,
        'data' => load_json_file($path),
        'authenticated' => !empty($_SESSION['bds_admin']),
    ]);
}

if ($method === 'PUT' || $method === 'POST') {
    require_admin();
    $body = read_json_body();
    $data = array_key_exists('data', $body) && is_array($body['data']) ? $body['data'] : $body;

    save_json_file($path, $data, $root);

    respond([
        'ok' => true,
        'resource' => $resource,
        'savedAt' => date(DATE_ATOM),
    ]);
}

respond(['ok' => false, 'error' => 'Method not allowed'], 405);
