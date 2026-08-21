import { randomUUID } from 'node:crypto';
import { createScope } from '@wizard-harness/core';
import type { PluginContext, Scope } from '@wizard-harness/core';
import type {
  AgentHandle,
  AgentInfo,
  AgentService,
  AgentSpawnOpts,
  SessionService,
} from '@wizard-harness/contracts';

export const AGENT_LIVE = 'agent.live';

interface Live {
  id: string;
  sessionId: string;
  scope: Scope;
  systemPrompt?: string;
}

function sessionOf(ctx: PluginContext): SessionService {
  const s = ctx.session ?? ctx.get<SessionService>('session');
  if (!s) throw new Error('agent 需要 session 服务');
  return s;
}

function asHandle(row: Live): AgentHandle {
  return {
    id: row.id,
    sessionId: row.sessionId,
    ctx: row.scope.ctx,
    systemPrompt: row.systemPrompt,
  };
}

function writeSystemPrompt(ctx: PluginContext, row: Live, content: string): void {
  if (typeof content !== 'string') throw new Error('systemPrompt 必须是字符串');
  const sess = sessionOf(ctx).get(row.sessionId);
  if (!sess) throw new Error(`session 不存在：${row.sessionId}`);
  sess.append('message', { role: 'system', content });
  row.systemPrompt = content;
  ctx.emit({ action: 'agent/prompt', target: row.id, payload: { bytes: content.length } });
}

/** live agent 登记表：spawn 开 scope 并绑 session；stop 撕 overlay。不调 llm / tools。 */
export function createAgentHost(ctx: PluginContext): AgentService {
  const live = new Map<string, Live>();

  return {
    spawn(opts: AgentSpawnOpts = {}) {
      const id = opts.id?.trim() || randomUUID();
      if (live.has(id)) throw new Error(`agent 已存在：${id}`);
      const sessions = sessionOf(ctx);
      const sess = opts.sessionId
        ? sessions.get(opts.sessionId)
        : sessions.start({ title: opts.title ?? `agent:${id}` });
      if (!sess) throw new Error(`session 不存在：${opts.sessionId}`);
      const scope = createScope(ctx, { agent: id });
      scope.ctx.provide(AGENT_LIVE, { id, sessionId: sess.id });
      const row: Live = { id, sessionId: sess.id, scope };
      live.set(id, row);
      if (opts.systemPrompt) writeSystemPrompt(ctx, row, opts.systemPrompt);
      ctx.emit({ action: 'agent/spawn', target: id, payload: { sessionId: sess.id } });
      return asHandle(row);
    },
    get(id) {
      const row = live.get(id);
      return row ? asHandle(row) : undefined;
    },
    list(): readonly AgentInfo[] {
      return [...live.values()].map(({ id, sessionId }) => ({ id, sessionId }));
    },
    setSystemPrompt(id, content) {
      const row = live.get(id);
      if (!row) throw new Error(`agent 不存在：${id}`);
      writeSystemPrompt(ctx, row, content);
    },
    async stop(id) {
      const row = live.get(id);
      if (!row) throw new Error(`agent 不存在：${id}`);
      live.delete(id);
      await row.scope.dispose();
      ctx.emit({ action: 'agent/stop', target: id, payload: { sessionId: row.sessionId } });
    },
  };
}
