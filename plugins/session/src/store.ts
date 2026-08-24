import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type {
  Session,
  SessionEntry,
  SessionInfo,
  SessionInspect,
  SessionKind,
  SessionPatch,
  SessionPeek,
  SessionService,
  SessionStartOpts,
} from '@wizard-harness/contracts';

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

export function asWorkspace(raw: unknown): string | undefined {
  let s = String(raw ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!s) return undefined;
  const abs = isAbsolute(s) ? s : resolve(s);
  return abs.replace(/[\\/]+$/, '') || abs;
}

function asTitle(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim();
  return s || undefined;
}

interface SessionState {
  id: string;
  startedAt: number;
  title?: string;
  workspace?: string;
  entries: SessionEntry[];
}

export interface SessionStoreOptions {
  persistDir?: string;
}

function fileOf(dir: string, id: string): string {
  return join(dir, `${id.replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
}

function infoOf(state: SessionState): SessionInfo {
  const last = state.entries[state.entries.length - 1];
  return {
    id: state.id,
    startedAt: state.startedAt,
    title: state.title,
    workspace: state.workspace,
    entries: state.entries.length,
    updatedAt: last?.time ?? state.startedAt,
  };
}

export function createSessionStore(
  emit: (action: string, target: string, payload: unknown) => void,
  opts: SessionStoreOptions = {},
): SessionService {
  const states = new Map<string, SessionState>();
  let currentId: string | undefined;
  const persistDir = opts.persistDir?.trim();

  function persist(state: SessionState): void {
    if (!persistDir) return;
    mkdirSync(persistDir, { recursive: true });
    writeFileSync(fileOf(persistDir, state.id), JSON.stringify(state), 'utf8');
  }

  if (persistDir && existsSync(persistDir)) {
    for (const name of readdirSync(persistDir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(readFileSync(join(persistDir, name), 'utf8')) as SessionState;
        if (raw?.id && Array.isArray(raw.entries)) {
          states.set(raw.id, {
            id: raw.id,
            startedAt: Number(raw.startedAt) || Date.now(),
            title: asTitle(raw.title),
            workspace: asWorkspace(raw.workspace),
            entries: raw.entries,
          });
        }
      } catch {
        /* 坏文件跳过 */
      }
    }
  }

  function handle(state: SessionState): Session {
    const session: Session = {
      id: state.id,
      startedAt: state.startedAt,
      get title() {
        return state.title;
      },
      get workspace() {
        return state.workspace;
      },
      append(kind, data) {
        if (!KINDS.has(kind)) throw new Error(`未知 session kind：${String(kind)}`);
        const entry: SessionEntry = Object.freeze({
          seq: state.entries.length + 1,
          time: Date.now(),
          kind,
          data: Object.freeze(asData(data)),
        });
        state.entries.push(entry);
        persist(state);
        emit('session/append', state.id, { entry });
        return entry;
      },
      replay() {
        return state.entries;
      },
    };
    return session;
  }

  const api: SessionService = {
    start(opts: SessionStartOpts = {}) {
      const id = opts.id?.trim() || randomUUID();
      if (states.has(id)) throw new Error(`session 已存在：${id}`);
      const state: SessionState = {
        id,
        startedAt: Date.now(),
        title: asTitle(opts.title),
        workspace: asWorkspace(opts.workspace),
        entries: [],
      };
      states.set(id, state);
      currentId = id;
      persist(state);
      emit('session/start', id, { title: state.title, workspace: state.workspace });
      return handle(state);
    },
    open(opts) {
      const s = api.start(opts);
      const state = states.get(s.id);
      if (!state) throw new Error(`session 不存在：${s.id}`);
      return infoOf(state);
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
    patch(id, patch: SessionPatch) {
      const state = states.get(id);
      if (!state) throw new Error(`session 不存在：${id}`);
      if (patch.title !== undefined) state.title = asTitle(patch.title);
      if (patch.workspace !== undefined) state.workspace = asWorkspace(patch.workspace);
      persist(state);
      emit('session/patch', id, { title: state.title, workspace: state.workspace });
      return infoOf(state);
    },
    inspect(): SessionInspect {
      const sessions = [...states.values()].map(infoOf).sort((a, b) => b.startedAt - a.startedAt);
      return { persistDir: persistDir || undefined, currentId, sessions };
    },
    peek(id): SessionPeek {
      const state = states.get(id);
      if (!state) throw new Error(`session 不存在：${id}`);
      return {
        id: state.id,
        startedAt: state.startedAt,
        title: state.title,
        workspace: state.workspace,
        entries: state.entries,
      };
    },
    deriveMessages(sessionId) {
      return (states.get(sessionId)?.entries ?? []).filter((e) => e.kind === 'message');
    },
    compact(sessionId, compactOpts = {}) {
      const state = states.get(sessionId);
      if (!state) throw new Error(`session 不存在：${sessionId}`);
      const keep = Math.max(1, compactOpts.keep ?? 40);
      if (state.entries.length <= keep) return 0;
      const drop = state.entries.length - keep;
      const rest = state.entries.slice(drop);
      const note: SessionEntry = Object.freeze({
        seq: 1,
        time: Date.now(),
        kind: 'turn' as const,
        data: Object.freeze({ phase: 'compact', dropped: drop }),
      });
      state.entries = [
        note,
        ...rest.map((e, i) =>
          Object.freeze({ seq: i + 2, time: e.time, kind: e.kind, data: e.data }),
        ),
      ];
      persist(state);
      emit('session/compact', sessionId, { dropped: drop, keep: state.entries.length });
      return drop;
    },
  };
  return api;
}
