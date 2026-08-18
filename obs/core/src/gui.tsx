import React, { useState } from 'react';
import type { Plugin, PluginEvent } from '@wizard-harness/core';
import { registrySpec } from './spec.js';

export interface RegistryPanelProps {
  /** 插件列表（GUI 展示扩展：services = 该插件提供的服务名，config = 合并后的生效配置） */
  plugins: (Plugin & { services?: string[]; config?: Record<string, unknown> })[];
  events?: PluginEvent[];
  /** 系统级全局配置（由壳注入） */
  globalConfig?: Record<string, unknown>;
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

type TabId = 'plugins' | 'config' | 'events';
type PluginFilter = 'all' | 'services' | 'ui';

/** 注册表 GUI 组件（真 React，含布局+样式），可就近单独渲染，也可被 obs/gui 装载 */
export function RegistryPanel({
  plugins,
  events = [],
  globalConfig = {},
  onOpenPlugin,
}: RegistryPanelProps): React.ReactElement {
  const [tab, setTab] = useState<TabId>('plugins');
  const [filter, setFilter] = useState<PluginFilter>('all');
  const [query, setQuery] = useState('');
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

    .tabs { display: flex; gap: 2px; padding: 0 22px; border-bottom: 1px solid ${BORDER}; background: rgba(26,26,36,.5); }
    .tab {
      background: none; border: none; color: ${MUTED}; padding: 11px 18px;
      font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent;
      font-family: inherit; letter-spacing: .02em;
    }
    .tab:hover { color: #e6e6ef; }
    .tab.on { color: #e6e6ef; border-bottom-color: ${BLUE}; font-weight: 600; }
    .tab-num { font-size: 11px; margin-left: 4px; }

    .sub-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
    .sub {
      background: #1c1c28; border: 1px solid ${BORDER}; color: ${MUTED};
      border-radius: 16px; padding: 4px 14px; font-size: 12px; cursor: pointer;
      font-family: inherit; transition: all .12s ease;
    }
    .sub:hover { color: #e6e6ef; border-color: ${BORDER_HOVER}; }
    .sub.on { background: rgba(121,192,255,.14); border-color: #4a6aa0; color: ${BLUE}; font-weight: 600; }

    .search {
      margin-left: auto; background: #0d1117; border: 1px solid ${BORDER};
      border-radius: 14px; padding: 5px 12px; font-size: 12px; color: #e6e6ef;
      font-family: inherit; outline: none; min-width: 170px;
      transition: border-color .12s ease;
    }
    .search:focus { border-color: #4a6aa0; }
    .search::placeholder { color: ${MUTED}; }

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

    .tier {
      font-size: 10px; padding: 1px 8px; border-radius: 9px; flex: none;
      border: 1px solid #2c2c3e; color: ${MUTED}; font-weight: 600; letter-spacing: .03em;
    }
    .tier.core { color: ${BLUE}; border-color: rgba(121,192,255,.35); background: rgba(121,192,255,.08); }
    .tier.exp { color: #ffa657; border-color: rgba(255,166,87,.35); background: rgba(255,166,87,.08); }

    .panel-btn {
      margin-left: auto; background: #23232f; color: inherit;
      border: 1px solid #34344a; border-radius: 6px; padding: 3px 12px;
      font-size: 12px; cursor: pointer; transition: background .12s ease, border-color .12s ease;
    }
    .panel-btn:hover { background: #30304a; border-color: #4a4a6a; }

    .svc-chip {
      font-size: 11px; padding: 2px 10px; border-radius: 10px; cursor: pointer;
      background: rgba(121,192,255,.08); border: 1px solid #2c2c3e; color: #79c0ff;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      transition: background .12s ease, border-color .12s ease, transform .12s ease;
      user-select: none;
    }
    .svc-chip::before { content: '◆ '; }
    .svc-chip:hover {
      background: rgba(121,192,255,.2); border-color: #4a6aa0; transform: translateY(-1px);
    }

    .cfg { margin-top: 10px; border-top: 1px dashed #262634; padding-top: 8px; }
    .cfg-row { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; padding: 2px 0; }
    .cfg-k { color: ${MUTED}; flex: none; }
    .cfg-v { color: #e6e6ef; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; word-break: break-all; text-align: right; }

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

      <nav className="tabs">
        <button className={tab === 'plugins' ? 'tab on' : 'tab'} onClick={() => setTab('plugins')}>
          插件<span className="tab-num" style={{ color: GREEN }}>{plugins.length}</span>
        </button>
        <button className={tab === 'config' ? 'tab on' : 'tab'} onClick={() => setTab('config')}>
          全局配置
          <span className="tab-num" style={{ color: BLUE }}>{Object.keys(globalConfig).length}</span>
        </button>
        <button className={tab === 'events' ? 'tab on' : 'tab'} onClick={() => setTab('events')}>
          事件时间线
          <span className="tab-num" style={{ color: BLUE }}>{events.length}</span>
        </button>
      </nav>

      <main style={{ padding: 18, maxHeight: 'calc(100vh - 130px)', overflowY: 'auto' }}>
        {tab === 'plugins' && (() => {
          const withServices = plugins.filter((p) => (p.services ?? []).length > 0);
          const withUi = plugins.filter((p) => p.ui);
          const q = query.trim().toLowerCase();
          const base = filter === 'services' ? withServices : filter === 'ui' ? withUi : plugins;
          const filtered = base.filter(
            (p) =>
              !q ||
              p.manifest.id.toLowerCase().includes(q) ||
              (p.manifest.name ?? '').toLowerCase().includes(q) ||
              (p.manifest.description ?? '').toLowerCase().includes(q),
          );
          return (
          <div>
            <h2 className="sec-title">
              插件
              <span style={{ color: GREEN, marginLeft: 2 }}>{plugins.length}</span>
              <span style={{ color: MUTED, fontWeight: 400, marginLeft: 6 }}>· 全部已注册插件</span>
            </h2>
            <div className="sub-tabs">
              <button className={filter === 'all' ? 'sub on' : 'sub'} onClick={() => setFilter('all')}>
                全部 {plugins.length}
              </button>
              <button className={filter === 'services' ? 'sub on' : 'sub'} onClick={() => setFilter('services')}>
                有服务 {withServices.length}
              </button>
              <button className={filter === 'ui' ? 'sub on' : 'sub'} onClick={() => setFilter('ui')}>
                有弹窗 {withUi.length}
              </button>
              <input
                className="search"
                placeholder="搜索插件（名称 / id / 描述）…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {filtered.length === 0 && (
              <p style={{ fontSize: 13, color: MUTED, padding: '12px 4px' }}>暂无插件</p>
            )}
            {filtered.map((p) => {
              const tierColor =
                p.manifest.tier === 'core'
                  ? '#58a6ff'
                  : p.manifest.tier === 'experimental'
                    ? '#ffa657'
                    : '#3fb950';
              return (
              <div
                key={p.manifest.id}
                className="panel-card"
                style={{
                  padding: '14px 16px',
                  marginBottom: 12,
                  border: '1px solid #262634',
                  borderLeft: `3px solid ${tierColor}`,
                  boxShadow: `0 1px 4px rgba(0,0,0,.3), 0 0 10px ${tierColor}22`,
                }}
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
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 'none' }}>
                    <span className={p.manifest.tier === 'core' ? 'tier core' : p.manifest.tier === 'experimental' ? 'tier exp' : 'tier'}>
                      {p.manifest.tier ?? 'standard'}
                    </span>
                    <code style={{ color: GREEN, fontSize: 11 }}>v{p.manifest.version}</code>
                  </span>
                </div>
                {p.manifest.description && (
                  <p style={{ margin: '5px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
                    {p.manifest.description}
                  </p>
                )}
                {p.config && Object.keys(p.config).length > 0 && (
                  <div className="cfg">
                    {Object.entries(p.config).map(([k, v]) => (
                      <div key={k} className="cfg-row">
                        <span className="cfg-k">{k}</span>
                        <span className="cfg-v">
                          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: GREEN }}>
                    <span className="badge-dot" />
                    运行中
                  </span>
                  {(p.services ?? []).map((s) => (
                    <span
                      key={s}
                      className="svc-chip"
                      title={`打开 ${s} 插件`}
                      onClick={() => onOpenPlugin?.(s)}
                    >
                      {s}
                    </span>
                  ))}
                  {p.ui && onOpenPlugin && (
                    <button className="panel-btn" onClick={() => onOpenPlugin(p.manifest.id)}>
                      弹窗
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
          );
        })()}

        {tab === 'config' && (
          <div>
            <h2 className="sec-title">全局配置</h2>
            {Object.keys(globalConfig).length === 0 ? (
              <p style={{ fontSize: 13, color: MUTED }}>无全局配置</p>
            ) : (
              <div className="panel-card" style={{ padding: '14px 16px' }}>
                {Object.entries(globalConfig).map(([k, v]) => (
                  <div key={k} className="cfg-row" style={{ padding: '6px 0' }}>
                    <span className="cfg-k">{k}</span>
                    <span className="cfg-v">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'events' && (
          <div>
            <h2 className="sec-title">事件时间线</h2>
            {events.length === 0 && (
              <p style={{ fontSize: 13, color: MUTED, padding: '12px 4px' }}>
                暂无事件（插件注册后将实时显示）
              </p>
            )}
            <ul
              className="tl"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}
            >
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
          </div>
        )}
      </main>
    </div>
  );
}
