import type {
  WorkflowGraph,
  WorkflowNodeContext,
  WorkflowNodeHandler,
  WorkflowNodeRecord,
  WorkflowRun,
} from '@wizard-harness/contracts';
import { mergeParams, resolveWires } from './wires.js';

export interface ScheduleHooks {
  onNode(record: WorkflowNodeRecord): void;
}

/**
 * 固定调度（顺序）。只负责：接线 → 找 handler → 记录。
 * 不认识具体 kind；分支 / 并行以后只改本文件。
 */
export async function scheduleLinear(
  graph: WorkflowGraph,
  input: Readonly<Record<string, unknown>>,
  handlers: ReadonlyMap<string, WorkflowNodeHandler>,
  ctx: WorkflowNodeContext,
  hooks: ScheduleHooks,
): Promise<'ok' | 'error' | 'cancelled'> {
  const done: Record<string, WorkflowNodeRecord> = {};
  const seen = new Set<string>();

  for (const node of graph.nodes) {
    if (ctx.signal?.aborted) return 'cancelled';
    const id = node.id?.trim();
    if (!id) throw new Error('节点缺少 id');
    if (seen.has(id)) throw new Error(`重复节点 id：${id}`);
    seen.add(id);

    const handler = handlers.get(node.kind);
    if (!handler) throw new Error(`未知节点种类：${node.kind}（节点 ${id}）`);

    let inputs: Record<string, unknown> = {};
    let outputs: Record<string, unknown> = {};
    let ok = true;
    let error: string | undefined;
    try {
      inputs = mergeParams(node, resolveWires(node.in, input, done));
      outputs = await handler.execute(node, inputs, ctx);
    } catch (err) {
      ok = false;
      error = String(err);
    }
    const rec: WorkflowNodeRecord = { nodeId: id, kind: node.kind, inputs, outputs, ok, error };
    done[id] = rec;
    hooks.onNode(rec);
    if (!ok) return 'error';
  }
  return 'ok';
}

export function emptyRun(id: string, graphId?: string): WorkflowRun {
  return { id, graphId, status: 'running', nodes: [] };
}
