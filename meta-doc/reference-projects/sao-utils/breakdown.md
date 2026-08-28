# SAO Utils · 拆分

> 源仓：[NERvGear/SAO-Utils](https://github.com/NERvGear/SAO-Utils)  
> 成对文档：[理解](./understanding.md) · [HTML](./breakdown.html)  
> 用途：指导桌面壳 **叠加绘制**（托盘 HUD / 工作台浮层），不搬 C++/D3D/Qt 宿主。

## 1. 模块切分

| 源仓模块 | 借鉴？ | 建议落点 | 说明 |
| --- | --- | --- | --- |
| 分层合成（每像素 alpha、整窗提交） | **是** | `obs/gui` 叠加窗 | 托盘菜单已是无框透明小窗；观测台弹窗仍是实心底 |
| 表面属性：穿透 / 置顶 / 透明度 / 不抢焦点 | **是** | Electron `setIgnoreMouseEvents` 等 | 挂件作者不碰 Win32 |
| Z 层：widget / launcher / menu | **是** | 壳内约定，不要靠窗口创建顺序 | 菜单永远压过挂件 |
| Window → View → Canvas | **是（模型）** | 未来 HUD 场景图 | 不要把环形菜单画进 Chromium 标题栏 |
| Animator + 插值 | **是（模型）** | HUD 动效 | alpha/pos/size/transform 用时钟，不靠 CSS 碰巧能用 |
| 2D 便宜路径 ↔ GPU 路径可切换 | **是（纪律）** | 配置或降级 | 分层贵；失败时退回矩形窗 |
| Logic vs Pixel（DPI） | **是** | 已有 DPI；保持逻辑单位 | 不要硬编码 96dpi 像素 |
| 挂件附着启动器 vs 桌面 | 可后补 | workspace / 托盘 HUD | 同一块 UI 两种宿主表面 |
| 启动器 shader 资源 | 可后补 | 主题包 | 特效是资源，不是 main.cjs |
| D3D9 / OpenGL / QML / wxWidgets | **否** | — | 闭源引擎；Electron 已有 Chromium 合成 |
| COM 插件 GUI 库、Steam 工坊、SAO 皮肤 | **否** | — | 产品壳 |
| OpenVR / 曲面菜单 / TV FX | **否（现阶段）** | — | 要 GPU 场景图之后再谈 |

## 2. 与当前桌面壳的差距

| 能力 | 现在（`obs/gui`） | SAO Utils | 下一步可借 |
| --- | --- | --- | --- |
| 启动 | 只挂托盘，不弹窗 | 托盘驻留 + 手势唤出 HUD | 已对齐「不占桌面」 |
| 托盘菜单 | `tray-menu.html` 透明无框窗 | 分层菜单 + 独立 z | 保持小窗；可补 blur 关闭、定位 |
| 插件窗 | `ui.hud` 走透桌面叠加；其余实色 `#16161e` | 每像素 alpha 叠加 | 观测台保持实心 |
| 点击穿透 | HUD 面板外 `setIgnoreMouseEvents` | 挂件级属性 | 已用于 workspace |
| 绘制核 | Chromium + CSS | GDI / D3D9 / GL 离屏 → 分层 | **不要**上 native D3D；HUD 用 CSS/Canvas/WebGL |
| 动画 | CSS / 无统一时钟 | Animator + 插值族 | 环形菜单再引入 |
| 场景图 | 一插件一 BrowserWindow | Window/View/Canvas | 多块 HUD 先仍用多窗；环形菜单再收成一层 Canvas |

## 3. 建议吸收的切片（按优先级）

1. **表面不是对话框**：常驻 UI = 叠加层。启动不弹窗（已做）；菜单/工作台按需出现，关窗不退出。
2. **分层属性进窗口选项**：需要 HUD 的窗显式 `transparent` + 预乘 alpha；不需要的保持实心底（现在的观测台）。
3. **z 与命中分离**：菜单层拦截鼠标；装饰/挂件层可穿透。不要靠「再开一个总在最前的窗」混过去。
4. **双通道**：默认走 Chromium 合成（便宜）；只有环形 HUD / 粒子才上 Canvas 或 WebGL，并允许关掉。
5. **动画 = 属性插值**：位移、尺寸、alpha 用同一套 duration/delay/easing，不要每块 CSS 各写各的。

不要做：把 NERvSDK 链进 Electron、自写 D3D9 `UpdateLayeredWindow` 宿主、移植 QML 主题、做 SAO 皮肤启动器。

## 4. 与其它层的边界

| 层 | 落点 | 不要用 SAO Utils 填进去的东西 |
| --- | --- | --- |
| 运行时壳 | `obs/gui` | 绘图宿主；插件不直接碰 HWND |
| 工作台内容 | `plugins/workspace` | 瓷砖数据与 RPC，不负责合成 |
| 浏览器工作台 | `pnpm web-dev` | 普通文档页，不是桌面叠加 |
| 插件弹窗 | `plugin.ui` | 仍是 HTML 字符串；不引入 Canvas COM |

## 5. 已落地 / 刻意推迟

**已落地（壳行为）**

- 启动只挂托盘
- 托盘右键独立透明小窗
- 插件弹窗单例 + `wh.call`
- **透桌面 HUD**：`plugin.ui.hud` → 工作区覆盖、预乘透明、面板外点击穿透（workspace）

**刻意推迟**

统一 Animator、Window/View/Canvas 场景图、WebGL 环形菜单、shader 主题包、挂件附着、VR、观测台透桌面。

改叠加绘制时，同步本文与 [02-tray-menu.md](../../../docs/guides/desktop-shell/02-tray-menu.md)。

## 6. 本地阅读（可选，勿提交）

```bash
git clone --depth 1 https://github.com/NERvGear/SAO-Utils.git temp/SAO-Utils
git clone --depth 1 https://github.com/NERvGear/NERvSDK.git temp/NERvSDK
```

优先读：`NERvSDK/include/NERvGear/UI.h`、`animate.h`、`interpolator.h`、`catalog.h`。SAO-Utils 仓几乎无代码。管线事实以 GPBeta 开发日志为准，不要从空镜像反推 D3D 实现。
