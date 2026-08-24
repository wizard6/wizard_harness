/** 工作区代码浏览 / 编辑（相对 root 的路径沙箱） */
export const CODE_EDITOR_SERVICE = 'codeEditor';

export interface CodeEditorInfo {
  readonly root: string;
}

export interface CodeEditorReadResult {
  readonly path: string;
  readonly content: string;
  readonly lines: number;
}

export interface CodeEditorService {
  info(): CodeEditorInfo;
  read(rel: string): CodeEditorReadResult;
  write(rel: string, content: string): { ok: true; path: string };
  /** 观测台 / 质量面板排队要在编辑器弹窗打开的文件；弹窗加载时 take 一次 */
  takePendingOpen(): string | undefined;
  queueOpen(rel: string): void;
}
