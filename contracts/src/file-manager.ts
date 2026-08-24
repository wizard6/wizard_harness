/** 工作区文件管理（相对 root 的路径沙箱，非进程隔离） */
export const FILE_MANAGER_SERVICE = 'fileManager';

export interface FileManagerEntry {
  readonly name: string;
  readonly kind: 'file' | 'dir';
}

export interface FileManagerInfo {
  readonly root: string;
}

export interface FileManagerList {
  readonly path: string;
  readonly entries: readonly FileManagerEntry[];
}

export interface FileManagerService {
  info(): FileManagerInfo;
  list(rel?: string): FileManagerList;
}
