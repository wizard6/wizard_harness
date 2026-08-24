/** 只读代码浏览（独立弹窗；编辑走 code-editor） */
export const CODE_BROWSER_SERVICE = 'codeBrowser';

export interface CodeBrowserInfo {
  readonly root: string;
}

export interface CodeBrowserReadResult {
  readonly path: string;
  readonly content: string;
  readonly lines: number;
}

export interface CodeBrowserService {
  info(): CodeBrowserInfo;
  read(rel: string): CodeBrowserReadResult;
  queueOpen(rel: string): void;
  takePendingOpen(): string | undefined;
}
