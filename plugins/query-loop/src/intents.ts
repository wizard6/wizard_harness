import type { LlmToolCall, QueryToolIntent } from '@wizard-harness/contracts';

function stripMock(text: string): string {
  return text.replace(/^\[mock\]\s+/i, '').trim();
}

/** 文本协议回退：`echo <text>` / `tool <name> {json}`（与旧 agent-loop 对齐，方便切换） */
export function parseToolCall(text: string): QueryToolIntent | undefined {
  const body = stripMock(text.trim());
  const named = /^tool\s+([A-Za-z0-9_-]+)\s+(\{[\s\S]*\})\s*$/.exec(body);
  if (named) {
    try {
      const args = JSON.parse(named[2]!) as unknown;
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        return { name: named[1]!, args: args as Record<string, unknown> };
      }
    } catch {
      return undefined;
    }
  }
  const echo = /^echo\s+([\s\S]+)$/i.exec(body);
  if (echo) return { name: 'echo', args: { input: echo[1]!.trimEnd() } };
  return undefined;
}

export function intentsFromModel(
  text: string,
  toolCalls: LlmToolCall[] | undefined,
  useTools: boolean,
): QueryToolIntent[] {
  if (!useTools) return [];
  if (toolCalls?.length) return toolCalls.map((c) => ({ id: c.id, name: c.name, args: c.args }));
  const one = parseToolCall(text);
  return one ? [one] : [];
}
