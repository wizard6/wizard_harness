import React, { useState } from 'react';
import type { CompositionSnapshot, Plugin, PluginEvent } from '@wizard-harness/core';
import { registrySpec } from './spec.js';

export interface RegistryPanelProps {
  /** 插件列表（GUI 展示扩展：services = 该插件提供的服务名，config = 合并后的生效配置） */
  plugins: (Plugin & { services?: string[]; config?: Record<string, unknown> })[];
  events?: PluginEvent[];
  /** 系统级全局配置（由壳注入） */
  globalConfig?: Record<string, unknown>;
  /** profile 组合快照（未使用 profile 时为空） */
  composition?: CompositionSnapshot | null;
  onOpenPlugin?: (id: string) => void;
  /** 热重载该插件 */
  onReload?: (id: string) => Promise<unknown> | void;
  /** 卸载该插件 */
  onUnregister?: (id: string) => Promise<unknown> | void;
  /** 再扫描插件目录，装入尚未注册的插件 */
  onScan?: () => Promise<ScanFeedback | void> | ScanFeedback | void;
  /** 标题栏右侧槽（桌面壳放入交通灯） */
  trailing?: React.ReactNode;
  /** 双击标题栏（桌面壳用于最大化） */
  onHeaderDoubleClick?: () => void;
}

export interface ScanFeedback {
  ok?: boolean;
  loaded?: string[];
  already?: string[];
  skipped?: { id: string; reason: string }[];
  error?: string;
}

const MUTED = '#8b949e';
const GREEN = '#7ee787';
const BLUE = '#79c0ff';
const RED = '#ff7b72';
const PANEL_CSS = `
    .rp { font: 13px/1.55 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
          padding: 14px 18px 12px; height: 100%; box-sizing: border-box;
          display: flex; flex-direction: column; min-height: 0; color: #e6e6ef; }
    .rp-head { display:flex; align-items:center; gap:12px; margin-bottom:10px; flex:none; }
    .rp-tabs { display:flex; gap:2px; flex:none; }
    .rp-tab { background:transparent; border:none; color:#8b8b9c; padding:5px 10px;
              font-size:13px; font-family:inherit; cursor:pointer; display:inline-flex;
              align-items:center; gap:6px; font-weight:600; border-radius:8px; }
    .rp-tab:hover { color:#e6e6ef; background:rgba(255,255,255,.05); }
    .rp-tab.on { color:#9ecbff; background:rgba(121,192,255,.1); }
    .rp-tab-n { font-size:11px; font-weight:600; color:#8b949e; }
    .rp-tab.on .rp-tab-n { color:#79c0ff; }
    .rp-trail { margin-left:auto; display:inline-flex; align-items:center; }
    .rp-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:10px; flex:none; }
    .rp-sub { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); color:${MUTED};
              border-radius:6px; padding:3px 10px; height:24px; box-sizing:border-box;
              font-size:11px; cursor:pointer; font-family:inherit; }
    .rp-sub:hover { color:#e6e6ef; border-color:rgba(255,255,255,.18); }
    .rp-sub.on { background:rgba(121,192,255,.14); border-color:rgba(121,192,255,.35); color:${BLUE}; font-weight:600; }
    .rp-sub.primary { background:rgba(121,192,255,.16); border-color:rgba(121,192,255,.4); color:#9ecbff; font-weight:600; }
    .rp-sub.primary:hover { background:rgba(121,192,255,.24); color:#e6e6ef; }
    .rp-sub:disabled { opacity:.45; cursor:default; }
    .rp-banner { flex:none; margin:-2px 0 10px; padding:8px 12px; border-radius:8px; font-size:12px; line-height:1.5;
                 border:1px solid rgba(255,255,255,.1); color:#d7d7e4; }
    .rp-banner.ok { border-color:rgba(126,231,135,.3); background:rgba(126,231,135,.08); color:${GREEN}; }
    .rp-banner.warn { border-color:rgba(255,166,87,.3); background:rgba(255,166,87,.08); color:#ffa657; }
    .rp-banner.err { border-color:rgba(255,123,114,.35); background:rgba(255,123,114,.08); color:${RED}; }
    .rp-card.fresh { border-color:rgba(126,231,135,.5); box-shadow:0 0 0 1px rgba(126,231,135,.18); }
    .rp-search { margin-left:auto; box-sizing:border-box; background:rgba(255,255,255,.04);
                 border:1px solid rgba(255,255,255,.1); border-radius:6px; color:#d7d7e0;
                 font-size:11px; font-family:inherit; outline:none; padding:3px 8px; height:24px; width:200px; }
    .rp-search:focus { border-color:rgba(255,255,255,.22); }
    .rp-search::placeholder { color:#7a7a8a; }
    .rp-body { flex:1; min-height:0; overflow:auto; }
    .rp-empty { color:${MUTED}; text-align:center; padding:36px 12px; }
    .rp-card { background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.08);
               border-radius:12px; padding:12px 14px; margin-bottom:8px; }
    .rp-card:hover { background:rgba(255,255,255,.06); }
    .rp-card-head { display:flex; align-items:center; gap:8px; min-width:0; }
    .rp-name { font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .rp-name.open { cursor:pointer; }
    .rp-name.open:hover { color:${BLUE}; }
    .rp-meta { margin-left:auto; display:flex; gap:6px; align-items:center; flex:none; }
    .rp-desc { margin:4px 0 0; font-size:12px; color:${MUTED}; line-height:1.5; }
    .rp-tier { font-size:10px; padding:1px 7px; border-radius:999px; flex:none;
               border:1px solid rgba(255,255,255,.12); color:${MUTED}; font-weight:600; letter-spacing:.03em; }
    .rp-tier.core { color:${BLUE}; border-color:rgba(121,192,255,.35); background:rgba(121,192,255,.08); }
    .rp-tier.exp { color:#ffa657; border-color:rgba(255,166,87,.35); background:rgba(255,166,87,.08); }
    .rp-ver { color:${GREEN}; font-size:11px; font-family:ui-monospace,Consolas,monospace; }
    .rp-foot { display:flex; gap:6px; margin-top:10px; align-items:center; flex-wrap:wrap; }
    .rp-live { font-size:11px; color:${GREEN}; font-weight:600; }
    .rp-chip { font-size:11px; padding:2px 8px; border-radius:6px; cursor:pointer;
               background:rgba(121,192,255,.1); border:1px solid rgba(121,192,255,.22); color:${BLUE};
               font-family:ui-monospace,Consolas,monospace; }
    .rp-chip:hover { background:rgba(121,192,255,.2); }
    .rp-chip.plain { cursor:default; }
    .rp-chip .id { color:${MUTED}; margin-left:6px; font-family:inherit; }
    .rp-actions { margin-left:auto; display:flex; gap:6px; }
    .rp-btn { background:transparent; color:#a8a8bd;
              border:1px solid rgba(255,255,255,.12); border-radius:6px; padding:3px 10px;
              font-size:12px; cursor:pointer; font-family:inherit; }
    .rp-btn:hover { color:#e6e6ef; background:rgba(255,255,255,.08); }
    .rp-btn.danger { color:${RED}; border-color:rgba(255,123,114,.35); }
    .rp-btn.danger:hover { background:rgba(255,123,114,.1); }
    .rp-cfg { margin-top:8px; border-top:1px solid rgba(255,255,255,.06); padding-top:6px; }
    .rp-cfg-row { display:flex; justify-content:space-between; gap:12px; font-size:11px; padding:3px 0; }
    .rp-cfg-k { color:${MUTED}; flex:none; }
    .rp-cfg-v { color:#e6e6ef; font-family:ui-monospace,Consolas,monospace; word-break:break-all; text-align:right; }
    .rp-tl { list-style:none; padding:0; margin:0; }
    .rp-tl-item { display:grid; grid-template-columns:56px 150px 16px 1fr; gap:8px;
                  align-items:baseline; padding:6px 8px; border-radius:6px; }
    .rp-tl-item:hover { background:rgba(255,255,255,.04); }
    .rp-tl-time { color:${MUTED}; font-size:11px; font-family:ui-monospace,Consolas,monospace; }
    .rp-tl-actor { color:#cfcfe0; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .rp-tl-arrow { color:${MUTED}; font-size:12px; }
    .rp-tl-text { font-size:12px; word-break:break-all; font-family:ui-monospace,Consolas,monospace; }
`;

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

type TabId = 'plugins' | 'services' | 'config' | 'events';
type PluginFilter = 'all' | 'services' | 'ui';

function collectServices(
  plugins: RegistryPanelProps['plugins'],
): { name: string; providers: { id: string; title: string; hasUi: boolean }[] }[] {
  const map = new Map<string, { id: string; title: string; hasUi: boolean }[]>();
  for (const p of plugins) {
    for (const s of p.services ?? []) {
      const list = map.get(s) ?? [];
      list.push({
        id: p.manifest.id,
        title: p.manifest.name || p.manifest.id,
        hasUi: Boolean(p.ui),
      });
      map.set(s, list);
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'zh'))
    .map(([name, providers]) => ({ name, providers }));
}

/** 注册表 GUI 组件（真 React，含布局+样式），可就近单独渲染，也可被 obs/gui 装载 */
export function RegistryPanel({
  plugins,
  events = [],
  globalConfig = {},
  composition,
  onOpenPlugin,
  onReload,
  onUnregister,
  onScan,
  trailing,
  onHeaderDoubleClick,
}: RegistryPanelProps): React.ReactElement {
  const [tab, setTab] = useState<TabId>('plugins');
  const [filter, setFilter] = useState<PluginFilter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const serviceEntries = collectServices(plugins);
  const theme = registrySpec.theme;
  const eventColors = theme?.eventColors ?? {};

  const withServices = plugins.filter((p) => (p.services ?? []).length > 0);
  const withUi = plugins.filter((p) => p.ui);
  const q = query.trim().toLowerCase();

  const tabBtn = (id: TabId, label: string, count?: number) => (
    <button type="button" className={tab === id ? 'rp-tab on' : 'rp-tab'} onClick={() => setTab(id)}>
      {label}
      {count !== undefined ? <span className="rp-tab-n">{count}</span> : null}
    </button>
  );

  const showToolbar = tab === 'plugins' || tab === 'services' || tab === 'events';

  const runScan = async () => {
    if (!onScan || busy) return;
    setBusy(true);
    setNotice({ kind: 'ok', text: '正在扫描插件目录…' });
    try {
      const raw = await onScan();
      const r = (raw ?? {}) as ScanFeedback;
      if (r.ok === false) {
        setNotice({ kind: 'err', text: r.error || '扫描失败' });
        setFresh(new Set());
        return;
      }
      const loaded = r.loaded ?? [];
      const skipped = (r.skipped ?? []).filter((s) => s.reason !== 'disabled');
      setFresh(new Set(loaded));
      if (loaded.length > 0) {
        setNotice({ kind: 'ok', text: `已装入 ${loaded.join('、')}` });
      } else if (skipped.length > 0) {
        setNotice({
          kind: 'warn',
          text: `没有新插件。跳过：${skipped.map((s) => `${s.id}（${s.reason}）`).join('、')}`,
        });
      } else {
        setNotice({ kind: 'ok', text: '没有尚未注册的插件（当前已全部装入）' });
      }
    } catch (err) {
      setNotice({ kind: 'err', text: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const runUnregister = (id: string, name: string) => {
    if (!onUnregister || busy) return;
    if (!window.confirm(`卸载「${name}」？依赖它的插件可能被级联卸掉。`)) return;
    void Promise.resolve(onUnregister(id)).then(() => {
      setNotice({ kind: 'warn', text: `已卸载 ${id}` });
      setFresh((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  };

  return (
    <div className="rp">
      <style>{PANEL_CSS}</style>
      <div className="rp-head" onDoubleClick={onHeaderDoubleClick}>
        <div className="rp-tabs">
          {tabBtn('plugins', '插件', plugins.length)}
          {tabBtn('services', '服务', serviceEntries.length)}
          {tabBtn('config', '配置', composition ? composition.entries.length : Object.keys(globalConfig).length)}
          {tabBtn('events', '事件', events.length)}
        </div>
        {trailing ? <span className="rp-trail">{trailing}</span> : null}
      </div>

      {showToolbar && (
        <div className="rp-toolbar">
          {tab === 'plugins' && (
            <>
              <button type="button" className={filter === 'all' ? 'rp-sub on' : 'rp-sub'} onClick={() => setFilter('all')}>
                全部 {plugins.length}
              </button>
              <button type="button" className={filter === 'services' ? 'rp-sub on' : 'rp-sub'} onClick={() => setFilter('services')}>
                有服务 {withServices.length}
              </button>
              <button type="button" className={filter === 'ui' ? 'rp-sub on' : 'rp-sub'} onClick={() => setFilter('ui')}>
                有弹窗 {withUi.length}
              </button>
              {onScan && (
                <button
                  type="button"
                  className="rp-sub primary"
                  title="重新扫描 plugins/ 并加载尚未注册的插件"
                  disabled={busy}
                  onClick={() => void runScan()}
                >
                  {busy ? '扫描中…' : '扫描新插件'}
                </button>
              )}
            </>
          )}
          <input
            className="rp-search"
            placeholder={
              tab === 'plugins' ? '过滤插件…' : tab === 'events' ? '过滤事件…' : '过滤服务…'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
            }}
            style={tab === 'services' ? { marginLeft: 0 } : undefined}
          />
        </div>
      )}

      {notice && (
        <div className={`rp-banner ${notice.kind}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="rp-body">
        {tab === 'plugins' && (() => {
          const base = filter === 'services' ? withServices : filter === 'ui' ? withUi : plugins;
          const filtered = base.filter(
            (p) =>
              !q ||
              p.manifest.id.toLowerCase().includes(q) ||
              (p.manifest.name ?? '').toLowerCase().includes(q) ||
              (p.manifest.description ?? '').toLowerCase().includes(q),
          );
          if (filtered.length === 0) {
            return (
              <div className="rp-empty">
                {q ? `没有匹配「${q}」的插件` : '暂无插件。点「扫描新插件」从 plugins/ 装入。'}
              </div>
            );
          }
          return filtered.map((p) => {
            const tierClass =
              p.manifest.tier === 'core' ? 'core' : p.manifest.tier === 'experimental' ? 'exp' : '';
            return (
              <div key={p.manifest.id} className={`rp-card${fresh.has(p.manifest.id) ? ' fresh' : ''}`}>
                <div className="rp-card-head">
                  <span
                    className={`rp-name${p.ui && onOpenPlugin ? ' open' : ''}`}
                    title={p.ui ? '打开插件弹窗' : undefined}
                    onClick={() => p.ui && onOpenPlugin?.(p.manifest.id)}
                  >
                    {p.manifest.name || p.manifest.id}
                  </span>
                  <span className="rp-meta">
                    <span className={`rp-tier${tierClass ? ` ${tierClass}` : ''}`}>
                      {p.manifest.tier ?? 'standard'}
                    </span>
                    <span className="rp-ver">v{p.manifest.version}</span>
                  </span>
                </div>
                {p.manifest.description && <p className="rp-desc">{p.manifest.description}</p>}
                {(() => {
                  const rows = Object.entries(p.config ?? {}).filter(
                    ([, v]) => v !== '' && v !== undefined && v !== null,
                  );
                  if (rows.length === 0) return null;
                  return (
                  <div className="rp-cfg">
                    {rows.map(([k, v]) => (
                      <div key={k} className="rp-cfg-row">
                        <span className="rp-cfg-k">{k}</span>
                        <span className="rp-cfg-v">
                          {/key|token|secret|password/i.test(k)
                            ? '••••'
                            : typeof v === 'object'
                              ? JSON.stringify(v)
                              : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                  );
                })()}
                <div className="rp-foot">
                  <span className="rp-live">运行中</span>
                  {(p.services ?? []).map((s) => (
                    <span
                      key={s}
                      className="rp-chip"
                      title={`服务 ${s}（由 ${p.manifest.id} 提供）`}
                      onClick={() => onOpenPlugin?.(p.manifest.id)}
                    >
                      {s}
                    </span>
                  ))}
                  {(p.ui && onOpenPlugin) || onReload || onUnregister ? (
                    <span className="rp-actions">
                      {p.ui && onOpenPlugin && (
                        <button type="button" className="rp-btn" onClick={() => onOpenPlugin(p.manifest.id)}>
                          打开
                        </button>
                      )}
                      {onReload && (
                        <button
                          type="button"
                          className="rp-btn"
                          title="热重载该插件（重新扫描 dist 并替换）"
                          onClick={() => void onReload(p.manifest.id)}
                        >
                          重载
                        </button>
                      )}
                      {onUnregister && (
                        <button
                          type="button"
                          className="rp-btn danger"
                          title="卸载该插件（onStop + effect 撤销 + 服务摘除）"
                          onClick={() => runUnregister(p.manifest.id, p.manifest.name || p.manifest.id)}
                        >
                          卸载
                        </button>
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          });
        })()}

        {tab === 'services' && (() => {
          const filtered = serviceEntries.filter(
            (s) =>
              !q ||
              s.name.toLowerCase().includes(q) ||
              s.providers.some(
                (p) => p.id.toLowerCase().includes(q) || p.title.toLowerCase().includes(q),
              ),
          );
          if (filtered.length === 0) return <div className="rp-empty">暂无服务</div>;
          return filtered.map((s) => (
            <div key={s.name} className="rp-card">
              <div className="rp-card-head">
                <span className="rp-name" style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>
                  {s.name}
                </span>
                <span className="rp-meta">
                  <span className="rp-tier" style={{ color: s.providers.length > 1 ? GREEN : MUTED }}>
                    {s.providers.length} 个提供方
                  </span>
                </span>
              </div>
              <div className="rp-foot">
                {s.providers.map((p) => (
                  <span
                    key={p.id}
                    className={`rp-chip${p.hasUi ? '' : ' plain'}`}
                    title={`由插件 ${p.id} 提供`}
                    onClick={() => p.hasUi && onOpenPlugin?.(p.id)}
                  >
                    {p.title}
                    <span className="id">{p.id}</span>
                  </span>
                ))}
              </div>
            </div>
          ));
        })()}

        {tab === 'config' && (
          <>
            {composition ? (
              <div className="rp-card">
                <div className="rp-card-head">
                  <span className="rp-name">{composition.profile}</span>
                  <span className="rp-meta">
                    <span className="rp-tier">{composition.bundles.length} bundles</span>
                  </span>
                </div>
                <p className="rp-desc">{composition.bundles.join(' → ') || '（无 bundle）'}</p>
                {composition.entries.map((e) => (
                  <div key={e.id} className="rp-cfg-row">
                    <span className="rp-cfg-k">{e.id}</span>
                    <span className="rp-cfg-v">
                      {e.name}
                      {e.disabled ? ' · disabled' : ''}
                      {e.config ? ` · ${JSON.stringify(e.config)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rp-empty">未使用 profile（目录发现全部插件）</div>
            )}
            {Object.keys(globalConfig).length === 0 ? (
              composition ? null : <div className="rp-empty">无全局配置</div>
            ) : (
              <div className="rp-card">
                {Object.entries(globalConfig).map(([k, v]) => (
                  <div key={k} className="rp-cfg-row" style={{ padding: '6px 0' }}>
                    <span className="rp-cfg-k">{k}</span>
                    <span className="rp-cfg-v">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'events' &&
          (() => {
            const eq = q;
            const shown = events.filter(
              (e) =>
                !eq ||
                e.action.toLowerCase().includes(eq) ||
                e.actor.toLowerCase().includes(eq) ||
                (e.target ?? '').toLowerCase().includes(eq),
            );
            if (shown.length === 0) {
              return <div className="rp-empty">{q ? `没有匹配「${q}」的事件` : '暂无事件'}</div>;
            }
            return (
            <ul className="rp-tl">
              {shown
                .slice(-80)
                .reverse()
                .map((e, i) => {
                  const color = eventColors[e.action] ?? BLUE;
                  return (
                    <li key={`${e.id ?? i}-${e.ts}`} className="rp-tl-item">
                      <span className="rp-tl-time">{fmtTime(e.ts)}</span>
                      <span className="rp-tl-actor">{e.actor}</span>
                      <span className="rp-tl-arrow">→</span>
                      <span className="rp-tl-text" style={{ color }}>
                        {e.action}
                        {e.target ? ' ' + e.target : ''}
                      </span>
                    </li>
                  );
                })}
            </ul>
            );
          })()}
      </div>
    </div>
  );
}
