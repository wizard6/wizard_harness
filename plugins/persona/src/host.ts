import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  AgentService,
  PersonaMemory,
  PersonaProfile,
  PersonaRememberInput,
  PersonaSavePatch,
  PersonaService,
  PersonaSnapshot,
} from '@wizard-harness/contracts';

export const DEFAULT_PERSONALITY =
  '你是能自主完成任务的助手。收到问题后按「观察-思考-行动」循环：先理解上下文，再决定是否需要调用工具，逐步执行直到可以给出最终答复。';

const DEFAULT_HABITS = ['先看工作区再改文件', '长网页先 outline 再读一节', '不确定时说明假设，不编造结果'];

const MAX_PERSONALITY = 4000;
const MAX_HABITS = 24;
const MAX_HABIT_LEN = 200;
const MAX_MEMORIES_STORE = 80;
const MAX_MEMORY_LEN = 400;
const ASSEMBLE_UNPINNED = 6;
const ASSEMBLE_CLIP = 220;

export interface PersonaHostOpts {
  persistFile?: string;
  agents?: () => AgentService | undefined;
  emit?: (action: string, target: string, payload: unknown) => void;
}

function clip(text: string, n: number): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

function asHabits(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of arr) {
    const t = String(row ?? '').replace(/\s+/g, ' ').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t.slice(0, MAX_HABIT_LEN));
    if (out.length >= MAX_HABITS) break;
  }
  return out;
}

export function defaultProfile(): PersonaProfile {
  return {
    id: 'default',
    name: '默认助手',
    personality: DEFAULT_PERSONALITY,
    habits: [...DEFAULT_HABITS],
    memories: [],
  };
}

export function renderCore(profile: PersonaProfile): string {
  const bits: string[] = [];
  const personality = profile.personality.trim();
  if (personality) bits.push(`# 人格\n${personality}`);
  if (profile.habits.length) {
    bits.push(`# 习惯\n${profile.habits.map((h) => `- ${h}`).join('\n')}`);
  }
  return bits.join('\n\n');
}

export function renderMemory(profile: PersonaProfile): string {
  const pinned = profile.memories.filter((m) => m.pinned).sort((a, b) => b.at - a.at);
  const rest = profile.memories.filter((m) => !m.pinned).sort((a, b) => b.at - a.at).slice(0, ASSEMBLE_UNPINNED);
  const picked = [...pinned, ...rest].slice(0, pinned.length + ASSEMBLE_UNPINNED);
  if (!picked.length) return '';
  const lines = picked.map((m) => `- ${m.pinned ? '[钉] ' : ''}${clip(m.text, ASSEMBLE_CLIP)}`);
  return `# 相关记忆\n${lines.join('\n')}`;
}

export function createPersonaHost(opts: PersonaHostOpts = {}): PersonaService & {
  renderCore(): string;
  renderMemory(): string;
} {
  let profile = loadProfile(opts.persistFile) ?? defaultProfile();

  function persist(): void {
    const file = opts.persistFile?.trim();
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(profile, null, 2), 'utf8');
  }

  function snap(): PersonaSnapshot {
    const svc = opts.agents?.();
    const agents = svc?.list() ?? [];
    return {
      profile,
      preview: { core: renderCore(profile), memory: renderMemory(profile) },
      agents: agents.map((a) => ({ id: a.id, sessionId: a.sessionId })),
    };
  }

  function commit(next: PersonaProfile, action: string): PersonaSnapshot {
    profile = next;
    persist();
    opts.emit?.(action, profile.id, { name: profile.name, memories: profile.memories.length });
    return snap();
  }

  function rememberMemory(input: { text: string; pinned?: boolean }): PersonaSnapshot {
    const text = String(input.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_MEMORY_LEN);
    if (!text) throw new Error('需要 text');
    const row: PersonaMemory = {
      id: `mem-${randomUUID().slice(0, 8)}`,
      text,
      pinned: Boolean(input.pinned),
      at: Date.now(),
    };
    const memories = [row, ...profile.memories].slice(0, MAX_MEMORIES_STORE);
    return commit({ ...profile, memories }, 'persona/remember');
  }

  return {
    renderCore: () => renderCore(profile),
    renderMemory: () => renderMemory(profile),
    snapshot: () => snap(),
    save(patch: PersonaSavePatch) {
      const name = String(patch.name ?? profile.name).trim() || profile.name;
      const personality = String(patch.personality ?? profile.personality).slice(0, MAX_PERSONALITY);
      const habits = patch.habits !== undefined ? asHabits(patch.habits) : [...profile.habits];
      return commit({ ...profile, name, personality, habits }, 'persona/save');
    },
    addMemory(input) {
      return rememberMemory(input);
    },
    remember(input: PersonaRememberInput) {
      const text = String(input.text ?? '').replace(/\s+/g, ' ').trim();
      if (!text) throw new Error('需要 text');
      if (input.kind === 'habit') {
        return commit({ ...profile, habits: asHabits([...profile.habits, text]) }, 'persona/habit');
      }
      return rememberMemory({ text, pinned: input.pinned });
    },
    removeMemory(id) {
      const next = profile.memories.filter((m) => m.id !== id);
      if (next.length === profile.memories.length) throw new Error(`记忆不存在：${id}`);
      return commit({ ...profile, memories: next }, 'persona/forget');
    },
    pinMemory(id, pinned) {
      const memories = profile.memories.map((m) => (m.id === id ? { ...m, pinned: Boolean(pinned) } : m));
      if (!memories.some((m) => m.id === id)) throw new Error(`记忆不存在：${id}`);
      return commit({ ...profile, memories }, 'persona/pin');
    },
  };
}

function loadProfile(file?: string): PersonaProfile | undefined {
  const path = file?.trim();
  if (!path || !existsSync(path)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<PersonaProfile>;
    const base = defaultProfile();
    const memories = Array.isArray(raw.memories)
      ? raw.memories
          .map((m) => ({
            id: String(m?.id ?? `mem-${randomUUID().slice(0, 8)}`),
            text: String(m?.text ?? '').trim().slice(0, MAX_MEMORY_LEN),
            pinned: Boolean(m?.pinned),
            at: Number(m?.at) || Date.now(),
          }))
          .filter((m) => m.text)
          .slice(0, MAX_MEMORIES_STORE)
      : [];
    return {
      id: String(raw.id ?? base.id),
      name: String(raw.name ?? base.name).trim() || base.name,
      personality: String(raw.personality ?? base.personality).slice(0, MAX_PERSONALITY),
      habits: asHabits(raw.habits ?? base.habits),
      memories,
    };
  } catch {
    return undefined;
  }
}
