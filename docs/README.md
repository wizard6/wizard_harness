# wizard-harness 文档索引

仓库文档按用途分层，避免 `docs/` 根目录堆满零散文件。

```
docs/
├── README.md           ← 本页（导航）
├── guides/             开发指南、架构图、排错
├── reference/          体检、工具页（核对现状用；外部参考项目已迁到仓库根 meta-doc/）
├── planning/           路线图与待办
├── design/             设计评审、底座诊断（历史/决策）
├── confirmed/          人类确认意图契约
├── plugins/            各插件说明（HTML）
├── reports/            质检脚本产出（pnpm quality）
└── logs/               运行时事件/日志（非文档，路径固定）
```

## 快速入口

| 我想… | 去看 |
| --- | --- |
| 写/改插件 | [guides/插件开发约定.md](./guides/插件开发约定.md) |
| 弹窗 / 托盘 / 桌面壳 | [guides/desktop-shell/README.md](./guides/desktop-shell/README.md) |
| 做番茄钟类插件 | [guides/desktop-shell/06-pomodoro-implementation.md](./guides/desktop-shell/06-pomodoro-implementation.md) |
| 理解服务与事件模型 | [guides/cordis-服务与事件.md](./guides/cordis-服务与事件.md) |
| 看全局架构（可交互） | [guides/architecture-canvas.html](./guides/architecture-canvas.html) |
| App 不回话怎么查 | [guides/troubleshooting.html](./guides/troubleshooting.html) |
| 核对仓库现状与测试数 | [reference/项目体检.md](./reference/项目体检.md) |
| 下一步做什么 | [planning/product-maturity.html](./planning/product-maturity.html) · [planning/todo.md](./planning/todo.md) |
| 某个插件怎么用 | [plugins/](./plugins/) |
| Web 开发（无 Electron） | [design/web-dev-architecture.md](./design/web-dev-architecture.md) · [plugins/workspace.html](./plugins/workspace.html) |
| 外部参考项目 | [meta-doc/reference-projects/](../meta-doc/reference-projects/) |
| 已确认的设计边界 | [confirmed/](./confirmed/) |

## 目录说明

### `guides/` — 指南

面向日常开发与运维，内容应随代码更新。

- **插件开发约定** — 生命周期、effect、inject、文档同步纪律
- **cordis-服务与事件** — 服务直接调用 vs 事件广播，与本仓库差异
- **architecture-canvas.html** — 架构大画布（浏览器打开，可缩放拖拽）
- **troubleshooting.html** — 「不回话怎么查」排错短链
- **desktop-shell/** — 插件弹窗、托盘菜单、ui.rpc、bundle 注册（固定机制，勿从 main.cjs 反推）

### `reference/` — 参考

与当前代码对齐的核对清单与辅助工具页。外部参考项目的理解/拆分在仓库根 [meta-doc/reference-projects/](../meta-doc/reference-projects/)（html + md 成对）。

- **项目体检.md** — 包数、测试、架构快照、遗留项
- **hash-viewer.html** — `pnpm hash:check` 生成的 hash 查看器
- **[projects.md](./reference/projects.md)** — 旧入口（跳转到 meta-doc）
- **[ombre-brain.md](./reference/ombre-brain.md)** — 旧入口（跳转到 Ombre-Brain 理解/拆分）
- **[sao-utils.md](./reference/sao-utils.md)** — 旧入口（跳转到 SAO Utils 理解/拆分；对照桌面 HUD 绘图）

### `planning/` — 规划

路线图与任务登记，已完成项保留作历史。

- **todo.md** — Agent 能力待办（分阶段）
- **product-maturity.html** — 产品成熟度与优先级体感排序

### `design/` — 设计档案

评审记录、缺口分析、方案草稿；不一定与最新代码逐行同步。

- **设计评审.md** — 注册器 / boot / GUI 等问题清单
- **插件底座缺口清单.md**
- **插件底座完善-诊断与方案.md**
- **[启发式思考框架.md](./design/启发式思考框架.md)** / **[可视化](./design/启发式思考框架.html)** — 积累经验、怎么想；Primitive 仓库已落地，其余未实现
- **[web-dev-architecture.md](./design/web-dev-architecture.md)** / **[可视化](./design/web-dev-architecture.html)** — Web 优先开发路径：API + 浏览器 + Nitron demo，不用 Electron

### `confirmed/` — 确认稿

人类确认过的意图契约（≤300 字级），改行为前应先对齐。

### `plugins/` — 插件说明

每个能力插件一篇 HTML，与 `plugins/<id>/src` 注释中的「说明文档」路径一致。

### `reports/` — 生成报告

由 `pnpm quality` 写入，勿手改：

- `quality-report.html` — 给人
- `quality-report-ai.md` — 给 AI

### `logs/` — 运行时数据

**不是文档**，但路径被壳与 logger 硬编码，请勿移动：

- `logs/events.jsonl` — 事件账本（CLI/TUI/GUI/API 共用）
- `logs/app.log` — logger 插件默认落盘

## 维护约定

1. 改插件行为 → 同步 `docs/plugins/<id>.html`
2. 改基座机制 → 更新 `guides/插件开发约定.md` 或 `reference/项目体检.md`
3. 新文档放对应子目录，**不要**再堆到 `docs/` 根目录
4. 外部参考项目写进 `meta-doc/reference-projects/<english-name>/`（理解 + 拆分，html + md）
5. 根 [README.md](../README.md) 只保留简短索引，详情链到本页
