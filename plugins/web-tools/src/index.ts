import type { Plugin, PluginContext } from '@wizard-harness/core';
import { WEB_TOOLS_SERVICE } from '@wizard-harness/contracts';
import type { PromptContextService, ToolsService, WebToolsService } from '@wizard-harness/contracts';
import { WEB_TOOL_NAMES, createWebHost } from './host.js';
import { WEB_TOOLS_HTML } from './page.js';

/**
 * web-tools：搜索与阅读网页。先大纲再按节读取，避免整页灌进模型。
 * 说明文档：docs/plugins/web-tools.html
 */
let impl: WebToolsService | undefined;

function live(): WebToolsService {
  if (!impl) throw new Error('web-tools 未就绪');
  return impl;
}

const api: WebToolsService = {
  info: () => live().info(),
};

function wireTools(ctx: PluginContext, host: ReturnType<typeof createWebHost>) {
  const tools = ctx.tools ?? ctx.get<ToolsService>('tools');
  if (!tools) throw new Error('web-tools 需要 tools');
  tools.register({
    name: 'web_search',
    description:
      '搜索网页。args.query 必填；可选 args.count（默认 5，上限 8）。只返回 title/url/snippet，不抓正文。',
    handler: (args) => host.search(args),
  });
  tools.register({
    name: 'web_outline',
    description:
      '只取页面标题树与每节体积（省 token）。args.url 必填。然后用 web_read args.heading 读需要的一节。',
    handler: (args) => host.outline(args),
  });
  tools.register({
    name: 'web_read',
    description:
      '阅读页面或其中一节。args.url 必填；可选 args.heading（大纲 id 或标题片段）、args.mode=markdown|text（markdown 保留标题/列表/链接，text 去掉结构）、args.offset、args.max_chars（默认 6000）。长页且未指定 heading 时只返回大纲+预览，不倾倒全文。',
    handler: (args) => host.read(args),
  });
  tools.register({
    name: 'web_find',
    description:
      '在已抓取（或现抓）的页面里搜关键词。args.url + args.query。返回带章节上下文的短摘录，再用 web_read heading 读全文节。',
    handler: (args) => host.find(args),
  });
}

const webToolsPlugin: Plugin = {
  manifest: {
    id: 'web-tools',
    version: '0.1.0',
    name: '网页工具套件',
    description: '向 tools 登记 web_search / web_outline / web_read / web_find。先结构后片段。',
    provides: [WEB_TOOLS_SERVICE],
    config: {},
    tier: 'standard',
  },
  inject: { tools: true, logger: false, promptContext: false },
  api,
  ui: {
    title: '网页工具',
    width: 480,
    height: 360,
    rpc: { webTools: ['info'] },
    content: WEB_TOOLS_HTML,
  },
  register(c) {
    const host = createWebHost({
      braveKey: String(c.config.braveKey ?? process.env.WH_BRAVE_API_KEY ?? '').trim() || undefined,
      searxUrl: String(c.config.searxUrl ?? process.env.WH_SEARX_URL ?? '').trim() || undefined,
    });
    impl = {
      info: () => ({ engine: host.engine, tools: [...WEB_TOOL_NAMES], cacheEntries: host.cacheSize() }),
    };
    wireTools(c, host);
    const prompts = c.promptContext ?? c.get<PromptContextService>('promptContext');
    if (prompts) {
      prompts.section({
        name: 'tool:web-tools',
        order: 85,
        text:
          '网页：先 web_search 拿链接，再 web_outline 看标题树与每节体积，然后 web_read 用 heading 只读需要的一节。' +
          '要结构（标题/列表/链接）用 mode=markdown；只要正文用 mode=text。长页不要一次读完；页内关键词用 web_find。',
      });
    }
    c.logger?.info?.(`web-tools 插件就绪（engine=${host.engine}）`);
    c.effect(() => () => {
      impl = undefined;
    });
  },
};

export default webToolsPlugin;
