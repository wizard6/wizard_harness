// Electron 渲染进程入口：装载 obs-core 的 RegistryPanel（经 views/registry.tsx 包装）
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Plugin, PluginEvent } from '@wizard-harness/core';
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
    };
  }
}

function App(): React.ReactElement | null {
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

const root = document.getElementById('root');
if (!root) throw new Error('missing #root mount point');
createRoot(root).render(<App />);
