<?php
declare(strict_types=1);

$secureCookie = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['SERVER_PORT'] ?? '') === '443');
if (PHP_VERSION_ID >= 70300) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secureCookie,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
} else {
    session_set_cookie_params(0, '/; samesite=Lax', '', $secureCookie, true);
}
ini_set('session.use_strict_mode', '1');
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require __DIR__ . '/bootstrap.php';

$root = dirname(__DIR__);
$config = bds_load_config();

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

const BDS_LOGIN_MAX_FAILED_ATTEMPTS = 5;
const BDS_LOGIN_LOCKOUT_SECONDS = 72 * 60 * 60;
const BDS_PRELOAD_MEDIA_LIMIT = 12;

function json_payload_string(array $payload): string
{
    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return $encoded === false
        ? '{"ok":false,"error":"Cannot encode JSON response"}'
        : $encoded;
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_payload_string($payload);
    exit;
}

function respond_and_finish_request(array $payload, int $status = 200): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    ignore_user_abort(true);
    http_response_code($status);
    echo json_payload_string($payload);

    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
        return;
    }

    @ob_flush();
    @flush();
}

function cache_refresh_status_path(string $root): string
{
    return $root . '/data/cache_refresh_status.json';
}

function read_cache_refresh_status(string $root): ?array
{
    $path = cache_refresh_status_path($root);
    if (!is_file($path)) {
        return null;
    }

    $raw = @file_get_contents($path);
    if ($raw === false || trim($raw) === '') {
        return null;
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function write_cache_refresh_status(string $root, array $status): void
{
    $path = cache_refresh_status_path($root);
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException('Không thể tạo thư mục lưu trạng thái cache refresh');
    }

    $encoded = json_encode($status, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        throw new RuntimeException('Không thể mã hóa trạng thái cache refresh');
    }

    $tmpPath = $path . '.tmp';
    if (file_put_contents($tmpPath, $encoded . PHP_EOL, LOCK_EX) === false) {
        throw new RuntimeException('Không thể ghi file trạng thái cache refresh');
    }

    if (!rename($tmpPath, $path)) {
        @unlink($tmpPath);
        throw new RuntimeException('Không thể cập nhật file trạng thái cache refresh');
    }
}

function legacy_login_guard_path(string $root): string
{
    return $root . '/data/legacy_login_guard.json';
}

function read_legacy_login_guards(string $root): array
{
    $path = legacy_login_guard_path($root);
    if (!is_file($path)) {
        return [];
    }

    $raw = @file_get_contents($path);
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function write_legacy_login_guards(string $root, array $guards): void
{
    $path = legacy_login_guard_path($root);
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException('Không thể tạo thư mục lưu trạng thái đăng nhập legacy');
    }

    $encoded = json_encode($guards, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        throw new RuntimeException('Không thể mã hóa trạng thái đăng nhập legacy');
    }

    $tmpPath = $path . '.tmp';
    if (file_put_contents($tmpPath, $encoded . PHP_EOL, LOCK_EX) === false) {
        throw new RuntimeException('Không thể ghi trạng thái đăng nhập legacy');
    }

    if (!rename($tmpPath, $path)) {
        @unlink($tmpPath);
        throw new RuntimeException('Không thể cập nhật trạng thái đăng nhập legacy');
    }
}

function legacy_login_guard_key(string $login): string
{
    return hash('sha256', mb_strtolower(trim($login), 'UTF-8'));
}

function get_legacy_login_guard(string $root, string $login): array
{
    $guards = read_legacy_login_guards($root);
    $entry = $guards[legacy_login_guard_key($login)] ?? null;
    if (!is_array($entry)) {
        return [
            'failed_attempts' => 0,
            'locked_until' => null,
        ];
    }

    return [
        'failed_attempts' => (int)($entry['failed_attempts'] ?? 0),
        'locked_until' => !empty($entry['locked_until']) ? (string)$entry['locked_until'] : null,
    ];
}

function clear_legacy_login_guard(string $root, string $login): void
{
    $guards = read_legacy_login_guards($root);
    $key = legacy_login_guard_key($login);
    if (!isset($guards[$key])) {
        return;
    }
    unset($guards[$key]);
    write_legacy_login_guards($root, $guards);
}

function register_legacy_login_failure(string $root, string $login): array
{
    $guards = read_legacy_login_guards($root);
    $key = legacy_login_guard_key($login);
    $entry = $guards[$key] ?? [];
    $failedAttempts = (int)($entry['failed_attempts'] ?? 0) + 1;
    $lockedUntil = null;
    if ($failedAttempts >= BDS_LOGIN_MAX_FAILED_ATTEMPTS) {
        $failedAttempts = BDS_LOGIN_MAX_FAILED_ATTEMPTS;
        $lockedUntil = date('Y-m-d H:i:s', time() + BDS_LOGIN_LOCKOUT_SECONDS);
    }

    $guards[$key] = [
        'login' => $login,
        'failed_attempts' => $failedAttempts,
        'locked_until' => $lockedUntil,
        'updated_at' => date(DATE_ATOM),
    ];
    write_legacy_login_guards($root, $guards);

    return [
        'failed_attempts' => $failedAttempts,
        'locked_until' => $lockedUntil,
    ];
}

function login_ip_guard_path(string $root): string
{
    return $root . '/data/login_ip_guard.json';
}

function read_login_ip_guards(string $root): array
{
    $path = login_ip_guard_path($root);
    if (!is_file($path)) {
        return [];
    }

    $raw = @file_get_contents($path);
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function write_login_ip_guards(string $root, array $guards): void
{
    $path = login_ip_guard_path($root);
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException('Không thể tạo thư mục lưu trạng thái khóa IP');
    }

    $encoded = json_encode($guards, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        throw new RuntimeException('Không thể mã hóa trạng thái khóa IP');
    }

    $tmpPath = $path . '.tmp';
    if (file_put_contents($tmpPath, $encoded . PHP_EOL, LOCK_EX) === false) {
        throw new RuntimeException('Không thể ghi trạng thái khóa IP');
    }

    if (!rename($tmpPath, $path)) {
        @unlink($tmpPath);
        throw new RuntimeException('Không thể cập nhật trạng thái khóa IP');
    }
}

function login_ip_guard_key(string $ip): string
{
    return hash('sha256', trim($ip));
}

function get_login_ip_guard(string $root, string $ip): array
{
    if ($ip === '') {
        return [
            'failed_attempts' => 0,
            'locked_until' => null,
        ];
    }

    $guards = read_login_ip_guards($root);
    $entry = $guards[login_ip_guard_key($ip)] ?? null;
    if (!is_array($entry)) {
        return [
            'failed_attempts' => 0,
            'locked_until' => null,
        ];
    }

    return [
        'failed_attempts' => (int)($entry['failed_attempts'] ?? 0),
        'locked_until' => !empty($entry['locked_until']) ? (string)$entry['locked_until'] : null,
    ];
}

function clear_login_ip_guard(string $root, string $ip): void
{
    if ($ip === '') {
        return;
    }

    $guards = read_login_ip_guards($root);
    $key = login_ip_guard_key($ip);
    if (!isset($guards[$key])) {
        return;
    }

    unset($guards[$key]);
    write_login_ip_guards($root, $guards);
}

function register_login_ip_failure(string $root, string $ip, string $login = ''): array
{
    if ($ip === '') {
        return [
            'failed_attempts' => 0,
            'locked_until' => null,
        ];
    }

    $guards = read_login_ip_guards($root);
    $key = login_ip_guard_key($ip);
    $entry = $guards[$key] ?? [];
    $failedAttempts = (int)($entry['failed_attempts'] ?? 0) + 1;
    $lockedUntil = null;
    if ($failedAttempts >= BDS_LOGIN_MAX_FAILED_ATTEMPTS) {
        $failedAttempts = BDS_LOGIN_MAX_FAILED_ATTEMPTS;
        $lockedUntil = date('Y-m-d H:i:s', time() + BDS_LOGIN_LOCKOUT_SECONDS);
    }

    $guards[$key] = [
        'ip' => $ip,
        'last_login' => $login,
        'failed_attempts' => $failedAttempts,
        'locked_until' => $lockedUntil,
        'updated_at' => date(DATE_ATOM),
    ];
    write_login_ip_guards($root, $guards);

    return [
        'failed_attempts' => $failedAttempts,
        'locked_until' => $lockedUntil,
    ];
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

function current_admin(): ?array
{
    if (!isset($_SESSION['bds_admin'])) {
        return null;
    }

    if ($_SESSION['bds_admin'] === true) {
        return [
            'id' => null,
            'username' => 'admin',
            'email' => '',
            'display_name' => 'Admin',
            'role' => 'super_admin',
            'legacy' => true,
            'source' => 'legacy',
        ];
    }

    if (!is_array($_SESSION['bds_admin'])) {
        return null;
    }

    return [
        'id' => isset($_SESSION['bds_admin']['id']) && $_SESSION['bds_admin']['id'] !== null ? (int)$_SESSION['bds_admin']['id'] : null,
        'username' => (string)($_SESSION['bds_admin']['username'] ?? 'admin'),
        'email' => (string)($_SESSION['bds_admin']['email'] ?? ''),
        'display_name' => (string)($_SESSION['bds_admin']['display_name'] ?? $_SESSION['bds_admin']['username'] ?? 'Admin'),
        'role' => (string)($_SESSION['bds_admin']['role'] ?? 'editor'),
        'legacy' => !empty($_SESSION['bds_admin']['legacy']),
        'source' => (string)($_SESSION['bds_admin']['source'] ?? (!empty($_SESSION['bds_admin']['legacy']) ? 'legacy' : 'database')),
    ];
}

function require_admin(): array
{
    $admin = current_admin();
    if ($admin === null) {
        respond(['ok' => false, 'error' => 'Unauthorized'], 401);
    }

    return $admin;
}

function is_super_admin(array $admin): bool
{
    return (($admin['role'] ?? '') === 'super_admin') || !empty($admin['legacy']);
}

function require_super_admin(): array
{
    $admin = require_admin();
    if (!is_super_admin($admin)) {
        respond(['ok' => false, 'error' => 'Bạn không có quyền super admin'], 403);
    }

    return $admin;
}

function start_admin_session(array $admin): void
{
    $_SESSION['bds_admin'] = $admin;
    session_regenerate_id(true);
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
    if ($isDir) {
        return 'folder';
    }
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'], true)) {
        return 'image';
    }
    if (in_array($ext, ['mp4', 'webm', 'mov'], true)) {
        return 'video';
    }
    if ($ext === 'json') {
        return 'json';
    }
    if ($ext === 'pdf') {
        return 'pdf';
    }
    if ($ext === 'js') {
        return 'js';
    }
    if ($ext === 'css') {
        return 'css';
    }
    if (in_array($ext, ['html', 'htm'], true)) {
        return 'html';
    }
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
        if ($name === '.' || $name === '..') {
            continue;
        }
        if ($name[0] === '.' && $name !== '.htaccess') {
            continue;
        }
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
        if ($a['isDir'] !== $b['isDir']) {
            return $a['isDir'] ? -1 : 1;
        }
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
    $candidate = $filename;
    $base = pathinfo($filename, PATHINFO_FILENAME);
    $ext = pathinfo($filename, PATHINFO_EXTENSION);
    $i = 1;
    while (file_exists($dir . '/' . $candidate)) {
        $candidate = $base . '-' . $i . ($ext !== '' ? '.' . $ext : '');
        $i++;
    }
    return $dir . '/' . $candidate;
}

function client_ip(): string
{
    $candidates = [
        $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null,
        $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null,
        $_SERVER['REMOTE_ADDR'] ?? null,
    ];

    foreach ($candidates as $candidate) {
        if (!is_string($candidate) || trim($candidate) === '') {
            continue;
        }
        $first = trim(explode(',', $candidate)[0] ?? '');
        if ($first !== '') {
            return substr($first, 0, 45);
        }
    }

    return '';
}

function audit_log(PDO $pdo, ?array $admin, string $action, ?string $target = null, string $status = 'success', array $meta = [], ?string $username = null): void
{
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO audit_log (user_id, username, action, target, status, ip, user_agent, meta)
             VALUES (:user_id, :username, :action, :target, :status, :ip, :user_agent, :meta)'
        );
        $stmt->bindValue(':user_id', $admin['id'] ?? null, ($admin['id'] ?? null) === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->bindValue(':username', $username ?? ($admin['username'] ?? null), PDO::PARAM_STR);
        $stmt->bindValue(':action', $action, PDO::PARAM_STR);
        $stmt->bindValue(':target', $target, $target === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $stmt->bindValue(':status', $status, PDO::PARAM_STR);
        $stmt->bindValue(':ip', client_ip(), PDO::PARAM_STR);
        $stmt->bindValue(':user_agent', substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255), PDO::PARAM_STR);
        $metaJson = $meta ? json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
        $stmt->bindValue(':meta', $metaJson, $metaJson === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $stmt->execute();
    } catch (Throwable $e) {
        // Skip audit failures to avoid blocking the main action.
    }
}

function normalize_user_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'username' => (string)$row['username'],
        'email' => (string)$row['email'],
        'display_name' => (string)($row['display_name'] ?? ''),
        'role' => (string)$row['role'],
        'is_active' => (int)$row['is_active'] === 1,
        'last_login_at' => $row['last_login_at'] ?: null,
        'last_login_ip' => $row['last_login_ip'] ?: null,
        'failed_attempts' => (int)($row['failed_attempts'] ?? 0),
        'locked_until' => $row['locked_until'] ?: null,
        'created_at' => $row['created_at'] ?: null,
        'updated_at' => $row['updated_at'] ?: null,
    ];
}

function db_user_session_payload(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'username' => (string)$row['username'],
        'email' => (string)$row['email'],
        'display_name' => (string)($row['display_name'] ?: $row['username']),
        'role' => (string)$row['role'],
        'legacy' => false,
        'source' => 'database',
    ];
}

function fetch_admin_user_by_login(PDO $pdo, string $login): ?array
{
    $stmt = $pdo->prepare(
        'SELECT * FROM admin_users
         WHERE username = :login_username OR email = :login_email
         LIMIT 1'
    );
    $stmt->execute([
        ':login_username' => $login,
        ':login_email' => $login,
    ]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

function fetch_admin_user_by_id(PDO $pdo, int $userId): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM admin_users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

function validate_username(string $username): void
{
    if (!preg_match('/^[A-Za-z0-9._-]{3,64}$/', $username)) {
        respond(['ok' => false, 'error' => 'Username chỉ được gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang và dài 3-64 ký tự'], 422);
    }
}

function validate_email(string $email): void
{
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond(['ok' => false, 'error' => 'Email không hợp lệ'], 422);
    }
}

function validate_password(string $password): void
{
    if (mb_strlen($password) < 8) {
        respond(['ok' => false, 'error' => 'Mật khẩu phải có ít nhất 8 ký tự'], 422);
    }
}

function validate_role(string $role): void
{
    if (!in_array($role, ['super_admin', 'editor'], true)) {
        respond(['ok' => false, 'error' => 'Role không hợp lệ'], 422);
    }
}

function count_active_super_admin(PDO $pdo, ?int $excludeUserId = null): int
{
    $sql = 'SELECT COUNT(*) FROM admin_users WHERE role = "super_admin" AND is_active = 1';
    $params = [];
    if ($excludeUserId !== null) {
        $sql .= ' AND id <> :exclude_id';
        $params[':exclude_id'] = $excludeUserId;
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return (int)$stmt->fetchColumn();
}

function generate_temp_password(int $length = 14): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    $max = strlen($alphabet) - 1;
    $password = '';
    for ($i = 0; $i < $length; $i++) {
        $password .= $alphabet[random_int(0, $max)];
    }
    return $password;
}

function login_lockout_message(?string $lockedUntil = null): string
{
    $base = 'Tài khoản đã bị khóa tạm thời vì nhập sai mật khẩu quá ' . BDS_LOGIN_MAX_FAILED_ATTEMPTS . ' lần.';
    if ($lockedUntil) {
        $timestamp = strtotime($lockedUntil);
        if ($timestamp !== false) {
            return $base . ' Hệ thống sẽ mở lại lúc ' . date('H:i d/m/Y', $timestamp) . '. Bạn cũng có thể liên hệ quản trị viên để reset mật khẩu sớm hơn.';
        }
    }

    return $base . ' Thời gian khóa là 72 giờ hoặc cho tới khi quản trị viên reset mật khẩu.';
}

function login_ip_lockout_message(?string $lockedUntil = null): string
{
    $base = 'Địa chỉ mạng/IP hiện tại đã bị khóa tạm thời vì có quá nhiều lần đăng nhập sai.';
    if ($lockedUntil) {
        $timestamp = strtotime($lockedUntil);
        if ($timestamp !== false) {
            return $base . ' Hệ thống sẽ mở lại lúc ' . date('H:i d/m/Y', $timestamp) . '. Bạn có thể đổi sang mạng khác hoặc liên hệ quản trị viên nếu cần xử lý sớm.';
        }
    }

    return $base . ' Thời gian khóa là 72 giờ.';
}

function login_failed_attempt_message(int $failedAttempts): string
{
    $remaining = max(0, BDS_LOGIN_MAX_FAILED_ATTEMPTS - $failedAttempts);
    if ($remaining <= 0) {
        return login_lockout_message();
    }

    return 'Sai tài khoản hoặc mật khẩu. Bạn còn ' . $remaining . ' lần thử trước khi tài khoản bị khóa trong 72 giờ.';
}

function login_ip_failed_attempt_message(int $failedAttempts): string
{
    $remaining = max(0, BDS_LOGIN_MAX_FAILED_ATTEMPTS - $failedAttempts);
    if ($remaining <= 0) {
        return login_ip_lockout_message();
    }

    return 'Sai tài khoản hoặc mật khẩu. Từ địa chỉ mạng/IP hiện tại, bạn còn ' . $remaining . ' lần thử trước khi bị khóa trong 72 giờ.';
}

function login_ip_remaining_note(int $failedAttempts): string
{
    $remaining = max(0, BDS_LOGIN_MAX_FAILED_ATTEMPTS - $failedAttempts);
    if ($remaining <= 0) {
        return ' IP hiện tại cũng đã chạm ngưỡng khóa.';
    }

    return ' IP hiện tại còn ' . $remaining . ' lần thử.';
}

function normalize_login_error_message(string $message): string
{
    $message = trim($message);
    if ($message === '') {
        return 'Không thể đăng nhập. Vui lòng thử lại sau ít phút.';
    }

    $technicalPatterns = [
        'SQLSTATE[',
        'Invalid parameter number',
        'HY093',
        'PDOException',
        'Call to',
        'Stack trace',
    ];
    foreach ($technicalPatterns as $pattern) {
        if (stripos($message, $pattern) !== false) {
            return 'Hệ thống đăng nhập đang gặp lỗi kỹ thuật. Vui lòng thử lại sau ít phút hoặc liên hệ quản trị viên.';
        }
    }

    return $message;
}

function public_base_url(): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['SERVER_PORT'] ?? '') === '443')
        ? 'https'
        : 'http';
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    $scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
    $basePath = rtrim(str_replace('\\', '/', dirname(dirname($scriptName))), '/');
    if ($basePath === '/' || $basePath === '.') {
        $basePath = '';
    }
    return $scheme . '://' . $host . $basePath;
}

function encode_public_path(string $path): string
{
    $path = trim(str_replace('\\', '/', $path));
    $path = preg_replace('#^(?:\./)+#', '', $path) ?? $path;
    if ($path === '' || $path === '/') {
        return '';
    }

    $segments = [];
    foreach (explode('/', trim($path, '/')) as $segment) {
        if ($segment === '' || $segment === '.' || $segment === '..') {
            continue;
        }
        $segments[] = rawurlencode($segment);
    }

    return implode('/', $segments);
}

function public_url(string $path = '', array $query = []): string
{
    $base = public_base_url();
    $path = encode_public_path($path);
    $url = $base . ($path !== '' ? '/' . $path : '/');
    if ($query) {
        $url .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    }
    return $url;
}

function preload_url(string $url): array
{
    $startedAt = microtime(true);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_USERAGENT => 'BDS-Cache-Preloader/1.0',
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
        ]);
        $body = curl_exec($ch);
        $error = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        return [
            'url' => $url,
            'status' => $status,
            'ok' => $error === '' && $status >= 200 && $status < 400,
            'duration_ms' => (int)round((microtime(true) - $startedAt) * 1000),
            'error' => $error !== '' ? $error : null,
            'bytes' => is_string($body) ? strlen($body) : 0,
        ];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 25,
            'ignore_errors' => true,
            'header' => "User-Agent: BDS-Cache-Preloader/1.0\r\n",
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
        ],
    ]);

    $body = @file_get_contents($url, false, $context);
    $headers = $http_response_header ?? [];
    $statusLine = $headers[0] ?? '';
    preg_match('/\s(\d{3})\s/', $statusLine, $matches);
    $status = isset($matches[1]) ? (int)$matches[1] : 0;

    return [
        'url' => $url,
        'status' => $status,
        'ok' => $body !== false && $status >= 200 && $status < 400,
        'duration_ms' => (int)round((microtime(true) - $startedAt) * 1000),
        'error' => $body === false ? 'Không thể preload URL' : null,
        'bytes' => is_string($body) ? strlen($body) : 0,
    ];
}

function preload_collect_media_targets(string $root, string $versionTag): array
{
    $paths = [];

    $libraryPath = $root . '/data/library.json';
    if (is_file($libraryPath)) {
        $library = json_decode((string)file_get_contents($libraryPath), true);
        if (is_array($library)) {
            foreach (($library['albums'] ?? []) as $album) {
                if (!is_array($album)) {
                    continue;
                }
                if (!empty($album['cover']) && is_string($album['cover'])) {
                    $paths[] = $album['cover'];
                }
                foreach (($album['images'] ?? []) as $image) {
                    if (is_string($image) && trim($image) !== '') {
                        $paths[] = $image;
                    }
                }
            }
            foreach (($library['videos'] ?? []) as $video) {
                if (!is_array($video)) {
                    continue;
                }
                foreach (['thumb', 'cover', 'src'] as $key) {
                    if (!empty($video[$key]) && is_string($video[$key])) {
                        $paths[] = $video[$key];
                    }
                }
            }
        }
    }

    $vitriPath = $root . '/data/vitri_config.json';
    if (is_file($vitriPath)) {
        $vitri = json_decode((string)file_get_contents($vitriPath), true);
        if (is_array($vitri)) {
            foreach (['masterplanImage', 'lkvImage', 'lkvVideo'] as $key) {
                if (!empty($vitri[$key]) && is_string($vitri[$key])) {
                    $paths[] = $vitri[$key];
                }
            }
        }
    }

    $thamquanPath = $root . '/data/thamquan_config.json';
    if (is_file($thamquanPath)) {
        $thamquan = json_decode((string)file_get_contents($thamquanPath), true);
        if (is_array($thamquan) && !empty($thamquan['panoSrc']) && is_string($thamquan['panoSrc'])) {
            $paths[] = $thamquan['panoSrc'];
        }
    }

    $targets = [];
    $seen = [];
    foreach ($paths as $path) {
        $normalized = trim(str_replace('\\', '/', $path));
        if ($normalized === '' || preg_match('#^(https?:)?//#i', $normalized) || strpos($normalized, 'data:') === 0) {
            continue;
        }
        $normalized = ltrim($normalized, './');
        if ($normalized === '' || isset($seen[$normalized])) {
            continue;
        }
        $seen[$normalized] = true;
        $targets[] = public_url($normalized, ['v' => $versionTag]);
        if (count($targets) >= BDS_PRELOAD_MEDIA_LIMIT) {
            break;
        }
    }

    return $targets;
}

function build_preload_targets(string $versionTag, string $root): array
{
    $targets = [
        public_url('', ['v' => $versionTag]),
        public_url('asset-version.php', ['v' => $versionTag]),
        public_url('style.css', ['v' => $versionTag]),
        public_url('vitri.css', ['v' => $versionTag]),
        public_url('thamquan-vr360.css', ['v' => $versionTag]),
        public_url('matbang-info.css', ['v' => $versionTag]),
        public_url('main.js', ['v' => $versionTag]),
        public_url('thamquan-vr360.js', ['v' => $versionTag]),
        public_url('matbang.js', ['v' => $versionTag]),
        public_url('vitri.js', ['v' => $versionTag]),
        public_url('favicon.webp', ['v' => $versionTag]),
        public_url('data/library.json', ['t' => $versionTag]),
        public_url('data/vitri_config.json', ['t' => $versionTag]),
        public_url('data/thamquan_config.json', ['t' => $versionTag]),
        public_url('data/vr_config.json', ['t' => $versionTag]),
        public_url('data/masterplan.json', ['t' => $versionTag]),
    ];

    $targets = array_merge($targets, preload_collect_media_targets($root, $versionTag));

    $seen = [];
    $uniqueTargets = [];
    foreach ($targets as $target) {
        if (isset($seen[$target])) {
            continue;
        }
        $seen[$target] = true;
        $uniqueTargets[] = $target;
    }

    return $uniqueTargets;
}

function preload_cache_targets(string $versionTag, string $root): array
{
    $results = [];
    foreach (build_preload_targets($versionTag, $root) as $target) {
        $results[] = preload_url($target);
    }

    return $results;
}

function summarize_preload_results(array $results): array
{
    $successCount = 0;
    foreach ($results as $result) {
        if (!empty($result['ok'])) {
            $successCount++;
        }
    }

    return [
        'total' => count($results),
        'success' => $successCount,
        'failed' => count($results) - $successCount,
    ];
}

function handle_database_login(PDO $pdo, string $login, string $password): array
{
    $row = fetch_admin_user_by_login($pdo, $login);
    if (!$row) {
        throw new RuntimeException('Sai tài khoản hoặc mật khẩu');
    }

    if ((int)$row['is_active'] !== 1) {
        throw new RuntimeException('Tài khoản này hiện đang bị tắt. Vui lòng liên hệ quản trị viên.');
    }

    if (!empty($row['locked_until']) && strtotime((string)$row['locked_until']) > time()) {
        throw new RuntimeException(login_lockout_message((string)$row['locked_until']));
    }

    if (!password_verify($password, (string)$row['password_hash'])) {
        $failedAttempts = (int)$row['failed_attempts'] + 1;
        $lockedUntil = null;
        if ($failedAttempts >= BDS_LOGIN_MAX_FAILED_ATTEMPTS) {
            $failedAttempts = BDS_LOGIN_MAX_FAILED_ATTEMPTS;
            $lockedUntil = date('Y-m-d H:i:s', time() + BDS_LOGIN_LOCKOUT_SECONDS);
        }
        $stmt = $pdo->prepare('UPDATE admin_users SET failed_attempts = :failed_attempts, locked_until = :locked_until WHERE id = :id');
        $stmt->bindValue(':failed_attempts', $failedAttempts, PDO::PARAM_INT);
        $stmt->bindValue(':locked_until', $lockedUntil, $lockedUntil === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $stmt->bindValue(':id', (int)$row['id'], PDO::PARAM_INT);
        $stmt->execute();

        if ($lockedUntil !== null) {
            throw new RuntimeException(login_lockout_message($lockedUntil));
        }

        throw new RuntimeException(login_failed_attempt_message($failedAttempts));
    }

    $stmt = $pdo->prepare(
        'UPDATE admin_users
         SET failed_attempts = 0,
             locked_until = NULL,
             last_login_at = NOW(),
             last_login_ip = :last_login_ip
         WHERE id = :id'
    );
    $stmt->execute([
        ':last_login_ip' => client_ip(),
        ':id' => (int)$row['id'],
    ]);

    $fresh = fetch_admin_user_by_id($pdo, (int)$row['id']);
    if (!$fresh) {
        throw new RuntimeException('Không tải được thông tin tài khoản sau khi đăng nhập');
    }

    return db_user_session_payload($fresh);
}

$action = (string)($_GET['action'] ?? '');
$method = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($action === 'status') {
    $admin = current_admin();
    respond([
        'ok' => true,
        'authenticated' => $admin !== null,
        'user' => $admin,
        'appVersion' => bds_get_app_version_tag($config, $root),
        'dbEnabled' => bds_has_database_config($config),
        'dbConnected' => bds_try_pdo($config) !== null,
    ]);
}

if ($action === 'login') {
    if ($method !== 'POST') {
        respond(['ok' => false, 'error' => 'Method not allowed'], 405);
    }

    $body = read_json_body();
    $login = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');
    if ($login === '' || $password === '') {
        respond(['ok' => false, 'error' => 'Vui lòng nhập đủ tài khoản và mật khẩu'], 422);
    }
    $ipAddress = client_ip();
    $ipGuard = get_login_ip_guard($root, $ipAddress);
    if (!empty($ipGuard['locked_until']) && strtotime((string)$ipGuard['locked_until']) > time()) {
        respond(['ok' => false, 'error' => login_ip_lockout_message((string)$ipGuard['locked_until'])], 401);
    }

    $isLegacyLogin = hash_equals((string)$config['username'], $login);
    if ($isLegacyLogin) {
        $legacyGuard = get_legacy_login_guard($root, $login);
        if (!empty($legacyGuard['locked_until']) && strtotime((string)$legacyGuard['locked_until']) > time()) {
            respond(['ok' => false, 'error' => login_lockout_message((string)$legacyGuard['locked_until'])], 401);
        }
    }

    $dbError = null;
    $pdo = bds_try_pdo($config);
    if ($pdo) {
        try {
            $admin = handle_database_login($pdo, $login, $password);
            clear_login_ip_guard($root, $ipAddress);
            if ($isLegacyLogin) {
                clear_legacy_login_guard($root, $login);
            }
            start_admin_session($admin);
            audit_log($pdo, $admin, 'login', $admin['username'], 'success', ['source' => 'database']);
            respond(['ok' => true, 'authenticated' => true, 'user' => $admin, 'source' => 'database']);
        } catch (Throwable $e) {
            $dbError = normalize_login_error_message($e->getMessage());
            audit_log($pdo, null, 'login', $login, 'fail', ['source' => 'database', 'reason' => $dbError], $login);
        }
    } elseif (bds_has_database_config($config)) {
        $dbError = 'Hệ thống đăng nhập chưa kết nối được database. Nếu bạn còn tài khoản legacy dự phòng thì có thể dùng tạm, nếu không hãy liên hệ quản trị viên.';
    }

    if ($isLegacyLogin && hash_equals((string)$config['password'], $password)) {
        clear_login_ip_guard($root, $ipAddress);
        clear_legacy_login_guard($root, $login);
        $admin = [
            'id' => null,
            'username' => $login,
            'email' => '',
            'display_name' => $login,
            'role' => 'super_admin',
            'legacy' => true,
            'source' => 'legacy',
        ];
        start_admin_session($admin);
        respond([
            'ok' => true,
            'authenticated' => true,
            'user' => $admin,
            'source' => 'legacy',
            'warning' => $dbError ?: 'Bạn đang dùng tài khoản cấu hình cũ. Hãy tạo hoặc reset tài khoản database trong phần Cài đặt chung.',
        ]);
    }

    $ipGuard = register_login_ip_failure($root, $ipAddress, $login);
    $ipLockMessage = !empty($ipGuard['locked_until'])
        ? login_ip_lockout_message((string)$ipGuard['locked_until'])
        : login_ip_failed_attempt_message((int)$ipGuard['failed_attempts']);
    if (!empty($ipGuard['locked_until'])) {
        $dbError = $ipLockMessage;
    }

    if ($isLegacyLogin) {
        $legacyGuard = register_legacy_login_failure($root, $login);
        if (!empty($legacyGuard['locked_until'])) {
            $dbError = login_lockout_message((string)$legacyGuard['locked_until']);
        } else {
            $dbError = login_failed_attempt_message((int)$legacyGuard['failed_attempts']) . login_ip_remaining_note((int)$ipGuard['failed_attempts']);
        }
    } elseif ($dbError === null || stripos($dbError, 'Sai tài khoản hoặc mật khẩu') !== false) {
        if (!empty($ipGuard['locked_until'])) {
            $dbError = $ipLockMessage;
        } elseif (is_string($dbError) && stripos($dbError, 'Bạn còn') !== false) {
            $dbError .= login_ip_remaining_note((int)$ipGuard['failed_attempts']);
        } else {
            $dbError = $ipLockMessage;
        }
    }

    respond(['ok' => false, 'error' => $dbError ?: 'Sai tài khoản hoặc mật khẩu'], 401);
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
    require_admin();
    $pathParam = (string)($_GET['path'] ?? '');
    respond([
        'ok' => true,
        'path' => normalize_relative_path($pathParam),
        'items' => list_files($root, $pathParam, $fileRoots),
        'authenticated' => true,
    ]);
}

if ($action === 'upload') {
    if ($method !== 'POST') {
        respond(['ok' => false, 'error' => 'Method not allowed'], 405);
    }
    $admin = require_admin();

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

    $pdo = bds_try_pdo($config);
    if ($pdo) {
        audit_log($pdo, $admin, 'upload_file', trim($pathParam . '/' . basename($targetPath), '/'));
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
    $admin = require_admin();
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

    $pdo = bds_try_pdo($config);
    if ($pdo) {
        audit_log($pdo, $admin, 'delete_file', $pathParam);
    }

    respond(['ok' => true, 'deleted' => $pathParam]);
}

if ($action === 'list-users') {
    require_super_admin();
    $pdo = bds_pdo($config);
    $rows = $pdo->query(
        'SELECT id, username, email, display_name, role, is_active, last_login_at, last_login_ip, failed_attempts, locked_until, created_at, updated_at
         FROM admin_users
         ORDER BY role = "super_admin" DESC, username ASC'
    )->fetchAll();
    respond([
        'ok' => true,
        'users' => array_map('normalize_user_row', array_filter($rows, 'is_array')),
    ]);
}

if ($action === 'create-user') {
    if ($method !== 'POST') {
        respond(['ok' => false, 'error' => 'Method not allowed'], 405);
    }
    $admin = require_super_admin();
    $pdo = bds_pdo($config);
    $body = read_json_body();

    $username = trim((string)($body['username'] ?? ''));
    $email = trim((string)($body['email'] ?? ''));
    $displayName = trim((string)($body['display_name'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $role = trim((string)($body['role'] ?? 'editor'));

    validate_username($username);
    validate_email($email);
    validate_password($password);
    validate_role($role);

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO admin_users (username, email, password_hash, role, display_name, is_active, created_by)
             VALUES (:username, :email, :password_hash, :role, :display_name, 1, :created_by)'
        );
        $stmt->bindValue(':username', $username, PDO::PARAM_STR);
        $stmt->bindValue(':email', $email, PDO::PARAM_STR);
        $stmt->bindValue(':password_hash', password_hash($password, PASSWORD_DEFAULT), PDO::PARAM_STR);
        $stmt->bindValue(':role', $role, PDO::PARAM_STR);
        $stmt->bindValue(':display_name', $displayName !== '' ? $displayName : null, $displayName !== '' ? PDO::PARAM_STR : PDO::PARAM_NULL);
        $stmt->bindValue(':created_by', $admin['id'] ?? null, ($admin['id'] ?? null) === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->execute();
    } catch (Throwable $e) {
        respond(['ok' => false, 'error' => 'Không tạo được user. Có thể username hoặc email đã tồn tại'], 409);
    }

    $created = fetch_admin_user_by_id($pdo, (int)$pdo->lastInsertId());
    if (!$created) {
        respond(['ok' => false, 'error' => 'Tạo user xong nhưng không đọc lại được dữ liệu'], 500);
    }

    audit_log($pdo, $admin, 'create_user', $username, 'success', ['role' => $role]);
    respond(['ok' => true, 'user' => normalize_user_row($created)]);
}

if ($action === 'update-user') {
    if ($method !== 'POST') {
        respond(['ok' => false, 'error' => 'Method not allowed'], 405);
    }
    $admin = require_super_admin();
    $pdo = bds_pdo($config);
    $body = read_json_body();

    $userId = (int)($body['user_id'] ?? 0);
    if ($userId <= 0) {
        respond(['ok' => false, 'error' => 'Thiếu user_id'], 422);
    }

    $target = fetch_admin_user_by_id($pdo, $userId);
    if (!$target) {
        respond(['ok' => false, 'error' => 'Không tìm thấy user'], 404);
    }

    $email = trim((string)($body['email'] ?? $target['email']));
    $displayName = trim((string)($body['display_name'] ?? ($target['display_name'] ?? '')));
    $role = trim((string)($body['role'] ?? $target['role']));
    $isActive = array_key_exists('is_active', $body) ? (!empty($body['is_active']) ? 1 : 0) : (int)$target['is_active'];

    validate_email($email);
    validate_role($role);

    $wasActiveSuper = $target['role'] === 'super_admin' && (int)$target['is_active'] === 1;
    $willActiveSuper = $role === 'super_admin' && $isActive === 1;
    if ($target['id'] == ($admin['id'] ?? null) && $isActive !== 1) {
        respond(['ok' => false, 'error' => 'Bạn không thể tự khóa tài khoản đang đăng nhập'], 422);
    }
    if ($wasActiveSuper && !$willActiveSuper && count_active_super_admin($pdo, $userId) < 1) {
        respond(['ok' => false, 'error' => 'Hệ thống phải còn ít nhất 1 super admin đang hoạt động'], 422);
    }

    try {
        $stmt = $pdo->prepare(
            'UPDATE admin_users
             SET email = :email,
                 display_name = :display_name,
                 role = :role,
                 is_active = :is_active
             WHERE id = :id'
        );
        $stmt->bindValue(':email', $email, PDO::PARAM_STR);
        $stmt->bindValue(':display_name', $displayName !== '' ? $displayName : null, $displayName !== '' ? PDO::PARAM_STR : PDO::PARAM_NULL);
        $stmt->bindValue(':role', $role, PDO::PARAM_STR);
        $stmt->bindValue(':is_active', $isActive, PDO::PARAM_INT);
        $stmt->bindValue(':id', $userId, PDO::PARAM_INT);
        $stmt->execute();
    } catch (Throwable $e) {
        respond(['ok' => false, 'error' => 'Không cập nhật được user. Có thể email đã tồn tại'], 409);
    }

    $updated = fetch_admin_user_by_id($pdo, $userId);
    audit_log($pdo, $admin, 'update_user', (string)$target['username'], 'success', [
        'role' => $role,
        'is_active' => $isActive,
    ]);
    respond(['ok' => true, 'user' => $updated ? normalize_user_row($updated) : null]);
}

if ($action === 'change-password') {
    if ($method !== 'POST') {
        respond(['ok' => false, 'error' => 'Method not allowed'], 405);
    }
    $admin = require_admin();
    if (!empty($admin['legacy']) || empty($admin['id'])) {
        respond(['ok' => false, 'error' => 'Bạn đang dùng tài khoản legacy. Hãy đăng nhập bằng user database rồi đổi mật khẩu trong admin'], 422);
    }

    $pdo = bds_pdo($config);
    $body = read_json_body();
    $currentPassword = (string)($body['current_password'] ?? '');
    $newPassword = (string)($body['new_password'] ?? '');
    $confirmPassword = (string)($body['confirm_password'] ?? '');

    if ($currentPassword === '' || $newPassword === '' || $confirmPassword === '') {
        respond(['ok' => false, 'error' => 'Vui lòng nhập đủ thông tin đổi mật khẩu'], 422);
    }
    if ($newPassword !== $confirmPassword) {
        respond(['ok' => false, 'error' => 'Mật khẩu mới và xác nhận chưa khớp'], 422);
    }
    validate_password($newPassword);

    $user = fetch_admin_user_by_id($pdo, (int)$admin['id']);
    if (!$user) {
        respond(['ok' => false, 'error' => 'Không tìm thấy user hiện tại trong database'], 404);
    }
    if (!password_verify($currentPassword, (string)$user['password_hash'])) {
        respond(['ok' => false, 'error' => 'Mật khẩu hiện tại không đúng'], 422);
    }

    $stmt = $pdo->prepare(
        'UPDATE admin_users
         SET password_hash = :password_hash,
             failed_attempts = 0,
             locked_until = NULL
         WHERE id = :id'
    );
    $stmt->execute([
        ':password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
        ':id' => (int)$user['id'],
    ]);

    audit_log($pdo, $admin, 'change_password', (string)$user['username']);
    respond(['ok' => true, 'message' => 'Đã đổi mật khẩu thành công']);
}

if ($action === 'reset-user-password') {
    if ($method !== 'POST') {
        respond(['ok' => false, 'error' => 'Method not allowed'], 405);
    }
    $admin = require_super_admin();
    $pdo = bds_pdo($config);
    $body = read_json_body();

    $userId = (int)($body['user_id'] ?? 0);
    if ($userId <= 0) {
        respond(['ok' => false, 'error' => 'Thiếu user_id'], 422);
    }

    $target = fetch_admin_user_by_id($pdo, $userId);
    if (!$target) {
        respond(['ok' => false, 'error' => 'Không tìm thấy user'], 404);
    }

    $manualPassword = trim((string)($body['new_password'] ?? ''));
    $newPassword = $manualPassword !== '' ? $manualPassword : generate_temp_password();
    validate_password($newPassword);

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare(
            'UPDATE admin_users
             SET password_hash = :password_hash,
                 failed_attempts = 0,
                 locked_until = NULL
             WHERE id = :id'
        );
        $stmt->execute([
            ':password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
            ':id' => $userId,
        ]);

        $resetStmt = $pdo->prepare(
            'INSERT INTO password_resets (user_id, token_hash, expires_at, used_at, created_ip)
             VALUES (:user_id, :token_hash, :expires_at, NOW(), :created_ip)'
        );
        $resetStmt->execute([
            ':user_id' => $userId,
            ':token_hash' => hash('sha256', bin2hex(random_bytes(32))),
            ':expires_at' => date('Y-m-d H:i:s', time() + 86400),
            ':created_ip' => client_ip(),
        ]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        respond(['ok' => false, 'error' => 'Không reset được mật khẩu'], 500);
    }

    audit_log($pdo, $admin, 'reset_password', (string)$target['username'], 'success', [
        'generated' => $manualPassword === '',
    ]);

    respond([
        'ok' => true,
        'temporary_password' => $newPassword,
        'generated' => $manualPassword === '',
        'user' => normalize_user_row(fetch_admin_user_by_id($pdo, $userId) ?: $target),
    ]);
}

if ($action === 'cache-refresh-status') {
    if ($method !== 'GET') {
        respond(['ok' => false, 'error' => 'Method not allowed'], 405);
    }

    require_admin();
    $status = read_cache_refresh_status($root);
    if ($status === null) {
        respond([
            'ok' => true,
            'exists' => false,
            'state' => 'idle',
            'results' => [],
            'summary' => [
                'total' => 0,
                'success' => 0,
                'failed' => 0,
                'pending' => 0,
            ],
        ]);
    }

    respond(array_merge([
        'ok' => true,
        'exists' => true,
    ], $status));
}

if ($action === 'refresh-app-cache') {
    if ($method !== 'POST') {
        respond(['ok' => false, 'error' => 'Method not allowed'], 405);
    }
    $admin = require_admin();
    $body = read_json_body();
    $note = trim((string)($body['note'] ?? ''));
    $note = $note !== '' ? $note : 'Manual cache refresh from admin';

    try {
        if (function_exists('set_time_limit')) {
            @set_time_limit(120);
        }
        $startedAt = date(DATE_ATOM);
        $versionTag = bds_generate_version_tag();
        bds_store_app_version($config, $root, $versionTag, $admin['id'] ?? null, $note);
        $targets = build_preload_targets($versionTag, $root);

        $runningStatus = [
            'state' => 'running',
            'version_tag' => $versionTag,
            'note' => $note,
            'started_at' => $startedAt,
            'finished_at' => null,
            'message' => 'Version mới đã được publish. Hosting đang preload nền các URL quan trọng.',
            'results' => [],
            'targets_preview' => array_slice($targets, 0, 8),
            'summary' => [
                'total' => count($targets),
                'success' => 0,
                'failed' => 0,
                'pending' => count($targets),
            ],
        ];
        write_cache_refresh_status($root, $runningStatus);

        respond_and_finish_request(array_merge([
            'ok' => true,
            'preload_mode' => 'background',
        ], $runningStatus));

        try {
            $results = [];
            foreach ($targets as $target) {
                $results[] = preload_url($target);
            }
            $summary = summarize_preload_results($results);
            $completedStatus = [
                'state' => $summary['failed'] > 0 ? 'completed_with_errors' : 'completed',
                'version_tag' => $versionTag,
                'note' => $note,
                'started_at' => $startedAt,
                'finished_at' => date(DATE_ATOM),
                'message' => $summary['failed'] > 0
                    ? 'Preload đã chạy xong nhưng vẫn còn một số URL lỗi.'
                    : 'Preload đã hoàn tất thành công.',
                'results' => $results,
                'targets_preview' => array_slice($targets, 0, 8),
                'summary' => [
                    'total' => $summary['total'],
                    'success' => $summary['success'],
                    'failed' => $summary['failed'],
                    'pending' => 0,
                ],
            ];
            write_cache_refresh_status($root, $completedStatus);
            $pdo = bds_try_pdo($config);
            if ($pdo) {
                audit_log($pdo, $admin, 'refresh_cache', $versionTag, 'success', [
                    'preloaded' => $summary['total'],
                    'success' => $summary['success'],
                    'failed' => $summary['failed'],
                    'note' => $note,
                ]);
            }
        } catch (Throwable $backgroundError) {
            $partialSummary = summarize_preload_results($results ?? []);
            write_cache_refresh_status($root, [
                'state' => 'failed',
                'version_tag' => $versionTag,
                'note' => $note,
                'started_at' => $startedAt,
                'finished_at' => date(DATE_ATOM),
                'message' => 'Preload nền đã lỗi giữa chừng.',
                'error' => $backgroundError->getMessage(),
                'results' => $results ?? [],
                'targets_preview' => array_slice($targets, 0, 8),
                'summary' => [
                    'total' => count($targets),
                    'success' => $partialSummary['success'],
                    'failed' => max(1, $partialSummary['failed']),
                    'pending' => max(0, count($targets) - count($results ?? [])),
                ],
            ]);
            $pdo = bds_try_pdo($config);
            if ($pdo) {
                audit_log($pdo, $admin, 'refresh_cache', $versionTag, 'fail', [
                    'note' => $note,
                    'reason' => $backgroundError->getMessage(),
                ]);
            }
        }

        exit;
    } catch (Throwable $e) {
        $pdo = bds_try_pdo($config);
        if ($pdo) {
            audit_log($pdo, $admin, 'refresh_cache', null, 'fail', [
                'note' => $note,
                'reason' => $e->getMessage(),
            ]);
        }

        respond([
            'ok' => false,
            'error' => 'Không thể xóa cache và preload: ' . $e->getMessage(),
        ], 500);
    }
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
        'authenticated' => current_admin() !== null,
    ]);
}

if ($method === 'PUT' || $method === 'POST') {
    $admin = require_admin();
    $body = read_json_body();
    $data = array_key_exists('data', $body) && is_array($body['data']) ? $body['data'] : $body;

    save_json_file($path, $data, $root);

    $pdo = bds_try_pdo($config);
    if ($pdo) {
        audit_log($pdo, $admin, 'save_json', $resource);
    }

    respond([
        'ok' => true,
        'resource' => $resource,
        'savedAt' => date(DATE_ATOM),
    ]);
}

respond(['ok' => false, 'error' => 'Method not allowed'], 405);
