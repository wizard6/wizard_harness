import type { PluginContext } from './types.js';

type Bindable = { bind(owner: PluginContext): unknown };

function isBindable(service: unknown): service is Bindable {
  return (
    service !== null &&
    typeof service === 'object' &&
    'bind' in service &&
    typeof (service as Bindable).bind === 'function'
  );
}

/** 登记走 owner ctx；显式 bind / 全局能力仍委托根服务 */
function wrapToolsService(service: Bindable & Record<string, unknown>, owner: PluginContext): unknown {
  const scoped = service.bind(owner) as {
    register: (spec: unknown) => void;
    list: () => unknown;
    call: (name: string, args?: unknown, opts?: unknown) => Promise<unknown>;
  };
  return {
    register: (spec: unknown) => scoped.register(spec),
    list: () => scoped.list(),
    call: (name: string, args?: unknown, opts?: unknown) => scoped.call(name, args, opts),
    bind: (o: PluginContext) => service.bind(o),
    listIn: (scope?: unknown) => {
      const listIn = service.listIn;
      return typeof listIn === 'function' ? listIn.call(service, scope) : undefined;
    },
  };
}

function wrapPromptContextService(service: Bindable & Record<string, unknown>, owner: PluginContext): unknown {
  const scoped = service.bind(owner) as {
    section: (s: unknown) => () => void;
    context: (e: unknown) => () => void;
    variable: (n: string, p: unknown) => () => void;
    tools: (p: unknown) => () => void;
  };
  const passthrough = (method: string) => {
    const fn = service[method];
    return typeof fn === 'function' ? (...args: unknown[]) => fn.apply(service, args) : undefined;
  };
  return {
    section: (s: unknown) => scoped.section(s),
    context: (e: unknown) => scoped.context(e),
    variable: (n: string, p: unknown) => scoped.variable(n, p),
    tools: (p: unknown) => scoped.tools(p),
    bind: (o: PluginContext) => service.bind(o),
    assemble: passthrough('assemble'),
    apply: passthrough('apply'),
    setPersona: passthrough('setPersona'),
    getPersona: passthrough('getPersona'),
    inspect: passthrough('inspect'),
    usage: passthrough('usage'),
  };
}

/**
 * Cordis 风格消费侧注入：经 ctx 访问带 bind 的服务时，默认登记绑定到当前插件 ctx，
 * 使 register/section 等走 layers.effect(owner) → ctx.effect，卸载时 LIFO 撤销。
 * 仍保留根服务的 bind / assemble / listIn，供 agent-loop 等二次 scope 绑定。
 */
export function cordisInjectView(
  name: string,
  service: unknown,
  ctx: PluginContext,
  pluginId: string,
): unknown {
  if (!isBindable(service)) return service;
  if (name === 'tools' && pluginId === 'tools') return service;
  if (name === 'promptContext' && pluginId === 'prompt-context') return service;
  const root = service as Bindable & Record<string, unknown>;
  if (name === 'tools') return wrapToolsService(root, ctx);
  if (name === 'promptContext') return wrapPromptContextService(root, ctx);
  return service.bind(ctx);
}
