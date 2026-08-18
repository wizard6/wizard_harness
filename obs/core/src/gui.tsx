import React from 'react';
import type { Plugin } from '@wizard-harness/core';

export interface RegistryEvent {
  actor: string;
  action: string;
  target?: string;
  ts: number;
}

export interface RegistryPanelProps {
  plugins: Plugin[];
  events?: RegistryEvent[];
  onOpenPlugin?: (id: string) => void;
}

/** 注册表 GUI 组件（真 React，含布局+样式），可就近单独渲染，也可被 observers/gui 装载 */
export function RegistryPanel({
  plugins,
  events = [],
  onOpenPlugin,
}: RegistryPanelProps): React.ReactElement {
  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: 12,
        color: '#e6e6ef',
        background: '#16161e',
        minHeight: '100vh',
      }}
    >
      <h2 style={{ margin: '0 0 8px' }}>注册表</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {plugins.map((p) => (
          <li
            key={p.manifest.id}
            style={{
              padding: '6px 8px',
              border: '1px solid #2c2c3a',
              borderRadius: 6,
              marginBottom: 6,
            }}
          >
            {p.manifest.name || p.manifest.id} <code>{p.manifest.version}</code>
            {p.ui && onOpenPlugin && (
              <button onClick={() => onOpenPlugin(p.manifest.id)} style={{ marginLeft: 8 }}>
                弹窗
              </button>
            )}
          </li>
        ))}
      </ul>
      <h3 style={{ marginBottom: 6 }}>事件</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {events
          .slice(-20)
          .reverse()
          .map((e, i) => (
            <li key={i} style={{ color: '#9cdcfe', fontSize: 13, marginBottom: 3 }}>
              {new Date(e.ts).toISOString().slice(11, 19)} {e.actor} → {e.action}{' '}
              {e.target ?? ''}
            </li>
          ))}
      </ul>
    </div>
  );
}
