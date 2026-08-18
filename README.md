# wizard-harness

类 deepseek-harness 的 Agent 基座骨架：**一切皆插件、一切可观测**。当前切片已落地注册器、最小事件总线，以及 CLI / TUI / API / GUI 四端观测壳。

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
| `pnpm gui:start` | Electron 观测台（桌面窗口） |
| `pnpm obs:cli` | 纯 Node 事件回放 / 查询 / tail |
| `pnpm obs:tui` | ink 实时事件面板 |
| `pnpm obs:api` | HTTP 观测 API，默认 `http://localhost:8787` |
| `pnpm gen:events` | 向 `docs/logs/events.jsonl` 写入演示事件 |
| `pnpm typecheck` | 各包 `tsc --noEmit`（GUI 包尚无此脚本） |

CLI / TUI / API 读取 `docs/logs/events.jsonl`。文件不存在时请先 `pnpm gen:events`。

Windows + Node 26 下，Electron 官方 `install.js` 可能解压失败。`pnpm gui:start` 会先跑 `scripts/ensure-electron.cjs`：缺二进制时补装，必要时用缓存 zip 解压。

## 目录

```
core/                 注册器、事件总线、JSONL 读写
obs/spec/             观测契约（ObsSpec）
obs/core/             注册表观测定义 + React 面板
obs/cli|tui|api|gui/  四端渲染器
obs/plugins/          各插件观测台占位
plugins/              业务插件包（workspace 已声明，目前为空）
docs/confirmed/       人类确认意图
docs/项目体检.md      源码核对清单（2026-08-18）
```

依赖方向：core 不依赖插件；插件依赖 core 契约。

## 现状与缺口

core 注册 / 查表 / 注销 / 生命周期单测已通过。观测层与插件层尚未接到同一条链：

- GUI 事件在内存，CLI / TUI / API 读文件，两边互不可见
- `registrySpec` 与 `RegistryPanel` 已写，四端基本未装载
- `plugins/` 尚无真实插件，GUI 使用内联 demo

完整条目见 [docs/项目体检.md](docs/项目体检.md)。

## 许可

私有仓库，未声明开源许可证。
