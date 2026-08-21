import type { PluginContext } from '@wizard-harness/core';
import type {
  AgentLoopResult,
  AgentLoopRunOpts,
  AgentLoopService,
  AgentService,
  LlmService,
  LlmToolCall,
  SessionService,
  SystemPromptService,
  ToolsService,
} from '@wizard-harness/contracts';

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

function need<T>(v: T | undefined, name: string): T {
  if (v === undefined) throw new Error(`agent-loop 需要 ${name} 服务`);
  return v;
}

function intentsOf(text: string, toolCalls?: LlmToolCall[]): ToolIntent[] {
  if (toolCalls?.length) return toolCalls.map((c) => ({ id: c.id, name: c.name, args: c.args }));
  const one = parseToolCall(text);
  return one ? [one] : [];
}

export function createAgentLoop(ctx: PluginContext): AgentLoopService {
  const running = new Map<string, AbortController>();

  return {
    cancel(agentId: string) {
      const ac = running.get(agentId);
      if (!ac) return;
      ac.abort();
      ctx.emit({ action: 'agent-loop/cancel', target: agentId });
    },
    async run(opts: AgentLoopRunOpts = {}): Promise<AgentLoopResult> {
      const agents = need(ctx.agent ?? ctx.get<AgentService>('agent'), 'agent');
      const prompts = ctx.systemPrompt ?? ctx.get<SystemPromptService>('systemPrompt');
      const maxSteps = Math.max(1, opts.maxSteps ?? Number(ctx.config.maxSteps ?? 8));
      let id = opts.agentId?.trim();
      if (!id) id = agents.spawn({ title: 'agent-loop' }).id;
      const handle = agents.get(id);
      if (!handle) throw new Error(`agent 不存在：${id}`);
      const llm = need(handle.ctx.llm ?? handle.ctx.get<LlmService>('llm'), 'llm');
      const tools = need(handle.ctx.tools ?? handle.ctx.get<ToolsService>('tools'), 'tools');
      const session = handle.ctx.session ?? handle.ctx.get<SessionService>('session');
      const sessionId = handle.sessionId;
      if (opts.systemPrompt) prompts?.set(sessionId, opts.systemPrompt);
      prompts?.apply(sessionId);

      const ac = new AbortController();
      running.set(id, ac);
      const useTools = opts.useTools !== false;
      const listed = useTools
        ? tools.list().map((t) => ({ name: t.name, description: t.description }))
        : [];
      const keep = Number(ctx.config.compactKeep ?? 0);
      const maybeCompact = () => {
        if (keep > 0) session?.compact(sessionId, { keep });
      };

      ctx.emit({ action: 'agent-loop/start', target: id, payload: { sessionId, maxSteps, useTools } });
      try {
        let result = await llm.complete({
          sessionId,
          prompt: opts.prompt,
          tools: listed.length ? listed : undefined,
          signal: ac.signal,
        });
        let steps = 1;
        maybeCompact();
        ctx.emit({ action: 'agent-loop/step', target: id, payload: { steps, phase: 'complete' } });
        while (steps < maxSteps) {
          if (ac.signal.aborted) throw new Error('agent-loop 已取消');
          const intents = useTools ? intentsOf(result.text, result.toolCalls) : [];
          if (!intents.length) break;
          for (const intent of intents) {
            await tools.call(intent.name, intent.args, { sessionId, callId: intent.id });
            ctx.emit({
              action: 'agent-loop/step',
              target: id,
              payload: { steps, phase: 'tool', name: intent.name },
            });
          }
          result = await llm.complete({ sessionId, tools: listed, signal: ac.signal });
          steps += 1;
          maybeCompact();
          ctx.emit({ action: 'agent-loop/step', target: id, payload: { steps, phase: 'complete' } });
        }
        ctx.emit({ action: 'agent-loop/end', target: id, payload: { steps } });
        return { agentId: id, sessionId, text: result.text, steps, provider: result.provider };
      } finally {
        running.delete(id);
      }
    },
  };
}
