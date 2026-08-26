# 04 — Bundle 注册与发现

## 一句话

插件代码在 `plugins/<id>/`，但要被 **default App profile** 加载，还须写入 `bundles/app/wizard.patch.json`。

## 注册步骤

### 1. 创建插件包

```
plugins/pomodoro/
  package.json      # wizardHarness.plugin: true
  tsconfig.json
  src/index.ts      # export default plugin
  test/...
```

`package.json` 示例：

```json
{
  "name": "@wizard-harness/plugin-pomodoro",
  "wizardHarness": { "plugin": true },
  "dependencies": {
    "@wizard-harness/core": "workspace:^",
    "@wizard-harness/contracts": "workspace:^"
  }
}
```

### 2. 契约（可选但推荐）

`contracts/src/pomodoro.ts` 导出 `POMODORO_SERVICE` 与 `PomodoroService` 类型；在 `contracts/src/index.ts` 再导出。

### 3. Bundle patch

`bundles/app/wizard.patch.json`：

```json
{ "id": "pomodoro", "name": "pomodoro" }
```

插入位置通常在 `timer` 附近；依赖关系简单时可无 `requires`。

### 4. 构建

```bash
pnpm --filter @wizard-harness/contracts build
pnpm --filter @wizard-harness/plugin-pomodoro build
pnpm --filter @wizard-harness/obs-gui build   # 若改了 main.cjs / tray
```

### 5. 文档

- `docs/plugins/pomodoro.html` — 能力说明（与 `index.ts` 顶部注释路径一致）

## manifest 要点

```ts
manifest: {
  id: 'pomodoro',           // 全局唯一，openPluginWindow 用此 id
  provides: ['pomodoro'],   // 服务名，与 POMODORO_SERVICE 一致
  tier: 'standard',
  // tags 可选；番茄钟非工具套件，可不打 PLUGIN_TAG_TOOLKIT
}
```

## 观测台验证

1. 启动 GUI，打开观测台 → 插件列表应出现 `pomodoro`。
2. 点「打开窗口」或托盘「Open Pomodoro」→ 弹窗正常。
3. RPC：`snapshot` / `start` 无「未在 ui.rpc 声明」错误。

## workspace

`pnpm-workspace.yaml` 已包含 `plugins/*`，新目录无需改 workspace 配置。
