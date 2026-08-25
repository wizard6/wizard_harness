import type { TimerFlowBranch, TimerFlowDef, TimerFlowStep, TimerTraceNode } from '@wizard-harness/contracts';

let seq = 0;

function nid(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

interface PlanCtx {
  flowRunId: string;
  nodes: TimerTraceNode[];
  parentId?: string;
  path: string;
}

function pushNode(ctx: PlanCtx, nodeKey: string, label: string, parentId?: string): string {
  const id = nid('tn');
  const row: TimerTraceNode = {
    id,
    flowRunId: ctx.flowRunId,
    nodeKey,
    label,
    state: 'pending',
    parentId,
    childIds: [],
  };
  ctx.nodes.push(row);
  if (parentId) {
    const p = ctx.nodes.find((n) => n.id === parentId);
    if (p) {
      const kids = [...p.childIds, id];
      ctx.nodes[ctx.nodes.indexOf(p)] = { ...p, childIds: kids };
    }
  }
  return id;
}

function planSteps(ctx: PlanCtx, steps: readonly TimerFlowStep[], parentId?: string, prefix = 'step'): string | undefined {
  let lastId: string | undefined;
  for (let i = 0; i < steps.length; i += 1) {
    const s = steps[i]!;
    const key = `${prefix}-${s.id ?? i}`;
    const label = s.label ?? `${prefix} ${i + 1}`;
    const id = pushNode(ctx, key, label, parentId);
    lastId = id;
  }
  return lastId;
}

function planBranches(
  ctx: PlanCtx,
  branches: readonly TimerFlowBranch[],
  parentId: string,
  prefix: string,
): void {
  for (let i = 0; i < branches.length; i += 1) {
    const b = branches[i]!;
    const when = b.when ?? 'always';
    const key = `${prefix}-br-${i}-${when}`;
    const label = b.label ?? `分支 ${when}`;
    const branchId = pushNode(ctx, key, label, parentId);
    if (b.action) {
      pushNode(ctx, `${key}-act`, `${label} · 动作`, branchId);
    }
    if (b.steps?.length) planSteps(ctx, b.steps, branchId, `${key}-step`);
    if (b.branches?.length) planBranches(ctx, b.branches, branchId, key);
  }
}

/** 从 flow 定义物化整棵待执行追踪树（pending） */
export function materializeFlowPlan(flowRunId: string, flow: TimerFlowDef): TimerTraceNode[] {
  seq = 0;
  const ctx: PlanCtx = { flowRunId, nodes: [], path: 'root' };
  if (flow.kind === 'chain') {
    const rootId = pushNode(ctx, 'chain-root', flow.rootLabel ?? '事件链条');
    planSteps(ctx, flow.steps ?? [], rootId, 'chain');
    return ctx.nodes;
  }
  const rootId = pushNode(ctx, 'tree-root', flow.rootLabel ?? '根节点');
  if (flow.action) pushNode(ctx, 'tree-root-act', '根动作', rootId);
  if (flow.branches?.length) planBranches(ctx, flow.branches, rootId, 'tree');
  return ctx.nodes;
}
