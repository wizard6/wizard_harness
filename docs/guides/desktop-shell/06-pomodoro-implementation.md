# 06 — 番茄钟实现清单

## 目标

独立窗口 + 托盘「Open Pomodoro」入口；专注/短休/长休循环；卸载无泄漏。

## 文件清单

| 路径 | 说明 |
| --- | --- |
| `contracts/src/pomodoro.ts` | 类型 + `POMODORO_SERVICE` |
| `contracts/src/index.ts` | 导出 |
| `plugins/pomodoro/src/host.ts` | 状态机 + tick |
| `plugins/pomodoro/src/page.ts` | `POMODORO_HTML` |
| `plugins/pomodoro/src/index.ts` | Plugin 定义 |
| `plugins/pomodoro/test/pomodoro.spec.ts` | 单元测试 |
| `bundles/app/wizard.patch.json` | 注册 `pomodoro` |
| `obs/gui/electron/tray-menu.html` | 菜单项 |
| `obs/gui/electron/main.cjs` | `handleTrayMenuAction` |
| `docs/plugins/pomodoro.html` | 插件说明 |

## 服务 API

```ts
POMODORO_SERVICE = 'pomodoro'

type PomodoroPhase = 'idle' | 'focus' | 'shortBreak' | 'longBreak'

interface PomodoroConfig {
  focusMinutes: number      // 默认 25
  shortBreakMinutes: number // 默认 5
  longBreakMinutes: number  // 默认 15
  longBreakEvery: number    // 默认 4（每 4 个番茄长休）
}

interface PomodoroState {
  phase: PomodoroPhase
  remainingMs: number
  completedFocus: number
  running: boolean
  paused: boolean
  config: PomodoroConfig
}

// 方法：snapshot, start, pause, resume, reset, skip, configure(patch)
```

## 状态机

```
idle --start--> focus --到期--> shortBreak --到期--> focus
                      \--每 N 个番茄--> longBreak --到期--> focus
任意阶段：pause / resume / reset / skip（skip 等同手动下一阶段）
```

## 生命周期

- `register`：`setInterval(1000)` 驱动 `host.tick()`；`ctx.effect(() => () => clearInterval(...))` 卸载时清理

## ui.rpc 白名单

`pomodoro`: 全部七个方法。

## 验收

- [ ] 观测台可见 `pomodoro`，可打开窗口
- [ ] 托盘「Open Pomodoro」打开同一窗口
- [ ] 开始倒计时，暂停/继续正确
- [ ] 专注结束自动进入休息
- [ ] 跳过阶段正确
- [ ] 卸载插件后无 interval 泄漏（可写 vitest + fake timers）
- [ ] `pnpm --filter @wizard-harness/plugin-pomodoro test` 通过
