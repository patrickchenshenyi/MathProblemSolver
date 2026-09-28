# 设计文档索引

8 篇文档按**写入时间**排列。文档正文为保持原始记录**未改写**，其中的旧路径映射见仓库根 `README.md`
「文档路径映射」一节；下面的"与现状的差异"是打包时（2026-09-28）核对的结论。

| 文档 | 日期 | 状态 | 内容 | 与现状的差异 |
|---|---|---|---|---|
| `项目规划建议.md` | 2026-09-19 | 历史 | 最初的个人 AI 数学项目规划（不参赛、非 Kaggle） | 已被 `Project_Blueprint.md` 取代 |
| `Project_Blueprint.md` | 2026-09-19（五稿） | 部分过时 | 项目计划：总体架构、工具/skills/agents、验收器范围、持久化、评测、预算、里程碑、插件工程 | ① 插件由 3 个增至 **5 个**（新增 `team-roles`、`pool`）；② 验收器不再是 L0+L1+L2 瀑布，已重写为 **L0 + 任务级机制校验**；③ 开发环境仍是"独立 clone + 独立 DSH_HOME + 独立端口"，与 `scripts/sync-from-workshop.sh` 的同步路径一致 |
| `Implementation_Plan.md` | 2026-09-21 | 历史任务书 | 自包含的分步实施提示词（每步含交付物/验收标准/自查），供新会话执行 M0–M1 | 其中 M0/M1 步骤已完成，`run_python` 已被容器运行时取代 |
| `部署指南.md` | 2026-09-22 | 步骤可用，清单需修正 | 阿里云 ECS 部署：Caddy 反代 + systemd 常驻 + Docker 沙箱 + 无鉴权风险 | 文中"5 个自定义包"的符号链接清单与"verifier L0+L1（`verify_answer`/`submit_answer`）"**已过期**：现在是 7 个链接、工具名为 `submit_final_answer`/`submit_task`，且 `constraints/*.py` 已随 v0 归档到 `archive/verifier-v0/` |
| `强验收器实现.md` | 2026-09-26 | 设计记录（已搁置） | 强验收器 L0/L1/L2 的实现说明（约束谓词作 ground truth、sympy 交叉验证） | **被 `Gap_Analysis.md` 的结论改写路线**：整数答案题下 L1/L2 的收益不成立，改走"Lean 中间步骤验收"。实现成果保留在 `archive/verifier-v0/` |
| `Gap_Analysis.md` | 2026-09-27（v1.0） | **现行** | 与 OpenAI/Anthropic/DeepSeek 一线方案的差距分析 + P0–P4 优先级 | — |
| `Deep_Improvement_Plan.md` | 2026-09-27（v5.5） | **现行（最新进度）** | 多 agent 协作升级计划：验收设计、角色与池、Phase 0–4 分项进度与证据 | T10（critic 写回）待办；Phase 4 评测进行中。**进度以本文 §0.1 表为准** |
| `Lean_Verification_Plan.md` | 2026-09-27（v1.0） | **现行（待实施）** | 把验收从 L0 升级为「L0 + Lean 内核证明检查」的分步方案（对应 T2） | 对应 `submit_task` 的 `lean` 字段；尚未接线 |

## 一句话主线

`Project_Blueprint.md` 定的总原则是**"验收器的强度决定自治程度，先造验收器，再堆 agent"**。
工程上先做出了 v0 验收器（L0+L1+L2），Phase 0–3 把协作机制跑通，Phase 4 实测发现
**协作基础设施不是瓶颈、验收器太弱才是**（`Gap_Analysis.md`），于是把验收器定位改成
**L0 + Lean 中间步骤验收**（`Lean_Verification_Plan.md`），v0 归档。
