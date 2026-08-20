// Electron 渲染进程入口：观测台（注册表 / 质量检测 两个 tab）
// 职责：拉取数据 + 视图切换；组件与数据源解耦（面板均为纯 props 展示组件）
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Plugin, PluginEvent } from '@wizard-harness/core';
import { QualityPanel } from '@wizard-harness/obs-core';
import type { QualityData } from '@wizard-harness/obs-core';
import { RegistryView } from '../views/registry.js';

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
      qualityData(): Promise<QualityData>;
    };
  }
}

type Tab = 'registry' | 'quality';

function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('registry');
  const [state, setState] = useState<RendererState | null>(null);
  const [quality, setQuality] = useState<QualityData | null>(null);
  const [qualityError, setQualityError] = useState<string | null>(null);

  // 注册表数据：1.5s 轮询
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

  // 质检数据：3s 轮询 + 手动刷新
  const loadQuality = async () => {
    try {
      const d = await window.wh.qualityData();
      setQuality(d);
      setQualityError(null);
    } catch (err) {
      setQualityError(String(err));
    }
  };
  useEffect(() => {
    void loadQuality();
    const timer = setInterval(() => void loadQuality(), 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="shell">
      <style>{`
        .shell { display:flex; flex-direction:column; height:100vh; }
        .tabs { display:flex; gap:6px; padding:10px 14px; border-bottom:1px solid #262634;
                background:#16161e; -webkit-app-region: drag; }
        .tabs button { -webkit-app-region: no-drag; background:#16161e; color:#a8a8bd;
                       border:1px solid #262634; border-radius:8px; padding:6px 16px;
                       font-size:13px; cursor:pointer; }
        .tabs button.active { color:#7ee787; border-color:#7ee787; background:rgba(126,231,135,.08); }
        .body { flex:1; overflow:auto; background:#0d1117; }
      `}</style>
      <div className="tabs">
        <button className={tab === 'registry' ? 'active' : ''} onClick={() => setTab('registry')}>
          注册表
        </button>
        <button className={tab === 'quality' ? 'active' : ''} onClick={() => setTab('quality')}>
          质量检测
        </button>
      </div>
      <div className="body">
        {tab === 'registry' ? (
          state ? (
            <RegistryView
              plugins={state.plugins as unknown as (Plugin & { services?: string[]; config?: Record<string, unknown> })[]}
              events={state.events}
              globalConfig={state.config}
              onOpenPlugin={(id) => void window.wh.openPlugin(id)}
              onReload={(id) => void window.wh.reloadPlugin(id)}
              onUnregister={(id) => void window.wh.unregisterPlugin(id)}
            />
          ) : null
        ) : (
          <QualityPanel data={quality ?? emptyQuality()} error={qualityError} onRefresh={() => void loadQuality()} />
        )}
      </div>
    </div>
  );
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

const root = document.getElementById('root');
if (!root) throw new Error('missing #root mount point');
createRoot(root).render(<App />);
