# 02 — 托盘菜单（Tray Menu）

## 一句话

系统托盘右键弹出 **独立小窗** `tray-menu.html`；点击项通过 `data-act` → IPC → `handleTrayMenuAction(action)`，其中部分 action 会 `openPluginWindow(...)`。

## 文件

| 文件 | 职责 |
| --- | --- |
| `obs/gui/electron/tray-menu.html` | 菜单 UI（按钮 + `data-act`） |
| `obs/gui/electron/main.cjs` | `setupTray`、`showTrayMenu`、`handleTrayMenuAction` |

## 当前 action 表（基线）

| `data-act` | 行为 |
| --- | --- |
| `registry` | 打开观测台 |
| `agent` | `openPluginWindow('app-ui')` |
| `workflow` | `openPluginWindow('app-workflow')` |
| `quality` | 打开质检窗口 |
| `restart` | 重启应用 |
| `quit` | 退出 |

托盘 **左键单击**（Windows）→ 观测台，与右键菜单无关。

## 新增一项（例如番茄钟）

### 1. `tray-menu.html`

在合适位置增加按钮（建议在 `quality` 与分隔线之间）：

```html
<button type="button" class="item" data-act="pomodoro">
  <!-- svg 图标 -->
  <span class="lbl">Open Pomodoro</span>
</button>
```

### 2. `main.cjs` → `handleTrayMenuAction`

```js
else if (action === 'pomodoro') openPluginWindow('pomodoro');
```

### 3. 插件侧

- `manifest.id` 必须为 `pomodoro`（与 `openPluginWindow` 参数一致）。
- 插件须在 default bundle 中加载（见 04-bundle-registration.md）。

## 限制（当前架构）

- 托盘项 **硬编码**，不能由插件动态注册（见根 README「GUI 弹窗 IPC 为硬编码」）。
- 每增加一个托盘入口，需改 **HTML + main.cjs** 两处。
- 托盘菜单高度在 `tray-menu-ready` IPC 中按内容自适应。

## 未来方向（未实现）

通用「插件声明 `trayMenu: { label, order }`」由壳合并渲染——**不要**在插件里假设已存在。
