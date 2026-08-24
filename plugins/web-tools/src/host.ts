import { assertPublicHttpUrl } from './ssrf.js';
import { approxTokens, joinMarkdown, joinText, matchSection, parsePage, type PageDoc } from './html.js';
import { parseBraveJson, parseDdgHtml, parseSearxJson, type SearchHit } from './search.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 24;
const BODY_CAP = 800_000;
const DEFAULT_MAX_CHARS = 6000;
const HARD_MAX_CHARS = 20_000;
const SMALL_PAGE = 4000;

export const WEB_TOOL_NAMES = ['web_search', 'web_outline', 'web_read', 'web_find'] as const;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface WebHostOptions {
  fetch?: FetchLike;
  lookup?: (hostname: string) => Promise<string[]>;
  now?: () => number;
  braveKey?: string;
  searxUrl?: string;
  timeoutMs?: number;
}

interface CacheEntry {
  at: number;
  url: string;
  contentType: string;
  html: string;
  doc: PageDoc;
}

export interface WebHost {
  engine: string;
  cacheSize(): number;
  search(args: Record<string, unknown>): Promise<{ query: string; engine: string; results: SearchHit[] }>;
  outline(args: Record<string, unknown>): Promise<unknown>;
  read(args: Record<string, unknown>): Promise<unknown>;
  find(args: Record<string, unknown>): Promise<unknown>;
}

export function createWebHost(opts: WebHostOptions = {}): WebHost {
  const doFetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const cache = new Map<string, CacheEntry>();
  const engine = opts.braveKey ? 'brave' : opts.searxUrl ? 'searx' : 'duckduckgo';

  function cacheGet(url: string): CacheEntry | undefined {
    const hit = cache.get(url);
    if (!hit) return undefined;
    if (now() - hit.at > CACHE_TTL_MS) {
      cache.delete(url);
      return undefined;
    }
    return hit;
  }

  function cacheSet(entry: CacheEntry): void {
    cache.delete(entry.url);
    cache.set(entry.url, entry);
    while (cache.size > CACHE_MAX) {
      const first = cache.keys().next().value as string | undefined;
      if (first === undefined) break;
      cache.delete(first);
    }
  }

  async function loadPage(rawUrl: string): Promise<CacheEntry> {
    const url = await assertPublicHttpUrl(rawUrl, opts.lookup);
    const key = url.href.replace(/#.*$/, '');
    const cached = cacheGet(key);
    if (cached) return cached;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(key, {
        method: 'GET',
        redirect: 'follow',
        signal: ac.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'user-agent': UA,
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`抓取失败 HTTP ${res.status}`);
    const finalUrl = res.url || key;
    if (finalUrl !== key) await assertPublicHttpUrl(finalUrl, opts.lookup);
    const buf = new Uint8Array(await res.arrayBuffer());
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf.byteLength > BODY_CAP ? buf.slice(0, BODY_CAP) : buf);
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (type.includes('pdf')) throw new Error('暂不支持 PDF，请换 HTML 页面');
    const doc = type.includes('json')
      ? parsePage(`<title>json</title><pre>${escapeHtml(html.slice(0, 80_000))}</pre>`)
      : parsePage(html);
    const entry: CacheEntry = { at: now(), url: key, contentType: type, html, doc };
    cacheSet(entry);
    return entry;
  }

  return {
    engine,
    cacheSize: () => cache.size,
    async search(args) {
      const query = String(args.query ?? args.q ?? '').trim();
      if (!query) throw new Error('web_search 需要 args.query');
      const count = clampInt(args.count, 5, 1, 8);
      const hits = await runSearch(query, { doFetch, timeoutMs, braveKey: opts.braveKey, searxUrl: opts.searxUrl, engine });
      return { query, engine, results: hits.slice(0, count) };
    },
    async outline(args) {
      const url = String(args.url ?? '').trim();
      if (!url) throw new Error('web_outline 需要 args.url');
      const page = await loadPage(url);
      const md = joinMarkdown(page.doc);
      return {
        url: page.url,
        title: page.doc.title,
        chars: md.length,
        approxTokens: approxTokens(md.length),
        headings: page.doc.headings.map((h) => ({
          id: h.id,
          level: h.level,
          text: h.text,
          chars: h.chars,
          approxTokens: approxTokens(h.chars),
        })),
        hint: page.doc.headings.length
          ? '用 web_read args.heading 只读需要的一节（id 或标题片段）。'
          : '没有标题结构，用 web_read args.offset / args.max_chars 分页。',
      };
    },
    async read(args) {
      const url = String(args.url ?? '').trim();
      if (!url) throw new Error('web_read 需要 args.url');
      const mode = String(args.mode ?? 'markdown').toLowerCase() === 'text' ? 'text' : 'markdown';
      const maxChars = clampInt(args.max_chars, DEFAULT_MAX_CHARS, 500, HARD_MAX_CHARS);
      const offset = Math.max(0, Number(args.offset ?? 0) || 0);
      const heading = String(args.heading ?? args.section ?? '').trim();
      const page = await loadPage(url);
      const picked = heading ? matchSection(page.doc, heading) : undefined;
      if (heading && !picked) {
        return {
          url: page.url,
          title: page.doc.title,
          ok: false,
          error: `没有匹配的章节：${heading}`,
          headings: page.doc.headings.map((h) => ({ id: h.id, level: h.level, text: h.text, chars: h.chars })),
        };
      }
      const full = picked
        ? mode === 'text'
          ? picked.text
          : picked.markdown
        : mode === 'text'
          ? joinText(page.doc)
          : joinMarkdown(page.doc);
      if (!heading && !offset && full.length > SMALL_PAGE && full.length > maxChars) {
        return {
          url: page.url,
          title: page.doc.title,
          mode,
          truncated: true,
          chars: full.length,
          approxTokens: approxTokens(full.length),
          preview: sliceWindow(full, 0, Math.min(1200, maxChars)),
          headings: page.doc.headings.map((h) => ({
            id: h.id,
            level: h.level,
            text: h.text,
            chars: h.chars,
            approxTokens: approxTokens(h.chars),
          })),
          hint: '页面过长，未倾倒全文。用 web_read args.heading 读一节，或 args.offset 翻页；mode=text 可再省结构。',
        };
      }
      const window = sliceWindow(full, offset, maxChars);
      const nextOffset = offset + window.length < full.length ? offset + window.length : undefined;
      return {
        url: page.url,
        title: page.doc.title,
        mode,
        heading: heading || undefined,
        offset,
        chars: full.length,
        approxTokens: approxTokens(full.length),
        truncated: nextOffset !== undefined,
        nextOffset,
        content: window,
        hint: nextOffset !== undefined ? `还有后续。args.offset=${nextOffset}` : undefined,
      };
    },
    async find(args) {
      const url = String(args.url ?? '').trim();
      const query = String(args.query ?? args.pattern ?? '').trim();
      if (!url) throw new Error('web_find 需要 args.url');
      if (!query) throw new Error('web_find 需要 args.query');
      const page = await loadPage(url);
      const q = query.toLowerCase();
      const matches: Array<{ heading: string; text: string }> = [];
      for (const sec of page.doc.sections) {
        const body = sec.text;
        let from = 0;
        while (matches.length < 12) {
          const at = body.toLowerCase().indexOf(q, from);
          if (at < 0) break;
          const a = Math.max(0, at - 80);
          const b = Math.min(body.length, at + query.length + 80);
          matches.push({
            heading: sec.heading?.text ?? '(前言)',
            text: (a > 0 ? '…' : '') + body.slice(a, b) + (b < body.length ? '…' : ''),
          });
          from = at + query.length;
        }
        if (matches.length >= 12) break;
      }
      return {
        url: page.url,
        title: page.doc.title,
        query,
        matches,
        truncated: matches.length >= 12,
        hint: matches.length ? '用 web_read args.heading 读命中的那一节。' : '没有命中。',
      };
    },
  };
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sliceWindow(text: string, offset: number, max: number): string {
  if (offset >= text.length) return '';
  return text.slice(offset, offset + max);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function runSearch(
  query: string,
  ctx: {
    doFetch: FetchLike;
    timeoutMs: number;
    braveKey?: string;
    searxUrl?: string;
    engine: string;
  },
): Promise<SearchHit[]> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ctx.timeoutMs);
  try {
    if (ctx.engine === 'brave' && ctx.braveKey) {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`;
      const res = await ctx.doFetch(url, {
        signal: ac.signal,
        headers: { accept: 'application/json', 'x-subscription-token': ctx.braveKey, 'user-agent': UA },
      });
      if (!res.ok) throw new Error(`Brave 搜索失败 HTTP ${res.status}`);
      return parseBraveJson(await res.json());
    }
    if (ctx.engine === 'searx' && ctx.searxUrl) {
      const base = ctx.searxUrl.replace(/\/$/, '');
      const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
      const res = await ctx.doFetch(url, { signal: ac.signal, headers: { accept: 'application/json', 'user-agent': UA } });
      if (!res.ok) throw new Error(`SearX 搜索失败 HTTP ${res.status}`);
      return parseSearxJson(await res.json());
    }
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await ctx.doFetch(url, {
      signal: ac.signal,
      headers: { accept: 'text/html', 'user-agent': UA },
    });
    if (!res.ok) throw new Error(`DuckDuckGo 搜索失败 HTTP ${res.status}`);
    return parseDdgHtml(await res.text());
  } finally {
    clearTimeout(timer);
  }
}
