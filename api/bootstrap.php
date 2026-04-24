<?php
declare(strict_types=1);

function bds_load_config(): array
{
    $config = [
        'username' => getenv('BDS_ADMIN_USER') ?: 'admin',
        'password' => getenv('BDS_ADMIN_PASS') ?: 'admin123',
        'db' => [
            'host' => getenv('BDS_DB_HOST') ?: getenv('DB_HOST') ?: 'localhost',
            'name' => getenv('BDS_DB_NAME') ?: getenv('DB_NAME') ?: '',
            'user' => getenv('BDS_DB_USER') ?: getenv('DB_USER') ?: '',
            'pass' => getenv('BDS_DB_PASS') ?: getenv('DB_PASS') ?: '',
            'port' => (int)(getenv('BDS_DB_PORT') ?: getenv('DB_PORT') ?: 3306),
            'charset' => getenv('BDS_DB_CHARSET') ?: 'utf8mb4',
        ],
    ];

    $localConfig = __DIR__ . '/config.local.php';
    if (is_file($localConfig)) {
        $override = require $localConfig;
        if (is_array($override)) {
            $config = array_replace_recursive($config, $override);
        }
    }

    return $config;
}

function bds_has_database_config(array $config): bool
{
    $db = $config['db'] ?? [];
    return trim((string)($db['host'] ?? '')) !== ''
        && trim((string)($db['name'] ?? '')) !== ''
        && trim((string)($db['user'] ?? '')) !== '';
}

function bds_pdo(array $config): PDO
{
    static $instances = [];

    if (!bds_has_database_config($config)) {
        throw new RuntimeException('Thiếu cấu hình database.');
    }

    $db = $config['db'];
    $key = md5(json_encode([
        'host' => (string)$db['host'],
        'name' => (string)$db['name'],
        'user' => (string)$db['user'],
        'port' => (int)($db['port'] ?? 3306),
        'charset' => (string)($db['charset'] ?? 'utf8mb4'),
    ]));

    if (isset($instances[$key])) {
        return $instances[$key];
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        (string)$db['host'],
        (int)($db['port'] ?? 3306),
        (string)$db['name'],
        (string)($db['charset'] ?? 'utf8mb4')
    );

    try {
        $instances[$key] = new PDO($dsn, (string)$db['user'], (string)($db['pass'] ?? ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $e) {
        throw new RuntimeException('Không kết nối được database: ' . $e->getMessage(), 0, $e);
    }

    return $instances[$key];
}

function bds_try_pdo(array $config): ?PDO
{
    try {
        return bds_pdo($config);
    } catch (Throwable $e) {
        return null;
    }
}

function bds_generate_version_tag(): string
{
    return 'v' . date('dmY-His');
}

function bds_fallback_version_tag(string $root): string
{
    $candidates = [
        $root . '/index.html',
        $root . '/main.js',
        $root . '/style.css',
        $root . '/thamquan-vr360.js',
        $root . '/thamquan-vr360.css',
        $root . '/vitri.js',
        $root . '/vitri.css',
        $root . '/matbang.js',
        $root . '/matbang-info.css',
    ];

    $latest = 0;
    foreach ($candidates as $path) {
        if (is_file($path)) {
            $latest = max($latest, (int)filemtime($path));
        }
    }

    return $latest > 0 ? 'f' . gmdate('YmdHis', $latest) : 'static';
}

function bds_get_app_version_tag(array $config, string $root): string
{
    $pdo = bds_try_pdo($config);
    if ($pdo) {
        try {
            $stmt = $pdo->query('SELECT version_tag FROM app_version WHERE id = 1 LIMIT 1');
            $value = $stmt ? $stmt->fetchColumn() : false;
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        } catch (Throwable $e) {
            // Fall through to file fallback.
        }
    }

    $fallbackFile = $root . '/data/app_version.json';
    if (is_file($fallbackFile)) {
        $json = json_decode((string)file_get_contents($fallbackFile), true);
        if (is_array($json) && !empty($json['version_tag'])) {
            return (string)$json['version_tag'];
        }
    }

    return bds_fallback_version_tag($root);
}

function bds_store_app_version(array $config, string $root, string $versionTag, ?int $updatedBy, string $note = ''): string
{
    $pdo = bds_try_pdo($config);
    if ($pdo) {
        $stmt = $pdo->prepare(
            'INSERT INTO app_version (id, version_tag, updated_by, note)
             VALUES (1, :version_tag, :updated_by, :note)
             ON DUPLICATE KEY UPDATE
               version_tag = VALUES(version_tag),
               updated_by = VALUES(updated_by),
               note = VALUES(note),
               updated_at = CURRENT_TIMESTAMP()'
        );
        $stmt->bindValue(':version_tag', $versionTag, PDO::PARAM_STR);
        if ($updatedBy === null) {
            $stmt->bindValue(':updated_by', null, PDO::PARAM_NULL);
        } else {
            $stmt->bindValue(':updated_by', $updatedBy, PDO::PARAM_INT);
        }
        $stmt->bindValue(':note', $note, PDO::PARAM_STR);
        $stmt->execute();
        return $versionTag;
    }

    $fallbackFile = $root . '/data/app_version.json';
    $payload = [
        'version_tag' => $versionTag,
        'updated_at' => date(DATE_ATOM),
        'updated_by' => $updatedBy,
        'note' => $note,
    ];

    if (!is_dir(dirname($fallbackFile)) && !mkdir(dirname($fallbackFile), 0775, true) && !is_dir(dirname($fallbackFile))) {
        throw new RuntimeException('Không tạo được thư mục version cache.');
    }

    $encoded = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || file_put_contents($fallbackFile, $encoded . PHP_EOL, LOCK_EX) === false) {
        throw new RuntimeException('Không ghi được file version cache.');
    }

    return $versionTag;
}
