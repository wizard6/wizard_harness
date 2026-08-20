# 质量检测报告（AI 版）

- 时间：2026-08-20T01:29:23.835Z
- 范围：33 个源码文件（core/contracts/plugins/obs）
- 增量：检查 0，跳过 33；全局门禁：复用上次结果（无修改）

## 全局门禁
- typecheck：❌ 失败（obs/gui） — 仅已知失败（obs/gui，改动前已存在）
- test：✅ 通过（Test Files 13 passed | Tests 95 passed）

## 结构问题（3 个文件，3 项）
- core/src/registrar/registrar.ts（692 行） [未修改]
  - 行数 692 > 300（项目规范：单文件默认 ≤300 行）
- core/src/registrar/types.ts（330 行） [未修改]
  - 行数 330 > 300（项目规范：单文件默认 ≤300 行）
- obs/core/src/gui.tsx（567 行） [未修改]
  - 行数 567 > 300（项目规范：单文件默认 ≤300 行）

## 结论
- 需关注：typecheck=fail，test=pass，结构问题 3 项。