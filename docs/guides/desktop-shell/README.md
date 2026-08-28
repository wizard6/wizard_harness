# 桌面壳开发指南（索引）

> **用途**：写「独立弹窗 + 托盘入口」类插件时，先读本目录，不必从 `obs/gui/electron/main.cjs` 反推机制。  
> **适用**：番茄钟、观测台快捷入口、带 UI 的工具套件等。

## 文档地图

| # | 文档 | 固定知识点 |
| --- | --- | --- |
| 1 | [插件弹窗](./01-plugin-popup-window.md) | `openPluginWindow`、`plugin.ui`、preload、单例窗口 |
| 2 | [托盘菜单](./02-tray-menu.md) | `tray-menu.html`、`handleTrayMenuAction`、如何加一项 |
| 3 | [弹窗 RPC](./03-plugin-ui-rpc.md) | `ui.rpc` 白名单、`window.wh.call`、`wh:plugin-call` |
| 4 | [Bundle 注册](./04-bundle-registration.md) | `wizard.patch.json`、扫描与 `provides` |
| 5 | [与 timer 插件区别](./05-vs-existing-timer.md) | 为何番茄钟不复用 `timer` |
| 6 | [番茄钟实现清单](./06-pomodoro-implementation.md) | 文件清单、API、验收步骤 |

## 相关链接

- 插件生命周期与 `ctx.effect`：[../插件开发约定.md](../插件开发约定.md)
- Cordis 服务模型：[../cordis-服务与事件.md](../cordis-服务与事件.md)
- 番茄钟插件说明（能力面）：[../../plugins/pomodoro.html](../../plugins/pomodoro.html)
- 叠加绘图对照：[../../meta-doc/reference-projects/sao-utils/understanding.html](../../meta-doc/reference-projects/sao-utils/understanding.html)（SAO Utils / NERvSDK；不搬 D3D 引擎）

## 维护约定

1. **改 Electron 壳行为**（新 IPC、托盘机制、弹窗策略）→ 同步更新本目录对应小节。
2. **只改某个插件 UI/API** → 更新 `docs/plugins/<id>.html`，不必动本目录除非机制变了。
3. 本目录描述的是 **2026-08 基线**；若 `main.cjs` 出现「通用 UI 桥」，以新机制为准并在此注明。
