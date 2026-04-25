// ═══════════════════════════════════════════════════════════
//  MẶT BẰNG — v2
//  Desktop + Mobile: ảnh gốc full res, pan + zoom + SVG đồng bộ
//  Desktop: mouse drag + scroll zoom
//  Mobile: touch drag + pinch zoom + double tap
// ═══════════════════════════════════════════════════════════

(function initMatBang() {
  "use strict";

  function versionedAsset(url) {
    if (typeof window.bdsVersionedAsset === "function") {
      return window.bdsVersionedAsset(url);
    }
    return url;
  }

  var overlay = document.getElementById("matbang-overlay");
  var navMatBang = document.getElementById("nav-gallery");
  var stageEl = document.getElementById("stage");
  var vignEl = document.querySelector(".vign");
  var dnEl = document.getElementById("dn");
  var hintEl = document.getElementById("hint");

  if (!overlay || !navMatBang) return;

  var viewport = document.getElementById("mb-viewport");
  var svgLayer = document.getElementById("mb-svg-layer");
  var imgBg = viewport ? viewport.querySelector(".mb-img-bg") : null;

  var wrapper = null;

  // pan/zoom state
  var pz = {
    scale: 1,
    tx: 0,
    ty: 0,
    natW: 1920,
    natH: 1080,
    minScale: 0.5,
    maxScale: 8,
    fitScale: 1,
  };

  function isMobileEnv() {
    var isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    var screenSmall = Math.min(window.innerWidth, window.innerHeight) <= 1024;
    return isTouch && screenSmall;
  }

  // ── Build wrapper ─────────────────────────────────────────
  function buildWrapper() {
    if (!viewport || !imgBg || !svgLayer) return;
    wrapper = viewport.querySelector(".mb-content-wrapper");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "mb-content-wrapper";
      if (imgBg.parentNode === viewport) viewport.removeChild(imgBg);
      if (svgLayer.parentNode === viewport) viewport.removeChild(svgLayer);
      wrapper.appendChild(imgBg);
      wrapper.appendChild(svgLayer);
      viewport.appendChild(wrapper);
    }
    wrapper.style.cssText =
      "position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;";

    imgBg.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;" +
      "display:block;pointer-events:none;user-select:none;object-fit:fill;";

    svgLayer.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;";

    var svgEl = svgLayer.querySelector("svg");
    if (svgEl) {
      svgEl.setAttribute("width", "100%");
      svgEl.setAttribute("height", "100%");
      svgEl.setAttribute("preserveAspectRatio", "none");
      svgEl.style.cssText = "display:block;width:100%;height:100%;";
    }
  }

  // ── Apply transform ───────────────────────────────────────
  function applyTransform(animate) {
    if (!wrapper) return;
    wrapper.style.transition = animate ? "transform 0.3s ease" : "none";
    if (animate)
      setTimeout(function () {
        wrapper.style.transition = "none";
      }, 320);
    wrapper.style.transform =
      "translate3d(" + pz.tx + "px," + pz.ty + "px,0) scale(" + pz.scale + ")";
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

  // ══════════════════════════════════════════════════════════
  //  SETUP — Tính scale ban đầu cho cả desktop lẫn mobile
  // ══════════════════════════════════════════════════════════
  function setupPanZoom() {
    if (!wrapper) return;

    pz.natW = imgBg.naturalWidth || 1920;
    pz.natH = imgBg.naturalHeight || 1080;

    var vw = viewport.clientWidth;
    var vh = viewport.clientHeight;

    var imgAspect = pz.natW / pz.natH;
    var vpAspect = vw / vh;
    var fitScale;

    if (imgAspect > vpAspect) {
      fitScale = vh / pz.natH;
    } else {
      fitScale = vw / pz.natW;
    }

    pz.fitScale = fitScale;
    pz.scale = fitScale;
    pz.minScale = fitScale * 0.8;
    pz.maxScale = fitScale * 6;

    wrapper.style.width = pz.natW + "px";
    wrapper.style.height = pz.natH + "px";
    wrapper.style.position = "absolute";
    wrapper.style.left = "0";
    wrapper.style.top = "0";

    var scaledW = pz.natW * pz.scale;
    var scaledH = pz.natH * pz.scale;

    if (imgAspect > vpAspect) {
      pz.tx = 0;
      pz.ty = (vh - scaledH) / 2;
    } else {
      pz.tx = (vw - scaledW) / 2;
      pz.ty = 0;
    }

    viewport.style.overflow = "hidden";
    viewport.style.cursor = "grab";
    viewport.style.touchAction = "none";

    clamp();
    applyTransform(false);
  }

  // ══════════════════════════════════════════════════════════
  //  MOUSE EVENTS — Desktop drag + scroll zoom
  // ══════════════════════════════════════════════════════════
  var mouseBound = false;

  function bindMouseEvents() {
    if (mouseBound || !viewport) return;
    mouseBound = true;

    var dragging = false;
    var startX = 0,
      startY = 0,
      startTx = 0,
      startTy = 0;
    var _mouseMoved = false;

    viewport.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return; // chỉ chuột trái
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

    // Scroll zoom
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

    // Double click zoom
    viewport.addEventListener("dblclick", function (e) {
      var rect = viewport.getBoundingClientRect();
      var cx = e.clientX - rect.left;
      var cy = e.clientY - rect.top;
      if (pz.scale > pz.fitScale * 1.5) {
        setupPanZoom(); // Reset
      } else {
        zoomAt(cx, cy, 2.5, true);
      }
    });

    // Expose _mouseMoved cho SVG click handler
    window._mbMouseMoved = function () {
      return _mouseMoved;
    };
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
      startX: 0,
      startY: 0,
      startTx: 0,
      startTy: 0,
      lastDist: 0,
      lastMidX: 0,
      lastMidY: 0,
      tapTime: 0,
      velX: 0,
      velY: 0,
      lastMoveX: 0,
      lastMoveY: 0,
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
      var decay = 0.92,
        minVel = 0.5;
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
          var cx = e.touches[0].clientX,
            cy = e.touches[0].clientY;
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
  //  SVG
  // ══════════════════════════════════════════════════════════
  var svgLoaded = false;

  function loadSVG() {
    if (svgLoaded || !svgLayer) return;
    svgLoaded = true;
    fetch("./frames/matbang/matbang.svg")
      .then(function (r) {
        return r.text();
      })
      .then(function (svgText) {
        svgLayer.innerHTML = svgText;
        var svgEl = svgLayer.querySelector("svg");
        if (svgEl) {
          svgEl.setAttribute("width", "100%");
          svgEl.setAttribute("height", "100%");
          svgEl.setAttribute("preserveAspectRatio", "none");
          svgEl.style.cssText = "display:block;width:100%;height:100%;";
        }
        requestAnimationFrame(function () {
          requestAnimationFrame(bindLotEffects);
        });
      })
      .catch(function () {
        svgLoaded = false;
      });
  }

  // ══════════════════════════════════════════════════════════
  //  LOT DATA + EFFECTS (giữ nguyên logic gốc)
  // ══════════════════════════════════════════════════════════
  var lotData = null,
    lotDataLoading = false;

  function loadLotData(cb) {
    if (lotData) {
      cb && cb(lotData);
      return;
    }
    if (lotDataLoading) return;
    lotDataLoading = true;
    fetch("./frames/matbang/lot-data.json")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        lotData = data;
        lotDataLoading = false;
        cb && cb(data);
      })
      .catch(function () {
        lotDataLoading = false;
      });
  }

  var lotLabelCache = null;

  function buildLotLabelCache(svgEl) {
    lotLabelCache = [];
    var texts = svgEl.querySelectorAll("text");
    for (var i = 0; i < texts.length; i++) {
      var tt = texts[i];
      var content = tt.textContent.trim();
      if (!/^(LK|SH|BT)\d+-\d+$/i.test(content)) continue;
      tt.style.pointerEvents = "none";
      if (tt.parentNode && tt.parentNode.tagName === "g")
        tt.parentNode.style.pointerEvents = "none";
      var x = 0,
        y = 0;
      var transform = tt.getAttribute("transform") || "";
      var m = transform.match(
        /(?:translate|matrix)\(\s*([0-9.-]+)\s+([0-9.-]+)(?:\s+[0-9.-]+\s+[0-9.-]+\s+([0-9.-]+)\s+([0-9.-]+))?/,
      );
      if (m) {
        if (m[3] !== undefined) {
          x = parseFloat(m[3]);
          y = parseFloat(m[4]);
        } else {
          x = parseFloat(m[1]);
          y = parseFloat(m[2]);
        }
      } else {
        x = parseFloat(tt.getAttribute("x") || 0);
        y = parseFloat(tt.getAttribute("y") || 0);
      }
      lotLabelCache.push({ key: content.toUpperCase(), x: x, y: y });
    }
  }

  function findNearestLotKey(cx, cy) {
    if (!lotLabelCache) return null;
    var best = null,
      bestDist = 80;
    for (var i = 0; i < lotLabelCache.length; i++) {
      var l = lotLabelCache[i];
      var d = Math.sqrt((l.x - cx) * (l.x - cx) + (l.y - cy) * (l.y - cy));
      if (d < bestDist) {
        bestDist = d;
        best = l.key;
      }
    }
    return best;
  }

  var infoPanel = null;

  function ensureInfoPanel() {
    if (infoPanel) return;
    infoPanel = document.createElement("div");
    infoPanel.className = "mb-info";
    infoPanel.innerHTML =
      '<div class="mb-info-head">' +
      '<h3 class="mb-info-title" id="mb-info-title"></h3>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<span class="mb-info-tag" id="mb-info-tag"></span>' +
      '<button class="mb-info-close" id="mb-info-close">✕</button>' +
      "</div>" +
      "</div>" +
      '<div class="mb-info-grid" id="mb-info-grid"></div>' +
      '<div class="mb-info-foot" id="mb-info-foot"></div>';
    if (viewport) viewport.appendChild(infoPanel);

    var closeBtn = infoPanel.querySelector("#mb-info-close");
    if (closeBtn) {
      var doClose = function (e) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        hideLotInfo();
        var svgEl = svgLayer ? svgLayer.querySelector("svg") : null;
        if (svgEl)
          svgEl.querySelectorAll(".mb-active").forEach(function (a) {
            a.classList.remove("mb-active");
          });
      };
      closeBtn.addEventListener("click", doClose);
      closeBtn.addEventListener("touchend", doClose, { passive: false });
    }
  }

  function showLotInfo(lotKey, lot, clickX, clickY) {
    ensureInfoPanel();
    var titleEl = document.getElementById("mb-info-title");
    var tagEl = document.getElementById("mb-info-tag");
    var gridEl = document.getElementById("mb-info-grid");
    var footEl = document.getElementById("mb-info-foot");
    if (!titleEl || !gridEl) return;

    var blockInfo = lotData && lotData.blocks ? lotData.blocks[lot.b] : null;
    var typeName = blockInfo ? blockInfo.type : "";
    var typeClass = lot.b.startsWith("BT")
      ? "bt"
      : lot.b.startsWith("SH")
        ? "sh"
        : "lk";

    titleEl.textContent = lotKey;
    tagEl.textContent = typeName;
    tagEl.className = "mb-info-tag mb-tag-" + typeClass;

    var rows = [
      ["Diện tích", lot.dt + " m²"],
      ["Mặt tiền", lot.mt],
      ["Đường trước mặt", lot.dm],
      ["Mật độ XD", Math.round(lot.md * 100) + "%"],
      ["Tầng cao", lot.tc + " tầng"],
      ["Hướng", formatHuong(lot.h)],
    ];
    if (lot.vt) rows.push(["Vị trí", lot.vt]);

    gridEl.innerHTML = rows
      .map(function (r) {
        return (
          '<div class="mb-info-row"><span class="mb-info-label">' +
          r[0] +
          '</span><span class="mb-info-value">' +
          r[1] +
          "</span></div>"
        );
      })
      .join("");

    footEl.innerHTML = blockInfo
      ? '<span class="mb-info-block-name">' +
        lot.b +
        "</span> · " +
        blockInfo.count +
        " lô · " +
        blockInfo.dt_min +
        "–" +
        blockInfo.dt_max +
        " m²"
      : "";

    requestAnimationFrame(function () {
      // Desktop: hiện panel ở vị trí click (nếu không phải mobile)
      if (!isMobileEnv() && clickX != null) {
        infoPanel.style.left = clickX + "px";
        infoPanel.style.top = clickY + "px";

        // Ước lượng chiều cao panel (~280px) để tính trước
        // thay vì đo sau khi hiện (tránh flip-flop)
        var PANEL_HEIGHT_ESTIMATE = 280;
        var vpRect = viewport.getBoundingClientRect();
        // clickY là tọa độ relative so với viewport
        // Panel mặc định hiện phía trên: top = clickY - PANEL_HEIGHT
        var panelTopEdge = clickY - PANEL_HEIGHT_ESTIMATE;

        if (panelTopEdge < 0) {
          // Không đủ chỗ phía trên → hiện phía dưới
          infoPanel.classList.add("mb-info-below");
        } else {
          infoPanel.classList.remove("mb-info-below");
        }
      } else {
        infoPanel.classList.remove("mb-info-below");
      }
      infoPanel.classList.add("visible");
    });
  }

  function hideLotInfo() {
    if (infoPanel) infoPanel.classList.remove("visible");
  }

  function formatHuong(code) {
    var map = {
      ĐB: "Đông Bắc",
      TB: "Tây Bắc",
      ĐN: "Đông Nam",
      TN: "Tây Nam",
      "ĐB-TB": "ĐB – TB",
      "TB-ĐB": "TB – ĐB",
      "ĐN-TN": "ĐN – TN",
      "TN-ĐN": "TN – ĐN",
      "TB-TN": "TB – TN",
      "TN-TB": "TN – TB",
      "ĐB-TN": "ĐB – TN",
      "TN-ĐB": "TN – ĐB",
      "ĐN-TB": "ĐN – TB",
      "TB-ĐN": "TB – ĐN",
      "ĐN-ĐB": "ĐN – ĐB",
      "ĐB-ĐN": "ĐB – ĐN",
    };
    return map[code] || code;
  }

  function bindLotEffects() {
    var svgEl = svgLayer.querySelector("svg");
    if (!svgEl) return;

    var styleEl = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "style",
    );
    styleEl.textContent =
      "svg{user-select:none;-webkit-user-select:none;shape-rendering:geometricPrecision;}" +
      ".mb-lot{stroke:#1a1a1a;stroke-width:0.35;stroke-opacity:0.3;cursor:pointer;transition:all 0.25s ease;fill-opacity:1;}" +
      ".mb-lot:hover{stroke:#f6e493;stroke-width:1;stroke-opacity:1;fill:rgba(246,228,147,0.18);filter:drop-shadow(0 0 4px rgba(246,228,147,0.4));}" +
      ".mb-lot.mb-active{stroke:#ffd54f;stroke-width:1.5;stroke-opacity:1;fill:rgba(255,213,79,0.30) !important;filter:drop-shadow(0 0 8px rgba(255,213,79,0.6)) drop-shadow(0 0 16px rgba(255,213,79,0.25));}";
    svgEl.insertBefore(styleEl, svgEl.firstChild);

    buildLotLabelCache(svgEl);

    svgEl.querySelectorAll("rect, polygon, path").forEach(function (el) {
      if (el.classList.contains("mb-lot")) return;
      var bbox;
      try {
        bbox = el.getBBox();
      } catch (e) {
        return;
      }
      if (bbox.width < 5 || bbox.height < 5) return;
      if (bbox.width > 200 || bbox.height > 200) return;
      el.classList.add("mb-lot");
    });

    // ── Desktop: hover để hiện popup ──
    if (!isMobileEnv()) {
      var hoverTimeout = null;
      var currentHoverLot = null;

      svgEl.addEventListener("mouseover", function (e) {
        var lot = e.target.closest(".mb-lot");
        if (!lot || lot === currentHoverLot) return;

        // Clear pending timeout
        if (hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout = null; }

        // Remove active cũ
        svgEl.querySelectorAll(".mb-active").forEach(function (a) {
          a.classList.remove("mb-active");
        });

        currentHoverLot = lot;
        lot.classList.add("mb-active");

        var bbox;
        try { bbox = lot.getBBox(); } catch (ex) { return; }

        var lotKey = findNearestLotKey(
          bbox.x + bbox.width / 2,
          bbox.y + bbox.height / 2,
        );
        if (!lotKey) { hideLotInfo(); return; }

        // Lấy vị trí chính xác của lot trên màn hình
        var lotRect = lot.getBoundingClientRect();
        var vpRect = viewport.getBoundingClientRect();
        var relX = (lotRect.left + lotRect.right) / 2 - vpRect.left;
        var relY = lotRect.top - vpRect.top;

        if (!lotData) {
          loadLotData(function (data) {
            if (data && data.lots && data.lots[lotKey] && currentHoverLot === lot)
              showLotInfo(lotKey, data.lots[lotKey], relX, relY);
          });
        } else if (lotData.lots && lotData.lots[lotKey]) {
          showLotInfo(lotKey, lotData.lots[lotKey], relX, relY);
        }
      });

      svgEl.addEventListener("mouseout", function (e) {
        var lot = e.target.closest(".mb-lot");
        if (!lot) return;

        // Delay nhỏ để tránh nhấp nháy khi di chuột qua viền
        hoverTimeout = setTimeout(function () {
          if (currentHoverLot === lot) {
            lot.classList.remove("mb-active");
            currentHoverLot = null;
            hideLotInfo();
          }
        }, 80);
      });

      // Click vào chỗ trống → ẩn panel (nếu đang hiện)
      svgEl.addEventListener("click", function (e) {
        if (window._mbMouseMoved && window._mbMouseMoved()) return;
        var lot = e.target.closest(".mb-lot");
        if (!lot) {
          hideLotInfo();
          svgEl.querySelectorAll(".mb-active").forEach(function (a) {
            a.classList.remove("mb-active");
          });
          currentHoverLot = null;
        }
      });

    } else {
      // ── Mobile: giữ nguyên click ──
      svgEl.addEventListener("click", function (e) {
        if (_touchMoved) return;
        if (window._mbMouseMoved && window._mbMouseMoved()) return;

        var lot = e.target.closest(".mb-lot");
        svgEl.querySelectorAll(".mb-active").forEach(function (a) {
          a.classList.remove("mb-active");
        });
        if (!lot) {
          hideLotInfo();
          return;
        }
        lot.classList.add("mb-active");
        var bbox;
        try {
          bbox = lot.getBBox();
        } catch (ex) {
          return;
        }
        var lotKey = findNearestLotKey(
          bbox.x + bbox.width / 2,
          bbox.y + bbox.height / 2,
        );
        if (!lotKey) {
          hideLotInfo();
          return;
        }
        var clickX = e.pageX,
          clickY = e.pageY;
        if (!lotData) {
          loadLotData(function (data) {
            if (data && data.lots && data.lots[lotKey])
              showLotInfo(lotKey, data.lots[lotKey], clickX, clickY);
          });
        } else if (lotData.lots && lotData.lots[lotKey]) {
          showLotInfo(lotKey, lotData.lots[lotKey], clickX, clickY);
        } else {
          hideLotInfo();
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  SHOW / HIDE
  // ══════════════════════════════════════════════════════════
  function hideOtherOverlays() {
    if (window._hideEbrochure) window._hideEbrochure();
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
  }

  function onImageReady() {
    pz.natW = imgBg.naturalWidth || 1920;
    pz.natH = imgBg.naturalHeight || 1080;
    buildWrapper();
    setupPanZoom();
    // Bind cả 2 loại input
    bindMouseEvents();
    bindTouchEvents();
  }

  function showMatBang() {
    hideOtherOverlays();
    if (stageEl) stageEl.style.opacity = "0";
    if (vignEl) vignEl.style.opacity = "0";
    if (dnEl) dnEl.style.display = "none";
    if (hintEl) hintEl.style.display = "none";

    overlay.style.display = "flex";
    requestAnimationFrame(function () {
      overlay.classList.add("visible");
    });

    if (!wrapper) {
      if (imgBg && imgBg.complete && imgBg.naturalWidth) {
        onImageReady();
      } else if (imgBg) {
        imgBg.onload = onImageReady;
        if (!imgBg.src || imgBg.src === window.location.href)
          imgBg.src = versionedAsset("./frames/matbang/matbangbackground.jpg");
      }
    } else {
      setupPanZoom();
    }

    loadSVG();
    loadLotData();
  }

  function hideMatBang() {
    if (overlay.style.display === "none") return;
    hideLotInfo();
    overlay.classList.remove("visible");
    setTimeout(function () {
      overlay.style.display = "none";
    }, 400);
    if (stageEl) stageEl.style.opacity = "1";
    if (vignEl) vignEl.style.opacity = "1";
    if (dnEl) dnEl.style.display = "";
    if (hintEl) hintEl.style.display = "";
  }

  window._hideMatBang = hideMatBang;

  navMatBang.addEventListener("click", function (e) {
    e.preventDefault();
    document.querySelectorAll(".menu-item").forEach(function (i) {
      i.classList.remove("active");
    });
    this.classList.add("active");
    showMatBang();
  });

  document
    .querySelectorAll(".menu-item:not(#nav-gallery)")
    .forEach(function (item) {
      item.addEventListener("click", function () {
        hideMatBang();
      });
    });

  window.addEventListener("resize", function () {
    if (overlay.style.display === "none") return;
    if (wrapper) setupPanZoom();
  });
})();
