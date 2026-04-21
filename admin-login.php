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

$basePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
if ($basePath === '/' || $basePath === '.') {
    $basePath = '';
}
$baseHref = ($basePath ?: '') . '/';
$adminPanelUrl = ($basePath ?: '') . '/admin/panel';
$apiBaseUrl = ($basePath ?: '') . '/api/index.php';

header('X-Robots-Tag: noindex, nofollow', true);

if (!empty($_SESSION['bds_admin'])) {
    header('Location: ' . $adminPanelUrl);
    exit;
}
?>
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>Đăng Nhập Admin — Bích Động Lakeside</title>
<meta name="robots" content="noindex,nofollow" />
<base href="<?= htmlspecialchars($baseHref, ENT_QUOTES, 'UTF-8') ?>">
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" />
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#091018;
  --bg2:rgba(15,23,35,.9);
  --panel:#121b28;
  --border:rgba(148,163,184,.18);
  --text:#e2e8f0;
  --text2:#9fb0c5;
  --text3:#6f8298;
  --gold:#f6d365;
  --teal:#0d9488;
  --teal2:#14b8a6;
  --red:#ef4444;
  --shadow:0 24px 80px rgba(0,0,0,.45);
}
html,body{min-height:100%}
body{
  font-family:'Be Vietnam Pro',sans-serif;
  color:var(--text);
  background:
    radial-gradient(circle at top left, rgba(20,184,166,.14), transparent 35%),
    radial-gradient(circle at top right, rgba(246,211,101,.14), transparent 26%),
    linear-gradient(160deg, #081018 0%, #101a27 55%, #07111b 100%);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:32px 18px;
}
.shell{
  width:min(100%,1040px);
  display:grid;
  grid-template-columns:1.1fr .9fr;
  background:rgba(8,14,22,.72);
  border:1px solid rgba(255,255,255,.08);
  border-radius:28px;
  overflow:hidden;
  box-shadow:var(--shadow);
  backdrop-filter:blur(20px);
}
.hero{
  padding:46px 42px;
  background:
    linear-gradient(145deg, rgba(9,14,22,.72), rgba(9,14,22,.2)),
    url('frames/galley/PCTT 04_DAY.jpg') center/cover no-repeat;
  min-height:560px;
  position:relative;
}
.hero::after{
  content:'';
  position:absolute;
  inset:0;
  background:linear-gradient(180deg, rgba(5,10,15,.2), rgba(5,10,15,.75));
}
.hero-inner{position:relative;z-index:1;display:flex;flex-direction:column;height:100%}
.brand{
  display:flex;
  align-items:center;
  gap:14px;
  margin-bottom:38px;
}
.brand-mark{
  width:52px;
  height:52px;
  border-radius:16px;
  display:flex;
  align-items:center;
  justify-content:center;
  color:#fff;
  font-weight:700;
  font-size:20px;
  background:linear-gradient(135deg, var(--teal), var(--teal2));
  box-shadow:0 12px 28px rgba(13,148,136,.35);
}
.brand-copy small{
  display:block;
  font-size:11px;
  letter-spacing:.16em;
  text-transform:uppercase;
  color:var(--gold);
  font-weight:700;
}
.brand-copy strong{
  display:block;
  margin-top:6px;
  font-size:22px;
  letter-spacing:.02em;
}
.hero h1{
  font-size:42px;
  line-height:1.08;
  max-width:420px;
}
.hero p{
  margin-top:16px;
  max-width:420px;
  color:var(--text2);
  font-size:15px;
  line-height:1.7;
}
.hero-badges{
  margin-top:auto;
  display:flex;
  flex-wrap:wrap;
  gap:10px;
}
.hero-badge{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:10px 14px;
  border-radius:999px;
  background:rgba(10,17,26,.65);
  border:1px solid rgba(255,255,255,.1);
  color:var(--text);
  font-size:12px;
}
.login{
  padding:46px 38px;
  background:var(--panel);
  display:flex;
  align-items:center;
}
.login-card{width:100%}
.login-head small{
  display:block;
  color:var(--gold);
  font-size:11px;
  font-weight:700;
  letter-spacing:.18em;
  text-transform:uppercase;
}
.login-head h2{
  margin-top:12px;
  font-size:30px;
}
.login-head p{
  margin-top:10px;
  color:var(--text2);
  font-size:14px;
  line-height:1.65;
}
.form{
  margin-top:28px;
  display:grid;
  gap:16px;
}
.field label{
  display:block;
  margin-bottom:8px;
  color:var(--text2);
  font-size:12px;
  font-weight:600;
}
.input-wrap{
  position:relative;
}
.input-wrap i{
  position:absolute;
  left:14px;
  top:50%;
  transform:translateY(-50%);
  color:var(--text3);
}
.input{
  width:100%;
  border:1px solid var(--border);
  border-radius:14px;
  background:#0b1420;
  color:var(--text);
  padding:14px 16px 14px 42px;
  font:inherit;
  outline:none;
  transition:border-color .2s, box-shadow .2s, transform .2s;
}
.input:focus{
  border-color:rgba(20,184,166,.7);
  box-shadow:0 0 0 4px rgba(20,184,166,.12);
}
.row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  flex-wrap:wrap;
}
.hint{
  color:var(--text3);
  font-size:12px;
}
.btn{
  width:100%;
  border:none;
  border-radius:14px;
  padding:14px 18px;
  font:inherit;
  font-weight:700;
  cursor:pointer;
  color:#fff;
  background:linear-gradient(135deg, var(--teal), var(--teal2));
  box-shadow:0 14px 36px rgba(13,148,136,.35);
  transition:transform .18s ease, opacity .18s ease;
}
.btn:hover{transform:translateY(-1px)}
.btn:disabled{opacity:.7;cursor:wait;transform:none}
.alert{
  display:none;
  margin-top:16px;
  border-radius:14px;
  padding:12px 14px;
  font-size:13px;
  line-height:1.5;
}
.alert.show{display:block}
.alert.error{
  background:rgba(239,68,68,.12);
  border:1px solid rgba(239,68,68,.35);
  color:#fecaca;
}
.alert.success{
  background:rgba(34,197,94,.12);
  border:1px solid rgba(34,197,94,.35);
  color:#bbf7d0;
}
.login-actions{
  margin-top:22px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  flex-wrap:wrap;
}
.back-link{
  color:var(--text2);
  text-decoration:none;
  font-size:13px;
}
.back-link:hover{color:var(--text)}
.loading{
  margin-top:18px;
  color:var(--text3);
  font-size:12px;
}
@media (max-width:900px){
  .shell{grid-template-columns:1fr}
  .hero{min-height:360px;padding:32px 28px}
  .login{padding:32px 24px}
}
@media (max-width:560px){
  .hero h1{font-size:30px}
  .login-head h2{font-size:24px}
}
</style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="hero-inner">
        <div class="brand">
          <div class="brand-mark">BĐ</div>
          <div class="brand-copy">
            <small>Admin Login</small>
            <strong>Bích Động Lakeside</strong>
          </div>
        </div>
        <h1>Trang quản trị riêng cho nội dung và dữ liệu dự án.</h1>
        <p>Chỉ những người có tài khoản quản trị mới vào được khu vực chỉnh sửa media, hotspot, thư viện và cấu hình website.</p>
        <div class="hero-badges">
          <div class="hero-badge"><i class="fa-solid fa-shield-halved"></i> Session đăng nhập riêng</div>
          <div class="hero-badge"><i class="fa-solid fa-link-slash"></i> URL admin không lộ đuôi file</div>
          <div class="hero-badge"><i class="fa-solid fa-lock"></i> Gợi ý dùng mật khẩu mạnh</div>
        </div>
      </div>
    </section>

    <section class="login">
      <div class="login-card">
        <div class="login-head">
          <small>Bảo Mật Truy Cập</small>
          <h2>Đăng nhập quản trị</h2>
          <p>Nhập tài khoản quản trị đã cấu hình trong hệ thống để tiếp tục vào panel admin.</p>
        </div>

        <form class="form" id="login-form">
          <div class="field">
            <label for="username">Tài khoản</label>
            <div class="input-wrap">
              <i class="fa-solid fa-user"></i>
              <input class="input" id="username" name="username" type="text" autocomplete="username" placeholder="Nhập tài khoản admin" required />
            </div>
          </div>

          <div class="field">
            <label for="password">Mật khẩu</label>
            <div class="input-wrap">
              <i class="fa-solid fa-lock"></i>
              <input class="input" id="password" name="password" type="password" autocomplete="current-password" placeholder="Nhập mật khẩu" required />
            </div>
          </div>

          <div class="row">
            <div class="hint">Khuyên dùng tài khoản riêng và mật khẩu mạnh, không dùng mặc định.</div>
          </div>

          <button class="btn" id="login-btn" type="submit">Đăng nhập vào admin</button>
        </form>

        <div class="alert error" id="login-error"></div>
        <div class="alert success" id="login-success"></div>
        <div class="loading" id="login-loading">Đang kiểm tra phiên đăng nhập...</div>

        <div class="login-actions">
          <a class="back-link" href="index.html"><i class="fa-solid fa-arrow-left"></i> Quay lại website</a>
        </div>
      </div>
    </section>
  </div>

  <script>
  (function () {
    var API_BASE = <?= json_encode($apiBaseUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
    var ADMIN_PANEL_URL = <?= json_encode($adminPanelUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
    var form = document.getElementById('login-form');
    var btn = document.getElementById('login-btn');
    var errorBox = document.getElementById('login-error');
    var successBox = document.getElementById('login-success');
    var loading = document.getElementById('login-loading');

    function apiUrl(params) {
      return API_BASE + '?' + new URLSearchParams(params).toString();
    }

    function showError(message) {
      errorBox.textContent = message;
      errorBox.classList.add('show');
      successBox.classList.remove('show');
    }

    function showSuccess(message) {
      successBox.textContent = message;
      successBox.classList.add('show');
      errorBox.classList.remove('show');
    }

    function setBusy(isBusy) {
      btn.disabled = isBusy;
      btn.textContent = isBusy ? 'Đang đăng nhập...' : 'Đăng nhập vào admin';
    }

    fetch(apiUrl({ action: 'status' }), {
      cache: 'no-store',
      credentials: 'same-origin'
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      loading.textContent = '';
      if (data && data.authenticated) {
        window.location.replace(ADMIN_PANEL_URL);
      }
    }).catch(function () {
      loading.textContent = '';
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      errorBox.classList.remove('show');
      successBox.classList.remove('show');
      setBusy(true);

      var payload = {
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value
      };

      fetch(apiUrl({ action: 'login' }), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Đăng nhập thất bại');
          }
          return data;
        });
      }).then(function () {
        showSuccess('Đăng nhập thành công, đang chuyển vào trang quản trị...');
        window.setTimeout(function () {
          window.location.replace(ADMIN_PANEL_URL);
        }, 450);
      }).catch(function (error) {
        showError(error.message || 'Không thể đăng nhập.');
      }).finally(function () {
        setBusy(false);
      });
    });
  })();
  </script>
</body>
</html>
