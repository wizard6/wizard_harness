import type { Plugin, PluginContext } from '@wizard-harness/core';
import type { PrimitiveRouteOpts, PrimitiveService, ToolsService } from '@wizard-harness/contracts';
import { PRIMITIVE_SERVICE } from '@wizard-harness/contracts';
import { createPrimitiveHost } from './host.js';
import { PRIMITIVE_HTML } from './page.js';

/**
 * primitive：更小维度的 skill 提示词仓库（查看 + 树 + 双向链 + 内部路由预览）。
 * 注入/编排必须走启发式或 AI，不准做成 skills 那种直接注入。
 * 说明文档：docs/plugins/primitive.html
 * AI 调用：.cursor/skills/primitive-warehouse/SKILL.md
 */
let host = createPrimitiveHost();

const api: PrimitiveService = {
  snapshot: () => host.snapshot(),
  list: () => host.list(),
  get: (id) => host.get(id),
  tags: () => host.tags(),
  listByTag: (tag) => host.listByTag(tag),
  tree: () => host.tree(),
  links: () => host.links(),
  neighbors: (id) => host.neighbors(id),
  route: (opts) => host.route(opts),
};

function asRouteOpts(args: Record<string, unknown>): PrimitiveRouteOpts {
  return {
    hint: args.hint != null ? String(args.hint) : undefined,
    startId: args.startId != null ? String(args.startId) : undefined,
    tag: args.tag != null ? String(args.tag) : undefined,
    limit: args.limit != null ? Number(args.limit) : undefined,
  };
}

function wireTools(c: PluginContext) {
  const tools = c.tools ?? c.get<ToolsService>('tools');
  if (!tools) return;
  tools.register({
    name: 'primitive_list',
    description:
      '列出思考 Primitive（更小维度提示词：id/名称/简介/标签/树父节点）。不是 Skill，不要整包注入。无参数；可选 args.tag 过滤。',
    handler: (args) => {
      const tag = String(args.tag ?? '').trim();
      return { primitives: tag ? host.listByTag(tag) : host.list() };
    },
  });
  tools.register({
    name: 'primitive_get',
    description: '读取一条 Primitive 正文。args.id 必填。用于按需查看「怎么想」，禁止 alwaysApply。',
    handler: (args) => {
      const id = String(args.id ?? '').trim();
      if (!id) throw new Error('primitive_get 需要 args.id');
      const row = host.get(id);
      if (!row) throw new Error(`Primitive 不存在：${id}`);
      return row;
    },
  });
  tools.register({
    name: 'primitive_neighbors',
    description: '查一条 Primitive 的树父/子与双向链邻居。args.id 必填。',
    handler: (args) => {
      const id = String(args.id ?? '').trim();
      if (!id) throw new Error('primitive_neighbors 需要 args.id');
      return { id, neighbors: host.neighbors(id) };
    },
  });
  tools.register({
    name: 'primitive_route',
    description:
      '内部路由：按线索/起点/标签选出有限条 Primitive（guide→evaluate→behavior，负荷封顶）。用这个编排「怎么想」，不要自己把仓库全读进上下文。可选 args.hint、args.startId、args.tag、args.limit。',
    handler: (args) => host.route(asRouteOpts(args)),
  });
}

const primitivePlugin: Plugin = {
  manifest: {
    id: 'primitive',
    version: '0.1.0',
    name: 'Primitive 仓库',
    description:
      '更小维度的思考提示词原子。树 + 双向链 + 内部路由预览。不注入 prompt-context。',
    provides: [PRIMITIVE_SERVICE],
    tier: 'standard',
  },
  inject: { tools: false },
  api,
  ui: {
    title: 'Primitive 仓库',
    width: 960,
    height: 680,
    rpc: {
      primitive: ['snapshot', 'list', 'get', 'tags', 'listByTag', 'tree', 'links', 'neighbors', 'route'],
    },
    content: PRIMITIVE_HTML,
  },
  register(ctx) {
    host = createPrimitiveHost();
    ctx.logger?.info?.(`primitive 仓库就绪（${host.list().length} 条）`);
  },
  onStart(c) {
    wireTools(c);
  },
};

export default primitivePlugin;
