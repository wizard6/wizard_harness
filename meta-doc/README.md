# meta-doc

外部参考项目的理解与拆分档案。给后续借鉴开发用，**不是**运行时代码、也不是插件说明。

```
meta-doc/
└── reference-projects/     每个参考仓一个英文子目录
    ├── README.md           索引
    ├── ombre-brain/        理解 + 拆分（html + md）
    └── yao-meta-skill/
```

约定：

1. 一个参考项目 = 一个英文文件夹。
2. 每个项目至少两篇成对文档：`understanding.{md,html}`（它是什么）与 `breakdown.{md,html}`（怎么拆、怎么借鉴）。
3. 吸收进 harness 的能力，在拆分文里写「已落地 / 刻意推迟」，并同步对应 `docs/plugins/*.html`。
4. 源仓可浅克隆到 `temp/<name>`（`.gitignore` 已忽略 `temp/`），不要整仓搬进本仓库。
5. 旧路径 `docs/reference/projects.md`、`docs/reference/ombre-brain.md` 只保留跳转 stub。
