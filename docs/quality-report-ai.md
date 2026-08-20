# 质量检测报告（AI 版）

- 时间：2026-08-20T01:36:47.395Z
- 范围：33 个源码文件（core/contracts/plugins/obs）
- 增量：检查 0，跳过 33；全局门禁：复用上次结果（无修改）

## 全局门禁
- typecheck：❌ 失败（obs/gui） — 仅已知失败（obs/gui，改动前已存在）
- test：✅ 通过（Test Files 13 passed | Tests 95 passed）

## 文件清单（33 个，含 sha256）
- contracts/src/console.ts（17 行）sha256=2f78a7698ede7a1e8cb92f2734bb1d632ab28f286851ad2487b2de10b1ccbfd7 [未修改]
- contracts/src/events.ts（22 行）sha256=122d780212336eac207b7015f06973b3640802e5eba405ca50530b0137edfe1d [未修改]
- contracts/src/index.ts（29 行）sha256=67ee9a66334fb1fa81825d4266aa63d9a06c80865464c997011ddac6bc7f777b [未修改]
- contracts/src/logger.ts（24 行）sha256=0e5e38a9bf7196fd4b5b74e589518d1dccec5654d6b41511efee0a37a7bbd04f [未修改]
- core/src/discovery.ts（80 行）sha256=1628dc363e3bca1d26e9b1aa3f0efe222b7cf634bcf8158662aea93f14f04093 [未修改]
- core/src/events/bus.ts（34 行）sha256=cc67bd7a49fb07ee80de3c77184adef4f624ecc73f7d3dccf802084bd015fd7c [未修改]
- core/src/events/dispatcher.ts（167 行）sha256=7f904855381156bb7ca5445277b3779cb150ce29daeb7662daabe1cbce79a92f [未修改]
- core/src/events/persistence.ts（13 行）sha256=39007c2d6f25f044a8328fb05051a091b985bb89ec65b69643ac0f5d944c1dba [未修改]
- core/src/events/reader.ts（89 行）sha256=694a6ac95992859d3c2228e0a45cf8d8b13d115a0959c500ba5d8d5733224380 [未修改]
- core/src/events/types.ts（15 行）sha256=11b48ee38c44362d753a22af1d4ae2c672902ab2c0cab52a67703c295b50b4fe [未修改]
- core/src/harness.ts（111 行）sha256=675fd28a7718ce9c69c1e7cf6434aed4e1eb3cd69742da2ad652517836fd39d5 [未修改]
- core/src/index.ts（56 行）sha256=c7b45c7756fc87083b4bf51d40f2f5f9a1783dc5cf93636ef5fd063abfdaa152 [未修改]
- core/src/registrar/boot.ts（128 行）sha256=f0aa779d110d8fd8a4ae9544c9425929da7fac3e913cf847652d89cbbfd5937a [未修改]
- core/src/registrar/errors.ts（31 行）sha256=571e6af1e1d78efaddca72a70220d82501de56292f8f063e4850ecd7cc25f1ed [未修改]
- core/src/registrar/registrar.ts（692 行）sha256=a33014dae5188a3ca8f60b5e61e043faec8ac1b7142c721d581d5becfe998846 [未修改]
  - 文件过大 692 行 > 600（除非特殊）
  - 顶层函数 createRegistrar 过大（632 行 > 200），低内聚/职责过多，考虑拆分
- core/src/registrar/types.ts（330 行）sha256=1dbdd54d9e4a82359a4d5e433e3fb4309781c6e0cbc6f676b67028c5983adb74 [未修改]
- core/src/registrar/validate.ts（65 行）sha256=48f27038544bc8eeba68bc308a136d08c51a056b7db26df8f621d9c3ad0ef57f [未修改]
- core/src/shell.ts（101 行）sha256=34cad5d82d4a181ab1f6e61c2069a257fafb09f4f8f49b8820ae96f5958c5219 [未修改]
- obs/api/src/main.ts（265 行）sha256=5ba0a693dfd65d093267af53f93d4214f54b6aa5a48aa62743b1b07d37a29c44 [未修改]
  - 顶层声明过多 13 个 > 10，职责过多，考虑拆分
- obs/cli/src/main.ts（86 行）sha256=e372020ec441b3a98429ef177eaf29c91cb625792b68d1f64afaf0f2de284fda [未修改]
- obs/core/src/gui.tsx（567 行）sha256=aaf52e4ead64e4cf6ba25e82f4e453f014380f5d1127858492f866c32eb74c63 [未修改]
- obs/core/src/index.ts（4 行）sha256=0bd8e131321ad79b59da0f05ac4e3bbeeadb43cee8aca8d452308c83e5ddf042 [未修改]
- obs/core/src/spec.ts（22 行）sha256=5859abb0c5a45971e0b8aa155446654dfe53c3f5a76ca2d2690ab142de9d9d2e [未修改]
- obs/gui/src/TrafficLights.tsx（43 行）sha256=3b4b47ac22790303dab9fc8f52b1322da9ba66a1a48cb31068ded28d5ab82ad1 [未修改]
- obs/gui/src/renderer.tsx（68 行）sha256=671db16b1d81c499c4759165288bb46ef54633590d2430769957425184ec7971 [未修改]
- obs/gui/views/registry.tsx（12 行）sha256=412d6206bf27f8a434a9208b2a7aab4070b9b20aa7fda1c2ce656d80e29fda0d [未修改]
- obs/spec/src/index.ts（2 行）sha256=6cc8f512383a353f83046638e82f3478d573b4138edbdb5a352d1e1df6b64f75 [未修改]
- obs/spec/src/spec.ts（19 行）sha256=0b21da94424bee9964b0e129eb42c30902aaafa4d0a8816447cf08b8175d94ee [未修改]
- obs/tui/src/main.tsx（42 行）sha256=b629ef6e697f7880fd9e6e154cec94f7408c630067b048ead1833148c7256e42 [未修改]
- plugins/console/src/index.ts（94 行）sha256=b831aedd96ef1cf8f28ab33bc09e9faa9709b644a3637857baaa0bf271a7c928 [未修改]
- plugins/events/src/index.ts（87 行）sha256=c133cf992dd38b134978bc1f8dcacde58f30a765a740f1f3347b8b6ef6a3ab92 [未修改]
- plugins/hello/src/index.ts（70 行）sha256=5ac9f407bff28c9264fa52a7c5596aa3474fdeab3c8cdbf44cbb812ca55af3e7 [未修改]
- plugins/logger/src/index.ts（89 行）sha256=6943f29fb9f5f855e69cea362a2425c7f454e38fe257a1d3cbd1e55e0e14ade0 [未修改]

## 结构问题（2 个文件，3 项）
- core/src/registrar/registrar.ts（692 行） [未修改]
  - 文件过大 692 行 > 600（除非特殊）
  - 顶层函数 createRegistrar 过大（632 行 > 200），低内聚/职责过多，考虑拆分
- obs/api/src/main.ts（265 行） [未修改]
  - 顶层声明过多 13 个 > 10，职责过多，考虑拆分

## 结论
- 需关注：typecheck=fail，test=pass，结构问题 3 项。