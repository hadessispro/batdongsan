var lon = 0,
  lat = 0,
  camera,
  scene,
  renderer,
  sphere,
  animId,
  isTransitioning = false,
  isDrag = false,
  startX = 0,
  startY = 0,
  startLon = 0,
  startLat = 0,
  initPinchDist = 0,
  initFov = 90;

// ═══════════════════════════════════════════════════════════
//  BÍCH ĐỘNG LAKESIDE — 360° Viewer | ECOVILLAGE-STYLE ENGINE
//
//  Kiến trúc: 1 <canvas> duy nhất + drawImage từ cached Image()
//  - Preload vào Image objects (KHÔNG ở DOM)
//  - Draw = canvas.drawImage(cachedImg) — ZERO flicker
//  - Browser tự quản lý memory eviction
//  - Mobile: vào xoay sớm, tải ngầm phần còn lại
// ═══════════════════════════════════════════════════════════

const TOTAL_FRAMES = 75;
const DRAG_SENSITIVITY = 0.22;
const INERTIA_DECAY = IS_MOBILE_CHECK() ? 0.85 : 0.9;
const INERTIA_THRESHOLD = IS_MOBILE_CHECK() ? 0.02 : 0.008;
const SCROLL_STEP = 2;

function IS_MOBILE_CHECK() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}
const IS_MOBILE = IS_MOBILE_CHECK();

const ENTRY_COUNT = IS_MOBILE ? 10 : 15;
const PRELOAD_COUNT = 75;
const MAX_CONCURRENT = IS_MOBILE ? 2 : 3;

function buildList(folder) {
  return Array.from(
    { length: TOTAL_FRAMES },
    (_, i) =>
      "frames/" +
      folder +
      "/PANO_" +
      String(i + 1).padStart(2, "0") +
      "_" +
      String(i + 1).padStart(4, "0") +
      ".webp",
  );
}
const SETS = { day: buildList("day"), night: buildList("night") };

// ═══════════════════════════════════════════════════════════
//  ★ CANVAS + IMAGE CACHE ENGINE
//  Dùng <canvas> thay vì <img> — drawImage() từ cached Image
//  → Không flicker, không layout shift, không composite layer
// ═══════════════════════════════════════════════════════════

const imgCache = {
  day: new Array(TOTAL_FRAMES).fill(null),
  night: new Array(TOTAL_FRAMES).fill(null),
};
const fLoaded = {
  day: new Array(TOTAL_FRAMES).fill(false),
  night: new Array(TOTAL_FRAMES).fill(false),
};
const fLoading = {
  day: new Array(TOTAL_FRAMES).fill(false),
  night: new Array(TOTAL_FRAMES).fill(false),
};

// ★ Canvas element — vẽ frame trực tiếp, zero flicker
let displayCanvas = null;
let displayCtx = null;

// ★ Fallback <img> cho crossfade day/night
let fadeImg = null;

function createDisplayCanvas() {
  const container = document.getElementById("frame-container");
  if (!container) return;

  // ★ Canvas chính — vẽ frame bằng drawImage
  displayCanvas = document.createElement("canvas");
  displayCanvas.className = "frame-canvas";
  displayCanvas.style.cssText =
    "position:absolute;top:0;left:0;width:100%;height:100%;" +
    "display:block;object-fit:cover;pointer-events:none;z-index:5;";
  container.appendChild(displayCanvas);
  displayCtx = displayCanvas.getContext("2d", { alpha: false });

  // Fade overlay cho chuyển day/night
  fadeImg = document.createElement("canvas");
  fadeImg.className = "frame-canvas-fade";
  fadeImg.style.cssText =
    "position:absolute;top:0;left:0;width:100%;height:100%;" +
    "display:none;opacity:0;pointer-events:none;z-index:3;" +
    "transition:opacity 0.6s ease;";
  container.appendChild(fadeImg);
}

// ★ Resize canvas resolution to match display size
function resizeDisplayCanvas() {
  if (!displayCanvas) return;
  var rect = displayCanvas.getBoundingClientRect();
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = Math.round(rect.width * dpr);
  var h = Math.round(rect.height * dpr);
  if (displayCanvas.width !== w || displayCanvas.height !== h) {
    displayCanvas.width = w;
    displayCanvas.height = h;
    fadeImg.width = w;
    fadeImg.height = h;
    lastFi = -1; // Force redraw
  }
}

// ── Load Queue ────────────────────────────────────────────────
let activeLoads = 0,
  nLoaded = 0;
const TOTAL_LOAD = PRELOAD_COUNT;
let engineStarted = false;
const loadQueue = [];
let queueProcessing = false;

function processQueue() {
  if (queueProcessing) return;
  queueProcessing = true;

  while (activeLoads < MAX_CONCURRENT && loadQueue.length > 0) {
    const task = loadQueue.shift();
    if (fLoaded[task.set][task.fi] || fLoading[task.set][task.fi]) continue;

    fLoading[task.set][task.fi] = true;
    activeLoads++;

    const cacheImg = new Image();
    imgCache[task.set][task.fi] = cacheImg;

    const finish = () => {
      const handleReady = () => {
        fLoaded[task.set][task.fi] = true;
        fLoading[task.set][task.fi] = false;
        activeLoads--;
        nLoaded++;
        updateProgress();
        if (task.cb) task.cb();
        requestAnimationFrame(draw);
        processQueue();
      };

      if (cacheImg.decode) {
        cacheImg.decode().then(handleReady).catch(handleReady);
      } else {
        handleReady();
      }
    };

    cacheImg.onload = finish;
    cacheImg.onerror = () => {
      fLoaded[task.set][task.fi] = true; // ★ Mark as "loaded" even on error to prevent stuck
      fLoading[task.set][task.fi] = false;
      activeLoads--;
      nLoaded++;
      updateProgress();
      if (task.cb) task.cb();
      processQueue();
    };
    cacheImg.src = SETS[task.set][task.fi];
  }
  queueProcessing = false;
}

function loadFrame(set, fi, cb) {
  if (fLoaded[set][fi]) {
    cb && cb();
    return;
  }
  loadQueue.push({ set, fi, cb });
  processQueue();
}

function loadSmartBg() {
  const fi =
    ((Math.round(frameF) % TOTAL_FRAMES) + TOTAL_FRAMES) % TOTAL_FRAMES;
  const RADIUS = IS_MOBILE ? 40 : TOTAL_FRAMES;

  for (let r = 0; r <= RADIUS; r++) {
    const a = (fi + r) % TOTAL_FRAMES;
    const b = (fi - r + TOTAL_FRAMES) % TOTAL_FRAMES;
    if (!fLoaded[currentSet][a] && !fLoading[currentSet][a])
      loadFrame(currentSet, a, null);
    if (r > 0 && !fLoaded[currentSet][b] && !fLoading[currentSet][b])
      loadFrame(currentSet, b, null);
  }

  if (IS_MOBILE) {
    setTimeout(() => {
      for (let i = 0; i < TOTAL_FRAMES; i++) {
        if (!fLoaded[currentSet][i] && !fLoading[currentSet][i])
          loadFrame(currentSet, i, null);
      }
    }, 2000);
  }

  if (!IS_MOBILE) {
    const other = currentSet === "day" ? "night" : "day";
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      if (!fLoaded[other][i] && !fLoading[other][i]) loadFrame(other, i, null);
    }
  }
}

function updateProgress() {
  const pct = Math.min((nLoaded / TOTAL_LOAD) * 100, 100) | 0;
  const ldf = document.getElementById("ldf");
  const lds = document.getElementById("lds");
  if (ldf) ldf.style.width = pct + "%";
  if (lds) lds.textContent = pct + "%";

  const moBar = document.getElementById("mo-bar-fill");
  const moCircle = document.getElementById("mo-circle-fill");
  const moStatus = document.getElementById("mo-status");
  const moBtnText = document.getElementById("btn-orient-text");
  const moBtn = document.getElementById("btn-close-orient");

  if (moBar) moBar.style.width = pct + "%";
  if (moCircle) {
    moCircle.style.strokeDashoffset = 283 * (1 - pct / 100);
  }

  if (moStatus) {
    if (nLoaded < ENTRY_COUNT)
      moStatus.textContent = "ĐANG TẢI DỮ LIỆU... " + pct + "%";
    else if (nLoaded < PRELOAD_COUNT)
      moStatus.textContent = "ĐANG TỐI ƯU HÓA HÌNH ẢNH...";
    else moStatus.textContent = "HỆ THỐNG ĐÃ SẴN SÀNG";
  }

  if (moBtn) {
    if (nLoaded >= ENTRY_COUNT) {
      moBtn.removeAttribute("disabled");
      if (moBtnText) moBtnText.textContent = "KHÁM PHÁ NGAY";

      // ★ FIX 2: Mobile — tự động dismiss overlay khi đủ frames
      // Không cần user bấm nút nữa
      if (!window._mobileAutoDismissed) {
        window._mobileAutoDismissed = true;
        // Delay nhỏ để user thấy "HỆ THỐNG ĐÃ SẴN SÀNG" 1 chút
        setTimeout(function () {
          var ov = document.getElementById("mobile-orient-overlay");
          if (ov && !ov.classList.contains("hide")) {
            ov.classList.add("hide");
            // Ẩn loading nếu đã xong
            if (nLoaded >= PRELOAD_COUNT) {
              var ld = document.getElementById("loading");
              if (ld) {
                ld.style.opacity = "0";
                setTimeout(function () {
                  ld.style.display = "none";
                }, 1200);
              }
            }
            setTimeout(function () {
              if (ov.parentNode) ov.parentNode.removeChild(ov);
            }, 500);
          }
        }, 800); // 800ms delay — đủ để animation loading bar chạy tới 100%
      }
    } else {
      if (moBtnText) moBtnText.textContent = "VUI LÒNG ĐỢI... " + pct + "%";
    }
  }
}

// ── Viewer State ──────────────────────────────────────────────
let currentSet = "day",
  frameF = 55,
  lastFi = -1,
  lastSet = "";

// ═══════════════════════════════════════════════════════════
//  ★ DRAW — Canvas drawImage engine
//  Vẽ trực tiếp cached Image lên canvas
//  ZERO flicker — không src swap, không display toggle
// ═══════════════════════════════════════════════════════════
let drawPending = false;

function draw() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(() => {
    drawPending = false;
    if (!displayCtx || !displayCanvas) return;

    const fi =
      ((Math.round(frameF) % TOTAL_FRAMES) + TOTAL_FRAMES) % TOTAL_FRAMES;
    if (fi === lastFi && currentSet === lastSet) return;

    // Tìm frame gần nhất đã load
    let targetFi = fi;
    if (!fLoaded[currentSet][targetFi] || !imgCache[currentSet][targetFi]) {
      for (let d = 1; d < TOTAL_FRAMES; d++) {
        const nearFi = (targetFi - d + TOTAL_FRAMES) % TOTAL_FRAMES;
        if (fLoaded[currentSet][nearFi] && imgCache[currentSet][nearFi]) {
          targetFi = nearFi;
          break;
        }
      }
    }

    const cachedImg = imgCache[currentSet][targetFi];
    if (!cachedImg || !cachedImg.complete || !cachedImg.naturalWidth) return;

    // ★ CROSSFADE DAY/NIGHT
    if (currentSet !== lastSet && lastSet) {
      // Snapshot current canvas → fade canvas (giữ nguyên kích thước)
      fadeImg.width = displayCanvas.width;
      fadeImg.height = displayCanvas.height;
      var fadeCtx = fadeImg.getContext("2d", { alpha: false });
      fadeCtx.drawImage(displayCanvas, 0, 0);
      fadeImg.style.display = "block";
      fadeImg.style.opacity = "1";
      fadeImg.style.transition = "none";
      void fadeImg.offsetWidth;
      fadeImg.style.transition = "opacity 0.6s ease";
      fadeImg.style.opacity = "0";
      setTimeout(() => {
        fadeImg.style.display = "none";
      }, 650);
    }

    // ★ DRAW — drawImage với object-fit: cover logic
    // Giữ tỷ lệ ảnh gốc, crop + center giống CSS object-fit: cover
    resizeDisplayCanvas();

    var cw = displayCanvas.width;
    var ch = displayCanvas.height;
    var iw = cachedImg.naturalWidth;
    var ih = cachedImg.naturalHeight;

    // Object-fit: cover — scale ảnh để phủ hết canvas, crop phần thừa
    var scale = Math.max(cw / iw, ch / ih);
    var sw = cw / scale; // Vùng cắt từ ảnh gốc (width)
    var sh = ch / scale; // Vùng cắt từ ảnh gốc (height)
    var sx = (iw - sw) / 2; // Offset X (center)
    var sy = (ih - sh) / 2; // Offset Y (center)

    displayCtx.drawImage(cachedImg, sx, sy, sw, sh, 0, 0, cw, ch);

    lastFi = fi;
    lastSet = currentSet;
  });
}

// ── Inertia ───────────────────────────────────────────────────
let inertia = 0,
  tickRunning = false;
function tick() {
  if (!dragging && Math.abs(inertia) > INERTIA_THRESHOLD) {
    frameF += inertia;
    inertia *= INERTIA_DECAY;
    lastFi = -1;
    draw();
    requestAnimationFrame(tick);
  } else if (dragging) {
    requestAnimationFrame(tick);
  } else {
    inertia = 0;
    tickRunning = false;
  }
}
function ensureTick() {
  if (!tickRunning) {
    tickRunning = true;
    requestAnimationFrame(tick);
  }
}

// ── Drag ─────────────────────────────────────────────────────
let dragging = false,
  prevX = 0,
  prevT = 0,
  velX = 0;

function getClientX(e) {
  if (e.changedTouches && e.changedTouches.length > 0)
    return e.changedTouches[0].clientX;
  if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
  return e.clientX || 0;
}

function pDown(e) {
  dragging = true;
  prevX = getClientX(e);
  prevT = performance.now();
  velX = 0;
  inertia = 0;
  ensureTick();
}

function pMove(e) {
  if (!dragging) return;
  const x = getClientX(e);
  const dx = x - prevX;
  if (dx !== 0) {
    frameF += dx * DRAG_SENSITIVITY;
    velX = dx / Math.max(performance.now() - prevT, 1);
  }
  prevX = x;
  prevT = performance.now();
  lastFi = -1;
  draw();

  // Prefetch hướng kéo
  const dir = velX > 0 ? 1 : -1;
  const cur =
    ((Math.round(frameF) % TOTAL_FRAMES) + TOTAL_FRAMES) % TOTAL_FRAMES;
  const PREFETCH = IS_MOBILE ? 10 : 8;
  for (let k = 1; k <= PREFETCH; k++) {
    const next =
      (((cur + dir * k) % TOTAL_FRAMES) + TOTAL_FRAMES) % TOTAL_FRAMES;
    if (!fLoaded[currentSet][next]) loadFrame(currentSet, next, null);
  }
  if (e.cancelable) e.preventDefault();
}

function pUp() {
  if (!dragging) return;
  dragging = false;
  inertia = velX * 16 * DRAG_SENSITIVITY;
  ensureTick();
  if (IS_MOBILE) setTimeout(loadSmartBg, 300);
}

function onWheel(e) {
  frameF += (e.deltaY > 0 ? -1 : 1) * SCROLL_STEP;
  inertia = 0;
  lastFi = -1;
  draw();
  e.preventDefault();
}

// ── Bind events ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  const stage = document.getElementById("stage");
  if (stage) {
    stage.style.cursor = "grab";
    stage.addEventListener("mousedown", pDown, { passive: false });
    stage.addEventListener("touchstart", pDown, { passive: true });
    stage.addEventListener("touchmove", pMove, { passive: false });
    stage.addEventListener("touchend", pUp);
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("contextmenu", (e) => e.preventDefault());
    stage.addEventListener(
      "mousedown",
      () => (stage.style.cursor = "grabbing"),
    );
    window.addEventListener("mouseup", () => (stage.style.cursor = "grab"));
  }
  window.addEventListener("mousemove", pMove, { passive: false });
  window.addEventListener("mouseup", pUp);

  const ov = document.getElementById("mobile-orient-overlay");
  const bc = document.getElementById("btn-close-orient");
  if (bc && ov) {
    const handleDismiss = (e) => {
      if (bc.hasAttribute("disabled")) return;
      e.stopPropagation();
      e.preventDefault();
      ov.classList.add("hide");
      if (nLoaded >= PRELOAD_COUNT) {
        const ld = document.getElementById("loading");
        if (ld) {
          ld.style.opacity = "0";
          setTimeout(() => (ld.style.display = "none"), 1200);
        }
      }
      setTimeout(() => {
        if (ov.parentNode) ov.parentNode.removeChild(ov);
      }, 500);
    };
    bc.addEventListener("click", handleDismiss);
    bc.addEventListener("touchstart", handleDismiss, { passive: false });
  }
  ensureTick();
});

// Pause khi tab ẩn
document.addEventListener("visibilitychange", () => {
  if (document.hidden) loadQueue.length = 0;
  else setTimeout(loadSmartBg, 500);
});

function handleResize() {
  resizeDisplayCanvas();
  lastFi = -1;
  draw();
}

// ── Start Engine ──────────────────────────────────────────────
function startEngine() {
  const btnDay = document.getElementById("btn-day");
  const btnNight = document.getElementById("btn-night");

  if (btnDay)
    btnDay.addEventListener("click", () => {
      if (currentSet === "day") return;
      currentSet = "day";
      lastFi = -1;
      draw();
      btnDay.classList.add("active");
      if (btnNight) btnNight.classList.remove("active");
      setTimeout(loadSmartBg, 100);
    });

  if (btnNight)
    btnNight.addEventListener("click", () => {
      if (currentSet === "night") return;

      var hasNightFrames = fLoaded.night.some(Boolean);
      if (!hasNightFrames) {
        var fi =
          ((Math.round(frameF) % TOTAL_FRAMES) + TOTAL_FRAMES) % TOTAL_FRAMES;
        var switched = false;
        function onFirstNightFrame() {
          if (switched) return;
          switched = true;
          currentSet = "night";
          lastFi = -1;
          draw();
          btnNight.classList.add("active");
          if (btnDay) btnDay.classList.remove("active");
          setTimeout(loadSmartBg, 100);
        }
        loadFrame("night", fi, onFirstNightFrame);
        for (var r = 1; r <= 10; r++) {
          loadFrame("night", (fi + r) % TOTAL_FRAMES, null);
          loadFrame("night", (fi - r + TOTAL_FRAMES) % TOTAL_FRAMES, null);
        }
        for (var i = 0; i < TOTAL_FRAMES; i++) {
          if (!fLoaded.night[i] && !fLoading.night[i])
            loadFrame("night", i, null);
        }
        return;
      }

      currentSet = "night";
      lastFi = -1;
      draw();
      btnNight.classList.add("active");
      if (btnDay) btnDay.classList.remove("active");
      setTimeout(loadSmartBg, 100);
    });

  currentSet = "day";
  lastFi = -1;
  if (btnDay) {
    btnDay.classList.add("active");
    if (btnNight) btnNight.classList.remove("active");
  }

  const badge = document.getElementById("auto-badge");
  if (badge) badge.style.display = "none";
  const hTxt = document.querySelector(".h-txt");
  if (hTxt) hTxt.textContent = "Xoay Trái/Phải Dễ Dàng Quan Sát Toàn Cảnh";

  document.querySelectorAll(".menu-item").forEach((item) => {
    item.addEventListener("click", function (e) {
      e.preventDefault();
      document
        .querySelectorAll(".menu-item")
        .forEach((i) => i.classList.remove("active"));
      this.classList.add("active");
      if (this.id !== "nav-tien-ich") {
        const vrModal = document.getElementById("vr-modal");
        if (vrModal && vrModal.classList.contains("vr-open")) {
          vrModal.classList.remove("vr-open");
          vrModal.style.display = "none";
          if (window._vrStopRender) window._vrStopRender();
        }
        const panel = document.getElementById("ti-panel");
        if (panel) panel.style.display = "none";
      }
    });
  });

  const stage = document.getElementById("stage");
  if (stage) stage.style.cursor = "grab";
  window.addEventListener("resize", handleResize);
  handleResize();
  draw();
}



const INITIAL_FRAME = 55; // Góc chính diện

// GIỮ NGUYÊN dòng cũ: let frameF = 58;  ← KHÔNG thêm let mới


// ──────────────────────────────────────────────────────────
//  SỬA 2: Thay thế HÀM loadAll() cũ bằng hàm dưới đây
// ──────────────────────────────────────────────────────────

function loadAll() {
  createDisplayCanvas();

  let done = 0;
  const check = () => {
    done++;
    if (done >= ENTRY_COUNT && !engineStarted) {
      engineStarted = true;
      startEngine();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementById("loading");
          if (el) {
            el.style.transition = "opacity 0.8s ease";
            el.style.opacity = "0";
            setTimeout(() => {
              el.style.display = "none";
            }, 800);
          }
          setTimeout(loadSmartBg, 500);
        });
      });
    }
  };

  // ★ FIX: Load frame chính diện TRƯỚC TIÊN
  loadFrame("day", INITIAL_FRAME, () => {
    // Vẽ ngay frame chính diện
    lastFi = -1;
    draw();
    check();

    // Load các frame xung quanh (gần → xa từ frame 58)
    for (let r = 1; r < TOTAL_FRAMES; r++) {
      const a = (INITIAL_FRAME + r) % TOTAL_FRAMES;
      const b = (INITIAL_FRAME - r + TOTAL_FRAMES) % TOTAL_FRAMES;
      if (a !== INITIAL_FRAME) loadFrame("day", a, check);
      if (b !== INITIAL_FRAME && b !== a) loadFrame("day", b, check);
    }
  });

  // Safety timeout
  setTimeout(() => {
    if (!engineStarted && nLoaded >= 10) {
      console.warn("[360] Safety timeout — force start with", nLoaded, "frames");
      engineStarted = true;
      startEngine();
      const el = document.getElementById("loading");
      if (el) {
        el.style.transition = "opacity 0.8s ease";
        el.style.opacity = "0";
        setTimeout(() => {
          el.style.display = "none";
        }, 800);
      }
      setTimeout(loadSmartBg, 500);
    }
  }, 15000);
}
loadAll();

(function initTienIch() {
  const overlay = document.getElementById("tienich-overlay");
  const navTienIch = document.getElementById("nav-tien-ich");
  const navToanCanh = document.getElementById("nav-toan-canh");
  const stage = document.getElementById("stage");
  const vign = document.querySelector(".vign");
  const dn = document.getElementById("dn");
  const hint = document.getElementById("hint");

  if (!overlay || !navTienIch) return;

  // Hiện overlay tiện ích, ẩn viewer 360
  function showTienIch() {
    // Ẩn các overlay khác
    if (window._hideEbrochure) window._hideEbrochure();
    if (window._hideVitri) window._hideVitri();
    if (window._hidePhanKhu) window._hidePhanKhu();
    if (window._hideThamQuan) window._hideThamQuan();
    if (window._hideMatBang) window._hideMatBang();

    overlay.style.display = "block";
    requestAnimationFrame(() => overlay.classList.add("visible"));
    if (stage) stage.style.opacity = "0";
    if (vign) vign.style.opacity = "0";
    if (dn) dn.style.display = "none";
    if (hint) hint.style.display = "none";
    const panel = document.getElementById("ti-panel");
    if (panel) panel.style.display = "block";

    // ★ Preload tất cả VR thumbnail ngay khi mở Tiện Ích
    if (window._preloadVRThumbs) window._preloadVRThumbs();
  }

  // Ẩn overlay, hiện lại viewer 360
  function hideTienIch() {
    overlay.classList.remove("visible");
    setTimeout(() => {
      overlay.style.display = "none";
    }, 400);
    if (stage) stage.style.opacity = "1";
    if (vign) vign.style.opacity = "1";
    if (dn) dn.style.display = "";
    if (hint) hint.style.display = "";
    // Ẩn ti-panel
    const panel = document.getElementById("ti-panel");
    if (panel) panel.style.display = "none";
  }

  // Gán sự kiện click cho nav TIỆN ÍCH
  navTienIch.addEventListener("click", function (e) {
    e.preventDefault();
    document
      .querySelectorAll(".menu-item")
      .forEach((i) => i.classList.remove("active"));
    this.classList.add("active");

    // Mobile → mở VR360 thẳng luôn
    if (window.innerWidth <= 768) {
      if (window._preloadVRThumbs) window._preloadVRThumbs();
      if (window.openVR360) {
        window.openVR360(
          "Tổng Quan Tiện Ích",
          "frames/3dvr/PANO_1_2.jpg",
          0,
          -30,
        );
      }
      // Hiện ti-panel để có thể chọn tiện ích khác
      const panel = document.getElementById("ti-panel");
      if (panel) panel.style.display = "block";
      return;
    }

    // Desktop → hiện overlay tiện ích bình thường
    showTienIch();
  });

  // Các tab khác → ẩn tiện ích + đóng VR
  document.querySelectorAll(".menu-item:not(#nav-tien-ich)").forEach((item) => {
    item.addEventListener("click", function () {
      hideTienIch();
      // Đóng VR nếu đang mở
      const vrModal = document.getElementById("vr-modal");
      if (vrModal && vrModal.classList.contains("vr-open")) {
        vrModal.classList.remove("vr-open");
        setTimeout(() => {
          vrModal.style.display = "none";
        }, 300);
        if (window._vrStopRender) window._vrStopRender();
        // Hiện lại ti-panel ẩn
        const panel = document.getElementById("ti-panel");
        if (panel) panel.style.opacity = "1";
      }
    });
  });

  // Thêm style transition cho stage
  if (stage) stage.style.transition = "opacity 0.4s ease";
  if (vign) vign.style.transition = "opacity 0.4s ease";
})();

// ── Tiện Ích Bottom Panel Logic ────────────────────────────
(function initTiPanel() {
  // Dữ liệu sub-items cho từng nút (Sẽ được nạp động từ VR_HS_DATA)
  var GROUP_DATA = { g1: [], g2: [], g3: [], g4: [], g5: [] };

  window.syncAmenityMenu = function () {
    if (!window._DYNAMIC_AMENITIES) return;
    // Reset
    GROUP_DATA = { g1: [], g2: [], g3: [], g4: [], g5: [] };
    Object.keys(window._DYNAMIC_AMENITIES)
      .sort(function (a, b) {
        var numA = parseInt(a) || 999;
        var numB = parseInt(b) || 999;
        return numA - numB;
      })
      .forEach(function (label) {
        var num = parseInt(label);
        // g1 CỔNG CHÀO:           1-5
        // g2 QUẢNG TRƯỜNG:        6-14
        // g5 TIỆN ÍCH SINH THÁI: 15-25
        // g3 TOÀ NHÀ PHỨC HỢP:   26-33
        // g4 TUYẾN VEN SÔNG:      34+
        if (num >= 1 && num <= 5) GROUP_DATA.g1.push(label);
        else if (num >= 6 && num <= 14) GROUP_DATA.g2.push(label);
        else if (num >= 15 && num <= 25) GROUP_DATA.g5.push(label);
        else if (num >= 26 && num <= 33) GROUP_DATA.g3.push(label);
        else if (num >= 34) GROUP_DATA.g4.push(label);
        else GROUP_DATA.g5.push(label);
      });
  };

  // ═══════════════════════════════════════════════════════════
  //  MASTER PLAN OVERVIEW — 42 HOTSPOTS + DRAG EDITOR
  // ═══════════════════════════════════════════════════════════
  const OVERVIEW_DATA = {
    "CỔNG CHÀO": { "top": 34.9, "left": 42.24, "type": "flag" },
    "QUẢNG TRƯỜNG": { "top": 33.57, "left": 59.11, "type": "flag" },
    "VEN SÔNG": { "top": 38.15, "left": 29.38, "type": "flag" },
    "TOÀ PHỨC HỢP CAO TẦNG": { "top": 84.84, "left": 59.48, "type": "flag" },
    "TIỆN ÍCH SINH THÁI": { "top": 47.77, "left": 75.99, "type": "flag" },
    "Cổng Dự Án": { "top": 40.67, "left": 39.95, "icon": "fa-solid fa-archway", "group": "g1" },
    "Bãi Đỗ Xe 1": { "top": 39.35, "left": 46.46, "icon": "fa-solid fa-car", "group": "g1" },
    "Trạm Sạc Xe Điện": { "top": 38.99, "left": 49.01, "icon": "fa-solid fa-bolt-lightning", "group": "g1" },
    "Đài Phun Nước": { "top": 38.51, "left": 52.4, "icon": "fa-solid fa-faucet-drip", "group": "g1" },
    "Trung Tâm Thương Mại 1": { "top": 39.95, "left": 42.92, "icon": "fa-solid fa-store", "group": "g1" },
    "Trung Tâm Thương Mại 2": { "top": 70.64, "left": 71.41, "icon": "fa-solid fa-store", "group": "g1" },
    "Quảng Trường Cây Xanh": { "top": 38.27, "left": 50.78, "icon": "fa-solid fa-tree", "group": "g2" },
    "Hồ Vọng Nguyệt": { "top": 36.82, "left": 54.11, "icon": "fa-solid fa-moon", "group": "g2" },
    "Gym Ngoài Trời": { "top": 42.36, "left": 52.29, "icon": "fa-solid fa-person-walking", "group": "g2" },
    "Vườn Tri Thức": { "top": 40.55, "left": 54.64, "icon": "fa-solid fa-book-open", "group": "g2" },
    "Khu Vui Chơi Trẻ Em": { "top": 44.65, "left": 54.17, "icon": "fa-solid fa-children", "group": "g2" },
    "Bàn Đá Chơi Cờ": { "top": 43.92, "left": 56.2, "icon": "fa-solid fa-chess-board", "group": "g2" },
    "Sân Bóng Đá": { "top": 38.03, "left": 55.89, "icon": "fa-solid fa-futbol", "group": "g2" },
    "Khán Đài Mini": { "top": 40.43, "left": 57.76, "icon": "fa-solid fa-users-rectangle", "group": "g2" },
    "Ghế Nghỉ": { "top": 44.65, "left": 58.54, "icon": "fa-solid fa-chair", "group": "g2" },
    "Nhà Sinh Hoạt Cộng Đồng": { "top": 73.65, "left": 80.89, "icon": "fa-solid fa-house-chimney-user", "group": "g3" },
    "Bể Bơi Chân Toà Nhà Hỗn Hợp": { "top": 72.56, "left": 59.11, "icon": "fa-solid fa-person-swimming", "group": "g3" },
    "Công Viên Cây Xanh": { "top": 67.03, "left": 60, "icon": "fa-solid fa-tree", "group": "g3" },
    "Siêu Thị Khối Đế": { "top": 79.06, "left": 58.54, "icon": "fa-solid fa-cart-shopping", "group": "g3" },
    "Spa Khối Đế": { "top": 76.65, "left": 52.86, "icon": "fa-solid fa-spa", "group": "g3" },
    "Cafe - Restaurant Khối Đế": { "top": 85.08, "left": 68.02, "icon": "fa-solid fa-mug-hot", "group": "g3" },
    "Biểu Tượng Dự Án": { "top": 48.5, "left": 23.91, "icon": "fa-solid fa-star", "group": "g4" },
    "Biển Tên Dự Án": { "top": 56.92, "left": 27.34, "icon": "fa-solid fa-sign-hanging", "group": "g4" },
    "Đài Vọng Cảnh": { "top": 68.47, "left": 33.07, "icon": "fa-solid fa-eye", "group": "g4" },
    "Thềm Viễn Cảnh": { "top": 62.45, "left": 30.21, "icon": "fa-solid fa-binoculars", "group": "g4" },
    "Điểm Nhấn Ánh Dương": { "top": 73.29, "left": 36.04, "icon": "fa-solid fa-sun", "group": "g4" },
    "Khu Nướng BBQ": { "top": 44.52, "left": 67.92, "icon": "fa-solid fa-fire-burner", "group": "g5" },
    "Vườn Dưỡng Sinh": { "top": 47.41, "left": 63.59, "icon": "fa-solid fa-leaf", "group": "g5" },
    "Vườn Thảo Mộc": { "top": 43.56, "left": 64.9, "icon": "fa-solid fa-leaf", "group": "g5" },
    "Khu Camping": { "top": 49.22, "left": 67.76, "icon": "fa-solid fa-campground", "group": "g5" },
    "Trường Mầm Non": { "top": 41.4, "left": 59.17, "icon": "fa-solid fa-school", "group": "g5" },
    "Sân Bóng Rổ": { "top": 58.84, "left": 70.83, "icon": "fa-solid fa-basketball", "group": "g5" },
    "Bãi Đỗ Xe 2": { "top": 52.71, "left": 72.66, "icon": "fa-solid fa-car", "group": "g5" },
    "Sân Pickleball": { "top": 58.36, "left": 73.02, "icon": "fa-solid fa-table-tennis-paddle-ball", "group": "g5" },
    "Bãi Đỗ Xe 3": { "top": 47.89, "left": 69.79, "icon": "fa-solid fa-car", "group": "g5" },
  };

  window.initOverviewMasterPlan = function () {
    const container = document.getElementById("tienich-alldot");
    if (!container) return;

    // Clear existing
    container.innerHTML = "";
    container.classList.remove("edit-mode");

    // Generate hotspots
    Object.keys(OVERVIEW_DATA).forEach((name) => {
      const config = OVERVIEW_DATA[name];
      const el = document.createElement("div");

      if (config.type === "flag") {
        el.className = "flag-hotspot";
        el.innerHTML = `<span>${name}</span>`;
      } else {
        el.className = "dot-wrapper";
        el.dataset.group = config.group;
        el.innerHTML = `
          <div class="dot-pin"><i class="${config.icon || "fa-solid fa-circle"}"></i></div>
          <span class="dot-label">${name}</span>
        `;
      }

      el.style.top = config.top + "%";
      el.style.left = config.left + "%";
      el.dataset.name = name;

      // Click to navigate to VR (chỉ dành cho dots)
      if (config.type !== "flag") {
        el.addEventListener("click", () => {
          if (window.openVRByName) window.openVRByName(name);
        });
      }

      container.appendChild(el);
    });
  };

  // Khởi tạo Master Plan khi bật tab TIỆN ÍCH
  const navTI = document.getElementById("nav-tien-ich");
  if (navTI) {
    navTI.addEventListener("click", () => {
      setTimeout(window.initOverviewMasterPlan, 300);
    });
  }

  const popup = document.getElementById("ti-popup");
  const popupItems = document.getElementById("ti-popup-items");
  let activeBtn = null;

  document.querySelectorAll(".ti-btn").forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const group = this.dataset.group;

      // Toggle: click lại thì đóng
      if (activeBtn === this) {
        closePopup();
        return;
      }

      // Reset các nút khác về tên gốc trước khi đặt active mới
      document.querySelectorAll(".ti-btn").forEach((b) => {
        if (b.hasAttribute("data-original")) {
          b.querySelector("span").textContent = b.getAttribute("data-original");
        }
        b.classList.remove("active");
      });

      this.classList.add("active");
      activeBtn = this;

      // Build popup content
      const items = GROUP_DATA[group] || [];
      popupItems.innerHTML = items
        .map(
          (name) =>
            `<div class="ti-sub-item" data-raw="${name}">${name.replace(/^\d+\.\s*/, "")}</div>`,
        )
        .join("");

      // Định vị popup ngay trên nút được click
      const btnRect = this.getBoundingClientRect();
      const panel = document.getElementById("ti-panel");
      const panelRect = panel.getBoundingClientRect();
      const centerX = btnRect.left + btnRect.width / 2 - panelRect.left;

      popup.style.left = centerX + "px";
      popup.style.display = "block";
    });
  });

  // Expose function to open VR by amenity name
  window.openVRByName = function (name) {
    const data = window._getVRConfig ? window._getVRConfig(name) : null;
    if (data && data.src) {
      window.openVR360(name, data.src, data.lon, data.lat);
    }
  };

  function closePopup() {
    popup.style.display = "none";
    document
      .querySelectorAll(".ti-btn")
      .forEach((b) => b.classList.remove("active"));
    activeBtn = null;
  }

  // Click ngoài → đóng popup
  document.addEventListener("click", function () {
    closePopup();
  });
  if (popup) {
    popup.addEventListener("click", function (e) {
      // Nếu click vào sub-item → mở VR, sau đó đóng popup
      var sub = e.target.closest(".ti-sub-item");
      if (sub) {
        var name = sub.textContent.trim();
        var rawName = sub.getAttribute("data-raw") || name;
        if (window.openVR360) {
          if (activeBtn && !activeBtn.hasAttribute("data-original")) {
            activeBtn.setAttribute(
              "data-original",
              activeBtn.querySelector("span").textContent,
            );
          }
          if (activeBtn) activeBtn.querySelector("span").textContent = name;

          window._vrCurrentRawName = rawName; // Lưu rawName để openVR dùng

          // ── KHỚP NHÃN THÔNG MINH ──
          var cleanName = name.replace(/^\d+\.\s*/, "");
          var config = window._getVRConfig
            ? window._getVRConfig(cleanName, rawName)
            : null;
          if (!config || !config.src) {
            config = window._getVRConfig
              ? window._getVRConfig(name, rawName)
              : null;
          }

          if (config && config.src) {
            // ★ FIX: Luôn dùng config nếu có src, kể cả src === VR_MAP_DEFAULT
            // Vì config vẫn có lon/lat/fov đúng cho tiện ích đó
            window.openVR360(rawName, config.src, config.lon, config.lat);
          } else {
            // Dùng rawName (có số) để tìm trong _DYNAMIC_AMENITIES
            var am =
              window._DYNAMIC_AMENITIES &&
              (window._DYNAMIC_AMENITIES[rawName] ||
                window._DYNAMIC_AMENITIES[name]);
            if (am && window.navigateToPano) {
              window.navigateToPano(am.target, rawName, am.px, am.py);
            } else {
              // Fallback
              window.openVR360(
                name,
                window.VR_MAP_DEFAULT || "frames/3dvr/PANO_16_4.jpg",
                0,
                0,
              );
            }
          }
        }
        // Đóng popup nhưng GIỮ LẠI class active cho nút
        popup.style.display = "none";
      }
      e.stopPropagation();
    });
  }
})();

// ═══════════════════════════════════════════════════════════
//  VR 360° VIEWER — Three.js Sphere Renderer
//  Mở khi click dot tiện ích hoặc sub-item
// ═══════════════════════════════════════════════════════════

(function initVR360() {
  const modal = document.getElementById("vr-modal");
  const canvas = document.getElementById("vr-canvas");
  const btnClose = document.getElementById("vr-close");
  const titleEl = document.getElementById("vr-title-text");
  const hintEl = document.getElementById("vr-hint");

  if (!modal || !canvas) return;

  // ── Map tiện ích → file ảnh PANO 360° ─────────────────────
  // File PANO nằm trong frames/3dvr/ với tên dùng underscore
  const PANO_DEFAULT = "frames/3dvr/PANO_16_4.jpg";
  const VR_MAP = {
    "Cổng Dự Án": {
      src: "frames/3dvr/PANO_03_4.jpg",
      lon: -152,
      lat: 13,
      fov: 55,
    },
    "Đài Phun Nước": {
      src: "frames/3dvr/PANO_04_4.jpg",
      lon: -12,
      lat: -4,
      fov: 50,
    },
    "Trung Tâm Thương Mại 1": {
      src: "frames/3dvr/PANO_03_4.jpg",
      lon: -191,
      lat: 17,
      fov: 60,
    },
    "Trạm Sạc Xe Điện": {
      src: "frames/3dvr/PANO_04_4.jpg",
      lon: 104,
      lat: -32,
      fov: 90,
    },
    "Bãi Đỗ Xe 1": {
      src: "frames/3dvr/PANO_04_4.jpg",
      lon: 46,
      lat: -9,
      fov: 45,
    },
    "Quảng Trường Cây Xanh": {
      src: "frames/3dvr/PANO_05_4.jpg",
      lon: 62,
      lat: -64,
      fov: 90,
    },
    "Sân Bóng Đá": {
      src: "frames/3dvr/PANO_05_4.jpg",
      lon: 202,
      lat: -12,
      fov: 45,
    },
    "Hồ Bơi Vô Cực": {
  src: "frames/3dvr/PANO_12_4.jpg",
  lon: 177,
  lat: -36,
  fov: 115,
},
    "Gym Ngoài Trời": {
      src: "frames/3dvr/PANO_05_4.jpg",
      lon: 94,
      lat: -26,
      fov: 35,
    },
    "Khu Vui Chơi Trẻ Em": {
      src: "frames/3dvr/PANO_05_4.jpg",
      lon: 19,
      lat: -25,
      fov: 40,
    },
    "Ghế Nghỉ": {
      src: "frames/3dvr/PANO_05_4.jpg",
      lon: -86,
      lat: -32,
      fov: 45,
    },
    "Vườn Tri Thức": {
      src: "frames/3dvr/PANO_05_4.jpg",
      lon: 67,
      lat: -20,
      fov: 45,
    },
    "Bàn Đá Chơi Cờ": {
      src: "frames/3dvr/PANO_05_4.jpg",
      lon: 184,
      lat: -36,
      fov: 45,
    },
    "Hồ Vọng Nguyệt": {
      src: "frames/3dvr/PANO_05_4.jpg",
      lon: 131,
      lat: -14,
      fov: 35,
    },
    "Khán Đài Mini": {
      src: "frames/3dvr/PANO_05_4.jpg",
      lon: -113,
      lat: -12,
      fov: 50,
    },
    "Khu Nướng BBQ": {
      src: "frames/3dvr/PANO_07_5.jpg",
      lon: -76,
      lat: -41,
      fov: 35,
    },
    "Vườn Dưỡng Sinh": {
      src: "frames/3dvr/PANO_07_5.jpg",
      lon: 6,
      lat: -38,
      fov: 45,
    },
    "Vườn Thảo Mộc": {
      src: "frames/3dvr/PANO_07_5.jpg",
      lon: 100,
      lat: -39,
      fov: 35,
    },
    "Khu Camping": {
      src: "frames/3dvr/PANO_07_5.jpg",
      lon: 187,
      lat: -46,
      fov: 40,
    },
    "Trường Mầm Non": {
      src: "frames/3dvr/PANO_06_4.jpg",
      lon: -122,
      lat: -3,
      fov: 35,
    },
    "Sân Bóng Rổ 1": {
      src: "frames/3dvr/PANO_08_5.jpg",
      lon: -10,
      lat: -11,
      fov: 40,
    },
    "Sân Bóng Rổ 2": {
      src: "frames/3dvr/PANO_08_5.jpg",
      lon: -1,
      lat: -4,
      fov: 55,
    },
    "Bãi Đỗ Xe 2": {
      src: "frames/3dvr/PANO_08_5.jpg",
      lon: 107,
      lat: -10,
      fov: 75,
    },
    "Sân Pickleball 1": {
      src: "frames/3dvr/PANO_08_5.jpg",
      lon: -156,
      lat: -5,
      fov: 55,
    },
    "Sân Pickleball 2": {
      src: "frames/3dvr/PANO_09_4.jpg",
      lon: -143,
      lat: 1,
      fov: 30,
    },
    "Bãi Đỗ Xe 3": {
      src: "frames/3dvr/PANO_09_4.jpg",
      lon: 189,
      lat: 1,
      fov: 40,
    },
    "Nhà Sinh Hoạt Cộng Đồng": {
      src: "frames/3dvr/PANO_14_4.jpg",
      lon: 275,
      lat: -2,
      fov: 75,
    },
    "Trung Tâm Thương Mại 2": {
      src: "frames/3dvr/PANO_13_4.jpg",
      lon: -293,
      lat: -14,
      fov: 65,
    },
    "Bể Bơi 1 Chân Toà Nhà Hỗn Hợp": {
      src: "frames/3dvr/PANO_12_4.jpg",
      lon: 177,
      lat: -36,
      fov: 115,
    },
    "Bể Bơi 2 Chân Toà Nhà Hỗn Hợp": {
      src: "frames/3dvr/PANO_13_4.jpg",
      lon: 180,
      lat: -54,
      fov: 65,
    },
    "Công Viên Cây Xanh": {
      src: "frames/3dvr/PANO_13_4.jpg",
      lon: -27,
      lat: -34,
      fov: 80,
    },
    "Siêu Thị Khối Đế": {
      src: "frames/3dvr/PANO_11_4.jpg",
      lon: 0,
      lat: 0,
      fov: 90,
    },
    "Spa Khối Đế": {
      src: "frames/3dvr/PANO_11_4.jpg",
      lon: -220,
      lat: 1,
      fov: 60,
    },
    "Cafe - Restaurant Khối Đế": {
      src: "frames/3dvr/PANO_11_4.jpg",
      lon: -85,
      lat: 12,
      fov: 60,
    },
    "Biểu Tượng Dự Án": {
      src: "frames/3dvr/PANO_02_3.jpg",
      lon: 0,
      lat: 0,
      fov: 90,
    },
    "Biển Tên Dự Án": {
      src: "frames/3dvr/PANO_17.jpg",
      lon: 214,
      lat: -7,
      fov: 85,
    },
    "Đài Vọng Cảnh 1": {
      src: "frames/3dvr/PANO_15_4.jpg",
      lon: 209,
      lat: 4,
      fov: 30,
    },
    "Đài Vọng Cảnh 2": {
      src: "frames/3dvr/PANO_16_4.jpg",
      lon: -164,
      lat: 0,
      fov: 55,
    },
    "Đài Vọng Cảnh 3": {
      src: "frames/3dvr/PANO_16_4.jpg",
      lon: 198,
      lat: -3,
      fov: 40,
    },
    "Vườn Hoa Bồ Công Anh": {
      src: "frames/3dvr/PANO_17.jpg",
      lon: -360,
      lat: -32,
      fov: 90,
    },
    "Thềm Viễn Cảnh 1": {
      src: "frames/3dvr/PANO_15_4.jpg",
      lon: 175,
      lat: -1,
      fov: 85,
    },
    "Thềm Viễn Cảnh 2": {
      src: "frames/3dvr/PANO_16_4.jpg",
      lon: 0,
      lat: 0,
      fov: 90,
    },
    // "Điểm Nhấn Ánh Dương 1": {
    //   src: "frames/3dvr/PANO_02_3.jpg",
    //   lon: -129,
    //   lat: -2,
    //   fov: 30,
    // },
    "Điểm Nhấn Ánh Dương": {
      src: "frames/3dvr/PANO_12_4.jpg",
      lon: -51,
      lat: -20,
      fov: 30,
    },
    default: { src: "frames/3dvr/PANO_16_4.jpg", lon: 0, lat: 0, fov: 90 },
  };
  function resolveVRPanoSrc(input) {
    if (!input) return "";
    var raw = String(input).replace(/^\.?\//, "");
    if (/^PANO_[^./?#]+$/i.test(raw)) {
      return "frames/3dvr/" + raw + ".jpg";
    }
    return raw;
  }

  function detectVRLogicalPanoKey(input) {
    if (!input) return null;
    var raw = String(input);
    var hashIndex = raw.indexOf("#");
    if (hashIndex >= 0) raw = raw.slice(0, hashIndex);
    var queryIndex = raw.indexOf("?");
    if (queryIndex >= 0) raw = raw.slice(0, queryIndex);
    raw = raw.replace(/^\.?\//, "");

    var byPathMatch = raw.match(/(?:^|\/)(PANO_[^\/?#]+)\.(jpe?g|png|webp|avif)$/i);
    if (!byPathMatch) return null;
    return byPathMatch[1];
  }

  window.resolveVRPanoSrc = resolveVRPanoSrc;
  window.detectVRLogicalPanoKey = detectVRLogicalPanoKey;

  Object.keys(VR_MAP).forEach(function (key) {
    if (VR_MAP[key] && VR_MAP[key].src) {
      VR_MAP[key].src = resolveVRPanoSrc(VR_MAP[key].src);
    }
  });

  window.VR_MAP_DEFAULT = VR_MAP["default"].src;

  function stripVRAssetCacheParams(src) {
    if (!src) return "";
    var raw = String(src);
    var hashIndex = raw.indexOf("#");
    if (hashIndex >= 0) raw = raw.slice(0, hashIndex);
    var queryIndex = raw.indexOf("?");
    if (queryIndex >= 0) raw = raw.slice(0, queryIndex);
    return raw;
  }

  function getVersionedVRSrc(src) {
    var normalized = stripVRAssetCacheParams(src);
    if (!normalized) return "";
    if (
      !/^(https?:)?\/\//i.test(normalized) &&
      normalized.indexOf("./") !== 0 &&
      normalized.indexOf("/") !== 0
    ) {
      normalized = "./" + normalized.replace(/^\/+/, "");
    }
    if (typeof window.bdsVersionedAsset === "function") {
      return window.bdsVersionedAsset(normalized);
    }
    return normalized;
  }

  function getVRConfig(name, rawName) {
    // 1. Kiểm tra trong _DYNAMIC_AMENITIES xem có config từ amenityConfig không
    var am = null;
    if (window._DYNAMIC_AMENITIES) {
      am =
        window._DYNAMIC_AMENITIES[rawName] || window._DYNAMIC_AMENITIES[name];
      if (!am) {
        var cleanTarget = String(name)
          .toLowerCase()
          .replace(/^\d+\.\s*/, "")
          .trim();
        for (var key in window._DYNAMIC_AMENITIES) {
          var cleanKey = key
            .toLowerCase()
            .replace(/^\d+\.\s*/, "")
            .trim();
          if (cleanKey === cleanTarget) {
            am = window._DYNAMIC_AMENITIES[key];
            break;
          }
        }
      }
    }

    if (am && (am.lon || am.lat)) {
      var src = am.target
        ? resolveVRPanoSrc(am.target)
        : VR_MAP.default.src;
      return { src: src, lon: am.lon, lat: am.lat, fov: am.fov || 90 };
    }
    if (window._VR_AMENITY_CONFIG) {
      // Trích id từ rawName hoặc name (ví dụ "38. Đài Vọng Cảnh 3" → "38")
      var numMatch = (rawName || name || "").match(/^(\d+)/);
      if (numMatch) {
        var id = numMatch[1];
        var conf = window._VR_AMENITY_CONFIG[id];
        if (conf && (conf.lon || conf.lat)) {
          // Tìm src từ VR_MAP bằng tên sạch
          var cleanN = String(name)
            .replace(/^\d+\.\s*/, "")
            .trim();
          var vrEntry = VR_MAP[cleanN] || VR_MAP[name];
          var src2 = vrEntry ? vrEntry.src : VR_MAP.default.src;
          return {
            src: src2,
            lon: conf.lon,
            lat: conf.lat,
            fov: conf.fov || 90,
          };
        }
      }
    }

    // 2. Fallback về VR_MAP hardcode
    return VR_MAP[name] || { src: VR_MAP.default.src, lon: 0, lat: 0, fov: 90 };
  }
  window._getVRConfig = getVRConfig;
  window.getVRSrc = function (name, rawName) {
    var cleanName = name ? String(name).replace(/^\d+\.\s*/, "").trim() : "";
    var config = getVRConfig(cleanName || name, rawName || name);
    return config && config.src ? config.src : VR_MAP.default.src;
  };

  // ── Three.js state ───────────────────────────────────────
  window._VR_SHARED = {
    renderer: null,
    scene: null,
    camera: null,
    sphere: null,
    animId: null,
    lon: 0,
    lat: 0,
    isDrag: false,
    isTransitioning: false,
    startRender: null,
    stopRender: null,
  };
  let isInit = false;

  function initThree() {
    if (isInit) return;
    isInit = true;

    window._VR_SHARED.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !IS_MOBILE,
    });
    window._VR_SHARED.renderer.setPixelRatio(
  Math.min(window.devicePixelRatio || 1, 2),
);

    window._VR_SHARED.scene = new THREE.Scene();

    window._VR_SHARED.camera = new THREE.PerspectiveCamera(90, 1, 1, 1100);
    window._VR_SHARED.camera.position.set(0, 0, 0);

    // ★ Mobile: giảm segments để giảm tải GPU
    var segs = IS_MOBILE ? 64 : 128;
    var segsV = IS_MOBILE ? 32 : 64;
    const geo = new THREE.SphereGeometry(1000, segs, segsV);

    const mat = new THREE.MeshBasicMaterial({
      map: null,
      side: THREE.BackSide, // Nhìn từ bên trong — KHÔNG flip geometry
    });

    window._VR_SHARED.sphere = new THREE.Mesh(geo, mat);
    window._VR_SHARED.sphere.scale.x = -1; // Đảo ngược để ảnh 360 không bị lật gương từ bên trong
    window._VR_SHARED.scene.add(window._VR_SHARED.sphere);

    // VR Calibration tools removed: Calibration phase complete.
  }

  // ── Progressive Loading v2: instant pano switching ──────
  // Chiến lược:
  // 1. Preload TẤT CẢ thumbnail ngay khi mở tab Tiện Ích (chỉ ~300KB x 17 = ~5MB)
  // 2. Dùng createImageBitmap để decode ảnh off-main-thread (không giật)
  // 3. Cache full-res texture sau khi xem
  // 4. Preload full-res pano lân cận khi user đang xem

  var _texCache = {};
  var _thumbTexCache = {};
  var _thumbImgCache = {};  // Raw Image objects cho thumb
  var _thumbLoadingMap = {};
  var _loadingAbort = null;
  var _thumbsPreloaded = false;

  function getThumbSrc(fullSrc) {
    var rawFullSrc = stripVRAssetCacheParams(fullSrc).replace(/^\.\//, "");
    if (rawFullSrc.indexOf("frames/3dvr/") !== 0) {
      return getVersionedVRSrc(rawFullSrc);
    }
    return getVersionedVRSrc(
      rawFullSrc.replace("frames/3dvr/", "frames/3dvr/thumb/"),
    );
  }

  // ★ Preload TẤT CẢ thumbnail ngay từ đầu — gọi 1 lần khi mở Tiện Ích
  function preloadAllThumbs() {
    if (_thumbsPreloaded) return;
    _thumbsPreloaded = true;

    // Thu thập tất cả src pano unique
    var allSrcs = {};
    Object.keys(VR_MAP).forEach(function (key) {
      if (key === "default") return;
      var s = VR_MAP[key].src;
      if (s) allSrcs[s] = true;
    });

    var srcList = Object.keys(allSrcs);
    var queue = srcList.slice();
    var concurrent = IS_MOBILE ? 2 : 4;
    var active = 0;

    function pump() {
      while (active < concurrent && queue.length) {
        var src = queue.shift();
        var thumbSrc = getThumbSrc(src);
        if (_thumbImgCache[thumbSrc] || _thumbLoadingMap[thumbSrc]) {
          continue;
        }

        active++;
        _thumbLoadingMap[thumbSrc] = true;

        (function (resolvedThumbSrc) {
          var img = new Image();
          img.crossOrigin = "anonymous";
          img.decoding = "async";
          img.onload = function () {
            _thumbImgCache[resolvedThumbSrc] = img;
            delete _thumbLoadingMap[resolvedThumbSrc];
            active--;
            pump();
          };
          img.onerror = function () {
            delete _thumbLoadingMap[resolvedThumbSrc];
            active--;
            pump();
          };
          img.src = resolvedThumbSrc;
        })(thumbSrc);
      }
    }

    pump();
  }

  function buildThumbTexture(img) {
    if (!img) return null;
    var tex = new THREE.Texture(img);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  function loadThumbTexture(src, callback) {
    var thumbSrc = getThumbSrc(src);
    if (_thumbTexCache[thumbSrc]) {
      callback && callback(_thumbTexCache[thumbSrc]);
      return;
    }

    if (_thumbImgCache[thumbSrc]) {
      var readyTex = buildThumbTexture(_thumbImgCache[thumbSrc]);
      if (readyTex) _thumbTexCache[thumbSrc] = readyTex;
      callback && callback(readyTex);
      return;
    }

    if (_thumbLoadingMap[thumbSrc]) {
      var waitStart = Date.now();
      (function waitThumb() {
        if (_thumbTexCache[thumbSrc]) {
          callback && callback(_thumbTexCache[thumbSrc]);
          return;
        }
        if (_thumbImgCache[thumbSrc]) {
          var cachedTex = buildThumbTexture(_thumbImgCache[thumbSrc]);
          if (cachedTex) _thumbTexCache[thumbSrc] = cachedTex;
          callback && callback(cachedTex);
          return;
        }
        if (Date.now() - waitStart > 2500) {
          callback && callback(null);
          return;
        }
        setTimeout(waitThumb, 60);
      })();
      return;
    }

    _thumbLoadingMap[thumbSrc] = true;
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = function () {
      _thumbImgCache[thumbSrc] = img;
      delete _thumbLoadingMap[thumbSrc];
      var tex = buildThumbTexture(img);
      if (tex) _thumbTexCache[thumbSrc] = tex;
      callback && callback(tex);
    };
    img.onerror = function () {
      delete _thumbLoadingMap[thumbSrc];
      callback && callback(null);
    };
    img.src = thumbSrc;
  }

  // ★ Expose để gọi từ ngoài khi mở tab Tiện Ích
  window._preloadVRThumbs = preloadAllThumbs;

  // Load ảnh full-res bằng createImageBitmap (off-thread decode)
  function loadFullTexture(src, callback) {
    var fullSrc = getVersionedVRSrc(src);
    if (!fullSrc) {
      callback && callback(null);
      return;
    }

    if (_texCache[fullSrc]) {
      callback(_texCache[fullSrc]);
      return;
    }

    // Ưu tiên fetch + createImageBitmap (decode off main thread)
    if (typeof createImageBitmap === "function" && typeof fetch === "function") {
      fetch(fullSrc)
        .then(function (r) { return r.blob(); })
        .then(function (blob) { return createImageBitmap(blob, { imageOrientation: "flipY" }); })
        .then(function (bmp) {
          var tex = new THREE.Texture(bmp);
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          var maxAniso = window._VR_SHARED.renderer.capabilities.getMaxAnisotropy();
          tex.anisotropy = IS_MOBILE ? Math.min(maxAniso, 4) : maxAniso;
          tex.needsUpdate = true;
          _texCache[fullSrc] = tex;
          callback(tex);
        })
        .catch(function () {
          // Fallback: dùng THREE.TextureLoader
          var loader = new THREE.TextureLoader();
          loader.load(
            fullSrc,
            function (tex) {
              tex.minFilter = THREE.LinearFilter;
              tex.magFilter = THREE.LinearFilter;
              tex.generateMipmaps = false;
              tex.needsUpdate = true;
              _texCache[fullSrc] = tex;
              callback(tex);
            },
            undefined,
            function () {
              callback(null);
            },
          );
        });
    } else {
      var loader = new THREE.TextureLoader();
      loader.load(
        fullSrc,
        function (tex) {
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          tex.needsUpdate = true;
          _texCache[fullSrc] = tex;
          callback(tex);
        },
        undefined,
        function () {
          callback(null);
        },
      );
    }
  }

  function applyTexture(tex, src) {
    if (!tex) return;
    // Dispose texture cũ (chỉ nếu không trong cache)
    var oldTex = window._VR_SHARED.sphere.material.map;
    if (oldTex && oldTex !== tex && !Object.values(_texCache).includes(oldTex) && !Object.values(_thumbTexCache).includes(oldTex)) {
      oldTex.dispose();
    }
    window._VR_SHARED.sphere.material.map = tex;
    window._VR_SHARED.sphere.material.needsUpdate = true;

    var logicalPanoKey = detectVRLogicalPanoKey(src);
    if (logicalPanoKey) {
      window._currentPanoKey = logicalPanoKey;
    }
  }

  // ── Load texture & open modal ────────────────────────────
  function openVR(name, src, _lon, _lat) {
    window._vrCurrentName = name;
    initThree();

    // Cancel load trước đó
    if (_loadingAbort) { _loadingAbort.cancelled = true; }
    var thisLoad = { cancelled: false };
    _loadingAbort = thisLoad;

    // Reset hướng nhìn theo config
    window._VR_SHARED.lon = Number(_lon) || 0;
    window._VR_SHARED.lat = Number(_lat) || 0;

    // ── KHỚP NHÃN THÔNG MINH CHO FOV ──
    var cleanName = name ? String(name).replace(/^\d+\.\s*/, "") : "";
    var config = null;
    if (window._getVRConfig) {
      config = window._getVRConfig(cleanName, window._vrCurrentRawName || name);
    }
    config = config || VR_MAP[cleanName] || VR_MAP[name] || VR_MAP["default"];

    window._VR_SHARED.camera.fov = config.fov || 55;
    if (IS_MOBILE) {
      window._VR_SHARED.camera.fov = Math.min((config.fov || 90) + 55, 110);
    }
    window._VR_SHARED.camera.updateProjectionMatrix();

    if (titleEl) titleEl.textContent = cleanName || "Tham Quan 360°";

    if (hintEl) {
      hintEl.style.animation = "none";
      hintEl.style.opacity = "1";
      void hintEl.offsetWidth;
      hintEl.style.animation = "vrHintFade 3s ease forwards";
    }

    // ★ PROGRESSIVE LOADING v2:
    var fullSrc = getVersionedVRSrc(src);
    if (_texCache[fullSrc]) {
      // 1. Full đã cache → instant
      applyTexture(_texCache[fullSrc], fullSrc);
    } else {
      // 2. Hiện thumb nhẹ trước, chỉ tạo texture khi thực sự mở pano
      loadThumbTexture(src, function (thumbTex) {
        if (thisLoad.cancelled || _texCache[fullSrc]) return;
        if (thumbTex) applyTexture(thumbTex, fullSrc);
      });
      // 3. Load full-res off-thread
      loadFullTexture(src, function (fullTex) {
        if (thisLoad.cancelled) return;
        applyTexture(fullTex, fullSrc);
      });
    }

    // Hiện modal
    modal.style.display = "flex";
    requestAnimationFrame(function () { modal.classList.add("vr-open"); });
    resizeRenderer();
    startRender();

    if (window.updateMinimapDot) window.updateMinimapDot(name);

    // Preload full-res pano lân cận sau 1s (ưu tiên hơn background preload)
    setTimeout(function () {
      if (thisLoad.cancelled) return;
      preloadNearbyFull(cleanName, name);
    }, 1000);
  }

  // ★ Preload full-res pano lân cận (không chỉ thumb)
  function preloadNearbyFull(cleanName, rawName) {
    if (!window._VR_HOTSPOT_MAP) return;
    if (IS_MOBILE) return;
    var hsConfig = window._VR_HOTSPOT_MAP[cleanName] || window._VR_HOTSPOT_MAP[rawName];
    if (!hsConfig) return;
    var queue = [];
    Object.keys(hsConfig).forEach(function (key) {
      var hs = hsConfig[key];
      if (!hs) return;
      var targetName = hs.target || key;
      var targetConfig = VR_MAP[targetName] || VR_MAP[key];
      if (!targetConfig) return;
      var targetSrc = getVersionedVRSrc(targetConfig.src);
      if (!_texCache[targetSrc]) queue.push(targetConfig.src);
    });
    queue = queue.filter(function (src, index, arr) {
      return arr.indexOf(src) === index;
    }).slice(0, 2);
    // Load từng cái, cách nhau 500ms để không chiếm hết bandwidth
    queue.forEach(function (qSrc, i) {
      setTimeout(function () {
        var versionedSrc = getVersionedVRSrc(qSrc);
        if (_texCache[versionedSrc]) return;
        loadFullTexture(qSrc, function () {});
      }, i * 500);
    });
  }

  function closeVR() {
    modal.classList.remove("vr-open");
    setTimeout(() => {
      modal.style.display = "none";
    }, 300);
    stopRender();
    // Xóa hotspot khi đóng VR
    var hsCont = document.getElementById("vr-hs-container");
    if (hsCont) hsCont.innerHTML = "";

    // Nếu đang ở tab TIỆN ÍCH → chỉ đóng VR modal, giữ lại tiện ích overlay
    var navTienIch = document.getElementById("nav-tien-ich");
    if (navTienIch && navTienIch.classList.contains("active")) {
      // Đang ở TIỆN ÍCH → không cần chuyển tab, overlay tiện ích vẫn hiện bên dưới
      return;
    }

    // Nếu đang ở tab THAM QUAN, quay về TỔNG QUAN
    if (window._hideThamQuan) window._hideThamQuan();
    if (window._hideMatBang) window._hideMatBang();
    // Kích hoạt lại tab TỔNG QUAN
    var navToanCanh = document.getElementById("nav-toan-canh");
    if (navToanCanh) {
      document.querySelectorAll(".menu-item").forEach(function (i) {
        i.classList.remove("active");
      });
      navToanCanh.classList.add("active");
    }
  }

  btnClose && btnClose.addEventListener("click", closeVR);

  // ── Camera drag control ───────────────────────────────────
  window._VR_SHARED.lon = 0;
  window._VR_SHARED.lat = 0;
  window._VR_SHARED.isDrag = false;
  startX = 0;
  startY = 0;
  startLon = 0;
  startLat = 0;
  const DRAG_SPEED = 0.18;
  initPinchDist = 0;
  initFov = 90;

  function onDown(e) {
    if (window._VR_SHARED.isTransitioning) return;
    if (e.touches && e.touches.length === 2) {
      let dx = e.touches[0].clientX - e.touches[1].clientX;
      let dy = e.touches[0].clientY - e.touches[1].clientY;
      initPinchDist = Math.sqrt(dx * dx + dy * dy);
      initFov = window._VR_SHARED.camera.fov;
      e.preventDefault();
      return;
    }
    window._VR_SHARED.isDrag = true;
    startX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    startY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    startLon = window._VR_SHARED.lon;
    startLat = window._VR_SHARED.lat;
    canvas.classList.add("dragging");
    e.preventDefault();
  }
  function onMove(e) {
    if (e.touches && e.touches.length === 2 && initPinchDist > 0) {
      let dx = e.touches[0].clientX - e.touches[1].clientX,
        dy = e.touches[0].clientY - e.touches[1].clientY;
      let dist = Math.sqrt(dx * dx + dy * dy);
      window._VR_SHARED.camera.fov = Math.max(
        30,
        Math.min(110, initFov * (initPinchDist / dist)),
      );
      window._VR_SHARED.camera.updateProjectionMatrix();
      e.preventDefault();
      return;
    }
    if (
      !window._VR_SHARED.isDrag ||
      window._VR_SHARED.isTransitioning ||
      (e.touches && e.touches.length > 1)
    )
      return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? startX;
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? startY;
    window._VR_SHARED.lon = startLon - (x - startX) * DRAG_SPEED;
    window._VR_SHARED.lat = startLat + (y - startY) * DRAG_SPEED;
    window._VR_SHARED.lat = Math.max(-85, Math.min(85, window._VR_SHARED.lat)); // giới hạn nhìn
    e.preventDefault();
  }
  function onUp() {
    window._VR_SHARED.isDrag = false;
    canvas.classList.remove("dragging");
  }

  canvas.addEventListener("mousedown", onDown, { passive: false });
  canvas.addEventListener("touchstart", onDown, { passive: false });
  window.addEventListener("mousemove", onMove, { passive: false });
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp);

  // Scroll = zoom FOV
  canvas.addEventListener(
    "wheel",
    (e) => {
      window._VR_SHARED.camera.fov = Math.max(
        40,
        Math.min(100, window._VR_SHARED.camera.fov + e.deltaY * 0.04),
      );
      window._VR_SHARED.camera.updateProjectionMatrix();
      e.preventDefault();
    },
    { passive: false },
  );

  // ── Render loop ──────────────────────────────────────────
  function startRender() {
    stopRender();
    function loop() {
      window._VR_SHARED.animId = requestAnimationFrame(loop);
      const phi = THREE.MathUtils.degToRad(90 - window._VR_SHARED.lat);
      const theta = THREE.MathUtils.degToRad(window._VR_SHARED.lon);
      window._VR_SHARED.camera.lookAt(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      );
      window._VR_SHARED.renderer.render(
        window._VR_SHARED.scene,
        window._VR_SHARED.camera,
      );

      // [FIX] CẬP NHẬT LIÊN TỤC VỊ TRÍ CÁC ĐIỂM CHẤM XANH HOTSPOT THEO CAMERA
      if (typeof window.updateVrHotspots === "function") {
        window.updateVrHotspots();
      }
    }
    loop();
  }
  window._VR_SHARED.startRender = startRender;

  function stopRender() {
    if (window._VR_SHARED.animId) {
      cancelAnimationFrame(window._VR_SHARED.animId);
      window._VR_SHARED.animId = null;
    }
  }
  window._VR_SHARED.stopRender = stopRender;
  window._vrStopRender = stopRender;

  function resizeRenderer() {
    var w = modal.clientWidth;
    var h = modal.clientHeight;
    if (w === 0 || h === 0) {
      var sw = window.innerWidth;
      var sh = window.innerHeight;
      var navH = sw <= 768 ? 60 : sh <= 500 ? 50 : 80;
      w = sw;
      h = sh - navH;
    }
    window._VR_SHARED.renderer.setSize(w, h);
    window._VR_SHARED.camera.aspect = w / h;
    window._VR_SHARED.camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", () => {
    if (modal.classList.contains("vr-open")) resizeRenderer();
  });

  // ── Expose để các dot và sub-item có thể gọi ─────────────

  // Update loop to show info
  const _origLoop = startRender;
  startRender = function () {
    _origLoop();
    const updateInfo = () => {
      const el = document.getElementById("vr-info");
      if (el && modal.style.display !== "none") {
        // Tính toán px, py tương đương equirectangular từ lon, lat hiện tại
        // Do sphere bị lật x = -1, lon cần được xử lý tương ứng
        let currentLon = ((window._VR_SHARED.lon % 360) + 360) % 360;
        let px = Math.round((currentLon / 360) * 2000);
        let py = Math.round(((90 - window._VR_SHARED.lat) / 180) * 1000);

        el.innerHTML =
          `Name: <b>${window._vrCurrentName || "N/A"}</b><br>` +
          `Lon: ${Math.round(window._VR_SHARED.lon)} | Lat: ${Math.round(window._VR_SHARED.lat)} | Zoom: ${Math.round(window._VR_SHARED.camera.fov)}<br>` +
          `<span style="color:#00ff00">Hotspot: px: ${px}, py: ${py}</span>`;
      }
      if (window._VR_SHARED.animId) requestAnimationFrame(updateInfo);
    };
    updateInfo();
  };

  window.openVR360 = openVR;
})();

(function initVRHotspots() {
  // ═══════════════════════════════════════════════════════════
  //  VR HOTSPOT NAVIGATION — chấm tròn xanh, click chuyển PANO
  // ═══════════════════════════════════════════════════════════

  var vrModal = document.getElementById("vr-modal");
  var vrCanvas = document.getElementById("vr-canvas");
  var hsContainer = document.getElementById("vr-hs-container");
  if (!hsContainer) {
    hsContainer = document.createElement("div");
    hsContainer.id = "vr-hs-container";
    if (vrModal) vrModal.appendChild(hsContainer);
  }
  hsContainer.style.display = ""; // [ENABLED] Bật hiển thị hotspot
  // Thêm CSS để tối ưu GPU
  if (!document.getElementById("vr-hs-gpu-style")) {
    var style = document.createElement("style");
    style.id = "vr-hs-gpu-style";
    style.textContent =
      ".vr-hs { will-change: transform; top: 0 !important; left: 0 !important; }";
    document.head.appendChild(style);
  }

  var vrHsEls = [];
  window._vrHsEls = vrHsEls;
  window._currentPanoKey = null;

  // ── HOTSPOT DATA — Loaded from separate JSON file ──
  var VR_HS_DATA = {};
  window._DYNAMIC_AMENITIES = {}; // Lưu trữ map: label -> {target, px, py}

  fetch("vr-hotspot-data.json?t=" + new Date().getTime(), { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("Network response was not ok");
      return res.json();
    })
    .then(function (data) {
      // Tương thích cả 2 định dạng (cũ: trực tiếp pano, mới: có hotspots và amenityConfig)
      var hotspotData = data.hotspots ? data.hotspots : data;
      window._VR_AMENITY_CONFIG = data.amenityConfig || {};
      window.VR_HS_DATA = hotspotData;
      VR_HS_DATA = hotspotData;

      // Trích xuất danh sách tiện ích duy nhất
      for (var pano in hotspotData) {
        hotspotData[pano].forEach(function (hs) {
          if (!window._DYNAMIC_AMENITIES[hs.label]) {
            // Lấy id từ label (ví dụ "1. Cổng Dự Án" -> "1")
            var numMatch = hs.label.match(/^(\d+)/);
            var id = numMatch ? numMatch[1] : null;
            var conf =
              id && window._VR_AMENITY_CONFIG[id]
                ? window._VR_AMENITY_CONFIG[id]
                : null;

            window._DYNAMIC_AMENITIES[hs.label] = {
              target: hs.target,
              px: hs.px,
              py: hs.py,
              lon: conf ? conf.lon : 0,
              lat: conf ? conf.lat : 0,
              fov: conf ? conf.fov : 90,
            };
          }
        });
      }
      if (typeof window.syncAmenityMenu === "function")
        window.syncAmenityMenu();
      if (window._currentPanoKey) window.createVrHotspots();
    })
    .catch(function (err) {
      console.error("Failed to load VR Hotspot Data:", err);
    });

  // ── Convert pixel → 3D ──
  function hs3DPos(px, py) {
    var theta = (px / 2000) * 2 * Math.PI;
    var phi = (py / 1000) * Math.PI;
    var r = 1000 * 0.92;
    // [FIX] Khớp chính xác với camera.lookAt và sphere.scale.x = -1
    // Lật trục Z thay vì trục X để quay đúng chiều
    return new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      -r * Math.sin(phi) * Math.sin(theta),
    );
  }

  // ── Create hotspots for current PANO ──
  window.createVrHotspots = function () {
    hsContainer.innerHTML = "";
    hsContainer.style.opacity = "1"; // Đảm bảo container hiện ra
    vrHsEls = [];
    var key = window._currentPanoKey;
    if (!key || !VR_HS_DATA[key]) return;

    VR_HS_DATA[key].forEach(function (hs) {
      var pos = hs3DPos(hs.px, hs.py);
      var el = document.createElement("div");
      el.className = "vr-hs";
      el.innerHTML =
        '<div class="vr-hs-dot"></div><div class="vr-hs-label">' +
        String(hs.label).replace(/^\d+\.\s*/, "") +
        "</div>";
      el.addEventListener("click", function (e) {
        e.stopPropagation();

        if (window.navigateToPano) {
          window.navigateToPano(hs.target, hs.label, hs.px, hs.py);
        }
      });
      hsContainer.appendChild(el);
      vrHsEls.push({ el: el, pos: pos });
    });
  };

  // ── Update hotspot screen positions ──
  var _hsVec = new THREE.Vector3();
  function updateVrHotspots() {
    if (!vrHsEls.length || !window._VR_SHARED.camera) return;
    if (!vrCanvas || !vrModal) return;
    var rect = vrCanvas.getBoundingClientRect();
    var modalRect = vrModal.getBoundingClientRect();
    var w = rect.width,
      h = rect.height;
    var offsetTop = rect.top - modalRect.top;
    var offsetLeft = rect.left - modalRect.left;

    window._VR_SHARED.camera.updateMatrixWorld(true);

    for (var i = 0; i < vrHsEls.length; i++) {
      var hs = vrHsEls[i];
      _hsVec.copy(hs.pos).project(window._VR_SHARED.camera);

      if (_hsVec.z > 1) {
        hs.el.style.display = "none";
        continue;
      }

      var sx = (0.5 + _hsVec.x / 2) * w;
      var sy = (0.5 - _hsVec.y / 2) * h;

      hs.el.style.display = "";
      // Khớp tuyệt đối tâm điểm và bù trừ offset của canvas
      hs.el.style.transform =
        "translate3d(" +
        (sx + offsetLeft) +
        "px, " +
        (sy + offsetTop) +
        "px, 0) translate(-50%, -50%)";
    }
  }
  // ★ EXPOSE to window — render loop in initVR360 needs this
  window.updateVrHotspots = updateVrHotspots;

  // ── Transition state ──
  isTransitioning = false;

  // ── Navigate to another PANO — zoom thẳng về phía trước + fade ──
  function navigateToPano(targetKey, label, hsPx, hsPy) {
    if (window._VR_SHARED.isTransitioning) return;
    window._VR_SHARED.isTransitioning = true;

    var startFov = window._VR_SHARED.camera.fov;
    var endFov = 30;

    // Ẩn hotspot
    hsContainer.style.opacity = "0";
    hsContainer.style.transition = "opacity 0.15s";

    // Tạo fade overlay
    var fadeEl = document.getElementById("vr-transition-fade");
    if (!fadeEl) {
      fadeEl = document.createElement("div");
      fadeEl.id = "vr-transition-fade";
      fadeEl.style.cssText =
        "position:absolute;top:0;left:0;width:100%;height:100%;z-index:15;" +
        "background:rgba(5,15,20,0.95);opacity:0;pointer-events:none;";
      if (vrModal) vrModal.appendChild(fadeEl);
    }
    fadeEl.style.background = "rgba(5,15,20,0.95)";
    fadeEl.style.transition = "none";
    fadeEl.style.opacity = "0";

    var animStart = performance.now();
    var ZOOM_DURATION = 400;

    function animateZoom() {
      var elapsed = performance.now() - animStart;
      var t = Math.min(elapsed / ZOOM_DURATION, 1);
      var e = t * t;
      window._VR_SHARED.camera.fov = startFov + (endFov - startFov) * e;
      window._VR_SHARED.camera.updateProjectionMatrix();

      if (t > 0.3) {
        var fadeT = (t - 0.3) / 0.7;
        fadeEl.style.opacity = String(Math.min(fadeT * 1.2, 1));
      }

      if (t < 1) {
        requestAnimationFrame(animateZoom);
      } else {
        fadeEl.style.opacity = "1";
        setTimeout(function () {
          window._currentPanoKey = targetKey;

          // ── KHÔI PHỤC LOGIC GỐC: Lấy config từ VR_MAP hoặc tính từ Hotspot ──
          var cleanName = label ? label.replace(/^\d+\.\s*/, "") : targetKey;
          var config = window._getVRConfig
            ? window._getVRConfig(cleanName, label)
            : null;

          if (!config || config.src === window.VR_MAP_DEFAULT) {
            // Nếu là điểm từ JSON chưa có trong VR_MAP -> Tự tính lon/lat từ px/py
            // targetKey chính là mã PANO (ví dụ: PANO_1_2)
            var src = window.resolveVRPanoSrc
              ? window.resolveVRPanoSrc(targetKey)
              : targetKey;
            var lon = (hsPx / 2000) * 360;
            var lat = 90 - (hsPy / 1000) * 180;
            window._vrCurrentRawName = label || targetKey;
            window.openVR360(label || targetKey, src, lon, lat);
          } else {
            // Dùng đúng cấu hình bạn đã căn chỉnh (lat/lon/fov)
            window._vrCurrentRawName = label || targetKey;
            window.openVR360(
              label || targetKey,
              config.src,
              config.lon,
              config.lat,
            );
          }

          // Cập nhật Hotspots cho Pano mới
          window.createVrHotspots();

          requestAnimationFrame(function () {
            fadeEl.style.transition = "opacity 0.35s ease-out";
            fadeEl.style.opacity = "0";
            hsContainer.style.opacity = "1";
            window._VR_SHARED.isTransitioning = false;
          });

          if (window.updateMinimapDot)
            window.updateMinimapDot(label || targetKey);
        }, 150);
      }
    }
    animateZoom();
  }
  // ★ EXPOSE to window — hotspot click handlers need this
  window.navigateToPano = navigateToPano;

  // ── Patch openVR to detect PANO key + create hotspots ──
  if (typeof window._origOpenVR === "undefined") {
    window._origOpenVR = window.openVR360;
  }
  function openVRWithHotspots(name, src, _lon, _lat) {
    window._vrCurrentName = name; // [FIX] Lưu tên pano hiện tại
    window._currentPanoKey = window.detectVRLogicalPanoKey
      ? window.detectVRLogicalPanoKey(src)
      : null;

    // Xóa hotspot cũ ngay lập tức trước khi load PANO mới
    hsContainer.innerHTML = "";
    vrHsEls = [];
    window._VR_SHARED.isTransitioning = false;

    // Gọi openVR trước để initThree() tạo camera/renderer
    window._origOpenVR(name, src, _lon, _lat);

    setTimeout(window.createVrHotspots, 300);
  }
  window.openVR360 = openVRWithHotspots;

  // ── Gắn vào dot-wrapper click ────────────────────────────
  document.querySelectorAll(".dot-wrapper").forEach((dot) => {
    dot.addEventListener("click", function (e) {
      e.stopPropagation();
      const name =
        this.querySelector(".dot-label")?.textContent || "Tham Quan 360°";
      window._vrCurrentRawName = name;
      openVRWithHotspots(
        name,
        window.getVRSrc
          ? window.getVRSrc(name, name)
          : window.VR_MAP_DEFAULT || "frames/3dvr/PANO_16_4.jpg",
      );
    });
  });

  // ── Sub-item click đã xử lý trong initTiPanel popup handler ──
  // (dùng window.openVR360 = openVRWithHotspots)
})();

// ═══════════════════════════════════════════════════════════
//  VR MINIMAP — Production Mode
// ═══════════════════════════════════════════════════════════

(function initMinimap() {
  var card = document.getElementById("vr-minimap-card");
  var toggleBtn = document.getElementById("vr-minimap-toggle");
  var dot = document.getElementById("vr-minimap-dot");
  var pulse = document.getElementById("vr-minimap-pulse");
  var labelEl = document.getElementById("vr-minimap-label");
  if (!card || !toggleBtn) return;

  var isOpen = true;

  toggleBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    isOpen = !isOpen;
    card.classList.toggle("minimap-hidden", !isOpen);
  });

  var PANO_POSITIONS = {
    PANO_1_2: { top: 28, left: 62 },
    PANO_02_3: { top: 88.4, left: 15.7 },
    PANO_03_4: { top: 43.7, left: 8.3 },
    PANO_04_4: { top: 27.4, left: 13.4 },
    PANO_05_4: { top: 23.2, left: 24.5 },
    PANO_06_4: { top: 14.2, left: 36.6 },
    PANO_07_5: { top: 23.7, left: 40.3 },
    PANO_08_5: { top: 23.2, left: 44.9 },
    PANO_09_4: { top: 34.7, left: 69 },
    PANO_11_4: { top: 68.4, left: 93.1 },
    PANO_12_4: { top: 67.9, left: 86.1 },
    PANO_13_4: { top: 45.8, left: 79.2 },
    PANO_14_4: { top: 40, left: 96.8 },
    PANO_15_4: { top: 88.4, left: 37.5 },
    PANO_16_4: { top: 77.4, left: 89.4 },
    PANO_17: { top: 90, left: 30 },
    default: { top: 45, left: 50 },
  };

  function nameToPanoKey(name) {
    if (window._getVRConfig) {
      var config = window._getVRConfig(name);
      if (config && config.src) {
        var m = config.src.match(/PANO_[^.]+/);
        if (m) return m[0];
      }
    }
    return window._currentPanoKey || null;
  }

  window.updateMinimapDot = function (name) {
    var panoKey = nameToPanoKey(name);
    var pos = (panoKey && PANO_POSITIONS[panoKey]) || PANO_POSITIONS["default"];

    if (dot) {
      dot.style.top = pos.top + "%";
      dot.style.left = pos.left + "%";
    }
    if (pulse) {
      pulse.style.top = pos.top + "%";
      pulse.style.left = pos.left + "%";
      pulse.style.animation = "none";
      void pulse.offsetWidth;
      pulse.style.animation = "mmPulse 2s ease-out infinite";
    }
    if (labelEl) {
      labelEl.textContent = name || "";
    }
    if (!isOpen) {
      isOpen = true;
      card.classList.remove("minimap-hidden");
    }
  };

})();

// ── Mobile Toggle cho ti-panel ──────────────────────────
(function initMobileToggle() {
  const toggleBtn = document.getElementById("ti-mobile-toggle");
  const rowsWrap = document.getElementById("ti-rows-wrap");
  if (!toggleBtn || !rowsWrap) return;

  toggleBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    const isOpen = rowsWrap.classList.toggle("open");
    toggleBtn.classList.toggle("open", isOpen);

    // Đóng popup nếu đang mở
    const popup = document.getElementById("ti-popup");
    if (!isOpen && popup) popup.style.display = "none";
  });

  // Click ngoài → đóng rows
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".ti-panel")) {
      rowsWrap.classList.remove("open");
      toggleBtn.classList.remove("open");
    }
  });
})();
// ═══════════════════════════════════════════════════════════
//  THƯ VIỆN — Continuous Scroll PDF + Gallery
// ═══════════════════════════════════════════════════════════
(function initEbrochure() {
  var overlayEl = document.getElementById("ebrochure-overlay");
  var navEbr = document.getElementById("nav-ebrochure");
  var stageEl = document.getElementById("stage");
  var vignEl = document.querySelector(".vign");
  var dnEl = document.getElementById("dn");
  var hintEl = document.getElementById("hint");
  var flipContainerEl = document.getElementById("ebr-flip-container");
  var flipbookEl = document.getElementById("ebr-flipbook");
  var btnPrev = document.getElementById("ebr-flip-prev");
  var btnNext = document.getElementById("ebr-flip-next");
  var floatBadge = document.getElementById("ebr-float-badge");
  var floatText = document.getElementById("ebr-float-text");
  var curPageEl = document.getElementById("ebr-cur-page");
  var totalPageEl = document.getElementById("ebr-total-page");
  var pageBadge = document.getElementById("ebr-page-badge");
  var galleryEl = document.getElementById("ebr-gallery");
  var tabs = document.querySelectorAll(".ebr-tab");

  if (!overlayEl || !navEbr || typeof pdfjsLib === "undefined") return;

  var pdfDoc = null,
    totalPages = 0,
    loadSession = 0,
    pageFlip = null,
    pagesContent = [];
  var currentPdfUrl = null;
  var currentPdfPage = 1;
  var currentPdfRender = null;

  function isMobile() {
    return window.innerWidth <= 768;
  }

  // ════════════════════════════════════════
  //  DESKTOP: Flipbook (giữ nguyên logic cũ)
  // ════════════════════════════════════════
  function initFlipbookDesktop(origW, origH) {
    if (pageFlip) {
      try {
        pageFlip.destroy();
      } catch (e) {}
      pageFlip = null;
    }
    flipbookEl.innerHTML = "";
    flipbookEl.style.cssText = "";

    pagesContent.forEach(function (canvas, index) {
      var pageDiv = document.createElement("div");
      pageDiv.className = "page page-" + (index + 1);
      pageDiv.style.cssText =
        "background:#f8f6f0;box-shadow:inset 0 0 10px rgba(0,0,0,0.1);overflow:hidden;position:relative;";

      var loader = document.createElement("div");
      loader.className = "ebr-page-loader";
      loader.innerHTML =
        '<div class="ebr-loader-spinner"></div>' +
        '<span style="font-size:11px;margin-top:5px;color:#aaa;">ĐANG TẢI TRANG ' +
        (index + 1) +
        "...</span>";

      // ★ Canvas object-fit: contain — PageFlip sẽ scale đúng
      canvas.style.cssText =
        "width:100%;height:100%;display:block;object-fit:contain;position:relative;z-index:2;opacity:1;";

      pageDiv.appendChild(loader);
      pageDiv.appendChild(canvas);
      flipbookEl.appendChild(pageDiv);
    });

    var PF =
      window.St && window.St.PageFlip
        ? window.St.PageFlip
        : window.PageFlip
          ? window.PageFlip
          : null;

    if (!PF) {
      console.error("[Flipbook] PageFlip library không load được");
      return;
    }

    var actualPages = flipbookEl.querySelectorAll(".page");
    if (actualPages.length === 0) return;

    // ★ Đo container THỰC TẾ — mỗi lần gọi đều đo lại
    var containerW = flipContainerEl
      ? flipContainerEl.clientWidth
      : window.innerWidth;
    var containerH = flipContainerEl
      ? flipContainerEl.clientHeight
      : window.innerHeight - 160;

    // Padding: CSS đặt padding: 10px 60px (responsive giảm dần)
    // Đo lại từ computed style cho chính xác
    var computedPad = flipContainerEl
      ? window.getComputedStyle(flipContainerEl)
      : null;
    var padL = computedPad ? parseFloat(computedPad.paddingLeft) || 0 : 60;
    var padR = computedPad ? parseFloat(computedPad.paddingRight) || 0 : 60;
    var padT = computedPad ? parseFloat(computedPad.paddingTop) || 0 : 10;
    var padB = computedPad ? parseFloat(computedPad.paddingBottom) || 0 : 10;

    var availW = containerW - padL - padR;
    var availH = containerH - padT - padB;

    // Tỷ lệ 1 trang PDF gốc
    var pageAspect = origW / origH;

    // PageFlip hiển thị spread = 2 trang cạnh nhau
    // → mỗi trang chiều ngang tối đa = availW / 2
    var maxPageW = availW / 2;
    var maxPageH = availH;

    // Fit: scale sao cho spread vừa khít container
    var pfW, pfH;
    if (maxPageW / pageAspect <= maxPageH) {
      pfW = maxPageW;
      pfH = maxPageW / pageAspect;
    } else {
      pfH = maxPageH;
      pfW = maxPageH * pageAspect;
    }

    pfW = Math.max(150, Math.floor(pfW));
    pfH = Math.max(150, Math.floor(pfH));

    // Lưu kích thước GỐC PDF (không phải display size)
    window._flipbookOrigSize = { w: origW, h: origH };

    pageFlip = new PF(flipbookEl, {
      width: pfW,
      height: pfH,
      size: "fixed",
      minWidth: 150,
      maxWidth: 2000,
      minHeight: 150,
      maxHeight: 2000,
      showCover: true,
      maxShadowOpacity: 0.3,
      usePortrait: false,
      flippingTime: 800,
    });

    try {
      pageFlip.loadFromHTML(actualPages);
    } catch (e) {
      console.error("[Flipbook] loadFromHTML lỗi:", e);
    }

    if (btnPrev)
      btnPrev.onclick = function () {
        if (pageFlip) pageFlip.flipPrev();
      };
    if (btnNext)
      btnNext.onclick = function () {
        if (pageFlip) pageFlip.flipNext();
      };

    pageFlip.on("flip", function (e) {
      if (curPageEl) curPageEl.textContent = e.data + 1;
    });

    // ★ Fix stf__parent background cho cover + khe giữa
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var stfParent = flipbookEl.querySelector(".stf__parent");
        if (stfParent) {
          stfParent.style.background = "#f8f6f0";
          stfParent.style.borderRadius = "2px";
          stfParent.style.boxShadow = "0 4px 30px rgba(0,0,0,0.4)";
        }
      });
    });
  }

  // ════════════════════════════════════════
  //  MOBILE: Scroll dọc — render PDF → <img> trực tiếp
  //  Hoàn toàn độc lập, không dùng flipbook
  // ════════════════════════════════════════
  function loadPDFMobile(url) {
    loadSession++;
    var mySession = loadSession;
    currentPdfUrl = url;

    // Dọn sạch container
    flipbookEl.innerHTML =
      '<div style="text-align:center;padding:40px;color:#aaa;font-size:13px;">Đang tải PDF...</div>';
    flipbookEl.style.cssText = "width:100%;";

    pdfjsLib
      .getDocument(url)
      .promise.then(function (doc) {
        if (mySession !== loadSession) {
          doc.destroy();
          return;
        }
        var numPages = doc.numPages;
        flipbookEl.innerHTML = "";

        // Render từng trang thành <canvas> rồi convert → <img>
        var scale = 1.5; // Chất lượng tốt trên mobile
        function renderPage(pageNum) {
          if (pageNum > numPages || mySession !== loadSession) return;
          doc.getPage(pageNum).then(function (page) {
            if (mySession !== loadSession) return;
            var viewport = page.getViewport({ scale: scale });
            var cvs = document.createElement("canvas");
            cvs.width = viewport.width;
            cvs.height = viewport.height;
            var ctx = cvs.getContext("2d");
            page
              .render({ canvasContext: ctx, viewport: viewport })
              .promise.then(function () {
                if (mySession !== loadSession) return;
                // Convert canvas → img (nhẹ hơn, scroll mượt hơn)
                var img = document.createElement("img");
                img.src = cvs.toDataURL("image/jpeg", 0.85);
                img.style.cssText = "width:100%;height:auto;display:block;";
                img.alt = "Trang " + pageNum;
                flipbookEl.appendChild(img);
                // Render trang tiếp
                renderPage(pageNum + 1);
              });
          });
        }
        renderPage(1);
      })
      .catch(function () {
        if (mySession !== loadSession) return;
        currentPdfUrl = null;
        flipbookEl.innerHTML =
          '<div style="text-align:center;padding:40px;color:#f66;">Lỗi tải PDF</div>';
      });
  }

  // ════════════════════════════════════════
  //  DESKTOP: Load PDF → Flipbook
  // ════════════════════════════════════════
  function loadPDFDesktop(url) {
    if (url === currentPdfUrl && pageFlip) return;
    loadSession++;
    var mySession = loadSession;
    currentPdfUrl = url;
    if (flipContainerEl) flipContainerEl.scrollTop = 0;
    if (floatBadge) floatBadge.classList.remove("hidden");
    if (floatText) floatText.textContent = "Đang tải…";
    if (pageFlip) {
      try {
        pageFlip.destroy();
      } catch (e) {}
      pageFlip = null;
    }
    flipbookEl.innerHTML = "";
    pagesContent = [];
    if (pdfDoc) {
      try {
        pdfDoc.destroy();
      } catch (e) {}
      pdfDoc = null;
    }

    pdfjsLib
      .getDocument(url)
      .promise.then(function (doc) {
        if (mySession !== loadSession) {
          doc.destroy();
          return;
        }
        pdfDoc = doc;
        totalPages = doc.numPages;
        if (totalPageEl) totalPageEl.textContent = totalPages;
        if (curPageEl) curPageEl.textContent = "1";

        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var baseScale = 1.0;

        doc.getPage(1).then(function (page1) {
          if (mySession !== loadSession) return;
          var vp = page1.getViewport({ scale: baseScale });
          var pdfW = vp.width;
          var pdfH = vp.height;
          var renderScale = baseScale;

          pagesContent = [];
          for (var i = 0; i < totalPages; i++) {
            var cv = document.createElement("canvas");
            cv.width = Math.round(pdfW * dpr);
            cv.height = Math.round(pdfH * dpr);
            cv.className = "ebr-page-canvas unrendered";
            pagesContent.push(cv);
          }

          if (floatBadge) floatBadge.classList.add("hidden");
          initFlipbookDesktop(pdfW, pdfH);

          var renders = new Array(totalPages + 1).fill(false);
          var isFlipping = false;

          function renderLz(num) {
            if (
              num < 1 ||
              num > totalPages ||
              renders[num] ||
              mySession !== loadSession
            )
              return Promise.resolve();
            renders[num] = true;
            return doc
              .getPage(num)
              .then(function (p) {
                if (mySession !== loadSession) return;
                var v2 = p.getViewport({ scale: renderScale });
                var tc = document.createElement("canvas");
                tc.width = Math.round(v2.width * dpr);
                tc.height = Math.round(v2.height * dpr);
                var tx = tc.getContext("2d");
                tx.setTransform(dpr, 0, 0, dpr, 0, 0);
                return p
                  .render({ canvasContext: tx, viewport: v2 })
                  .promise.then(function () {
                    if (mySession !== loadSession) return;
                    var cv = pagesContent[num - 1];
                    if (!cv) return;
                    var destCtx = cv.getContext("2d");
                    destCtx.drawImage(
                      tc,
                      0,
                      0,
                      tc.width,
                      tc.height,
                      0,
                      0,
                      cv.width,
                      cv.height,
                    );
                    cv.classList.add("rendered");
                    cv.classList.remove("unrendered");
                  });
              })
              .catch(function () {
                renders[num] = false;
              });
          }

          renderLz(1).then(function () {
            renderLz(2);
            renderLz(3);
            renderLz(4);
          });

          if (pageFlip) {
            pageFlip.on("changeState", function (e) {
              isFlipping = e.data === "flipping";
            });
            pageFlip.on("flip", function (e) {
              var d = e.data + 1;
              renderLz(d);
              renderLz(d + 1);
              renderLz(d + 2);
              renderLz(d - 1);
            });
            var cl = 1;
            (function bg() {
              if (mySession !== loadSession) return;
              if (isFlipping) {
                setTimeout(bg, 200);
                return;
              }
              while (cl <= totalPages && renders[cl]) cl++;
              if (cl <= totalPages)
                renderLz(cl).then(function () {
                  setTimeout(bg, 50);
                });
            })();
          }
        });
      })
      .catch(function () {
        if (mySession !== loadSession) return;
        currentPdfUrl = null;
        if (floatText) floatText.textContent = "Lỗi tải PDF";
      });
  }

  // ════════════════════════════════════════
  //  Router: gọi đúng hàm theo mobile/desktop
  // ════════════════════════════════════════
  function loadPDF(url) {
    var dlBtn = document.getElementById("btn-download-pdf");
    if (dlBtn) dlBtn.href = url;
    if (isMobile()) {
      loadPDFMobile(url);
    } else {
      loadPDFDesktop(url);
    }
  }

  function showPDFView() {
    if (flipContainerEl)
      flipContainerEl.style.display = isMobile() ? "block" : "flex";
    if (galleryEl) galleryEl.style.display = "none";
    if (pageBadge) pageBadge.style.display = isMobile() ? "none" : "";
    var dlBtn = document.getElementById("btn-download-pdf");
    if (dlBtn) dlBtn.style.display = "flex";
  }

  function showGalleryView() {
    if (flipContainerEl) flipContainerEl.style.display = "none";
    if (galleryEl) {
      galleryEl.style.display = "flex";
      galleryEl.scrollTop = 0;
    }
    if (floatBadge) floatBadge.classList.add("hidden");
    if (pageBadge) pageBadge.style.display = "none";
    var dlBtn = document.getElementById("btn-download-pdf");
    if (dlBtn) dlBtn.style.display = "none";
  }

  function showEbrochure() {
    if (window._hideMatBang) window._hideMatBang();
    if (window._hideVitri) window._hideVitri();
    if (window._hidePhanKhu) window._hidePhanKhu();
    if (window._hideThamQuan) window._hideThamQuan();
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
    overlayEl.style.display = "flex";
    requestAnimationFrame(function () {
      overlayEl.classList.add("visible");
    });

    // Gallery tab active → show gallery
    if (document.querySelector(".ebr-tab-gallery.active")) {
      showGalleryView();
      return;
    }

    showPDFView();

    // Desktop: flipbook còn sống → hiện lại
    if (!isMobile() && pageFlip && currentPdfUrl) return;
    // Mobile: content còn → hiện lại
    if (isMobile() && flipbookEl.children.length > 0 && currentPdfUrl) return;

    // Chưa có content → load
    var activeTab = document.querySelector(".ebr-tab-pdf.active");
    if (!activeTab) {
      activeTab = document.querySelector(".ebr-tab-pdf");
      if (activeTab) {
        tabs.forEach(function (t) {
          t.classList.remove("active");
        });
        activeTab.classList.add("active");
      }
    }
    if (activeTab && activeTab.dataset.pdf) {
      var pdfUrl = activeTab.dataset.pdf;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          loadPDF(pdfUrl);
        });
      });
    }
  }

  function hideEbrochure() {
    // CHỈ ẨN — giữ nguyên content
    overlayEl.classList.remove("visible");
    setTimeout(function () {
      overlayEl.style.display = "none";
    }, 400);
    if (stageEl) stageEl.style.opacity = "1";
    if (vignEl) vignEl.style.opacity = "1";
    if (dnEl) dnEl.style.display = "";
    if (hintEl) hintEl.style.display = "";
    var dlBtn = document.getElementById("btn-download-pdf");
    if (dlBtn) dlBtn.style.display = "none";
  }

  window._hideEbrochure = hideEbrochure;
  // ★ Resize flipbook khi thay đổi kích thước cửa sổ
  var flipResizeTimer = null;
  window.addEventListener("resize", function () {
    if (overlayEl.style.display === "none") return;
    if (isMobile()) return;
    if (!pageFlip || !window._flipbookOrigSize) return;

    clearTimeout(flipResizeTimer);
    flipResizeTimer = setTimeout(function () {
      var currentPage = 0;
      try {
        currentPage = pageFlip.getCurrentPageIndex();
      } catch (e) {}

      initFlipbookDesktop(
        window._flipbookOrigSize.w,
        window._flipbookOrigSize.h,
      );

      if (currentPage > 0 && pageFlip) {
        try {
          pageFlip.turnToPage(currentPage);
        } catch (e) {}
      }
    }, 300);
  });
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var clicked = this;
      tabs.forEach(function (t) {
        t.classList.remove("active");
      });
      clicked.classList.add("active");
      if (clicked.dataset.view === "gallery") {
        showGalleryView();
      } else if (clicked.dataset.pdf) {
        var url = clicked.dataset.pdf;
        showPDFView();
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            loadPDF(url);
          });
        });
      }
    });
  });

  navEbr.addEventListener("click", function (e) {
    e.preventDefault();
    document.querySelectorAll(".menu-item").forEach(function (i) {
      i.classList.remove("active");
    });
    this.classList.add("active");
    showEbrochure();
  });

  document
    .querySelectorAll(".menu-item:not(#nav-ebrochure)")
    .forEach(function (item) {
      item.addEventListener("click", function () {
        hideEbrochure();
      });
    });
})();

// ═══════════════════════════════════════════════════════════
//  PHÂN KHU — v2 PAN/ZOOM (Copy từ Mặt Bằng engine)
//
//  HƯỚNG DẪN:
//  1. Tìm đoạn (function initPhanKhu(){ ... })(); trong main.js (bản hosting)
//  2. XÓA TOÀN BỘ đoạn đó (từ dòng comment "PHÂN KHU" đến })(); )
//  3. DÁN đoạn code này vào vị trí đó
//
//  YÊU CẦU HTML: pk-viewport > pk-canvas > (.pk-img-bg + #pk-svg-layer)
//  Nếu HTML cũ chỉ có pk-canvas mà không có pk-viewport, cần wrap thêm.
// ═══════════════════════════════════════════════════════════

(function initPhanKhu() {
  "use strict";

  var overlay = document.getElementById("phankhu-overlay");
  var navPhanKhu = document.getElementById("nav-phan-khu");
  var svgLayer = document.getElementById("pk-svg-layer");
  var tooltip = document.getElementById("pk-tooltip");
  var stageEl = document.getElementById("stage");
  var vignEl = document.querySelector(".vign");
  var dnEl = document.getElementById("dn");
  var hintEl = document.getElementById("hint");

  if (!overlay || !navPhanKhu) return;

  var viewport = document.getElementById("pk-viewport");
  var pkCanvas = document.getElementById("pk-canvas");
  var imgBg = pkCanvas ? pkCanvas.querySelector(".pk-img-bg") : null;

  // ══════════════════════════════════════════════════════════
  //  PAN/ZOOM STATE
  // ══════════════════════════════════════════════════════════
  var wrapper = null;
  var pz = {
    scale: 1,
    tx: 0,
    ty: 0,
    natW: 2000,
    natH: 1125,
    minScale: 0.5,
    maxScale: 8,
    fitScale: 1,
  };

  function isMobileEnv() {
    var isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    var screenSmall = Math.min(window.innerWidth, window.innerHeight) <= 1024;
    return isTouch && screenSmall;
  }

  // ── Apply transform ───────────────────────────────────────
  var _rafPending = false;
  function applyTransform(animate) {
    if (!wrapper) return;
    if (animate) {
      wrapper.style.transition =
        "transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)";
      setTimeout(function () {
        wrapper.style.transition = "none";
      }, 750);
      wrapper.style.transform =
        "translate3d(" + pz.tx + "px," + pz.ty + "px,0) scale(" + pz.scale + ")";
    } else {
      // Batch non-animated transforms in rAF to avoid layout thrashing
      if (_rafPending) return;
      _rafPending = true;
      requestAnimationFrame(function () {
        _rafPending = false;
        if (!wrapper) return;
        wrapper.style.transform =
          "translate3d(" + pz.tx + "px," + pz.ty + "px,0) scale(" + pz.scale + ")";
      });
    }
  }

  // ── Clamp ──────────────────────────────────────────────────
  function clamp() {
    var vw = viewport.clientWidth;
    var vh = viewport.clientHeight;
    var sw = pz.natW * pz.scale;
    var sh = pz.natH * pz.scale;
    if (sw <= vw) {
      pz.tx = (vw - sw) / 2;
    } else {
      pz.tx = Math.min(0, Math.max(vw - sw, pz.tx));
    }
    if (sh <= vh) {
      pz.ty = (vh - sh) / 2;
    } else {
      pz.ty = Math.min(0, Math.max(vh - sh, pz.ty));
    }
  }

  // ── Zoom tại điểm ─────────────────────────────────────────
  function zoomAt(cx, cy, factor, animate) {
    var newScale = Math.max(
      pz.minScale,
      Math.min(pz.maxScale, pz.scale * factor),
    );
    var sf = newScale / pz.scale;
    pz.tx = cx - sf * (cx - pz.tx);
    pz.ty = cy - sf * (cy - pz.ty);
    pz.scale = newScale;
    clamp();
    applyTransform(animate);
  }

  // ── Setup pan/zoom ─────────────────────────────────────────
  function setupPanZoom() {
    if (!wrapper || !viewport) return;

    var isMob = isMobileEnv();

    pz.natW = imgBg.naturalWidth || 2000;
    pz.natH = imgBg.naturalHeight || 1125;

    // ★ MOBILE: Giảm kích thước render mạnh hơn — 12MB ảnh scale trên GPU rất nặng
    if (isMob && pz.natW > 1000) {
      var ratio = pz.natH / pz.natW;
      pz.natW = 1000;
      pz.natH = Math.round(1000 * ratio);
    }

    // Sync imgBg + svgLayer size
    imgBg.style.width = pz.natW + "px";
    imgBg.style.height = pz.natH + "px";
    if (svgLayer) {
      svgLayer.style.width = pz.natW + "px";
      svgLayer.style.height = pz.natH + "px";
    }

    var vw = viewport.clientWidth;
    var vh = viewport.clientHeight;
    if (!vw || !vh) {
      setTimeout(setupPanZoom, 100);
      return;
    }

    var fitScale = Math.max(vw / pz.natW, vh / pz.natH);
    pz.fitScale = fitScale;
    pz.scale = fitScale;
    pz.minScale = fitScale * 0.8;
    // ★ MOBILE: Giới hạn zoom thấp hơn → ít pixel render hơn
    pz.maxScale = isMob ? fitScale * 3.5 : fitScale * 6;

    wrapper.style.width = pz.natW + "px";
    wrapper.style.height = pz.natH + "px";
    wrapper.style.position = "absolute";
    wrapper.style.left = "0";
    wrapper.style.top = "0";
    wrapper.style.transformOrigin = "0 0";
    wrapper.style.willChange = "transform";
    wrapper.style.backfaceVisibility = "hidden";
    wrapper.style.webkitBackfaceVisibility = "hidden";
    wrapper.style.contain = "layout style paint";

    var scaledW = pz.natW * pz.scale;
    var scaledH = pz.natH * pz.scale;

    pz.tx = scaledW > vw ? -(scaledW - vw) / 2 : (vw - scaledW) / 2;
    pz.ty = scaledH > vh ? -(scaledH - vh) / 2 : (vh - scaledH) / 2;

    viewport.style.overflow = "hidden";
    viewport.style.cursor = "grab";
    viewport.style.touchAction = "none";

    clamp();
    applyTransform(false);
  }

  // ── Zoom to zone — JS lerp animation ──────────────────────
  var _bboxCache = new WeakMap();
  var _zoomRafId = null;

  function zoomToZone(zone, animate) {
    if (!wrapper || !viewport) return;

    // Cache getBBox to avoid forced reflow
    var bbox = _bboxCache.get(zone);
    if (!bbox) {
      try {
        var raw = zone.getBBox();
        bbox = { x: raw.x, y: raw.y, width: raw.width, height: raw.height };
        _bboxCache.set(zone, bbox);
      } catch (e) {
        return;
      }
    }

    var vw = viewport.clientWidth;
    var vh = viewport.clientHeight;

    var svgEl = svgLayer.querySelector("svg");
    var svgVB = svgEl ? svgEl.viewBox.baseVal : null;
    var svgW = svgVB ? svgVB.width : 2000;
    var svgH = svgVB ? svgVB.height : 1125;

    var cx = ((bbox.x + bbox.width / 2) / svgW) * pz.natW;
    var cy = ((bbox.y + bbox.height / 2) / svgH) * pz.natH;

    var zoneW = (bbox.width / svgW) * pz.natW;
    var zoneH = (bbox.height / svgH) * pz.natH;
    var targetScale = Math.min(
      (vw * 0.5) / zoneW,
      (vh * 0.5) / zoneH,
      pz.maxScale,
    );
    targetScale = Math.max(targetScale, pz.fitScale * 1.5);

    var targetTx = vw / 2 - cx * targetScale;
    var targetTy = vh / 2 - cy * targetScale;

    if (!animate) {
      pz.scale = targetScale;
      pz.tx = targetTx;
      pz.ty = targetTy;
      clamp();
      wrapper.style.transition = "none";
      wrapper.style.transform =
        "translate3d(" + pz.tx + "px," + pz.ty + "px,0) scale(" + pz.scale + ")";
      return;
    }

    // ★ CSS transition cho cả desktop + mobile
    // 1 lần ghi style → browser xử lý trên compositor thread → không block main thread
    pz.scale = targetScale;
    pz.tx = targetTx;
    pz.ty = targetTy;
    clamp();
    var duration = isMobileEnv() ? "0.6s" : "0.7s";
    wrapper.style.transition = "transform " + duration + " cubic-bezier(0.4, 0, 0.2, 1)";
    wrapper.style.transform =
      "translate3d(" + pz.tx + "px," + pz.ty + "px,0) scale(" + pz.scale + ")";
    
    // Tăng thời gian timeout tương ứng: 650ms hoặc 750ms
    setTimeout(function () {
      wrapper.style.transition = "none";
    }, isMobileEnv() ? 650 : 750);
    return;
  }

  // ══════════════════════════════════════════════════════════
  //  MOUSE EVENTS — Desktop drag + scroll zoom
  // ══════════════════════════════════════════════════════════
  var mouseBound = false;
  var _mouseMoved = false;

  function bindMouseEvents() {
    if (mouseBound || !viewport) return;
    mouseBound = true;

    var dragging = false;
    var startX = 0, startY = 0, startTx = 0, startTy = 0;

    viewport.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      dragging = true;
      _mouseMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      startTx = pz.tx;
      startTy = pz.ty;
      viewport.style.cursor = "grabbing";
      e.preventDefault();
    });

    window.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _mouseMoved = true;
      pz.tx = startTx + dx;
      pz.ty = startTy + dy;
      clamp();
      applyTransform(false);
    });

    window.addEventListener("mouseup", function () {
      if (dragging) {
        dragging = false;
        viewport.style.cursor = "grab";
      }
    });

    viewport.addEventListener(
      "wheel",
      function (e) {
        e.preventDefault();
        var rect = viewport.getBoundingClientRect();
        var cx = e.clientX - rect.left;
        var cy = e.clientY - rect.top;
        var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        zoomAt(cx, cy, factor, false);
      },
      { passive: false },
    );

    viewport.addEventListener("dblclick", function (e) {
      if (e.target.closest(".zp")) return;
      var rect = viewport.getBoundingClientRect();
      var cx = e.clientX - rect.left;
      var cy = e.clientY - rect.top;
      if (pz.scale > pz.fitScale * 1.5) {
        setupPanZoom();
      } else {
        zoomAt(cx, cy, 2.5, true);
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  //  TOUCH EVENTS — Mobile drag + pinch zoom + double tap
  // ══════════════════════════════════════════════════════════
  var touchBound = false;
  var _touchMoved = false;

  function bindTouchEvents() {
    if (touchBound || !viewport) return;
    touchBound = true;

    var t = {
      dragging: false,
      pinching: false,
      startX: 0, startY: 0,
      startTx: 0, startTy: 0,
      lastDist: 0,
      lastMidX: 0, lastMidY: 0,
      tapTime: 0,
      velX: 0, velY: 0,
      lastMoveX: 0, lastMoveY: 0,
      lastMoveTime: 0,
      inertiaId: 0,
    };

    function d2(touches) {
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function m2(touches) {
      var r = viewport.getBoundingClientRect();
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2 - r.left,
        y: (touches[0].clientY + touches[1].clientY) / 2 - r.top,
      };
    }
    function stopInertia() {
      if (t.inertiaId) {
        cancelAnimationFrame(t.inertiaId);
        t.inertiaId = 0;
      }
    }
    function startInertia() {
      var decay = isMobileEnv() ? 0.88 : 0.92;
      var minVel = isMobileEnv() ? 1.0 : 0.5;
      function step() {
        if (Math.abs(t.velX) < minVel && Math.abs(t.velY) < minVel) {
          t.inertiaId = 0;
          return;
        }
        pz.tx += t.velX;
        pz.ty += t.velY;
        t.velX *= decay;
        t.velY *= decay;
        clamp();
        applyTransform(false);
        t.inertiaId = requestAnimationFrame(step);
      }
      t.inertiaId = requestAnimationFrame(step);
    }

    viewport.addEventListener(
      "touchstart",
      function (e) {
        stopInertia();
        _touchMoved = false;
        if (e.touches.length === 1) {
          var now = Date.now();
          if (now - t.tapTime < 280) {
            var r = viewport.getBoundingClientRect();
            var cx = e.touches[0].clientX - r.left;
            var cy = e.touches[0].clientY - r.top;
            if (pz.scale > pz.fitScale * 1.5) {
              setupPanZoom();
            } else {
              zoomAt(cx, cy, 2.5, true);
            }
            t.tapTime = 0;
            return;
          }
          t.tapTime = now;
          t.dragging = true;
          t.pinching = false;
          t.startX = e.touches[0].clientX;
          t.startY = e.touches[0].clientY;
          t.startTx = pz.tx;
          t.startTy = pz.ty;
          t.lastMoveX = t.startX;
          t.lastMoveY = t.startY;
          t.lastMoveTime = now;
          t.velX = 0;
          t.velY = 0;
        } else if (e.touches.length === 2) {
          if (e.cancelable) e.preventDefault();
          t.pinching = true;
          t.dragging = false;
          t.lastDist = d2(e.touches);
          var mid = m2(e.touches);
          t.lastMidX = mid.x;
          t.lastMidY = mid.y;
        }
      },
      { passive: false },
    );

    viewport.addEventListener(
      "touchmove",
      function (e) {
        if (e.cancelable) e.preventDefault();
        _touchMoved = true;
        if (t.pinching && e.touches.length === 2) {
          var newDist = d2(e.touches);
          var mid = m2(e.touches);
          var factor = newDist / t.lastDist;
          var newScale = Math.max(
            pz.minScale,
            Math.min(pz.maxScale, pz.scale * factor),
          );
          var sf = newScale / pz.scale;
          pz.tx = mid.x - sf * (t.lastMidX - pz.tx);
          pz.ty = mid.y - sf * (t.lastMidY - pz.ty);
          pz.scale = newScale;
          t.lastDist = newDist;
          t.lastMidX = mid.x;
          t.lastMidY = mid.y;
          clamp();
          applyTransform(false);
        } else if (t.dragging && !t.pinching && e.touches.length === 1) {
          var cx = e.touches[0].clientX, cy = e.touches[0].clientY;
          pz.tx = t.startTx + (cx - t.startX);
          pz.ty = t.startTy + (cy - t.startY);
          clamp();
          applyTransform(false);
          var now = Date.now();
          var dt = now - t.lastMoveTime;
          if (dt > 0) {
            t.velX = ((cx - t.lastMoveX) / dt) * 16;
            t.velY = ((cy - t.lastMoveY) / dt) * 16;
          }
          t.lastMoveX = cx;
          t.lastMoveY = cy;
          t.lastMoveTime = now;
        }
      },
      { passive: false },
    );

    viewport.addEventListener(
      "touchend",
      function (e) {
        if (e.touches.length < 2) t.pinching = false;
        if (e.touches.length === 0) {
          t.dragging = false;
          if (Math.abs(t.velX) > 1 || Math.abs(t.velY) > 1) startInertia();
        }
      },
      { passive: true },
    );
  }

  // ══════════════════════════════════════════════════════════
  //  SVG LOAD + ZONE EVENTS
  // ══════════════════════════════════════════════════════════
  var svgLoaded = false;
  var NS = "http://www.w3.org/2000/svg";

  function loadSVG() {
    if (svgLoaded || !svgLayer) return;
    svgLoaded = true;
    fetch("./frames/phankhu/phankhu.svg")
      .then(function (r) { return r.text(); })
      .then(function (svgText) {
        svgLayer.innerHTML = svgText;
        var svgEl = svgLayer.querySelector("svg");
        if (svgEl) {
          svgEl.setAttribute("width", "100%");
          svgEl.setAttribute("height", "100%");
          svgEl.setAttribute("preserveAspectRatio", "none");
          svgEl.style.cssText =
            "display:block;width:100%;height:100%;position:absolute;top:0;left:0;";

          var isMob = isMobileEnv();

          // ★ MOBILE: Tắt SVG filter/effect nặng
          if (isMob) {
            // Tắt tất cả filter (blur, shadow, glow)
            svgEl.querySelectorAll("filter").forEach(function (f) {
              f.remove();
            });
            // Bỏ filter reference trên các element
            svgEl.querySelectorAll("[filter]").forEach(function (el) {
              el.removeAttribute("filter");
            });
            // Đơn giản hóa stroke
            svgEl.querySelectorAll(".zp").forEach(function (z) {
              z.style.strokeWidth = "1";
              z.style.contain = "layout";
            });
          } else {
            // Desktop: GPU acceleration cho zones
            svgEl.querySelectorAll(".zp").forEach(function (z) {
              z.style.willChange = "opacity";
              z.style.contain = "layout style";
            });
          }
        }
        bindZoneEvents();
      })
      .catch(function () { svgLoaded = false; });
  }
  setTimeout(loadSVG, 2000);

  // Preload ảnh nền
  var pkImg = new Image();
  var pkImgLoaded = false;
  function preloadPkImg() {
    pkImg.src = "./frames/phankhu/2.1.jpg";
    if (pkImg.decode) {
      pkImg.decode()
        .then(function () { pkImgLoaded = true; })
        .catch(function () { pkImgLoaded = true; });
    } else {
      pkImg.onload = function () { pkImgLoaded = true; };
    }
  }
  setTimeout(preloadPkImg, 1500);

  // ── Zone info data ──
  var ZONE_INFO = {
    "LIỀN KỀ 1": {
      title: "LIỀN KỀ 01 - LK01",
      stats: [
        "Tổng diện tích: <span class='pk-highlight'>4.908 m²</span>",
        "Số lô: <span class='pk-highlight'>44</span>",
        "Diện tích lô <span class='pk-highlight'>từ 82 đến 90 m²</span>",
        "Nằm trên trục chính cổng chào",
        "Đối diện Trung tâm thương mại",
        "2 mặt tiền, tiếp giáp trục đường chính rộng 22m",
      ],
    },
    "LIỀN KỀ 2": {
      title: "LIỀN KỀ 02 - LK02",
      stats: [
        "Tổng diện tích: <span class='pk-highlight'>3.868 m²</span>",
        "Số lô: <span class='pk-highlight'>43</span>",
        "Diện tích lô <span class='pk-highlight'>từ 82 đến 90 m²</span>",
        "1 mặt tiếp giáp đường 22m",
        "Đối diện TTTM, bãi đỗ xe, quảng trường",
        "Khu vực nhiều cây xanh",
      ],
    },
    "LIỀN KỀ 3": {
      title: "LIỀN KỀ 03 - LK03",
      stats: [
        "Tổng diện tích: <span class='pk-highlight'>2.342,8 m²</span>",
        "Số lô: <span class='pk-highlight'>19</span>",
        "Diện tích lô <span class='pk-highlight'>từ 120 đến 132 m²</span>",
        "1 mặt tiếp giáp đường 22m",
        "Đối diện bãi đỗ xe",
        "Tiếp giáp khu dân cư hiện hữu",
      ],
    },
    "LIỀN KỀ 4": {
      title: "LIỀN KỀ 04 - LK04",
      stats: [
        "Tổng diện tích: <span class='pk-highlight'>1.924,8 m²</span>",
        "Số lô: <span class='pk-highlight'>16</span>",
        "Diện tích lô <span class='pk-highlight'>từ 114 đến 125 m²</span>",
        "Đối diện bãi đỗ xe",
        "Tiếp giáp khu dân cư hiện hữu",
      ],
    },
    "LIỀN KỀ 5": {
      title: "LIỀN KỀ 05 - LK05",
      stats: [
        "Tổng diện tích: <span class='pk-highlight'>1.939,4 m²</span>",
        "Số lô: <span class='pk-highlight'>16</span>",
        "Diện tích lô <span class='pk-highlight'>từ 114 đến 125 m²</span>",
        "Tiếp giáp khu dân cư hiện hữu",
      ],
    },
    "LIỀN KỀ 6": {
      title: "LIỀN KỀ 06 - LK06",
      stats: [
        "Tổng diện tích: <span class='pk-highlight'>1.100,5 m²</span>",
        "Số lô: <span class='pk-highlight'>8</span>",
        "Diện tích lô <span class='pk-highlight'>từ 130 đến 166,1 m²</span>",
        "Tiếp giáp khu dân cư hiện hữu",
      ],
    },
    "LIỀN KỀ 7": {
      title: "LIỀN KỀ 07 - LK07",
      stats: [
        "Tổng diện tích: <span class='pk-highlight'>1.214 m²</span>",
        "Số lô: <span class='pk-highlight'>13</span>",
        "Diện tích lô <span class='pk-highlight'>từ 90 đến 102 m²</span>",
        "Sát cạnh bãi đỗ xe",
        "1 mặt tiếp giáp đường 22m",
      ],
    },
    "LIỀN KỀ 8": {
      title: "LIỀN KỀ 08 - LK08",
      stats: [
        "Tổng diện tích: <span class='pk-highlight'>3.654 m²</span>",
        "Số lô: <span class='pk-highlight'>32</span>",
        "Diện tích lô <span class='pk-highlight'>từ 102 đến 114 m²</span>",
        "Đối diện bãi đỗ xe",
        "2 mặt tiền, tiếp giáp trục đường chính rộng 22m",
      ],
    },
    "LIỀN KỀ 9": {
      title: "LIỀN KỀ 09 - LK09",
      stats: [
        "Tổng diện tích: <span class='pk-highlight'>3.266 m²</span>",
        "Số lô: <span class='pk-highlight'>31</span>",
        "Diện tích lô <span class='pk-highlight'>từ 102 đến 128 m²</span>",
        "2 mặt tiền, tiếp giáp trục đường chính rộng 22m",
        "View hồ",
        "Đối diện khu biệt thự cao cấp",
      ],
    },
    "BIỆT THỰ 1": {
      title: "BIỆT THỰ 01 - BT01",
      stats: [
        "Tổng diện tích: <span class='pk-highlight'>2.625 m²</span>",
        "Số lô: <span class='pk-highlight'>8</span>",
        "Diện tích lô <span class='pk-highlight'>từ 293 đến 447,7 m²</span>",
        "1 mặt tiếp giáp đường 22m",
        "View hồ",
      ],
    },
    "BIỆT THỰ 2": {
      title: "BIỆT THỰ 02 - BT02",
      stats: [
        "Tổng diện tích: <span class='pk-highlight'>3.301,5 m²</span>",
        "Số lô: <span class='pk-highlight'>10</span>",
        "Diện tích lô <span class='pk-highlight'>từ 320 đến 352 m²</span>",
        "2 mặt tiền, tiếp giáp trục đường chính rộng 22m",
        "View hồ",
      ],
    },
    "SHOPHOUSE 1": {
      title: "SHOPHOUSE 01 - SH01",
      stats: [
        "Tổng diện tích: <span class='pk-highlight'>3.592,5 m²</span>",
        "Số lô: <span class='pk-highlight'>28</span>",
        "Diện tích  lô từ <span class='pk-highlight'>126 đến 159,4 m²</span>",
        "2 mặt tiền, tiếp giáp trục đường chính rộng 22m",
        "Đối diện TTTM",
        "1 mặt tiếp giáp trục QL37",
      ],
    },
    "SHOPHOUSE 2": {
      title: "SHOPHOUSE 02 - SH02",
      stats: [
        "Tổng diện tích: <span class='pk-highlight'>3.594,5 m²</span>",
        "Số lô: <span class='pk-highlight'>28</span>",
        "Diện tích  lô từ <span class='pk-highlight'>126 đến 160,9 m²</span>",
        "2 mặt tiền, tiếp giáp trục đường chính rộng 22m",
        "1 mặt tiếp giáp trục QL37",
        "View hồ",
      ],
    },
  };

  var activeZone = null;

  // ── Info Panel ─────────────────────────────────────────────
  function showInfoPanel(zoneName) {
    var info = ZONE_INFO[zoneName];
    var panel = document.getElementById("pk-info");
    var titleEl = document.getElementById("pk-info-title");
    var bodyEl = document.getElementById("pk-info-body");
    if (!panel || !titleEl || !bodyEl) return;
    if (!info) {
      panel.classList.remove("visible");
      return;
    }

    titleEl.textContent = info.title;
    bodyEl.innerHTML = info.stats
      .map(function (s) { return '<div class="pk-stat">' + s + "</div>"; })
      .join("");

    // Mobile: set position trực tiếp bằng JS
    var isMob = window.innerWidth <= 768;
    if (isMob) {
      panel.style.cssText =
        "position:fixed !important;" +
        "top:12px !important;" +
        "left:12px !important;" +
        "right:12px !important;" +
        "bottom:auto !important;" +
        "max-width:none !important;" +
        "padding:10px 14px 10px 16px;" +
        "background:rgba(1,15,22,0.93);" +
        "border-radius:10px;" +
        "border-left:2px solid #ffd54f;" +
        "box-shadow:0 4px 20px rgba(0,0,0,0.6);" +
        "z-index:500;" +
        "opacity:1;" +
        "transform:none;" +
        "pointer-events:auto;";
      titleEl.style.cssText =
        "font-size:15px;margin-bottom:4px;white-space:nowrap;" +
        "overflow:hidden;text-overflow:ellipsis;";
      bodyEl.style.cssText =
        "font-size:10.5px;line-height:1.6;" +
        "max-height:130px;overflow-y:auto;-webkit-overflow-scrolling:touch;";
    } else {
      panel.style.cssText = "";
      titleEl.style.cssText = "";
      bodyEl.style.cssText = "";
    }

    panel.classList.add("visible");
  }

  function hideInfoPanel() {
    var panel = document.getElementById("pk-info");
    if (!panel) return;
    panel.classList.remove("visible");
    panel.style.cssText = "";
    panel.style.opacity = "0";
    panel.style.pointerEvents = "none";
  }

  // ── Clear / Activate zone ──────────────────────────────────
  function clearActive() {
    if (!svgLayer) return;

    // Cancel any ongoing zoom animation
    if (_zoomRafId) {
      cancelAnimationFrame(_zoomRafId);
      _zoomRafId = null;
    }

    // DOM cleanup in one rAF batch
    requestAnimationFrame(function () {
      if (activeZone) activeZone.classList.remove("active");
      quickClearHighlight();
      if (tooltip) tooltip.classList.remove("visible");
      hideInfoPanel();
      activeZone = null;
    });

    var isMob = isMobileEnv();
    var vw = viewport.clientWidth;
    var vh = viewport.clientHeight;
    var fitScale = Math.max(vw / pz.natW, vh / pz.natH);
    var scaledW = pz.natW * fitScale;
    var scaledH = pz.natH * fitScale;
    var fitTx = scaledW > vw ? -(scaledW - vw) / 2 : (vw - scaledW) / 2;
    var fitTy = scaledH > vh ? -(scaledH - vh) / 2 : (vh - scaledH) / 2;

    // ★ CSS transition zoom-back cho cả desktop + mobile
    pz.scale = fitScale;
    pz.tx = fitTx;
    pz.ty = fitTy;
    clamp();
    // ★ FIX 5: Tăng transition mobile 0.2s → 0.3s — GPU yếu cần thời gian render
    var dur = isMob ? "0.3s" : "0.35s";
    wrapper.style.transition = "transform " + dur + " cubic-bezier(0.25,0.46,0.45,0.94)";
    wrapper.style.transform =
      "translate3d(" + pz.tx + "px," + pz.ty + "px,0) scale(" + pz.scale + ")";
    setTimeout(function () {
      wrapper.style.transition = "none";
    }, isMob ? 320 : 370);
  }

  // ★ Reuse 1 path element cho mask cutout — không xóa/tạo lại DOM mỗi lần
  var _reusableCutout = null;

  function activateZone(zone) {
    if (!_cachedSvgEl) cacheSvgRefs();
    if (!_cachedSvgEl) return;

    var isMob = isMobileEnv();

    // ★ ANTI-FLASH FIX: Set cutout path NGAY LẬP TỨC trước khi dim hiện
    // Nếu set dim trước mà chưa có cutout → toàn bộ rect hiện = FLASH trắng/xanh
    if (_cachedMask) {
      var pathD = zone.getAttribute("d");
      if (pathD) pathD = simplifyPath(pathD);

      if (!_reusableCutout) {
        _reusableCutout = document.createElementNS(NS, "path");
        _reusableCutout.setAttribute("fill", "black");
        _reusableCutout.setAttribute("class", "pk-cutout");
        _cachedMask.appendChild(_reusableCutout);
      }
      _reusableCutout.setAttribute("d", pathD);
    }

    // Zoom vào zone
    zoomToZone(zone, true);

    // Delay dim overlay — chờ zoom transition chạy trước
    // Cutout đã set sẵn → khi dim hiện lên sẽ KHÔNG flash toàn màn hình
    var highlightDelay = isMob ? 450 : 500;

    setTimeout(function () {
      // Dim overlay — CSS transition 0.3s mượt
      if (_cachedDim) {
        _cachedDim.setAttribute("opacity", isMob ? "0.6" : "0.85");
      }

      zone.classList.add("active");
      activeZone = zone;

      var zoneName =
        zone.getAttribute("data-n") || zone.getAttribute("data-id") || "";
      showInfoPanel(zoneName);
    }, highlightDelay);
  }

  // ── Đơn giản hóa SVG path cho mobile ───────────────────────
  // Chuyển C/S/Q curves → L (line), giữ hình dạng gần đúng, giảm render cost
  function simplifyPath(d) {
    var commands = d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g);
    if (!commands) return d;

    var result = [];
    var cx = 0, cy = 0;

    for (var i = 0; i < commands.length; i++) {
      var cmd = commands[i].trim();
      var type = cmd[0];
      var nums = cmd.slice(1).trim().match(/-?[\d.]+/g);
      nums = nums ? nums.map(Number) : [];

      switch (type) {
        case "M":
          cx = nums[0]; cy = nums[1];
          result.push("M" + cx + " " + cy);
          break;
        case "m":
          cx += nums[0]; cy += nums[1];
          result.push("M" + cx + " " + cy);
          break;
        case "L":
          cx = nums[0]; cy = nums[1];
          result.push("L" + cx + " " + cy);
          break;
        case "l":
          cx += nums[0]; cy += nums[1];
          result.push("L" + cx + " " + cy);
          break;
        case "H":
          cx = nums[0];
          result.push("L" + cx + " " + cy);
          break;
        case "h":
          cx += nums[0];
          result.push("L" + cx + " " + cy);
          break;
        case "V":
          cy = nums[0];
          result.push("L" + cx + " " + cy);
          break;
        case "v":
          cy += nums[0];
          result.push("L" + cx + " " + cy);
          break;
        case "C":
          for (var j = 0; j + 5 < nums.length; j += 6) {
            cx = nums[j + 4]; cy = nums[j + 5];
            result.push("L" + cx + " " + cy);
          }
          break;
        case "c":
          for (var j = 0; j + 5 < nums.length; j += 6) {
            cx += nums[j + 4]; cy += nums[j + 5];
            result.push("L" + cx + " " + cy);
          }
          break;
        case "S":
          for (var j = 0; j + 3 < nums.length; j += 4) {
            cx = nums[j + 2]; cy = nums[j + 3];
            result.push("L" + cx + " " + cy);
          }
          break;
        case "s":
          for (var j = 0; j + 3 < nums.length; j += 4) {
            cx += nums[j + 2]; cy += nums[j + 3];
            result.push("L" + cx + " " + cy);
          }
          break;
        case "Q":
          for (var j = 0; j + 3 < nums.length; j += 4) {
            cx = nums[j + 2]; cy = nums[j + 3];
            result.push("L" + cx + " " + cy);
          }
          break;
        case "q":
          for (var j = 0; j + 3 < nums.length; j += 4) {
            cx += nums[j + 2]; cy += nums[j + 3];
            result.push("L" + cx + " " + cy);
          }
          break;
        case "Z":
        case "z":
          result.push("Z");
          break;
        default:
          result.push(cmd);
          break;
      }
    }
    return result.join(" ");
  }

  // ── Bind zone events ──────────────────────────────────────
  // Cache SVG element references once
  var _cachedSvgEl = null;
  var _cachedDim = null;
  var _cachedMask = null;

  function cacheSvgRefs() {
    _cachedSvgEl = svgLayer.querySelector("svg");
    if (_cachedSvgEl) {
      _cachedDim = _cachedSvgEl.querySelector("#pk-dim");
      _cachedMask = _cachedSvgEl.querySelector("#pk-mask");

      // ★ FIX 2: Thêm CSS transition cho dim — tránh tối/sáng đột ngột
      if (_cachedDim) {
        _cachedDim.style.willChange = "opacity";
        _cachedDim.style.transition = "opacity 0.3s ease";
        _cachedDim.setAttribute("opacity", "0");
      }

      // ★ MOBILE: Tối ưu mask — bỏ feather/blur nặng
      if (isMobileEnv()) {
        if (_cachedMask) {
          _cachedMask.querySelectorAll("feGaussianBlur, feBlend, feFlood").forEach(function(f) {
            f.remove();
          });
        }
      }
    }
  }

  function quickClearHighlight() {
    // ★ ANTI-FLASH FIX: Dim fade về 0 TRƯỚC (CSS transition 0.3s)
    // Chỉ clear cutout SAU KHI dim đã ẩn hoàn toàn → tránh flash
    if (_cachedDim) _cachedDim.setAttribute("opacity", "0");
    // Delay clear cutout → chờ dim transition xong (0.3s)
    // Nếu clear cutout ngay → dim vẫn đang visible + không có cutout = FLASH
    if (_reusableCutout) {
      setTimeout(function () {
        if (_reusableCutout) _reusableCutout.setAttribute("d", "");
      }, 350);
    }
  }

  function bindZoneEvents() {
    var zones = svgLayer.querySelectorAll(".zp");

    // Cache refs after SVG is loaded
    cacheSvgRefs();

    // Throttled tooltip position update
    var _tooltipRaf = 0;

    zones.forEach(function (zone) {
      zone.addEventListener("mouseenter", function () {
        var name = this.getAttribute("data-n") || this.getAttribute("data-id") || "";
        if (tooltip && name) {
          tooltip.textContent = name;
          tooltip.classList.add("visible");
        }
      });
      zone.addEventListener("mousemove", function (e) {
        if (!tooltip) return;
        if (_tooltipRaf) return; // Skip if pending
        _tooltipRaf = requestAnimationFrame(function () {
          _tooltipRaf = 0;
          tooltip.style.left = e.clientX + 14 + "px";
          tooltip.style.top = e.clientY - 36 + "px";
        });
      });
      zone.addEventListener("mouseleave", function () {
        if (tooltip) tooltip.classList.remove("visible");
      });
      zone.addEventListener("click", function (e) {
        e.stopPropagation();
        if (_touchMoved || _mouseMoved) return;

        var wasActive = this.classList.contains("active");
        var self = this;

        // ★ ANTI-FLASH FIX: Khi chuyển zone, KHÔNG gọi quickClearHighlight()
        // vì nó clear cutout + dim → 1 frame dim KHÔNG CÓ cutout = FLASH TRẮNG/XANH TOÀN MÀN HÌNH
        // Thay vào đó: chỉ remove class active cũ, để activateZone set cutout mới TRƯỚC khi dim thay đổi

        if (activeZone && activeZone !== self) {
          activeZone.classList.remove("active");
          // KHÔNG gọi quickClearHighlight() ở đây
          // activateZone sẽ set cutout mới → dim giữ nguyên → KHÔNG flash
        }

        if (tooltip) tooltip.classList.remove("visible");
        hideInfoPanel();
        activeZone = null;

        if (!wasActive) {
          activateZone(self);
        } else {
          // Click lại zone đang active → tắt highlight
          quickClearHighlight();
          clearActive();
        }
      });
    });

    // Click vùng trống → reset
    viewport.addEventListener("click", function (e) {
      if (e.target.closest(".zp")) return;
      if (_touchMoved || _mouseMoved) return;
      if (activeZone) {
        clearActive();
      }
    });
  }

  // ── Init wrapper ──────────────────────────────────────────
  function initWrapper() {
    if (!pkCanvas || !imgBg || !svgLayer) return;
    wrapper = pkCanvas;

    imgBg.style.cssText =
      "position:absolute;top:0;left:0;" +
      "width:" + pz.natW + "px;" +
      "height:" + pz.natH + "px;" +
      "display:block;pointer-events:none;user-select:none;object-fit:fill;";

    svgLayer.style.cssText =
      "position:absolute;top:0;left:0;" +
      "width:" + pz.natW + "px;" +
      "height:" + pz.natH + "px;" +
      "z-index:5;";

    var svgEl = svgLayer.querySelector("svg");
    if (svgEl) {
      svgEl.setAttribute("width", "100%");
      svgEl.setAttribute("height", "100%");
      svgEl.setAttribute("preserveAspectRatio", "none");
      svgEl.style.cssText = "display:block;width:100%;height:100%;";
    }
  }

  function onImageReady() {
    pz.natW = imgBg.naturalWidth || 2000;
    pz.natH = imgBg.naturalHeight || 1125;
    initWrapper();
    setupPanZoom();
    bindMouseEvents();
    bindTouchEvents();
  }

  // ── Show / Hide ───────────────────────────────────────────
  function showPhanKhu() {
    if (window._hideEbrochure) window._hideEbrochure();
    if (window._hideVitri) window._hideVitri();
    if (window._hideThamQuan) window._hideThamQuan();
    if (window._hideMatBang) window._hideMatBang();
    var tiOv = document.getElementById("tienich-overlay");
    if (tiOv) {
      tiOv.classList.remove("visible");
      setTimeout(function () { tiOv.style.display = "none"; }, 400);
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

    // Hiện overlay
    overlay.style.display = "flex";
    requestAnimationFrame(function () {
      overlay.classList.add("visible");
    });

    // Set src cho imgBg nếu chưa có — ★ FIX 4: Không ghi đè cssText, để CSS .pk-img-bg xử lý
    // Tránh repaint kép do đổi object-fit liên tục (fill → cover → pixel size)
    if (imgBg) {
      if (!imgBg.src || imgBg.naturalWidth === 0) {
        imgBg.src = "./frames/phankhu/2.1.jpg";
      }
      // GPU hints set 1 lần — không ghi đè toàn bộ cssText
      if (!imgBg._gpuHinted) {
        imgBg._gpuHinted = true;
        imgBg.style.transform = "translateZ(0)";
        imgBg.style.backfaceVisibility = "hidden";
        imgBg.style.webkitBackfaceVisibility = "hidden";
      }
    }

    loadSVG();

    // Polling chờ viewport có size VÀ imgBg loaded
    var attempts = 0;
    function trySetup() {
      attempts++;
      var vw = viewport ? viewport.clientWidth : 0;
      var vh = viewport ? viewport.clientHeight : 0;
      var imgReady = imgBg && imgBg.complete && imgBg.naturalWidth > 0;

      if (!vw || !vh || !imgReady) {
        if (attempts < 50) setTimeout(trySetup, 50);
        return;
      }

      if (!wrapper) {
        onImageReady();
      } else {
        setupPanZoom();
      }
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(trySetup);
    });
  }

  function hidePhanKhu() {
    if (overlay.style.display === "none") return;
    if (activeZone) {
      activeZone.classList.remove("active");
      quickClearHighlight();
      hideInfoPanel();
      activeZone = null;
    }
    overlay.classList.remove("visible");
    setTimeout(function () { overlay.style.display = "none"; }, 400);
    if (stageEl) stageEl.style.opacity = "1";
    if (vignEl) vignEl.style.opacity = "1";
    if (dnEl) dnEl.style.display = "";
    if (hintEl) hintEl.style.display = "";
  }

  window._hidePhanKhu = hidePhanKhu;

  // ── Mobile notice (giữ lại nhưng bỏ chặn) ────────────────
  var mobileNotice = document.getElementById("pk-mobile-disabled-overlay");
  var btnBack = document.getElementById("pk-disabled-back");

  navPhanKhu.addEventListener("click", function (e) {
    e.preventDefault();
    // Mobile giờ cũng dùng được nhờ touch pan/zoom
    document.querySelectorAll(".menu-item").forEach(function (i) {
      i.classList.remove("active");
    });
    this.classList.add("active");
    showPhanKhu();
  });

  if (btnBack) {
    btnBack.addEventListener("click", function () {
      if (mobileNotice) mobileNotice.style.display = "none";
      var navTongQuan = document.getElementById("nav-toan-canh");
      if (navTongQuan) navTongQuan.click();
    });
  }

  document
    .querySelectorAll(".menu-item:not(#nav-phan-khu)")
    .forEach(function (item) {
      item.addEventListener("click", function () {
        hidePhanKhu();
        if (mobileNotice) mobileNotice.style.display = "none";
      });
    });

  // ── Resize handler ──
  window.addEventListener("resize", function () {
    if (overlay.style.display === "none") return;
    if (wrapper) setupPanZoom();
  });
})();

// ═══════════════════════════════════════════════════════════
//  THAM QUAN — Đã chuyển sang thamquan-vr360.js
//  (file riêng xử lý VR 360° + hotspot cho tab Tham Quan)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
//  MẶT BẰNG — Đã chuyển sang matbang.js
//  (file riêng xử lý SVG Plan + Lot Info từ lot-data.json)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
//  ALBUM LIGHTBOX — Hard-coded albums per gallery box
// ═══════════════════════════════════════════════════════════
(function initAlbumLightbox() {
  const BASE = "./frames/galley/";

  // === HARD-CODED ALBUM DATA ===
  // Index matches data-album-index of each .hdev-library-grid-item
  let ALBUMS = [
    {
      title: "Phối Cảnh Tổng Quan",
      images: [
        BASE + "8.jpg",
        BASE + "PCTT 01.jpg",
        BASE + "PCTT 02.jpg",
        BASE + "PCTT 03.jpg",
        BASE + "PCTT 04_DAY.jpg",
        BASE + "PCTT 04_NIGHT.jpg",
      ],
    },
     {
      title: "Shophouse 01",
      images: [
        BASE + "18.jpg",
        BASE + "19.jpg",
        BASE + "20.jpg",
        BASE + "21.jpg",
      ],
    },
    {
      title: "Shophouse 02",
      images: [
        BASE + "6.jpg",
        BASE + "7.jpg",
        BASE + "8.jpg",
        BASE + "9.jpg",
        BASE + "10.jpg",
        BASE + "11.jpg",
      ],
    },
   
    {
      title: "Liền Kề",
      images: [
       
         BASE + "22.jpg",
       
        BASE + "14.jpg",
        BASE + "15.jpg",
        BASE + "16.jpg",
        BASE + "17.jpg",
      ],
    },

    {
      title: "Biệt Thự",
      images: [
           BASE + "12.jpg",
        BASE + "13.jpg",
       
        BASE + "23.jpg",
        BASE + "24.jpg",
      ],
    },
  ];
  let LIBRARY_VIDEOS = [];

  function normalizeAssetPath(src) {
    if (!src) return "";
    var normalized = src;
    if (!/^(https?:)?\/\//.test(src) && src.indexOf("./") !== 0 && src.indexOf("/") !== 0) {
      normalized = "./" + src.replace(/^\/+/, "");
    }
    if (typeof window.bdsVersionedAsset === "function") {
      return window.bdsVersionedAsset(normalized);
    }
    return normalized;
  }

  // === DOM ELEMENTS ===
  const lb = document.getElementById("album-lightbox");
  const lbImg = document.getElementById("alb-lb-img");
  const lbTitle = document.getElementById("alb-lb-title");
  const lbCounter = document.getElementById("alb-lb-counter");
  const lbPrev = document.getElementById("alb-lb-prev");
  const lbNext = document.getElementById("alb-lb-next");
  const lbClose = document.getElementById("alb-lb-close");
  const lbThumbs = document.getElementById("alb-lb-thumbs");

  if (!lb) return;

  function bindAlbumCards() {
    document.querySelectorAll(".hdev-library-grid-item").forEach((item) => {
      item.style.cursor = "pointer";
      item.addEventListener("click", () => {
        const idxStr = item.getAttribute("data-album-index");
        if (idxStr !== null) {
          const idx = parseInt(idxStr, 10);
          show(idx, 0);
        }
      });
    });
  }

  function renderLibraryCards() {
    const grid = document.querySelector(".hdev-library-grid");
    if (!grid) return;
    grid.innerHTML = ALBUMS.map((album, idx) => {
      const cover = normalizeAssetPath(album.cover || (album.images && album.images[0]) || BASE + "8.jpg");
      return (
        '<div class="hdev-library-grid-item' + ([1, 3, 4].includes(idx) ? " wide" : "") + '" data-album-index="' + idx + '">' +
        '<div class="hdev-library-grid-image">' +
        '<img src="' + cover + '" alt="' + (album.title || "Album") + '" />' +
        '<div class="hdev-library-grid-overlay"></div>' +
        '<div class="hdev-library-grid-title">' + (album.title || "Album") + '</div>' +
        '</div></div>'
      );
    }).join("");
    bindAlbumCards();
  }

  function renderVideoCards() {
    const grid = document.querySelector(".vid-grid");
    if (!grid) return;
    if (!LIBRARY_VIDEOS.length) {
    grid.innerHTML = '<div class="vid-empty">Chưa có video. Thêm video trong Admin / JSON Editor.</div>';
      return;
    }
    grid.innerHTML = LIBRARY_VIDEOS.map((video) => {
      const thumb = normalizeAssetPath(video.thumb || video.cover || "./frames/galley/PCTT 04_DAY.jpg");
      const src = normalizeAssetPath(video.src || "");
      return (
        '<div class="vid-card" data-video="' + src + '">' +
        '<div class="vid-card-thumb">' +
        '<img src="' + thumb + '" alt="' + (video.title || "Video") + '" />' +
        '<div class="vid-card-overlay"></div>' +
        '<button class="vid-play-btn" aria-label="Phát video"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></button>' +
        '<span class="vid-duration">' + (video.duration || "") + '</span>' +
        '</div><div class="vid-card-info">' +
        '<h4 class="vid-card-title">' + (video.title || "Video") + '</h4>' +
        '<p class="vid-card-desc">' + (video.description || "") + '</p>' +
        '</div></div>'
      );
    }).join("");
  }

  function loadLibraryData() {
    fetch("./api/index.php?resource=library&t=" + Date.now(), {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((r) => {
        if (!r.ok) throw new Error("Không tải được du lieu thu vien");
        return r.json();
      })
      .then((payload) => {
        if (!payload || !payload.ok || !payload.data) {
          throw new Error("Khong doc duoc du lieu thu vien");
        }
        const data = payload.data;
        if (Array.isArray(data.albums)) {
          ALBUMS = data.albums.map((album) => ({
            title: album.title || "Album",
            cover: normalizeAssetPath(album.cover || (album.images && album.images[0])),
            images: (album.images || []).map(normalizeAssetPath),
          }));
        }
        LIBRARY_VIDEOS = Array.isArray(data.videos) ? data.videos : [];
        renderLibraryCards();
        renderVideoCards();
      })
      .catch(() => {
        renderLibraryCards();
        renderVideoCards();
      });
  }

  let currentImages = [];
  let currentIdx = 0;

  function show(albumIndex, imgIndex) {
    const album = ALBUMS[albumIndex];
    if (!album) return;
    currentImages = album.images;
    currentIdx = imgIndex || 0;
    lbTitle.textContent = album.title;

    // Build thumbnails
    lbThumbs.innerHTML = "";
    currentImages.forEach((src, i) => {
      const t = document.createElement("img");
      t.src = src;
      t.style.cssText =
        "width:60px; height:45px; object-fit:cover; border-radius:4px; cursor:pointer; opacity:0.6; transition:all 0.2s; flex-shrink:0;";
      t.addEventListener("click", () => goTo(i));
      lbThumbs.appendChild(t);
    });

    lb.style.display = "flex";
    document.body.style.overflow = "hidden";
    goTo(currentIdx);
  }

  function goTo(idx) {
    currentIdx = (idx + currentImages.length) % currentImages.length;
    lbImg.style.opacity = "0";
    setTimeout(() => {
      lbImg.src = currentImages[currentIdx];
      lbImg.style.opacity = "1";
    }, 150);
    lbCounter.textContent = currentIdx + 1 + " / " + currentImages.length;
    // Update thumbnail highlights
    Array.from(lbThumbs.children).forEach((t, i) => {
      t.style.opacity = i === currentIdx ? "1" : "0.5";
      t.style.outline = i === currentIdx ? "2px solid #3bfcf0" : "none";
      if (i === currentIdx)
        t.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
    });
  }

  function close() {
    lb.style.display = "none";
    document.body.style.overflow = "";
    lbImg.src = "";
  }

  // Image fade transition
  lbImg.style.transition = "opacity 0.15s ease";

  // Navigation
  lbPrev.addEventListener("click", (e) => {
    e.stopPropagation();
    goTo(currentIdx - 1);
  });
  lbNext.addEventListener("click", (e) => {
    e.stopPropagation();
    goTo(currentIdx + 1);
  });
  lbClose.addEventListener("click", close);
  lb.addEventListener("click", (e) => {
    if (e.target === lb) close();
  });

  // Keyboard
  document.addEventListener("keydown", (e) => {
    if (lb.style.display === "none") return;
    if (e.key === "ArrowLeft") goTo(currentIdx - 1);
    if (e.key === "ArrowRight") goTo(currentIdx + 1);
    if (e.key === "Escape") close();
  });

  // === Attach click to gallery grid items ===
  bindAlbumCards();

  // === GALLERY TAB SWITCHING ===
  const galleryTabs = document.querySelectorAll(".hdev-library-tab");
  const galleryContents = document.querySelectorAll(
    ".hdev-library-tab-content",
  );

  galleryTabs.forEach((btn) => {
    btn.addEventListener("click", function () {
      const tabId = this.getAttribute("data-tab");

      // Update active tab button
      galleryTabs.forEach((b) => b.classList.remove("active"));
      this.classList.add("active");

      // Update active tab content
      galleryContents.forEach((ctx) => {
        if (ctx.getAttribute("data-tab-content") === tabId) {
          ctx.classList.add("active");
        } else {
          ctx.classList.remove("active");
        }
      });
    });
  });

  // === INITIALIZE MASTER PLAN IMMEDIATELY ===
  loadLibraryData();
  if (window.initOverviewMasterPlan) window.initOverviewMasterPlan();
})();
// ═══════════════════════════════════════════════════════════
//  LIÊN KẾT VÙNG — Pan + Pinch Zoom + Double Tap
//
//  Thêm vào index.html: <script src="vitri-lkv-zoom.js?v=1"></script>
//
//  Cũng cần sửa HTML của #vt-lkv trong index.html:
//
//  CŨ:
//    <div class="vt-lkv" id="vt-lkv" style="display:none">
//      <img class="vt-lkv-video" src="./frames/galley/anhmau.jpg" alt="Liên kết vùng" />
//    </div>
//
//  MỚI:
//    <div class="vt-lkv" id="vt-lkv" style="display:none">
//      <div class="vt-lkv-img-wrapper" id="vt-lkv-wrapper">
//        <img class="vt-lkv-video" id="vt-lkv-img"
//             src="./frames/galley/anhmau.jpg" alt="Liên kết vùng" />
//      </div>
//      <div class="vt-lkv-hint">Kéo để di chuyển · Chụm để zoom</div>
//    </div>
// ═══════════════════════════════════════════════════════════

(function initLkvZoom() {
  "use strict";

  var panel = document.getElementById("vt-lkv");
  var wrapper = document.getElementById("vt-lkv-wrapper");
  var img = document.getElementById("vt-lkv-img");

  if (!panel || !wrapper || !img) {
    // Auto-build wrapper nếu HTML chưa sửa
    panel = document.getElementById("vt-lkv");
    if (!panel) return;

    img = panel.querySelector(".vt-lkv-image") || panel.querySelector(".vt-lkv-video");
    if (!img) return;

    // Tạo wrapper bọc quanh img
    wrapper = document.createElement("div");
    wrapper.className = "vt-lkv-img-wrapper";
    wrapper.id = "vt-lkv-wrapper";
    img.id = "vt-lkv-img";
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);

    // Thêm hint
    var hint = document.createElement("div");
    hint.className = "vt-lkv-hint";
    hint.textContent = "Kéo để di chuyển · Chụm để zoom";
    panel.appendChild(hint);
  }

  // ── State ──
  var pz = {
    scale: 1,
    tx: 0,
    ty: 0,
    minScale: 1,
    maxScale: 5,
    natW: 1,
    natH: 1,
    fitScale: 1,
  };

  function isVideoMode() {
    return panel && panel.dataset.mode === "video";
  }

  // ── Apply transform ──
  function apply(animate) {
    wrapper.style.transition = animate ? "transform 0.3s ease" : "none";
    if (animate)
      setTimeout(function () {
        wrapper.style.transition = "none";
      }, 320);
    wrapper.style.transform =
      "translate3d(" + pz.tx + "px," + pz.ty + "px,0) scale(" + pz.scale + ")";
  }

  // ── Clamp ──
  function clamp() {
    var vw = panel.clientWidth;
    var vh = panel.clientHeight;
    var sw = pz.natW * pz.scale;
    var sh = pz.natH * pz.scale;
    if (sw <= vw) {
      pz.tx = (vw - sw) / 2;
    } else {
      pz.tx = Math.min(0, Math.max(vw - sw, pz.tx));
    }
    if (sh <= vh) {
      pz.ty = (vh - sh) / 2;
    } else {
      pz.ty = Math.min(0, Math.max(vh - sh, pz.ty));
    }
  }

  // ── Zoom at point ──
  function zoomAt(cx, cy, factor, animate) {
    var ns = Math.max(pz.minScale, Math.min(pz.maxScale, pz.scale * factor));
    var sf = ns / pz.scale;
    pz.tx = cx - sf * (cx - pz.tx);
    pz.ty = cy - sf * (cy - pz.ty);
    pz.scale = ns;
    clamp();
    apply(animate);
  }

  // ── Setup — fit ảnh vừa panel, cho phép zoom ra xem toàn bộ ──
  var _lkvInited = false;
  var _lastPanelW = 0;
  var _lastPanelH = 0;

  function setup(forceReset) {
    if (isVideoMode()) return;
    pz.natW = img.naturalWidth || 1920;
    pz.natH = img.naturalHeight || 1080;

    var vw = panel.clientWidth;
    var vh = panel.clientHeight;
    if (!vw || !vh) return;

    // Nếu đã init và kích thước panel không đổi → không reset
    if (_lkvInited && !forceReset && vw === _lastPanelW && vh === _lastPanelH) return;
    _lastPanelW = vw;
    _lastPanelH = vh;

    // Fit cover: ảnh phủ kín panel
    var fitW = vw / pz.natW;
    var fitH = vh / pz.natH;
    // Dùng contain để thấy toàn bộ ảnh
    pz.fitScale = Math.min(fitW, fitH);
    // Nhưng khởi tạo ở cover để full screen
    var coverScale = Math.max(fitW, fitH);

    pz.scale = coverScale;
    pz.minScale = pz.fitScale * 0.9; // Cho zoom ra thêm chút
    pz.maxScale = coverScale * 4;

    wrapper.style.width = pz.natW + "px";
    wrapper.style.height = pz.natH + "px";

    // Center
    pz.tx = (vw - pz.natW * pz.scale) / 2;
    pz.ty = (vh - pz.natH * pz.scale) / 2;

    clamp();
    apply(false);
    _lkvInited = true;
  }

  // ── Mouse events ──
  var dragging = false,
    msx = 0,
    msy = 0,
    mtx = 0,
    mty = 0;

  panel.addEventListener("mousedown", function (e) {
    if (isVideoMode()) return;
    if (e.button !== 0) return;
    dragging = true;
    msx = e.clientX;
    msy = e.clientY;
    mtx = pz.tx;
    mty = pz.ty;
    panel.style.cursor = "grabbing";
    e.preventDefault();
  });

  window.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    pz.tx = mtx + (e.clientX - msx);
    pz.ty = mty + (e.clientY - msy);
    clamp();
    apply(false);
  });

  window.addEventListener("mouseup", function () {
    if (dragging) {
      dragging = false;
      panel.style.cursor = "grab";
    }
  });

  panel.addEventListener(
    "wheel",
    function (e) {
      if (isVideoMode()) return;
      e.preventDefault();
      var rect = panel.getBoundingClientRect();
      var cx = e.clientX - rect.left;
      var cy = e.clientY - rect.top;
      var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoomAt(cx, cy, factor, false);
    },
    { passive: false },
  );

  panel.addEventListener("dblclick", function (e) {
    if (isVideoMode()) return;
    var rect = panel.getBoundingClientRect();
    var cx = e.clientX - rect.left;
    var cy = e.clientY - rect.top;
    if (pz.scale > pz.fitScale * 1.5) {
      setup(true); // Reset
    } else {
      zoomAt(cx, cy, 2.5, true);
    }
  });

  // ── Touch events ──
  var t = {
    dragging: false,
    pinching: false,
    sx: 0,
    sy: 0,
    stx: 0,
    sty: 0,
    lastDist: 0,
    tapTime: 0,
    velX: 0,
    velY: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    inertiaId: 0,
  };

  function dist2(touches) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function mid2(touches) {
    var r = panel.getBoundingClientRect();
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - r.left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - r.top,
    };
  }
  function stopInertia() {
    if (t.inertiaId) {
      cancelAnimationFrame(t.inertiaId);
      t.inertiaId = 0;
    }
  }
  function startInertia() {
    var decay = 0.92,
      minV = 0.5;
    function step() {
      if (Math.abs(t.velX) < minV && Math.abs(t.velY) < minV) {
        t.inertiaId = 0;
        return;
      }
      pz.tx += t.velX;
      pz.ty += t.velY;
      t.velX *= decay;
      t.velY *= decay;
      clamp();
      apply(false);
      t.inertiaId = requestAnimationFrame(step);
    }
    t.inertiaId = requestAnimationFrame(step);
  }

  panel.addEventListener(
    "touchstart",
    function (e) {
      if (isVideoMode()) return;
      stopInertia();
      if (e.touches.length === 1) {
        var now = Date.now();
        if (now - t.tapTime < 280) {
          var r = panel.getBoundingClientRect();
          var cx = e.touches[0].clientX - r.left;
          var cy = e.touches[0].clientY - r.top;
          if (pz.scale > pz.fitScale * 1.5) setup(true);
          else zoomAt(cx, cy, 2.5, true);
          t.tapTime = 0;
          return;
        }
        t.tapTime = now;
        t.dragging = true;
        t.pinching = false;
        t.sx = e.touches[0].clientX;
        t.sy = e.touches[0].clientY;
        t.stx = pz.tx;
        t.sty = pz.ty;
        t.lastX = t.sx;
        t.lastY = t.sy;
        t.lastT = now;
        t.velX = 0;
        t.velY = 0;
      } else if (e.touches.length === 2) {
        e.preventDefault();
        t.pinching = true;
        t.dragging = false;
        t.lastDist = dist2(e.touches);
      }
    },
    { passive: false },
  );

  panel.addEventListener(
    "touchmove",
    function (e) {
      if (isVideoMode()) return;
      e.preventDefault();
      if (t.pinching && e.touches.length === 2) {
        var nd = dist2(e.touches);
        var m = mid2(e.touches);
        var factor = nd / t.lastDist;
        var ns = Math.max(
          pz.minScale,
          Math.min(pz.maxScale, pz.scale * factor),
        );
        var sf = ns / pz.scale;
        pz.tx = m.x - sf * (m.x - pz.tx);
        pz.ty = m.y - sf * (m.y - pz.ty);
        pz.scale = ns;
        t.lastDist = nd;
        clamp();
        apply(false);
      } else if (t.dragging && !t.pinching && e.touches.length === 1) {
        var cx = e.touches[0].clientX,
          cy = e.touches[0].clientY;
        pz.tx = t.stx + (cx - t.sx);
        pz.ty = t.sty + (cy - t.sy);
        clamp();
        apply(false);
        var now = Date.now();
        var dt = now - t.lastT;
        if (dt > 0) {
          t.velX = ((cx - t.lastX) / dt) * 16;
          t.velY = ((cy - t.lastY) / dt) * 16;
        }
        t.lastX = cx;
        t.lastY = cy;
        t.lastT = now;
      }
    },
    { passive: false },
  );

  panel.addEventListener(
    "touchend",
    function (e) {
      if (e.touches.length < 2) t.pinching = false;
      if (e.touches.length === 0) {
        t.dragging = false;
        if (Math.abs(t.velX) > 1 || Math.abs(t.velY) > 1) startInertia();
      }
    },
    { passive: true },
  );

  // ── Init khi ảnh load xong ──
  function trySetup() {
    if (isVideoMode()) return;
    if (img.complete && img.naturalWidth > 0) {
      setup(false);
    } else {
      img.onload = function () { setup(false); };
    }
  }
  window._setupLkvImage = setup;

  // ── Gọi setup khi tab Liên Kết Vùng được hiện ──
  var _wasHidden = true;
  var observer = new MutationObserver(function () {
    var isVisible = panel.style.display !== "none" && panel.offsetHeight > 0;
    if (isVisible && _wasHidden) {
      _wasHidden = false;
      setTimeout(trySetup, 100);
    } else if (!isVisible) {
      _wasHidden = true;
    }
  });
  observer.observe(panel, { attributes: true, attributeFilter: ["style"] });

  // Cũng listen pill button click
  document.querySelectorAll(".vt-pill").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (this.dataset.view === "lkv") {
        setTimeout(trySetup, 200);
      }
    });
  });

  // ── Resize — chỉ reset khi kích thước panel thực sự thay đổi ──
  window.addEventListener("resize", function () {
    if (panel.style.display !== "none" && panel.offsetHeight > 0) {
      setup(false);
    }
  });

  panel.style.cursor = "grab";
})();

