import type { Plugin, PluginContext } from '@wizard-harness/core';
import type { SessionService, ToolCallResult, ToolInfo, ToolSpec, ToolsService } from '@wizard-harness/contracts';
import { createToolRegistry } from './registry.js';

/**
 * tools 插件：工具注册表。调用写入 session（tool-result）。
 * 说明文档：docs/plugins/tools.html
 */
let ctx: PluginContext | undefined;
let impl: ToolsService | undefined;

function sessionOf(): SessionService {
  const s = ctx?.session ?? ctx?.get<SessionService>('session');
  if (!s) throw new Error('tools 需要 session 服务');
  return s;
}

function live(): ToolsService {
  if (!impl) throw new Error('tools 未就绪');
  return impl;
}

const api: ToolsService = {
  register(spec: ToolSpec) {
    live().register(spec);
  },
  list(): readonly ToolInfo[] {
    return live().list();
  },
  call(name: string, args?: Record<string, unknown>, opts?: { sessionId?: string; callId?: string }): Promise<ToolCallResult> {
    return live().call(name, args, opts);
  },
};

const toolsPlugin: Plugin = {
  manifest: {
    id: 'tools',
    version: '0.1.0',
    name: '工具注册表',
    description: '登记 / 调用工具；结果 append tool-result 到 session。内置 echo / now / upper。',
    provides: ['tools'],
    config: {},
    tier: 'standard',
  },
  inject: { session: true, logger: false },
  api,
  ui: {
    title: '工具注册表',
    width: 480,
    height: 360,
    content: [
      '<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>',
      'body{margin:0;font-family:system-ui,"Microsoft YaHei",sans-serif;background:#16161e;color:#e6e6ef}',
      '.card{padding:22px}',
      'h1{font-size:16px;margin:0 0 6px}',
      '.desc{margin:0 0 14px;font-size:13px;color:#a8a8bd;line-height:1.6}',
      '.row{display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid #262634}',
      '.k{color:#a8a8bd}.v{color:#ffa657;font-family:ui-monospace,Consolas,monospace}',
      '.badge{display:inline-block;font-size:11px;padding:2px 10px;border-radius:12px;background:rgba(255,166,87,.12);color:#ffa657;margin-bottom:12px}',
      '</style></head><body><div class="card">',
      '<span class="badge">● tools 服务</span>',
      '<h1>工具注册表</h1>',
      '<p class="desc">ctx.tools.register / call。调用写入 session，不另存执行记录。内置 echo。agent 只应走本服务调工具。</p>',
      '<div class="row"><span class="k">服务名</span><span class="v">tools</span></div>',
      '<div class="row"><span class="k">依赖</span><span class="v">session（必选）</span></div>',
      '<div class="row"><span class="k">内置</span><span class="v">echo</span></div>',
      '<div class="row"><span class="k">观测</span><span class="v">tools/register · tools/call · tools/result</span></div>',
      '<div class="row"><span class="k">说明</span><span class="v">docs/plugins/tools.html</span></div>',
      '</div></body></html>',
    ].join(''),
  },
  register(c) {
    ctx = c;
    impl = createToolRegistry(sessionOf, (action, target, payload) => {
      ctx?.emit({ action, target, payload });
    });
    impl.register({
      name: 'echo',
      description: '原样返回 args.input（没有则返回整个 args）',
      handler: (args) => (args.input !== undefined ? args.input : args),
    });
    impl.register({
      name: 'now',
      description: '返回当前 ISO 时间',
      handler: () => new Date().toISOString(),
    });
    impl.register({
      name: 'upper',
      description: '把 args.input 转成大写',
      handler: (args) => String(args.input ?? '').toUpperCase(),
    });
    c.logger?.info?.('tools 插件就绪（内置 echo / now / upper）');
    c.effect(() => () => {
      impl = undefined;
      ctx = undefined;
    });
  },
};

export default toolsPlugin;
