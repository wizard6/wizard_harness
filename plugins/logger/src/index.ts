import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, PluginContext } from '@wizard-harness/core';

/**
 * logger 插件：提供 logger 服务（写日志文件 + 广播观测事件）。
 * 演示：manifest.config 配置注册 + api 即服务 + ctx.emit 观测。
 */
// 仓库根 = plugins/logger/dist → 上三级；相对路径配置基于根解析，避免受启动 cwd 影响
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

let ctx: PluginContext | undefined;
let file = join(ROOT, 'docs', 'logs', 'app.log');
let level = 'info';

const LEVEL_ORDER = ['debug', 'info', 'warn', 'error'];

function resolveFile(f: string): string {
  return isAbsolute(f) ? f : join(ROOT, f);
}

function log(l: string, msg: string): string {
  if (LEVEL_ORDER.indexOf(l) < LEVEL_ORDER.indexOf(level)) return '';
  const line = `${new Date().toISOString()} [${l}] ${msg}`;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, line + '\n', 'utf8');
  ctx?.emit({ action: 'log', target: l, payload: { msg } });
  return line;
}

const api = {
  log,
  debug: (msg: string): string => log('debug', msg),
  info: (msg: string): string => log('info', msg),
  warn: (msg: string): string => log('warn', msg),
  error: (msg: string): string => log('error', msg),
  setLevel: (l: string): void => {
    level = l;
  },
  getLevel: (): string => level,
  getFile: (): string => file,
};

const loggerPlugin: Plugin = {
  manifest: {
    id: 'logger',
    version: '0.1.0',
    name: '日志插件',
    description: '提供 logger 服务：写日志文件并广播观测事件',
    config: { level: 'info', file: 'docs/logs/app.log' },
    tier: 'core',
  },
  api,
  ui: {
    title: '日志插件',
    width: 420,
    height: 300,
    content: [
      '<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>',
      'body{margin:0;font-family:system-ui,"Microsoft YaHei",sans-serif;background:#16161e;color:#e6e6ef}',
      '.card{padding:22px}',
      'h1{font-size:16px;margin:0 0 6px}',
      '.desc{margin:0 0 14px;font-size:13px;color:#a8a8bd;line-height:1.6}',
      '.row{display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid #262634}',
      '.k{color:#a8a8bd}.v{color:#7ee787;font-family:ui-monospace,Consolas,monospace}',
      '.badge{display:inline-block;font-size:11px;padding:2px 10px;border-radius:12px;background:rgba(126,231,135,.12);color:#7ee787;margin-bottom:12px}',
      '</style></head><body><div class="card">',
      '<span class="badge">● 服务在线</span>',
      '<h1>日志插件</h1>',
      '<p class="desc">向其它插件提供 logger 服务：调用 api.log/info/warn/error 写日志并广播事件。通过 services.get(\'logger\') 获取。</p>',
      '<div class="row"><span class="k">服务名</span><span class="v">logger</span></div>',
      '<div class="row"><span class="k">日志级别</span><span class="v">info</span></div>',
      '<div class="row"><span class="k">日志文件</span><span class="v">docs/logs/app.log</span></div>',
      '</div></body></html>',
    ].join(''),
  },
  async register(c) {
    ctx = c;
    level = String(c.config.level ?? 'info');
    file = resolveFile(String(c.config.file ?? 'docs/logs/app.log'));
  },
};

export default loggerPlugin;
