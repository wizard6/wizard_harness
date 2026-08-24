import { describe, expect, it } from 'vitest';
import { formatsListHtml, renderMarkdown, SUPPORTED_RENDER_FORMATS } from '../src/markdown.js';
import { APP_UI_HTML } from '../src/page.js';

describe('app-ui markdown', () => {
  it('目前只登记 markdown，列表也只显示这一项', () => {
    expect(SUPPORTED_RENDER_FORMATS).toEqual(['markdown']);
    expect(formatsListHtml()).toBe(
      '<ul class="formats" id="formats" title="当前支持的气泡渲染"><li>markdown</li></ul>',
    );
  });

  it('标题 / 列表 / 加粗 / 行内代码 / 围栏', () => {
    const html = renderMarkdown(['# 标题', '', '- 一项', '- 二项', '', '看 **粗** 和 `code`。'].join('\n'));
    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<ul><li>一项</li><li>二项</li></ul>');
    expect(html).toContain('<strong>粗</strong>');
    expect(html).toContain('<code>code</code>');
    const fenced = renderMarkdown('```ts\nconst a = 1;\n```');
    expect(fenced).toContain('<pre><code class="lang-ts">const a = 1;</code></pre>');
  });

  it('转义 HTML；javascript 链接不当成 a', () => {
    const html = renderMarkdown('看 <script>alert(1)</script> 和 [x](javascript:alert(1))');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/<a [^>]*javascript:/i);
    const link = renderMarkdown('去 [站](https://example.com/a)');
    expect(link).toContain('<a href="https://example.com/a" target="_blank" rel="noreferrer">站</a>');
  });

  it('弹窗脚本里的 renderMarkdown 能独立执行', () => {
    const start = APP_UI_HTML.indexOf('function renderMarkdown');
    const end = APP_UI_HTML.indexOf('function mdHtml');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const src = APP_UI_HTML.slice(start, end);
    const fn = new Function(`${src}; return renderMarkdown;`)() as (s: string) => string;
    expect(fn('**ok**')).toContain('<strong>ok</strong>');
  });
});
