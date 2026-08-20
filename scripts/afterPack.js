"use strict";

const fs = require("fs");
const path = require("path");

const KEEP = new Set(["en-US.pak", "he.pak"]);

exports.default = async ({ appOutDir }) => {
  const dir = path.join(appOutDir, "locales");

  if (!fs.existsSync(dir)) return;

  let removed = 0;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".pak") || KEEP.has(file)) continue;

    fs.unlinkSync(path.join(dir, file));
    removed++;
  }

  console.log(`afterPack: removed ${removed} unused locale files`);
};