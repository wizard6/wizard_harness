import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { WEB_TOOLS_SERVICE } from '@wizard-harness/contracts';
import type { ToolsService, WebToolsService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import toolsPlugin from '../../tools/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import webToolsPlugin from '../src/index.js';
import { WEB_TOOLS_HTML } from '../src/page.js';
import { createWebHost } from '../src/host.js';
import { joinMarkdown, parsePage } from '../src/html.js';
import { parseDdgHtml } from '../src/search.js';
import { assertPublicHttpUrl, isPrivateIp } from '../src/ssrf.js';

const PAGE = `<!doctype html><html><head><title>API Guide</title></head><body>
<nav>skip me</nav>
<article>
<h1>Intro</h1>
<p>${'alpha '.repeat(800)}</p>
<h2>Authentication</h2>
<p>Use an <a href="/auth">API key</a>.</p>
<ul><li>keep secrets</li></ul>
<h2>Limits</h2>
<p>Rate limit is 60.</p>
</article></body></html>`;

describe('web-tools 解析', () => {
  it('html：markdown 留结构，text 去掉；按标题切段', () => {
    const doc = parsePage(PAGE);
    expect(doc.title).toBe('API Guide');
    expect(doc.headings.map((h) => h.text)).toEqual(['Intro', 'Authentication', 'Limits']);
    const md = joinMarkdown(doc);
    expect(md).toMatch(/^# Intro/m);
    expect(md).toContain('[API key](/auth)');
    expect(md).toContain('- keep secrets');
    const auth = doc.sections.find((s) => s.heading?.text === 'Authentication');
    expect(auth?.text).toMatch(/API key/);
    expect(auth?.text).not.toContain('[');
  });

  it('ddg 结果解开 uddg', () => {
    const html =
      '<a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">Example A</a>' +
      '<a class="result__snippet">hello world</a>';
    expect(parseDdgHtml(html)).toEqual([{ title: 'Example A', url: 'https://example.com/a', snippet: 'hello world' }]);
  });

  it('拒绝内网 URL', async () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.2')).toBe(true);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    await expect(assertPublicHttpUrl('http://127.0.0.1/')).rejects.toThrow(/内网/);
    await expect(assertPublicHttpUrl('http://evil.test/', async () => ['192.168.1.8'])).rejects.toThrow(/内网/);
  });
});

describe('web-tools 插件', () => {
  it('服务名 + inject + ui.rpc', () => {
    expect(WEB_TOOLS_SERVICE).toBe('webTools');
    expect(webToolsPlugin.manifest.provides).toEqual(['webTools']);
    expect(webToolsPlugin.inject).toEqual({ tools: true, logger: false, promptContext: false });
    expect(webToolsPlugin.ui?.rpc).toEqual({ webTools: ['info'] });
    expect(WEB_TOOLS_HTML).toContain('webTools');
  });

  it('search / outline / read 节选 / 长页不倾倒 / find；同 URL 走缓存', async () => {
    let fetches = 0;
    const host = createWebHost({
      lookup: async () => ['1.1.1.1'],
      fetch: async (input) => {
        fetches += 1;
        const url = String(input);
        if (url.includes('duckduckgo.com')) {
          return new Response(
            '<a class="result__a" href="https://example.com/doc">API Guide</a><a class="result__snippet">docs</a>',
            { status: 200, headers: { 'content-type': 'text/html' } },
          );
        }
        return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } });
      },
    });

    const found = await host.search({ query: 'api guide', count: 3 });
    expect(found.engine).toBe('duckduckgo');
    expect(found.results[0]?.url).toBe('https://example.com/doc');

    const outline = (await host.outline({ url: 'https://example.com/doc' })) as {
      headings: Array<{ text: string }>;
      chars: number;
    };
    expect(outline.headings.map((h) => h.text)).toContain('Authentication');
    expect(outline.chars).toBeGreaterThan(1000);

    const dumped = (await host.read({ url: 'https://example.com/doc', max_chars: 800 })) as {
      truncated: boolean;
      headings?: unknown[];
      content?: string;
    };
    expect(dumped.truncated).toBe(true);
    expect(dumped.headings?.length).toBeGreaterThan(0);
    expect(dumped.content).toBeUndefined();

    const section = (await host.read({ url: 'https://example.com/doc', heading: 'Authentication' })) as {
      content: string;
      truncated: boolean;
    };
    expect(section.content).toMatch(/## Authentication/);
    expect(section.content).toContain('[API key](/auth)');
    expect(section.content).not.toMatch(/Rate limit/);

    const plain = (await host.read({
      url: 'https://example.com/doc',
      heading: 'Authentication',
      mode: 'text',
    })) as { content: string };
    expect(plain.content).toContain('API key');
    expect(plain.content).not.toContain('](/auth)');

    const hits = (await host.find({ url: 'https://example.com/doc', query: 'Rate limit' })) as {
      matches: Array<{ heading: string }>;
    };
    expect(hits.matches[0]?.heading).toBe('Limits');

    const before = fetches;
    await host.read({ url: 'https://example.com/doc', heading: 'Limits' });
    expect(fetches).toBe(before);
  });

  it('登记四个工具并写入 prompt-context', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    await harness.registry.register(toolsPlugin);
    await harness.registry.register(webToolsPlugin);
    const tools = harness.services.get<ToolsService>('tools')!;
    expect(tools.list().map((t) => t.name)).toEqual(
      expect.arrayContaining(['web_search', 'web_outline', 'web_read', 'web_find']),
    );
    expect(harness.services.get<WebToolsService>('webTools')!.info().engine).toBe('duckduckgo');
    const inspect = harness.services.get('promptContext') as { inspect: () => { sources: Array<{ name: string }> } };
    expect(inspect.inspect().sources.some((s) => s.name === 'tool:web-tools')).toBe(true);
  });
});
