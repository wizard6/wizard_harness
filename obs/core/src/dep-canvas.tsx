import React, { useMemo } from 'react';
import type { DepDirection, DepPluginRow, DepTreeNode } from './dep-graph.js';

const NODE_W = 248;
const NODE_H = 96;
const GAP_X = 32;
const GAP_Y = 76;
const PAD = 20;

const EDGE = {
  plugin: { stroke: '#79c0ff', dash: '', marker: 'dc-arrow-blue' },
  inject: { stroke: '#e3b341', dash: '7 5', marker: 'dc-arrow-orange' },
  missing: { stroke: '#ff7b72', dash: '5 4', marker: 'dc-arrow-red' },
} as const;

type EdgeKind = keyof typeof EDGE;

interface PlacedNode {
  key: string;
  x: number;
  y: number;
  node: DepTreeNode;
}

interface PlacedEdge {
  fromKey: string;
  toKey: string;
  kind: EdgeKind;
  label?: string;
}

function measureSubtree(node: DepTreeNode): number {
  if (node.children.length === 0) return NODE_W;
  const sum = node.children.reduce((acc, c) => acc + measureSubtree(c) + GAP_X, -GAP_X);
  return Math.max(NODE_W, sum);
}

function edgeKindOf(child: DepTreeNode): EdgeKind {
  if (child.kind === 'missing') return 'missing';
  if (child.kind === 'inject') return 'inject';
  return 'plugin';
}

function layoutForest(roots: DepTreeNode[]): {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
} {
  const nodes: PlacedNode[] = [];
  const edges: PlacedEdge[] = [];
  let cursorX = PAD;
  let maxDepth = 0;

  function walk(
    node: DepTreeNode,
    depth: number,
    left: number,
    parentKey: string | null,
    linkKind: EdgeKind | null,
  ): number {
    maxDepth = Math.max(maxDepth, depth);
    const w = measureSubtree(node);
    const x = left + (w - NODE_W) / 2;
    const y = PAD + depth * (NODE_H + GAP_Y);
    nodes.push({ key: node.key, x, y, node });
    if (parentKey && linkKind) {
      edges.push({
        fromKey: parentKey,
        toKey: node.key,
        kind: linkKind,
        label: node.service,
      });
    }
    let cx = left;
    for (const child of node.children) {
      const cw = measureSubtree(child);
      walk(child, depth + 1, cx, node.key, edgeKindOf(child));
      cx += cw + GAP_X;
    }
    return w;
  }

  for (const root of roots) {
    const w = walk(root, 0, cursorX, null, null);
    cursorX += w + GAP_X * 2;
  }

  return {
    nodes,
    edges,
    width: Math.max(cursorX + PAD, 320),
    height: PAD * 2 + (maxDepth + 1) * NODE_H + maxDepth * GAP_Y + 56,
  };
}

function linkPath(ax: number, ay: number, bx: number, by: number): string {
  const sx = ax + NODE_W / 2;
  const sy = ay + NODE_H;
  const ex = bx + NODE_W / 2;
  const ey = by;
  const mid = (sy + ey) / 2;
  return `M${sx},${sy} C${sx},${mid} ${ex},${mid} ${ex},${ey}`;
}

function tierColor(tier: string | undefined, missing: boolean, cyclic: boolean): string {
  if (missing) return '#e3b341';
  if (cyclic) return '#ffa657';
  if (tier === 'core') return '#79c0ff';
  if (tier === 'experimental') return '#ff9d5c';
  return '#e3b341';
}

function nodeSubtitle(node: DepTreeNode, direction: DepDirection): string {
  const parts: string[] = [];
  if (node.missing) parts.push('未装入');
  else if (node.name !== node.id) parts.push(node.id);
  if (node.cyclic) parts.push('循环 ↻');
  if (node.service) {
    const arrow = direction === 'depends-on' ? '←' : '→';
    parts.push(`${arrow} ${node.service}${node.required === false ? '（可选）' : ''}`);
  }
  if (node.isRoot) parts.push(direction === 'depends-on' ? '顶层' : '基础');
  return parts.join(' · ') || node.id;
}

const CANVAS_CSS = `
  .dc-wrap { position:relative; border-radius:12px; overflow:auto;
             border:1px solid #2c2c3e; background:#101018; min-height:280px; }
  .dc-canvas { position:relative; transform-origin:0 0;
    background-color:#14141e;
    background-image:
      linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px),
      linear-gradient(rgba(255,255,255,.016) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.016) 1px, transparent 1px);
    background-size:100px 100px, 100px 100px, 20px 20px, 20px 20px; }
  .dc-lines { position:absolute; left:0; top:0; pointer-events:none; overflow:visible; }
  .dc-node { position:absolute; left:0; top:0; width:${NODE_W}px; min-height:${NODE_H}px;
    background:#1b1b28; border:1px solid #2c2c3e; border-radius:12px; padding:12px 14px;
    box-shadow:0 4px 14px rgba(0,0,0,.35); box-sizing:border-box; }
  .dc-node:hover { border-color:#4a6aa0; box-shadow:0 6px 18px rgba(74,106,160,.28); }
  .dc-node.warn { border-color:#9e6a03; }
  .dc-node.loop { border-color:#ffa657; }
  .dc-node .t { font-size:13px; font-weight:600; display:flex; align-items:center; gap:8px; line-height:1.35; }
  .dc-node .dot { width:8px; height:8px; border-radius:50%; flex:none; }
  .dc-node .s { margin-top:5px; font-size:11px; color:#a8a8bd; line-height:1.45;
                 overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dc-node .b { margin-top:7px; font-size:10px; color:#7ee787; font-family:ui-monospace,Consolas,monospace;
                display:flex; flex-wrap:wrap; gap:4px; }
  .dc-node .b span { display:inline-block; padding:1px 7px; border-radius:10px;
                     border:1px solid rgba(126,231,135,.25); background:rgba(126,231,135,.07); }
  .dc-node.warn .b { color:#e3b341; }
  .dc-node.warn .b span { border-color:rgba(227,179,65,.35); background:rgba(227,179,65,.08); }
  .dc-legend { position:sticky; left:0; bottom:0; z-index:2; margin:0; padding:8px 12px;
    display:flex; flex-wrap:wrap; gap:12px 18px; font-size:10.5px; color:#a8a8bd;
    background:linear-gradient(transparent, rgba(16,16,24,.92) 24%, rgba(16,16,24,.96));
    border-top:1px solid rgba(44,44,62,.8); }
  .dc-leg { display:flex; align-items:center; gap:6px; }
  .dc-leg svg { display:block; }
`;

export interface DepCanvasProps {
  forest: DepTreeNode[];
  direction: DepDirection;
  plugins: readonly DepPluginRow[];
}

export function DepCanvas({ forest, direction, plugins }: DepCanvasProps): React.ReactElement {
  const byId = useMemo(() => new Map(plugins.map((p) => [p.manifest.id, p])), [plugins]);
  const layout = useMemo(() => layoutForest(forest), [forest]);
  const pos = useMemo(() => new Map(layout.nodes.map((n) => [n.key, n])), [layout.nodes]);

  return (
    <div className="dc-wrap">
      <style>{CANVAS_CSS}</style>
      <div className="dc-canvas" style={{ width: layout.width, height: layout.height }}>
        <svg
          className="dc-lines"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
        >
          <defs>
            {(
              [
                ['dc-arrow-blue', '#79c0ff'],
                ['dc-arrow-orange', '#e3b341'],
                ['dc-arrow-red', '#ff7b72'],
              ] as const
            ).map(([id, color]) => (
              <marker
                key={id}
                id={id}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" fill={color} />
              </marker>
            ))}
          </defs>
          <g>
            {layout.edges.map((e) => {
              const a = pos.get(e.fromKey);
              const b = pos.get(e.toKey);
              if (!a || !b) return null;
              const k = EDGE[e.kind];
              const d = linkPath(a.x, a.y, b.x, b.y);
              const mx = (a.x + b.x + NODE_W) / 2;
              const my = (a.y + b.y + NODE_H) / 2;
              return (
                <g key={`${e.fromKey}-${e.toKey}-${e.kind}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke={k.stroke}
                    strokeWidth="2"
                    strokeDasharray={k.dash || undefined}
                    markerEnd={`url(#${k.marker})`}
                  />
                  {e.label ? (
                    <text
                      x={mx}
                      y={my - 6}
                      textAnchor="middle"
                      fill={k.stroke}
                      fontSize="10"
                      fontFamily="ui-monospace, Consolas, monospace"
                    >
                      {e.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
        {layout.nodes.map(({ key, x, y, node }) => {
          const meta = byId.get(node.id);
          const tier = meta?.manifest.tier;
          const color = tierColor(tier, Boolean(node.missing), Boolean(node.cyclic));
          const title = node.missing ? `缺失 · ${node.name}` : node.name || node.id;
          const services = (meta?.services ?? []).slice(0, 4);
          const cls = [
            'dc-node',
            node.missing ? 'warn' : '',
            node.cyclic ? 'loop' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={key}
              className={cls}
              style={{ transform: `translate(${x}px, ${y}px)` }}
              title={meta?.manifest.description ?? node.id}
            >
              <div className="t">
                <span className="dot" style={{ background: color }} />
                {title}
              </div>
              <div className="s">{nodeSubtitle(node, direction)}</div>
              {services.length > 0 ? (
                <div className="b">
                  {services.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                  {(meta?.services?.length ?? 0) > 4 ? <span>+{(meta?.services?.length ?? 0) - 4}</span> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="dc-legend">
        <span className="dc-leg">
          <svg width="34" height="10" aria-hidden="true">
            <line x1="0" y1="5" x2="34" y2="5" stroke="#79c0ff" strokeWidth="2" />
          </svg>
          插件依赖
        </span>
        <span className="dc-leg">
          <svg width="34" height="10" aria-hidden="true">
            <line
              x1="0"
              y1="5"
              x2="34"
              y2="5"
              stroke="#e3b341"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
          </svg>
          inject 服务
        </span>
        <span className="dc-leg">
          <svg width="34" height="10" aria-hidden="true">
            <line
              x1="0"
              y1="5"
              x2="34"
              y2="5"
              stroke="#ff7b72"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
          </svg>
          缺失
        </span>
        <span className="dc-leg" style={{ color: '#6a6a82' }}>
          样式对齐 docs/guides/architecture-canvas.html
        </span>
      </div>
    </div>
  );
}
