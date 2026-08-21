// Electron 渲染进程入口：按窗口视图渲染对应面板
// - index.html?view=registry（默认）→ 注册表面板
// - index.html?view=quality → 质量检测面板
// 职责：拉取数据 + 渲染；面板均为纯 props 展示组件（数据源经 IPC 注入）
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CompositionSnapshot, Plugin, PluginEvent } from '@wizard-harness/core';
import { QualityPanel } from '@wizard-harness/obs-core';
import type { QualityData } from '@wizard-harness/obs-core';
import { RegistryView } from '../views/registry.js';
import { TrafficLights } from './TrafficLights.js';

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
  composition?: CompositionSnapshot | null;
}

declare global {
  interface Window {
    wh: {
      getState(): Promise<RendererState>;
      openPlugin(id: string): Promise<void>;
      reloadPlugin(id: string): Promise<{ ok: boolean; version?: string; cascaded?: string[]; error?: string }>;
      unregisterPlugin(id: string): Promise<{ ok: boolean; error?: string }>;
      scanPlugins(): Promise<{
        ok: boolean;
        loaded?: string[];
        already?: string[];
        skipped?: { id: string; reason: string }[];
        error?: string;
      }>;
      windowControl(action: 'min' | 'max' | 'close'): void;
      openQuality(): Promise<void>;
      qualityData(): Promise<QualityData>;
      rerunCheck(): Promise<QualityData & { error?: string }>;
      openFile(rel: string): Promise<{ ok: boolean; error?: string }>;
    };
  }
}

function RegistryApp(): React.ReactElement | null {
  const [state, setState] = useState<RendererState | null>(null);
  const refresh = async () => {
    const s = await window.wh.getState();
    setState(s);
  };
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await window.wh.getState();
        if (alive) setState(s);
      } catch {
        // 主进程未就绪时静默重试
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  if (!state) {
    return (
      <div style={{ color: '#a8a8bd', padding: 48, textAlign: 'center', fontSize: 13 }}>加载中…</div>
    );
  }
  return (
    <RegistryView
      plugins={state.plugins as unknown as (Plugin & { services?: string[]; config?: Record<string, unknown> })[]}
      events={state.events}
      globalConfig={state.config}
      composition={state.composition}
      onOpenPlugin={(id) => void window.wh.openPlugin(id)}
      onReload={async (id) => {
        const r = await window.wh.reloadPlugin(id);
        await refresh();
        return r;
      }}
      onUnregister={async (id) => {
        const r = await window.wh.unregisterPlugin(id);
        await refresh();
        return r;
      }}
      onScan={async () => {
        const r = await window.wh.scanPlugins();
        await refresh();
        return r;
      }}
    />
  );
}

function QualityApp(): React.ReactElement {
  const [quality, setQuality] = useState<QualityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const scanningRef = useRef(false);

  const load = async (mode: 'init' | 'silent' | 'manual' = 'silent') => {
    if (scanningRef.current) return;
    if (mode !== 'silent') setLoading(true);
    try {
      setQuality(await window.wh.qualityData());
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      if (mode !== 'silent') setLoading(false);
    }
  };
  const runRuleScan = async () => {
    scanningRef.current = true;
    setScanning(true);
    try {
      const d = await window.wh.rerunCheck();
      if (d.error) setError(d.error);
      else {
        setQuality(d);
        setError(null);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  };
  useEffect(() => {
    void load('init');
    const timer = setInterval(() => void load('silent'), 4000);
    return () => clearInterval(timer);
  }, []);
  return (
    <QualityPanel
      data={quality ?? emptyQuality()}
      error={error}
      loading={loading}
      scanning={scanning}
      onRefresh={() => void load('manual')}
      onRuleScan={() => void runRuleScan()}
      onOpenFile={(rel) => {
        void window.wh.openFile(rel).then((r) => {
          if (!r.ok) setError(r.error ?? '无法打开文件');
        });
      }}
    />
  );
}

/** 数据未就绪时的占位（避免面板崩溃） */
function emptyQuality(): QualityData {
  return {
    generatedAt: '',
    baseAt: null,
    aiAt: null,
    counts: { total: 0, unchanged: 0, modified: 0, added: 0, removed: 0 },
    rows: [],
  };
}

/** 窗口控制条：拖动区 + 质量入口 + Windows 窗口按钮 */
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
        <TrafficLights />
      </div>
    </div>
  );
}

function App(): React.ReactElement {
  return (
    <div className="win">
      <style>{`
        .win { display:flex; flex-direction:column; height:100vh; }
        .winbar { display:flex; align-items:center; height:38px; flex:none; padding:0 0 0 14px;
                  background:#16161e; border-bottom:1px solid rgba(255,255,255,.08); -webkit-app-region: drag;
                  user-select:none; overflow:hidden; }
        .winbar-title { font-size:12px; color:#8b949e; }
        .winbar-actions { margin-left:auto; display:flex; align-items:center; gap:8px;
                          -webkit-app-region: no-drag; height:100%; }
        .winbar-actions .winbar-quality { width:auto; height:26px; padding:0 12px; font-size:12px;
                                          border:1px solid rgba(255,255,255,.1); border-radius:8px;
                                          background:transparent; color:#a8a8bd; cursor:pointer;
                                          font-family:inherit; }
        .winbar-actions .winbar-quality:hover { color:#79c0ff; border-color:rgba(121,192,255,.4);
                                                background:rgba(121,192,255,.1); }
        .win-body { flex:1; overflow:hidden; background:#16161e; min-height:0; }
      `}</style>
      <WinBar />
      <div className="win-body">{view === 'quality' ? <QualityApp /> : <RegistryApp />}</div>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('missing #root mount point');
createRoot(root).render(<App />);
