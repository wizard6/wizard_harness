import { randomUUID } from 'node:crypto';
import type {
  AgentLoopService,
  AgentService,
  ToolsService,
  TrajectoryService,
  WorkflowExecOpts,
  WorkflowListedKind,
  WorkflowNode,
  WorkflowNodeContext,
  WorkflowNodeHandler,
  WorkflowNodeRecord,
  WorkflowRun,
  WorkflowRunOpts,
  WorkflowService,
} from '@wizard-harness/contracts';
import { workflowToolName } from '@wizard-harness/contracts';
import { emptyRun, scheduleLinear } from './schedule.js';

export interface WorkflowHostDeps {
  tools?: ToolsService;
  trajectory?: TrajectoryService;
  agent?: AgentService;
  agentLoop?: AgentLoopService;
  emit: (action: string, target: string, payload?: unknown) => void;
}

function listed(h: WorkflowNodeHandler): WorkflowListedKind {
  return {
    kind: h.kind,
    ports: h.ports,
    asTool: h.asTool
      ? {
          name: h.asTool.name?.trim() || workflowToolName(h.kind),
          description: h.asTool.description,
        }
      : undefined,
  };
}

export function createWorkflowHost(deps: WorkflowHostDeps): WorkflowService {
  const handlers = new Map<string, WorkflowNodeHandler>();
  const runs = new Map<string, WorkflowRun>();
  const abort = new Map<string, AbortController>();
  let current: string | undefined;

  const nodeCtx = (signal?: AbortSignal): WorkflowNodeContext => ({
    tools: deps.tools,
    agent: deps.agent,
    agentLoop: deps.agentLoop,
    signal,
  });

  return {
    registerNode(h) {
      const kind = h.kind?.trim();
      if (!kind) throw new Error('handler 需要 kind');
      if (handlers.has(kind)) throw new Error(`节点种类已登记：${kind}`);
      handlers.set(kind, h);
      return () => {
        handlers.delete(kind);
      };
    },
    listNodes() {
      return [...handlers.values()].map(listed);
    },
    async exec(kind, inputs = {}, opts: WorkflowExecOpts = {}) {
      const handler = handlers.get(kind);
      if (!handler) throw new Error(`未知节点种类：${kind}`);
      const node: WorkflowNode = {
        id: opts.nodeId?.trim() || kind,
        kind,
        params: opts.params,
        agentId: opts.agentId,
      };
      return handler.execute(node, { ...inputs }, nodeCtx(opts.signal));
    },
    get(id) {
      return runs.get(id);
    },
    latest() {
      return current ? runs.get(current) : undefined;
    },
    cancel(runId) {
      abort.get(runId)?.abort();
    },
    async run(opts: WorkflowRunOpts = {}) {
      const graph = opts.graph;
      if (!graph?.nodes?.length) throw new Error('workflow 需要 graph（调度器不内置图）');
      const id = randomUUID();
      const ac = new AbortController();
      abort.set(id, ac);
      let run = emptyRun(id, graph.id);
      const nodes: WorkflowNodeRecord[] = [];
      const patch = (next: WorkflowRun) => {
        run = next;
        runs.set(id, run);
        current = id;
      };
      patch(run);
      deps.emit('workflow/start', id, { graphId: graph.id, nodes: graph.nodes.length });
      const traj = deps.trajectory?.start({ sessionId: id });
      traj?.append('run-start', { paradigm: 'workflow', graphId: graph.id, nodes: graph.nodes.length });

      try {
        const status = await scheduleLinear(
          graph,
          opts.input ?? {},
          handlers,
          nodeCtx(ac.signal),
          {
            onNode(rec) {
              nodes.push(rec);
              patch({ ...run, nodes: [...nodes] });
              deps.emit('workflow/node', id, { nodeId: rec.nodeId, ok: rec.ok });
              traj?.append('complete', {
                nodeId: rec.nodeId,
                kind: rec.kind,
                ok: rec.ok,
                outputs: rec.outputs,
                error: rec.error,
              });
            },
          },
        );
        const last = nodes.at(-1);
        const error = status === 'cancelled' ? '已取消' : last?.ok === false ? last.error : undefined;
        patch({ ...run, status, nodes: [...nodes], error });
        deps.emit('workflow/end', id, { status });
        traj?.append('run-end', { status, error });
        return runs.get(id)!;
      } catch (err) {
        const error = String(err);
        patch({ ...run, status: 'error', nodes: [...nodes], error });
        deps.emit('workflow/end', id, { status: 'error', error });
        traj?.append('run-end', { status: 'error', error });
        return runs.get(id)!;
      } finally {
        abort.delete(id);
      }
    },
  };
}
