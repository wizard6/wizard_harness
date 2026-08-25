# cordis 通信模型：服务 = 直接调用，事件 = 广播

> 主题问答整理 · 2026-08-19；2026-08-20 对照表同步最新代码（`ctx.call` 事件化 RPC / 懒加载 factory / 热更新与热重载）
> 问题：cordis 是通过事件通信的吗？插件之间是**直接调用服务**，还是"给谁发事件、由谁处理"？

## 结论

**两者都有，而且是两条独立通道，分工不同：**

- **服务（Service）= 直接调用**：按名字解析出实例，然后直接调它的方法——本质是依赖注入（DI），点对点、有返回值、有状态。
- **事件（Event）= 广播通知**：向作用域内所有订阅者广播，不指定接收者，谁关心谁处理——本质是观察者模式，一对多、解耦、无状态消息。

**事件不是"请求-响应"式的 RPC**。需要返回值、需要精确控制的操作走服务；需要"通知大家、各取所需"的走事件。

## 通道一：服务 = 直接调用（主通道）

```ts
// 注册（提供方，通常在插件 apply 里）
ctx.provide('database', databaseImpl)
// 或 Service 子类：class Database extends Service { constructor(ctx) { super(ctx, 'database') } }

// 获取（消费方）
const db = ctx.get('database')       // 立即取，没有则 undefined
const db = ctx.get('database', 5000) // 等待服务出现，超时返回 undefined
db.getUser(123)                      // 直接调方法，有返回值
// 语法糖：ctx.database 等价 ctx.get('database')
```

关键点：

- `ctx.foo.bar()` 就是普通 JS 方法调用，可以同步也可以返回 Promise。
- 服务是**单例实例**，有状态；消费方在生命周期内拿到的是同一个实例。
- 调用是点对点的：调用方知道服务名和接口（契约），直接取、直接调。

## 通道二：事件 = 广播通知（辅通道）

```ts
// 订阅（处理方，任意插件）
const dispose = ctx.on('user/created', (user) => {
  // 收到通知，自行决定怎么处理；可以有多个插件同时监听
  sendWelcomeMail(user)
})
// 不再需要时：dispose()

// 触发（发出方，任意插件）
ctx.emit('user/created', user) // 广播给所有订阅者
```

关键点：

- **事件不指定接收者**：发给"当前作用域内订阅了该事件名的所有监听器"，没有"给某个处理器"的概念。
- 事件名就是路由键（koishi 风格：`user/created` 这类命名空间字符串）。
- 触发方与处理方完全解耦：触发方不知道谁在处理，处理方之间也互不知道。
- 返回值不是"请求-响应"的结果，只用于控制分发：
  - `emit`：监听器按顺序执行，**返回 false 中断**后续（可拦截/取消场景）；
  - `waterfall`：每个监听器的返回值作为下一个监听器的参数（管线/中间件）；
  - `broadcast` / `serial` / `parallel` / `bail`：并行、串行、短路等衍生分发模式。

## 两条通道怎么配合（典型模式）

**"服务完成操作，事件广播结果"** 是 cordis 系插件最常用的组合：

```ts
// 插件 A：用服务写库，然后广播事件
async function createUser(ctx, user) {
  await ctx.database.create('user', user) // 服务：直接调用
  ctx.emit('user/created', user)          // 事件：通知大家
}

// 插件 B：监听，做自己的事
ctx.on('user/created', (user) => sendWelcomeMail(user))
// 插件 C：也可以同时监听，互不知道对方
ctx.on('user/created', (user) => auditLog(user))
```

- **服务 = 能力点**：谁需要能力，谁去取、直接调。
- **事件 = 扩展点/钩子**：发生了什么，广播出去，任何插件都可以插入处理。

## wizard-harness 对照

| 维度 | cordis | wizard-harness 现状 |
| --- | --- | --- |
| 服务获取 | `ctx.get(name)` / `ctx[name]` | `ctx.get(name)` / Proxy 属性 `ctx.logger`；另支持懒加载 `factory`（首次 get 才创建并缓存单例）—— 一致 |
| 服务调用 | 直接调方法 | 直接调方法（主通道）；**另新增 `ctx.call(service, method, args, {timeoutMs})` 事件化 RPC**（见下） |
| 事件触发 | `ctx.emit / broadcast / waterfall ...`（多种分发） | `ctx.emit`（事件总线，广播）；`service-call` / `service-result`（事件化 RPC 专用请求/响应事件，requestId 关联、可审计可拦截）；`dispatcher` 库级另有 emit/waterfall/serial/parallel/bail 五种，尚未接入 ctx |
| 事件订阅 | `ctx.on(action, handler)`，返回 disposer | `ctx.events.subscribe(listener)`，返回取消函数 —— 一致 |
| 事件结构 | 事件名做路由，订阅者自选处理 | 同（actor/action/target/payload 结构） |

**关于本项目新增的 `ctx.call`（事件化 RPC）**：它不在 cordis 的标准模型里——cordis 的服务调用**就是直接调用**，事件只做广播通知。`ctx.call` 是项目自有的增强：把一次服务调用封装成 `service-call` 事件发到总线 → 路由到该服务的提供方执行（可带 `providerId` 精确路由，多提供方不广播）→ 以 `service-result` 事件返回，全程可观测、可审计、可跨进程（HTTP 网关）。它不改变"服务=能力、事件=通知"的划分，而是**让调用也借道事件通道**的混合形态：语义上仍是点对点 RPC（有请求、有响应、有超时），只是传输走事件总线。

因此：本项目与 cordis 在"**服务直接调、事件广播**"这个根本模型上是一致的；差异在于：① 事件分发的丰富度（5 种分发模式尚未接入 PluginContext，见 [`reference/项目体检.md`](../reference/项目体检.md) 遗留项）；② 项目额外提供事件化 RPC（`ctx.call`）与懒加载 factory 等自有增强。

## 附：本仓库服务实现与 cordis 的差异要点

承接"服务实现到底对不对"的问答，此处只列结论性要点：

1. **同名服务语义不同**：本项目一名多提供方并存、`get()` 取插入序第一个；cordis 是单实现，替换 = 卸载旧提供方 + 挂新提供方 + 依赖方自动重载。本项目没有"服务替换"语义，且同名多提供方时 `get()` 结果依赖加载顺序（`sortByInject` 不保证提供方之间的相对顺序）。
2. **PENDING 是"死"的一次性判定**：本批插件 + 已注册服务里无提供方即挂起，不重试、不复活；cordis 的 PENDING 是"活"的（服务出现自动加载、消失自动卸载、恢复自动重载）。本项目符合确认稿"不做热插拔"的边界，属有意裁剪。
3. **`registrar.register` 直调时缺必选 inject 直接抛错**：cordis 静默等待。boot 路径先静态过滤所以正常，但运行时动态注册"依赖后续才出现的服务"的插件会直接失败。
4. **已对齐的部分**：属性即服务（Proxy）、inject 必选/可选、`ctx.effect` 可逆副作用（LIFO + 失败隔离）、卸载级联、`waitFor` 等待服务。
