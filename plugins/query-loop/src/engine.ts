import type { PluginContext } from '@wizard-harness/core';
import { scopeOf } from '@wizard-harness/core';
import type {
  AgentLoopResult,
  AgentLoopRunOpts,
  AgentService,
  LlmService,
  PromptContextService,
  QueryHook,
  QueryHookContext,
  QueryLoopService,
  QueryToolIntent,
  SessionService,
  ToolsService,
  TrajectoryService,
} from '@wizard-harness/contracts';
import { createHookRegistry } from './hooks.js';
import { intentsFromModel } from './intents.js';

function need<T>(v: T | undefined, name: string): T {
  if (v === undefined) throw new Error(`query-loop 需要 ${name} 服务`);
  return v;
}

/**
 * Query 循环（公开架构，不是泄露源码移植）：
 *
 *   while 未达上限:
 *     1. assemble  — prompt-context 投影当前 session
 *     2. model     — llm.complete（可带 tools）
 *     3. 若无 tool_use → end_turn，退出
 *     4. 逐个执行工具，结果写回 session
 *     5. 回到 1
 *
 * 各阶段可挂 hook：continue / skip-tools / stop。
 */
export function createQueryLoop(ctx: PluginContext): QueryLoopService {
  const running = new Map<string, AbortController>();
  const hooks = createHookRegistry();

  return {
    use(hook: QueryHook) {
      return hooks.use(hook);
    },
    inspect() {
      return {
        paradigm: 'query' as const,
        hooks: hooks.list(),
        maxSteps: Math.max(1, Number(ctx.config.maxSteps ?? 12)),
      };
    },
    cancel(agentId: string) {
      const ac = running.get(agentId);
      if (!ac) return;
      ac.abort();
      ctx.emit({ action: 'query-loop/cancel', target: agentId });
      ctx.emit({ action: 'agent-loop/cancel', target: agentId });
    },
    async run(opts: AgentLoopRunOpts = {}): Promise<AgentLoopResult> {
      const agents = need(ctx.agent ?? ctx.get<AgentService>('agent'), 'agent');
      const prompts = need(ctx.promptContext ?? ctx.get<PromptContextService>('promptContext'), 'promptContext');
      const traj = ctx.trajectory ?? ctx.get<TrajectoryService>('trajectory');
      const maxSteps = Math.max(1, opts.maxSteps ?? Number(ctx.config.maxSteps ?? 12));
      let id = opts.agentId?.trim();
      if (!id) id = agents.spawn({ title: 'query-loop', workspace: opts.workspace }).id;
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
      trace?.append('run-start', { maxSteps, useTools, paradigm: 'query' });

      const ac = new AbortController();
      running.set(id, ac);
      const keep = Number(ctx.config.compactKeep ?? 0);
      const maybeCompact = () => {
        if (keep > 0) session?.compact(sessionId, { keep });
      };

      ctx.emit({
        action: 'query-loop/start',
        target: id,
        payload: { sessionId, maxSteps, useTools, paradigm: 'query' },
      });
      ctx.emit({
        action: 'agent-loop/start',
        target: id,
        payload: { sessionId, maxSteps, useTools, paradigm: 'query' },
      });

      let turns = 0;
      let text = '';
      let provider: string | undefined;
      let doneReason: 'end-turn' | 'max-turns' | 'hook-stop' = 'end-turn';

      const hookCtx = (turn: number, extra?: Partial<QueryHookContext>): QueryHookContext => ({
        stage: extra?.stage ?? 'before-turn',
        turn,
        maxTurns: maxSteps,
        agentId: id,
        sessionId,
        signal: ac.signal,
        text,
        intents: extra?.intents ?? [],
        ...extra,
      });

      try {
        for (let turn = 1; turn <= maxSteps; turn += 1) {
          if (ac.signal.aborted) throw new Error('query-loop 已取消');
          turns = turn;

          const before = await hooks.run('before-turn', hookCtx(turn));
          if (before.action === 'stop') {
            doneReason = 'hook-stop';
            break;
          }

          const assembly = prompts.assemble({ sessionId, scope });
          prompts.apply(sessionId, assembly);
          const listed = useTools ? assembly.tools : [];
          ctx.emit({
            action: 'agent-loop/observe',
            target: id,
            payload: { cycle: turn, messageCount: session?.get(sessionId)?.replay().length ?? 0, tools: listed.length },
          });
          ctx.emit({
            action: 'query-loop/stage',
            target: id,
            payload: { stage: 'assemble', turn, tools: listed.length },
          });
          trace?.append('prompt', {
            phase: 'assemble',
            cycle: turn,
            tools: listed.map((t) => t.name),
            systemBytes: assembly.systemText.length,
          });
          const assembled = await hooks.run('assemble', hookCtx(turn));
          if (assembled.action === 'stop') {
            doneReason = 'hook-stop';
            break;
          }

          if (ac.signal.aborted) throw new Error('query-loop 已取消');
          const result = await llm.complete({
            sessionId,
            prompt: turn === 1 ? opts.prompt : undefined,
            tools: listed.length ? listed : undefined,
            signal: ac.signal,
            onDelta: opts.onDelta,
          });
          text = result.text;
          provider = result.provider;
          maybeCompact();
          ctx.emit({
            action: 'agent-loop/think',
            target: id,
            payload: { cycle: turn, provider: result.provider, toolCalls: result.toolCalls?.length ?? 0 },
          });
          ctx.emit({
            action: 'query-loop/stage',
            target: id,
            payload: { stage: 'model', turn, provider: result.provider },
          });

          let intents: QueryToolIntent[] = intentsFromModel(result.text, result.toolCalls, useTools);
          const modelHook = hookCtx(turn, { stage: 'after-model', text, intents });
          const afterModel = await hooks.run('after-model', modelHook);
          intents = modelHook.intents;
          if (afterModel.action === 'stop') {
            doneReason = 'hook-stop';
            break;
          }
          if (afterModel.action === 'skip-tools' || before.action === 'skip-tools') intents = [];

          if (!intents.length) {
            doneReason = 'end-turn';
            ctx.emit({
              action: 'agent-loop/done',
              target: id,
              payload: { cycle: turn, reason: 'no-intents', steps: turns },
            });
            break;
          }

          for (const intent of intents) {
            const gate = await hooks.run('before-tool', hookCtx(turn, { stage: 'before-tool', text, intents: [intent] }));
            if (gate.action === 'stop') {
              doneReason = 'hook-stop';
              intents = [];
              break;
            }
            if (gate.action === 'skip-tools') continue;
            const out = await tools.call(intent.name, intent.args, { sessionId, callId: intent.id });
            ctx.emit({
              action: 'agent-loop/act',
              target: id,
              payload: { cycle: turn, name: intent.name, ok: out.ok },
            });
            trace?.append('tool', { cycle: turn, name: intent.name, ok: out.ok, content: out.content });
            await hooks.run('after-tool', hookCtx(turn, { stage: 'after-tool', text, intents: [intent] }));
          }

          maybeCompact();
          const afterTurn = await hooks.run('after-turn', hookCtx(turn, { stage: 'after-turn', text, intents }));
          if (afterTurn.action === 'stop') {
            doneReason = 'hook-stop';
            break;
          }

          if (turn >= maxSteps) {
            doneReason = 'max-turns';
            ctx.emit({
              action: 'agent-loop/done',
              target: id,
              payload: { cycle: turn, reason: 'max-cycles', steps: turns },
            });
            break;
          }
        }

        if (turns < 1) throw new Error('query-loop 未产生模型输出');

        ctx.emit({ action: 'agent-loop/end', target: id, payload: { steps: turns, reason: doneReason } });
        ctx.emit({ action: 'query-loop/end', target: id, payload: { steps: turns, reason: doneReason } });
        trace?.append('run-end', { steps: turns, text, provider, reason: doneReason });
        return {
          agentId: id,
          sessionId,
          text,
          steps: turns,
          provider,
          workspace: session?.get(sessionId)?.workspace,
        };
      } catch (err) {
        trace?.append('run-end', { error: String(err), steps: turns });
        throw err;
      } finally {
        running.delete(id);
      }
    },
  };
}
