import type { WorkspacePluginInfo, WorkspaceSnapshot, WorkspaceTile } from '@wizard-harness/contracts';

const SEED: readonly WorkspaceTile[] = [
  { id: 'today', title: '今日', blurb: '日期与运行时摘要', kind: 'panel', view: 'home' },
  { id: 'plugins', title: '插件架', blurb: '当前已加载的能力', kind: 'panel', view: 'plugins' },
  { id: 'publish', title: '发布', blurb: '部署 Web，可选打 APK', kind: 'panel', view: 'publish' },
  { id: 'notes', title: '笔记', blurb: '空位：后续插件挂上', kind: 'soon' },
  { id: 'tasks', title: '待办', blurb: '空位：后续插件挂上', kind: 'soon' },
];

export function pluginsFromEvents(
  events: readonly { action: string; target?: string }[],
): WorkspacePluginInfo[] {
  const order: string[] = [];
  const active = new Set<string>();
  for (const e of events) {
    const id = e.target?.trim();
    if (!id) continue;
    if (e.action === 'register') {
      if (!active.has(id)) order.push(id);
      active.add(id);
    } else if (e.action === 'unregister') {
      active.delete(id);
    }
  }
  return order.filter((id) => active.has(id)).map((id) => ({ id, name: id, description: '' }));
}

export function createWorkspaceHost() {
  const tiles = new Map<string, WorkspaceTile>(SEED.map((t) => [t.id, t]));
  let listLoaded: () => WorkspacePluginInfo[] = () => [];

  const list = (): WorkspaceTile[] => [...tiles.values()];

  return {
    bindLoaded(fn: () => WorkspacePluginInfo[]) {
      listLoaded = fn;
    },
    snapshot(): WorkspaceSnapshot {
      return { title: '个人工作台', tiles: list() };
    },
    tiles: list,
    loaded: () => listLoaded(),
    registerTile(tile: WorkspaceTile): () => void {
      const id = tile.id?.trim();
      if (!id) throw new Error('瓷砖缺少 id');
      if (tiles.has(id)) throw new Error(`重复瓷砖：${id}`);
      tiles.set(id, { ...tile, id });
      return () => {
        tiles.delete(id);
      };
    },
  };
}

