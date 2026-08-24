import type { PluginContext } from '@wizard-harness/core';
import { NamedEntries, ScopedLayers, scopeOf } from '@wizard-harness/core';
import type { ScopeKey } from '@wizard-harness/core';
import { randomUUID } from 'node:crypto';
import type { SessionService, ToolInfo, ToolSpec, ToolsService, ToolsView } from '@wizard-harness/contracts';
import type { ScopeRef } from '@wizard-harness/contracts';

function asContent(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

interface ToolLayer {
  tools: NamedEntries<ToolSpec>;
  isEmpty(): boolean;
}

function createLayer(): ToolLayer {
  const tools = new NamedEntries<ToolSpec>((name) => new Error(`工具已注册：${name}`));
  return { tools, isEmpty: () => tools.isEmpty() };
}

function asScopeKey(scope: ScopeRef | undefined): ScopeKey | undefined {
  return scope as ScopeKey | undefined;
}

export function createToolRegistry(
  hostCtx: PluginContext,
  sessionOf: () => SessionService,
  emit: (action: string, target: string, payload: unknown) => void,
  record?: (sessionId: string, data: Record<string, unknown>) => void,
): ToolsService {
  const layers = new ScopedLayers(createLayer, () => {});

  function merged(scope: ScopeKey | undefined): Map<string, ToolSpec> {
    return layers.merge(scope, (layer) => layer.tools);
  }

  function listIn(scope?: ScopeRef): ToolInfo[] {
    return [...merged(asScopeKey(scope)).values()].map(({ name, description }) => ({ name, description }));
  }

  function registerIn(owner: PluginContext, spec: ToolSpec) {
    const name = spec.name?.trim();
    if (!name) throw new Error('tools.register 需要 name');
    if (typeof spec.handler !== 'function') throw new Error(`tools.register 需要 handler（${name}）`);
    layers.effect(owner, (layer) => layer.tools.insert(name, spec), { label: name });
    emit('tools/register', name, { description: spec.description });
  }

  async function callIn(
    scope: ScopeKey | undefined,
    name: string,
    args: Record<string, unknown> = {},
    opts: { sessionId?: string; callId?: string } = {},
  ) {
    const spec = merged(scope).get(name);
    if (!spec) throw new Error(`未知工具：${name}`);
    const sessions = sessionOf();
    const sess = opts.sessionId
      ? sessions.get(opts.sessionId)
      : (sessions.current() ?? sessions.start({ title: 'tools' }));
    if (!sess) throw new Error(`session 不存在：${opts.sessionId}`);
    const callId = opts.callId?.trim() || randomUUID();
    emit('tools/call', name, { callId, sessionId: sess.id });
    let ok = true;
    let content: string;
    try {
      content = asContent(await spec.handler(args, { sessionId: sess.id, callId }));
    } catch (err) {
      ok = false;
      content = String(err);
    }
    sess.append('tool-result', { callId, name, content, ok });
    emit('tools/result', name, { callId, sessionId: sess.id, ok });
    record?.(sess.id, { name, args, callId, ok, content });
    return { callId, name, content, ok, sessionId: sess.id };
  }

  function bind(owner: PluginContext): ToolsView {
    const scope = scopeOf(owner);
    return {
      register(spec) {
        registerIn(owner, spec);
      },
      list() {
        return listIn(scope);
      },
      call(name, args, opts) {
        return callIn(scope, name, args, opts);
      },
    };
  }

  const globalView = bind(hostCtx);

  return {
    register(spec) {
      globalView.register(spec);
    },
    list() {
      return globalView.list();
    },
    call(name, args, opts) {
      return globalView.call(name, args, opts);
    },
    bind,
    listIn,
  };
}
