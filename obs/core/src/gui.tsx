import React from 'react';
import type { Plugin, PluginEvent } from '@wizard-harness/core';
import { registrySpec } from './spec.js';

export interface RegistryPanelProps {
  plugins: Plugin[];
  events?: PluginEvent[];
  onOpenPlugin?: (id: string) => void;
}

const BORDER = '#262634';
const BORDER_HOVER = '#414158';
const MUTED = '#a8a8bd';
const CARD_BG = '#1a1a24';
const CARD_BG_HOVER = '#20202e';
const GREEN = '#7ee787';
const BLUE = '#79c0ff';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 注册表 GUI 组件（真 React，含布局+样式），可就近单独渲染，也可被 obs/gui 装载 */
export function RegistryPanel({
  plugins,
  events = [],
  onOpenPlugin,
}: RegistryPanelProps): React.ReactElement {
  const theme = registrySpec.theme;
  const bg = theme?.panel?.bg ?? '#16161e';
  const fg = theme?.panel?.fg ?? '#e6e6ef';
  const eventColors = theme?.eventColors ?? {};
  const reg = events.filter((e) => e.action === 'register').length;
  const unreg = events.filter((e) => e.action === 'unregister').length;
  const active = Math.max(0, reg - unreg);

  const css = `
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #2c2c3a; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #3d3d52; }
    ::-webkit-scrollbar-corner { background: transparent; }

    .panel-card {
      background: ${CARD_BG};
      border: 1px solid ${BORDER};
      border-radius: 10px;
      box-shadow: 0 1px 3px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.03);
      transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease;
    }
    .panel-card:hover {
      transform: translateY(-1px);
      border-color: ${BORDER_HOVER};
      background: ${CARD_BG_HOVER};
      box-shadow: 0 4px 14px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.04);
    }

    .tl { list-style: none; padding: 0; margin: 0; position: relative; }
    .tl::before {
      content: ''; position: absolute; left: 5px; top: 6px; bottom: 6px;
      width: 2px; background: #22222e; border-radius: 1px;
    }
    .tl-item {
      position: relative;
      display: grid;
      grid-template-columns: 56px 150px 26px 1fr;
      gap: 6px;
      align-items: baseline;
      padding: 4px 8px 4px 20px;
      border-radius: 6px;
      transition: background .1s ease;
    }
    .tl-item:hover { background: rgba(255,255,255,.04); }
    .tl-dot {
      position: absolute; left: 1px; top: 8px; width: 10px; height: 10px;
      border-radius: 50%; box-shadow: 0 0 5px currentColor; opacity: .9;
    }
    .tl-time { color: ${MUTED}; font-size: 11px; }
    .tl-actor { color: #cfcfe0; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tl-arrow { color: ${MUTED}; font-size: 12px; text-align: center; }
    .tl-text { font-size: 12px; word-break: break-all; }

    .sec-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; text-transform: uppercase; letter-spacing: .08em;
      color: ${MUTED}; margin: 0 0 12px; font-weight: 600;
    }
    .sec-title::before { content: ''; width: 3px; height: 13px; border-radius: 2px; background: ${BLUE}; }

    .badge-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${GREEN}; box-shadow: 0 0 6px rgba(126,231,135,.7); margin-right: 5px; }

    .panel-btn {
      margin-left: auto; background: #23232f; color: inherit;
      border: 1px solid #34344a; border-radius: 6px; padding: 3px 12px;
      font-size: 12px; cursor: pointer; transition: background .12s ease, border-color .12s ease;
    }
    .panel-btn:hover { background: #30304a; border-color: #4a4a6a; }

    .stat-chip {
      font-size: 11px; padding: 3px 10px; border-radius: 12px;
      background: rgba(30,30,44,.8); border: 1px solid #2c2c3e; color: ${MUTED};
    }
    .stat-num { font-weight: 700; margin-left: 3px; }
    .logo {
      width: 26px; height: 26px; border-radius: 8px; flex: none;
      background: linear-gradient(135deg, #7ee787 0%, #79c0ff 100%);
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 800; color: #0d1117;
      box-shadow: 0 2px 10px rgba(121,192,255,.35);
    }
  `;

  return (
    <div
      style={{
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
        color: fg,
        background: `radial-gradient(1200px 400px at 50% -8%, #1e1e2c 0%, ${bg} 55%)`,
        minHeight: '100vh',
      }}
    >
      <style>{css}</style>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          padding: '12px 22px',
          borderBottom: `1px solid ${BORDER}`,
          background: 'rgba(22,22,30,.72)',
          backdropFilter: 'blur(8px)',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span className="logo">W</span>
          <h1 style={{ fontSize: 15, margin: 0, fontWeight: 600, letterSpacing: '.02em', whiteSpace: 'nowrap' }}>
            wizard-harness <span style={{ color: MUTED, fontWeight: 400 }}>· 观测台</span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className="stat-chip">
            当前<span className="stat-num" style={{ color: GREEN }}>{active}</span>
          </span>
          <span className="stat-chip">
            注册<span className="stat-num" style={{ color: GREEN }}>{reg}</span>
          </span>
          <span className="stat-chip">
            注销<span className="stat-num" style={{ color: '#ff7b72' }}>{unreg}</span>
          </span>
          <span className="stat-chip">
            事件<span className="stat-num" style={{ color: BLUE }}>{events.length}</span>
          </span>
        </div>
      </header>
      <main style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, padding: 18 }}>
        <section>
          <h2 className="sec-title">
            插件
            <span style={{ color: GREEN, marginLeft: 2 }}>{plugins.length}</span>
          </h2>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              maxHeight: 'calc(100vh - 170px)',
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {plugins.length === 0 && (
              <li style={{ fontSize: 13, color: MUTED, padding: '12px 4px' }}>暂无插件</li>
            )}
            {plugins.map((p) => (
              <li
                key={p.manifest.id}
                className="panel-card"
                style={{ padding: '12px 14px', marginBottom: 10 }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <strong style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.manifest.name || p.manifest.id}
                  </strong>
                  <code style={{ color: GREEN, fontSize: 11, flex: 'none' }}>
                    v{p.manifest.version}
                  </code>
                </div>
                {p.manifest.description && (
                  <p
                    style={{
                      margin: '5px 0 0',
                      fontSize: 12,
                      color: MUTED,
                      lineHeight: 1.5,
                    }}
                  >
                    {p.manifest.description}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: GREEN }}>
                    <span className="badge-dot" />
                    运行中
                  </span>
                  {p.ui && onOpenPlugin && (
                    <button className="panel-btn" onClick={() => onOpenPlugin(p.manifest.id)}>
                      弹窗
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="sec-title">
            事件时间线
            <span style={{ color: BLUE, marginLeft: 2 }}>{events.length}</span>
          </h2>
          <ul
            className="tl"
            style={{
              maxHeight: 'calc(100vh - 170px)',
              overflowY: 'auto',
              paddingRight: 4,
              fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
            }}
          >
            {events.length === 0 && (
              <li style={{ fontSize: 13, color: MUTED, padding: '12px 4px' }}>
                暂无事件（插件注册后将实时显示）
              </li>
            )}
            {events
              .slice(-60)
              .reverse()
              .map((e, i) => {
                const color = eventColors[e.action] ?? BLUE;
                return (
                  <li key={i} className="tl-item">
                    <span className="tl-dot" style={{ background: color, color }} />
                    <span className="tl-time">{fmtTime(e.ts)}</span>
                    <span className="tl-actor">{e.actor}</span>
                    <span className="tl-arrow">→</span>
                    <span className="tl-text" style={{ color }}>
                      {e.action}
                      {e.target ? ' ' + e.target : ''}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      </main>
    </div>
  );
}
