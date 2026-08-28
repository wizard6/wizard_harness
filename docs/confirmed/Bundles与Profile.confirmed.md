# Bundles 与 Profile · 人类确认文件

> 对齐 Cordis 组合模型；不改注册器已锁定契约。

1. **插件**是生命周期单元。**Bundle** 是可分发 patch 层（`wizardHarness.bundle.patch`）。**Profile** 是可运行组合（有序 `bundles` + 可选本层 patch）。
2. 空树按序叠加：bundle → profile `wizard.patch.json` → `$WH_HOME/wizard.patch.json` → overlay。后层覆盖；按 id 改行时 config **整份替换**；`insert` 加行；未知 id 只警告。
3. JSON 序列化。不做 YAML/`!!js`/group/isolate/同插件多实例。缺 bundle 或 patch 损坏 fail-loud。`WH_PROFILE=off` 退回目录发现。
4. 默认 `profiles/default` 叠 `bundles/base`（能力）再叠 `bundles/app`（`app-chat` + `app-ui`）。`profiles/web-dev` 叠 `base` + `bundles/web-dev`（workflow + web-pipeline + workspace），给 API + 浏览器工作台，不经过 Electron。GUI/API 共用 `assembleRuntime`。观测台只做 `openPlugin`，不拥有产品 UI。
