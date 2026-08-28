# Web 优先软件开发架构（基于当前基座）

> 落地代码：`profiles/web-dev`、`bundles/web-dev`、`plugins/web-pipeline`、`examples/nitron-web`。可视化：[web-dev-architecture.html](./web-dev-architecture.html)

## 结论

在现有 **插件 + Bundle/Profile + workflow 按图调度 + obs-api 运行时壳** 上，加一条**不经过 Electron** 的开发路径：

1. **产品本体是静态 Web**（HTML/CSS/JS）。
2. **工作流部署的是 Web 站点**（拷到 `$WH_HOME/web-deploy`，由 API 挂在 `/site/`），不是桌面应用、也不是 APK。
3. **Nitron 是可选最后一跳**：把**同一份**已部署 Web 打成 Android APK，作 demo，不是主发布物。
4. **交互客户端是浏览器**，调 `POST /rpc`；不新增「按请求路由到插件」。

## 分层（沿用已确认壳定位）

| 层 | 本路径用什么 | 不用什么 |
|---|---|---|
| 运行时壳 | `obs:api`（`assembleRuntime`） | Electron GUI |
| 观测器壳 | 仍可读 `events.jsonl` | — |
| 组合 | `profiles/web-dev` = `base` + `web-dev` | `bundles/app`（app-ui / 弹窗 Demo） |
| 调度 | 现有 `workflow`（`schedule.ts` 顺序走图） | 不把业务 if 写进调度器 |
| 业务节点 | 新插件 `web-pipeline` `registerNode` | 不改 `workflow-nodes` 的 echo/upper |
| 人机界面 | 静态页 `plugins/web-pipeline/web` | `plugin.ui` 弹窗、托盘 |

明确不做（已确认边界）：热插拔、按请求路由到插件、沙箱隔离、用户登录。静态文件是**壳级目录挂载**（`WH_STATIC_DIR` / `WH_SITE_DIR`），不是插件 HTTP 路由。

## 工作流

```
examples/nitron-web          开发：改静态文件
        │ web.validate       检查 index.html
        ▼
$WH_HOME/web-deploy          web.deploy：发布 Web（主产物）
        │ 浏览器 GET /site/
        ▼
npx nitron build             nitron.package：默认 dry-run
        │ WH_NITRON=1 或 runPipeline({ runNitron: true })
        ▼
dist/app.apk                 可选 Android demo（同一份 Web）
```

节点种类：`web.validate` → `web.deploy` → `nitron.package`。跑图用 `webPipeline.runPipeline`。

## 启动

```bash
pnpm web-dev
```

默认 `http://localhost:8787/` 为流水线控制台，`/site/` 为已部署站点。真正打 APK 需要本机 Node + JRE，以及一次 `npx nitron build`（测试默认不执行）。
