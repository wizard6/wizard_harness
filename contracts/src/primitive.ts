/**
 * Primitive 仓库：更小维度的 skill 提示词原子。
 *
 * 不是 Skill。Skill 是整份说明书、常驻/按需直接注入 prompt-context。
 * 结构：树（parentId 分解）+ 双向链（有向边，两端都能查到对方）。
 * Primitive 只登记与按标签查看；注入与编排走启发式/AI，本切片不做。
 */
export const PRIMITIVE_SERVICE = 'primitive';

/** 已认可的三个分类标签（英文）；UI 用绿色标识。旧标签仍保留。 */
export const APPROVED_PRIMITIVE_TAGS = ['behavior', 'evaluate', 'guide'] as const;
export type ApprovedPrimitiveTag = (typeof APPROVED_PRIMITIVE_TAGS)[number];

/** 与启发式思考算子对齐的可选主类；分类仍以 tags 为准。 */
export type PrimitiveThinkKind =
  | 'observe'
  | 'ask'
  | 'split'
  | 'evidence'
  | 'forbid'
  | 'gate'
  | 'propose'
  | 'cell'
  | 'freeze';

export interface PrimitiveInfo {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly thinkKind?: PrimitiveThinkKind;
  /** 树上的父节点；缺省为根。 */
  readonly parentId?: string;
}

export interface PrimitiveRecord extends PrimitiveInfo {
  readonly body: string;
}

/** 有向边。仓库按两端建索引，从任一端都能走到另一端。 */
export interface PrimitiveLink {
  readonly source: string;
  readonly target: string;
  readonly kind: string;
}

export interface PrimitiveTreeNode {
  readonly id: string;
  readonly name: string;
  readonly children: readonly PrimitiveTreeNode[];
}

export interface PrimitiveNeighbor {
  readonly id: string;
  readonly name: string;
  readonly relation: 'parent' | 'child' | 'link';
  readonly dir: 'in' | 'out';
  readonly kind?: string;
}

export interface PrimitiveTagCount {
  readonly tag: string;
  readonly count: number;
}

export interface PrimitiveSnapshot {
  readonly primitives: readonly PrimitiveInfo[];
  readonly tags: readonly PrimitiveTagCount[];
  readonly approvedTags: readonly string[];
  readonly tree: readonly PrimitiveTreeNode[];
  readonly links: readonly PrimitiveLink[];
}

export interface PrimitiveRouteOpts {
  readonly hint?: string;
  readonly startId?: string;
  readonly tag?: string;
  readonly limit?: number;
}

export type PrimitiveRouteVia = 'seed' | 'tree' | 'then' | 'constrains' | 'relates';
export type PrimitiveRouteLane = 'guide' | 'evaluate' | 'behavior' | 'other';

export interface PrimitiveRouteStep {
  readonly order: number;
  readonly id: string;
  readonly name: string;
  readonly via: PrimitiveRouteVia;
  readonly reason: string;
  readonly score: number;
  readonly lane: PrimitiveRouteLane;
}

export interface PrimitiveRoute {
  readonly algorithm: string;
  readonly query: PrimitiveRouteOpts;
  readonly seeds: readonly string[];
  readonly steps: readonly PrimitiveRouteStep[];
  readonly edges: readonly PrimitiveLink[];
  readonly load: number;
  readonly loadCap: number;
}

export interface PrimitiveService {
  snapshot(): PrimitiveSnapshot;
  list(): readonly PrimitiveInfo[];
  get(id: string): PrimitiveRecord | undefined;
  tags(): readonly PrimitiveTagCount[];
  listByTag(tag: string): readonly PrimitiveInfo[];
  tree(): readonly PrimitiveTreeNode[];
  links(): readonly PrimitiveLink[];
  neighbors(id: string): readonly PrimitiveNeighbor[];
  route(opts?: PrimitiveRouteOpts): PrimitiveRoute;
}
