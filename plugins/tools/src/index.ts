import type { Plugin, PluginContext } from '@wizard-harness/core';
import type { PromptContextService, SessionService, ToolCallResult, ToolInfo, ToolSpec, ToolsService, TrajectoryService } from '@wizard-harness/contracts';
import { TOOLS_HTML } from './page.js';
import { createToolRegistry } from './registry.js';

/**
 * tools 插件：工具注册表。调用写入 session（tool-result）。
 * register 时向 prompt-context 登记 tools() 提供者，交给模型的工具表只从 assemble 出门。
 * 说明文档：docs/plugins/tools.html
 */
let ctx: PluginContext | undefined;
let impl: ToolsService | undefined;

function sessionOf(): SessionService {
  const s = ctx?.session ?? ctx?.get<SessionService>('session');
  if (!s) throw new Error('tools 需要 session 服务');
  return s;
}

function promptsOf(c: PluginContext): PromptContextService {
  const p = c.promptContext ?? c.get<PromptContextService>('promptContext');
  if (!p) throw new Error('tools 需要 promptContext 服务');
  return p;
}

function wireToolAssembly(c: PluginContext) {
  promptsOf(c).tools((assembleCtx) =>
    live()
      .listIn(assembleCtx.scope)
      .map((t) => ({ name: t.name, description: t.description })),
  );
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
  bind(owner) {
    return live().bind(owner);
  },
  listIn(scope) {
    return live().listIn(scope);
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
  inject: { session: true, promptContext: true, logger: false, trajectory: false },
  api,
  ui: {
    title: '工具注册表',
    width: 560,
    height: 560,
    rpc: { tools: ['list'] },
    content: TOOLS_HTML,
  },
  register(c) {
    ctx = c;
    impl = createToolRegistry(
      c,
      sessionOf,
      (action, target, payload) => {
        ctx?.emit({ action, target, payload });
      },
      (sessionId, data) => {
        const traj = ctx?.trajectory ?? ctx?.get<TrajectoryService>('trajectory');
        traj?.record(sessionId, 'tool', data);
      },
    );
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
    wireToolAssembly(c);
    c.logger?.info?.('tools 插件就绪（内置 echo / now / upper）');
    c.effect(() => () => {
      impl = undefined;
      ctx = undefined;
    });
  },
};

export default toolsPlugin;
