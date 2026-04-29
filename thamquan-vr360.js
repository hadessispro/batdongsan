// ═══════════════════════════════════════════════════════════
//  THAM QUAN — VR 360° + Interactive Hotspot (v7 PERFORMANCE)
//
//  FIX v7:
//  - Loading overlay chống trắng màn hình
//  - Throttle hotspot DOM update (mỗi 2 frame thay vì mỗi frame)
//  - Preload texture sớm + decode trước khi hiện overlay
//  - Render loop tối ưu: không skip frame khi đang drag/zoom
//  - Reduce GC pressure: cache vector, giảm string concat
//  - Mobile: giảm segment sphere + tắt antialias
// ═══════════════════════════════════════════════════════════

(function initThamQuan360() {
  "use strict";

  var overlay = document.getElementById("thamquan-overlay");
  var canvas = document.getElementById("tq-vr-canvas");
  var hsContainer = document.getElementById("tq-hotspot-container");
  var navThamQuan = document.getElementById("nav-vi-tri");
  var stageEl = document.getElementById("stage");
  var vignEl = document.querySelector(".vign");
  var dnEl = document.getElementById("dn");
  var hintEl = document.getElementById("hint");

  if (!overlay || !canvas) return;
  if (!hsContainer) {
    hsContainer = document.createElement("div");
    hsContainer.id = "tq-hotspot-container";
    overlay.appendChild(hsContainer);
  }

  function versionedAsset(url) {
    if (typeof window.bdsVersionedAsset === "function") {
      return window.bdsVersionedAsset(url);
    }
    return url;
  }

  var PANO_SRC = versionedAsset("frames/tienich/PANO_1_1.jpg");
  var SPHERE_R = 500;
  var IS_MOBILE_VR = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  var MOBILE_TEXTURE_MAX_WIDTH = 3072;

  // ★ Loading overlay — chống trắng
  var loadingEl = null;
  function showLoading() {
    if (!loadingEl) {
      loadingEl = document.createElement("div");
      loadingEl.id = "tq-loading";
      loadingEl.style.cssText =
        "position:absolute;top:0;left:0;width:100%;height:100%;z-index:50;" +
        "background:#080c16;display:flex;align-items:center;justify-content:center;" +
        "flex-direction:column;gap:12px;transition:opacity 0.5s ease;";
      loadingEl.innerHTML =
        '<div style="width:40px;height:40px;border:3px solid rgba(30,184,208,0.2);' +
        'border-top-color:#1eb8d0;border-radius:50%;animation:tqSpin 0.8s linear infinite"></div>' +
        "<div style=\"color:rgba(255,255,255,0.6);font:13px 'Be Vietnam Pro',sans-serif\">Đang tải panorama...</div>";
      overlay.appendChild(loadingEl);

      // Spinner keyframes
      if (!document.getElementById("tq-spin-style")) {
        var s = document.createElement("style");
        s.id = "tq-spin-style";
        s.textContent = "@keyframes tqSpin{to{transform:rotate(360deg)}}";
        document.head.appendChild(s);
      }
    }
    loadingEl.style.display = "flex";
    loadingEl.style.opacity = "1";
  }

  function hideLoading() {
    if (!loadingEl) return;
    loadingEl.style.opacity = "0";
    setTimeout(function () {
      if (loadingEl) loadingEl.style.display = "none";
    }, 500);
  }

  // ★ Preload pano texture sớm
  var panoTexture = null;
  var panoReady = false;
  var textureApplyPromise = null;
  var optimizedTextureSource = null;

  function releaseOptimizedTextureSource() {
    if (
      optimizedTextureSource &&
      typeof optimizedTextureSource.close === "function"
    ) {
      try {
        optimizedTextureSource.close();
      } catch (err) {
        // Ignore ImageBitmap close errors.
      }
    }
    optimizedTextureSource = null;
  }

  function resetAppliedTexture() {
    textureApplied = false;
    textureApplyPromise = null;
    releaseOptimizedTextureSource();
    if (sphereMesh && sphereMesh.material && sphereMesh.material.map) {
      sphereMesh.material.map.dispose();
      sphereMesh.material.map = null;
      sphereMesh.material.needsUpdate = true;
    }
  }

  function preloadPanoTexture() {
    if (panoReady || panoTexture) return;
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = function () {
      panoTexture = img;
      panoReady = true;
    };
    img.onerror = function () {
      panoReady = false;
    };
    img.src = PANO_SRC;
  }
  // ═══ HOTSPOT DATA ═══
  var RAW_HOTSPOTS = [
    { px: 1837, py: 535, name: "KCN Đình Trám" },
    { px: 1885, py: 579, name: "KCN Đình Trám" },
    { px: 1670, py: 522, name: "KCN Quang Châu" },
    { px: 1722, py: 567, name: "KĐT Đình Trám Sen Hồ" },
    { px: 1583, py: 514, name: "Sân bay Gia Bình" },
    { px: 1120, py: 500, name: "Cầu Hà Bắc" },

    { px: 1096, py: 554, name: "Bệnh viện TNH Việt Yên" },
    
    { px: 959, py: 690, name: "Trường mầm non Dục Quang" },
    { px: 1011, py: 505, name: "Sân Golf Amber Hills" },
    { px: 1022, py: 572, name: "KĐT TNR Star Bích Động" },
    { px: 1055, py: 610, name: "Sedona Hotel Việt Yên" },
    { px: 912, py: 518, name: "Tổ hợp văn hóa thể thao Việt Yên" },
    { px: 960, py: 525, name: "UBND phường Việt Yên" },
    { px: 948, py: 513, name: "Thiên Ân Hotel" },
    { px: 860, py: 534, name: "Trung tâm y tế Việt Yên" },
    { px: 699, py: 504, name: "Đại học Nông Lâm Bắc Giang" },
    { px: 773, py: 546, name: "KĐT Viet Yen Lakeside city" },
    { px: 640, py: 536, name: "KĐT Felix Bích Động" },
    { px: 1472, py: 526, name: "Ga Sen Hồ" },
    { px: 1328, py: 625, name: "KĐT Viet Yen Riverside" },
    { px: 1262, py: 517, name: "Bảo hiểm Xã hội Việt Yên" },
    { px: 1265, py: 563, name: "Kho bạc Việt Yên" },
    { px: 1233, py: 536, name: "Tòa án Nhân dân Việt Yên" },
    { px: 1233, py: 585, name: "Chi Cục Thuế Việt Yên" },
    { px: 1480, py: 791, name: "Ban chỉ huy quân sự Việt Yên" },
    { px: 1934, py: 535, name: "KCN Việt Hàn" },
    { px: 1572, py: 643, name: "CẦU DỤC QUANG" },
    { px: 1292, py: 555, name: "CHÙA PHỔ AM" },
  ];

  // ═══ 3D TEXT DATA ═══
  var RAW_3D_TEXTS = [
  { px: 1206, py: 631, text: "DƯƠNG QUỐC CƠ", size: 18, color: "#ffffff", rotate: 47, shadow: 6 },
  { px: 1410, py: 680, text: "ĐƯỜNG THÂN NHÂN TRUNG", size: 18, color: "#ffffff", rotate: 3, shadow: 7 },
  { px: 1687, py: 605, text: "ĐƯỜNG QL37 ( ĐƯỜNG THÂN NHÂN TRUNG )", size: 18, color: "#ffffff", rotate: 28, shadow: 3 },
  { px: 1167, py: 504, text: "VÀNH ĐAI  4", size: 20, color: "#ffffff", rotate: 0, shadow: 4 },
  { px: 1893, py: 569, text: "ĐƯỜNG THÂN CẢNH PHÚC (DT295B)", size: 18, color: "#ffffff", rotate: 3, shadow: 8 },
  { px: 1629, py: 555, text: "ĐƯỜNG THÂN CẢNH PHÚC (DT295B)", size: 18, color: "#ffffff", rotate: -9, shadow: 7 },
  { px: 1039, py: 661, text: "ĐƯỜNG NGUYỄN VĂN THUYÊN", size: 18, color: "#ffffff", rotate: 17, shadow: 5 },
  { px: 1004, py: 590, text: "ĐƯỜNG THÂN NHÂN TRUNG", size: 18, color: "#ffffff", rotate: -28, shadow: 7 },
   { px: 434, py: 542, text: "ĐƯỜNG QL 298B", size: 18, color: "#ffffff", rotate: 0, shadow: 5 },
];

  function applyThamQuanConfig(data) {
    if (!data || typeof data !== "object") return;
    if (typeof data.panoSrc === "string" && data.panoSrc.trim()) {
      PANO_SRC = versionedAsset(data.panoSrc.trim());
      panoTexture = null;
      panoReady = false;
      resetAppliedTexture();
    }
    if (Array.isArray(data.hotspots)) RAW_HOTSPOTS = data.hotspots;
    if (Array.isArray(data.texts)) RAW_3D_TEXTS = data.texts;
  }

  function loadThamQuanConfig() {
    return fetch("./api/index.php?resource=thamquan-config&t=" + Date.now(), {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Không tải được tham quan config");
        return res.json();
      })
      .then(function (payload) {
        if (!payload || !payload.ok || !payload.data) {
          throw new Error("Không tải được tham quan config");
        }
        var data = payload.data;
        applyThamQuanConfig(data);
      })
      .catch(function () {
        // Giữ fallback hardcode để website vẫn chạy khi thiếu backend/config.
      })
      .then(function () {
        if (!IS_MOBILE_VR) preloadPanoTexture();
      });
  }

  var thamQuanConfigReady = loadThamQuanConfig();

  // ── Convert pixel → 3D ──
  function hotspot3DPos(px, py) {
    var theta = (px / 2000) * 2 * Math.PI;
    var phi = (py / 1000) * Math.PI;
    var r = SPHERE_R * 0.92;
    return new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      -r * Math.sin(phi) * Math.sin(theta),
    );
  }

  // ── 3D Text helpers ──
  function updateMeshOrientation(item) {
    if (!item.mesh) return;
    item.mesh.position.copy(item.pos).multiplyScalar(0.98);
    item.mesh.lookAt(0, 0, 0);
    var rot = item.data.rotate || 0;
    item.mesh.rotateZ(THREE.MathUtils.degToRad(-rot));
  }

  function updateTextMeshTexture(item) {
    var data = item.data;
    if (!item.mesh) {
      var geo = new THREE.PlaneGeometry(10, 10);
      var mat = new THREE.MeshBasicMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      item.mesh = new THREE.Mesh(geo, mat);
      item.mesh.renderOrder = 999;
      scene.add(item.mesh);
    }
    var cvs = document.createElement("canvas");
    var ctx = cvs.getContext("2d");
    var fontSize = 64;
    ctx.font = "bold " + fontSize + "px 'Be Vietnam Pro', sans-serif";
    var metrics = ctx.measureText(data.text);
    var padding = 40;
    var w = metrics.width + padding;
    var h = fontSize + padding;
    cvs.width = w;
    cvs.height = h;
    ctx.font = "bold " + fontSize + "px 'Be Vietnam Pro', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var sh = data.shadow !== undefined ? data.shadow : 5;
    if (sh > 0) {
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = sh * 2;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    }
    ctx.fillStyle = data.color || "#ffffff";
    ctx.fillText(data.text, w / 2, h / 2);
    var tex = new THREE.CanvasTexture(cvs);
    tex.minFilter = THREE.LinearFilter;
    tex.anisotropy = IS_MOBILE_VR
      ? 1
      : renderer.capabilities.getMaxAnisotropy();
    if (item.mesh.material.map) item.mesh.material.map.dispose();
    item.mesh.material.map = tex;
    item.mesh.material.needsUpdate = true;
    var targetHeight = data.size * 1.2;
    var targetWidth = targetHeight * (w / h);
    item.mesh.scale.set(targetWidth / 10, targetHeight / 10, 1);
    updateMeshOrientation(item);
  }

  // ── Three.js State ──
  var renderer, scene, camera, sphereMesh, animId;
  var isInit = false;
  var camLon = 61.6,
    camLat = -19.8;
      // ═══ COMPASS UI ═══
  var compassEl = document.getElementById("tq-compass");
  var compassNeedleEl = compassEl
    ? compassEl.querySelector(".tq-compass-needle")
    : null;
  var compassDirEl = document.getElementById("tq-compass-dir");
  var compassDegEl = document.getElementById("tq-compass-deg");

  function getCompassDirection(deg) {
    var dirs = [
      "BẮC",
      "ĐÔNG BẮC",
      "ĐÔNG",
      "ĐÔNG NAM",
      "NAM",
      "TÂY NAM",
      "TÂY",
      "TÂY BẮC",
    ];
    var normalized = ((deg % 360) + 360) % 360;
    return dirs[Math.round(normalized / 45) % 8];
  }

  function updateCompass() {
    if (!compassEl || !compassNeedleEl) return;

   var COMPASS_OFFSET = -266;
    var normalizedLon = (((camLon + COMPASS_OFFSET) % 360) + 360) % 360;

    // Nếu cần đảo chiều kim, đổi -normalizedLon thành normalizedLon
    compassNeedleEl.style.transform =
      "translate(-50%, -100%) rotate(" + (-normalizedLon).toFixed(2) + "deg)";

    if (compassDirEl) {
      compassDirEl.textContent = getCompassDirection(normalizedLon);
    }

    if (compassDegEl) {
      compassDegEl.textContent = Math.round(normalizedLon) + "°";
    }
  }
  var isDrag = false,
    dSX = 0,
    dSY = 0,
    dSLon = 0,
    dSLat = 0;
  var dragMoved = false;
  var DRAG_SPEED = 0.15;
  var hsEls = [];
  var textMeshItems = [];
  var textureApplied = false;
  var isZooming = false;
  var zoomTimeout = null;
  var initPinchDist = 0;
  var initPinchFov = 45;

  // ★ Performance: throttle hotspot update
  var hsUpdateFrame = 0;
  var HS_UPDATE_INTERVAL = IS_MOBILE_VR ? 3 : 2; // Mỗi 2-3 frame mới update DOM

  function initThree() {
    if (isInit) return;
    isInit = true;

    renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: !IS_MOBILE_VR,
  powerPreference: "high-performance",
});
    renderer.setClearColor(0x080c16, 1);
   renderer.setPixelRatio(
  IS_MOBILE_VR ? 1 : Math.min(window.devicePixelRatio || 1, 2),
);

    scene = new THREE.Scene();

var FOV_DESKTOP = 55;
var FOV_MOBILE = 60; // mobile nhìn rộng hơn, đỡ bị zoom quá gần

camera = new THREE.PerspectiveCamera(
  IS_MOBILE_VR ? FOV_MOBILE : FOV_DESKTOP,
  1,
  1,
  1100
);

// ★ Mobile: giảm segments mạnh hơn
var segments = IS_MOBILE_VR ? 40 : 128;
var segmentsV = IS_MOBILE_VR ? 20 : 64;
var geo = new THREE.SphereGeometry(SPHERE_R, segments, segmentsV);

// Giữ đúng chuẩn panorama: chỉ đảo hình học một lần để tránh mobile render bị mirror.
var mat = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
sphereMesh = new THREE.Mesh(geo, mat);
sphereMesh.scale.x = -1;
scene.add(sphereMesh);

resetAppliedTexture();
  }

  function buildDownscaledCanvas(source, targetWidth, targetHeight) {
    var workCanvas = document.createElement("canvas");
    workCanvas.width = targetWidth;
    workCanvas.height = targetHeight;
    var ctx = workCanvas.getContext("2d", { alpha: false });
    if (!ctx) return source;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
    return workCanvas;
  }

  function resolveTextureSource(source) {
    if (!source || !source.naturalWidth || !source.naturalHeight) {
      return Promise.resolve(source);
    }

    var maxTextureSize =
      renderer && renderer.capabilities && renderer.capabilities.maxTextureSize
        ? renderer.capabilities.maxTextureSize
        : source.naturalWidth;
    var targetWidth = Math.min(source.naturalWidth, maxTextureSize);

    if (IS_MOBILE_VR) {
      targetWidth = Math.min(targetWidth, MOBILE_TEXTURE_MAX_WIDTH);
    }

    if (targetWidth >= source.naturalWidth) {
      return Promise.resolve(source);
    }

    var targetHeight = Math.max(
      1,
      Math.round((source.naturalHeight * targetWidth) / source.naturalWidth),
    );

    if (typeof createImageBitmap === "function") {
      return createImageBitmap(source, {
        resizeWidth: targetWidth,
        resizeHeight: targetHeight,
        resizeQuality: "high",
        imageOrientation: "none",
      }).catch(function () {
        return buildDownscaledCanvas(source, targetWidth, targetHeight);
      });
    }

    return Promise.resolve(
      buildDownscaledCanvas(source, targetWidth, targetHeight),
    );
  }

  // ★ Apply texture — gọi sau khi initThree + panoReady
  function applyTexture() {
    if (
      textureApplied ||
      textureApplyPromise ||
      !panoReady ||
      !panoTexture ||
      !sphereMesh
    ) {
      return;
    }

    textureApplyPromise = resolveTextureSource(panoTexture)
      .then(function (resolvedSource) {
        if (!sphereMesh || !resolvedSource) return;

        releaseOptimizedTextureSource();
        if (resolvedSource !== panoTexture) {
          optimizedTextureSource = resolvedSource;
        }

        var tex = new THREE.Texture(resolvedSource);
        tex.needsUpdate = true;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.anisotropy = IS_MOBILE_VR
          ? 1
          : renderer.capabilities.getMaxAnisotropy();

        if ("colorSpace" in tex && THREE.SRGBColorSpace) {
          tex.colorSpace = THREE.SRGBColorSpace;
        }

        if (sphereMesh.material.map) sphereMesh.material.map.dispose();
        sphereMesh.material.map = tex;
        sphereMesh.material.needsUpdate = true;
        textureApplied = true;
        hideLoading();
      })
      .catch(function () {
        textureApplied = false;
      })
      .then(function () {
        textureApplyPromise = null;
      });
  }

  // ── Hotspots ──
  var hsCreated = false;
  function createHotspots() {
    if (hsCreated) return;
    hsCreated = true;
    hsContainer.innerHTML = "";
    hsEls = [];
    RAW_HOTSPOTS.forEach(function (hs) {
      var pos = hotspot3DPos(hs.px, hs.py);
      var el = document.createElement("div");
      el.className = "tq-hs";
      el.innerHTML =
        '<div class="tq-hs-label">' +
        hs.name +
        '</div><div class="tq-hs-line"></div><div class="tq-hs-dot"></div>';
      el.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      hsContainer.appendChild(el);
      hsEls.push({ el: el, pos: pos, data: hs });
    });
  }

  function create3DTexts() {
    if (textMeshItems.length > 0) return; // Đã tạo rồi
    textMeshItems = [];
    RAW_3D_TEXTS.forEach(function (txt) {
      if (!scene) return;
      var item = { data: txt, pos: hotspot3DPos(txt.px, txt.py), mesh: null };
      updateTextMeshTexture(item);
      textMeshItems.push(item);
    });
  }

  // ★ Cached vector — giảm GC
  var _vec = new THREE.Vector3();

  function updateHotspots() {
    // ★ Throttle: chỉ update DOM mỗi N frames
    hsUpdateFrame++;
    if (hsUpdateFrame % HS_UPDATE_INTERVAL !== 0 && !isDrag) return;

    var w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h || !camera) return;
    camera.updateMatrixWorld(true);

    for (var i = 0; i < hsEls.length; i++) {
      var hs = hsEls[i];
      _vec.copy(hs.pos).project(camera);
      if (_vec.z > 1) {
        hs.el.style.display = "none";
        continue;
      }
      var sx = (0.5 + _vec.x / 2) * w;
      var sy = (0.5 - _vec.y / 2) * h;
      if (sx < -200 || sx > w + 200 || sy < -200 || sy > h + 200) {
        hs.el.style.display = "none";
        continue;
      }
      hs.el.style.display = "";
      // ★ Dùng transform thay vì left/top — GPU accelerated, mượt hơn
      hs.el.style.transform =
        "translate3d(" +
        (sx | 0) +
        "px," +
        (sy | 0) +
        "px,0) translate(-50%, calc(-100% + 5px))";
    }
  }

  // ── Camera drag ──
  function onDown(e) {
    if (e.touches && e.touches.length === 2) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      initPinchDist = Math.sqrt(dx * dx + dy * dy);
      initPinchFov = camera ? camera.fov : 100;
      isDrag = false;
      e.preventDefault();
      return;
    }
    isDrag = true;
    dragMoved = false;
    dSX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    dSY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    dSLon = camLon;
    dSLat = camLat;
    canvas.style.cursor = "grabbing";
    e.preventDefault();
  }

  function onMv(e) {
    if (e.touches && e.touches.length === 2 && initPinchDist > 0) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (camera) {
        camera.fov = Math.max(
          40,
          Math.min(110, initPinchFov * (initPinchDist / dist)),
        );
        camera.updateProjectionMatrix();
        isZooming = true;
        clearTimeout(zoomTimeout);
        zoomTimeout = setTimeout(function () {
          isZooming = false;
        }, 200);
      }
      e.preventDefault();
      return;
    }
    if (!isDrag) return;
    var x = e.clientX || (e.touches && e.touches[0].clientX) || dSX;
    var y = e.clientY || (e.touches && e.touches[0].clientY) || dSY;
    if (Math.abs(x - dSX) > 3 || Math.abs(y - dSY) > 3) dragMoved = true;
    camLon = dSLon - (x - dSX) * DRAG_SPEED;
    camLat = dSLat + (y - dSY) * DRAG_SPEED;
    camLat = Math.max(-85, Math.min(85, camLat));
    e.preventDefault();
  }

  function onUp() {
    isDrag = false;
    initPinchDist = 0;
    canvas.style.cursor = "grab";
  }

  canvas.addEventListener("mousedown", onDown, { passive: false });
  canvas.addEventListener("touchstart", onDown, { passive: false });
  window.addEventListener("mousemove", onMv, { passive: false });
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchmove", onMv, { passive: false });
  window.addEventListener("touchend", onUp);

  canvas.addEventListener(
    "wheel",
    function (e) {
      if (!camera) return;
      camera.fov = Math.max(40, Math.min(100, camera.fov + e.deltaY * 0.05));
      camera.updateProjectionMatrix();
      isZooming = true;
      clearTimeout(zoomTimeout);
      zoomTimeout = setTimeout(function () {
        isZooming = false;
      }, 200);
      e.preventDefault();
    },
    { passive: false },
  );

  // ── Render loop — tối ưu performance ──
  var lastLon = -999,
    lastLat = -999,
    lastFov = -999;
  var idleFrames = 0;
  var MAX_IDLE = 120; // Sau 2 giây idle → giảm tần suất render

  function startRender() {
    stopRender();
    idleFrames = 0;
    lastLon = -999;
    lastLat = -999;
    lastFov = -999;
    hsUpdateFrame = 0;

    (function loop() {
      animId = requestAnimationFrame(loop);

      // ★ Check texture sẵn sàng chưa
      if (!textureApplied && panoReady) {
        applyTexture();
      }

      if (!renderer || !camera || !scene) return;

      var fov = camera.fov;
      var lonChanged = Math.abs(camLon - lastLon) > 0.005;
      var latChanged = Math.abs(camLat - lastLat) > 0.005;
      var fovChanged = Math.abs(fov - lastFov) > 0.01;
      var active =
        isDrag || isZooming || lonChanged || latChanged || fovChanged;

      if (active) {
        idleFrames = 0;
      } else {
        idleFrames++;
        // ★ Idle: chỉ render 1 frame / 10 để tiết kiệm pin/CPU
        if (idleFrames > MAX_IDLE && idleFrames % 10 !== 0) return;
      }

      lastLon = camLon;
      lastLat = camLat;
      lastFov = fov;

      var phi = THREE.MathUtils.degToRad(90 - camLat);
      var theta = THREE.MathUtils.degToRad(camLon);
      camera.lookAt(
        SPHERE_R * Math.sin(phi) * Math.cos(theta),
        SPHERE_R * Math.cos(phi),
        SPHERE_R * Math.sin(phi) * Math.sin(theta),
      );
      renderer.render(scene, camera);
      updateHotspots();
      updateCompass();

    })();
  }

  function stopRender() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  function resizeRenderer() {
    if (!renderer) return;
    var w = overlay.clientWidth || window.innerWidth;
    var h = overlay.clientHeight || window.innerHeight - 80;
    if (w <= 0) w = window.innerWidth;
    if (h <= 0) h = window.innerHeight - 80;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    idleFrames = 0;
  }

  // ── Show / Hide ──
  function showThamQuan() {
  if (window._hideEbrochure) window._hideEbrochure();
  if (window._hideVitri) window._hideVitri();
  if (window._hidePhanKhu) window._hidePhanKhu();
  if (window._hideMatBang) window._hideMatBang();
  if (window._hideTienIch) window._hideTienIch();

  var tiOv = document.getElementById("tienich-overlay");
  if (tiOv) {
    tiOv.classList.remove("visible");
    setTimeout(function () {
      tiOv.style.display = "none";
    }, 400);
  }
  var tiPanel = document.getElementById("ti-panel");
  if (tiPanel) tiPanel.style.display = "none";
  var vrModal = document.getElementById("vr-modal");
  if (vrModal && vrModal.classList.contains("vr-open")) {
    vrModal.classList.remove("vr-open");
    vrModal.style.display = "none";
    if (window._vrStopRender) window._vrStopRender();
  }

  if (stageEl) stageEl.style.opacity = "0";
  if (vignEl) vignEl.style.opacity = "0";
  if (dnEl) dnEl.style.display = "none";
  if (hintEl) hintEl.style.display = "none";

  if (!textureApplied) {
    showLoading();
  }

  overlay.style.display = "block";
  requestAnimationFrame(function () {
    overlay.classList.add("visible");
  });

  initThree();
  thamQuanConfigReady.then(function () {
    createHotspots();
    create3DTexts();

    if (textureApplied) {
      hideLoading();
    } else if (panoReady) {
      applyTexture();
    } else {
      preloadPanoTexture();
    }

    requestAnimationFrame(function () {
      resizeRenderer();
      startRender();
      updateCompass();
    });
  });
}

  function hideThamQuan() {
    stopRender();
    overlay.classList.remove("visible");
    setTimeout(function () {
      overlay.style.display = "none";
    }, 400);
    if (stageEl) stageEl.style.opacity = "1";
    if (vignEl) vignEl.style.opacity = "1";
    if (dnEl) dnEl.style.display = "";
    if (hintEl) hintEl.style.display = "";
  }

  window._hideThamQuan = hideThamQuan;

  if (navThamQuan) {
    navThamQuan.addEventListener("click", function (e) {
      e.preventDefault();
      document.querySelectorAll(".menu-item").forEach(function (i) {
        i.classList.remove("active");
      });
      this.classList.add("active");
      showThamQuan();
    });
  }

  document
    .querySelectorAll(".menu-item:not(#nav-vi-tri)")
    .forEach(function (item) {
      item.addEventListener("click", function () {
        hideThamQuan();
      });
    });

  window.addEventListener("resize", function () {
    if (overlay.style.display !== "none" && renderer) resizeRenderer();
  });

  if (stageEl) stageEl.style.transition = "opacity 0.4s ease";
  if (vignEl) vignEl.style.transition = "opacity 0.4s ease";
})();
