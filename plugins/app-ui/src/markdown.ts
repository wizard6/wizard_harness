/** 助手气泡当前支持的渲染格式。多了就往数组里加，顶栏列表跟着变。 */
export const SUPPORTED_RENDER_FORMATS = ['markdown'] as const;

/**
 * 轻量 Markdown → HTML。函数必须自包含（无外层闭包），才会被塞进弹窗脚本。
 * 不执行原文 HTML；链接只放行 http(s)。
 */
export function renderMarkdown(src: string): string {
  function esc(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function inline(raw: string): string {
    let s = esc(raw);
    s = s.replace(/`([^`]+)`/g, function (_m, code: string) {
      return '<code>' + code + '</code>';
    });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, function (_m, label: string, href: string) {
      return '<a href="' + href + '" target="_blank" rel="noreferrer">' + label + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    return s;
  }

  function isUl(line: string): boolean {
    return /^\s*[-*+]\s+/.test(line);
  }
  function isOl(line: string): boolean {
    return /^\s*\d+\.\s+/.test(line);
  }
  function isQuote(line: string): boolean {
    return /^\s*>\s?/.test(line);
  }

  function block(chunk: string): string {
    const t = chunk.trim();
    if (!t) return '';
    const fence = t.match(/^%%FENCE(\d+)%%$/);
    if (fence) return '%%FENCE' + fence[1] + '%%';
    const lines = t.split('\n');
    const heading = (lines[0] ?? '').match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const n = String(heading[1]).length;
      const rest = lines.slice(1).join('\n').trim();
      return (
        '<h' + n + '>' + inline(heading[2] ?? '') + '</h' + n + '>' +
        (rest ? '<p>' + inline(rest).replace(/\n/g, '<br>') + '</p>' : '')
      );
    }
    if (lines.length && lines.every(isUl)) {
      const items = lines.map(function (ln) {
        return '<li>' + inline(ln.replace(/^\s*[-*+]\s+/, '')) + '</li>';
      });
      return '<ul>' + items.join('') + '</ul>';
    }
    if (lines.length && lines.every(isOl)) {
      const items = lines.map(function (ln) {
        return '<li>' + inline(ln.replace(/^\s*\d+\.\s+/, '')) + '</li>';
      });
      return '<ol>' + items.join('') + '</ol>';
    }
    if (lines.length && lines.every(isQuote)) {
      const body = lines.map(function (ln) {
        return ln.replace(/^\s*>\s?/, '');
      }).join('\n');
      return '<blockquote>' + inline(body).replace(/\n/g, '<br>') + '</blockquote>';
    }
    return '<p>' + inline(t).replace(/\n/g, '<br>') + '</p>';
  }

  const text = String(src ?? '').replace(/\r\n/g, '\n');
  if (!text.trim()) return '';
  const fences: string[] = [];
  const prepared = text.replace(/```([^\n`]*)\n([\s\S]*?)```/g, function (_m, lang: string, code: string) {
    const i = fences.length;
    const name = String(lang ?? '')
      .trim()
      .replace(/[^a-zA-Z0-9_+-]/g, '')
      .slice(0, 24);
    const cls = name ? ' class="lang-' + name + '"' : '';
    fences.push('<pre><code' + cls + '>' + esc(String(code).replace(/\n$/, '')) + '</code></pre>');
    return '\n\n%%FENCE' + i + '%%\n\n';
  });
  const html = prepared
    .split(/\n{2,}/)
    .map(block)
    .filter(Boolean)
    .join('');
  return html.replace(/%%FENCE(\d+)%%/g, function (_m, n: string) {
    return fences[Number(n)] ?? '';
  });
}

export function formatsListHtml(): string {
  const items = SUPPORTED_RENDER_FORMATS.map((f) => `<li>${f}</li>`).join('');
  return `<ul class="formats" id="formats" title="当前支持的气泡渲染">${items}</ul>`;
}
