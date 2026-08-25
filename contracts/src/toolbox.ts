/** 配置驱动的简易脚本工具盒：向 tools / workflow 登记可复用快捷操作 */
export const TOOLBOX_SERVICE = 'toolbox';

export type ToolboxScriptKind = 'shell' | 'open_path' | 'open_url';

export interface ToolboxParamInfo {
  readonly key: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly default?: string;
}

export interface ToolboxScriptInfo {
  readonly name: string;
  readonly label: string;
  readonly tool: string;
  readonly kind: ToolboxScriptKind;
  readonly description?: string;
  readonly workflowKind: string;
  readonly params: readonly ToolboxParamInfo[];
}

export interface ToolboxInfo {
  readonly cwd: string;
  readonly scripts: readonly ToolboxScriptInfo[];
}

export interface ToolboxRunResult {
  readonly ok: boolean;
  readonly content?: string;
  readonly error?: string;
}

export interface ToolboxService {
  info(): ToolboxInfo;
  list(): readonly ToolboxScriptInfo[];
  /** 人工 / UI 直接执行配置脚本（不经过 agent session） */
  run(
    name: string,
    args?: Record<string, unknown>,
    opts?: { workspace?: string },
  ): Promise<ToolboxRunResult>;
}
