# 质量检测报告（AI 版）

- 时间：2026-08-20T01:31:39.734Z
- 范围：33 个源码文件（core/contracts/plugins/obs）
- 增量：检查 0，跳过 33；全局门禁：复用上次结果（无修改）

## 全局门禁
- typecheck：❌ 失败（obs/gui） — 仅已知失败（obs/gui，改动前已存在）
- test：✅ 通过（Test Files 13 passed | Tests 95 passed）

## 结构问题（2 个文件，3 项）
- core/src/registrar/registrar.ts（692 行） [未修改]
  - 文件过大 692 行 > 600（除非特殊）
  - 顶层函数 createRegistrar 过大（632 行 > 200），低内聚/职责过多，考虑拆分
- obs/api/src/main.ts（265 行） [未修改]
  - 顶层声明过多 13 个 > 10，职责过多，考虑拆分

## 结论
- 需关注：typecheck=fail，test=pass，结构问题 3 项。