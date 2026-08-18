// Electron 渲染进程入口：装载 obs-core 的 RegistryPanel（经 views/registry.tsx 包装）
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
    };
  }
}

async function main(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) throw new Error('missing #root mount point');
  const state = await window.wh.getState();
  createRoot(root).render(
    <RegistryView
      plugins={state.plugins as unknown as (Plugin & { services?: string[]; config?: Record<string, unknown> })[]}
      events={state.events}
      globalConfig={state.config}
      onOpenPlugin={(id) => void window.wh.openPlugin(id)}
    />,
  );
}

void main();
