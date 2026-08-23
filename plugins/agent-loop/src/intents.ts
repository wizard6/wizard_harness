import type { LlmToolCall } from '@wizard-harness/contracts';

export interface ToolIntent {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

function stripMock(text: string): string {
  return text.replace(/^\[mock\]\s+/i, '').trim();
}

/** 文本协议回退：`echo <text>` / `tool <name> {json}` */
export function parseToolCall(text: string): ToolIntent | undefined {
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

/** 从 Think 阶段产出解析待执行意图；无则模型认为本轮任务可结束。 */
export function intentsFromThink(
  text: string,
  toolCalls: LlmToolCall[] | undefined,
  useTools: boolean,
): ToolIntent[] {
  if (!useTools) return [];
  if (toolCalls?.length) return toolCalls.map((c) => ({ id: c.id, name: c.name, args: c.args }));
  const one = parseToolCall(text);
  return one ? [one] : [];
}

export function isTaskDone(intents: readonly ToolIntent[]): boolean {
  return intents.length === 0;
}
