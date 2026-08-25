import type { TimerFlowRunView, TimerRunState, TimerTraceNode, TimerTraceTree } from '@wizard-harness/contracts';

const LIMITS = { MAX_FLOW_RUNS: 80, MAX_TRACE_NODES: 400 };

type MutTrace = Omit<TimerTraceNode, 'childIds' | 'state'> & { childIds: string[]; state: TimerTraceNode['state'] };

export class TraceStore {
  private readonly nodes = new Map<string, MutTrace>();
  private readonly byFlowRun = new Map<string, string[]>();
  private readonly flowRuns: TimerFlowRunView[] = [];

  constructor(private readonly now: () => number) {}

  startFlowRun(jobId: string, jobRunId: string, plan: TimerTraceNode[]): TimerFlowRunView {
    const id = `flow-${jobRunId}`;
    const root = plan.find((n) => !n.parentId) ?? plan[0];
    const run: TimerFlowRunView = {
      id,
      jobId,
      jobRunId,
      startedAt: this.now(),
      state: 'running',
      rootTraceId: root?.id ?? '',
    };
    this.flowRuns.push(run);
    if (this.flowRuns.length > LIMITS.MAX_FLOW_RUNS) {
      const drop = this.flowRuns.shift()!;
      this.dropFlowRun(drop.id);
    }
    const ids: string[] = [];
    for (const n of plan) {
      if (this.nodes.size >= LIMITS.MAX_TRACE_NODES) break;
      const row: MutTrace = { ...n, childIds: [...n.childIds] };
      this.nodes.set(row.id, row);
      ids.push(row.id);
    }
    this.byFlowRun.set(id, ids);
    return run;
  }

  private dropFlowRun(flowRunId: string) {
    const ids = this.byFlowRun.get(flowRunId) ?? [];
    for (const id of ids) this.nodes.delete(id);
    this.byFlowRun.delete(flowRunId);
  }

  finishFlowRun(flowRunId: string, state: TimerRunState) {
    const run = this.flowRuns.find((r) => r.id === flowRunId);
    if (!run) return;
    (run as { state: TimerRunState; endedAt?: number }).state = state;
    (run as { endedAt?: number }).endedAt = this.now();
  }

  findByKey(flowRunId: string, nodeKey: string): MutTrace | undefined {
    const ids = this.byFlowRun.get(flowRunId) ?? [];
    for (const id of ids) {
      const n = this.nodes.get(id);
      if (n?.nodeKey === nodeKey) return n;
    }
    return undefined;
  }

  patch(id: string, patch: Partial<Pick<TimerTraceNode, 'state' | 'scheduledAt' | 'startedAt' | 'endedAt' | 'error' | 'summary'>>) {
    const n = this.nodes.get(id);
    if (!n) return;
    Object.assign(n, patch);
  }

  skipPendingSiblings(flowRunId: string, parentId: string | undefined, keepId: string) {
    const ids = this.byFlowRun.get(flowRunId) ?? [];
    for (const id of ids) {
      const n = this.nodes.get(id);
      if (!n || n.parentId !== parentId || n.id === keepId) continue;
      if (n.state === 'pending' || n.state === 'scheduled') n.state = 'skipped';
    }
  }

  skipSubtree(flowRunId: string, rootId: string) {
    const ids = this.byFlowRun.get(flowRunId) ?? [];
    const mark = new Set<string>();
    const walk = (id: string) => {
      if (mark.has(id)) return;
      mark.add(id);
      const n = this.nodes.get(id);
      if (!n) return;
      for (const c of n.childIds) walk(c);
    };
    walk(rootId);
    for (const id of ids) {
      const n = this.nodes.get(id);
      if (n && mark.has(id) && (n.state === 'pending' || n.state === 'scheduled')) n.state = 'skipped';
    }
  }

  getTree(flowRunId: string): TimerTraceTree | undefined {
    const run = this.flowRuns.find((r) => r.id === flowRunId);
    if (!run) return undefined;
    const ids = this.byFlowRun.get(flowRunId) ?? [];
    const nodes = ids.map((id) => this.nodes.get(id)).filter(Boolean) as TimerTraceNode[];
    return { flowRun: run, nodes };
  }

  listFlowRuns(jobId?: string, limit = 30): readonly TimerFlowRunView[] {
    let rows = [...this.flowRuns];
    if (jobId) rows = rows.filter((r) => r.jobId === jobId);
    return rows.slice(-limit);
  }

  latestForJob(jobId: string): TimerFlowRunView | undefined {
    for (let i = this.flowRuns.length - 1; i >= 0; i -= 1) {
      if (this.flowRuns[i]!.jobId === jobId) return this.flowRuns[i];
    }
    return undefined;
  }
}
