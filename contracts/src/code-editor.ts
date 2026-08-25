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


/** 打开目标：全文件或局部行范围（1-based 闭区间） */
export interface CodeEditorOpenTarget {
  readonly path: string;
  readonly startLine?: number;
  readonly endLine?: number;
}

/* 测试局部编辑功能 */
export interface CodeEditorService {
  info(): CodeEditorInfo;
  read(rel: string): CodeEditorReadResult;
  write(rel: string, content: string): { ok: true; path: string };
  /** 把局部编辑内容写回文件的指定行范围（1-based 闭区间） */
  patch(rel: string, startLine: number, endLine: number, content: string): { ok: true; path: string };
  /** 观测台 / 质量面板排队要在编辑器弹窗打开的文件；弹窗加载时 take 一次 */
  takePendingOpen(): CodeEditorOpenTarget | undefined;
  queueOpen(target: string | CodeEditorOpenTarget): void;
}
