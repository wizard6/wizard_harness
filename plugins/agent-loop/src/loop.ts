import type { PluginContext } from '@wizard-harness/core';
import { scopeOf } from '@wizard-harness/core';
import type {
  AgentLoopResult,
  AgentLoopRunOpts,
  AgentLoopService,
  AgentService,
  LlmService,
  PromptContextService,
  SessionService,
  ToolsService,
  TrajectoryService,
} from '@wizard-harness/contracts';
import { intentsFromThink, isTaskDone, parseToolCall } from './intents.js';
import { act, observe, think } from './ota.js';

export { parseToolCall } from './intents.js';

function need<T>(v: T | undefined, name: string): T {
  if (v === undefined) throw new Error(`agent-loop 需要 ${name} 服务`);
  return v;
}

/**
 * Observe → Think → Act 循环：
 * - 每轮先观察（组装上下文），再思考（complete），若有意图则行动（tools），直到模型不再提出意图或达到上限。
 */
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
      const prompts = need(ctx.promptContext ?? ctx.get<PromptContextService>('promptContext'), 'promptContext');
      const traj = ctx.trajectory ?? ctx.get<TrajectoryService>('trajectory');
      const maxSteps = Math.max(1, opts.maxSteps ?? Number(ctx.config.maxSteps ?? 12));
      let id = opts.agentId?.trim();
      if (!id) id = agents.spawn({ title: 'agent-loop' }).id;
      const handle = agents.get(id);
      if (!handle) throw new Error(`agent 不存在：${id}`);
      const llm = need(handle.ctx.llm ?? handle.ctx.get<LlmService>('llm'), 'llm');
      const toolsRoot = need(handle.ctx.tools ?? handle.ctx.get<ToolsService>('tools'), 'tools');
      const tools = toolsRoot.bind(handle.ctx);
      const session = handle.ctx.session ?? handle.ctx.get<SessionService>('session');
      const sessionId = handle.sessionId;
      const scope = scopeOf(handle.ctx);
      const useTools = opts.useTools !== false;

      const trace = traj?.start({ agentId: id, sessionId });
      trace?.append('run-start', { maxSteps, useTools, paradigm: 'ota' });

      const ac = new AbortController();
      running.set(id, ac);
      const keep = Number(ctx.config.compactKeep ?? 0);
      const maybeCompact = () => {
        if (keep > 0) session?.compact(sessionId, { keep });
      };

      const deps = {
        ctx,
        agentId: id,
        sessionId,
        scope,
        llm,
        tools,
        session,
        prompts,
        useTools,
        signal: ac.signal,
        trace,
        onDelta: opts.onDelta,
      };

      ctx.emit({
        action: 'agent-loop/start',
        target: id,
        payload: { sessionId, maxSteps, useTools, paradigm: 'observe-think-act' },
      });

      let cycles = 0;
      let result;
      let doneReason: 'no-intents' | 'max-cycles' = 'no-intents';

      try {
        for (let cycle = 1; cycle <= maxSteps; cycle += 1) {
          if (ac.signal.aborted) throw new Error('agent-loop 已取消');

          const { listed } = observe(deps, cycle);
          result = await think(deps, cycle, listed, cycle === 1 ? opts.prompt : undefined);
          cycles = cycle;
          maybeCompact();

          const intents = intentsFromThink(result.text, result.toolCalls, useTools);
          if (isTaskDone(intents)) {
            doneReason = 'no-intents';
            ctx.emit({
              action: 'agent-loop/done',
              target: id,
              payload: { cycle, reason: doneReason, steps: cycles },
            });
            break;
          }

          await act(deps, cycle, intents);
          maybeCompact();

          if (cycle >= maxSteps) {
            doneReason = 'max-cycles';
            ctx.emit({
              action: 'agent-loop/done',
              target: id,
              payload: { cycle, reason: doneReason, steps: cycles },
            });
            break;
          }
        }

        if (!result) throw new Error('agent-loop 未产生模型输出');

        ctx.emit({ action: 'agent-loop/end', target: id, payload: { steps: cycles, reason: doneReason } });
        trace?.append('run-end', { steps: cycles, text: result.text, provider: result.provider, reason: doneReason });
        return { agentId: id, sessionId, text: result.text, steps: cycles, provider: result.provider };
      } catch (err) {
        trace?.append('run-end', { error: String(err), steps: cycles });
        throw err;
      } finally {
        running.delete(id);
      }
    },
  };
}
