"use strict";

const { app, BrowserWindow, BrowserView, Menu, dialog, ipcMain, shell } = require("electron");
const { execFile } = require("child_process");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const logger = require("./logger");
const appVolume = require("./appVolume");

const LOGIN_URL = "https://play.ekoloko.org/ekoloko/login.html";
const CONTROL_BAR_HEIGHT = 100;
const GAME_DEFAULT_WIDTH = 960;
const GAME_DEFAULT_HEIGHT = 600;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const FLASH_VERSION = "34.0.0.301";
const DEBUG_MODE = process.argv.includes("--devtools") || process.argv.includes("--debug");
const DEVTOOLS_ENABLED = DEBUG_MODE || !app.isPackaged;

let win;
let siteView;
let isDarkMode = false;
let darkModeCSSKey = null;
let zoomFitEnabled = true;
let manualZoom = 1;
let zoomResizeTimer = null;
let zoomSaveTimer = null;

const pluginName = "x64/pepflashplayer.dll";

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), "utf8")) || {};
  } catch {
    return {};
  }
}

function writeSettings() {
  try {
    fs.writeFileSync(
      getSettingsPath(),
      JSON.stringify({ zoomFit: zoomFitEnabled, zoomLevel: manualZoom }, null, 2),
      "utf8"
    );
  } catch (e) {
    logger.warn("settings", `could not save settings: ${(e && e.message) || e}`);
  }
}

function getPluginPath(rel) {
  const candidates = [
    path.join(process.resourcesPath || "", "plugins", rel),
    path.join(__dirname, "..", "..", "plugins", rel),
    path.join(__dirname, "..", "..", "..", "plugins", rel),
    path.join(__dirname, "..", "plugins", rel),
  ];

const found = candidates.find(fs.existsSync) || candidates[0];
return path.resolve(found);
}

const flashPluginPath = getPluginPath(pluginName);

app.commandLine.appendSwitch("ppapi-flash-path", flashPluginPath);
app.commandLine.appendSwitch("ppapi-flash-version", FLASH_VERSION);
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("ignore-gpu-blacklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");

function getAssetPath(filename) {
  const candidates = [
    path.join(process.resourcesPath || "", "assets", filename),
    path.join(__dirname, "..", "..", "assets", filename),
    path.join(__dirname, "..", "..", "..", "assets", filename),
  ];

  return candidates.find(fs.existsSync) || null;
}

function getAssetDataUrl(filename, mime) {
  const file = getAssetPath(filename);
  if (!file) return "";

  try {
    return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
  } catch {
    return "";
  }
}

function getControlPageHtml() {
  const logoSrc = getAssetDataUrl("3.png", "image/png");
  const fontSrc = getAssetDataUrl("Gan CLM Bold.ttf", "font/truetype");

  return `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>ekoloko</title>
<style>
${fontSrc ? `@font-face{font-family:'GanCLM';src:url('${fontSrc}') format('truetype');font-weight:bold}` : ""}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'GanCLM','Arial Rounded MT Bold',Arial,sans-serif;overflow:hidden;height:${CONTROL_BAR_HEIGHT}px;background:linear-gradient(180deg,#8fd42e 0%,#6aaa1e 100%);border-bottom:4px solid #4e8810}
.bar{height:${CONTROL_BAR_HEIGHT}px;display:flex;align-items:center;padding:0 28px;gap:20px}
.logo-img{flex-shrink:0;height:96px}
.panel{flex-shrink:1;background:#3a6fd8;border-radius:14px;border:3px solid #2a55c0;padding:10px 16px 12px;display:flex;flex-direction:column;gap:6px;min-width:140px}
.panel-label{font-size:12px;color:#b8cdff;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between;gap:8px}
.chip{flex-shrink:0;border:0;border-radius:8px;padding:1px 8px;background:rgba(255,255,255,.18);color:#dbe6ff;font-family:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap;transition:background .1s,color .1s}
.chip:hover{background:rgba(255,255,255,.32)}
.chip.active{background:linear-gradient(180deg,#ff9a2a 0%,#fb7d07 100%);color:#fff}
.slider-row{display:flex;align-items:center;gap:10px}
input[type="range"]{flex:1;min-width:56px;cursor:pointer;-webkit-appearance:none;appearance:none;height:6px;border-radius:4px;outline:0;background:linear-gradient(to right,#fb7d07 var(--fill,100%),rgba(255,255,255,.3) var(--fill,100%))}
input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer;transition:transform .1s}
input[type="range"]::-webkit-slider-thumb:hover{transform:scale(1.2)}
input[type="range"]:active::-webkit-slider-thumb{transform:scale(1.3)}
.val{font-size:14px;color:#fff;min-width:42px;text-align:right;font-variant-numeric:tabular-nums}
.btn{flex-shrink:0;border:0;border-radius:14px;padding:0 26px;height:52px;background:linear-gradient(180deg,#ff9a2a 0%,#fb7d07 100%);border-bottom:4px solid #c05800;color:#fff;font-family:inherit;font-size:17px;cursor:pointer;text-shadow:1px 1px 2px rgba(0,0,0,.3);transition:transform .1s,border-bottom-width .1s,filter .1s;white-space:nowrap}
.btn:hover{filter:brightness(1.08)}
.btn:active{transform:translateY(3px);border-bottom-width:1px}
.spacer{width:10px;flex-shrink:0}
.btn-fullscreen{margin-left:auto}
body.dark{background:linear-gradient(180deg,#1a2744 0%,#0d1728 100%);border-bottom-color:#060e1c}
body.dark .panel{background:#0f1e3a;border-color:#071228}
body.dark .panel-label{color:#5a80c0}
body.dark .chip{background:rgba(255,255,255,.1);color:#8fb0e8}
body.dark .chip:hover{background:rgba(255,255,255,.2)}
body.dark .chip.active{background:linear-gradient(180deg,#2a3d6a 0%,#1a2848 100%);color:#fff}
body.dark .btn{background:linear-gradient(180deg,#1e2d50 0%,#131d38 100%);border-bottom-color:#060e1c}
body.dark .btn#darkModeBtn{background:linear-gradient(180deg,#2a3d6a 0%,#1a2848 100%);border-bottom-color:#060e1c}
</style>
</head>
<body>
<div class="bar">
${logoSrc ? `<img class="logo-img" src="${logoSrc}" alt="ekoloko">` : ""}
<div class="panel">
  <div class="panel-label"><span>זום</span><button class="chip" id="zoomFitBtn" type="button" title="התאמת המשחק לגודל החלון">⤢ התאם</button></div>
  <div class="slider-row"><input id="zoom" type="range" min="${ZOOM_MIN}" max="${ZOOM_MAX}" step="0.05" value="1"><div class="val" id="zoomValue">100%</div></div>
</div>
<div class="spacer"></div>
<div class="panel">
  <div class="panel-label" id="volumeLabel">🔊 עוצמת קול</div>
  <div class="slider-row"><input id="volume" type="range" min="0" max="1" step="0.01" value="1"><div class="val" id="volumeValue">100%</div></div>
</div>
<div class="spacer"></div>
<button class="btn" id="clearCache" type="button">🗑️ נקה מטמון</button>
<div class="spacer"></div>
<button class="btn" id="restartBtn" type="button">🔄 הפעל מחדש</button>
<div class="spacer"></div>
<button class="btn" id="saveLogsBtn" type="button">💾 שמירת לוגים</button>
<div class="spacer"></div>
<button class="btn" id="darkModeBtn" type="button">🌙 מצב לילה</button>
<button class="btn btn-fullscreen" id="fullscreenBtn" type="button">⛶ מסך מלא</button>
</div>
<script>
const { ipcRenderer } = require("electron");
const fullscreenBtn=document.getElementById("fullscreenBtn");
const zoom=document.getElementById("zoom");
const zoomValue=document.getElementById("zoomValue");
const zoomFitBtn=document.getElementById("zoomFitBtn");
const volume=document.getElementById("volume");
const volumeValue=document.getElementById("volumeValue");
const volumeLabel=document.getElementById("volumeLabel");
const clearCache=document.getElementById("clearCache");
const restartBtn=document.getElementById("restartBtn");
const saveLogsBtn=document.getElementById("saveLogsBtn");
const darkModeBtn=document.getElementById("darkModeBtn");
let dark=false;

const formatPercent=value=>Math.round(Number(value)*100)+"%";

function setSliderFill(input){
  const min=parseFloat(input.min)||0;
  const max=parseFloat(input.max)||1;
  input.style.setProperty("--fill",((parseFloat(input.value)-min)/(max-min))*100+"%");
}

function updateZoomUI(value,fit){
  zoom.value=value;
  zoomValue.textContent=formatPercent(value);
  setSliderFill(zoom);
  zoomFitBtn.classList.toggle("active",fit);
}

function updateVolumeUI(){
  const v=Number(volume.value);
  volumeValue.textContent=formatPercent(v);
  setSliderFill(volume);
  volumeLabel.textContent=(v===0?"🔇":v<.5?"🔉":"🔊")+" עוצמת קול";
}

fullscreenBtn.addEventListener("click",()=>ipcRenderer.send("toggle-fullscreen"));

zoom.addEventListener("input",()=>{
  updateZoomUI(zoom.value,false);
  ipcRenderer.send("zoom-change",Number(zoom.value));
});

zoomFitBtn.addEventListener("click",()=>ipcRenderer.send("zoom-fit"));

ipcRenderer.on("zoom-changed",(_event,state)=>{
  updateZoomUI(state.zoom,state.fit);
});

ipcRenderer.on("fullscreen-changed",(_event,isFull)=>{
  fullscreenBtn.textContent=isFull?"🗗 יציאה ממסך מלא":"⛶ מסך מלא";
});

volume.addEventListener("input",()=>{
  updateVolumeUI();
  ipcRenderer.send("volume-change",Number(volume.value));
});

clearCache.addEventListener("click",()=>{
  ipcRenderer.send("clear-cache");
  clearCache.textContent="✓ נוקה!";
  setTimeout(()=>{clearCache.textContent="🗑️ נקה מטמון";},2000);
});

darkModeBtn.addEventListener("click",()=>{
  dark=!dark;
  document.body.classList.toggle("dark",dark);
  darkModeBtn.textContent=dark?"☀️ מצב יום":"🌙 מצב לילה";
  ipcRenderer.send("dark-mode-toggle",dark);
});

restartBtn.addEventListener("click",()=>ipcRenderer.send("restart"));

let savingLogs=false;

saveLogsBtn.addEventListener("click",()=>{
  if(savingLogs)return;
  savingLogs=true;
  saveLogsBtn.textContent="⏳ שומר...";
  ipcRenderer.send("save-logs");
});

ipcRenderer.on("save-logs-done",(_event,ok)=>{
  savingLogs=false;
  saveLogsBtn.textContent=ok?"✓ נשמר!":"✗ שגיאה";
  setTimeout(()=>{saveLogsBtn.textContent="💾 שמירת לוגים";},2500);
});

updateVolumeUI();
updateZoomUI(${manualZoom},${zoomFitEnabled});
ipcRenderer.send("zoom-request");
</script>
</body>
</html>`;
}

function setViewBounds() {
  if (!win || !siteView) return;

  const bounds = win.getContentBounds();

  siteView.setBounds({
    x: 0,
    y: CONTROL_BAR_HEIGHT,
    width: bounds.width,
    height: Math.max(0, bounds.height - CONTROL_BAR_HEIGHT),
  });

  siteView.setAutoResize({
    width: true,
    height: true,
  });
}

function roundZoom(zoomFactor) {
  const value = Number(zoomFactor);

  if (!Number.isFinite(value) || value <= 0) return 1;

  return Math.round(value * 20) / 20;
}

function clampZoom(zoomFactor) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, roundZoom(zoomFactor)));
}

async function measureGameSize() {
  const fallback = {
    width: GAME_DEFAULT_WIDTH,
    height: GAME_DEFAULT_HEIGHT,
    top: 0,
  };

  if (!siteView) return fallback;

  try {
    const size = await siteView.webContents.executeJavaScript(`(function(){
      var el=document.getElementById("shell")||document.querySelector("object, embed");
      if(!el)return null;
      var width=el.offsetWidth||parseInt(el.getAttribute("width"),10)||0;
      var height=el.offsetHeight||parseInt(el.getAttribute("height"),10)||0;
      if(!(width>0&&height>0))return null;
      var rect=el.getBoundingClientRect();
      return {width:width,height:height,top:Math.max(0,rect.top+window.pageYOffset)};
    })();`);

    if (size && size.width > 0 && size.height > 0) return size;
  } catch {}

  return fallback;
}

async function computeFitZoom() {
  if (!win || win.isDestroyed() || !siteView) return clampZoom(manualZoom);

  const size = await measureGameSize();

  if (!win || win.isDestroyed()) return clampZoom(manualZoom);

  const bounds = win.getContentBounds();
  const availableWidth = Math.max(1, bounds.width - 56);
  const availableHeight = Math.max(1, bounds.height - CONTROL_BAR_HEIGHT - 12);

  return clampZoom(
    Math.min(
      availableWidth / size.width,
      availableHeight / (size.height + size.top)
    )
  );
}

function sendZoomState(zoomFactor) {
  if (!win || win.isDestroyed()) return;

  win.webContents.send("zoom-changed", {
    zoom: zoomFactor,
    fit: zoomFitEnabled,
  });
}

async function applyPageScale(fit, scale) {
  if (!siteView || siteView.webContents.isDestroyed()) return null;

  try {
    const state = await siteView.webContents.executeJavaScript(`(function(){
      if(!window.ekolokoGameZoom)return null;
      return window.ekolokoGameZoom.apply(${fit ? "true" : "false"},${Number(scale) || 0});
    })();`);

    return state && Number(state.scale) > 0
      ? Number(state.scale)
      : null;
  } catch {
    return null;
  }
}

async function refreshZoom() {
  if (!siteView || siteView.webContents.isDestroyed()) return;

  const applied = await applyPageScale(
    zoomFitEnabled,
    manualZoom
  );

  if (!siteView || siteView.webContents.isDestroyed()) return;

  if (applied !== null) {
    siteView.webContents.setZoomFactor(1);
    sendZoomState(roundZoom(applied));
    return;
  }

  const zoomFactor = zoomFitEnabled
    ? await computeFitZoom()
    : clampZoom(manualZoom);

  if (!siteView || siteView.webContents.isDestroyed()) return;

  siteView.webContents.setZoomFactor(zoomFactor);
  sendZoomState(zoomFactor);
}

function saveZoomPreference() {
  clearTimeout(zoomSaveTimer);

  zoomSaveTimer = setTimeout(() => {
    zoomSaveTimer = null;
    writeSettings();
  }, 400);
}

function scheduleZoomRefresh() {
  if (!zoomFitEnabled) return;

  clearTimeout(zoomResizeTimer);

  zoomResizeTimer = setTimeout(() => {
    zoomResizeTimer = null;
    refreshZoom();
  }, 150);
}

async function applyDarkModeCSS(isDark) {
  if (!siteView || siteView.webContents.isDestroyed()) return;

  if (darkModeCSSKey) {
    try {
      await siteView.webContents.removeInsertedCSS(darkModeCSSKey);
    } catch {}

    darkModeCSSKey = null;
  }

  if (isDark) {
    try {
      darkModeCSSKey = await siteView.webContents.insertCSS(
        "html, body { background-color: #1c2d4a !important; }"
      );
    } catch {}
  }
}

function applyVolume(volume) {
  if (siteView && !siteView.webContents.isDestroyed()) {
    siteView.webContents.setAudioMuted(volume <= 0);
  }

  appVolume.set(volume);
}
async function saveLogsBundle() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "שמירת לוגים",
    defaultPath: path.join(
      app.getPath("desktop"),
      `ekoloko-logs-${stamp}.txt`
    ),
    filters: [{ name: "Log", extensions: ["txt"] }],
  });

  if (canceled || !filePath) {
    logger.info("save-logs", "user cancelled the save dialog");
    return false;
  }

  fs.writeFileSync(
    filePath,
    `${logger.metadataHeader()}\n\n========== APP LOG ==========\n${logger.getExportText()}`,
    "utf8"
  );

  logger.info("save-logs", `saved logs to ${filePath}`);
  shell.showItemInFolder(filePath);

  return true;
}

function attachWebContentsLogging(wc, source) {
  const levelName = (level) =>
    ["INFO", "WARN", "ERROR", "INFO"][level] || "INFO";

  wc.on(
    "console-message",
    (_e, level, message, line, sourceId) => {
      const where = sourceId
        ? ` (${sourceId}:${line})`
        : "";

      logger.info(
        source,
        `console[${levelName(level)}]: ${message}${where}`
      );
    }
  );

  wc.on(
    "did-fail-load",
    (_e, code, desc, url) =>
      logger.error(
        source,
        `did-fail-load ${code} ${desc} ${url || ""}`
      )
  );

  wc.on(
    "did-fail-provisional-load",
    (_e, code, desc, url) =>
      logger.error(
        source,
        `did-fail-provisional-load ${code} ${desc} ${url || ""}`
      )
  );

  wc.on(
    "dom-ready",
    () => logger.info(source, "dom-ready")
  );

  wc.on(
    "did-finish-load",
    () => logger.info(source, "did-finish-load")
  );

  wc.on(
    "did-navigate",
    (_e, url) =>
      logger.info(
        source,
        `did-navigate ${url}`
      )
  );

  wc.on(
    "crashed",
    (_e, killed) =>
      logger.error(
        source,
        `renderer crashed (killed=${killed})`
      )
  );

  wc.on(
    "unresponsive",
    () => logger.warn(source, "unresponsive")
  );

  wc.on(
    "responsive",
    () => logger.info(source, "responsive")
  );

  wc.on(
    "plugin-crashed",
    (_e, name, version) =>
      logger.error(
        source,
        `plugin-crashed: ${name} ${version}`
      )
  );
}

function attachDevtoolsShortcut(wc, targetWc) {
  wc.on(
    "before-input-event",
    (event, input) => {
      if (input.type !== "keyDown") return;

      const toggle =
        input.key === "F12" ||
        (
          input.control &&
          input.shift &&
          String(input.key).toLowerCase() === "i"
        );

      if (!toggle) return;

      if (targetWc.isDevToolsOpened()) {
        targetWc.closeDevTools();
      } else {
        targetWc.openDevTools({
          mode: "detach",
        });
      }

      event.preventDefault();
    }
  );
}

function createWindow() {
  win = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#6aaa1e",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: DEVTOOLS_ENABLED,
      plugins: true,
    },
  });

  win.maximize();

  const controlHtmlPath = path.join(
    app.getPath("temp"),
    "ekoloko-control.html"
  );

  fs.writeFileSync(
    controlHtmlPath,
    getControlPageHtml(),
    "utf8"
  );

  win.loadFile(controlHtmlPath);

  siteView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: DEVTOOLS_ENABLED,
      plugins: true,
      allowRunningInsecureContent: true,
      backgroundThrottling: false,
    },
  });

  win.setBrowserView(siteView);

  siteView.setBackgroundColor(
    "#6aaa1e"
  );

  setViewBounds();

  attachWebContentsLogging(
    siteView.webContents,
    "game"
  );

  attachWebContentsLogging(
    win.webContents,
    "control-bar"
  );

  if (DEVTOOLS_ENABLED) {
    attachDevtoolsShortcut(
      siteView.webContents,
      siteView.webContents
    );

    attachDevtoolsShortcut(
      win.webContents,
      siteView.webContents
    );
  }

  if (DEBUG_MODE) {
    logger.info(
      "devtools",
      "launched with --devtools; DevTools enabled"
    );

    siteView.webContents.once(
      "dom-ready",
      () => {
        if (!siteView.webContents.isDestroyed()) {
          siteView.webContents.openDevTools({
            mode: "detach",
          });
        }
      }
    );
  }

  siteView.webContents.loadURL(
    LOGIN_URL
  );

  siteView.webContents.setAudioMuted(
    false
  );

  siteView.webContents.on(
    "new-window",
    (event, url) => {
      event.preventDefault();

      const popup = new BrowserWindow({
        width: 1024,
        height: 768,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          plugins: true,
          allowRunningInsecureContent: true,
        },
      });

      popup.loadURL(url);
    }
  );

  siteView.webContents.on(
    "did-finish-load",
    () => {
      refreshZoom();

      if (isDarkMode) {
        applyDarkModeCSS(true);
      }
    }
  );

  win.on(
    "resize",
    () => {
      setViewBounds();
      scheduleZoomRefresh();
    }
  );

  win.on(
    "enter-full-screen",
    () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(
          "fullscreen-changed",
          true
        );
      }

      scheduleZoomRefresh();
    }
  );

  win.on(
    "leave-full-screen",
    () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(
          "fullscreen-changed",
          false
        );
      }

      scheduleZoomRefresh();
    }
  );

  win.on(
    "closed",
    () => {
      win = null;
      siteView = null;

      clearTimeout(
        zoomResizeTimer
      );

      zoomResizeTimer = null;

      if (zoomSaveTimer) {
        clearTimeout(
          zoomSaveTimer
        );

        zoomSaveTimer = null;

        writeSettings();
      }
    }
  );
}

function getUninstallerPath() {
  return path.join(
    path.dirname(process.execPath),
    `Uninstall ${app.getName()}.exe`
  );
}

function uninstallApp() {
  const uninstallerPath =
    getUninstallerPath();

  if (!fs.existsSync(uninstallerPath)) {
    dialog.showErrorBox(
      "Uninstaller not found",
      `Could not find ${path.basename(uninstallerPath)}.`
    );

    return;
  }

  const response =
    dialog.showMessageBoxSync(
      win,
      {
        type: "warning",
        buttons: [
          "Cancel",
          "Uninstall",
        ],
        defaultId: 1,
        cancelId: 0,
        title: "Uninstall ekoloko",
        message: "This will remove ekoloko from your computer.",
        detail: "The app will close and launch the Windows uninstaller.",
      }
    );

  if (response !== 1) return;

  execFile(
    uninstallerPath,
    [],
    {
      detached: true,
      stdio: "ignore",
    }
  ).unref();

  app.quit();
}

function createAppMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          {
            label: "Uninstall ekoloko",
            click: uninstallApp,
          },
          {
            type: "separator",
          },
          {
            role: "quit",
          },
        ],
      },
    ])
  );
}

function initAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;

  autoUpdater.on(
    "error",
    (err) =>
      logger.error(
        "updater",
        (err && err.message) || String(err)
      )
  );

  autoUpdater.on(
    "checking-for-update",
    () =>
      logger.info(
        "updater",
        "checking for update"
      )
  );

  autoUpdater.on(
    "update-available",
    (info) =>
      logger.info(
        "updater",
        `update available: ${(info && info.version) || "?"}`
      )
  );

  autoUpdater.on(
    "update-not-available",
    () =>
      logger.info(
        "updater",
        "no update available"
      )
  );

  autoUpdater.on(
    "update-downloaded",
    (info) => {
      logger.info(
        "updater",
        `update downloaded: ${(info && info.version) || "?"}`
      );

      const response =
        dialog.showMessageBoxSync(
          win,
          {
            type: "info",
            buttons: [
              "Later",
              "Restart now",
            ],
            defaultId: 1,
            cancelId: 0,
            title: "Update ready",
            message: "A new version of ekoloko is ready to install.",
            detail: `Version ${(info && info.version) || ""} will be applied after restart.`,
          }
        );

      if (response === 1) {
        autoUpdater.quitAndInstall();
      }
    }
  );

  autoUpdater
    .checkForUpdates()
    .catch(() => {});

  setInterval(
    () =>
      autoUpdater
        .checkForUpdates()
        .catch(() => {}),
    6 * 60 * 60 * 1000
  );
}

app.whenReady().then(() => {
  logger.init({
    flashVersion: FLASH_VERSION,
  });

  logger.info(
    "app",
    `ekoloko starting (debugMode=${DEBUG_MODE})`
  );

  logger.info(
    "flash",
    `ppapi-flash v${FLASH_VERSION} path=${flashPluginPath} exists=${fs.existsSync(flashPluginPath)}`
  );

  try {
    const gpu =
      app.getGPUFeatureStatus();

    logger.info(
      "gpu",
      `gpu_compositing=${gpu.gpu_compositing} 2d_canvas=${gpu.gpu_compositing && gpu["2d_canvas"]} webgl=${gpu.webgl} rasterization=${gpu.rasterization}`
    );
  } catch (e) {
    logger.warn(
      "gpu",
      `could not read GPU feature status: ${(e && e.message) || e}`
    );
  }

  process.on(
    "uncaughtException",
    (err) =>
      logger.error(
        "uncaughtException",
        (err && err.stack) || String(err)
      )
  );

  process.on(
    "unhandledRejection",
    (reason) =>
      logger.error(
        "unhandledRejection",
        (reason && reason.stack) || String(reason)
      )
  );

  const settings =
    readSettings();

  zoomFitEnabled =
    settings.zoomFit !== false;

  manualZoom = clampZoom(
    settings.zoomLevel !== undefined
      ? settings.zoomLevel
      : 1
  );

  createAppMenu();
  createWindow();
  initAutoUpdater();

  ipcMain.on(
    "toggle-fullscreen",
    () => {
      if (win && !win.isDestroyed()) {
        win.setFullScreen(
          !win.isFullScreen()
        );
      }
    }
  );

  ipcMain.on(
    "zoom-change",
    (_event, zoomFactor) => {
      zoomFitEnabled = false;
      manualZoom = clampZoom(zoomFactor);
      saveZoomPreference();
      refreshZoom();
    }
  );

  ipcMain.on(
    "zoom-fit",
    () => {
      zoomFitEnabled = true;
      saveZoomPreference();
      refreshZoom();
    }
  );

  ipcMain.on(
    "zoom-request",
    refreshZoom
  );

  ipcMain.on(
    "volume-change",
    (_event, volume) =>
      applyVolume(Number(volume))
  );

  ipcMain.on(
    "restart",
    () => {
      app.relaunch();
      app.exit(0);
    }
  );

  ipcMain.on(
    "dark-mode-toggle",
    async (_event, isDark) => {
      isDarkMode =
        isDark === true;

      const bg =
        isDarkMode
          ? "#1c2d4a"
          : "#6aaa1e";

      if (win && !win.isDestroyed()) {
        win.setBackgroundColor(bg);
      }

      if (siteView) {
        siteView.setBackgroundColor(bg);
        await applyDarkModeCSS(isDarkMode);
      }
    }
  );

  ipcMain.on(
    "clear-cache",
    async () => {
      if (
        !siteView ||
        siteView.webContents.isDestroyed()
      ) {
        return;
      }

      await siteView.webContents.session.clearCache();

      await siteView.webContents.session.clearStorageData({
        storages: [
          "localstorage",
          "indexdb",
          "serviceworkers",
          "cachestorage",
        ],
      });

      siteView.webContents.reload();
    }
  );

  ipcMain.on(
    "save-logs",
    async () => {
      let ok = false;

      try {
        ok =
          await saveLogsBundle();
      } catch (e) {
        logger.error(
          "save-logs",
          (e && e.stack) || String(e)
        );
      }

      if (win && !win.isDestroyed()) {
        win.webContents.send(
          "save-logs-done",
          ok
        );
      }
    }
  );
});

app.on(
  "window-all-closed",
  () => app.quit()
);

app.on(
  "will-quit",
  () => appVolume.dispose()
); 