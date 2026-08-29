import type { Plugin } from '@wizard-harness/core';
import {
  ELEMENT_TABLE_SERVICE,
  MECHANICS_TABLE_SERVICE,
} from '@wizard-harness/contracts';
import type {
  ElementListOpts,
  ElementTableService,
  TableElementInput,
} from '@wizard-harness/contracts';
import { createElementTableHost } from './host.js';
import { ELEMENT_TABLE_HTML } from './page.js';

/**
 * element-table：通用周期元素表（多 catalog：机制 / 小说 / 可扩展）。
 * 说明文档：docs/plugins/element-table.html
 */
let impl: ReturnType<typeof createElementTableHost> | undefined;

function live(): ReturnType<typeof createElementTableHost> {
  if (!impl) throw new Error('elementTable 未就绪');
  return impl;
}

const api: ElementTableService = {
  listCatalogs: () => live().listCatalogs(),
  setCatalog: (id) => live().setCatalog(id),
  snapshot: (catalogId?) => live().snapshot(catalogId),
  list: (opts?: ElementListOpts) => live().list(opts),
  get: (id, catalogId?) => live().get(id, catalogId),
  registerCatalog: (input) => live().registerCatalog(input),
  registerGroup: (catalogId, input) => live().registerGroup(catalogId, input),
  registerElement: (input: TableElementInput) => live().registerElement(input),
  setShowDemo: (show, catalogId?) => live().setShowDemo(show, catalogId),
};

const elementTablePlugin: Plugin = {
  manifest: {
    id: 'element-table',
    version: '0.3.0',
    name: '元素表',
    description:
      '通用周期元素表：多 catalog（游戏机制、小说元素…）；正式/演示分层；可登记扩展。',
    provides: [ELEMENT_TABLE_SERVICE, MECHANICS_TABLE_SERVICE],
    tier: 'standard',
  },
  api,
  ui: {
    title: '元素表',
    width: 1040,
    height: 700,
    rpc: {
      elementTable: [
        'listCatalogs',
        'setCatalog',
        'snapshot',
        'list',
        'get',
        'setShowDemo',
      ],
      mechanicsTable: [
        'listCatalogs',
        'setCatalog',
        'snapshot',
        'list',
        'get',
        'setShowDemo',
      ],
    },
    content: ELEMENT_TABLE_HTML,
  },
  register(ctx) {
    impl = createElementTableHost({ includeDemoSeed: true, showDemo: true, activeCatalogId: 'mechanics' });
    ctx.effect(() => () => {
      impl = undefined;
    });
    ctx.logger?.info?.('element-table 就绪 v0.3（catalogs: mechanics + novel）');
  },
};

export default elementTablePlugin;
