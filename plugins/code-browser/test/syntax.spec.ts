import { describe, expect, it } from 'vitest';
import { SYNTAX_CSS, SYNTAX_JS } from '../src/syntax.js';

describe('syntax 高亮', () => {
  it('导出 CSS 与运行时脚本', () => {
    expect(SYNTAX_CSS).toContain('.hl-kw');
    expect(SYNTAX_JS).toContain('highlightSource');
    expect(SYNTAX_JS).toContain('paintHighlight');
  });

  it('highlightSource 给 TS 关键字上色', () => {
    const fn = new Function(`${SYNTAX_JS}; return highlightSource;`)() as (
      code: string,
      path: string,
    ) => string;
    const html = fn('const x = 1; // note', 'a.ts');
    expect(html).toContain('hl-kw');
    expect(html).toContain('hl-num');
    expect(html).toContain('hl-cmt');
  });
});
