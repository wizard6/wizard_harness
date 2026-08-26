# 05 — 番茄钟 vs 现有 timer 插件

## 结论

**番茄钟应新建 `pomodoro` 插件**，不要扩展 `plugins/timer`。

## 对比

| 维度 | `timer` | `pomodoro`（目标） |
| --- | --- | --- |
| 用途 | 通用调度：cron、interval、flow、chain、trace | 专注/休息状态机，面向人 |
| 状态模型 | Job / Flow / Run 多实体 | `idle → focus → break → …` 单会话 |
| UI | 900×640 监控面板 | ~380×480 计时器 + 大按钮 |
| Agent 工具 | 可编排定时任务 | 可选后续加 tools，首版以 UI 为主 |
| 托盘 | 无 | 有快捷入口 |
| 复杂度 | 高（工作流式定时） | 低（一个 setInterval + effect 清理） |

## timer 仍负责什么

- 后台 cron、间隔任务、多步 flow
- 与 workflow / agent-loop 集成的「到点执行」

## pomodoro 负责什么

- 25/5/15 类番茄周期（可配置）
- 开始 / 暂停 / 继续 / 跳过 / 重置
- 弹窗展示剩余时间与阶段
- 托盘一键打开

## 命名

- 服务名：`pomodoro`（`POMODORO_SERVICE`）
- 插件 id：`pomodoro`
- 避免 `timer.pomodoro` 或复用 `timer` 服务名，以免与现有 `TimerService` 类型混淆。
