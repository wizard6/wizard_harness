// wizard-harness GUI 桌面壳 · Electron 主进程
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { mkdirSync } = require('node:fs');

/** 应用菜单：普通用户用不到文件/编辑/视图等菜单项，直接隐藏菜单栏 */
function setupMenu() {
  Menu.setApplicationMenu(null);
}

let core;
let harness;
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
  // 程序主体：harness 代表整个系统（注册表 + 服务目录 + 配置）
  harness = core.createHarness({ bus, config, name: 'wizard-harness' });
  registrar = harness.registry;

  // 自动发现 plugins/ 目录下的插件包并注册（替代手动 import 点名）
  const pluginsDir = path.resolve(__dirname, '..', '..', '..', 'plugins');
  const { plugins: found, warnings } = await core.discoverPlugins(pluginsDir);
  for (const w of warnings) console.warn('[discovery]', w);

  const disabled = new Set(config.disabledPlugins ?? []);
  const enabledExperimental = new Set(config.enableExperimental ?? []);
  const shouldSkip = (p) =>
    disabled.has(p.manifest.id) ||
    (p.manifest.tier === 'experimental' && !enabledExperimental.has(p.manifest.id));
  plugins = found.filter((p) => !shouldSkip(p));
  for (const p of found) {
    if (shouldSkip(p)) {
      bus.emit({
        id: randomUUID(),
        ts: Date.now(),
        actor: 'shell',
        action: 'skipped',
        target: p.manifest.id,
        payload: {
          reason: disabled.has(p.manifest.id) ? 'disabled' : 'experimental',
        },
      });
    }
  }
  for (const p of plugins) await registrar.register(p);
  // 冒烟：通过服务目录调用 logger 服务（验证 api 即服务链路）
  const logger = harness.services.get('logger');
  if (logger && typeof logger.info === 'function') logger.info('harness 启动，服务就绪');
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-console.cjs'),
    },
  });
  const html = plugin.ui.content || '<p>（无内容）</p>';
  popup.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

ipcMain.handle('wh:get-state', () => ({
  events: events.slice(-100),
  // 系统级全局配置（createHarness 传入）
  config: harness ? harness.config : {},
  plugins: plugins.map((p) => {
    const ctx = harness ? harness.pluginContext(p.manifest.id) : undefined;
    return {
      manifest: p.manifest,
      ui: p.ui,
      // api 即服务：服务名 = 插件 id（有 api 即提供服务）
      services: p.api !== undefined ? [p.manifest.id] : [],
      // 合并后的生效配置（插件默认 + 全局覆盖）
      config: ctx?.config ?? {},
    };
  }),
}));

ipcMain.handle('wh:open-plugin', (_evt, id) => openPluginWindow(id));

// 控制台插件命令执行通道（弹窗 preload 调用）
ipcMain.handle('wh:exec-command', async (_evt, command) => {
  const svc = harness?.services.get('console');
  if (!svc || typeof svc.exec !== 'function') {
    return { stdout: '', stderr: 'console 服务未就绪（控制台插件未加载）', code: -1 };
  }
  return svc.exec(String(command));
});

// 事件历史通道（事件总线插件弹窗调用）
ipcMain.handle('wh:events-history', () => events.slice(-500));

app.whenReady().then(async () => {
  setupMenu();
  await init();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
