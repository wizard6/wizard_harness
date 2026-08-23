import type { PluginContext, ScopeKey } from '@wizard-harness/core';
import type {
  LlmCompleteResult,
  LlmService,
  LlmToolSpec,
  PromptAssembly,
  PromptContextService,
  SessionService,
  ToolsService,
  Trajectory,
} from '@wizard-harness/contracts';
import type { ToolIntent } from './intents.js';

export interface ObserveResult {
  listed: readonly LlmToolSpec[];
  assembly?: PromptAssembly;
  messageCount: number;
}

export interface OtaDeps {
  ctx: PluginContext;
  agentId: string;
  sessionId: string;
  scope: ScopeKey | undefined;
  llm: LlmService;
  tools: ToolsService;
  session: SessionService | undefined;
  prompts: PromptContextService | undefined;
  useTools: boolean;
  signal: AbortSignal;
  trace: Trajectory | undefined;
}


/** Observe：组装上下文，把 session 当前可见状态投影给下一轮 Think。 */
export function observe(
  deps: OtaDeps,
  cycle: number,
): ObserveResult {
  const { ctx, sessionId, scope, useTools, tools, prompts, trace, agentId } = deps;
  let listed: readonly LlmToolSpec[] = [];
  let assembly: PromptAssembly | undefined;
  if (prompts) {
    assembly = prompts.assemble({ sessionId, scope });
    prompts.apply(sessionId, assembly);
    listed = useTools ? (assembly.tools.length ? assembly.tools : tools.list()) : [];
  } else {
    listed = useTools ? tools.list() : [];
  }
  const messageCount = deps.session?.get(sessionId)?.replay().length ?? 0;
  ctx.emit({
    action: 'agent-loop/observe',
    target: agentId,
    payload: { cycle, messageCount, tools: listed.length },
  });
  trace?.append('prompt', {
    phase: 'observe',
    cycle,
    tools: listed.map((t) => t.name),
    systemBytes: assembly?.systemText.length ?? 0,
  });
  return { listed, assembly, messageCount };
}

/** Think：模型根据观察结果推理，产出最终答复或待执行意图。 */
export async function think(
  deps: OtaDeps,
  cycle: number,
  listed: readonly LlmToolSpec[],
  userPrompt?: string,
): Promise<LlmCompleteResult> {
  if (deps.signal.aborted) throw new Error('agent-loop 已取消');
  const result = await deps.llm.complete({
    sessionId: deps.sessionId,
    prompt: userPrompt,
    tools: listed.length ? listed : undefined,
    signal: deps.signal,
  });
  deps.ctx.emit({
    action: 'agent-loop/think',
    target: deps.agentId,
    payload: { cycle, provider: result.provider, toolCalls: result.toolCalls?.length ?? 0 },
  });
  return result;
}

/** Act：执行 Think 拆出的意图（工具调用等），结果写回 session 供下轮 Observe。 */
export async function act(deps: OtaDeps, cycle: number, intents: readonly ToolIntent[]): Promise<void> {
  const { ctx, agentId, sessionId, tools, trace } = deps;
  for (const intent of intents) {
    const out = await tools.call(intent.name, intent.args, { sessionId, callId: intent.id });
    ctx.emit({
      action: 'agent-loop/act',
      target: agentId,
      payload: { cycle, name: intent.name, ok: out.ok },
    });
    trace?.append('tool', { cycle, name: intent.name, ok: out.ok, content: out.content });
  }
}
