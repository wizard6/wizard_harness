import type { PluginContext } from '@wizard-harness/core';
import type {
  AgentLoopResult,
  AgentLoopRunOpts,
  AgentLoopService,
  AgentService,
  LlmService,
  ToolsService,
} from '@wizard-harness/contracts';

export interface ToolIntent {
  name: string;
  args: Record<string, unknown>;
}

/** 去掉 mock 前缀，便于从 [mock] echo hi 里解析协议 */
function stripMock(text: string): string {
  return text.replace(/^\[mock\]\s+/i, '').trim();
}

/**
 * 薄切片工具协议（不是 OpenAI tool_call）：
 * - `echo <text>` → tools.call('echo', { input })
 * - `tool <name> {json}` → tools.call(name, json)
 */
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

function need<T>(v: T | undefined, name: string): T {
  if (v === undefined) throw new Error(`agent-loop 需要 ${name} 服务`);
  return v;
}

export function createAgentLoop(ctx: PluginContext): AgentLoopService {
  return {
    async run(opts: AgentLoopRunOpts = {}): Promise<AgentLoopResult> {
      const agents = need(ctx.agent ?? ctx.get<AgentService>('agent'), 'agent');
      const maxSteps = Math.max(1, opts.maxSteps ?? Number(ctx.config.maxSteps ?? 8));
      let id = opts.agentId?.trim();
      if (!id) {
        id = agents.spawn({
          title: 'agent-loop',
          systemPrompt: opts.systemPrompt,
        }).id;
      } else if (opts.systemPrompt) {
        agents.setSystemPrompt(id, opts.systemPrompt);
      }
      const handle = agents.get(id);
      if (!handle) throw new Error(`agent 不存在：${id}`);
      const llm = need(handle.ctx.llm ?? handle.ctx.get<LlmService>('llm'), 'llm');
      const tools = need(handle.ctx.tools ?? handle.ctx.get<ToolsService>('tools'), 'tools');
      const sessionId = handle.sessionId;

      ctx.emit({ action: 'agent-loop/start', target: id, payload: { sessionId, maxSteps } });
      let text = (await llm.complete({ sessionId, prompt: opts.prompt })).text;
      let steps = 1;
      ctx.emit({ action: 'agent-loop/step', target: id, payload: { steps, phase: 'complete' } });
      while (steps < maxSteps) {
        const intent = parseToolCall(text);
        if (!intent) break;
        await tools.call(intent.name, intent.args, { sessionId });
        ctx.emit({
          action: 'agent-loop/step',
          target: id,
          payload: { steps, phase: 'tool', name: intent.name },
        });
        text = (await llm.complete({ sessionId })).text;
        steps += 1;
        ctx.emit({ action: 'agent-loop/step', target: id, payload: { steps, phase: 'complete' } });
      }
      ctx.emit({ action: 'agent-loop/end', target: id, payload: { steps } });
      return { agentId: id, sessionId, text, steps };
    },
  };
}
