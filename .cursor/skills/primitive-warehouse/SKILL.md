---
name: primitive-warehouse
description: >-
  Use when deciding how to think, picking thinking constraints, or routing
  Primitive atoms (behavior / evaluate / guide). Do NOT use for SKILL.md
  install, alwaysApply, or dumping the whole primitive catalog into context.
  Call primitive_route first; then primitive_get only on the returned ids.
---

# Primitive 仓库（怎么想，不是做什么）

Primitive 是比 Skill 更小的思考提示词。目标是积累「怎么想」，不是挽救单次任务，也不是把说明书整包注入。

## 何时用

- 需要先观察 / 缺证据则停 / 禁止错误层硬补 这类**思考约束**
- 要把问题落到 `behavior` `evaluate` `guide` 三类原子上

## 何时不要用

- 安装或启用一份 SKILL.md → 用 `skill_list` / `skill_read`
- 把人格、记忆、本轮对话当思考规则 → persona / memory / session
- 自己把仓库全部读进上下文

## 调用顺序

1. `primitive_route`（`hint` 或 `startId` 或 `tag`，默认负荷 5）
2. 只对返回的 `steps[].id` 调用 `primitive_get`
3. 需要走关系时用 `primitive_neighbors`

内部路由（只读预览，不是工作流）：入口 → 树分解 → 沿 `then` 链走 → 按 guide → evaluate → behavior 排序 → 负荷封顶。

工具：`primitive_list` · `primitive_get` · `primitive_neighbors` · `primitive_route`。
