import type {
  ElementCatalogInput,
  ElementCatalogMeta,
  ElementGroup,
  ElementGroupInput,
  ElementListOpts,
  ElementTableService,
  ElementTableSnapshot,
  TableElement,
  TableElementInput,
} from '@wizard-harness/contracts';
import { BUILTIN_CATALOGS, type CatalogSeed } from './catalogs/index.js';

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function asElement(input: TableElementInput, fallbackAtomic: number): TableElement {
  const kind = input.kind === 'demo' ? 'demo' : 'formal';
  return {
    id: clip(String(input.id), 64),
    symbol: clip(String(input.symbol), 4) || '??',
    name: clip(String(input.name), 40) || input.id,
    group: clip(String(input.group), 40),
    period: Math.max(1, Math.min(12, Math.round(Number(input.period) || 1))),
    atomic: Math.max(1, Math.round(Number(input.atomic) || fallbackAtomic)),
    blurb: clip(String(input.blurb ?? ''), 240),
    demo: clip(String(input.demo ?? 'generic'), 40) || 'generic',
    kind,
  };
}

interface CatalogState {
  id: string;
  title: string;
  blurb: string;
  periods: number;
  groups: Map<string, ElementGroup>;
  elements: Map<string, TableElement>;
  showDemo: boolean;
  nextAtomic: number;
}

function seedCatalog(seed: CatalogSeed, showDemo: boolean): CatalogState {
  const groups = new Map<string, ElementGroup>();
  for (const g of seed.groups) groups.set(g.id, { ...g });
  const elements = new Map<string, TableElement>();
  let nextAtomic = 1;
  const put = (rows: readonly Omit<TableElement, 'kind'>[], kind: 'formal' | 'demo') => {
    for (const row of rows) {
      const el = asElement({ ...row, kind }, row.atomic);
      elements.set(el.id, el);
      nextAtomic = Math.max(nextAtomic, el.atomic + 1);
    }
  };
  put(seed.formal, 'formal');
  put(seed.demo, 'demo');
  return {
    id: seed.id,
    title: seed.title,
    blurb: seed.blurb,
    periods: Math.max(1, seed.periods),
    groups,
    elements,
    showDemo,
    nextAtomic,
  };
}

export interface ElementTableHostOpts {
  catalogs?: readonly CatalogSeed[];
  activeCatalogId?: string;
  includeDemoSeed?: boolean;
  showDemo?: boolean;
}

export function createElementTableHost(opts: ElementTableHostOpts = {}): ElementTableService {
  const showDemoDefault = opts.showDemo ?? true;
  const seeds = (opts.catalogs ?? BUILTIN_CATALOGS).map((s) => {
    if (opts.includeDemoSeed === false) return { ...s, demo: [] as CatalogSeed['demo'] };
    return s;
  });
  const catalogs = new Map<string, CatalogState>();
  for (const seed of seeds) catalogs.set(seed.id, seedCatalog(seed, showDemoDefault));

  let activeId = opts.activeCatalogId && catalogs.has(opts.activeCatalogId)
    ? opts.activeCatalogId
    : (catalogs.keys().next().value as string | undefined) ?? '';

  function requireCatalog(id?: string): CatalogState {
    const cid = id || activeId;
    const cat = catalogs.get(cid);
    if (!cat) throw new Error(`未知 catalog：${cid || '(空)'}`);
    return cat;
  }

  function metaList(): ElementCatalogMeta[] {
    return [...catalogs.values()].map((c) => ({
      id: c.id,
      title: c.title,
      blurb: c.blurb,
    }));
  }

  function all(cat: CatalogState): TableElement[] {
    return [...cat.elements.values()].sort((a, b) => a.atomic - b.atomic || a.id.localeCompare(b.id));
  }

  function visible(cat: CatalogState): TableElement[] {
    const rows = all(cat);
    const formal = rows.filter((e) => e.kind === 'formal');
    const demo = rows.filter((e) => e.kind === 'demo');
    if (!cat.showDemo) return formal;
    if (formal.length === 0) return demo;
    return [...formal, ...demo];
  }

  function snap(id?: string): ElementTableSnapshot {
    const cat = requireCatalog(id);
    const rows = all(cat);
    const formal = rows.filter((e) => e.kind === 'formal');
    const demo = rows.filter((e) => e.kind === 'demo');
    return {
      catalogId: cat.id,
      title: cat.title,
      blurb: cat.blurb,
      periods: cat.periods,
      groups: [...cat.groups.values()],
      formal,
      demo,
      showDemo: cat.showDemo,
      elements: visible(cat),
      catalogs: metaList(),
    };
  }

  return {
    listCatalogs: () => metaList(),
    setCatalog(id: string) {
      if (!catalogs.has(id)) throw new Error(`未知 catalog：${id}`);
      activeId = id;
      return snap(id);
    },
    snapshot: (catalogId?) => snap(catalogId),
    list(listOpts?: ElementListOpts) {
      const cat = requireCatalog(listOpts?.catalogId);
      const kind = listOpts?.kind ?? 'all';
      const rows = all(cat);
      if (kind === 'formal') return rows.filter((e) => e.kind === 'formal');
      if (kind === 'demo') return rows.filter((e) => e.kind === 'demo');
      return rows;
    },
    get(id, catalogId?) {
      if (catalogId) return requireCatalog(catalogId).elements.get(id);
      for (const cat of catalogs.values()) {
        const hit = cat.elements.get(id);
        if (hit) return hit;
      }
      return undefined;
    },
    registerCatalog(input: ElementCatalogInput) {
      const id = clip(String(input.id), 40);
      if (!id) throw new Error('registerCatalog 需要 id');
      if (catalogs.has(id) && !input.replace) {
        throw new Error(`catalog 已存在：${id}`);
      }
      const prev = catalogs.get(id);
      const next: CatalogState = prev && !input.replace
        ? prev
        : {
            id,
            title: clip(String(input.title), 40) || id,
            blurb: clip(String(input.blurb ?? ''), 160),
            periods: Math.max(1, Math.min(12, Math.round(Number(input.periods) || prev?.periods || 4))),
            groups: prev && input.replace ? prev.groups : new Map(),
            elements: prev && input.replace ? prev.elements : new Map(),
            showDemo: prev?.showDemo ?? showDemoDefault,
            nextAtomic: prev?.nextAtomic ?? 1,
          };
      if (prev && input.replace) {
        next.title = clip(String(input.title), 40) || id;
        next.blurb = clip(String(input.blurb ?? ''), 160);
        if (input.periods != null) {
          next.periods = Math.max(1, Math.min(12, Math.round(Number(input.periods) || 4)));
        }
      }
      catalogs.set(id, next);
      if (!activeId) activeId = id;
      return () => {
        catalogs.delete(id);
        if (activeId === id) {
          activeId = (catalogs.keys().next().value as string | undefined) ?? '';
        }
      };
    },
    registerGroup(catalogId: string, input: ElementGroupInput) {
      const cat = requireCatalog(catalogId);
      const id = clip(String(input.id), 40);
      if (!id) throw new Error('registerGroup 需要 id');
      const row: ElementGroup = {
        id,
        symbol: clip(String(input.symbol), 4) || id.slice(0, 2),
        name: clip(String(input.name), 40) || id,
        blurb: clip(String(input.blurb ?? ''), 120),
        tone: input.tone ? clip(String(input.tone), 24) : undefined,
      };
      cat.groups.set(id, row);
      return () => {
        cat.groups.delete(id);
      };
    },
    registerElement(input: TableElementInput) {
      const cat = requireCatalog(input.catalogId);
      const el = asElement(input, cat.nextAtomic++);
      if (!el.id) throw new Error('registerElement 需要 id');
      if (!cat.groups.has(el.group)) {
        throw new Error(`未知族 ${el.group}：先 registerGroup(${cat.id}, …)`);
      }
      cat.elements.set(el.id, el);
      return () => {
        cat.elements.delete(el.id);
      };
    },
    setShowDemo(show: boolean, catalogId?) {
      const cat = requireCatalog(catalogId);
      cat.showDemo = Boolean(show);
      return snap(cat.id);
    },
  };
}

/** @deprecated 使用 createElementTableHost */
export const createMechanicsHost = createElementTableHost;
