import type { ReactElement } from 'react';

type WindowAction = 'min' | 'close';

/** Windows 风格标题栏按钮：最小化 / 关闭（仅桌面壳使用） */
export function TrafficLights(): ReactElement {
  const act = (action: WindowAction) => window.wh.windowControl?.(action);

  return (
    <>
      <style>{`
        .win-caption {
          display: flex; height: 38px; margin: 0; flex: none;
          -webkit-app-region: no-drag;
        }
        .win-caption button {
          width: 46px; height: 38px; border: none; padding: 0; background: transparent;
          color: #d7d7e0; cursor: default; display: flex; align-items: center; justify-content: center;
        }
        .win-caption button:hover { color: #fff; }
        .win-caption .wc-min:hover { background: rgba(255,255,255,.08); }
        .win-caption .wc-close:hover { background: #e81123; }
        .win-caption .wc-min:active { background: rgba(255,255,255,.14); }
        .win-caption .wc-close:active { background: #c50f1f; }
        .win-caption svg { width: 10px; height: 10px; display: block; }
      `}</style>
      <div className="win-caption" role="toolbar" aria-label="窗口控制">
        <button type="button" className="wc-min" title="最小化" onClick={() => act('min')}>
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <rect y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="wc-close" title="关闭" onClick={() => act('close')}>
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1.2 1.2 L8.8 8.8 M8.8 1.2 L1.2 8.8" stroke="currentColor" strokeWidth="1.15" />
          </svg>
        </button>
      </div>
    </>
  );
}
