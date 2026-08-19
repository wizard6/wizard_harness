import type { ReactElement } from 'react';

type WindowAction = 'min' | 'max' | 'close';

/** macOS 风格交通灯：关 / 最小化 / 最大化（仅桌面壳使用） */
export function TrafficLights(): ReactElement {
  const act = (action: WindowAction) => window.wh.windowControl?.(action);

  return (
    <>
      <style>{`
        .traffic {
          display: flex; gap: 8px; align-items: center; flex: none;
          padding: 2px 4px; -webkit-app-region: no-drag;
        }
        .tl-btn {
          width: 12px; height: 12px; border-radius: 50%; border: none; padding: 0;
          cursor: default; position: relative;
          box-shadow: 0 0 0 0.5px rgba(0,0,0,.28);
        }
        .tl-btn::after {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          font-size: 9px; line-height: 12px; font-weight: 700; color: rgba(0,0,0,.55);
          opacity: 0; pointer-events: none;
        }
        .traffic:hover .tl-btn::after { opacity: 1; }
        .tl-close { background: #ff5f57; }
        .tl-close::after { content: '×'; font-size: 11px; }
        .tl-min { background: #febc2e; }
        .tl-min::after { content: '−'; }
        .tl-max { background: #28c840; }
        .tl-max::after { content: '+'; font-size: 10px; }
        .tl-btn:active { filter: brightness(.88); }
      `}</style>
      <div className="traffic" role="toolbar" aria-label="窗口控制">
        <button type="button" className="tl-btn tl-close" title="关闭" onClick={() => act('close')} />
        <button type="button" className="tl-btn tl-min" title="最小化" onClick={() => act('min')} />
        <button type="button" className="tl-btn tl-max" title="最大化" onClick={() => act('max')} />
      </div>
    </>
  );
}
