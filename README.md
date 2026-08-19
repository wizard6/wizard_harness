# wizard-harness

类 deepseek-harness 的 Agent 基座骨架：**一切皆插件、一切可观测**。当前已落地插件契约与生命周期、Cordis 风格服务注入（inject/provides 拓扑装配 + 级联卸载）、事件总线与五种分发模式、插件发现，以及 CLI / TUI 观测壳 + GUI / API 两个运行时壳。

## 环境

- Node.js `>= 22`
- pnpm `10.32.1`（见 `packageManager`）

```bash
pnpm install
pnpm build
pnpm test
```

## 启动

| 命令 | 作用 |
| --- | --- |
| `pnpm gui:start` | Electron 运行时台（桌面窗口：装配插件 + 弹窗交互） |
| `pnpm obs:cli` | 纯 Node 事件回放 / 查询 / tail |
| `pnpm obs:tui` | ink 实时事件面板 |
| `pnpm obs:api` | HTTP API（运行时壳：加载插件 + 观测端点 + 白名单 RPC），默认 `http://localhost:8787` |
| `pnpm gen:events` | 向 `docs/logs/events.jsonl` 写入演示事件 |
| `pnpm typecheck` | 各包 `tsc --noEmit`（obs/plugins 占位包除外） |

CLI / TUI 读取 `docs/logs/events.jsonl`。文件不存在时请先 `pnpm gen:events`。API 是运行时壳：启动时经 `assembleRuntime` 装配 `plugins/` 下插件（与 GUI 同链路），事件同步落盘同一份 jsonl。

### obs:api 端点

| 端点 | 说明 |
| --- | --- |
| `GET /events` | 事件查询（actor/action/target/keyword/limit 过滤） |
| `GET /events/stream` | SSE 事件流 |
| `GET /state` | 事件统计 + 运行时装配状态（loaded/services） |
| `GET /plugins` | 已加载插件（manifest/services/config） |
| `GET /services` | 服务绑定列表（provider/scope/access） |
| `POST /rpc` | 白名单服务调用：`{ service, method, args }`，未白名单一律 403 |

环境变量：`WH_PLUGINS_DIR`（插件目录）、`WH_DISABLED`（禁用插件，逗号分隔）、`WH_ENABLE_EXPERIMENTAL`、`WH_EXPOSE`（RPC 白名单 JSON，如 `{"greeter":["greet"]}`，默认不暴露任何调用）、`WH_EVENTS`、`PORT`。

Windows + Node 26 下，Electron 官方 `install.js` 可能解压失败。`pnpm gui:start` 会先跑 `scripts/ensure-electron.cjs`：缺二进制时补装，必要时用缓存 zip 解压。

## 目录

```
core/                 注册器、事件总线、分发器、插件发现、运行时装配、JSONL 读写
obs/spec/             观测契约（ObsSpec）
obs/core/             注册表观测定义 + React 面板
obs/cli|tui/          观测器壳（读 events.jsonl）
obs/api|gui/          运行时壳（加载插件：HTTP 白名单 RPC / Electron 交互台）
obs/plugins/          各插件观测台占位
plugins/              业务插件包（hello / logger / events / console）
docs/confirmed/       人类确认意图
docs/项目体检.md      源码核对清单（2026-08-19）
```

依赖方向：core 不依赖插件；插件依赖 core 契约。

## 现状

基座核心机制闭环：插件契约与生命周期、服务 DI（inject/provides + 级联卸载）、事件总线与五种分发模式、插件发现、运行时壳装配（GUI/API 共用 `assembleRuntime`）。测试 73/73 通过。

已知遗留：`Dispatcher` 待接入插件上下文（等首个协作型用例）；GUI 弹窗 IPC 为硬编码（通用 UI 桥待单独设计）。完整条目见 [docs/项目体检.md](docs/项目体检.md)。

## 许可

私有仓库，未声明开源许可证。
