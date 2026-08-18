import type { PluginEvent } from '@wizard-harness/core';

/** 观测主题（样式/配色），供各渲染器使用 */
export interface ObsTheme {
  /** TUI 用：事件 action → 颜色 */
  eventColors?: Record<string, string>;
  /** GUI 用：面板配色 */
  panel?: { bg?: string; fg?: string };
}

/** 观测定义契约：组件声明"长什么样"，渲染器据此渲染 */
export interface ObsSpec {
  id: string;
  title: string;
  renderEvent?(event: PluginEvent): string;
  summarize?(events: PluginEvent[]): string;
  theme?: ObsTheme;
}
