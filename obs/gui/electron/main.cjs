// wizard-harness GUI 桌面壳 · Electron 主进程
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { mkdirSync } = require('node:fs');

/** 应用菜单（中文）：文件 / 编辑 / 视图 / 窗口 */
function setupMenu() {
  const template = [
    {
      label: '文件',
      submenu: [{ label: '退出', role: 'quit' }],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭', role: 'close' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

let core;
let registrar;
const events = [];
let plugins = [];

async function init() {
  core = await import('@wizard-harness/core');
  const bus = core.createEventBus();
  bus.subscribe((e) => events.push(e));
  // 与 CLI / TUI / API 共用同一份事件账本（仓库根 docs/logs/events.jsonl）
  // 用相对 main.cjs 的稳定路径，避免受启动 cwd（obs/gui）影响
  const eventsFile = path.resolve(__dirname, '..', '..', '..', 'docs', 'logs', 'events.jsonl');
  mkdirSync(path.dirname(eventsFile), { recursive: true });
  bus.subscribe(core.createFileSink(eventsFile));

  // 壳配置：不想启动的插件 id 写进 disabledPlugins
  const config = { disabledPlugins: [] };
  registrar = core.createRegistrar({ bus, config });

  // 自动发现 plugins/ 目录下的插件包并注册（替代手动 import 点名）
  const pluginsDir = path.resolve(__dirname, '..', '..', '..', 'plugins');
  const { plugins: found, warnings } = await core.discoverPlugins(pluginsDir);
  for (const w of warnings) console.warn('[discovery]', w);

  const disabled = new Set(config.disabledPlugins ?? []);
  plugins = found.filter((p) => !disabled.has(p.manifest.id));
  for (const p of found) {
    if (disabled.has(p.manifest.id)) {
      bus.emit({
        id: randomUUID(),
        ts: Date.now(),
        actor: 'shell',
        action: 'skipped',
        target: p.manifest.id,
        payload: { reason: 'disabled' },
      });
    }
  }
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
    manifest: p.manifest,
    ui: p.ui,
  })),
}));

ipcMain.handle('wh:open-plugin', (_evt, id) => openPluginWindow(id));

app.whenReady().then(async () => {
  setupMenu();
  await init();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
