/**
 * 服务契约层：elementTable — 通用周期元素表框架。
 *
 * 一张表 = 一个 catalog（游戏机制、小说元素、……）。
 * 各族 / 正式 / 演示 按 catalog 隔离；UI 与登记 API 与领域无关。
 */
export const ELEMENT_TABLE_SERVICE = 'elementTable';

/**
 * @deprecated 兼容旧名；插件会同时 provides elementTable 与 mechanicsTable（同一实现）。
 * 新代码请用 ELEMENT_TABLE_SERVICE / ctx.elementTable。
 */
export const MECHANICS_TABLE_SERVICE = 'mechanicsTable';

export type ElementGroupId = string;
export type ElementKind = 'formal' | 'demo';

export interface ElementCatalogMeta {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
}

export interface ElementCatalogInput {
  id: string;
  title: string;
  blurb?: string;
  periods?: number;
  /** 若 true，覆盖已有同 id catalog 的骨架（不删已登记元素） */
  replace?: boolean;
}

export interface ElementGroup {
  readonly id: ElementGroupId;
  readonly symbol: string;
  readonly name: string;
  readonly blurb: string;
  /** UI 色板键；缺省按登记顺序 */
  readonly tone?: string;
}

export interface TableElement {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly group: ElementGroupId;
  readonly period: number;
  readonly atomic: number;
  readonly blurb: string;
  /** 演示动画键（弱耦合：未知键走 generic） */
  readonly demo: string;
  readonly kind: ElementKind;
}

export interface ElementGroupInput {
  id: string;
  symbol: string;
  name: string;
  blurb?: string;
  tone?: string;
}

export interface TableElementInput {
  id: string;
  symbol: string;
  name: string;
  group: ElementGroupId;
  period: number;
  atomic?: number;
  blurb?: string;
  demo?: string;
  kind?: ElementKind;
  /** 缺省为当前选中 catalog */
  catalogId?: string;
}

export interface ElementListOpts {
  catalogId?: string;
  kind?: ElementKind | 'all';
}

export interface ElementTableSnapshot {
  readonly catalogId: string;
  readonly title: string;
  readonly blurb: string;
  readonly periods: number;
  readonly groups: readonly ElementGroup[];
  readonly formal: readonly TableElement[];
  readonly demo: readonly TableElement[];
  readonly showDemo: boolean;
  readonly elements: readonly TableElement[];
  readonly catalogs: readonly ElementCatalogMeta[];
}

export interface ElementTableService {
  listCatalogs(): readonly ElementCatalogMeta[];
  setCatalog(id: string): ElementTableSnapshot;
  snapshot(catalogId?: string): ElementTableSnapshot;
  list(opts?: ElementListOpts): readonly TableElement[];
  get(id: string, catalogId?: string): TableElement | undefined;
  registerCatalog(input: ElementCatalogInput): () => void;
  registerGroup(catalogId: string, input: ElementGroupInput): () => void;
  registerElement(input: TableElementInput): () => void;
  setShowDemo(show: boolean, catalogId?: string): ElementTableSnapshot;
}

/** @deprecated 使用 ElementGroupId */
export type MechanicsGroupId = ElementGroupId;
/** @deprecated 使用 ElementKind */
export type MechanicsElementKind = ElementKind;
/** @deprecated 使用 ElementGroup */
export type MechanicsGroup = ElementGroup;
/** @deprecated 使用 TableElement */
export type MechanicsElement = TableElement;
/** @deprecated 使用 TableElementInput */
export type MechanicsElementInput = TableElementInput;
/** @deprecated 使用 ElementGroupInput */
export type MechanicsGroupInput = ElementGroupInput;
/** @deprecated 使用 ElementListOpts */
export type MechanicsListOpts = ElementListOpts;
/** @deprecated 使用 ElementTableSnapshot */
export type MechanicsTableSnapshot = ElementTableSnapshot;
/** @deprecated 使用 ElementTableService */
export type MechanicsTableService = ElementTableService;
