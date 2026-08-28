/**
 * 服务契约层：workspace。
 *
 * 个人工作台壳：瓷砖登记 + 快照。浏览器静态页与 Electron 弹窗（托盘打开）共用服务。
 * 后续插件 inject workspace（可选）后 registerTile，卸载时撤销。
 */
export const WORKSPACE_SERVICE = 'workspace';

export type WorkspaceTileKind = 'panel' | 'soon';

export interface WorkspaceTile {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  readonly kind: WorkspaceTileKind;
  /** 控制台视图名：home / plugins / publish；soon 可省略 */
  readonly view?: string;
}

export interface WorkspaceSnapshot {
  readonly title: string;
  readonly tiles: readonly WorkspaceTile[];
}

export interface WorkspacePluginInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface WorkspaceService {
  snapshot(): WorkspaceSnapshot;
  tiles(): readonly WorkspaceTile[];
  /** 当前运行时已 register 且未卸载的插件（从事件账还原） */
  loaded(): readonly WorkspacePluginInfo[];
  /** 登记一块瓷砖；返回撤销函数 */
  registerTile(tile: WorkspaceTile): () => void;
}
