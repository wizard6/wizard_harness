/**
 * Cordis / DeepSeek Harness 风格的装配行与 patch 层。
 *
 * 本仓库裁剪：JSON 而非 YAML；不做 group / isolate / !!js；
 * 插件 id 全局唯一（entry.id 建议等于 name；同插件多实例不做）。
 */

/** 组合树里的一行：稳定 id + 要挂载的插件名 */
export interface PluginEntry {
  id: string;
  /** 解析到的插件（manifest.id / 目录名） */
  name: string;
  disabled?: boolean;
  /** 注入该插件的配置分片（层间整份替换，非深合并） */
  config?: Record<string, unknown>;
}

/**
 * 一条 patch：按 id 覆盖已有行，和/或 insert 新行。
 * 对齐 cordis-include PatchOptions 的可落地子集。
 */
export interface PatchOptions {
  /** 覆盖目标行 */
  id?: string;
  name?: string;
  disabled?: boolean;
  /** 整份替换该行 config，必须重写要保留的字段 */
  config?: Record<string, unknown>;
  insert?: PluginEntry[];
  /** insert 锚点：插到该 id 之前 / 之后；都不传则追加 */
  before?: string;
  after?: string;
}

export interface ApplyPatchesResult {
  entries: PluginEntry[];
  /** 目标 id 不存在等非致命问题（DSH：stderr 警告，不中断） */
  warnings: string[];
}

export interface LoadedBundle {
  name: string;
  dir: string;
  patches: PatchOptions[];
}

export interface CompositionSnapshot {
  profile: string;
  profileDir: string;
  bundles: string[];
  entries: PluginEntry[];
  warnings: string[];
}

export interface LoadProfileOptions {
  profileDir: string;
  /** 仓库内 bundles/ 目录（第一锚点） */
  bundlesDir?: string;
  /** $WH_HOME，可选机级 wizard.patch.json */
  homeDir?: string;
  /** 额外 overlay（对齐 --patch），后写覆盖 */
  overlays?: readonly (readonly PatchOptions[])[];
}
