# wizard-harness

类 deepseek-harness 的 Agent 基座骨架：**一切皆插件、一切可观测**。当前已落地插件契约与生命周期、Cordis 风格服务注入（inject/provides 拓扑装配 + 级联卸载）、事件总线与五种分发模式、插件发现、**Bundle / Profile 组合装配**，以及 CLI / TUI 观测壳 + GUI / API 两个运行时壳。

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
| `pnpm gui:start` | Electron 运行时台（桌面窗口：观测台含注册表/质量检测两个面板 + 插件弹窗交互） |
| `pnpm obs:cli` | 纯 Node 事件回放 / 查询 / tail |
| `pnpm obs:tui` | ink 实时事件面板 |
| `pnpm obs:api` | HTTP API（运行时壳：加载插件 + 观测端点 + 白名单 RPC），默认 `http://localhost:8787` |
| `pnpm gen:events` | 向 `docs/logs/events.jsonl` 写入演示事件 |
| `pnpm typecheck` | 各包 `tsc --noEmit`（obs/plugins 占位包除外） |

CLI / TUI 读取 `docs/logs/events.jsonl`。文件不存在时请先 `pnpm gen:events`。API 是运行时壳：启动时经 `assembleRuntime` 装配（与 GUI 同链路），默认叠 `profiles/default` → `bundles/base`；事件同步落盘同一份 jsonl。

### Bundle / Profile

对齐 Cordis：Bundle 是可分发 patch 层，Profile 是有序堆叠这些层的可运行组合。空树按序叠加：各 bundle 的 `wizard.patch.json` → profile 层 patch → `$WH_HOME/wizard.patch.json`。按 id 改行时 config **整份替换**（不深合并）。`WH_PROFILE=off` 退回扫描 `plugins/` 全部插件。

### obs:api 端点

| 端点 | 说明 |
| --- | --- |
| `GET /events` | 事件查询（actor/action/target/keyword/limit 过滤） |
| `GET /events/stream` | SSE 事件流 |
| `GET /state` | 事件统计 + 运行时装配状态（loaded/services/composition） |
| `GET /plugins` | 已加载插件（manifest/services/config） |
| `GET` / `POST /plugins/scan` | 再扫描 `plugins/`，把尚未注册的可加载插件装进当前运行时 |
| `GET /services` | 服务绑定列表（provider/access/lifetime/scoped） |
| `POST /rpc` | 白名单服务调用：`{ service, method, args }`，未白名单一律 403 |

环境变量：`WH_PLUGINS_DIR`（插件目录）、`WH_DISABLED`（禁用插件，逗号分隔）、`WH_ENABLE_EXPERIMENTAL`、`WH_PROFILE`（profile 名或路径，默认 `profiles/default`；`off` 关闭组合、退回目录发现）、`WH_HOME`（机级 home，默认 `~/.wizard-harness`）、`WH_EXPOSE`（RPC 白名单 JSON，如 `{"greeter":["greet"]}`，默认不暴露任何调用）、`WH_EVENTS`、`PORT`。

Windows + Node 26 下，Electron 官方 `install.js` 可能解压失败。`pnpm gui:start` 会先跑 `scripts/ensure-electron.cjs`：缺二进制时补装，必要时用缓存 zip 解压。

## 目录

```
core/                 注册器、事件总线、分发器、插件发现、Profile/Bundle 组合、运行时装配、JSONL 读写
contracts/            服务契约层（服务名 ↔ 接口绑定：LoggerService / EventsService / ConsoleService，独立于任何插件）
bundles/              可分发 patch 层（base 挂入现有四个插件）
profiles/             可运行组合（default 叠 base；可选 wizard.patch.json 本地覆盖）
obs/spec/             观测契约（ObsSpec）
obs/core/             注册表观测定义 + React 面板
obs/cli|tui/          观测器壳（读 events.jsonl）
obs/api|gui/          运行时壳（加载插件：HTTP 白名单 RPC / Electron 交互台）
obs/plugins/          各插件观测台占位
plugins/              业务插件包（hello / logger / events / console / session / llm / tools）
docs/confirmed/       人类确认意图
docs/plugins/         插件说明（HTML，给人与后续 AI）
docs/项目体检.md      源码核对清单（2026-08-19）
docs/cordis-服务与事件.md   cordis 通信模型问答整理（服务=直接调用 / 事件=广播 + 本仓库差异要点）
docs/architecture-canvas.html  架构大画布（交互式白板，浏览器直接打开）
```

依赖方向：core 不依赖插件；插件依赖 core 契约。

## 现状

基座核心机制闭环：插件契约与生命周期、服务 DI（inject/provides + 级联卸载）、事件总线与五种分发模式、插件发现、Bundle/Profile 组合装配（GUI/API 共用 `assembleRuntime`）。测试见 `pnpm test`。

已知遗留：`Dispatcher` 待接入插件上下文（等首个协作型用例）；GUI 弹窗 IPC 为硬编码（通用 UI 桥待单独设计）。完整条目见 [docs/项目体检.md](docs/项目体检.md)。

## 计划

骨架插件（hello / logger / events / console）已够演示基座。下一阶段按能力插件顺序补齐，先做薄、不顺带做 agent 循环或通用 UI 桥：

1. **session（已落地薄切片）** — 会话日志（领域源：追加 turn / message / tool-result，只读回放；观测 `session/start`、`session/append`）。scope 管「这次运行看得见什么」，session 管「发生过什么」。说明：[docs/plugins/session.html](docs/plugins/session.html)
2. **llm（已落地薄切片）** — 一个模型适配器，读写都落到 session。默认 mock；`provider=openai` 且配置 baseUrl 才走兼容 HTTP。说明：[docs/plugins/llm.html](docs/plugins/llm.html)
3. **tools（已落地薄切片）** — 工具注册表（登记 / 调用）；调用写入 session。内置 echo。说明：[docs/plugins/tools.html](docs/plugins/tools.html)
4. **agent** — 用 `createScope` 串起 session + llm + tools 的最小循环（每个 live agent 一个 scope）。

## 许可

私有仓库，未声明开源许可证。
