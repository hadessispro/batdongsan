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
$adminLoginUrl = ($basePath ?: '') . '/admin';
$baseHref = ($basePath ?: '') . '/';

header('X-Robots-Tag: noindex, nofollow', true);

if (empty($_SESSION['bds_admin'])) {
    header('Location: ' . $adminLoginUrl);
    exit;
}
?>
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Admin Panel — Bích Động Lakeside</title>
<meta name="robots" content="noindex,nofollow"/>
<base href="<?= htmlspecialchars($baseHref, ENT_QUOTES, 'UTF-8') ?>">
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css"/>
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0c1117;--bg2:#151b23;--bg3:#1c2330;--bg4:#242c38;
  --border:#2a3343;--border2:#354155;
  --text:#e2e8f0;--text2:#94a3b8;--text3:#64748b;
  --gold:#f6e493;--gold2:#c9a96e;
  --teal:#0d9488;--teal2:#14b8a6;
  --cyan:#22d3ee;--red:#ef4444;--green:#22c55e;--blue:#3b82f6;
  --sidebar-w:260px;
  --header-h:60px;
}
html,body{height:100%;overflow:hidden}
body{font-family:'Be Vietnam Pro',sans-serif;background:var(--bg);color:var(--text);display:flex}

/* ═══ SIDEBAR ═══ */
.sidebar{width:var(--sidebar-w);height:100vh;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;z-index:100;transition:transform .3s ease}
.sidebar-brand{padding:20px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px}
.sidebar-brand .logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--teal),var(--teal2));display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;font-weight:700}
.sidebar-brand h1{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gold)}
.sidebar-brand span{font-size:10px;color:var(--text3);font-weight:400;display:block;margin-top:2px;letter-spacing:.02em}
.sidebar-nav{flex:1;padding:16px 12px;overflow-y:auto}
.nav-section{margin-bottom:20px}
.nav-section-title{font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--text3);padding:0 10px 8px;display:flex;align-items:center;gap:6px}
.nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:500;color:var(--text2);transition:all .2s;margin-bottom:2px;position:relative}
.nav-item:hover{background:var(--bg3);color:var(--text)}
.nav-item.active{background:rgba(13,148,136,.12);color:var(--teal2);font-weight:600}
.nav-item.active::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:3px;height:20px;background:var(--teal2);border-radius:0 3px 3px 0}
.nav-item i{width:18px;text-align:center;font-size:13px;opacity:.7}
.nav-item.active i{opacity:1}
.nav-badge{margin-left:auto;background:var(--teal);color:#fff;font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px}
.sidebar-footer{padding:14px 16px;border-top:1px solid var(--border);font-size:10px;color:var(--text3);display:flex;align-items:center;gap:8px}
.sidebar-footer .status-dot{width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0}

/* ═══ MAIN ═══ */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden}
.header{height:var(--header-h);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 24px;gap:16px;flex-shrink:0;background:var(--bg2)}
.header .breadcrumb{font-size:12px;color:var(--text3)}
.header .breadcrumb b{color:var(--text);font-weight:600}
.btn-mobile-menu{display:none;background:none;border:none;color:var(--text);font-size:18px;cursor:pointer;padding:8px}
.header-actions{margin-left:auto;display:flex;gap:10px;align-items:center}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text);transition:all .2s}
.btn:hover{background:var(--bg4);border-color:var(--border2)}
.btn-primary{background:var(--teal);border-color:var(--teal);color:#fff}
.btn-primary:hover{background:var(--teal2)}
.btn-danger{background:var(--red);border-color:var(--red);color:#fff}
.btn-sm{padding:6px 12px;font-size:10px}
.content{flex:1;overflow-y:auto;padding:24px}

/* ═══ DASHBOARD CARDS ═══ */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:28px}
.stat-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px;transition:all .3s}
.stat-card:hover{border-color:var(--border2);transform:translateY(-2px)}
.stat-card .stat-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;margin-bottom:12px}
.stat-card .stat-value{font-size:26px;font-weight:700;margin-bottom:4px}
.stat-card .stat-label{font-size:11px;color:var(--text3);font-weight:500;text-transform:uppercase;letter-spacing:.08em}

/* ═══ PANELS ═══ */
.panel{background:var(--bg2);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px}
.panel-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)}
.panel-head h3{font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px}
.panel-head h3 i{color:var(--teal2);font-size:13px}
.panel-body{padding:20px}

/* ═══ FILE BROWSER ═══ */
.path-bar{display:flex;align-items:center;gap:8px;padding:12px 16px;background:var(--bg);border-radius:8px;margin-bottom:16px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text2);overflow-x:auto;white-space:nowrap}
.path-bar .path-seg{cursor:pointer;color:var(--cyan);transition:color .2s}
.path-bar .path-seg:hover{color:var(--gold);text-decoration:underline}
.path-bar .path-sep{color:var(--text3);margin:0 2px}

.file-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.file-item{background:var(--bg3);border:1px solid var(--border);border-radius:10px;overflow:hidden;cursor:pointer;transition:all .25s;position:relative}
.file-item:hover{border-color:var(--teal);transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.3)}
.file-item.selected{border-color:var(--cyan);box-shadow:0 0 0 2px rgba(34,211,238,.2)}
.file-thumb{width:100%;aspect-ratio:1;background:var(--bg);display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}
.file-thumb img{width:100%;height:100%;object-fit:cover}
.file-thumb .folder-icon{font-size:36px;color:var(--gold2)}
.file-thumb .file-icon{font-size:28px;color:var(--text3)}
.file-info{padding:8px 10px}
.file-info .file-name{font-size:10px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.file-info .file-size{font-size:9px;color:var(--text3);margin-top:2px}
.file-check{position:absolute;top:6px;right:6px;width:20px;height:20px;border-radius:50%;border:2px solid rgba(255,255,255,.3);background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s}
.file-item:hover .file-check,.file-item.selected .file-check{opacity:1}
.file-item.selected .file-check{background:var(--cyan);border-color:var(--cyan)}
.file-item.selected .file-check::after{content:'✓';color:#000;font-size:11px;font-weight:700}
.file-actions{position:absolute;top:6px;right:6px;display:flex;gap:5px;opacity:0;transition:opacity .2s;z-index:3}
.file-item:hover .file-actions{opacity:1}
.file-action{width:24px;height:24px;border-radius:7px;border:1px solid rgba(255,255,255,.12);background:rgba(10,15,22,.82);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px}
.file-action:hover{background:var(--bg4)}
.file-action.delete:hover{background:var(--red);border-color:var(--red);color:#fff}

/* ═══ IMAGE PREVIEW MODAL ═══ */
.modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.8);z-index:500;display:none;align-items:center;justify-content:center;backdrop-filter:blur(8px)}
.modal-overlay.open{display:flex}
.modal-box{background:var(--bg2);border:1px solid var(--border);border-radius:16px;max-width:800px;width:90%;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;animation:modalIn .3s ease}
@keyframes modalIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
.modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)}
.modal-header h4{font-size:14px;font-weight:600}
.modal-close{background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;padding:4px;transition:color .2s}
.modal-close:hover{color:var(--text)}
.modal-body{padding:20px;overflow-y:auto;flex:1}
.preview-img,.preview-video,.preview-frame{width:100%;max-height:58vh;object-fit:contain;border-radius:8px;background:var(--bg);margin-bottom:16px}
.preview-video{height:auto}
.preview-frame{height:58vh;border:0}
.preview-empty{padding:40px 16px;text-align:center;color:var(--text3);background:var(--bg);border-radius:8px;margin-bottom:16px}
.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.meta-item{background:var(--bg);border-radius:8px;padding:10px 14px}
.meta-item .meta-label{font-size:9px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
.meta-item .meta-value{font-size:12px;font-weight:500;color:var(--text);font-family:'JetBrains Mono',monospace;word-break:break-all}

/* ═══ ALBUM MANAGER ═══ */
.album-list{display:flex;flex-direction:column;gap:12px}
.album-card{background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:16px;transition:all .2s}
.album-card:hover{border-color:var(--border2)}
.album-card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.album-card-head h4{font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px}
.album-card-head h4 i{color:var(--gold2);font-size:12px}
.album-thumbs{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
.album-thumbs::-webkit-scrollbar{height:4px}
.album-thumbs::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
.album-thumb{width:64px;height:48px;border-radius:6px;overflow:hidden;flex-shrink:0;border:1px solid var(--border);position:relative}
.album-thumb img{width:100%;height:100%;object-fit:cover}
.album-thumb .remove-thumb{position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:var(--red);color:#fff;font-size:8px;display:none;align-items:center;justify-content:center;cursor:pointer;border:none}
.album-thumb:hover .remove-thumb{display:flex}
.album-count{font-size:10px;color:var(--text3);margin-top:8px}

/* ═══ JSON EDITOR ═══ */
.json-editor{width:100%;min-height:300px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--cyan);line-height:1.6;resize:vertical;outline:none;tab-size:2}
.json-editor:focus{border-color:var(--teal)}

/* ═══ TOOLBAR ═══ */
.toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.toolbar .search-box{flex:1;min-width:200px;display:flex;align-items:center;gap:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px}
.toolbar .search-box input{flex:1;background:none;border:none;outline:none;font-family:inherit;font-size:12px;color:var(--text)}
.toolbar .search-box i{color:var(--text3);font-size:13px}
.view-toggle{display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden}
.view-toggle button{background:var(--bg3);border:none;color:var(--text3);padding:7px 10px;cursor:pointer;font-size:12px;transition:all .2s}
.view-toggle button.active{background:var(--teal);color:#fff}

/* ═══ TABLE ═══ */
.data-table{width:100%;border-collapse:collapse}
.data-table th{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);text-align:left;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--bg)}
.data-table td{font-size:12px;padding:10px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
.data-table tr:hover td{background:var(--bg3)}
.data-table .thumb-cell img{width:40px;height:30px;object-fit:cover;border-radius:4px;border:1px solid var(--border)}
.data-table input,.data-table select{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:12px;padding:8px 10px;outline:none}
.data-table input:focus,.data-table select:focus{border-color:var(--teal)}
.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.field label{font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;display:block;margin-bottom:6px}
.field input,.field textarea,.field select{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:12px;padding:10px 12px;outline:none}
.field input:focus,.field textarea:focus,.field select:focus{border-color:var(--teal)}
.coord-row{display:grid;grid-template-columns:1fr 1fr 80px;gap:8px;align-items:center;margin-bottom:8px}
.tool-frame{width:100%;height:72vh;min-height:560px;border:1px solid var(--border);border-radius:10px;background:var(--bg);display:block}

/* ═══ TOAST ═══ */
.toast{position:fixed;bottom:24px;right:24px;z-index:600;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 20px;font-size:12px;font-weight:500;color:var(--text);display:none;align-items:center;gap:10px;box-shadow:0 8px 32px rgba(0,0,0,.4);animation:toastIn .3s ease}
.toast.show{display:flex}
.toast.success{border-color:var(--green)}
.toast.success i{color:var(--green)}
.toast.error{border-color:var(--red)}
.toast.error i{color:var(--red)}
@keyframes toastIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}

/* ═══ SCROLLBAR ═══ */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:var(--border2)}

/* ═══ PAGE SECTIONS (hide/show) ═══ */
.page{display:none}
.page.active{display:block}

/* ═══ EMPTY STATE ═══ */
.empty-state{text-align:center;padding:60px 20px;color:var(--text3)}
.empty-state i{font-size:40px;margin-bottom:16px;opacity:.3}
.empty-state p{font-size:13px}

/* ═══ RESPONSIVE ═══ */
@media(max-width:900px){
  .sidebar{position:fixed;left:0;top:0;transform:translateX(-100%);z-index:200;box-shadow:4px 0 24px rgba(0,0,0,.4)}
  .sidebar.open{transform:translateX(0)}
  .btn-mobile-menu{display:block}
  .stats-grid{grid-template-columns:repeat(2,1fr)}
  .file-grid{grid-template-columns:repeat(auto-fill,minmax(110px,1fr))}
  .meta-grid{grid-template-columns:1fr}
  .modal-box{width:95%;max-height:85vh}
}
@media(max-width:480px){
  .stats-grid{grid-template-columns:1fr}
  .content{padding:16px}
}
</style>
</head>
<body>

<!-- ═══ SIDEBAR ═══ -->
<aside class="sidebar" id="sidebar">
  <div class="sidebar-brand">
    <div class="logo">BĐ</div>
    <div>
      <h1>Admin Panel</h1>
      <span>Bích Động Lakeside</span>
    </div>
  </div>
  <nav class="sidebar-nav">
    <div class="nav-section">
      <div class="nav-section-title"><i class="fa-solid fa-gauge"></i> TỔNG QUAN</div>
      <div class="nav-item active" data-page="dashboard"><i class="fa-solid fa-chart-pie"></i> Dashboard</div>
    </div>
    <div class="nav-section">
      <div class="nav-section-title"><i class="fa-solid fa-photo-film"></i> NỘI DUNG</div>
      <div class="nav-item" data-page="file-browser"><i class="fa-solid fa-folder-open"></i> Quản lý File <span class="nav-badge">NEW</span></div>
      <div class="nav-item" data-page="albums"><i class="fa-solid fa-images"></i> Album / Thư Viện</div>
      <div class="nav-item" data-page="vr-config"><i class="fa-solid fa-vr-cardboard"></i> VR 360° Config</div>
      <div class="nav-item" data-page="hotspot-editor"><i class="fa-solid fa-crosshairs"></i> Hotspot Editor</div>
      <div class="nav-item" data-page="thamquan-config"><i class="fa-solid fa-street-view"></i> Tham quan 360</div>
      <div class="nav-item" data-page="masterplan"><i class="fa-solid fa-map-location-dot"></i> Master Plan</div>
    </div>
    <div class="nav-section">
      <div class="nav-section-title"><i class="fa-solid fa-sliders"></i> CÀI ĐẶT</div>
      <div class="nav-item" data-page="settings"><i class="fa-solid fa-gear"></i> Cài đặt chung</div>
      <div class="nav-item" data-page="json-editor"><i class="fa-solid fa-code"></i> JSON Editor</div>
    </div>
  </nav>
  <div class="sidebar-footer">
    <div class="status-dot"></div> Hệ thống hoạt động bình thường
  </div>
</aside>

<!-- ═══ MAIN CONTENT ═══ -->
<div class="main">
  <header class="header">
    <button class="btn-mobile-menu" id="btn-menu"><i class="fa-solid fa-bars"></i></button>
    <div class="breadcrumb" id="breadcrumb">Admin / <b>Dashboard</b></div>
    <div class="header-actions">
      <a href="index.html" target="_blank" class="btn btn-sm"><i class="fa-solid fa-external-link-alt"></i> Xem Website</a>
      <button type="button" class="btn btn-sm" onclick="logoutAdmin()"><i class="fa-solid fa-right-from-bracket"></i> Đăng xuất</button>
    </div>
  </header>

  <div class="content" id="content">

    <!-- ═══ PAGE: DASHBOARD ═══ -->
    <div class="page active" id="page-dashboard">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(13,148,136,.12);color:var(--teal2)"><i class="fa-solid fa-images"></i></div>
          <div class="stat-value" id="stat-images">—</div>
          <div class="stat-label">Tổng hình ảnh</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(246,228,147,.1);color:var(--gold)"><i class="fa-solid fa-layer-group"></i></div>
          <div class="stat-value" id="stat-albums">5</div>
          <div class="stat-label">Album thư viện</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(59,130,246,.1);color:var(--blue)"><i class="fa-solid fa-street-view"></i></div>
          <div class="stat-value" id="stat-panos">17</div>
          <div class="stat-label">PANO 360°</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(239,68,68,.1);color:var(--red)"><i class="fa-solid fa-crosshairs"></i></div>
          <div class="stat-value" id="stat-hotspots">—</div>
          <div class="stat-label">Hotspots</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3><i class="fa-solid fa-folder-tree"></i> Cấu trúc thư mục</h3></div>
        <div class="panel-body">
          <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text2);line-height:2">
            <div><i class="fa-solid fa-folder" style="color:var(--gold2)"></i> <b>frames/</b></div>
            <div style="padding-left:20px"><i class="fa-solid fa-folder" style="color:var(--gold2)"></i> 3dvr/ <span style="color:var(--text3)">— Ảnh PANO 360° (17 files)</span></div>
            <div style="padding-left:20px"><i class="fa-solid fa-folder" style="color:var(--gold2)"></i> day/ <span style="color:var(--text3)">— Frames ngày (75 files)</span></div>
            <div style="padding-left:20px"><i class="fa-solid fa-folder" style="color:var(--gold2)"></i> night/ <span style="color:var(--text3)">— Frames đêm (75 files)</span></div>
            <div style="padding-left:20px"><i class="fa-solid fa-folder" style="color:var(--gold2)"></i> galley/ <span style="color:var(--text3)">— Thư viện ảnh + video</span></div>
            <div style="padding-left:20px"><i class="fa-solid fa-folder" style="color:var(--gold2)"></i> matbang/ <span style="color:var(--text3)">— Ảnh mặt bằng + SVG</span></div>
            <div style="padding-left:20px"><i class="fa-solid fa-folder" style="color:var(--gold2)"></i> phankhu/ <span style="color:var(--text3)">— Ảnh phân khu + SVG</span></div>
            <div style="padding-left:20px"><i class="fa-solid fa-folder" style="color:var(--gold2)"></i> tienich/ <span style="color:var(--text3)">— PANO tham quan</span></div>
            <div style="padding-left:20px"><i class="fa-solid fa-folder" style="color:var(--gold2)"></i> brochur/ <span style="color:var(--text3)">— PDF brochure</span></div>
            <div><i class="fa-solid fa-folder" style="color:var(--gold2)"></i> <b>data/</b> <span style="color:var(--text3)">— JSON config files</span></div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3><i class="fa-solid fa-clock-rotate-left"></i> Hành động nhanh</h3></div>
        <div class="panel-body" style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" onclick="switchPage('file-browser')"><i class="fa-solid fa-folder-open"></i> Duyệt File</button>
          <button class="btn" onclick="switchPage('albums')"><i class="fa-solid fa-images"></i> Quản lý Album</button>
          <button class="btn" onclick="switchPage('vr-config')"><i class="fa-solid fa-vr-cardboard"></i> Chỉnh VR Config</button>
          <button class="btn" onclick="switchPage('json-editor')"><i class="fa-solid fa-code"></i> Sửa JSON</button>
          <a href="frames/3dvr/vr-hotspot-editor.html" target="_blank" class="btn"><i class="fa-solid fa-crosshairs"></i> Hotspot Editor (External)</a>
        </div>
      </div>
    </div>

    <!-- ═══ PAGE: FILE BROWSER ═══ -->
    <div class="page" id="page-file-browser">
      <div class="toolbar">
        <div class="search-box"><i class="fa-solid fa-search"></i><input type="text" placeholder="Tìm file..." id="file-search"/></div>
        <input type="file" id="file-upload-input" accept="image/*,video/mp4,video/webm,video/quicktime,application/pdf" style="display:none"/>
        <button class="btn btn-primary" onclick="document.getElementById('file-upload-input').click()"><i class="fa-solid fa-upload"></i> Upload media</button>
        <div class="view-toggle">
          <button class="active" id="view-grid" onclick="setView('grid')"><i class="fa-solid fa-grid-2"></i></button>
          <button id="view-list" onclick="setView('list')"><i class="fa-solid fa-list"></i></button>
        </div>
        <select class="btn" id="filter-type" style="padding:7px 12px;font-size:11px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:8px">
          <option value="all">Tất cả</option>
          <option value="image">Ảnh</option>
          <option value="video">Video</option>
          <option value="pdf">PDF</option>
          <option value="folder">Thư mục</option>
        </select>
      </div>
      <div class="path-bar" id="path-bar"></div>
      <div id="file-container"></div>
    </div>

    <!-- ═══ PAGE: ALBUMS ═══ -->
    <div class="page" id="page-albums">
      <div class="panel">
        <div class="panel-head">
          <h3><i class="fa-solid fa-images"></i> Quản lý Album Thư Viện</h3>
          <button class="btn btn-primary btn-sm" onclick="addAlbum()"><i class="fa-solid fa-plus"></i> Thêm Album</button>
        </div>
        <div class="panel-body">
          <input type="file" id="library-upload-input" style="display:none"/>
          <div class="album-list" id="album-list"></div>
          <div style="margin-top:18px;display:flex;gap:10px;align-items:center">
            <button class="btn btn-primary" onclick="saveLibraryData()"><i class="fa-solid fa-save"></i> Lưu thư viện</button>
            <button class="btn" onclick="addVideoItem()"><i class="fa-solid fa-video"></i> Chọn video đã upload</button>
            <button class="btn" onclick="uploadLibraryVideo()"><i class="fa-solid fa-upload"></i> Upload & thêm video</button>
          </div>
          <div id="video-picker" style="margin-top:12px;display:none"></div>
          <div id="video-list" style="margin-top:16px"></div>
        </div>
      </div>
    </div>

    <!-- ═══ PAGE: VR CONFIG ═══ -->
    <div class="page" id="page-vr-config">
      <div class="panel">
        <div class="panel-head">
          <h3><i class="fa-solid fa-vr-cardboard"></i> VR 360° — Cấu hình tiện ích</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <a class="btn btn-sm" href="frames/3dvr/vr-hotspot-editor.html" target="_blank"><i class="fa-solid fa-up-right-from-square"></i> Mở Visual Editor</a>
            <button class="btn btn-primary btn-sm" onclick="saveVRConfig()"><i class="fa-solid fa-save"></i> Lưu thay đổi</button>
          </div>
        </div>
        <div class="panel-body">
          <p style="font-size:12px;color:var(--text3);margin-bottom:16px">Ưu tiên dùng <a href="frames/3dvr/vr-hotspot-editor.html" target="_blank" style="color:var(--cyan)">Visual Editor</a> để đặt hotspot và dùng góc nhìn hiện tại. Bảng lon/lat/FOV bên dưới chỉ là chỉnh nâng cao khi cần nhập số chính xác.</p>
          <details>
            <summary style="cursor:pointer;color:var(--text2);font-size:12px;margin-bottom:10px">Mở bảng số lon/lat/FOV nâng cao</summary>
            <div id="vr-config-table"></div>
          </details>
        </div>
      </div>
    </div>

    <!-- ═══ PAGE: HOTSPOT EDITOR ═══ -->
    <div class="page" id="page-hotspot-editor">
      <div class="panel">
        <div class="panel-head"><h3><i class="fa-solid fa-crosshairs"></i> Hotspot Editor</h3></div>
        <div class="panel-body">
          <p style="font-size:12px;color:var(--text3);margin-bottom:16px">Dữ liệu từ <code style="color:var(--cyan)">vr-hotspot-data.json</code>. Bạn cũng có thể dùng <a href="frames/3dvr/vr-hotspot-editor.html" target="_blank" style="color:var(--cyan)">Hotspot Visual Editor</a> để chỉnh bằng giao diện.</p>
          <div id="hotspot-summary"></div>
          <textarea class="json-editor" id="hotspot-json" placeholder="Đang tải..."></textarea>
          <div style="margin-top:12px;display:flex;gap:10px">
            <button class="btn btn-primary" onclick="saveHotspotJSON()"><i class="fa-solid fa-save"></i> Lưu JSON</button>
            <button class="btn" onclick="copyToClipboard('hotspot-json')"><i class="fa-solid fa-copy"></i> Copy</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ PAGE: THAM QUAN CONFIG ═══ -->
    <div class="page" id="page-thamquan-config">
      <div class="panel">
        <div class="panel-head">
          <h3><i class="fa-solid fa-street-view"></i> Tham quan 360 — Hotspot & chữ nổi</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <a class="btn btn-sm" href="frames/thamquan/hotspot-editor.html" target="_blank"><i class="fa-solid fa-up-right-from-square"></i> Mở full tool</a>
            <button class="btn btn-primary btn-sm" onclick="saveThamQuanConfig()"><i class="fa-solid fa-save"></i> Lưu form nâng cao</button>
          </div>
        </div>
        <div class="panel-body">
          <iframe class="tool-frame" src="frames/thamquan/hotspot-editor.html" title="Tham quan 360 Hotspot Editor"></iframe>
          <details style="margin-top:16px">
            <summary style="cursor:pointer;color:var(--text2);font-size:12px;margin-bottom:10px">Mở form số liệu nâng cao/dự phòng</summary>
            <div style="margin:0 0 10px;font-size:12px;color:var(--text3)">Người dùng lowtech chỉ cần thao tác trong tool 360 ở trên rồi bấm lưu. Phần này dùng khi cần sửa JSON/bảng số trực tiếp.</div>
            <div class="form-grid" style="margin-bottom:16px">
              <div class="field">
                <label>Ảnh pano tham quan</label>
                <input id="thamquan-pano-src" placeholder="frames/tienich/PANO_1_1.jpg"/>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
              <p style="font-size:12px;color:var(--text3)">Hotspot dùng tọa độ pixel trên ảnh pano 2000×1000.</p>
              <button class="btn btn-sm" onclick="addThamQuanHotspot()"><i class="fa-solid fa-plus"></i> Thêm hotspot</button>
            </div>
            <div id="thamquan-hotspot-table"></div>
            <div style="font-size:12px;color:var(--text2);margin:16px 0 8px">Chữ 3D JSON</div>
            <textarea class="json-editor" id="thamquan-texts-json" style="min-height:220px"></textarea>
          </details>
        </div>
      </div>
    </div>

    <!-- ═══ PAGE: MASTER PLAN ═══ -->
    <div class="page" id="page-masterplan">
      <div class="panel">
        <div class="panel-head"><h3><i class="fa-solid fa-map-location-dot"></i> Master Plan — Vị trí tiện ích</h3></div>
        <div class="panel-body">
          <p style="font-size:12px;color:var(--text3);margin-bottom:16px">Chỉnh top/left (%) cho từng tiện ích trên bản đồ tổng quan. Dữ liệu từ <code style="color:var(--cyan)">masterplan.json</code></p>
          <div id="masterplan-form" style="margin-bottom:14px"></div>
          <details>
            <summary style="cursor:pointer;color:var(--text2);font-size:12px;margin-bottom:10px">Mở JSON nâng cao</summary>
            <textarea class="json-editor" id="masterplan-json" placeholder="Đang tải..."></textarea>
          </details>
          <div style="margin-top:12px;display:flex;gap:10px">
            <button class="btn btn-primary" onclick="saveMasterplanForm()"><i class="fa-solid fa-save"></i> Lưu form</button>
            <button class="btn" onclick="saveMasterplanJSON()"><i class="fa-solid fa-code"></i> Lưu JSON</button>
            <button class="btn" onclick="copyToClipboard('masterplan-json')"><i class="fa-solid fa-copy"></i> Copy</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ PAGE: SETTINGS ═══ -->
    <div class="page" id="page-settings">
      <div class="panel">
        <div class="panel-head"><h3><i class="fa-solid fa-gear"></i> Cài đặt chung</h3></div>
        <div class="panel-body">
          <div style="display:grid;gap:16px;max-width:500px">
            <div>
              <label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:6px">Tên dự án</label>
              <input type="text" value="BÍCH ĐỘNG LAKESIDE" style="width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:13px;outline:none"/>
            </div>
            <div>
              <label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:6px">Hotline</label>
              <input type="text" value="0123456789" style="width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:13px;outline:none"/>
            </div>
            <div>
              <label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:6px">Favicon (path)</label>
              <input type="text" value="favicon.webp" style="width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:13px;outline:none"/>
            </div>
            <button class="btn btn-primary" style="width:fit-content"><i class="fa-solid fa-save"></i> Lưu cài đặt</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ PAGE: JSON EDITOR ═══ -->
    <div class="page" id="page-json-editor">
      <div class="panel">
        <div class="panel-head">
          <h3><i class="fa-solid fa-code"></i> JSON Editor — Sửa trực tiếp</h3>
          <select class="btn btn-sm" id="json-file-select" onchange="loadJSONFile(this.value)">
            <option value="">— Chọn file —</option>
            <option value="vr-hotspot-data.json">vr-hotspot-data.json</option>
            <option value="vr_config.json">vr_config.json</option>
            <option value="masterplan.json">masterplan.json</option>
            <option value="buildings.json">buildings.json</option>
            <option value="data/library.json">data/library.json</option>
            <option value="data/vitri_config.json">data/vitri_config.json</option>
            <option value="data/thamquan_config.json">data/thamquan_config.json</option>
            <option value="frames/matbang/lot-data.json">frames/matbang/lot-data.json</option>
          </select>
        </div>
        <div class="panel-body">
          <textarea class="json-editor" id="json-editor-main" placeholder="Chọn file JSON ở trên để bắt đầu chỉnh sửa..." style="min-height:450px"></textarea>
          <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
            <button class="btn btn-primary" onclick="validateJSON()"><i class="fa-solid fa-check"></i> Validate JSON</button>
            <button class="btn" onclick="formatJSON()"><i class="fa-solid fa-wand-magic-sparkles"></i> Format</button>
            <button class="btn" onclick="saveJSONFile()"><i class="fa-solid fa-save"></i> Lưu file</button>
            <button class="btn" onclick="copyToClipboard('json-editor-main')"><i class="fa-solid fa-copy"></i> Copy</button>
            <span id="json-status" style="font-size:11px;margin-left:8px"></span>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>

<!-- ═══ IMAGE PREVIEW MODAL ═══ -->
<div class="modal-overlay" id="preview-modal">
  <div class="modal-box">
    <div class="modal-header">
      <h4 id="preview-title">Preview</h4>
      <button class="modal-close" onclick="closePreview()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <div id="preview-media"></div>
      <div class="meta-grid" id="preview-meta"></div>
    </div>
  </div>
</div>

<!-- ═══ TOAST ═══ -->
<div class="toast" id="toast"><i class="fa-solid fa-check-circle"></i><span id="toast-text"></span></div>

<script>
// ═══════════════════════════════════════════════════════════
//  ADMIN PANEL — Bích Động Lakeside
// ═══════════════════════════════════════════════════════════

var API_BASE = 'api/index.php';
var ADMIN_LOGIN_URL = <?= json_encode($adminLoginUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
  var JSON_RESOURCES = {
  'vr-hotspot-data.json': 'vr-hotspots',
  'vr_config.json': 'vr-config',
  'masterplan.json': 'masterplan',
  'buildings.json': 'buildings',
  'library.json': 'library',
  'data/library.json': 'library',
  'vitri_config.json': 'vitri-config',
  'data/vitri_config.json': 'vitri-config',
  'thamquan_config.json': 'thamquan-config',
  'data/thamquan_config.json': 'thamquan-config',
  'frames/matbang/lot-data.json': 'lots',
  'lot-data.json': 'lots'
};
var currentJsonResource = '';
var currentHotspotData = null;
var currentMasterplanData = {};
var currentThamQuanConfig = { panoSrc: '', hotspots: [], texts: [] };

function apiUrl(params) {
  return API_BASE + '?' + new URLSearchParams(params).toString();
}

function getResourceForFile(filename) {
  return JSON_RESOURCES[filename] || JSON_RESOURCES[filename.replace(/^data\//, '')] || '';
}

function apiFetch(resource) {
  return fetch(apiUrl({ resource: resource }), { cache: 'no-store', credentials: 'same-origin' })
    .then(function(r) { return r.json().then(function(data) { if (!r.ok || !data.ok) throw new Error(data.error || 'API error'); return data.data; }); });
}

function apiLogin() {
  var username = prompt('Admin user:', 'admin');
  if (!username) return Promise.reject(new Error('Đã hủy đăng nhập'));
  var password = prompt('Admin password:');
  if (!password) return Promise.reject(new Error('Đã hủy đăng nhập'));
  return fetch(apiUrl({ action: 'login' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ username: username, password: password })
  }).then(function(r) {
    return r.json().then(function(data) {
      if (!r.ok || !data.ok) throw new Error(data.error || 'Đăng nhập thất bại');
      showToast('Đã đăng nhập admin', 'success');
      return data;
    });
  });
}

function apiSave(resource, data, retry) {
  return fetch(apiUrl({ resource: resource }), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ data: data })
  }).then(function(r) {
    return r.json().then(function(result) {
      if (r.status === 401 && retry !== false) {
        return apiLogin().then(function() { return apiSave(resource, data, false); });
      }
      if (!r.ok || !result.ok) throw new Error(result.error || 'Không lưu được dữ liệu');
      return result;
    });
  });
}

function parseJsonFromTextarea(id) {
  return JSON.parse(document.getElementById(id).value);
}

function escapeHTML(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
  });
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  var units = ['B', 'KB', 'MB', 'GB'];
  var size = Number(bytes) || 0;
  var i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return (i === 0 ? size : size.toFixed(size >= 10 ? 1 : 2)) + ' ' + units[i];
}

function apiListFiles(path) {
  return fetch(apiUrl({ action: 'list-files', path: path || '' }), { cache: 'no-store', credentials: 'same-origin' })
    .then(function(r) { return r.json().then(function(data) { if (!r.ok || !data.ok) throw new Error(data.error || 'Không tải được danh sách file'); return data.items || []; }); });
}

function apiUploadFile(path, file, retry) {
  var body = new FormData();
  body.append('path', path || 'frames/galley');
  body.append('file', file);
  return fetch(apiUrl({ action: 'upload' }), {
    method: 'POST',
    credentials: 'same-origin',
    body: body
  }).then(function(r) {
    return r.json().then(function(data) {
      if (r.status === 401 && retry !== false) {
        return apiLogin().then(function() { return apiUploadFile(path, file, false); });
      }
      if (!r.ok || !data.ok) throw new Error(data.error || 'Upload thất bại');
      return data.file;
    });
  });
}

function apiDeleteFile(path, retry) {
  return fetch(apiUrl({ action: 'delete-file' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ path: path })
  }).then(function(r) {
    return r.json().then(function(data) {
      if (r.status === 401 && retry !== false) {
        return apiLogin().then(function() { return apiDeleteFile(path, false); });
      }
      if (!r.ok || !data.ok) throw new Error(data.error || 'Không xóa được file');
      return data;
    });
  });
}

// ── File system data (simulated from hosting structure) ──
var FILE_TREE = {
  'frames': {
    _type: 'folder',
    '3dvr': { _type: 'folder', _files: [
      'PANO_1_2.jpg','PANO_02_3.jpg','PANO_03_3.jpg','PANO_04_3.jpg','PANO_05_3.jpg',
      'PANO_06_3.jpg','PANO_07_4.jpg','PANO_08_4.jpg','PANO_09_3.jpg','PANO_11_3.jpg',
      'PANO_12_3.jpg','PANO_13_3.jpg','PANO_14_3.jpg','PANO_15_3.jpg','PANO_16_3.jpg','PANO_17.jpg'
    ]},
    'day': { _type: 'folder', _count: 75, _pattern: 'PANO_{N}_XXXX.webp' },
    'night': { _type: 'folder', _count: 75, _pattern: 'PANO_{N}_XXXX.webp' },
    'galley': { _type: 'folder', _files: [
      '6.jpg','7.jpg','8.jpg','9.jpg','10.jpg','11.jpg','12.jpg','13.jpg',
      '14.jpg','15.jpg','16.jpg','17.jpg','18.jpg','19.jpg','20.jpg','21.jpg',
      '22.jpg','23.jpg','24.jpg','PCTT 01.jpg','PCTT 02.jpg','PCTT 03.jpg',
      'PCTT 04_DAY.jpg','PCTT 04_NIGHT.jpg','vitriicon.jpg'
    ]},
    'matbang': { _type: 'folder', _files: ['matbangbackground.jpg','matbang.svg','lot-data.json'] },
    'phankhu': { _type: 'folder', _files: ['2.1.jpg','phankhu.svg'] },
    'tienich': { _type: 'folder', _files: ['PANO_1_1.jpg'] },
    'thamquan': { _type: 'folder', _files: [] },
    'brochur': { _type: 'folder', _files: [] },
    'iconmenu': { _type: 'folder', _files: [] },
    '_files': ['logo.png','logo1.png','masterplan.png']
  },
  'data': {
    _type: 'folder',
    _files: ['vr_config.json','masterplan.json','buildings.json','library.json','vitri_config.json']
  },
  '_root': ['index.html','main.js','matbang.js','thamquan-vr360.js','style.css',
    'matbang-info.css','thamquan-vr360.css','vitri.css','vitri.js',
    'vr-hotspot-data.json','favicon.webp','vr-hotspot-editor.html','.htaccess']
};

var ALBUMS = [
  { title: 'Phối Cảnh Tổng Quan', images: ['frames/galley/8.jpg','frames/galley/PCTT 01.jpg','frames/galley/PCTT 02.jpg','frames/galley/PCTT 03.jpg','frames/galley/PCTT 04_DAY.jpg','frames/galley/PCTT 04_NIGHT.jpg'] },
  { title: 'Shophouse 01', images: ['frames/galley/18.jpg','frames/galley/19.jpg','frames/galley/20.jpg','frames/galley/21.jpg'] },
  { title: 'Shophouse 02', images: ['frames/galley/6.jpg','frames/galley/7.jpg','frames/galley/8.jpg','frames/galley/9.jpg','frames/galley/10.jpg','frames/galley/11.jpg'] },
  { title: 'Liền Kề', images: ['frames/galley/22.jpg','frames/galley/14.jpg','frames/galley/15.jpg','frames/galley/16.jpg','frames/galley/17.jpg'] },
  { title: 'Biệt Thự', images: ['frames/galley/12.jpg','frames/galley/13.jpg','frames/galley/23.jpg','frames/galley/24.jpg'] }
];
var LIBRARY_DATA = { albums: ALBUMS, videos: [] };
var libraryLoaded = false;
var pendingLibraryUpload = null;
var libraryVideoPickerItems = [];

function normalizeAssetPathInput(path) {
  return String(path || '').trim().replace(/^\.?\//, '');
}

function filenameFromPath(path) {
  return normalizeAssetPathInput(path).split('/').pop() || '';
}

function humanizeVideoTitle(value) {
  var base = String(value || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base || 'Video mới';
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLibraryImageOptions() {
  var seen = {};
  var options = [];
  ALBUMS.forEach(function(album) {
    var cover = normalizeAssetPathInput(album.cover || '');
    if (cover && !seen[cover]) {
      seen[cover] = true;
      options.push(cover);
    }
    (album.images || []).forEach(function(src) {
      src = normalizeAssetPathInput(src);
      if (src && !seen[src]) {
        seen[src] = true;
        options.push(src);
      }
    });
  });
  return options;
}

function getDefaultVideoThumb() {
  var options = getLibraryImageOptions();
  return options[0] || '';
}

function getVideoThumbOptions(selectedThumb) {
  var options = getLibraryImageOptions();
  var selected = normalizeAssetPathInput(selectedThumb || '');
  if (selected && options.indexOf(selected) === -1) options.unshift(selected);
  if (!options.length) {
    return '<option value="">Chưa có ảnh thư viện</option>';
  }

function logoutAdmin() {
  fetch(apiUrl({ action: 'logout' }), {
    method: 'POST',
    credentials: 'same-origin'
  }).catch(function() {
    return null;
  }).finally(function() {
    window.location.href = ADMIN_LOGIN_URL;
  });
}
  return options.map(function(src) {
    return '<option value="' + escapeHtml(src) + '"' + (src === selected ? ' selected' : '') + '>' + escapeHtml(filenameFromPath(src)) + '</option>';
  }).join('');
}

function buildLibraryVideo(src, name, title) {
  var cleanSrc = normalizeAssetPathInput(src);
  return {
    title: (title && title.trim()) || humanizeVideoTitle(name || filenameFromPath(cleanSrc)),
    src: cleanSrc,
    thumb: getDefaultVideoThumb(),
    description: ''
  };
}

function persistLibraryData(successMessage) {
  LIBRARY_DATA.albums = ALBUMS;
  return apiSave('library', LIBRARY_DATA).then(function() {
    if (successMessage) showToast(successMessage, 'success');
  });
}

function closeVideoPicker() {
  libraryVideoPickerItems = [];
  var picker = document.getElementById('video-picker');
  if (!picker) return;
  picker.style.display = 'none';
  picker.innerHTML = '';
}

function renderVideoPicker() {
  var picker = document.getElementById('video-picker');
  if (!picker) return;
  if (!libraryVideoPickerItems.length) {
    closeVideoPicker();
    return;
  }
  var html = '<div class="panel" style="background:transparent;border-color:var(--border);margin-top:0">' +
    '<div class="panel-head"><h3><i class="fa-solid fa-film"></i> Chọn video đã upload trong frames/galley</h3>' +
    '<button class="btn btn-sm" onclick="closeVideoPicker()"><i class="fa-solid fa-xmark"></i> Đóng</button></div>' +
    '<div class="panel-body"><table class="data-table"><thead><tr><th>Tên file</th><th>Đường dẫn</th><th></th></tr></thead><tbody>';
  libraryVideoPickerItems.forEach(function(item, idx) {
    html += '<tr>' +
      '<td>' + escapeHtml(humanizeVideoTitle(item.name)) + '</td>' +
      '<td style="font-family:JetBrains Mono;color:var(--cyan)">' + escapeHtml(item.path) + '</td>' +
      '<td><button class="btn btn-sm btn-primary" onclick="addUploadedVideo(' + idx + ')"><i class="fa-solid fa-plus"></i> Thêm</button></td>' +
      '</tr>';
  });
  html += '</tbody></table></div></div>';
  picker.innerHTML = html;
  picker.style.display = 'block';
}

var currentPath = ['frames'];
var currentView = 'grid';

// ── Navigation ──
function switchPage(pageId) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  var page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');
  var nav = document.querySelector('.nav-item[data-page="'+pageId+'"]');
  if (nav) nav.classList.add('active');
  var titles = { 'dashboard':'Dashboard', 'file-browser':'Quản lý File', 'albums':'Album / Thư Viện',
    'vr-config':'VR 360° Config', 'hotspot-editor':'Hotspot Editor', 'thamquan-config':'Tham quan 360', 'masterplan':'Master Plan',
    'settings':'Cài đặt chung', 'json-editor':'JSON Editor' };
  document.getElementById('breadcrumb').innerHTML = 'Admin / <b>' + (titles[pageId]||pageId) + '</b>';
  // Init specific pages
  if (pageId === 'file-browser') { if (!currentPath.length) currentPath = ['frames']; renderFiles(); }
  if (pageId === 'albums') renderAlbums();
  if (pageId === 'vr-config') loadVRConfigTable();
  if (pageId === 'hotspot-editor') loadHotspotEditor();
  if (pageId === 'thamquan-config') loadThamQuanAdmin();
  if (pageId === 'masterplan') loadMasterplan();
  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
}

document.querySelectorAll('.nav-item').forEach(function(item) {
  item.addEventListener('click', function() { switchPage(this.dataset.page); });
});

// Mobile menu
document.getElementById('btn-menu').addEventListener('click', function() {
  document.getElementById('sidebar').classList.toggle('open');
});

// ── File Browser ──
function getFileType(name) {
  var ext = name.split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','webp','gif','svg'].includes(ext)) return 'image';
  if (['mp4','webm','mov'].includes(ext)) return 'video';
  if (['pdf'].includes(ext)) return 'pdf';
  return 'file';
}

function renderPathBar() {
  var html = '<span class="path-seg" onclick="navigateTo(-1)">root</span>';
  currentPath.forEach(function(seg, i) {
    html += '<span class="path-sep">/</span><span class="path-seg" onclick="navigateTo('+i+')">' + seg + '</span>';
  });
  document.getElementById('path-bar').innerHTML = html;
}

function navigateTo(index) {
  if (index < 0) currentPath = [];
  else currentPath = currentPath.slice(0, index + 1);
  renderFiles();
}

function openFolder(name) {
  currentPath.push(name);
  renderFiles();
}

function openFolderByPath(path) {
  currentPath = String(path || '').split('/').filter(Boolean);
  renderFiles();
}

function setView(view) {
  currentView = view;
  document.getElementById('view-grid').classList.toggle('active', view === 'grid');
  document.getElementById('view-list').classList.toggle('active', view === 'list');
  renderFiles();
}

function renderFiles() {
  renderPathBar();
  var container = document.getElementById('file-container');
  container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Đang tải media...</p></div>';

  apiListFiles(currentPath.join('/')).then(function(items) {
    var search = (document.getElementById('file-search').value || '').toLowerCase();
    var filter = document.getElementById('filter-type').value;
    if (search) items = items.filter(function(f) { return f.name.toLowerCase().includes(search); });
    if (filter !== 'all') items = items.filter(function(f) { return f.type === filter; });
    items.sort(function(a,b) {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-folder-open"></i><p>Thư mục này chưa có media</p></div>';
      return;
    }

    var html = '<div class="file-grid">';
    items.forEach(function(f) {
      var thumbHtml = '';
      if (f.isDir || f.type === 'folder') {
        thumbHtml = '<div class="folder-icon"><i class="fa-solid fa-folder"></i></div>';
      } else if (f.type === 'image') {
        thumbHtml = '<img src="./' + encodeURI(f.path) + '" alt="' + escapeHTML(f.name) + '" loading="lazy" onerror="this.style.display=\'none\';this.parentNode.innerHTML=\'<div class=file-icon><i class=fa-solid fa-image></i></div>\'">';
      } else if (f.type === 'video') {
        thumbHtml = '<div class="file-icon"><i class="fa-solid fa-video"></i></div>';
      } else if (f.type === 'pdf') {
        thumbHtml = '<div class="file-icon" style="color:var(--gold)"><i class="fa-solid fa-file-pdf"></i></div>';
      } else {
        thumbHtml = '<div class="file-icon"><i class="fa-solid fa-file"></i></div>';
      }
      var actions = f.isDir ? '' : '<div class="file-actions"><button class="file-action delete" data-delete="' + escapeHTML(f.path) + '" title="Xóa file"><i class="fa-solid fa-trash"></i></button></div>';
      html += '<div class="file-item" data-path="' + escapeHTML(f.path) + '" data-type="' + escapeHTML(f.type) + '" data-name="' + escapeHTML(f.name) + '" data-dir="' + (f.isDir ? '1' : '0') + '"><div class="file-thumb">' + thumbHtml + actions + '</div><div class="file-info"><div class="file-name">' + escapeHTML(f.name) + '</div><div class="file-size">' + (f.isDir ? 'FOLDER' : (f.type.toUpperCase() + (f.size ? ' • ' + formatSize(f.size) : ''))) + '</div></div></div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }).catch(function(e) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>' + escapeHTML(e.message) + '</p></div>';
  });
}

document.getElementById('file-search').addEventListener('input', renderFiles);
document.getElementById('filter-type').addEventListener('change', renderFiles);
document.getElementById('file-upload-input').addEventListener('change', function() {
  var file = this.files && this.files[0];
  this.value = '';
  if (!file) return;
  var target = currentPath.join('/') || 'frames/galley';
  if (!target || target === 'frames') target = 'frames/galley';
  apiUploadFile(target, file).then(function(saved) {
    showToast('Đã upload ' + saved.name, 'success');
    if (currentPath.join('/') !== target) currentPath = target.split('/');
    renderFiles();
  }).catch(function(e) { showToast(e.message, 'error'); });
});

document.getElementById('file-container').addEventListener('click', function(e) {
  var del = e.target.closest('[data-delete]');
  if (del) {
    e.stopPropagation();
    var path = del.getAttribute('data-delete');
    if (!confirm('Xóa file "' + path + '"?')) return;
    apiDeleteFile(path).then(function() {
      showToast('Đã xóa file', 'success');
      renderFiles();
    }).catch(function(err) { showToast(err.message, 'error'); });
    return;
  }
  var item = e.target.closest('.file-item');
  if (!item) return;
  var path = item.getAttribute('data-path');
  var type = item.getAttribute('data-type');
  var name = item.getAttribute('data-name');
  if (item.getAttribute('data-dir') === '1') openFolderByPath(path);
  else previewFile(path, type, name);
});

function previewFile(path, type, name) {
  var media = document.getElementById('preview-media');
  var src = './' + path;
  document.getElementById('preview-title').textContent = name;
  if (type === 'image') {
    media.innerHTML = '<img class="preview-img" src="' + encodeURI(src) + '" alt="' + escapeHTML(name) + '"/>';
  } else if (type === 'video') {
    media.innerHTML = '<video class="preview-video" src="' + encodeURI(src) + '" controls playsinline></video>';
  } else if (type === 'pdf') {
    media.innerHTML = '<iframe class="preview-frame" src="' + encodeURI(src) + '"></iframe>';
  } else {
    media.innerHTML = '<div class="preview-empty">Không có preview cho file này</div>';
  }
  document.getElementById('preview-meta').innerHTML =
    '<div class="meta-item"><div class="meta-label">Đường dẫn</div><div class="meta-value">'+escapeHTML(path)+'</div></div>' +
    '<div class="meta-item"><div class="meta-label">Loại</div><div class="meta-value">'+escapeHTML(type.toUpperCase())+'</div></div>';
  document.getElementById('preview-modal').classList.add('open');
}

function closePreview() {
  document.getElementById('preview-modal').classList.remove('open');
  document.getElementById('preview-media').innerHTML = '';
}
document.getElementById('preview-modal').addEventListener('click', function(e) {
  if (e.target === this) closePreview();
});

// ── Albums ──
function renderAlbums() {
  if (!libraryLoaded) {
    apiFetch('library').then(function(data) {
      LIBRARY_DATA = data || { albums: ALBUMS, videos: [] };
      ALBUMS = LIBRARY_DATA.albums || [];
      libraryLoaded = true;
      renderAlbums();
    }).catch(function() {
      libraryLoaded = true;
      renderAlbums();
    });
    return;
  }
  var html = '';
  ALBUMS.forEach(function(album, idx) {
    var thumbs = (album.images || []).slice(0, 8).map(function(src) {
      return '<div class="album-thumb"><img src="./'+src+'" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>\'" alt=""/><button class="remove-thumb" onclick="event.stopPropagation();removeAlbumImage('+idx+',\''+src+'\')">×</button></div>';
    }).join('');
    html += '<div class="album-card"><div class="album-card-head"><h4><i class="fa-solid fa-images"></i> '+album.title+'</h4><div style="display:flex;gap:6px"><button class="btn btn-sm" title="Thêm path ảnh" onclick="addAlbumImage('+idx+')"><i class="fa-solid fa-plus"></i></button><button class="btn btn-sm" title="Upload ảnh" onclick="uploadAlbumImage('+idx+')"><i class="fa-solid fa-upload"></i></button><button class="btn btn-sm" onclick="editAlbumTitle('+idx+')"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-danger" onclick="deleteAlbum('+idx+')"><i class="fa-solid fa-trash"></i></button></div></div><div class="album-thumbs">'+thumbs+'</div><div class="album-count">'+((album.images || []).length)+' ảnh</div></div>';
  });
  document.getElementById('album-list').innerHTML = html;
  document.getElementById('stat-albums').textContent = ALBUMS.length;
  renderVideos();
}

function editAlbumTitle(idx) {
  var newTitle = prompt('Tên album mới:', ALBUMS[idx].title);
  if (newTitle && newTitle.trim()) { ALBUMS[idx].title = newTitle.trim(); renderAlbums(); showToast('Đã cập nhật tên album', 'success'); }
}

function deleteAlbum(idx) {
  if (confirm('Xóa album "' + ALBUMS[idx].title + '"?')) { ALBUMS.splice(idx, 1); renderAlbums(); showToast('Đã xóa album', 'success'); }
}

function removeAlbumImage(albumIdx, src) {
  ALBUMS[albumIdx].images = (ALBUMS[albumIdx].images || []).filter(function(s) { return s !== src; });
  renderAlbums();
}

function addAlbum() {
  var title = prompt('Tên album mới:');
  if (title && title.trim()) { ALBUMS.push({ title: title.trim(), cover: '', images: [] }); LIBRARY_DATA.albums = ALBUMS; renderAlbums(); showToast('Đã thêm album "'+title.trim()+'"', 'success'); }
}

function addAlbumImage(idx) {
  var path = prompt('Đường dẫn ảnh, ví dụ: frames/galley/25.jpg');
  if (!path) return;
  path = path.trim().replace(/^\.?\//, '');
  ALBUMS[idx].images = ALBUMS[idx].images || [];
  ALBUMS[idx].images.push(path);
  if (!ALBUMS[idx].cover) ALBUMS[idx].cover = path;
  LIBRARY_DATA.albums = ALBUMS;
  renderAlbums();
}

function uploadAlbumImage(idx) {
  pendingLibraryUpload = { type: 'album-image', albumIdx: idx };
  var input = document.getElementById('library-upload-input');
  input.accept = 'image/*';
  input.click();
}

function uploadLibraryVideo() {
  pendingLibraryUpload = { type: 'video' };
  closeVideoPicker();
  var input = document.getElementById('library-upload-input');
  input.accept = 'video/mp4,video/webm,video/quicktime';
  input.click();
}

document.getElementById('library-upload-input').addEventListener('change', function() {
  var file = this.files && this.files[0];
  this.value = '';
  if (!file || !pendingLibraryUpload) return;
  var pending = pendingLibraryUpload;
  pendingLibraryUpload = null;
  apiUploadFile('frames/galley', file).then(function(saved) {
    if (pending.type === 'album-image') {
      ALBUMS[pending.albumIdx].images = ALBUMS[pending.albumIdx].images || [];
      ALBUMS[pending.albumIdx].images.push(saved.path);
      if (!ALBUMS[pending.albumIdx].cover) ALBUMS[pending.albumIdx].cover = saved.path;
      LIBRARY_DATA.albums = ALBUMS;
      showToast('Đã upload ảnh vào album', 'success');
      renderAlbums();
    } else if (pending.type === 'video') {
      LIBRARY_DATA.videos = LIBRARY_DATA.videos || [];
      LIBRARY_DATA.videos.push(buildLibraryVideo(saved.path, saved.name, pending.title || humanizeVideoTitle(saved.name)));
      renderAlbums();
      return persistLibraryData('Đã upload video vào thư viện');
    }
  }).catch(function(e) { showToast(e.message, 'error'); });
});

function renderVideos() {
  var videos = LIBRARY_DATA.videos || [];
  var html = '<div class="panel" style="background:transparent;border-color:var(--border);margin-top:0"><div class="panel-head"><h3><i class="fa-solid fa-video"></i> Video thư viện</h3></div><div class="panel-body">';
  if (!videos.length) {
    html += '<p style="font-size:12px;color:var(--text3)">Chưa có video. Hãy bấm "Upload & thêm video" để tải file lên. Sau đó hệ thống sẽ tự lưu đường dẫn và tự chọn ảnh đại diện mặc định.</p>';
  } else {
    html += '<table class="data-table"><thead><tr><th>Tiêu đề</th><th>File</th><th>Thumbnail</th><th></th></tr></thead><tbody>';
    videos.forEach(function(v, i) {
      var currentThumb = normalizeAssetPathInput(v.thumb || '') || getDefaultVideoThumb();
      html += '<tr>' +
        '<td><input type="text" value="' + escapeHtml(v.title || humanizeVideoTitle(v.src)) + '" onchange="updateVideoTitle(' + i + ', this.value)" placeholder="Tên video" /></td>' +
        '<td style="font-family:JetBrains Mono;color:var(--cyan)">' + escapeHtml(v.src) + '</td>' +
        '<td>' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            (currentThumb ? '<img src="' + escapeHtml(currentThumb) + '" alt="" style="width:60px;height:42px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" />' : '<div style="width:60px;height:42px;border:1px dashed var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:10px">No thumb</div>') +
            '<select onchange="updateVideoThumb(' + i + ', this.value)">' + getVideoThumbOptions(currentThumb) + '</select>' +
          '</div>' +
        '</td>' +
        '<td><button class="btn btn-sm btn-danger" onclick="deleteVideoItem(' + i + ')"><i class="fa-solid fa-trash"></i></button></td>' +
      '</tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div>';
  document.getElementById('video-list').innerHTML = html;
}

function addVideoItem() {
  apiListFiles('frames/galley').then(function(items) {
    var used = {};
    (LIBRARY_DATA.videos || []).forEach(function(video) {
      used[normalizeAssetPathInput(video.src)] = true;
    });
    libraryVideoPickerItems = (items || []).filter(function(item) {
      return item.type === 'video' && !used[normalizeAssetPathInput(item.path)];
    });
    if (!libraryVideoPickerItems.length) {
      closeVideoPicker();
      showToast('Không còn video nào chưa thêm trong frames/galley. Hãy bấm "Upload & thêm video" nếu bạn muốn tải file mới.', 'error');
      return;
    }
    renderVideoPicker();
  }).catch(function(e) { showToast(e.message, 'error'); });
}

function addUploadedVideo(idx) {
  var item = libraryVideoPickerItems[idx];
  if (!item) return;
  LIBRARY_DATA.videos = LIBRARY_DATA.videos || [];
  LIBRARY_DATA.videos.push(buildLibraryVideo(item.path, item.name));
  closeVideoPicker();
  renderAlbums();
  persistLibraryData('Đã thêm video vào thư viện').catch(function(e) { showToast(e.message, 'error'); });
}

function updateVideoTitle(idx, value) {
  var videos = LIBRARY_DATA.videos || [];
  if (!videos[idx]) return;
  videos[idx].title = String(value || '').trim() || humanizeVideoTitle(videos[idx].src);
  renderVideos();
  persistLibraryData('Đã cập nhật tiêu đề video').catch(function(e) { showToast(e.message, 'error'); });
}

function updateVideoThumb(idx, value) {
  var videos = LIBRARY_DATA.videos || [];
  if (!videos[idx]) return;
  videos[idx].thumb = normalizeAssetPathInput(value || '') || getDefaultVideoThumb();
  renderVideos();
  persistLibraryData('Đã cập nhật thumbnail video').catch(function(e) { showToast(e.message, 'error'); });
}

function deleteVideoItem(idx) {
  if (!confirm('Xóa video này?')) return;
  LIBRARY_DATA.videos.splice(idx, 1);
  renderAlbums();
  persistLibraryData('Đã xóa video khỏi thư viện').catch(function(e) { showToast(e.message, 'error'); });
}

function saveLibraryData() {
  persistLibraryData('Đã lưu thư viện ảnh/video').catch(function(e) { showToast(e.message, 'error'); });
}

// ── VR Config ──
function loadVRConfigTable() {
  apiFetch('vr-hotspots').then(function(data) {
    currentHotspotData = data;
    var amenityConfig = data.amenityConfig || {};
    var hotspots = data.hotspots || data;
    var labels = {};
    Object.keys(hotspots).forEach(function(pano) {
      if (!Array.isArray(hotspots[pano])) return;
      hotspots[pano].forEach(function(hs) {
        var m = String(hs.label || '').match(/^(\d+)/);
        if (m && !labels[m[1]]) labels[m[1]] = hs.label;
      });
    });
    var ids = Object.keys(amenityConfig).sort(function(a,b){ return parseInt(a, 10) - parseInt(b, 10); });
    var html = '<table class="data-table"><thead><tr><th>ID / Tiện ích</th><th>Lon</th><th>Lat</th><th>FOV</th></tr></thead><tbody>';
    ids.forEach(function(id) {
      var c = amenityConfig[id] || {};
      html += '<tr data-vr-id="'+id+'">' +
        '<td style="font-weight:600;font-size:11px">'+(labels[id] || id)+'</td>' +
        '<td><input data-field="lon" type="number" step="1" value="'+(c.lon || 0)+'" style="width:82px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px;border-radius:6px"></td>' +
        '<td><input data-field="lat" type="number" step="1" value="'+(c.lat || 0)+'" style="width:82px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px;border-radius:6px"></td>' +
        '<td><input data-field="fov" type="number" step="1" value="'+(c.fov || 90)+'" style="width:82px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px;border-radius:6px"></td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    document.getElementById('vr-config-table').innerHTML = html;
  }).catch(function() {
    document.getElementById('vr-config-table').innerHTML = '<p style="color:var(--red);font-size:12px">Không tải được vr-hotspot-data.json</p>';
  });
}

// ── Hotspot Editor ──
function loadHotspotEditor() {
  apiFetch('vr-hotspots').then(function(data) {
    currentHotspotData = data;
    var text = JSON.stringify(data, null, 2);
    document.getElementById('hotspot-json').value = text;
    try {
      var data = JSON.parse(text);
      var hs = data.hotspots || data;
      var total = 0;
      Object.keys(hs).forEach(function(k) { if (Array.isArray(hs[k])) total += hs[k].length; });
      document.getElementById('stat-hotspots').textContent = total;
      document.getElementById('hotspot-summary').innerHTML = '<div style="margin-bottom:12px;font-size:12px;color:var(--text2)">Tổng: <b style="color:var(--cyan)">'+total+'</b> hotspots trên <b style="color:var(--gold)">'+Object.keys(hs).length+'</b> PANO</div>';
    } catch(e) {}
  }).catch(function() {
    document.getElementById('hotspot-json').value = '// Không tải được file';
  });
}

// ── Tham quan 360 ──
function loadThamQuanAdmin() {
  apiFetch('thamquan-config').then(function(data) {
    currentThamQuanConfig = data || { panoSrc: '', hotspots: [], texts: [] };
    renderThamQuanAdmin();
  }).catch(function() {
    document.getElementById('thamquan-hotspot-table').innerHTML = '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Không tải được cấu hình tham quan</p></div>';
  });
}

function renderThamQuanAdmin() {
  document.getElementById('thamquan-pano-src').value = currentThamQuanConfig.panoSrc || '';
  document.getElementById('thamquan-texts-json').value = JSON.stringify(currentThamQuanConfig.texts || [], null, 2);
  var rows = (currentThamQuanConfig.hotspots || []).map(function(h, idx) {
    return '<tr data-tq-index="' + idx + '">' +
      '<td><input data-field="name" value="' + escapeHTML(h.name || '') + '" placeholder="Tên hotspot"></td>' +
      '<td><input data-field="px" type="number" value="' + escapeHTML(h.px || 0) + '"></td>' +
      '<td><input data-field="py" type="number" value="' + escapeHTML(h.py || 0) + '"></td>' +
      '<td><button class="btn btn-sm btn-danger" onclick="deleteThamQuanHotspot(this)"><i class="fa-solid fa-trash"></i></button></td>' +
    '</tr>';
  }).join('');
  document.getElementById('thamquan-hotspot-table').innerHTML =
    '<div style="overflow:auto"><table class="data-table"><thead><tr><th>Tên điểm</th><th>PX</th><th>PY</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function collectThamQuanConfig() {
  var hotspots = [];
  document.querySelectorAll('#thamquan-hotspot-table tr[data-tq-index]').forEach(function(row) {
    var name = row.querySelector('[data-field="name"]').value.trim();
    if (!name) return;
    hotspots.push({
      px: Number(row.querySelector('[data-field="px"]').value || 0),
      py: Number(row.querySelector('[data-field="py"]').value || 0),
      name: name
    });
  });
  var texts = [];
  try { texts = JSON.parse(document.getElementById('thamquan-texts-json').value || '[]'); }
  catch(e) { throw new Error('JSON chữ 3D lỗi: ' + e.message); }
  if (!Array.isArray(texts)) throw new Error('Chữ 3D phải là một mảng JSON');
  return {
    panoSrc: document.getElementById('thamquan-pano-src').value.trim() || 'frames/tienich/PANO_1_1.jpg',
    hotspots: hotspots,
    texts: texts
  };
}

function addThamQuanHotspot() {
  currentThamQuanConfig.hotspots = currentThamQuanConfig.hotspots || [];
  currentThamQuanConfig.hotspots.push({ px: 1000, py: 500, name: 'Điểm mới' });
  renderThamQuanAdmin();
}

function deleteThamQuanHotspot(btn) {
  var row = btn.closest('tr');
  if (row) row.remove();
}

function saveThamQuanConfig() {
  var data;
  try { data = collectThamQuanConfig(); }
  catch(e) { showToast(e.message, 'error'); return; }
  apiSave('thamquan-config', data).then(function() {
    currentThamQuanConfig = data;
    renderThamQuanAdmin();
    showToast('Đã lưu cấu hình tham quan 360', 'success');
  }).catch(function(e) { showToast(e.message, 'error'); });
}

// ── Masterplan ──
function loadMasterplan() {
  apiFetch('masterplan').then(function(data) {
    currentMasterplanData = data || {};
    document.getElementById('masterplan-json').value = JSON.stringify(data, null, 2);
    renderMasterplanForm();
  }).catch(function() {
    document.getElementById('masterplan-json').value = '// Không tải được file';
    document.getElementById('masterplan-form').innerHTML = '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Không tải được masterplan</p></div>';
  });
}

function renderMasterplanForm() {
  var keys = Object.keys(currentMasterplanData || {});
  if (!keys.length) {
    document.getElementById('masterplan-form').innerHTML = '<div class="empty-state"><i class="fa-solid fa-map-location-dot"></i><p>Chưa có tiện ích</p></div>';
    return;
  }
  var rows = keys.map(function(name) {
    var item = currentMasterplanData[name] || {};
    return '<tr data-masterplan-name="' + escapeHTML(name) + '">' +
      '<td><input data-field="name" value="' + escapeHTML(name) + '" style="min-width:180px"></td>' +
      '<td><input data-field="top" type="number" step="0.01" min="0" max="100" value="' + escapeHTML(item.top == null ? 0 : item.top) + '"></td>' +
      '<td><input data-field="left" type="number" step="0.01" min="0" max="100" value="' + escapeHTML(item.left == null ? 0 : item.left) + '"></td>' +
      '<td><input data-field="group" value="' + escapeHTML(item.group || '') + '" placeholder="g1"></td>' +
      '<td><input data-field="icon" value="' + escapeHTML(item.icon || '') + '" placeholder="fa-solid fa-star"></td>' +
      '<td><button class="btn btn-sm btn-danger" onclick="deleteMasterplanRow(this)"><i class="fa-solid fa-trash"></i></button></td>' +
    '</tr>';
  }).join('');
  document.getElementById('masterplan-form').innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px">' +
      '<div style="font-size:12px;color:var(--text2)">Form này chỉ chỉnh tên, top/left, nhóm và icon. Muốn sửa sâu thì mở JSON nâng cao.</div>' +
      '<button class="btn btn-sm" onclick="addMasterplanRow()"><i class="fa-solid fa-plus"></i> Thêm tiện ích</button>' +
    '</div>' +
    '<div style="overflow:auto"><table class="data-table"><thead><tr><th>Tên</th><th>Top %</th><th>Left %</th><th>Nhóm</th><th>Icon</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function collectMasterplanForm() {
  var next = {};
  document.querySelectorAll('#masterplan-form tr[data-masterplan-name]').forEach(function(row) {
    var oldName = row.getAttribute('data-masterplan-name');
    var oldItem = currentMasterplanData[oldName] || {};
    var name = (row.querySelector('[data-field="name"]').value || '').trim();
    if (!name) return;
    var item = Object.assign({}, oldItem);
    item.top = Number(row.querySelector('[data-field="top"]').value || 0);
    item.left = Number(row.querySelector('[data-field="left"]').value || 0);
    var group = row.querySelector('[data-field="group"]').value.trim();
    var icon = row.querySelector('[data-field="icon"]').value.trim();
    if (group) item.group = group; else delete item.group;
    if (icon) item.icon = icon; else delete item.icon;
    next[name] = item;
  });
  return next;
}

function addMasterplanRow() {
  var name = prompt('Tên tiện ích mới:', 'Tiện ích mới');
  if (!name) return;
  currentMasterplanData[name] = { icon: 'fa-solid fa-location-dot', group: 'g1', top: 50, left: 50 };
  document.getElementById('masterplan-json').value = JSON.stringify(currentMasterplanData, null, 2);
  renderMasterplanForm();
}

function deleteMasterplanRow(btn) {
  var row = btn.closest('tr');
  if (row) row.remove();
}

// ── JSON Editor ──
function loadJSONFile(filename) {
  if (!filename) return;
  currentJsonResource = getResourceForFile(filename);
  if (!currentJsonResource) {
    document.getElementById('json-status').innerHTML = '<span style="color:var(--red)">✗ File chưa được map vào API</span>';
    return;
  }
  apiFetch(currentJsonResource).then(function(data) {
    document.getElementById('json-editor-main').value = JSON.stringify(data, null, 2);
    document.getElementById('json-status').innerHTML = '<span style="color:var(--green)">✓ Đã tải ' + filename + '</span>';
  }).catch(function() {
    document.getElementById('json-editor-main').value = '';
    document.getElementById('json-status').innerHTML = '<span style="color:var(--red)">✗ Không tìm thấy file</span>';
  });
}

function validateJSON() {
  try {
    JSON.parse(document.getElementById('json-editor-main').value);
    document.getElementById('json-status').innerHTML = '<span style="color:var(--green)">✓ JSON hợp lệ</span>';
    showToast('JSON hợp lệ!', 'success');
  } catch(e) {
    document.getElementById('json-status').innerHTML = '<span style="color:var(--red)">✗ ' + e.message + '</span>';
    showToast('Lỗi JSON: ' + e.message, 'error');
  }
}

function formatJSON() {
  try {
    var obj = JSON.parse(document.getElementById('json-editor-main').value);
    document.getElementById('json-editor-main').value = JSON.stringify(obj, null, 2);
    showToast('Đã format JSON', 'success');
  } catch(e) { showToast('JSON không hợp lệ, không thể format', 'error'); }
}

function saveJSONFile() {
  if (!currentJsonResource) {
    showToast('Chưa chọn file JSON', 'error');
    return;
  }
  var data;
  try { data = parseJsonFromTextarea('json-editor-main'); }
  catch(e) { showToast('JSON lỗi: ' + e.message, 'error'); return; }
  apiSave(currentJsonResource, data).then(function() {
    showToast('Đã lưu file JSON', 'success');
  }).catch(function(e) {
    showToast(e.message, 'error');
  });
}

// ── Utilities ──
function copyToClipboard(id) {
  var el = document.getElementById(id);
  el.select();
  document.execCommand('copy');
  showToast('Đã copy vào clipboard!', 'success');
}

function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.querySelector('span').textContent = msg;
  t.querySelector('i').className = type === 'success' ? 'fa-solid fa-check-circle' : 'fa-solid fa-exclamation-circle';
  t.className = 'toast show ' + (type||'success');
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.classList.remove('show'); }, 3000);
}

function saveVRConfig() {
  if (!currentHotspotData) {
    showToast('Chưa tải dữ liệu VR config', 'error');
    return;
  }
  currentHotspotData.amenityConfig = currentHotspotData.amenityConfig || {};
  document.querySelectorAll('#vr-config-table tr[data-vr-id]').forEach(function(row) {
    var id = row.getAttribute('data-vr-id');
    currentHotspotData.amenityConfig[id] = {};
    row.querySelectorAll('input[data-field]').forEach(function(input) {
      currentHotspotData.amenityConfig[id][input.getAttribute('data-field')] = Number(input.value);
    });
  });
  apiSave('vr-hotspots', currentHotspotData).then(function() {
    showToast('Đã lưu VR config vào website chính', 'success');
  }).catch(function(e) { showToast(e.message, 'error'); });
}
function saveHotspotJSON() {
  var data;
  try { data = parseJsonFromTextarea('hotspot-json'); }
  catch(e) { showToast('JSON lỗi: ' + e.message, 'error'); return; }
  apiSave('vr-hotspots', data).then(function() {
    currentHotspotData = data;
    showToast('Đã lưu hotspot JSON vào website chính', 'success');
  }).catch(function(e) { showToast(e.message, 'error'); });
}
function saveMasterplanJSON() {
  var data;
  try { data = parseJsonFromTextarea('masterplan-json'); }
  catch(e) { showToast('JSON lỗi: ' + e.message, 'error'); return; }
  apiSave('masterplan', data).then(function() {
    currentMasterplanData = data;
    renderMasterplanForm();
    showToast('Đã lưu Masterplan JSON', 'success');
  }).catch(function(e) { showToast(e.message, 'error'); });
}
function saveMasterplanForm() {
  var data = collectMasterplanForm();
  document.getElementById('masterplan-json').value = JSON.stringify(data, null, 2);
  apiSave('masterplan', data).then(function() {
    currentMasterplanData = data;
    renderMasterplanForm();
    showToast('Đã lưu Masterplan từ form', 'success');
  }).catch(function(e) { showToast(e.message, 'error'); });
}

// ── Init ──
(function init() {
  // Count images
  var imgCount = 0;
  function countFiles(node) {
    if (!node) return;
    if (node._files) node._files.forEach(function(f) { if (getFileType(f)==='image') imgCount++; });
    if (node._count) imgCount += node._count;
    Object.keys(node).forEach(function(k) { if (!k.startsWith('_') && node[k] && node[k]._type) countFiles(node[k]); });
  }
  countFiles(FILE_TREE.frames);
  document.getElementById('stat-images').textContent = imgCount;
})();
</script>
</body>
</html>
