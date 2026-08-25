import type { PluginManifest } from '@wizard-harness/core';

export type DepDirection = 'depends-on' | 'depended-by';

export interface DepPluginRow {
  manifest: PluginManifest;
  services?: string[];
}

export interface DepTreeNode {
  key: string;
  id: string;
  name: string;
  kind: 'plugin' | 'inject' | 'missing';
  service?: string;
  required?: boolean;
  missing?: boolean;
  cyclic?: boolean;
  isRoot?: boolean;
  children: DepTreeNode[];
}

interface DepLink {
  key: string;
  pluginId: string;
  kind: 'plugin' | 'inject' | 'missing';
  service?: string;
  required?: boolean;
  missing?: boolean;
  name?: string;
}

function injectEntries(manifest: PluginManifest): { name: string; required: boolean }[] {
  const raw = manifest.inject ?? manifest.services;
  if (raw === undefined) return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.filter((n) => n.length > 0))].map((name) => ({ name, required: true }));
  }
  return Object.entries(raw).map(([name, required]) => ({ name, required: required === true }));
}

function serviceProviderMap(plugins: readonly DepPluginRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const p of plugins) {
    for (const s of p.services ?? []) {
      const list = map.get(s) ?? [];
      list.push(p.manifest.id);
      map.set(s, list);
    }
  }
  return map;
}

export function buildDependencyForest(
  plugins: readonly DepPluginRow[],
  direction: DepDirection,
): DepTreeNode[] {
  const byId = new Map(plugins.map((p) => [p.manifest.id, p]));
  const providers = serviceProviderMap(plugins);

  const dependsOnLinks = (id: string): DepLink[] => {
    const plugin = byId.get(id);
    if (!plugin) return [];
    const links: DepLink[] = [];
    for (const dep of plugin.manifest.dependencies ?? []) {
      if (dep === id) continue;
      if (byId.has(dep)) {
        links.push({ key: `${id}:dep:${dep}`, pluginId: dep, kind: 'plugin' });
      } else {
        links.push({
          key: `${id}:dep-miss:${dep}`,
          pluginId: dep,
          kind: 'missing',
          missing: true,
          name: dep,
        });
      }
    }
    for (const inj of injectEntries(plugin.manifest)) {
      const provs = providers.get(inj.name) ?? [];
      if (provs.length === 0) {
        links.push({
          key: `${id}:inj-miss:${inj.name}`,
          pluginId: `${id}→${inj.name}`,
          kind: 'missing',
          service: inj.name,
          required: inj.required,
          missing: inj.required,
          name: inj.name,
        });
        continue;
      }
      for (const prov of provs) {
        if (prov === id) continue;
        links.push({
          key: `${id}:inj:${inj.name}:${prov}`,
          pluginId: prov,
          kind: 'inject',
          service: inj.name,
          required: inj.required,
        });
      }
    }
    return links;
  };

  const dependedByLinks = (id: string): DepLink[] => {
    const links: DepLink[] = [];
    for (const p of plugins) {
      const from = p.manifest.id;
      if (from === id) continue;
      if ((p.manifest.dependencies ?? []).includes(id)) {
        links.push({ key: `${id}:rev-dep:${from}`, pluginId: from, kind: 'plugin' });
      }
      for (const inj of injectEntries(p.manifest)) {
        if ((providers.get(inj.name) ?? []).includes(id)) {
          links.push({
            key: `${id}:rev-inj:${inj.name}:${from}`,
            pluginId: from,
            kind: 'inject',
            service: inj.name,
            required: inj.required,
          });
        }
      }
    }
    return links;
  };

  const linksOf = direction === 'depends-on' ? dependsOnLinks : dependedByLinks;

  const incoming = new Set<string>();
  for (const p of plugins) {
    for (const link of linksOf(p.manifest.id)) {
      incoming.add(link.pluginId);
    }
  }

  let rootIds = plugins.filter((p) => !incoming.has(p.manifest.id)).map((p) => p.manifest.id);
  if (rootIds.length === 0) rootIds = plugins.map((p) => p.manifest.id);

  function buildNode(id: string, link: DepLink | null, visited: Set<string>, isRoot: boolean): DepTreeNode {
    const p = byId.get(id);
    const name = link?.name ?? p?.manifest.name ?? id;
    if (visited.has(id)) {
      return {
        key: link?.key ?? id,
        id,
        name,
        kind: link?.kind === 'missing' ? 'missing' : 'plugin',
        service: link?.service,
        required: link?.required,
        missing: link?.missing,
        cyclic: true,
        isRoot,
        children: [],
      };
    }
    const next = new Set(visited);
    next.add(id);
    const childLinks = linksOf(id);
    const children = childLinks.map((childLink) => {
      if (childLink.kind === 'missing') {
        return {
          key: childLink.key,
          id: childLink.pluginId,
          name: childLink.name ?? childLink.pluginId,
          kind: 'missing' as const,
          service: childLink.service,
          required: childLink.required,
          missing: true,
          children: [],
        };
      }
      return buildNode(childLink.pluginId, childLink, next, false);
    });
    return {
      key: link?.key ?? `root:${id}`,
      id,
      name,
      kind: link?.kind === 'inject' ? 'inject' : 'plugin',
      service: link?.service,
      required: link?.required,
      missing: link?.missing,
      isRoot,
      children,
    };
  }

  return rootIds.map((id) => buildNode(id, null, new Set(), true));
}

export function filterDepForest(forest: DepTreeNode[], query: string): DepTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return forest;
  const matchNode = (n: DepTreeNode): boolean =>
    n.id.toLowerCase().includes(q) ||
    n.name.toLowerCase().includes(q) ||
    (n.service ?? '').toLowerCase().includes(q) ||
    n.children.some(matchNode);
  const filterTree = (nodes: DepTreeNode[]): DepTreeNode[] =>
    nodes.filter(matchNode).map((n) => ({ ...n, children: filterTree(n.children) }));
  return filterTree(forest);
}
