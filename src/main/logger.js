"use strict";

const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

const MAX_BUFFER = 5000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

let buffer = [];
let logDir = null;
let logFile = null;
let flashVersion = "unknown";

function ts() {
  return new Date().toISOString();
}

function safeString(value) {
  try {
    return String(value);
  } catch {
    return "[unprintable]";
  }
}

function init(opts) {
  try {
    if (opts?.flashVersion) flashVersion = opts.flashVersion;

    logDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });

    logFile = path.join(logDir, "ekoloko.log");
    appendToFile("\n" + metadataHeader() + "\n");
  } catch {
    logDir = null;
    logFile = null;
  }
}

function rotateIfNeeded() {
  if (!logFile) return;

  try {
    if (fs.statSync(logFile).size <= MAX_FILE_BYTES) return;

    const backup = logFile + ".1";

    try {
      fs.unlinkSync(backup);
    } catch {}

    fs.renameSync(logFile, backup);
  } catch {}
}

function appendToFile(text) {
  if (!logFile) return;

  try {
    rotateIfNeeded();
    fs.appendFileSync(logFile, text, "utf8");
  } catch {}
}

function log(level, source, msg) {
  try {
    const line = `${ts()} [${safeString(level)}] [${safeString(source)}] ${safeString(msg)}`;

    buffer.push(line);

    if (buffer.length > MAX_BUFFER) {
      buffer.shift();
    }

    appendToFile(line + "\n");
  } catch {}
}

function metadataHeader() {
  try {
    let appVersion = "?";
    let locale = "?";
    let packaged = "?";

    try {
      appVersion = app.getVersion();
    } catch {}

    try {
      locale = app.getLocale();
    } catch {}

    try {
      packaged = String(app.isPackaged);
    } catch {}

    return [
      "==================== ekoloko log ====================",
      `app version     : ${appVersion}`,
      `electron        : ${process.versions.electron || "?"}`,
      `chrome          : ${process.versions.chrome || "?"}`,
      `node            : ${process.versions.node || "?"}`,
      `flash (declared): ${flashVersion}`,
      `platform/arch   : ${process.platform} ${process.arch}`,
      `os release      : ${os.release()}`,
      `locale          : ${locale}`,
      `packaged        : ${packaged}`,
      `timestamp       : ${ts()}`,
      "=====================================================",
    ].join("\n");
  } catch {
    return "==================== ekoloko log ====================";
  }
}

function getExportText() {
  try {
    const chunks = [];

    if (logFile) {
      for (const file of [logFile + ".1", logFile]) {
        try {
          if (fs.existsSync(file)) {
            chunks.push(fs.readFileSync(file, "utf8"));
          }
        } catch {}
      }
    }

    return chunks.length
      ? chunks.join("\n")
      : buffer.join("\n") + (buffer.length ? "\n" : "");
  } catch {
    try {
      return buffer.join("\n") + "\n";
    } catch {
      return "";
    }
  }
}

module.exports = {
  init,
  metadataHeader,
  getExportText,
  getLogFile: () => logFile,
  getLogDir: () => logDir,
  info: (source, msg) => log("INFO", source, msg),
  warn: (source, msg) => log("WARN", source, msg),
  error: (source, msg) => log("ERROR", source, msg),
};

