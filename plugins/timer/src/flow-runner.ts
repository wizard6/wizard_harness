import type {
  TimerAction,
  TimerFlowBranch,
  TimerFlowDef,
  TimerFlowStep,
  TimerRunState,
  TimerTraceWhen,
} from '@wizard-harness/contracts';
import { runTimerAction, type ActionDeps } from './actions.js';
import type { TraceStore } from './trace.js';

export interface FlowRunCtx {
  flowRunId: string;
  signal: AbortSignal;
  deps: ActionDeps;
  trace: TraceStore;
  delay: (ms: number) => Promise<void>;
}

function matches(when: TimerTraceWhen | undefined, state: TimerRunState): boolean {
  const w = when ?? 'always';
  if (w === 'always') return true;
  if (w === 'ok') return state === 'ok';
  if (w === 'error') return state === 'error';
  if (w === 'timeout') return state === 'timeout';
  if (w === 'cancelled') return state === 'cancelled';
  return false;
}

async function runActionNode(
  ctx: FlowRunCtx,
  traceId: string,
  action: TimerAction,
): Promise<TimerRunState> {
  const { trace, signal, deps, flowRunId } = ctx;
  if (signal.aborted) {
    trace.patch(traceId, { state: 'cancelled', endedAt: Date.now() });
    return 'cancelled';
  }
  trace.patch(traceId, { state: 'running', startedAt: Date.now() });
  try {
    const summary = await runTimerAction(action, signal, deps);
    trace.patch(traceId, { state: 'ok', endedAt: Date.now(), summary: summary.slice(0, 200) });
    return 'ok';
  } catch (err) {
    const msg = String(err);
    const state: TimerRunState = signal.aborted ? 'cancelled' : 'error';
    trace.patch(traceId, { state, endedAt: Date.now(), error: msg });
    return state;
  }
}

async function runSteps(
  ctx: FlowRunCtx,
  steps: readonly TimerFlowStep[],
  prefix: string,
): Promise<TimerRunState> {
  let last: TimerRunState = 'ok';
  for (let i = 0; i < steps.length; i += 1) {
    const s = steps[i]!;
    const key = `${prefix}-${s.id ?? i}`;
    const node = ctx.trace.findByKey(ctx.flowRunId, key);
    if (!node) continue;
    const delayMs = Math.max(0, Number(s.delayMs ?? 0));
    if (delayMs > 0) {
      ctx.trace.patch(node.id, { state: 'scheduled', scheduledAt: Date.now() + delayMs });
      await ctx.delay(delayMs);
    }
    last = await runActionNode(ctx, node.id, s.action);
    if (last !== 'ok' && last !== 'cancelled') return last;
    if (last === 'cancelled') return last;
  }
  return last;
}

async function runBranches(
  ctx: FlowRunCtx,
  branches: readonly TimerFlowBranch[],
  parentState: TimerRunState,
  prefix: string,
): Promise<TimerRunState> {
  let last: TimerRunState = parentState;
  let picked: string | undefined;
  for (let i = 0; i < branches.length; i += 1) {
    const b = branches[i]!;
    const key = `${prefix}-br-${i}-${b.when ?? 'always'}`;
    const branchNode = ctx.trace.findByKey(ctx.flowRunId, key);
    if (!branchNode) continue;
    if (!matches(b.when, parentState)) {
      if (branchNode.state === 'pending' || branchNode.state === 'scheduled') {
        ctx.trace.skipSubtree(ctx.flowRunId, branchNode.id);
      }
      continue;
    }
    if (picked) ctx.trace.skipSubtree(ctx.flowRunId, branchNode.id);
    else {
      picked = branchNode.id;
      ctx.trace.skipPendingSiblings(ctx.flowRunId, branchNode.parentId, branchNode.id);
      ctx.trace.patch(branchNode.id, { state: 'running', startedAt: Date.now() });
      let state: TimerRunState = 'ok';
      if (b.action) {
        const act = ctx.trace.findByKey(ctx.flowRunId, `${key}-act`);
        if (act) state = await runActionNode(ctx, act.id, b.action);
      }
      if (b.steps?.length) state = await runSteps(ctx, b.steps, `${key}-step`);
      if (b.branches?.length) state = await runBranches(ctx, b.branches, state, key);
      ctx.trace.patch(branchNode.id, { state: state === 'ok' ? 'ok' : state, endedAt: Date.now() });
      last = state;
    }
  }
  return last;
}

export async function runFlow(
  flow: TimerFlowDef,
  ctx: FlowRunCtx,
): Promise<{ state: TimerRunState; summary: string }> {
  if (flow.kind === 'chain') {
    const root = ctx.trace.findByKey(ctx.flowRunId, 'chain-root');
    if (root) ctx.trace.patch(root.id, { state: 'running', startedAt: Date.now() });
    const state = await runSteps(ctx, flow.steps ?? [], 'chain');
    if (root) ctx.trace.patch(root.id, { state: state === 'ok' ? 'ok' : state, endedAt: Date.now() });
    return { state, summary: `chain ${state}` };
  }
  const root = ctx.trace.findByKey(ctx.flowRunId, 'tree-root');
  if (root) ctx.trace.patch(root.id, { state: 'running', startedAt: Date.now() });
  let state: TimerRunState = 'ok';
  if (flow.action) {
    const act = ctx.trace.findByKey(ctx.flowRunId, 'tree-root-act');
    if (act) state = await runActionNode(ctx, act.id, flow.action);
  }
  if (flow.branches?.length) state = await runBranches(ctx, flow.branches, state, 'tree');
  if (root) ctx.trace.patch(root.id, { state: state === 'ok' ? 'ok' : state, endedAt: Date.now() });
  return { state, summary: `tree ${state}` };
}

/** 单 action 兼容为一步链条 */
export function actionAsFlow(action: TimerAction): TimerFlowDef {
  return { kind: 'chain', steps: [{ id: '0', label: '动作', action }] };
}
