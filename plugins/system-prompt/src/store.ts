import type { PluginContext } from '@wizard-harness/core';
import type { SessionService, SystemPromptService } from '@wizard-harness/contracts';

interface Row {
  content: string;
  applied?: string;
}

function sessionOf(ctx: PluginContext): SessionService {
  const s = ctx.session ?? ctx.get<SessionService>('session');
  if (!s) throw new Error('system-prompt 需要 session 服务');
  return s;
}

/** 按 session 登记当前 System Prompt；apply 才写入日志。 */
export function createSystemPromptStore(ctx: PluginContext): SystemPromptService {
  const rows = new Map<string, Row>();

  return {
    set(sessionId, content) {
      if (typeof content !== 'string') throw new Error('systemPrompt 必须是字符串');
      if (!sessionOf(ctx).get(sessionId)) throw new Error(`session 不存在：${sessionId}`);
      rows.set(sessionId, { content, applied: rows.get(sessionId)?.applied });
      ctx.emit({ action: 'system-prompt/set', target: sessionId, payload: { bytes: content.length } });
    },
    get(sessionId) {
      return rows.get(sessionId)?.content;
    },
    apply(sessionId) {
      const row = rows.get(sessionId);
      if (!row) return;
      if (row.applied === row.content) return;
      const sess = sessionOf(ctx).get(sessionId);
      if (!sess) throw new Error(`session 不存在：${sessionId}`);
      sess.append('message', { role: 'system', content: row.content });
      row.applied = row.content;
      ctx.emit({ action: 'system-prompt/apply', target: sessionId, payload: { bytes: row.content.length } });
    },
  };
}
