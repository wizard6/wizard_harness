// wizard-harness GUI 桌面壳 · Electron 主进程
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

let core;
let registrar;
const events = [];
let plugins = [];

async function init() {
  core = await import('@wizard-harness/core');
  const bus = core.createEventBus();
  bus.subscribe((e) => events.push(e));
  registrar = core.createRegistrar({ bus });

  plugins = [
    {
      manifest: { id: 'plugin-a', version: '1.0.0', name: 'A 插件' },
      ui: {
        title: 'A 插件',
        width: 360,
        height: 240,
        content:
          '<h2>A 插件</h2><p>这是 A 插件的轻量独立弹窗页。</p><p style="color:green">状态：运行中</p>',
      },
      async register() {},
    },
    {
      manifest: { id: 'plugin-b', version: '0.9.0', name: 'B 插件' },
      ui: {
        title: 'B 插件',
        width: 360,
        height: 240,
        content: '<h2>B 插件</h2><p>这是 B 插件的轻量独立弹窗页。</p>',
      },
      async register() {},
    },
  ];
  for (const p of plugins) await registrar.register(p);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 620,
    title: 'wizard-harness · 观测台',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

function openPluginWindow(id) {
  const plugin = plugins.find((p) => p.manifest.id === id);
  if (!plugin || !plugin.ui) return;
  const popup = new BrowserWindow({
    width: plugin.ui.width || 360,
    height: plugin.ui.height || 240,
    title: plugin.ui.title || plugin.manifest.id,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  const html = plugin.ui.content || '<p>（无内容）</p>';
  popup.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

ipcMain.handle('wh:get-state', () => ({
  events: events.slice(-100),
  plugins: plugins.map((p) => ({
    id: p.manifest.id,
    name: p.manifest.name || p.manifest.id,
    version: p.manifest.version,
    hasUi: Boolean(p.ui),
  })),
}));

ipcMain.handle('wh:open-plugin', (_evt, id) => openPluginWindow(id));

app.whenReady().then(async () => {
  await init();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
