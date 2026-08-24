export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export function parseDdgHtml(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = unwrapDdg(decodeHref(m[1] ?? ''));
    const title = stripTags(m[2] ?? '');
    if (!url || !title) continue;
    hits.push({ title, url, snippet: '' });
  }
  const snips = [...html.matchAll(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)].map((x) =>
    stripTags(x[1] ?? ''),
  );
  for (let i = 0; i < hits.length; i += 1) {
    if (snips[i]) hits[i] = { ...hits[i]!, snippet: snips[i]! };
  }
  if (hits.length) return dedupe(hits);
  const alt = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = alt.exec(html))) {
    const url = m[1] ?? '';
    const title = stripTags(m[2] ?? '');
    if (!url || !title || /duckduckgo\.com/i.test(url)) continue;
    hits.push({ title, url, snippet: '' });
    if (hits.length >= 10) break;
  }
  return dedupe(hits);
}

export function parseSearxJson(data: unknown): SearchHit[] {
  const rows = (data as { results?: Array<{ title?: string; url?: string; content?: string }> }).results ?? [];
  return dedupe(
    rows
      .map((r) => ({ title: String(r.title ?? '').trim(), url: String(r.url ?? '').trim(), snippet: String(r.content ?? '').trim() }))
      .filter((r) => r.title && r.url.startsWith('http')),
  );
}

export function parseBraveJson(data: unknown): SearchHit[] {
  const rows = (data as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }).web
    ?.results ?? [];
  return dedupe(
    rows
      .map((r) => ({
        title: String(r.title ?? '').trim(),
        url: String(r.url ?? '').trim(),
        snippet: String(r.description ?? '').trim(),
      }))
      .filter((r) => r.title && r.url.startsWith('http')),
  );
}

function unwrapDdg(href: string): string {
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : u.href;
  } catch {
    return href;
  }
}

function decodeHref(href: string): string {
  return href.replace(/&amp;/g, '&');
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function dedupe(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    out.push(h);
  }
  return out;
}
