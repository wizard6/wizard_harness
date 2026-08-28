# SAO Utils · 理解

> 源仓：[NERvGear/SAO-Utils](https://github.com/NERvGear/SAO-Utils)（开发与 Bug 跟踪镜像，**不含引擎源码**）  
> 公开绘图 API：[NERvGear/NERvSDK](https://github.com/NERvGear/NERvSDK)  
> 开发日志：[Alpha/Exp](http://www.gpbeta.com/post/develop/sao-utils-exp/) · [Beta](http://www.gpbeta.com/en/post/develop/sao-utils-beta/)  
> 成对文档：[拆分](./breakdown.md) · [HTML](./understanding.html)  
> 本地副本可放 `temp/SAO-Utils`、`temp/NERvSDK`（不入库）。

## 1. 它是什么

Windows 桌面 **常驻 HUD / 启动器**：托盘驻留、环形菜单、桌面挂件、主题（SAO / GGO / ALO）。宿主闭源；GitHub 仓只做进度与缺陷。能对照的「底层绘图」在 **NERvSDK 场景图头文件** 与 **三代图形管线开发日志**。

一句话：**把桌面当成分层合成表面来画，而不是一组 OS 对话框。**

## 2. 三代图形管线

| | Alpha | Beta | Exp |
| --- | --- | --- | --- |
| 框架 | wxWidgets 2.9 | wxWidgets 3.0 | Qt 5.12.2 |
| 图形 API | GDI | GDI + Direct3D 9 | GDI + OpenGL 2.0 |
| UI 脚本 | — | — | QML |
| 立体 / VR | — | 内建立体渲染 | OpenVR |
| 系统 | ≥ Windows 2000 | ≥ Windows 2000 | ≥ Windows Vista |

Beta 公开过分层模式实测：Direct3D 9 + MSAA 4x + 线性过滤，单核约 10% CPU；**传统绘制模式**更省 CPU、更高 FPS。3D 曲面菜单是可选项，随时切回 2D。

Exp 把主题 / 挂件 / 背景改成 QML，启动器特效做成插件资源里的 vertex/fragment shader。

## 3. 合成模型（要借的核）

```
插件 / 主题 / 挂件 / 着色器
        ↓
NERvGear UI
  Window → View → Canvas
  Animator · Font
  Logic 尺寸 vs Pixel 尺寸（DPI）
  ZORDER：WIDGET / DEFAULT / LAUNCHER / LAUNCHER_MENU / MESSAGEBOX
        ↓
宿主合成
  2D 传统：GDI / WM_PAINT
  分层：WS_EX_LAYERED + 预乘 alpha 整窗提交
  GPU：离屏 RT（D3D9 / GL）→ 分层窗口
  可选：曲面菜单、MSAA、运动模糊、TV FX、OpenVR
```

| 概念 | 含义 |
| --- | --- |
| 分层窗口 | 每像素 alpha，桌面透过洞；系统保存位图，不必为动画重绘下面的窗口 |
| 传统模式 | 不走整窗分层提交，更便宜；外观弱一档 |
| 点击穿透 / 不抢焦点 | 挂件属性，作者不用自己管 Win32 |
| 附着启动器 | 同一挂件可钉桌面或钉 HUD；启动器进 3D 时挂件跟着进 3D |
| 九宫格 `*.9.ext` | 背景拉伸不毁边角 |

**硬规则**：HUD 的可见性、z 层、透明度、是否拦截鼠标，是 **表面属性**，不是 CSS 碰巧透明。

## 4. NERvSDK 公开绘图面

头文件只声明工厂，实现在闭源宿主。可读的原子：

| API | 角色 |
| --- | --- |
| `NERvCreateWindow` | 一层叠加窗口 |
| `NERvCreateView` | 窗口内视口 |
| `NERvCreateCanvas` | 离屏画布（像素尺寸） |
| `NERvCreateAnimator` | 时钟驱动的属性动画 |
| `NERvCreateFont` | 从文件加载字体 |

`UI::ANIMATE`：`MOVE` / `SIZE` / `ALPHA` / `TRANSLATE{,_X,_Y,_Z}` / `SCALE*` / `ROTATE*`。插值：`Linear` → `Quadratic` … `Bicubic`，以及反向 `*R`。每帧：`value = src + I(t, duration, dest - src)`。

组件目录把 UI 拆成 `CORE_UI_VIEW` / `CORE_UI_CTRL` / `CORE_UI_THEME`，另有 `GRAPHIC` 插件类——**画布、控件、主题、特效资源分家**。

公开 SDK **没有** 把 D3D device / `UpdateLayeredWindow` 交给插件。插件画场景图；宿主决定 GDI 还是 GPU、2D 还是分层。

## 5. 产品壳（对照时丢掉）

Steam 创意工坊、QML 主题市场、邮件/网页挂件、Rainmeter 导入、COM 插件宿主、SAO 皮肤本身。这些不是绘图核。
