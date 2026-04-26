// ═══════════════════════════════════════════════════════════
//  VỊ TRÍ — Flat Satellite Map + Image Overlay
//  Mapbox phẳng, tiếng Việt, không 3D, không iframe
// ═══════════════════════════════════════════════════════════

(function initVitri() {
  "use strict";

  function versionedAsset(url) {
    if (typeof window.bdsVersionedAsset === "function") {
      return window.bdsVersionedAsset(url);
    }
    return url;
  }

  var PROJECT_CENTER = [106.1105, 21.2675];
  var PROJECT_NAME = "BÍCH ĐỘNG LAKESIDE";
  var MAPBOX_TOKEN =
    "pk.eyJ1IjoidGhhaWJhbzEyMyIsImEiOiJjbWlkbHE1Y2gwN2huMmpxdmdhaHYwY3drIn0.Y2-uOBp5tyPmGW7KSCsn2A";

  // ── Ranh giới polygon dự án ──

  // ── Ảnh masterplan overlay — 4 góc tọa độ ──
  var MASTERPLAN_IMAGE = versionedAsset("./frames/masterplan.png");
  var MASTERPLAN_COORDS = [
   [106.107924, 21.267104],  // Trên-Trái
      [106.111660, 21.271522],  // Trên-Phải
      [106.114737, 21.268732],  // Dưới-Phải
      [106.111160, 21.264700],  // Dưới-Trái
  ];
    
    
// === Mapbox Image Overlay — Bích Động Lakeside ===

  // ── DOM refs ──
  var overlay = document.getElementById("vitri-overlay");
  var navBtn = document.getElementById("nav-360");
  var subBtns = document.querySelectorAll(".vt-pill");
  var mapWrap = document.getElementById("vt-map-wrap");
  var mapDiv = document.getElementById("vt-map");
  var infoCard = document.getElementById("vt-info-card");
  var lkvPanel = document.getElementById("vt-lkv");
  var stageEl = document.getElementById("stage");
  var vignEl = document.querySelector(".vign");
  var dnEl = document.getElementById("dn");
  var hintEl = document.getElementById("hint");

  if (!overlay || !navBtn || !mapDiv) return;

  var map = null;
  var vitriConfigLoaded = false;
  var IS_MOBILE_VT =
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    window.innerWidth <= 768;

  function applyVitriConfig(data) {
    if (!data || typeof data !== "object") return;
    if (Array.isArray(data.projectCenter) && data.projectCenter.length === 2) {
      PROJECT_CENTER = data.projectCenter;
    }
    if (data.projectName) PROJECT_NAME = data.projectName;
    if (data.masterplanImage) MASTERPLAN_IMAGE = versionedAsset(data.masterplanImage);
    if (Array.isArray(data.masterplanCoords) && data.masterplanCoords.length === 4) {
      MASTERPLAN_COORDS = data.masterplanCoords;
    }
    var lkvImg = document.getElementById("vt-lkv-img");
    if (lkvImg && data.lkvImage) lkvImg.src = versionedAsset(data.lkvImage);
    var lkvVideo = document.getElementById("vt-lkv-video");
    if (lkvVideo && data.lkvVideo) lkvVideo.src = versionedAsset(data.lkvVideo);
    if (map) {
      map.setCenter(PROJECT_CENTER);
      addMasterplanOverlay();
    }
  }

  function loadVitriConfig(cb) {
    if (vitriConfigLoaded) {
      cb && cb();
      return;
    }
    fetch("./api/index.php?resource=vitri-config&t=" + Date.now(), {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(function (r) {
        if (!r.ok) throw new Error("No vitri config");
        return r.json();
      })
      .then(function (payload) {
        if (!payload || !payload.ok || !payload.data) {
          throw new Error("No vitri config");
        }
        var data = payload.data;
        applyVitriConfig(data);
        vitriConfigLoaded = true;
        cb && cb();
      })
      .catch(function () {
        vitriConfigLoaded = true;
        cb && cb();
      });
  }

  // ── Khởi tạo Mapbox ──
  function initMap() {
    if (map) return;
    if (typeof mapboxgl === "undefined") return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    map = new mapboxgl.Map({
      container: "vt-map",
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: PROJECT_CENTER,
      zoom: IS_MOBILE_VT ? 15 : 16,

      // ★ PHẲNG HOÀN TOÀN — không nghiêng, xoay cho ảnh vệ tinh thẳng đứng
      pitch: 0,
      bearing: 37,
      maxPitch: 0,
      minPitch: 0,
      dragRotate: false,
      touchPitch: false,

      // Giới hạn zoom
      minZoom: 13,
      maxZoom: 19,
      antialias: !IS_MOBILE_VT,
      maxTileCacheSize: IS_MOBILE_VT ? 20 : 100,
    });

    // Tắt xoay bằng keyboard + touch
    map.keyboard.disableRotation();
    map.touchZoomRotate.disableRotation();

    // ★ Khóa bearing cố định — nếu bearing bị thay đổi thì reset lại
    map.on("rotate", function () {
      if (map.getBearing() !== 37) {
        map.setBearing(37);
      }
    });

    // Nút zoom (ẩn compass vì không cho xoay)
    map.addControl(
      new mapboxgl.NavigationControl({
        showCompass: false,
        visualizePitch: false,
      }),
      "bottom-right",
    );

    map.on("load", function () {
      // ★ Force bearing thẳng đứng
      map.setBearing(-37);

      // ★ Đổi nhãn bản đồ sang tiếng Việt
      setMapLanguageVi();

      // ★ IMAGE OVERLAY — ảnh masterplan phủ lên bản đồ (thêm trước polygon)
      addMasterplanOverlay();

      // ★ Marker dự án
      var el = document.createElement("div");
      el.className = "vt-marker-container";
      var icon = document.createElement("div");
      icon.className = "vt-marker-icon";
      el.appendChild(icon);
      new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(PROJECT_CENTER)
        .addTo(map);

      // ★ Polygon ranh giới dự án
      map.addSource("project-boundary", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [PROJECT_BOUNDARY] },
        },
      });

      map.addLayer({
        id: "boundary-fill",
        type: "fill",
        source: "project-boundary",
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": 0.15,
        },
      });

      map.addLayer({
        id: "boundary-line",
        type: "line",
        source: "project-boundary",
        paint: {
          "line-color": "#3b82f6",
          "line-width": IS_MOBILE_VT ? 2 : 3,
          "line-opacity": 0.9,
        },
      });

      if (!IS_MOBILE_VT) {
        map.addLayer(
          {
            id: "boundary-glow",
            type: "line",
            source: "project-boundary",
            paint: {
              "line-color": "#60a5fa",
              "line-width": 10,
              "line-opacity": 0.15,
              "line-blur": 6,
            },
          },
          "boundary-line",
        );
      }
    });
  }

  // ── Đổi nhãn bản đồ sang tiếng Việt ──
  function setMapLanguageVi() {
    var style = map.getStyle();
    if (!style || !style.layers) return;
    style.layers.forEach(function (layer) {
      if (
        layer.layout &&
        layer.layout["text-field"] &&
        layer.type === "symbol"
      ) {
        try {
          map.setLayoutProperty(layer.id, "text-field", [
            "coalesce",
            ["get", "name_vi"],
            ["get", "name"],
          ]);
        } catch (e) {
          // Một số layer không hỗ trợ expression, bỏ qua
        }
      }
    });
  }

  // ── Image Overlay — ảnh masterplan ──
  function addMasterplanOverlay() {
    if (map.getLayer("masterplan-layer")) map.removeLayer("masterplan-layer");
    if (map.getSource("masterplan-source"))
      map.removeSource("masterplan-source");

    map.addSource("masterplan-source", {
      type: "image",
      url: MASTERPLAN_IMAGE,
      coordinates: MASTERPLAN_COORDS,
    });

    map.addLayer({
      id: "masterplan-layer",
      type: "raster",
      source: "masterplan-source",
      paint: {
        "raster-opacity": 1.0,
        "raster-fade-duration": 300,
      },
    });
  }

  // ── Show / Hide ─────────────────────────────────────────
  function safePause(el) {
    if (el && typeof el.pause === "function") el.pause();
  }
  function safePlay(el) {
    if (el && typeof el.play === "function") {
      el.currentTime = 0;
      el.play().catch(function () {});
    }
  }

  function showVitri() {
    if (window._hideEbrochure) window._hideEbrochure();
    if (window._hidePhanKhu) window._hidePhanKhu();
    if (window._hideThamQuan) window._hideThamQuan();
    if (window._hideMatBang) window._hideMatBang();
    var tiOv = document.getElementById("tienich-overlay");
    if (tiOv) {
      tiOv.classList.remove("visible");
      setTimeout(function () {
        tiOv.style.display = "none";
      }, 400);
    }
    var tiPanel = document.getElementById("ti-panel");
    if (tiPanel) tiPanel.style.display = "none";
    if (stageEl) stageEl.style.opacity = "0";
    if (vignEl) vignEl.style.opacity = "0";
    if (dnEl) dnEl.style.display = "none";
    if (hintEl) hintEl.style.display = "none";
    overlay.style.display = "flex";
    var pillBar = document.querySelector(".vt-pill-bar");
    if (pillBar) pillBar.style.display = "flex";
    requestAnimationFrame(function () {
      overlay.classList.add("visible");
    });
    loadVitriConfig(function () {
      initMap();
      setTimeout(function () {
        if (map) map.resize();
      }, 400);
      showSubView("vitri");
    });
  }

  function hideVitri() {
    overlay.classList.remove("visible");
    var pillBar = document.querySelector(".vt-pill-bar");
    if (pillBar) pillBar.style.display = "none";
    var media = document.getElementById("vt-lkv-video");
    safePause(media);
    setTimeout(function () {
      overlay.style.display = "none";
    }, 400);
    if (stageEl) stageEl.style.opacity = "1";
    if (vignEl) vignEl.style.opacity = "1";
    if (dnEl) dnEl.style.display = "";
    if (hintEl) hintEl.style.display = "";
  }

  window._hideVitri = hideVitri;

  function showSubView(view) {
    var media = document.getElementById("vt-lkv-video");
    if (view === "vitri") {
      if (mapWrap) mapWrap.style.display = "block";
      if (lkvPanel) lkvPanel.style.display = "none";
      if (infoCard) infoCard.style.display = "block";
      safePause(media);
      if (map) {
        map.resize();
        map.flyTo({
          center: PROJECT_CENTER,
          zoom: IS_MOBILE_VT ? 15 : 16,
          pitch: 0,
          bearing: -37,
          duration: 1500,
          essential: true,
        });
      }
    } else {
      if (mapWrap) mapWrap.style.display = "none";
      if (lkvPanel) lkvPanel.style.display = "block";
      if (lkvPanel && lkvPanel.dataset.mode === "video") safePlay(media);
    }
  }

  function setLkvMode(mode) {
    var imageWrap = document.getElementById("vt-lkv-wrapper");
    var video = document.getElementById("vt-lkv-video");
    var hint = document.querySelector(".vt-lkv-hint");
    if (!lkvPanel || !imageWrap || !video) return;
    lkvPanel.dataset.mode = mode;
    document.querySelectorAll(".vt-lkv-mode-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.lkvMode === mode);
    });
    if (mode === "video") {
      imageWrap.style.display = "none";
      video.style.display = "block";
      if (hint) hint.textContent = "Video full view · Không kéo thả";
      safePlay(video);
    } else {
      safePause(video);
      video.style.display = "none";
      imageWrap.style.display = "block";
      if (hint) hint.textContent = "Kéo để di chuyển · Chụm để zoom";
      if (typeof window._setupLkvImage === "function") {
        setTimeout(function () { window._setupLkvImage(true); }, 50);
      }
    }
  }

  document.querySelectorAll(".vt-lkv-mode-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      setLkvMode(this.dataset.lkvMode || "image");
    });
  });
  if (lkvPanel && !lkvPanel.dataset.mode) setLkvMode("image");

  subBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      subBtns.forEach(function (b) {
        b.classList.remove("active");
      });
      this.classList.add("active");
      showSubView(this.dataset.view);
    });
  });

  navBtn.addEventListener("click", function (e) {
    e.preventDefault();
    document.querySelectorAll(".menu-item").forEach(function (i) {
      i.classList.remove("active");
    });
    this.classList.add("active");
    showVitri();
  });

  document
    .querySelectorAll(".menu-item:not(#nav-360)")
    .forEach(function (item) {
      item.addEventListener("click", function () {
        hideVitri();
      });
    });

  window.addEventListener("resize", function () {
    if (overlay.style.display !== "none" && map) map.resize();
  });
})();
