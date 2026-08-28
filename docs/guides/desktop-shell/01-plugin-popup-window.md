# 01 — 插件弹窗（Plugin Popup Window）

## 一句话

GUI 壳通过 `openPluginWindow(pluginId)` 为已加载、且声明了 `ui` 的插件打开 **独立 BrowserWindow**，HTML 来自 `plugin.ui.content`（data URL 加载）。

## 入口

| 谁调用 | 场景 |
| --- | --- |
| 观测台 `openPlugin(id)` | 插件列表点「打开窗口」 |
| 托盘 `handleTrayMenuAction` | 硬编码 action → `openPluginWindow('app-ui')` 等 |
| IPC / 未来通用桥 | 尚未统一，目前托盘与观测台是两条路 |

实现位置：`obs/gui/electron/main.cjs` → `openPluginWindow(id)`。

## 前置条件

插件必须在 harness registry 中，且：

```ts
ui: {
  title: '窗口标题',
  width: 380,      // 可选，默认 360
  height: 480,     // 可选，默认 240（壳会 +38 给标题栏）
  hud: true,       // 可选。透桌面叠加：覆盖工作区、面板外点击穿透。观测台不要开
  content: '<!doctype html>...',  // 完整 HTML 字符串
  rpc: { ... },    // 见 03-plugin-ui-rpc.md
}
```

## 行为（固定）

1. **单例**：同一 `pluginId` 已开则 `focus()`，不重复创建。
2. **preload**：
   - `manifest.trusted === true` → `preload-console.cjs`（含 `execCommand`）
   - 否则 → `preload-safe.cjs`（仅 `wh.call` 等低风险 API）
3. **窗口映射**：`popupPluginId.set(popup, id)`，供 RPC 校验「调用来自哪个插件弹窗」。
4. **关闭**：`closed` 时从 `pluginWindows` 删除。
5. **`ui.hud`**：不注入实心标题栏；窗口铺满当前显示器工作区、透明底、`alwaysOnTop`；面板外 `setIgnoreMouseEvents({ forward: true })` 点穿到桌面。拖动是搬面板（顶栏 / 侧栏标题 / 页眉），不要用 `-webkit-app-region`（和点击穿透打架）。Esc / 面板「关闭」关窗。

## 插件作者怎么做

1. 在 `page.ts`（或同类文件）导出 `POMODORO_HTML` 等 **自包含 HTML**（内联 CSS/JS，不依赖外部打包）。
2. 在 `index.ts` 的 `ui.content` 引用该字符串。
3. 弹窗内用 `window.wh.call(service, method, args)` 调后端（须在 `ui.rpc` 声明，见下一篇）。

## 不要假设

- 弹窗 **没有** Node 集成（`nodeIntegration: false`）。
- 弹窗 **不能** 直接 `require` 插件服务；必须走 RPC。
- 观测台主窗口与插件弹窗是 **不同** BrowserWindow。

## 参考插件

- `app-ui` — 聊天产品面
- `git-tools` — 工具套件弹窗 + `ui.rpc`
- `pomodoro` — 番茄钟（托盘 + 弹窗）
- `workspace` — 个人工作台（托盘 Open Workspace）。外观真源是 `plugins/workspace/web/`，`page.ts` 装配成自包含 HTML。`ui.hud: true` 走透桌面叠加，不要再复制一份 HTML。
