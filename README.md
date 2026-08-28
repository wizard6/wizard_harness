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
| `pnpm gui:start` | Electron 运行时台（启动只挂托盘，不弹窗；观测台 / 插件窗从托盘按需打开） |
| `pnpm obs:cli` | 纯 Node 事件回放 / 查询 / tail |
| `pnpm obs:tui` | ink 实时事件面板 |
| `pnpm obs:api` | HTTP API（运行时壳：加载插件 + 观测端点 + 白名单 RPC），默认 `http://localhost:8787` |
| `pnpm web-dev` | **无 Electron**：个人工作台（`/`）+ 发布流水线 + `/site/` 静态站 |
| `pnpm gen:events` | 向 `docs/logs/events.jsonl` 写入演示事件 |
| `pnpm typecheck` | 各包 `tsc --noEmit`（obs/plugins 占位包除外） |

CLI / TUI 读取 `docs/logs/events.jsonl`。文件不存在时请先 `pnpm gen:events`。API 是运行时壳：启动时经 `assembleRuntime` 装配（与 GUI 同链路），默认叠 `profiles/default` → `bundles/base`（能力）+ `bundles/app`（产品面 app-ui）；**Web 开发路径**叠 `profiles/web-dev` → `base` + `bundles/web-dev`（workflow + web-pipeline + workspace），用浏览器工作台不用 Electron。事件同步落盘同一份 jsonl。

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
| `GET /` 等 | 若设 `WH_STATIC_DIR`：壳级静态控制台（`pnpm web-dev` 默认挂上） |
| `GET /site/` | 若设 `WH_SITE_DIR`：已部署 Web 站点 |

环境变量：`WH_PLUGINS_DIR`（插件目录）、`WH_DISABLED`（禁用插件，逗号分隔）、`WH_ENABLE_EXPERIMENTAL`、`WH_PROFILE`（profile 名或路径，默认 `profiles/default`；`off` 关闭组合、退回目录发现）、`WH_HOME`（机级 home，默认 `~/.wizard-harness`）、`WH_STATIC_DIR` / `WH_SITE_DIR`（obs-api 壳级静态根：控制台与已部署站 `/site/`）、`WH_NITRON`（`1` 时 web-pipeline 真正执行 `npx nitron build`）、`WH_EXPOSE`（RPC 白名单 JSON。未设置时默认暴露 agent 试跑：`agent.list|stop`、`promptContext.assemble|apply|setPersona|getPersona|inspect`、`agentLoop.run|cancel`；`off` 关闭全部）、`WH_LLM_PROVIDER` / `WH_LLM_BASE_URL` / `WH_LLM_API_KEY` / `WH_LLM_MODEL`（覆盖 llm 配置）、`WH_SESSIONS_DIR`（session 落盘目录，GUI/API 默认 `~/.wizard-harness/sessions`）、`WH_SANDBOX_DIR`（玩具沙箱 root，默认 `$WH_HOME/sandbox`）、`WH_WORKSPACE`（dev-tools 工作区 root，默认进程 cwd）、`WH_BRAVE_API_KEY` / `WH_SEARX_URL`（web-tools 搜索引擎；默认 DuckDuckGo）、`WH_KREA_API_KEY`（krea 绘图；到 [krea.ai/settings/api-tokens](https://www.krea.ai/settings/api-tokens) 创建）、`WH_EVENTS`、`PORT`。

Windows + Node 26 下，Electron 官方 `install.js` 可能解压失败。`pnpm gui:start` 会先跑 `scripts/ensure-electron.cjs`：缺二进制时补装，必要时用缓存 zip 解压。

## 目录

```
core/                 注册器、事件总线、分发器、插件发现、Profile/Bundle 组合、运行时装配、JSONL 读写
contracts/            服务契约层（服务名 ↔ 接口绑定：LoggerService / EventsService / ConsoleService，独立于任何插件）
bundles/              可分发 patch 层（base = 能力插件含 trajectory；app = app-chat + app-ui；web-dev = workflow + web-pipeline）
profiles/             可运行组合（default 叠 base + app；web-dev 叠 base + web-dev，无 Electron）
obs/spec/             观测契约（ObsSpec）
obs/core/             注册表观测定义 + React 面板
obs/cli|tui/          观测器壳（读 events.jsonl）
obs/api|gui/          运行时壳（加载插件：HTTP 白名单 RPC / Electron 交互台）
obs/plugins/          各插件观测台占位
plugins/              业务插件包（hello / logger / events / console / session / prompt-context / persona / llm / tools / agent / agent-loop（默认禁用） / query-loop / trajectory / sandbox / dev-tools / web-tools / krea / file-manager / code-browser / code-editor / workflow / workflow-nodes / app-workflow / app-chat / app-ui / web-pipeline / workspace）
docs/README.md          文档索引（从这里进）
docs/guides/            开发指南、架构画布、排错
docs/reference/         项目体检、hash 查看器
docs/planning/          路线图与待办
docs/design/            设计评审与底座诊断档案
docs/confirmed/         人类确认意图
docs/plugins/           插件说明（HTML，给人与后续 AI）
docs/reports/           pnpm quality 产出
docs/logs/              运行时事件/日志（路径固定，非文档）
meta-doc/               外部参考项目：理解 + 拆分（html + md，不进运行时）
```

依赖方向：core 不依赖插件；插件依赖 core 契约。

## 现状

基座核心机制闭环：插件契约与生命周期、服务 DI（inject/provides + 级联卸载）、事件总线与五种分发模式、插件发现、Bundle/Profile 组合装配（GUI/API 共用 `assembleRuntime`）。测试见 `pnpm test`。

已知遗留：`Dispatcher` 待接入插件上下文（等首个协作型用例）；GUI 弹窗 IPC 为硬编码（通用 UI 桥待单独设计）。完整条目见 [docs/reference/项目体检.md](docs/reference/项目体检.md)。文档导航见 [docs/README.md](docs/README.md)。桌面壳（弹窗 / 托盘 / RPC）见 [docs/guides/desktop-shell/README.md](docs/guides/desktop-shell/README.md)。

## 计划

骨架插件（hello / logger / events / console）已够演示基座。能力插件按顺序补齐；通用 UI 桥仍不做：

1. **session（已落地薄切片）** — 会话日志（领域源：追加 turn / message / tool-result，只读回放；观测 `session/start`、`session/append`）。scope 管「这次运行看得见什么」，session 管「发生过什么」。说明：[docs/plugins/session.html](docs/plugins/session.html)
2. **llm（已落地薄切片）** — 一个模型适配器，读写都落到 session。默认 mock；`provider=openai` 且配置 baseUrl 才走兼容 HTTP。说明：[docs/plugins/llm.html](docs/plugins/llm.html)
3. **tools（已落地薄切片）** — 工具注册表（登记 / 调用）；调用写入 session。内置 echo。说明：[docs/plugins/tools.html](docs/plugins/tools.html)
4. **agent（已落地薄切片）** — live agent：每个实例一个 `createScope`，绑定一条 session。不管模型/工具循环，不管上下文组装。说明：[docs/plugins/agent.html](docs/plugins/agent.html)
5. **prompt-context（已落地薄切片）** — 组装 sections / contexts / tools / variables；`assemble` + `apply` 写入 session。弹窗可看素材与成品。说明：[docs/plugins/prompt-context.html](docs/plugins/prompt-context.html)
6. **persona（已落地薄切片）** — 硅灵：soul.md 式身份基线（多份可切换，≤3000 字），不管理记忆。经 prompt-context 的 `persona:core` 出门。说明：[docs/plugins/persona.html](docs/plugins/persona.html)
7. **query-loop（现行）** — assemble → model → tools，直到没有 tool_use；`queryLoop.use` 挂 hook。仍提供 `agentLoop`。旧 OTA `agent-loop` 保留但在 bundles/base 禁用。说明：[docs/plugins/query-loop.html](docs/plugins/query-loop.html)
8. **trajectory（已落地薄切片）** — 执行轨迹：拼提示词、HTTP、工具进出、complete。不替代 session。说明：[docs/plugins/trajectory.html](docs/plugins/trajectory.html)
9. **sandbox（已落地薄切片）** — 玩具工作区路径沙箱：读写不出 root；向 tools 登记 `sandbox_ls` / `sandbox_read` / `sandbox_write`。App demo 顶栏显示 root。说明：[docs/plugins/sandbox.html](docs/plugins/sandbox.html)
10. **dev-tools（已落地薄切片）** — 本地编程工具套件：对着真实工作区登记 `bash` / `read_file` / `write_file` / `str_replace` / `grep` / `glob`。工具注册表弹窗 `list` 可见全部已登记工具。说明：[docs/plugins/dev-tools.html](docs/plugins/dev-tools.html)
11. **web-tools（已落地薄切片）** — 网页搜索与阅读：`web_search` → `web_outline` → `web_read`（markdown 留结构 / text 去掉；可按 heading / offset 取一截）。说明：[docs/plugins/web-tools.html](docs/plugins/web-tools.html)
12. **file-manager + code-browser + code-editor（已落地薄切片）** — 工作区文件树（`file-manager` 弹窗浏览 `WH_WORKSPACE_ROOT`，点文件开 `code-browser` 只读窗口；窗口内可切 `code-editor` 编辑）。说明：[docs/plugins/file-manager.html](docs/plugins/file-manager.html)、[docs/plugins/code-browser.html](docs/plugins/code-browser.html)、[docs/plugins/code-editor.html](docs/plugins/code-editor.html)
13. **workflow + workflow-nodes + app-workflow（已落地薄切片）** — 调度器按图走节点，并提供 `exec` / `listNodes` / 节点 ctx 上的可选 agentLoop（节点当工具、节点选 agent 的原语；封装未做）。`workflow-nodes` 登记 echo / upper；`app-workflow` 是独立 Demo 窗口。说明：[docs/plugins/workflow.html](docs/plugins/workflow.html)
14. **primitive（已落地薄切片）** — 思考提示词原子仓库：标签分类、只读弹窗。不注入 prompt-context（区别于 skills）。说明：[docs/plugins/primitive.html](docs/plugins/primitive.html)
15. **app-chat + app-ui（已落地薄切片）** — 产品面拆两插件：`app-chat` 适配 `agentLoop`（无窗口，不传默认人设）；`app-ui` 是聊天薄壳，`ui.rpc` 调 `appChat.send` / `listSessions` / `resumeSession`，左栏历史会话、右栏只读 `trajectory.latest`，顶栏只读 `sandbox.info` 与会话工作区。工作流不进这个窗口。观测台只 `openPlugin('app-ui')`。说明：[docs/plugins/app-chat.html](docs/plugins/app-chat.html)、[docs/plugins/app-ui.html](docs/plugins/app-ui.html)
16. **krea（已落地薄切片）** — Krea 文生图：Agent 调 `krea_generate` / `krea_job` / `krea_models`。Key 用 `WH_KREA_API_KEY`（稍后配置即可）。说明：[docs/plugins/krea.html](docs/plugins/krea.html)
17. **web-pipeline（已落地薄切片）** — Web 优先开发流水线：`web.validate` → `web.deploy`（主产物静态站）→ `nitron.package`（默认 dry-run）。说明：[docs/plugins/web-pipeline.html](docs/plugins/web-pipeline.html) · 架构：[docs/design/web-dev-architecture.md](docs/design/web-dev-architecture.md)
18. **workspace（已落地薄切片）** — 个人工作台 Demo：浏览器壳、瓷砖概览、插件架；托盘「Open Workspace」打开弹窗。说明：[docs/plugins/workspace.html](docs/plugins/workspace.html)

## 许可

私有仓库，未声明开源许可证。
