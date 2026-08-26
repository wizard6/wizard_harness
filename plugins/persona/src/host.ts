import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  AgentService,
  PersonaApplyInput,
  PersonaConfigurePatch,
  PersonaMemory,
  PersonaMeta,
  PersonaProfile,
  PersonaReadResult,
  PersonaRememberInput,
  PersonaSavePatch,
  PersonaService,
  PersonaSnapshot,
} from '@wizard-harness/contracts';
import { buildPersonaGuide } from './guide.js';

export const DEFAULT_PERSONALITY =
  '你是能自主完成任务的助手。收到问题后按「观察-思考-行动」循环：先理解上下文，再决定是否需要调用工具，逐步执行直到可以给出最终答复。';

const DEFAULT_HABITS = ['先看工作区再改文件', '长网页先 outline 再读一节', '不确定时说明假设，不编造结果'];

const LIMITS = {
  MAX_NAME: 80,
  MAX_PERSONALITY: 4000,
  MAX_HABITS: 24,
  MAX_HABIT_LEN: 200,
  MAX_MEMORIES_STORE: 80,
  MAX_MEMORY_LEN: 400,
  ASSEMBLE_UNPINNED: 6,
  ASSEMBLE_CLIP: 220,
  MAX_ROLE: 120,
  MAX_VOICE: 200,
  MAX_TONE: 120,
  MAX_TRAITS: 12,
  MAX_TRAIT_LEN: 40,
  MAX_BOUNDARIES: 800,
  MAX_TAGLINE: 200,
};

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
    out.push(t.slice(0, LIMITS.MAX_HABIT_LEN));
    if (out.length >= LIMITS.MAX_HABITS) break;
  }
  return out;
}

function asTraits(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,，、]/) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of arr) {
    const t = String(row ?? '').replace(/\s+/g, ' ').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t.slice(0, LIMITS.MAX_TRAIT_LEN));
    if (out.length >= LIMITS.MAX_TRAITS) break;
  }
  return out;
}

export function emptyMeta(): PersonaMeta {
  return {
    role: '',
    voiceStyle: '',
    tone: '',
    traits: [],
    boundaries: '',
    tagline: '',
  };
}

export function defaultProfile(): PersonaProfile {
  return {
    id: 'default',
    name: '默认助手',
    personality: DEFAULT_PERSONALITY,
    habits: [...DEFAULT_HABITS],
    memories: [],
    meta: emptyMeta(),
    updatedAt: Date.now(),
  };
}

export function isDefaultProfile(profile: PersonaProfile): boolean {
  const m = profile.meta;
  const metaEmpty =
    !m.role &&
    !m.voiceStyle &&
    !m.tone &&
    !m.boundaries &&
    !m.tagline &&
    m.traits.length === 0;
  return (
    profile.name === '默认助手' &&
    profile.personality === DEFAULT_PERSONALITY &&
    metaEmpty
  );
}

function mergeMeta(base: PersonaMeta, patch?: Partial<PersonaMeta>): PersonaMeta {
  if (!patch) return base;
  return {
    role: patch.role !== undefined ? clip(String(patch.role), LIMITS.MAX_ROLE) : base.role,
    voiceStyle:
      patch.voiceStyle !== undefined ? clip(String(patch.voiceStyle), LIMITS.MAX_VOICE) : base.voiceStyle,
    tone: patch.tone !== undefined ? clip(String(patch.tone), LIMITS.MAX_TONE) : base.tone,
    traits: patch.traits !== undefined ? asTraits(patch.traits) : [...base.traits],
    boundaries:
      patch.boundaries !== undefined ? clip(String(patch.boundaries), LIMITS.MAX_BOUNDARIES) : base.boundaries,
    tagline: patch.tagline !== undefined ? clip(String(patch.tagline), LIMITS.MAX_TAGLINE) : base.tagline,
  };
}

export function renderCore(profile: PersonaProfile): string {
  const bits: string[] = [];
  const m = profile.meta;
  const identity: string[] = [];
  if (profile.name) identity.push(`名称：${profile.name}`);
  if (m.role) identity.push(`角色：${m.role}`);
  if (m.voiceStyle) identity.push(`说话风格：${m.voiceStyle}`);
  if (m.tone) identity.push(`语气：${m.tone}`);
  if (m.traits.length) identity.push(`性格：${m.traits.join('、')}`);
  if (m.tagline) identity.push(`自述：${m.tagline}`);
  if (m.boundaries) identity.push(`边界：${m.boundaries}`);
  if (identity.length) bits.push(`# 我是谁\n${identity.join('\n')}`);

  const personality = profile.personality.trim();
  if (personality) bits.push(`# 硅格\n${personality}`);
  if (profile.habits.length) {
    bits.push(`# 习惯\n${profile.habits.map((h) => `- ${h}`).join('\n')}`);
  }
  return bits.join('\n\n');
}

export function renderMemory(profile: PersonaProfile): string {
  const pinned = profile.memories.filter((m) => m.pinned).sort((a, b) => b.at - a.at);
  const rest = profile.memories
    .filter((m) => !m.pinned)
    .sort((a, b) => b.at - a.at)
    .slice(0, LIMITS.ASSEMBLE_UNPINNED);
  const picked = [...pinned, ...rest].slice(0, pinned.length + LIMITS.ASSEMBLE_UNPINNED);
  if (!picked.length) return '';
  const lines = picked.map((m) => `- ${m.pinned ? '[钉] ' : ''}${clip(m.text, LIMITS.ASSEMBLE_CLIP)}`);
  return `# 相关记忆\n${lines.join('\n')}`;
}

function applyPatch(profile: PersonaProfile, patch: PersonaSavePatch): PersonaProfile {
  const name =
    patch.name !== undefined ? clip(String(patch.name), LIMITS.MAX_NAME) || profile.name : profile.name;
  const personality =
    patch.personality !== undefined
      ? String(patch.personality).slice(0, LIMITS.MAX_PERSONALITY)
      : profile.personality;
  const habits = patch.habits !== undefined ? asHabits(patch.habits) : [...profile.habits];
  const meta = mergeMeta(profile.meta, patch.meta);
  return { ...profile, name, personality, habits, meta, updatedAt: Date.now() };
}

export function createPersonaHost(opts: PersonaHostOpts = {}): PersonaService & {
  renderCore(): string;
  renderMemory(): string;
  isDefault(): boolean;
  persistPath(): string | null;
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
    profile = { ...next, updatedAt: Date.now() };
    persist();
    opts.emit?.(action, profile.id, { name: profile.name, memories: profile.memories.length });
    return snap();
  }

  function rememberMemory(input: { text: string; pinned?: boolean }): PersonaSnapshot {
    const text = String(input.text ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.MAX_MEMORY_LEN);
    if (!text) throw new Error('需要 text');
    const row: PersonaMemory = {
      id: `mem-${randomUUID().slice(0, 8)}`,
      text,
      pinned: Boolean(input.pinned),
      at: Date.now(),
    };
    const memories = [row, ...profile.memories].slice(0, LIMITS.MAX_MEMORIES_STORE);
    return commit({ ...profile, memories }, 'persona/remember');
  }

  return {
    renderCore: () => renderCore(profile),
    renderMemory: () => renderMemory(profile),
    isDefault: () => isDefaultProfile(profile),
    persistPath: () => opts.persistFile?.trim() || null,

    snapshot: () => snap(),

    read(): PersonaReadResult {
      return {
        snapshot: snap(),
        persistFile: opts.persistFile?.trim() || null,
        isDefault: isDefaultProfile(profile),
      };
    },

    guide() {
      const hint = opts.persistFile?.trim()
        ? `落盘路径：${opts.persistFile}`
        : '当前未配置 persistFile（vitest 或内存模式）';
      return buildPersonaGuide(hint);
    },

    save(patch: PersonaSavePatch) {
      return commit(applyPatch(profile, patch), 'persona/save');
    },

    configure(patch: PersonaConfigurePatch) {
      return commit(applyPatch(profile, patch), 'persona/configure');
    },

    apply(input: PersonaApplyInput) {
      const name = clip(String(input.name ?? ''), LIMITS.MAX_NAME);
      const personality = String(input.personality ?? '').slice(0, LIMITS.MAX_PERSONALITY);
      if (!name) throw new Error('apply 需要 name');
      if (!personality.trim()) throw new Error('apply 需要 personality');

      const meta = mergeMeta(emptyMeta(), {
        role: input.role,
        voiceStyle: input.voiceStyle,
        tone: input.tone,
        traits: input.traits,
        boundaries: input.boundaries,
        tagline: input.tagline,
      });

      const incoming = input.habits ? asHabits(input.habits) : [];
      const habits =
        input.replaceHabits === true
          ? incoming
          : asHabits([...profile.habits, ...incoming]);

      return commit(
        {
          ...profile,
          name,
          personality,
          meta,
          habits: habits.length ? habits : [...profile.habits],
        },
        'persona/apply',
      );
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
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<PersonaProfile> & {
      meta?: Partial<PersonaMeta>;
    };
    const base = defaultProfile();
    const memories = Array.isArray(raw.memories)
      ? raw.memories
          .map((m) => ({
            id: String(m?.id ?? `mem-${randomUUID().slice(0, 8)}`),
            text: String(m?.text ?? '').trim().slice(0, LIMITS.MAX_MEMORY_LEN),
            pinned: Boolean(m?.pinned),
            at: Number(m?.at) || Date.now(),
          }))
          .filter((m) => m.text)
          .slice(0, LIMITS.MAX_MEMORIES_STORE)
      : [];
    const meta = mergeMeta(emptyMeta(), raw.meta);
    return {
      id: String(raw.id ?? base.id),
      name: clip(String(raw.name ?? base.name), LIMITS.MAX_NAME) || base.name,
      personality: String(raw.personality ?? base.personality).slice(0, LIMITS.MAX_PERSONALITY),
      habits: asHabits(raw.habits ?? base.habits),
      memories,
      meta,
      updatedAt: Number(raw.updatedAt) || Date.now(),
    };
  } catch {
    return undefined;
  }
}
