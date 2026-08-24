/**
 * 服务契约层：sandbox 服务。
 *
 * 工作区路径沙箱：读写只能落在 root 内。不是插件进程隔离（基座明确不做）。
 */
export const SANDBOX_SERVICE = 'sandbox';

export interface SandboxEntry {
  readonly name: string;
  readonly kind: 'file' | 'dir';
}

export interface SandboxInfo {
  readonly root: string;
}

export interface SandboxList {
  readonly path: string;
  readonly entries: readonly SandboxEntry[];
}

export interface SandboxService {
  info(): SandboxInfo;
  resolve(rel?: string): string;
  list(rel?: string): SandboxList;
  read(rel: string): string;
  write(rel: string, content: string): void;
}
