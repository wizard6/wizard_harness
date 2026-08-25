export interface Heading {
  id: string;
  level: number;
  text: string;
  chars: number;
}

export interface PageDoc {
  title: string;
  headings: Heading[];
  /** 按 heading 切开的 markdown 块；index 0 是标题前的前言 */
  sections: Array<{ heading?: Heading; markdown: string; text: string }>;
}

const HTML_RE = {
  block: /<(script|style|noscript|svg|iframe|canvas|form|template)[\s\S]*?<\/\1>/gi,
  empty: /<(br|hr|img|input|meta|link)\b[^>]*\/?>/gi,
};

export function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function pickMain(html: string): string {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article?.[1] && article[1].length > 80) return article[1];
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main?.[1] && main[1].length > 80) return main[1];
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return body?.[1] ?? html;
}

function attr(raw: string, name: string): string {
  const m = raw.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|(\\S+))`, 'i'));
  return decodeEntities(m?.[2] ?? m?.[3] ?? m?.[4] ?? '').trim();
}

function slug(text: string, i: number): string {
  const s = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `h${i}-${s || 'section'}`;
}

export function parsePage(html: string): PageDoc {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities(titleMatch?.[1] ?? '').replace(/\s+/g, ' ').trim();
  let src = pickMain(html).replace(HTML_RE.block, ' ').replace(HTML_RE.empty, ' ');
  src = src.replace(/<!--[\s\S]*?-->/g, ' ');

  const headings: Heading[] = [];
  const sections: PageDoc['sections'] = [{ markdown: '', text: '' }];
  let headingCount = 0;
  let listType: 'ul' | 'ol' | undefined;
  let ol = 0;

  const flushText = (chunk: string, toMd: (t: string) => string) => {
    const t = decodeEntities(chunk).replace(/\s+/g, ' ').trim();
    if (!t) return;
    const cur = sections[sections.length - 1]!;
    cur.text += (cur.text ? '\n' : '') + t;
    cur.markdown += (cur.markdown ? '\n\n' : '') + toMd(t);
  };

  const re = /<\/?([a-zA-Z0-9]+)(\s[^>]*)?>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const tag = m[1]?.toLowerCase();
    const rest = m[2] ?? '';
    const text = m[3];
    const close = Boolean(m[0]?.startsWith('</'));
    if (text) {
      flushText(text, (t) => t);
      continue;
    }
    if (!tag) continue;
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      if (close) continue;
      const inner = src.slice(re.lastIndex).match(/^([\s\S]*?)<\/h[1-6]>/i);
      if (!inner) continue;
      re.lastIndex += inner[0].length;
      const level = Number(tag[1]);
      const htext = decodeEntities(inner[1]!.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (!htext) continue;
      headingCount += 1;
      const h: Heading = { id: slug(htext, headingCount), level, text: htext, chars: 0 };
      headings.push(h);
      sections.push({ heading: h, markdown: `${'#'.repeat(level)} ${htext}`, text: htext });
      continue;
    }
    if (tag === 'a' && !close) {
      const href = attr(rest, 'href');
      const inner = src.slice(re.lastIndex).match(/^([\s\S]*?)<\/a>/i);
      if (!inner) continue;
      re.lastIndex += inner[0].length;
      const label = decodeEntities(inner[1]!.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (!label) continue;
      const cur = sections[sections.length - 1]!;
      cur.text += (cur.text && !cur.text.endsWith('\n') ? ' ' : '') + label;
      cur.markdown += (href ? `[${label}](${href})` : label);
      continue;
    }
    if (tag === 'pre') {
      if (close) continue;
      const inner = src.slice(re.lastIndex).match(/^([\s\S]*?)<\/pre>/i);
      if (!inner) continue;
      re.lastIndex += inner[0].length;
      const code = decodeEntities(inner[1]!.replace(/<\/?code\b[^>]*>/gi, '')).replace(/\n+$/g, '');
      const cur = sections[sections.length - 1]!;
      cur.text += (cur.text ? '\n' : '') + code;
      const fence = String.fromCharCode(96, 96, 96);
      cur.markdown += `${cur.markdown ? '\n\n' : ''}${fence}\n${code}\n${fence}`;
      continue;
    }
    if (tag === 'li' && !close) {
      const inner = src.slice(re.lastIndex).match(/^([\s\S]*?)<\/li>/i);
      if (!inner) continue;
      re.lastIndex += inner[0].length;
      const item = decodeEntities(inner[1]!.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (!item) continue;
      ol += 1;
      const bullet = listType === 'ol' ? `${ol}. ` : '- ';
      const cur = sections[sections.length - 1]!;
      cur.text += (cur.text ? '\n' : '') + item;
      cur.markdown += `${cur.markdown ? '\n' : ''}${bullet}${item}`;
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      if (!close) {
        listType = tag;
        ol = 0;
      } else listType = undefined;
      continue;
    }
    if (tag === 'p' || tag === 'div' || tag === 'br' || tag === 'tr') {
      const cur = sections[sections.length - 1]!;
      if (cur.markdown && !cur.markdown.endsWith('\n')) cur.markdown += '\n';
    }
  }

  for (const sec of sections) {
    sec.markdown = sec.markdown.replace(/\n{3,}/g, '\n\n').trim();
    sec.text = sec.text.replace(/\n{3,}/g, '\n\n').trim();
    if (sec.heading) sec.heading.chars = sec.markdown.length;
  }
  return { title, headings, sections: sections.filter((s) => s.markdown || s.heading) };
}

export function joinMarkdown(doc: PageDoc): string {
  return doc.sections.map((s) => s.markdown).filter(Boolean).join('\n\n').trim();
}

export function joinText(doc: PageDoc): string {
  return doc.sections.map((s) => s.text).filter(Boolean).join('\n\n').trim();
}

export function approxTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

export function matchSection(doc: PageDoc, heading: string): PageDoc['sections'][number] | undefined {
  const q = heading.trim().toLowerCase();
  if (!q) return undefined;
  return doc.sections.find((s) => {
    if (!s.heading) return false;
    return s.heading.id.toLowerCase() === q || s.heading.text.toLowerCase().includes(q);
  });
}
