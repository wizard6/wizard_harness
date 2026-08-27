/**
 * 服务契约层：memory 服务。
 *
 * 跨会话经历记忆（Ombre-Brain 风格桶模型）。正文经 prompt-context 出门，
 * 不替代 persona（身份基线）与 session（本轮对话）。
 */
export const MEMORY_SERVICE = 'memory';

export type MemoryBucketType = 'dynamic' | 'permanent' | 'archived';

export interface MemoryBucket {
  readonly id: string;
  readonly name: string;
  readonly body: string;
  readonly domain: string;
  readonly tags: readonly string[];
  readonly valence: number;
  readonly arousal: number;
  readonly importance: number;
  readonly type: MemoryBucketType;
  readonly created: number;
  readonly lastActive: number;
  readonly activationCount: number;
  readonly pinned: boolean;
  readonly resolved: boolean;
  readonly dontSurface: boolean;
  readonly whyRemembered: string;
  readonly sourceTool: string;
}

export interface MemoryHoldInput {
  content: string;
  name?: string;
  domain?: string;
  tags?: string[];
  valence?: number;
  arousal?: number;
  importance?: number;
  pinned?: boolean;
  whyRemembered?: string;
}

export interface MemoryGrowInput {
  content?: string;
  items?: Array<{
    content: string;
    name?: string;
    domain?: string;
    tags?: string[];
    valence?: number;
    arousal?: number;
    importance?: number;
  }>;
}

export interface MemoryTracePatch {
  resolved?: boolean;
  pinned?: boolean;
  dontSurface?: boolean;
  valence?: number;
  arousal?: number;
  importance?: number;
  name?: string;
  body?: string;
  reinforce?: boolean;
  archive?: boolean;
  restore?: boolean;
}

export interface MemorySearchOpts {
  query: string;
  domain?: string;
  maxResults?: number;
  includeArchive?: boolean;
}

export interface MemorySearchHit {
  readonly bucket: MemoryBucket;
  readonly score: number;
}

export interface MemoryBreathResult {
  readonly core: readonly MemoryBucket[];
  readonly surfaced: readonly MemoryBucket[];
  readonly cold: readonly MemoryBucket[];
  readonly text: string;
}

export interface MemoryPulse {
  readonly vaultDir: string;
  readonly total: number;
  readonly active: number;
  readonly archived: number;
  readonly pinned: number;
  readonly unresolved: number;
}

export interface MemoryPreview {
  readonly breath: string;
}

export interface MemorySnapshot {
  readonly buckets: readonly MemoryBucket[];
  readonly pulse: MemoryPulse;
  readonly preview: MemoryPreview;
}

export interface MemoryService {
  snapshot(): MemorySnapshot;
  pulse(): MemoryPulse;
  list(opts?: { includeArchive?: boolean }): MemoryBucket[];
  get(id: string): MemoryBucket | undefined;
  breath(opts?: { maxResults?: number }): MemoryBreathResult;
  search(opts: MemorySearchOpts): MemorySearchHit[];
  hold(input: MemoryHoldInput): MemoryBucket;
  grow(input: MemoryGrowInput): MemoryBucket[];
  trace(id: string, patch: MemoryTracePatch): MemoryBucket;
}
