const fs = require('fs');
const path = require('path');
const mainPath = path.join(__dirname, 'main.js');
let content = fs.readFileSync(mainPath, 'utf8');

// 1. Reset everything I might have messed up and do a CLEAN injection.
// I will remove all occurrences of the broken _origLoop and Edit UI blocks.

// Remove the weird _origLoop checks I added
content = content.replace(/if \(typeof _origLoop === 'undefined'\) \{ if \(typeof window\._origLoop === "undefined"\) \{ window\._origLoop = startRender; \} \}/g, 'var _origLoop = startRender;');
content = content.replace(/window\._origLoop\(\);/g, '_origLoop();');

// Dedup the Edit UI blocks - removing all blocks and re-adding one.
// Blocks start with "// Edit UI" or "// --- EDIT MODE UI ---"
const blocksToRemove = [
    /\/\/\s+Edit UI[\s\S]+?\}\)\(\);/g,
    /\/\/ --- EDIT MODE UI ---[\s\S]+?editUI\.querySelector\("#vr-exp"\)\.onclick[\s\S]+?\};/g
];
blocksToRemove.forEach(re => {
    content = content.replace(re, '');
});

// Now, let's find the original startRender and stopRender markers to inject the UI correctly.
// I will place the EDIT UI at the very end of the initVR360 function (around line 1530).
// Original line 1529: window.openVR360 = openVR;
content = content.replace('window.openVR360 = openVR;', `
  window.openVR360 = openVR;

  // --- CLEAN EDIT UI INJECTION ---
  (function() {
    const modal = document.getElementById("vr-modal");
    if(!modal) return;
    const ui = document.createElement("div");
    ui.id = "vr-edit-ui";
    ui.style.cssText = "position:absolute;top:80px;left:20px;z-index:99999;background:rgba(0,0,0,0.85);color:#fff;padding:15px;border-radius:10px;font-family:sans-serif;font-size:13px;border:1px solid #444;";
    ui.innerHTML = '<div style="color:#ffcc00;font-weight:bold;margin-bottom:8px">🛠 VR EDIT TOOL</div><div id="vr-info" style="margin-bottom:10px"></div><div style="display:flex;gap:8px"><button id="vr-save" style="background:#28a745;color:#fff;border:none;padding:8px 12px;border-radius:5px;cursor:pointer">LƯU GÓC</button><button id="vr-exp" style="background:#007bff;color:#fff;border:none;padding:8px 12px;border-radius:5px;cursor:pointer">XUẤT CODE</button></div>';
    modal.appendChild(ui);
    ui.querySelector("#vr-save").onclick = () => {
      let n = window._vrCurrentName;
      if(n && VR_MAP[n]) {
        VR_MAP[n].lon = Math.round(lon);
        VR_MAP[n].lat = Math.round(lat);
        VR_MAP[n].fov = Math.round(camera.fov);
        alert("Đã lưu cho: " + n);
      }
    };
    ui.querySelector("#vr-exp").onclick = () => {
      let out = "const VR_MAP = " + JSON.stringify(VR_MAP, null, 2);
      let t = document.createElement("textarea"); t.value = out; document.body.appendChild(t); t.select(); document.execCommand("copy"); document.body.removeChild(t);
      alert("Đã Copy VR_MAP!");
    };
    function tick() {
      let el = document.getElementById("vr-info");
      if(el && modal.style.display !== "none") {
        el.innerHTML = "Name: " + (window._vrCurrentName||"") + "<br>Lon: " + Math.round(lon) + " | Lat: " + Math.round(lat) + " | Zoom: " + Math.round(camera.fov);
      }
      requestAnimationFrame(tick);
    }
    tick();
  })();
`);

fs.writeFileSync(mainPath, content, 'utf8');
console.log('Successfully de-junked and cleaned main.js');
