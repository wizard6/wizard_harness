// Electron 渲染进程入口：按窗口视图渲染对应面板
// - index.html?view=registry（默认）→ 注册表面板
// - index.html?view=quality → 质量检测面板
// 职责：拉取数据 + 渲染；面板均为纯 props 展示组件（数据源经 IPC 注入）
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Plugin, PluginEvent } from '@wizard-harness/core';
import { QualityPanel } from '@wizard-harness/obs-core';
import type { QualityData } from '@wizard-harness/obs-core';
import { RegistryView } from '../views/registry.js';

const view = new URLSearchParams(window.location.search).get('view') === 'quality' ? 'quality' : 'registry';

interface PluginState {
  manifest: { id: string; version: string; name?: string };
  ui?: { title?: string; content?: string; width?: number; height?: number };
  services: string[];
  config: Record<string, unknown>;
}

interface RendererState {
  events: PluginEvent[];
  config: Record<string, unknown>;
  plugins: PluginState[];
}

declare global {
  interface Window {
    wh: {
      getState(): Promise<RendererState>;
      openPlugin(id: string): Promise<void>;
      reloadPlugin(id: string): Promise<{ ok: boolean; version?: string; cascaded?: string[]; error?: string }>;
      unregisterPlugin(id: string): Promise<{ ok: boolean; error?: string }>;
      windowControl(action: 'min' | 'max' | 'close'): void;
      openQuality(): Promise<void>;
      qualityData(): Promise<QualityData>;
    };
  }
}

function RegistryApp(): React.ReactElement | null {
  const [state, setState] = useState<RendererState | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const s = await window.wh.getState();
        if (alive) setState(s);
      } catch {
        // 主进程未就绪时静默重试
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  if (!state) return null;
  return (
    <RegistryView
      plugins={state.plugins as unknown as (Plugin & { services?: string[]; config?: Record<string, unknown> })[]}
      events={state.events}
      globalConfig={state.config}
      onOpenPlugin={(id) => void window.wh.openPlugin(id)}
      onReload={(id) => void window.wh.reloadPlugin(id)}
      onUnregister={(id) => void window.wh.unregisterPlugin(id)}
    />
  );
}

function QualityApp(): React.ReactElement {
  const [quality, setQuality] = useState<QualityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      setQuality(await window.wh.qualityData());
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <QualityPanel data={quality ?? emptyQuality()} error={error} loading={loading} onRefresh={() => void load()} />;
}

/** 数据未就绪时的占位（避免面板崩溃） */
function emptyQuality(): QualityData {
  return {
    generatedAt: '',
    baseAt: null,
    counts: { total: 0, unchanged: 0, modified: 0, added: 0, removed: 0 },
    rows: [],
  };
}

/** 窗口控制条（无边框窗口的拖动区 + 最小化/关闭按钮） */
function WinBar(): React.ReactElement {
  return (
    <div className="winbar">
      <span className="winbar-title">{view === 'quality' ? '质量检测' : '观测台'}</span>
      <div className="winbar-actions">
        {view === 'registry' && (
          <button className="winbar-quality" title="打开质量检测窗口" onClick={() => void window.wh.openQuality()}>
            质量检测
          </button>
        )}
        <button title="最小化" onClick={() => window.wh.windowControl('min')}>—</button>
        <button className="winbar-close" title="关闭" onClick={() => window.wh.windowControl('close')}>✕</button>
      </div>
    </div>
  );
}

function App(): React.ReactElement {
  return (
    <div className="win">
      <style>{`
        .win { display:flex; flex-direction:column; height:100vh; }
        .winbar { display:flex; align-items:center; height:38px; flex:none; padding:0 8px 0 14px;
                  background:#16161e; border-bottom:1px solid #262634; -webkit-app-region: drag;
                  user-select:none; }
        .winbar-title { font-size:12px; color:#8b949e; }
        .winbar-actions { margin-left:auto; display:flex; gap:6px; }
        .winbar-actions button { -webkit-app-region:no-drag; width:34px; height:26px; border:none;
                                 background:transparent; color:#a8a8bd; font-size:13px; cursor:pointer;
                                 border-radius:6px; }
        .winbar-actions button:hover { background:#21262d; color:#e6edf3; }
        .winbar-actions .winbar-close:hover { background:#f85149; color:#fff; }
        .winbar-actions .winbar-quality { width:auto; padding:0 12px; font-size:12px;
                                          border:1px solid rgba(255,255,255,.1); }
        .winbar-actions .winbar-quality:hover { color:#7ee787; border-color:rgba(126,231,135,.4);
                                                background:rgba(126,231,135,.1); }
        .win-body { flex:1; overflow:auto; background:#0d1117; }
      `}</style>
      <WinBar />
      <div className="win-body">{view === 'quality' ? <QualityApp /> : <RegistryApp />}</div>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('missing #root mount point');
createRoot(root).render(<App />);
