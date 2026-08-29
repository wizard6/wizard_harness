import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { ELEMENT_TABLE_SERVICE, MECHANICS_TABLE_SERVICE } from '@wizard-harness/contracts';
import type { ElementTableService } from '@wizard-harness/contracts';
import elementTablePlugin from '../src/index.js';
import { DEMO_MECHANICS_ELEMENTS } from '../src/catalogs/mechanics/demo-elements.js';
import { FORMAL_MECHANICS_ELEMENTS } from '../src/catalogs/mechanics/formal-elements.js';
import { MECHANICS_GROUPS } from '../src/catalogs/mechanics/groups.js';
import { DEMO_NOVEL_ELEMENTS } from '../src/catalogs/novel/demo-elements.js';
import { createElementTableHost } from '../src/host.js';
import { ELEMENT_TABLE_HTML } from '../src/page.js';

describe('element-table 通用框架', () => {
  it('服务名 + 弹窗含 catalog / 分层 UI', () => {
    expect(ELEMENT_TABLE_SERVICE).toBe('elementTable');
    expect(MECHANICS_TABLE_SERVICE).toBe('mechanicsTable');
    expect(elementTablePlugin.manifest.id).toBe('element-table');
    expect(elementTablePlugin.manifest.version).toBe('0.3.0');
    expect(elementTablePlugin.ui?.rpc?.elementTable).toContain('setCatalog');
    expect(ELEMENT_TABLE_HTML).toContain('data-mode="formal"');
    expect(ELEMENT_TABLE_HTML).toContain('id="catalogs"');
    expect(ELEMENT_TABLE_HTML).toContain('d-generic');
  });

  it('内置 mechanics / novel：正式空、演示各 24', () => {
    expect(FORMAL_MECHANICS_ELEMENTS).toHaveLength(0);
    expect(MECHANICS_GROUPS).toHaveLength(6);
    expect(DEMO_MECHANICS_ELEMENTS).toHaveLength(24);
    expect(DEMO_NOVEL_ELEMENTS).toHaveLength(24);
  });

  it('host：多 catalog 隔离；可登记正式元素与新 catalog', () => {
    const host = createElementTableHost();
    expect(host.listCatalogs().map((c) => c.id)).toEqual(['mechanics', 'novel']);

    const mech = host.snapshot('mechanics');
    expect(mech.formal).toHaveLength(0);
    expect(mech.demo).toHaveLength(24);

    host.setCatalog('novel');
    const novel = host.snapshot();
    expect(novel.catalogId).toBe('novel');
    expect(novel.demo).toHaveLength(24);
    expect(novel.title).toBe('小说元素');

    const stop = host.registerElement({
      catalogId: 'mechanics',
      id: 'my-combo',
      symbol: 'Cb',
      name: '连击',
      group: 'risk',
      period: 1,
      blurb: '用户自定义正式元素',
      demo: 'skill',
      kind: 'formal',
    });
    expect(host.list({ catalogId: 'mechanics', kind: 'formal' })).toHaveLength(1);
    expect(host.list({ catalogId: 'novel', kind: 'formal' })).toHaveLength(0);
    stop();

    host.registerCatalog({ id: 'film', title: '影视元素', blurb: '镜头与叙事', periods: 3 });
    host.registerGroup('film', { id: 'shot', symbol: 'Sh', name: '镜头', tone: 'space' });
    host.registerElement({
      catalogId: 'film',
      id: 'film-cut',
      symbol: 'Cu',
      name: '剪辑点',
      group: 'shot',
      period: 1,
      kind: 'formal',
      demo: 'generic',
    });
    expect(host.snapshot('film').formal).toHaveLength(1);
  });

  it('harness 挂载后 elementTable / mechanicsTable 同实现', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(elementTablePlugin);
    const svc = harness.services.get<ElementTableService>(ELEMENT_TABLE_SERVICE)!;
    const alias = harness.services.get<ElementTableService>(MECHANICS_TABLE_SERVICE)!;
    expect(svc.listCatalogs()).toHaveLength(2);
    expect(svc.snapshot('novel').demo.length).toBe(24);
    expect(alias.snapshot('mechanics').demo.length).toBe(24);
    expect(svc.get('novel-hook')?.name).toBe('钩子');
  });
});
