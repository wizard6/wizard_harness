// wizard-harness GUI 桌面壳 · Electron 主进程
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('node:path');
const { mkdirSync } = require('node:fs');

/** 应用菜单：普通用户用不到文件/编辑/视图等菜单项，直接隐藏菜单栏 */
function setupMenu() {
  Menu.setApplicationMenu(null);
}

function glassOptions(extra) {
  return {
    show: false,
    frame: false,
    // 深色主题底：不用系统亚克力透桌面，避免背景被洗浅
    backgroundColor: '#16161e',
    roundedCorners: true,
    thickFrame: true,
    hasShadow: true,
    ...extra,
  };
}

function attachGlass(win) {
  win.once('ready-to-show', () => win.show());
}

const PLUGIN_CHROME_CSS = `
  html, body { background: #16161e !important; }
  body { padding-top: 38px !important; }
  #wh-titlebar {
    position: fixed; top: 0; left: 0; right: 0; height: 38px; z-index: 99999;
    display: flex; align-items: center; gap: 10px; padding: 0 12px;
    background: rgba(22,22,30,.88);
    backdrop-filter: blur(28px) saturate(180%);
    -webkit-backdrop-filter: blur(28px) saturate(180%);
    -webkit-app-region: drag;
    border-bottom: 1px solid rgba(255,255,255,.08);
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
    color: #e6e6ef;
  }
  #wh-titlebar .traffic { display: flex; gap: 8px; margin-left: auto; -webkit-app-region: no-drag; }
  #wh-titlebar .tl-btn {
    width: 12px; height: 12px; border-radius: 50%; border: none; padding: 0; cursor: default;
    box-shadow: 0 0 0 0.5px rgba(0,0,0,.28);
  }
  #wh-titlebar .tl-close { background: #ff5f57; }
  #wh-titlebar .tl-min { background: #febc2e; }
  #wh-titlebar .tl-max { background: #28c840; }
  #wh-titlebar .title {
    flex: 1; text-align: left; font-size: 12px; opacity: .72; padding-left: 4px;
    pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
`;

function injectPluginChrome(win, title) {
  const safeTitle = JSON.stringify(title);
  win.webContents.on('did-finish-load', async () => {
    await win.webContents.insertCSS(PLUGIN_CHROME_CSS);
    await win.webContents.executeJavaScript(`(() => {
      if (document.getElementById('wh-titlebar')) return;
      const bar = document.createElement('div');
      bar.id = 'wh-titlebar';
      bar.innerHTML = '<div class="title"></div><div class="traffic">'
        + '<button type="button" class="tl-btn tl-close" data-act="close" title="关闭"></button>'
        + '<button type="button" class="tl-btn tl-min" data-act="min" title="最小化"></button>'
        + '<button type="button" class="tl-btn tl-max" data-act="max" title="最大化"></button>'
        + '</div>';
      bar.querySelector('.title').textContent = ${safeTitle};
      bar.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (window.wh && typeof window.wh.windowControl === 'function') {
            window.wh.windowControl(btn.getAttribute('data-act'));
          }
        });
      });
      document.body.prepend(bar);
    })()`);
  });
}

let core;
let harness;
let registrar;
let bus;
const events = [];
let plugins = [];

async function init() {
  core = await import('@wizard-harness/core');
  bus = core.createEventBus();
  bus.subscribe((e) => events.push(e));
  // 与 CLI / TUI / API 共用同一份事件账本（仓库根 docs/logs/events.jsonl）
  // 用相对 main.cjs 的稳定路径，避免受启动 cwd（obs/gui）影响
  const eventsFile = path.resolve(__dirname, '..', '..', '..', 'docs', 'logs', 'events.jsonl');
  mkdirSync(path.dirname(eventsFile), { recursive: true });
  // 预填历史：启动时把已落盘的 jsonl 载入内存（重启不丢历史）
  try {
    events.push(...core.readEvents(eventsFile));
  } catch {
    // 文件不存在/损坏时忽略，冷启动从空开始
  }
  bus.subscribe(core.createFileSink(eventsFile));

  // 壳配置：不想启动的插件 id 写进 disabledPlugins
  const config = { disabledPlugins: [] };
  // 运行时壳装配：createHarness → discover → 过滤 → boot（含 dep-missing 警告）
  const pluginsDir = path.resolve(__dirname, '..', '..', '..', 'plugins');
  const rt = await core.assembleRuntime({ bus, config, name: 'wizard-harness', pluginsDir });
  for (const w of rt.warnings) console.warn('[discovery]', w);
  for (const s of rt.skipped) console.warn('[boot] skipped', s.id, `(${s.reason})`);
  for (const p of rt.pending) {
    console.warn('[boot] pending', p.plugin.manifest.id, '缺少', p.missing.join(', '));
  }
  harness = rt.harness;
  registrar = harness.registry;
  plugins = rt.plugins;

  // 冒烟：通过服务目录调用 logger 服务
  const logger = harness.services.get('logger');
  if (logger && typeof logger.info === 'function') logger.info('harness 启动，服务就绪');

  startGateway();
}

/**
 * 跨进程事件网关（HTTP）：
 * - POST /call          { service, method, args } → 事件化调用服务（壳视角）
 * - POST /publish       { action, target?, payload? } → 向总线发布一条事件
 * - GET  /events/stream SSE → 订阅总线事件流（跨进程观测/转发）
 * 安全基线：默认仅监听 127.0.0.1（WH_GATEWAY_HOST 可显式放开）；
 * 设置 WH_GATEWAY_TOKEN 后所有请求需带 X-WH-Token 头（跨网络/远程场景）。
 * 端口默认 8790（避开 obs:api 的 8787），可用 WH_GATEWAY_PORT 覆盖。
 */
function startGateway() {
  const http = require('node:http');
  const port = Number(process.env.WH_GATEWAY_PORT ?? 8790);
  const host = process.env.WH_GATEWAY_HOST ?? '127.0.0.1';
  const token = process.env.WH_GATEWAY_TOKEN ?? '';
  const server = http.createServer(async (req, res) => {
    // 鉴权：设置 token 后校验请求头，避免局域网任意请求触达
    if (token) {
      const got = req.headers['x-wh-token'];
      if (got !== token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: '未授权（缺少或错误的 X-WH-Token）' }));
        return;
      }
    }
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/events/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 1000\n\n');
      const stop = bus.subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
      req.on('close', stop);
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let data = {};
      try {
        data = JSON.parse(body || '{}');
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'JSON 解析失败' }));
        return;
      }

      if (url.pathname === '/call') {
        const { service, method, args, timeoutMs } = data;
        try {
          const result = await registrar.call(service, method, args, { timeoutMs });
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, result }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
        return;
      }

      if (url.pathname === '/publish') {
        const { action, target, payload } = data;
        if (typeof action !== 'string' || !action) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: '缺少 action' }));
          return;
        }
        bus.emit({
          id: require('node:crypto').randomUUID(),
          ts: Date.now(),
          actor: 'gateway',
          action,
          target: target ?? undefined,
          payload,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });
  server.listen(port, host, () => {
    console.log(
      `[gateway] 跨进程事件网关 http://${host}:${port}（/call /publish /events/stream${token ? '，已启用 token 鉴权' : ''}）`,
    );
  });
}

function createWindow() {
  const win = new BrowserWindow(
    glassOptions({
      width: 960,
      height: 680,
      minWidth: 720,
      minHeight: 480,
      title: 'wizard-harness · 观测台',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    }),
  );
  attachGlass(win);
  win.loadFile(path.join(__dirname, 'index.html'));
}

function openPluginWindow(id) {
  const plugin = plugins.find((p) => p.manifest.id === id);
  if (!plugin || !plugin.ui) return;
  const title = plugin.ui.title || plugin.manifest.id;
  // 安全：仅 trusted 插件的弹窗注入 execCommand（任意命令执行能力）；其余插件只给低风险的事件历史
  const preload = plugin.manifest.trusted ? 'preload-console.cjs' : 'preload-safe.cjs';
  const popup = new BrowserWindow(
    glassOptions({
      width: plugin.ui.width || 360,
      height: (plugin.ui.height || 240) + 38,
      title,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, preload),
      },
    }),
  );
  attachGlass(popup);
  injectPluginChrome(popup, title);
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
      // 运行时绑定：该插件实际挂出的服务名（一名可多插件、一插件可多名）
      services: harness
        ? harness.services.providedBy(p.manifest.id)
        : Array.isArray(p.manifest.provides)
          ? p.manifest.provides
          : p.api !== undefined
            ? [p.manifest.id]
            : [],
      // 合并后的生效配置（插件默认 + 全局覆盖）
      config: ctx?.config ?? {},
    };
  }),
}));

ipcMain.handle('wh:open-plugin', (_evt, id) => openPluginWindow(id));

// 插件管理操作（观测台）：热重载 / 卸载
ipcMain.handle('wh:reload-plugin', async (_evt, id) => {
  if (!harness) return { ok: false, error: 'harness 未就绪' };
  try {
    const r = await harness.reload(String(id));
    return { ok: true, version: r.plugin.plugin.manifest.version, cascaded: r.cascaded };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
ipcMain.handle('wh:unregister-plugin', async (_evt, id) => {
  if (!harness) return { ok: false, error: 'harness 未就绪' };
  try {
    await harness.registry.unregister(String(id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

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

ipcMain.on('wh:window-control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  if (action === 'min') win.minimize();
  else if (action === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.close();
});

app.whenReady().then(async () => {
  setupMenu();
  await init();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
