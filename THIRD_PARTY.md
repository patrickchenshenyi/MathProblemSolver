# 第三方内容与许可

本仓库的原创代码（`packages/aimo/*`、`project/`、`eval/`、`scripts/`、`archive/`）以 MIT 授权，见 `LICENSE`。
以下为随仓库分发或引用的第三方内容。

## 1. DeepSeek Harness（`harness/`）—— MIT

- 来源：<https://github.com/deepseek-ai/deepseek-harness>
- 快照版本：`0.1.1-rc.2`（上游提交 `b150a551b8`，2026-08-21）
- 许可：MIT，原始声明保留在 `harness/LICENSE`
- 说明：`harness/` 是完整源码的 vendored 快照（含 `packages/`、`apps/`、`docs/`、`examples/`、`website/` 等上游目录），
  仅新增 `packages/aimo/*` 与 `tsconfig.base.json` / `tsconfig.host.json` / `pnpm-lock.yaml` 的最小集成改动，
  并剔除了与本地重建无关的 `.github/`。`pnpm-lock.yaml` 中的依赖版本与许可证由各上游包自带。

## 2. `project/research/AIMO3_Reference_Problems.pdf` —— 竞赛公开题

- 内容：AIMO Progress Prize 3 参考题（10 题）。题目本身为竞赛公开材料。
- 用途：`eval/build-aimo3-dataset.py` 由此抽取 `eval/aimo3-reference.json`（逐字保留 PDF 文本层，
  并以 `statement_quality` 标记文本层损坏程度）。
- 归属：题目版权归出题方所有，此处仅作技术验证用途引用，不再分发衍生商业内容。

## 3. `project/research/` 下的 4 篇方法拆解笔记 —— 第三方观点的二次整理

| 文件 | 性质 |
|---|---|
| `2026-AI数学突破方法拆解.md` | 对 OpenAI / Anthropic / DeepSeek 等公开数学突破方案的整理与评述 |
| `AIMO3-方案综述.md` | AIMO3 参赛方案的整理与评述 |
| `AI数学Agent协作机制与Prove2Me详解.md` | Anthropic Prove2Me / FLT 验证层协作机制的整理与评述 |
| `flt-navier-stokes-evaluation-layer.md` | FLT / Navier–Stokes 评估层（公理审计、comparator、独立内核）的整理与评述 |

- 这些是**对公开资料的评述性笔记**，非原文转载。文中引用的论文、博客、仓库归各自作者所有；
  结论性判断属笔记作者，本项目仅作研究记录保留，不作为事实依据对外引用。
- 若需正式引用，请回溯笔记中提到的原始来源。

## 4. 数据集中的题目文本

- `eval/aimo3-reference.json`：源自上述 AIMO3 参考题 PDF。
- `eval/aime-baseline.json`：AIME 历年公开题（15 题），题目为公开竞赛材料。
- 二者仅用于本项目的技术验证评测，**不考虑训练集污染问题**（见 README「跑评测」一节）。
