import { randomUUID } from 'node:crypto';
import type {
  Trajectory,
  TrajectoryKind,
  TrajectoryService,
  TrajectorySnapshot,
  TrajectorySpan,
} from '@wizard-harness/contracts';

const KINDS = new Set<TrajectoryKind>(['run-start', 'run-end', 'prompt', 'http', 'tool', 'complete']);

function asData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const raw = data ?? {};
  try {
    return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  } catch {
    return { note: 'data 无法 JSON 序列化' };
  }
}

function snapOf(t: Trajectory): TrajectorySnapshot {
  return {
    id: t.id,
    startedAt: t.startedAt,
    agentId: t.agentId,
    sessionId: t.sessionId,
    spans: t.replay(),
  };
}

export function createTrajectoryStore(
  emit: (action: string, target: string, payload: unknown) => void,
): TrajectoryService {
  const items = new Map<string, Trajectory>();
  const bySession = new Map<string, string>();
  let currentId: string | undefined;

  function make(opts: { agentId?: string; sessionId?: string }): Trajectory {
    const id = randomUUID();
    const startedAt = Date.now();
    const spans: TrajectorySpan[] = [];
    const t: Trajectory = {
      id,
      startedAt,
      agentId: opts.agentId,
      sessionId: opts.sessionId,
      append(kind, data) {
        if (!KINDS.has(kind)) throw new Error(`未知 trajectory kind：${String(kind)}`);
        const span: TrajectorySpan = Object.freeze({
          seq: spans.length + 1,
          ts: Date.now(),
          kind,
          data: Object.freeze(asData(data)),
        });
        spans.push(span);
        emit('trajectory/append', id, { kind, seq: span.seq });
        return span;
      },
      replay() {
        return spans;
      },
    };
    items.set(id, t);
    currentId = id;
    if (opts.sessionId) bySession.set(opts.sessionId, id);
    emit('trajectory/start', id, { agentId: opts.agentId, sessionId: opts.sessionId });
    return t;
  }

  return {
    start(opts = {}) {
      return make(opts);
    },
    get(id) {
      return items.get(id);
    },
    current() {
      return currentId ? items.get(currentId) : undefined;
    },
    forSession(sessionId) {
      const id = bySession.get(sessionId);
      return id ? items.get(id) : undefined;
    },
    list() {
      return [...items.values()].map((t) => ({
        id: t.id,
        startedAt: t.startedAt,
        agentId: t.agentId,
        sessionId: t.sessionId,
        spans: t.replay().length,
      }));
    },
    latest() {
      return this.snapshot();
    },
    snapshot(id?: string) {
      const t = id
        ? items.get(id)
        : (currentId ? items.get(currentId) : [...items.values()].at(-1));
      return t ? snapOf(t) : undefined;
    },
    record(sessionId, kind, data) {
      let t = sessionId ? this.forSession(sessionId) : this.current();
      if (!t) {
        if (!sessionId && !this.current()) return undefined;
        t = make({ sessionId });
      }
      return t.append(kind, data);
    },
  };
}
