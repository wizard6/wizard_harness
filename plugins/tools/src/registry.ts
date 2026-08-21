import { randomUUID } from 'node:crypto';
import type { SessionService, ToolSpec, ToolsService } from '@wizard-harness/contracts';

function asContent(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function createToolRegistry(
  sessionOf: () => SessionService,
  emit: (action: string, target: string, payload: unknown) => void,
): ToolsService {
  const tools = new Map<string, ToolSpec>();

  return {
    register(spec) {
      const name = spec.name?.trim();
      if (!name) throw new Error('tools.register 需要 name');
      if (typeof spec.handler !== 'function') throw new Error(`tools.register 需要 handler（${name}）`);
      if (tools.has(name)) throw new Error(`工具已注册：${name}`);
      tools.set(name, { name, description: spec.description, handler: spec.handler });
      emit('tools/register', name, { description: spec.description });
    },
    list() {
      return [...tools.values()].map(({ name, description }) => ({ name, description }));
    },
    async call(name, args = {}, opts = {}) {
      const spec = tools.get(name);
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
        content = asContent(await spec.handler(args));
      } catch (err) {
        ok = false;
        content = String(err);
      }
      sess.append('tool-result', { callId, name, content, ok });
      emit('tools/result', name, { callId, sessionId: sess.id, ok });
      return { callId, name, content, ok, sessionId: sess.id };
    },
  };
}
