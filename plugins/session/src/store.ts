import { randomUUID } from 'node:crypto';
import type { Session, SessionEntry, SessionKind, SessionService } from '@wizard-harness/contracts';

const KINDS = new Set<SessionKind>(['turn', 'message', 'tool-result']);

function asData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const raw = data ?? {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('session.append data 必须是普通对象');
  }
  try {
    return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  } catch {
    throw new Error('session.append data 必须可 JSON 序列化');
  }
}

interface SessionState {
  id: string;
  startedAt: number;
  title?: string;
  entries: SessionEntry[];
}

export function createSessionStore(emit: (action: string, target: string, payload: unknown) => void): SessionService {
  const states = new Map<string, SessionState>();
  let currentId: string | undefined;

  function handle(state: SessionState): Session {
    const session: Session = {
      id: state.id,
      startedAt: state.startedAt,
      title: state.title,
      append(kind, data) {
        if (!KINDS.has(kind)) throw new Error(`未知 session kind：${String(kind)}`);
        const entry: SessionEntry = Object.freeze({
          seq: state.entries.length + 1,
          time: Date.now(),
          kind,
          data: Object.freeze(asData(data)),
        });
        state.entries.push(entry);
        emit('session/append', state.id, { entry });
        return entry;
      },
      replay() {
        return state.entries;
      },
    };
    return session;
  }

  return {
    start(opts = {}) {
      const id = opts.id?.trim() || randomUUID();
      if (states.has(id)) throw new Error(`session 已存在：${id}`);
      const state: SessionState = { id, startedAt: Date.now(), title: opts.title, entries: [] };
      states.set(id, state);
      currentId = id;
      emit('session/start', id, { title: opts.title });
      return handle(state);
    },
    get(id) {
      const state = states.get(id);
      return state ? handle(state) : undefined;
    },
    list() {
      return [...states.values()].map(handle);
    },
    current() {
      return currentId ? this.get(currentId) : undefined;
    },
    deriveMessages(sessionId) {
      return (states.get(sessionId)?.entries ?? []).filter((e) => e.kind === 'message');
    },
  };
}
