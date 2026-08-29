/**
 * 服务契约层：pieMenu — Kando 风格扇形快捷菜单。
 *
 * 树形菜单 + 扇区点选 / 拖拽标记；叶子可打开插件或发出自定义 action。
 */
export const PIE_MENU_SERVICE = 'pieMenu';

export type PieItemKind = 'submenu' | 'openPlugin' | 'action';

export interface PieMenuItem {
  readonly id: string;
  readonly label: string;
  /** 扇区中心短标（emoji / 1–2 字） */
  readonly icon?: string;
  readonly kind: PieItemKind;
  readonly children?: readonly PieMenuItem[];
  /** kind=openPlugin */
  readonly pluginId?: string;
  /** kind=action：自定义动作 id，供外部监听 */
  readonly action?: string;
  /** 可选固定角度（度，0=上，顺时针）；缺省均分 */
  readonly angle?: number;
}

export interface PieMenuItemInput {
  id: string;
  label: string;
  icon?: string;
  kind: PieItemKind;
  children?: PieMenuItemInput[];
  pluginId?: string;
  action?: string;
  angle?: number;
}

export interface PieMenuSnapshot {
  readonly title: string;
  readonly root: PieMenuItem;
}

export type PieActivateEffect =
  | { readonly effect: 'submenu'; readonly node: PieMenuItem }
  | { readonly effect: 'openPlugin'; readonly pluginId: string }
  | { readonly effect: 'action'; readonly action: string }
  | { readonly effect: 'noop' };

export interface PieMenuService {
  snapshot(): PieMenuSnapshot;
  get(id: string): PieMenuItem | undefined;
  /** 激活节点：子菜单返回 node；叶子执行 openPlugin / action */
  activate(id: string): PieActivateEffect;
  /** 替换整棵菜单树（含根） */
  setRoot(root: PieMenuItemInput): PieMenuSnapshot;
  /** 在 parentId 下挂一项；parent 须为 submenu；返回撤销函数 */
  registerItem(parentId: string, item: PieMenuItemInput): () => void;
}
