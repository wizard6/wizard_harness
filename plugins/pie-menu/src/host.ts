import type {
  PieMenuItem,
  PieMenuItemInput,
  PieMenuService,
  PieMenuSnapshot,
} from '@wizard-harness/contracts';
import { DEFAULT_PIE_ROOT } from './default-menu.js';

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function normalize(input: PieMenuItemInput): PieMenuItem {
  const kind = input.kind;
  const children = kind === 'submenu' ? (input.children ?? []).map(normalize) : undefined;
  return {
    id: clip(String(input.id), 64),
    label: clip(String(input.label), 40) || input.id,
    icon: input.icon ? clip(String(input.icon), 8) : undefined,
    kind,
    children,
    pluginId: input.pluginId ? clip(String(input.pluginId), 64) : undefined,
    action: input.action ? clip(String(input.action), 64) : undefined,
    angle: input.angle == null ? undefined : (((Number(input.angle) % 360) + 360) % 360),
  };
}

function walk(
  node: PieMenuItem,
  visit: (n: PieMenuItem, parent: PieMenuItem | null) => void,
  parent: PieMenuItem | null = null,
): void {
  visit(node, parent);
  for (const c of node.children ?? []) walk(c, visit, node);
}

function findNode(root: PieMenuItem, id: string): PieMenuItem | undefined {
  let hit: PieMenuItem | undefined;
  walk(root, (n) => {
    if (n.id === id) hit = n;
  });
  return hit;
}

function cloneTree(node: PieMenuItem): PieMenuItem {
  return { ...node, children: node.children?.map(cloneTree) };
}

function withChild(parent: PieMenuItem, child: PieMenuItem): PieMenuItem {
  return { ...parent, children: [...(parent.children ?? []), child] };
}

function withoutChild(parent: PieMenuItem, childId: string): PieMenuItem {
  return { ...parent, children: (parent.children ?? []).filter((c) => c.id !== childId) };
}

function replaceNode(root: PieMenuItem, id: string, next: PieMenuItem): PieMenuItem {
  if (root.id === id) return next;
  if (!root.children?.length) return root;
  return { ...root, children: root.children.map((c) => replaceNode(c, id, next)) };
}

export function createPieMenuHost(rootInput?: PieMenuItemInput): PieMenuService {
  let root = normalize(rootInput ?? DEFAULT_PIE_ROOT);

  function snap(): PieMenuSnapshot {
    return { title: root.label, root: cloneTree(root) };
  }

  return {
    snapshot: () => snap(),
    get(id) {
      const n = findNode(root, id);
      return n ? cloneTree(n) : undefined;
    },
    activate(id) {
      const n = findNode(root, id);
      if (!n) return { effect: 'noop' };
      if (n.kind === 'submenu') return { effect: 'submenu', node: cloneTree(n) };
      if (n.kind === 'openPlugin' && n.pluginId) {
        return { effect: 'openPlugin', pluginId: n.pluginId };
      }
      if (n.kind === 'action' && n.action) {
        return { effect: 'action', action: n.action };
      }
      return { effect: 'noop' };
    },
    setRoot(input) {
      root = normalize(input);
      return snap();
    },
    registerItem(parentId, item) {
      const parent = findNode(root, parentId);
      if (!parent) throw new Error(`未知父节点：${parentId}`);
      if (parent.kind !== 'submenu') throw new Error(`父节点须为 submenu：${parentId}`);
      const child = normalize(item);
      if (findNode(root, child.id)) throw new Error(`id 已存在：${child.id}`);
      root = replaceNode(root, parentId, withChild(parent, child));
      return () => {
        const p = findNode(root, parentId);
        if (!p) return;
        root = replaceNode(root, parentId, withoutChild(p, child.id));
      };
    },
  };
}
