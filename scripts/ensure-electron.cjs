#!/usr/bin/env node
'use strict';

const { existsSync, mkdirSync, readdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electronDir = path.join(root, 'node_modules', 'electron');
const distDir = path.join(electronDir, 'dist');
const exeName = process.platform === 'win32' ? 'electron.exe' : 'electron';
const exePath = path.join(distDir, exeName);

if (existsSync(exePath)) process.exit(0);

const installJs = path.join(electronDir, 'package.json');
if (!existsSync(installJs)) {
  console.error('[ensure-electron] 未找到 node_modules/electron，请先 pnpm install');
  process.exit(1);
}

const { version } = require(installJs);
const mirror = process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/';
console.log(`[ensure-electron] 缺少 ${exeName}，补装 Electron ${version} …`);

spawnSync(process.execPath, [path.join(electronDir, 'install.js')], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_MIRROR: mirror },
});

if (existsSync(exePath)) process.exit(0);

if (process.platform !== 'win32') {
  console.error('[ensure-electron] Electron 二进制仍缺失。请检查网络后执行 pnpm rebuild electron');
  process.exit(1);
}

const zipName = `electron-v${version}-${process.platform}-${process.arch}.zip`;

function findZip(dir) {
  if (!existsSync(dir)) return null;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const found = findZip(full);
      if (found) return found;
    } else if (ent.name === zipName) {
      return full;
    }
  }
  return null;
}

const zip = findZip(path.join(os.homedir(), 'AppData', 'Local', 'electron', 'Cache'));
if (!zip) {
  console.error(`[ensure-electron] 缓存中也没有 ${zipName}。Node 当前版本下 extract-zip 可能解压失败。`);
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });
const dest = distDir.replace(/'/g, "''");
const src = zip.replace(/'/g, "''");
spawnSync(
  'powershell.exe',
  ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${src}' -DestinationPath '${dest}' -Force`],
  { stdio: 'inherit' },
);

if (!existsSync(exePath)) {
  console.error('[ensure-electron] 已尝试解压缓存 zip，但仍没有 electron.exe');
  process.exit(1);
}

console.log('[ensure-electron] 已从缓存 zip 解压 Electron');
