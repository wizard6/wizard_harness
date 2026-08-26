# 03 — 弹窗 RPC（ui.rpc）

## 一句话

插件弹窗内的 JS **不能**直接访问 Node 或服务实例；通过 preload 暴露的 `window.wh.call(service, method, args)` 调用，且必须在 `plugin.ui.rpc` 白名单中声明。

## 插件声明

```ts
ui: {
  rpc: {
    pomodoro: ['snapshot', 'start', 'pause', 'resume', 'reset', 'skip', 'configure'],
  },
  content: POMODORO_HTML,
}
```

- 键名 = **服务名**（与 `provides` / `contracts` 中 `POMODORO_SERVICE` 一致）。
- 值 = 允许从 **本插件弹窗** 调用的方法名数组。

## 弹窗内调用

```js
async function call(method, args) {
  const r = await window.wh.call('pomodoro', method, args || []);
  if (!r.ok) throw new Error(r.error || '失败');
  return r.result;
}
```

`preload-safe.cjs` 将请求发到 `wh:plugin-call`。

## 主进程校验链（固定顺序）

1. 发送方必须是插件弹窗（`popupPluginId.get(win)`）。
2. `plugin.ui.rpc[service]` 必须包含 `method`。
3. `harness.services.get(service)[method]` 必须存在且为函数。
4. 执行并返回 `{ ok: true, result }` 或 `{ ok: false, error }`。

## 与 `wh:call-service` 区别

| 通道 | 调用方 | 白名单 |
| --- | --- | --- |
| `wh:plugin-call` | 插件弹窗 preload | `ui.rpc` |
| `wh:call-service` | 观测台等主 UI | 无 rpc 限制（仍受服务是否存在约束） |

写插件弹窗时 **只用** `wh:plugin-call` 路径（即 `window.wh.call`）。

## 安全注意

- 不要把敏感方法（任意 shell、写盘到任意路径）放进 `ui.rpc`。
- `trusted` 插件另有 `execCommand` 通道，番茄钟等非 trusted 插件不应申请 trusted。

## 参考

- `plugins/git-tools/src/index.ts` — `rpc.gitTools` 列表示例
- `contracts/src/pomodoro.ts` — 服务类型与常量
