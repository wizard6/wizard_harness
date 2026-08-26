import type { Plugin } from '@wizard-harness/core';
import type { PomodoroService } from '@wizard-harness/contracts';
import { POMODORO_SERVICE } from '@wizard-harness/contracts';
import { createPomodoroHost } from './host.js';
import { POMODORO_HTML } from './page.js';

/**
 * pomodoro（番茄钟）：专注/休息循环，独立弹窗 + 托盘入口。
 * 说明文档：docs/plugins/pomodoro.html
 */
let host = createPomodoroHost();

const api: PomodoroService = {
  snapshot: () => host.snapshot(),
  start: () => host.start(),
  pause: () => host.pause(),
  resume: () => host.resume(),
  reset: () => host.reset(),
  skip: () => host.skip(),
  configure: (patch) => host.configure(patch),
};

const pomodoroPlugin: Plugin = {
  manifest: {
    id: 'pomodoro',
    version: '0.1.0',
    name: '番茄钟',
    description: '专注与休息计时；托盘与弹窗控制，状态经 pomodoro 服务暴露。',
    provides: [POMODORO_SERVICE],
    config: {
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakEvery: 4,
    },
    tier: 'standard',
  },
  api,
  ui: {
    title: '番茄钟',
    width: 380,
    height: 480,
    rpc: {
      pomodoro: ['snapshot', 'start', 'pause', 'resume', 'reset', 'skip', 'configure'],
    },
    content: POMODORO_HTML,
  },
  register(ctx) {
    host = createPomodoroHost({
      focusMinutes: Number(ctx.config.focusMinutes ?? 25),
      shortBreakMinutes: Number(ctx.config.shortBreakMinutes ?? 5),
      longBreakMinutes: Number(ctx.config.longBreakMinutes ?? 15),
      longBreakEvery: Number(ctx.config.longBreakEvery ?? 4),
    });
    const timer = setInterval(() => host.tick(1000), 1000);
    ctx.effect(() => () => clearInterval(timer));
    ctx.logger?.info?.('pomodoro 就绪');
  },
};

export default pomodoroPlugin;
