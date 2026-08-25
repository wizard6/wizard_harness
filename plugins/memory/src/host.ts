import { randomUUID } from 'node:crypto';
import type {
  MemoryBreathResult,
  MemoryBucket,
  MemoryGrowInput,
  MemoryHoldInput,
  MemoryPulse,
  MemorySearchHit,
  MemorySearchOpts,
  MemoryService,
  MemorySnapshot,
  MemoryTracePatch,
} from '@wizard-harness/contracts';
import { shouldArchive } from './decay.js';
import { searchBuckets } from './search.js';
import { buildBreathPool, renderBreathText } from './surface.js';
import {
  LIMITS,
  clamp01,
  clampImportance,
  clip,
  nowMs,
  type BucketRecord,
} from './types.js';
import { MemoryVault } from './vault.js';

export interface MemoryHostOpts {
  vaultDir: string;
  emit?: (action: string, target: string, payload: unknown) => void;
}

function toPublic(b: BucketRecord): MemoryBucket {
  return { ...b };
}

function titleFrom(content: string, fallback?: string): string {
  if (fallback?.trim()) return clip(fallback.trim(), LIMITS.MAX_NAME);
  const line = content.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? '未命名记忆';
  return clip(line, LIMITS.MAX_NAME);
}

function splitGrow(content: string): string[] {
  const parts = content
    .split(/\n{2,}|(?<=[。！？.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
  if (parts.length >= LIMITS.GROW_MIN) {
    return parts.slice(0, LIMITS.GROW_MAX);
  }
  // 不够则按长度硬切
  const chunk = Math.ceil(content.length / LIMITS.GROW_MIN);
  const out: string[] = [];
  for (let i = 0; i < content.length && out.length < LIMITS.GROW_MAX; i += chunk) {
    const slice = content.slice(i, i + chunk).trim();
    if (slice) out.push(slice);
  }
  return out.length >= LIMITS.GROW_MIN ? out : [content.trim()].filter(Boolean);
}

export function createMemoryHost(opts: MemoryHostOpts): MemoryService & {
  renderBreath(): string;
  vaultDir: string;
} {
  const vault = new MemoryVault(opts.vaultDir);

  function all(): BucketRecord[] {
    const list = vault.list();
    let changed = false;
    for (const b of list) {
      if (shouldArchive(b)) {
        b.type = 'archived';
        vault.save(b);
        changed = true;
        opts.emit?.('archive', 'memory', { id: b.id });
      }
    }
    return changed ? vault.list() : list;
  }

  function pulseOf(list = all()): MemoryPulse {
    return {
      vaultDir: opts.vaultDir,
      total: list.length,
      active: list.filter((b) => b.type !== 'archived').length,
      archived: list.filter((b) => b.type === 'archived').length,
      pinned: list.filter((b) => b.pinned && b.type !== 'archived').length,
      unresolved: list.filter((b) => b.type !== 'archived' && !b.resolved).length,
    };
  }

  function countPinned(list: BucketRecord[], exceptId?: string): number {
    return list.filter((b) => b.pinned && b.type !== 'archived' && b.id !== exceptId).length;
  }

  const api: MemoryService & { renderBreath(): string; vaultDir: string } = {
    vaultDir: opts.vaultDir,

    snapshot(): MemorySnapshot {
      const buckets = all().map(toPublic);
      const breath = api.breath();
      return {
        buckets,
        pulse: pulseOf(all()),
        preview: { breath: breath.text },
      };
    },

    pulse(): MemoryPulse {
      return pulseOf();
    },

    list(listOpts?: { includeArchive?: boolean }): MemoryBucket[] {
      return all()
        .filter((b) => listOpts?.includeArchive || b.type !== 'archived')
        .map(toPublic);
    },

    get(id: string): MemoryBucket | undefined {
      const b = all().find((x) => x.id === id);
      return b ? toPublic(b) : undefined;
    },

    breath(breathOpts?: { maxResults?: number }): MemoryBreathResult {
      const pool = buildBreathPool(all(), breathOpts);
      return {
        core: pool.core.map(toPublic),
        surfaced: pool.surfaced.map(toPublic),
        cold: pool.cold.map(toPublic),
        text: renderBreathText(pool),
      };
    },

    search(searchOpts: MemorySearchOpts): MemorySearchHit[] {
      return searchBuckets(all(), searchOpts).map((h) => ({
        bucket: toPublic(h.bucket),
        score: h.score,
      }));
    },

    hold(input: MemoryHoldInput): MemoryBucket {
      const content = String(input.content ?? '').trim();
      if (!content) throw new Error('hold 需要 content');
      const list = all();
      const pinned = input.pinned === true;
      if (pinned && countPinned(list) >= LIMITS.MAX_PINNED) {
        throw new Error(`核心准则已满（≤${LIMITS.MAX_PINNED}）`);
      }
      const t = nowMs();
      const rec: BucketRecord = {
        id: `mem_${t.toString(36)}_${randomUUID().slice(0, 6)}`,
        name: titleFrom(content, input.name),
        body: content.slice(0, LIMITS.MAX_BODY),
        domain: String(input.domain ?? '未分类').trim() || '未分类',
        tags: (input.tags ?? []).map(String).filter(Boolean).slice(0, LIMITS.MAX_TAGS),
        valence: clamp01(input.valence ?? 0.5),
        arousal: clamp01(input.arousal ?? 0.5),
        importance: clampImportance(input.importance ?? 5),
        type: pinned ? 'permanent' : 'dynamic',
        created: t,
        lastActive: t,
        activationCount: 0,
        pinned,
        resolved: false,
        dontSurface: false,
        whyRemembered: clip(String(input.whyRemembered ?? ''), LIMITS.MAX_WHY),
        sourceTool: 'hold',
      };
      vault.save(rec);
      opts.emit?.('hold', 'memory', { id: rec.id });
      return toPublic(rec);
    },

    grow(input: MemoryGrowInput): MemoryBucket[] {
      type GrowItem = NonNullable<MemoryGrowInput['items']>[number];
      const items: GrowItem[] = input.items?.length
        ? [...input.items]
        : splitGrow(String(input.content ?? '')).map((content) => ({ content }));
      if (items.length < 1) throw new Error('grow 需要 content 或 items');
      const out: MemoryBucket[] = [];
      for (const item of items.slice(0, LIMITS.GROW_MAX)) {
        out.push(
          api.hold({
            content: item.content,
            name: item.name,
            domain: item.domain,
            tags: item.tags ? [...item.tags] : undefined,
            valence: item.valence,
            arousal: item.arousal,
            importance: item.importance,
          }),
        );
      }
      for (const b of out) {
        const rec = vault.get(b.id);
        if (rec) {
          rec.sourceTool = 'grow';
          vault.save(rec);
        }
      }
      return out.map((b) => api.get(b.id)!);
    },

    trace(id: string, patch: MemoryTracePatch): MemoryBucket {
      const rec = all().find((b) => b.id === id);
      if (!rec) throw new Error(`记忆不存在: ${id}`);

      if (patch.restore === true) {
        if (rec.type === 'archived') rec.type = rec.pinned ? 'permanent' : 'dynamic';
      }
      if (patch.archive === true) {
        rec.type = 'archived';
      }
      if (patch.resolved !== undefined) rec.resolved = patch.resolved;
      if (patch.dontSurface !== undefined) rec.dontSurface = patch.dontSurface;
      if (patch.valence !== undefined) rec.valence = clamp01(patch.valence);
      if (patch.arousal !== undefined) rec.arousal = clamp01(patch.arousal);
      if (patch.importance !== undefined) rec.importance = clampImportance(patch.importance);
      if (patch.name !== undefined) rec.name = clip(String(patch.name), LIMITS.MAX_NAME);
      if (patch.body !== undefined) rec.body = String(patch.body).slice(0, LIMITS.MAX_BODY);

      if (patch.pinned !== undefined) {
        if (patch.pinned && countPinned(all(), rec.id) >= LIMITS.MAX_PINNED) {
          throw new Error(`核心准则已满（≤${LIMITS.MAX_PINNED}）`);
        }
        rec.pinned = patch.pinned;
        if (patch.pinned && rec.type === 'dynamic') rec.type = 'permanent';
        if (!patch.pinned && rec.type === 'permanent') rec.type = 'dynamic';
      }

      if (patch.reinforce === true) {
        rec.activationCount += 1;
        rec.lastActive = nowMs();
      }

      vault.save(rec);
      opts.emit?.('trace', 'memory', { id: rec.id, patch });
      return toPublic(rec);
    },

    renderBreath(): string {
      return api.breath().text;
    },
  };

  return api;
}
