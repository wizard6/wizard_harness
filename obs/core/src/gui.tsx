import React, { useMemo, useState } from 'react';
import type { CompositionSnapshot, Plugin, PluginEvent } from '@wizard-harness/core';
import { registrySpec } from './spec.js';
import { DepCanvas } from './dep-canvas.js';
import {
  buildDependencyForest,
  filterDepForest,
  type DepDirection,
} from './dep-graph.js';

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
  /** 启用 / 禁用（写 home patch + 运行时 unregister / scan） */
  onSetEnabled?: (id: string, enabled: boolean) => Promise<{ ok?: boolean; error?: string; enabled?: boolean } | void> | { ok?: boolean; error?: string; enabled?: boolean } | void;
  /** 再扫描插件目录，装入尚未注册的插件 */
  onScan?: () => Promise<ScanFeedback | void> | ScanFeedback | void;
  /** 清空事件账本（内存 + 落盘） */
  onClearEvents?: () => Promise<{ ok?: boolean; error?: string } | void> | { ok?: boolean; error?: string } | void;
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
  warnings?: string[];
  error?: string;
}

import { BLUE, GREEN, MUTED, PANEL_CSS } from './gui-styles.js';


function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

type TabId = 'plugins' | 'services' | 'deps' | 'config' | 'events';

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
  onSetEnabled,
  onScan,
  onClearEvents,
  trailing,
  onHeaderDoubleClick,
}: RegistryPanelProps): React.ReactElement {
  const [tab, setTab] = useState<TabId>('plugins');
  const [depDirection, setDepDirection] = useState<DepDirection>('depends-on');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const serviceEntries = collectServices(plugins);
  const depForest = useMemo(
    () => buildDependencyForest(plugins, depDirection),
    [plugins, depDirection],
  );
  const theme = registrySpec.theme;
  const eventColors = theme?.eventColors ?? {};

  const q = query.trim().toLowerCase();

  const tabBtn = (id: TabId, label: string, count?: number) => (
    <button type="button" className={tab === id ? 'rp-tab on' : 'rp-tab'} onClick={() => setTab(id)}>
      {label}
      {count !== undefined ? <span className="rp-tab-n">{count}</span> : null}
    </button>
  );

  const showToolbar = tab === 'plugins' || tab === 'services' || tab === 'deps' || tab === 'events';

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
      const warnings = (r.warnings ?? []).filter((w) => !w.startsWith('组合树未解析到插件'));
      setFresh(new Set(loaded));
      if (loaded.length > 0) {
        setNotice({ kind: 'ok', text: `已装入 ${loaded.join('、')}` });
      } else if (skipped.length > 0) {
        const why = warnings.length ? ` ${warnings.join('；')}` : '';
        setNotice({
          kind: 'warn',
          text: `没有新插件。跳过：${skipped.map((s) => `${s.id}（${s.reason}）`).join('、')}。${why}`.trim(),
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

  const runClearEvents = async () => {
    if (!onClearEvents || busy) return;
    setBusy(true);
    try {
      const raw = await onClearEvents();
      const r = (raw ?? {}) as { ok?: boolean; error?: string };
      if (r.ok === false) {
        setNotice({ kind: 'err', text: r.error || '清空失败' });
        return;
      }
      setNotice({ kind: 'ok', text: '事件已清空' });
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

  const runSetEnabled = async (id: string, enabled: boolean, name: string) => {
    if (!onSetEnabled || busy) return;
    const verb = enabled ? '启用' : '禁用';
    if (!enabled && !window.confirm(`禁用「${name}」？将卸载运行时实例并写入 home patch。`)) return;
    setBusy(true);
    try {
      const raw = await onSetEnabled(id, enabled);
      const r = (raw ?? {}) as { ok?: boolean; error?: string };
      if (r.ok === false) {
        setNotice({ kind: 'err', text: r.error || `${verb}失败` });
        return;
      }
      setNotice({ kind: enabled ? 'ok' : 'warn', text: enabled ? `已启用 ${id}` : `已禁用 ${id}` });
      if (enabled) {
        setFresh((prev) => new Set(prev).add(id));
      } else {
        setFresh((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    } catch (err) {
      setNotice({ kind: 'err', text: String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rp">
      <style>{PANEL_CSS}</style>
      <div className="rp-head" onDoubleClick={onHeaderDoubleClick}>
        <div className="rp-tabs">
          {tabBtn('plugins', '插件', plugins.length)}
          {tabBtn('services', '服务', serviceEntries.length)}
          {tabBtn('deps', '依赖', plugins.length)}
          {tabBtn('config', '配置', composition ? composition.entries.length : Object.keys(globalConfig).length)}
          {tabBtn('events', '事件', events.length)}
        </div>
        {trailing ? <span className="rp-trail">{trailing}</span> : null}
      </div>

      {showToolbar && (
        <div className="rp-toolbar">
          {tab === 'deps' && (
            <>
              <button
                type="button"
                className={depDirection === 'depends-on' ? 'rp-sub on' : 'rp-sub'}
                onClick={() => setDepDirection('depends-on')}
              >
                我依赖谁
              </button>
              <button
                type="button"
                className={depDirection === 'depended-by' ? 'rp-sub on' : 'rp-sub'}
                onClick={() => setDepDirection('depended-by')}
              >
                谁依赖我
              </button>
            </>
          )}
          {tab === 'plugins' && onScan && (
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
          {tab === 'events' && onClearEvents && (
            <button
              type="button"
              className="rp-sub"
              title="清空内存缓冲与落盘账本"
              disabled={busy || events.length === 0}
              onClick={() => void runClearEvents()}
            >
              清空
            </button>
          )}
          <input
            className="rp-search"
            placeholder={
              tab === 'plugins'
                ? '过滤插件…'
                : tab === 'deps'
                  ? '过滤依赖树…'
                  : tab === 'events'
                    ? '过滤事件…'
                    : '过滤服务…'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
            }}
            style={tab === 'services' || tab === 'deps' ? { marginLeft: 0 } : undefined}
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
          const filtered = plugins.filter(
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
                  {(p.ui && onOpenPlugin) || onReload || onSetEnabled || onUnregister ? (
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
                      {onSetEnabled && (
                        <button
                          type="button"
                          className="rp-btn danger"
                          title="禁用并写入 $WH_HOME/wizard.patch.json"
                          onClick={() => void runSetEnabled(p.manifest.id, false, p.manifest.name || p.manifest.id)}
                        >
                          禁用
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

        {tab === 'deps' && (() => {
          const shown = filterDepForest(depForest, q);
          if (shown.length === 0) {
            return <div className="rp-empty">{q ? `没有匹配「${q}」的依赖` : '暂无运行中插件'}</div>;
          }
          return (
            <DepCanvas
              forest={shown}
              direction={depDirection}
              plugins={plugins.map((p) => ({
                manifest: p.manifest,
                services: p.services,
              }))}
            />
          );
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
                      {e.disabled && onSetEnabled ? (
                        <button
                          type="button"
                          className="rp-btn"
                          style={{ marginLeft: 8 }}
                          onClick={() => void runSetEnabled(e.id, true, e.name)}
                        >
                          启用
                        </button>
                      ) : null}
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
