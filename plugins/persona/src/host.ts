import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PERSONA_SOUL_LIMIT } from '@wizard-harness/contracts';
import type {
  PersonaCreateInput,
  PersonaProfile,
  PersonaReadResult,
  PersonaSavePatch,
  PersonaService,
  PersonaSnapshot,
  PersonaSummary,
  PersonaUpdateInput,
} from '@wizard-harness/contracts';
import { buildPersonaGuide } from './guide.js';

export const DEFAULT_PERSONALITY =
  '你是能自主完成任务的助手。收到问题后按「观察-思考-行动」循环：先理解上下文，再决定是否需要调用工具，逐步执行直到可以给出最终答复。';

const DEFAULT_HABITS = ['先看工作区再改文件', '长网页先 outline 再读一节', '不确定时说明假设，不编造结果'];
const MAX_NAME = 80;

export interface PersonaHostOpts {
  persistFile?: string;
  emit?: (action: string, target: string, payload: unknown) => void;
}

export function soulChars(text: string): number {
  return Array.from(text).length;
}

export function composeSoul(input: {
  name?: string;
  personality?: string;
  role?: string;
  voiceStyle?: string;
  tone?: string;
  traits?: readonly string[];
  boundaries?: string;
  tagline?: string;
  habits?: readonly string[];
}): string {
  const bits: string[] = [];
  const identity: string[] = [];
  const name = String(input.name ?? '').trim();
  if (name) identity.push(`名称：${name}`);
  const role = String(input.role ?? '').trim();
  if (role) identity.push(`角色：${role}`);
  const voice = String(input.voiceStyle ?? '').trim();
  if (voice) identity.push(`说话风格：${voice}`);
  const tone = String(input.tone ?? '').trim();
  if (tone) identity.push(`语气：${tone}`);
  const traits = (input.traits ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (traits.length) identity.push(`性格：${traits.join('、')}`);
  const tagline = String(input.tagline ?? '').trim();
  if (tagline) identity.push(`自述：${tagline}`);
  const boundaries = String(input.boundaries ?? '').trim();
  if (boundaries) identity.push(`边界：${boundaries}`);
  if (identity.length) bits.push(`# 我是谁\n${identity.join('\n')}`);
  const personality = String(input.personality ?? '').trim();
  if (personality) bits.push(`# 硅格\n${personality}`);
  const habits = (input.habits ?? []).map((h) => String(h).trim()).filter(Boolean);
  if (habits.length) bits.push(`# 习惯\n${habits.map((h) => `- ${h}`).join('\n')}`);
  return bits.join('\n\n');
}

export const DEFAULT_SOUL = composeSoul({
  name: '默认助手',
  personality: DEFAULT_PERSONALITY,
  habits: DEFAULT_HABITS,
});

function clipName(raw: unknown): string {
  return Array.from(String(raw ?? '').replace(/\s+/g, ' ').trim())
    .slice(0, MAX_NAME)
    .join('');
}

function asSoul(raw: unknown): string {
  return String(raw ?? '').replace(/\r\n/g, '\n').trim();
}

function assertSoul(soul: string): string {
  const text = asSoul(soul);
  if (!text) throw new Error('soul 不能为空');
  if (soulChars(text) > PERSONA_SOUL_LIMIT) {
    throw new Error(`soul 超过 ${PERSONA_SOUL_LIMIT} 字（当前 ${soulChars(text)}）`);
  }
  return text;
}

function newId(): string {
  return randomUUID();
}

export function defaultProfile(): PersonaProfile {
  return {
    id: 'default',
    name: '默认助手',
    soul: DEFAULT_SOUL,
    updatedAt: Date.now(),
  };
}

export function isDefaultProfile(profile: PersonaProfile): boolean {
  return profile.name === '默认助手' && profile.soul === DEFAULT_SOUL;
}

function summaryOf(p: PersonaProfile, activeId: string): PersonaSummary {
  return {
    id: p.id,
    name: p.name,
    chars: soulChars(p.soul),
    active: p.id === activeId,
    updatedAt: p.updatedAt,
  };
}

function soulFromInput(
  input: { soul?: string; name?: string } & Omit<PersonaCreateInput, 'name' | 'activate'>,
  fallbackName: string,
): string {
  if (input.soul != null && String(input.soul).trim()) return assertSoul(input.soul);
  const composed = composeSoul({
    name: input.name || fallbackName,
    personality: input.personality,
    role: input.role,
    voiceStyle: input.voiceStyle,
    tone: input.tone,
    traits: input.traits,
    boundaries: input.boundaries,
    tagline: input.tagline,
    habits: input.habits,
  });
  return assertSoul(composed);
}

interface Store {
  activeId: string;
  profiles: PersonaProfile[];
}

export function createPersonaHost(opts: PersonaHostOpts = {}): PersonaService & {
  isDefault(): boolean;
  persistPath(): string | null;
} {
  let store = loadStore(opts.persistFile);

  function persist(): void {
    const file = opts.persistFile?.trim();
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ version: 2, activeId: store.activeId, profiles: store.profiles }, null, 2), 'utf8');
  }

  function active(): PersonaProfile {
    return store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0]!;
  }

  function snap(): PersonaSnapshot {
    const profile = active();
    return {
      profile,
      profiles: store.profiles.map((p) => summaryOf(p, store.activeId)),
      preview: profile.soul,
      chars: soulChars(profile.soul),
      limit: PERSONA_SOUL_LIMIT,
    };
  }

  function commit(action: string, target?: string, viewId?: string): PersonaSnapshot {
    persist();
    const profile = (viewId ? store.profiles.find((p) => p.id === viewId) : undefined) ?? active();
    opts.emit?.(action, target ?? profile.id, {
      name: profile.name,
      chars: soulChars(profile.soul),
      count: store.profiles.length,
    });
    return {
      profile,
      profiles: store.profiles.map((p) => summaryOf(p, store.activeId)),
      preview: profile.soul,
      chars: soulChars(profile.soul),
      limit: PERSONA_SOUL_LIMIT,
    };
  }

  function requireId(id: string): PersonaProfile {
    const row = store.profiles.find((p) => p.id === id);
    if (!row) throw new Error(`硅灵不存在：${id}`);
    return row;
  }

  return {
    isDefault: () => store.profiles.length === 1 && isDefaultProfile(active()),
    persistPath: () => opts.persistFile?.trim() || null,
    soul: () => active().soul,
    snapshot: () => snap(),
    list: () => store.profiles.map((p) => summaryOf(p, store.activeId)),

    read(id?: string): PersonaReadResult {
      const profile = id?.trim() ? requireId(id.trim()) : active();
      return {
        snapshot: {
          profile,
          profiles: store.profiles.map((p) => summaryOf(p, store.activeId)),
          preview: profile.soul,
          chars: soulChars(profile.soul),
          limit: PERSONA_SOUL_LIMIT,
        },
        persistFile: opts.persistFile?.trim() || null,
        isDefault: store.profiles.length === 1 && isDefaultProfile(active()) && profile.id === store.activeId,
      };
    },

    guide() {
      const hint = opts.persistFile?.trim()
        ? `落盘路径：${opts.persistFile}`
        : '当前未配置 persistFile（vitest 或内存模式）';
      return buildPersonaGuide(hint);
    },

    create(input: PersonaCreateInput) {
      const name = clipName(input.name);
      if (!name) throw new Error('create 需要 name');
      const soul = soulFromInput(input, name);
      const profile: PersonaProfile = { id: newId(), name, soul, updatedAt: Date.now() };
      store.profiles.push(profile);
      if (input.activate !== false) store.activeId = profile.id;
      return commit('persona/create', profile.id, profile.id);
    },

    update(input: PersonaUpdateInput) {
      const id = String(input.id ?? store.activeId).trim();
      const row = requireId(id);
      const name = input.name !== undefined ? clipName(input.name) || row.name : row.name;
      let soul = row.soul;
      if (input.soul !== undefined) soul = assertSoul(input.soul);
      else if (
        input.personality != null ||
        input.role != null ||
        input.voiceStyle != null ||
        input.tone != null ||
        input.traits != null ||
        input.boundaries != null ||
        input.tagline != null ||
        input.habits != null
      ) {
        soul = soulFromInput({ ...input, name }, name);
      }
      const next: PersonaProfile = { ...row, name, soul, updatedAt: Date.now() };
      store.profiles = store.profiles.map((p) => (p.id === id ? next : p));
      return commit('persona/update', id);
    },

    activate(id: string) {
      const tid = String(id ?? '').trim();
      requireId(tid);
      store.activeId = tid;
      return commit('persona/switch', tid);
    },

    remove(id: string) {
      const tid = String(id ?? '').trim();
      requireId(tid);
      if (store.profiles.length <= 1) throw new Error('至少保留一份硅灵');
      store.profiles = store.profiles.filter((p) => p.id !== tid);
      if (store.activeId === tid) store.activeId = store.profiles[0]!.id;
      return commit('persona/remove', tid);
    },

    save(patch: PersonaSavePatch) {
      return this.update({
        id: store.activeId,
        name: patch.name,
        soul: patch.soul,
      });
    },
  };
}

function loadStore(file?: string): Store {
  const fallback: Store = { activeId: 'default', profiles: [defaultProfile()] };
  const path = file?.trim();
  if (!path || !existsSync(path)) return fallback;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    if (Array.isArray(raw.profiles)) {
      const profiles = raw.profiles
        .map((row) => asStoredProfile(row))
        .filter((p): p is PersonaProfile => Boolean(p));
      if (!profiles.length) return fallback;
      const activeId = String(raw.activeId ?? profiles[0]!.id);
      return {
        activeId: profiles.some((p) => p.id === activeId) ? activeId : profiles[0]!.id,
        profiles,
      };
    }
    const migrated = migrateV1(raw);
    return migrated ?? fallback;
  } catch {
    return fallback;
  }
}

function asStoredProfile(raw: unknown): PersonaProfile | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? '').trim() || newId();
  const name = clipName(o.name) || '未命名';
  const soul = asSoul(o.soul);
  if (!soul) return undefined;
  return {
    id,
    name,
    soul: soulChars(soul) > PERSONA_SOUL_LIMIT ? Array.from(soul).slice(0, PERSONA_SOUL_LIMIT).join('') : soul,
    updatedAt: Number(o.updatedAt) || Date.now(),
  };
}

function migrateV1(raw: Record<string, unknown>): Store | undefined {
  const name = clipName(raw.name) || '默认助手';
  const personality = String(raw.personality ?? '').trim() || DEFAULT_PERSONALITY;
  const habits = Array.isArray(raw.habits) ? raw.habits.map(String) : DEFAULT_HABITS;
  const meta = (raw.meta && typeof raw.meta === 'object' ? raw.meta : {}) as Record<string, unknown>;
  const soul = composeSoul({
    name,
    personality,
    role: String(meta.role ?? ''),
    voiceStyle: String(meta.voiceStyle ?? ''),
    tone: String(meta.tone ?? ''),
    traits: Array.isArray(meta.traits) ? meta.traits.map(String) : [],
    boundaries: String(meta.boundaries ?? ''),
    tagline: String(meta.tagline ?? ''),
    habits,
  });
  const profile: PersonaProfile = {
    id: String(raw.id ?? 'default'),
    name,
    soul: soulChars(soul) > PERSONA_SOUL_LIMIT ? Array.from(soul).slice(0, PERSONA_SOUL_LIMIT).join('') : soul,
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
  return { activeId: profile.id, profiles: [profile] };
}
