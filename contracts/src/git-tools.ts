/**
 * 服务契约层：gitTools 服务。
 *
 * 本地 git 工具套件：在工作区 root 内执行 git；向 tools 登记 git.* 工具。
 * 实现模式对齐 dev-tools，勿照搬 toolbox 脚本盒。
 */
export const GIT_TOOLS_SERVICE = 'gitTools';

export interface GitProbe {
  readonly available: boolean;
  readonly version?: string;
  readonly path?: string;
  readonly hint?: string;
}

export interface GitRunResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

export interface GitToolsInfo {
  readonly root: string;
  readonly probe: GitProbe;
  readonly isRepo: boolean;
  readonly branch?: string;
  readonly tools: readonly string[];
}

export interface GitToolsRunOpts {
  readonly root?: string;
  readonly args?: Record<string, unknown>;
}

export interface GitToolsService {
  probe(): GitProbe;
  info(root?: string): GitToolsInfo;
  infoAsync(root?: string): Promise<GitToolsInfo>;
  run(actionId: string, opts?: GitToolsRunOpts): Promise<GitRunResult>;
}

export function gitToolName(action: string): string {
  return `git.${action.trim()}`;
}
