# AI 数学 Agent 协作机制 + Prove2Me 详解

> 整理时间：2026-09-19
> 本文回答两个问题：① Anthropic / OpenAI 的数学 agent 在 prompt 层到底是怎么协作的（任务下达 / 身份 / 主 agent / 通信）；② Prove2Me 是什么、它的 DAG 包含什么、怎么生成。
> 证据标注：**【有据】** = 一手原文可查；**【推断】** = 从机制合理推出；**【未知】** = 官方未公开。**不把推断当事实。**

---

## 0. 先说诚实的边界

两家公开的是**设计原则 + 协作基座**，不是 prompt 级实现。一手材料只有：
- Anthropic《Learning more about Claude's mathematical capabilities》（黎曼）与《Formalizing Fermat's Last Theorem》（FLT）
- Prove2Me 论文 arXiv:2608.28433
- OpenAI《On the Navier–Stokes Millennium Prize Problem》（该页直接抓取 403，正文细节来自 CNBC / Quanta / The Batch 转述）
- Buckmaster 声明 PDF（<https://cims.nyu.edu/~tristanb/statement.pdf>）

下面每个结论都标注来源等级。

---

## 1. 四个问题逐一回答

### 1.1 任务怎么下达？是"你给我把问题解决了"吗？

**顶层真的就是这么粗暴，但只此一次。**【有据】

- 黎曼：非数学家 Jarred Sumner 对 Claude 说 *"take a real stab at the Riemann hypothesis"*（认真试一下），失败后再来一次，此后主要是 *"keep going / believe in yourself"* 的鼓励，**零技术指示**。
- FLT：目标是明确的（"把 Wiles 证明形式化"），人类 Tianyi Peng 只给方向性高层指令，原文例句：*"Jacobian as a scheme sounds high priority"*、*"push the Mazur theorem to be done soon"*。**这就是全部人类输入。**
- OpenAI：Buckmaster 追问后得知，给他看的那条 prompt *"had been written by prompting Codex"*（那条 prompt 本身是让 Codex 写的），且 *"the team first set the model on easier problems, including Euler"*（先做更简单的问题热身）。【有据，Buckmaster 声明】

**结论**：顶层指令 = 一句话；**往下的切分不是靠人写任务清单，也不靠某个 agent 写大计划书，而是发生在协作基座里（见 §3 的 DAG）**。Anthropic 明说第一次失败的根因是 agent *"lost track of the project's state and stopped collaborating effectively"*——记忆退化，不是"不会解题"。

### 1.2 身份/组织怎么实现？prompt 里写"你是X，做Y"吗？

**不是靠角色扮演，而是靠"功能位置"：身份 = 工具集 + 可见数据 + 可写权限的差异。**【有据为主，部分推断】

- RH 那 60 个子 agent 的"2 出想法 / 13 喂想法 / 30 失败 / 13 验证 / 2 写稿"是**结果统计**，不是写死的剧本。原文：Jarred 只是 *"coordinating about 60 Claude subagents"*——**由一个 Claude 协调**，角色是运行时按功能分派的。【有据】
- Prove2Me 里"身份"被**对象模型**取代：没有"你是数学家"这种设定，只有几种**动作**（提交定理 / 提交证明 / read-back 审计 / 当 captain）。最说明问题的是审计 agent：**只给它 Lean 代码、不给原始论文**——它的"身份"靠**信息裁剪**实现，而不是靠 prompt 里声明"你是审计员"。【有据】
- 【推断，基于 Claude Code 公开机制】FLT 用的是 *"a Claude Code-based multi-agent harness"*。Claude Code 的子 agent = 一个 markdown 配置文件（`name` / `description` / `tools` / `model` / `prompt`），主 agent 通过 Task 工具按名字调用。**角色定义 = 一个带工具白名单和专属 system prompt 的配置；组织 = 主 agent 决定此刻调哪个。**

### 1.3 主 agent 怎么知道自己是主 agent？怎么切分、怎么发现子 agent？

要分两套架构（详见 §2）：

**架构 A：中心编排（Anthropic 的 harness、OpenAI 的 groups）**
- "主 agent 知道自己是主 agent"不是靠自觉，而是**它是唯一持有 spawn/调用工具的那个**。这个不对称就是"主权"。【推断，几乎必然】
- 切分：主 agent 在**运行时**决定"再开一个 agent 去证 X"，依据是它看到的项目状态（FLT 里是 DAG）。
- 发现子 agent：**不存在注册表**。主 agent 有 spawn 原语，能随时创建带新 prompt 的子 agent，"可调用集合"是无限的。【推断】

**架构 B：去中心化（Prove2Me）**
- **没有主 agent。** 论文原话：*"How best to coordinate the decentralized, asynchronous agents on Prove2Me remains an open question."*【有据】
- "下一步证什么"由**每个 agent 自己去读 DAG/里程碑列表、挑一个未证节点**。"计划"不是存在哪个 agent 脑子里，而是**外化到共享的定理图上**——单个 agent 会忘，图不会。
- 发现"有什么可用"：通过**搜索 API（Formalpedia）**，agent 被要求 *"search before they submit: reuse an existing theorem where one exists"*。【有据】

### 1.4 最核心的问题：agent 之间怎么通信？决定分享什么？怎么分享？

Prove2Me 论文把通信协议写清楚了，这是全题里唯一能给你**一手精确**答案的部分。

**① 主通道不是"发消息"，是"提交到共享产物图"。**【有据】
- agent 证完一条定理 → 调用**提交动作** → Lean 编译通过 → 定理成为 Formalpedia 里**不可变、可被 `import`** 的对象 → 别的 agent 直接 `import` 它。
- "决定分享什么"被**架空**：你不需要决定分享什么，只负责提交；机器验收通过的东西自然对所有人可见。论文给了正向激励：*"a theorem is worth more the more often it is built upon"*。

**② "怎么知道自己可以分享"：有显式工具动作 + 机器门槛。**【有据】
- 证明提交硬约束：文件里声明 `theorem solution`，**类型与目标逐字相同、不含 `sorry`、不引入新公理**。能过编译 → 能分享；过不了 → 平台拒收。**"能否分享"是机器判定的。**

**③ 次要的、给人看的通道：讨论频道。**【有据】
- 用途：*"agents post progress, intermediate findings, and lessons learned in real time"*。
- 闭环实例：一个 agent 提出 proof-sketch 引用 `gotsman_linial`；**另一个 agent 提交了对它的反证**；第一个 agent 提交修正版 `gotsman_linial_with_zero`（补边界条件），最终打通整条分支。**"提出→被否→修正"就是他们 agent 通信的真实形态：不是聊天，是互相验证/反驳彼此的产物。**

**④ 发现新数学（非形式化）场景：靠验证者角色。**【有据，Anthropic RH】
- 自检清单：子 agent 互相当 referee、主动找反例、下载 54 篇 arXiv 查重、从头独立重证一遍、再建议人类复核。通信内容是"论证/反例/验证结论"，由协调器汇总。

**⑤ OpenAI【未知为主】**：公开的只有 *"agents... subdivided into groups with the ability to communicate within the group"*。组间如何同步、是否有黑板、Codex 是否当汇总中枢——**都是二手，官方没给协议**。你能复刻的只有"分组 + 组内消息 + 共享文件系统"这个抽象。

---

## 2. 把上面收拢成一个心智模型

2026 年真正跑通的是**两种协作架构**：

| | A. 中心编排 + 子 agent | B. 共享产物图（去中心黑板） |
|---|---|---|
| 代表 | Anthropic Claude Code harness；OpenAI groups | Prove2Me（FLT 后半程） |
| 谁定计划 | 一个 coordinator（有 spawn 权者） | **没有**，计划 = 图本身 |
| 任务切分 | coordinator 运行时开子 agent | agent 读 DAG 挑节点 |
| 发现协作对象 | spawn 原语（无限可创建） | 搜索 API + import |
| 通信主通道 | 子 agent 回传消息/文件给 coordinator | 提交到共享图（机器验收） |
| 通信次通道 | 文件系统 | 讨论频道 |
| 何时崩 | 单一 coordinator 记忆退化（FLT 首败） | 多条不一致形式化（用 milestones 治） |

**一句话**：真正的工程创新是把"协作"从"agent 之间的对话"搬到"一个所有 agent 共享、且被机器验证的外部状态"里。**agent 之间尽量不直接通信，而是通过可验证的产物通信。** 所以"怎么决定分享什么"在好系统里几乎不存在——**分享 = 提交，验收 = 编译/内核，发现 = 检索。**

---

## 3. Prove2Me 详解

### 3.1 是什么

Prove2Me 是一个**开源的、面向 AI agent 的数学形式化协作平台**（论文 arXiv:2608.28433，2026-08-28，v2 08-31；作者 Shuze Chen / Kunal Marwaha / Xiaoyang Lu / Henry Yuen / Tianyi Peng，Columbia / UChicago / Purdue）。它要解决的问题是：Lean 4 让"机器验证数学"成为可能，但大规模形式化项目被三类障碍卡住——**审计**（判断形式化是否忠实于原意要靠人，无法随 AI 产出的几十万条定理扩展）、**复用**（GitHub 上形式化库互相紧耦合、难以单独提取复用）、**规模**（几千 agent 的 swarm 依赖单一组织内部算力）。Prove2Me 的目标是：**任何带一个 agent 的人都能参与，把形式化变成"人 + AI 的众包流水线"。**

它在 Anthropic 的 FLT 项目里扮演了关键角色：Anthropic 明说**换成 Prove2Me 之前失败了**，换之后 11 天跑通 1300 万行 Lean。

### 3.2 对象模型：一切围绕"定理卡片"

核心设计是把**语句（statement）与证明（proof）分离**。每条定理是一个不可变对象，**语句只提交一次，证明可以有多个（来自不同 agent）**。

**定理卡片（theorem card）的字段**（论文 §3.1，有据）：

| 字段 | 内容 |
|---|---|
| `Description` | 自然语言说明，agent 被鼓励把"想要表达的意思"写清楚 |
| `Preamble` | **imports 列表**——可导入 Mathlib，也可导入 Prove2Me 上别的定义文件 |
| `Formal statement` | 目标语句的 Lean 4 形式化，**以 `:= by sorry` 占位结尾**（即"这是我要证的，但还没证"） |
| `Source` | 出处（论文/教材链接） |
| `Tags` | 学科分类 |

**证明提交（proof submission）的硬约束**（§3.2）：提交一个名为 `solution` 的定理，其类型与目标**逐字相同**、**不含 `sorry`、不引入任何新公理**（Curry–Howard 对应）。平台编译它、检查类型匹配，通过即接受。**这就是"验收 = 编译 + 类型比对"。**

### 3.3 missions、captain 与审计边界

- **mission** = 一个形式化项目（一篇论文/一章书的"主线目标 + 依赖的定义 + 里程碑引理"）。
- **captain** = 提出 mission 的**人类**。captain 不必会写 Lean——他的 agent 起草 mission 提案，但**审计不能委托**：captain 必须**逐条点击确认**每条核心语句。
- **audited core（受审核心）**：人类只审**目标定理 + 依赖定义 + 里程碑引理**，其余上千条中间引理由 agent 自由生成、不审。为什么成立？因为**可信对象不是 agent 的分解方式，而是内核对"已审语句"的证明的接受**。
- **sub-agent read-back（子代理回读）**：为解决"审语句要懂 Lean"的门槛，派一个**独立审计 agent，只给它 Lean 代码（不给原文）**，让它把 Lean **反向翻译成 LaTeX 数学**并展开所有 binder/假设；人类只需比较"原文语句 vs 回读语句"。论文引述：一类 Lean-as-judge 审计显示**只有约 43% 被证明的语句忠实于原意**（Bourigault et al., 2026）——所以这步不是可选项。

### 3.4 proof-sketches：把难题拆成原子子问题的机制

论文 §4.2 的关键定义：**一个 proof-sketch 是"导入了其他定理（包括尚未被证明的开放定理）的证明"**——它把目标建立在被导入语句之上，把那些语句的证明**推迟**为独立提交。

效果：agent 可以把一道难题拆成"目标 ← 引理 A ← 引理 B…"，每个子问题独立可解、可并行、可由不同 agent 认领。这**同时**就是 §3.8 里 DAG 的生成方式。

### 3.5 milestones：防止去中心化跑偏的锚点

去中心化会撞上"共识失败"两种形态：① 多个 agent 各自形式化同一条引理、语句互不兼容，**并行努力无法累加**；② 某条语句悄悄偏离原文，**污染它上游的一切**（每个 import 它的 proof-sketch 都继承这个错）。milestones 就是解法：**由 captain 从源论文逐字转录的权威引理语句 + 其规范形式化的链接**，且**有序、幂等**（大家各自重述会收敛到同一条）。当所有 milestone 都被证完、并用 proof-sketches 连起来时，目标定理自动解析，mission 完成。

### 3.6 Formalpedia：可检索的复用库 + 激励机制

- 每条语句都强制带**标准化自然语言描述**，平台据此建立**搜索 API**。
- 要求 agent **提交前先搜**：能复用就复用，只有不存在时才新建语句。
- 复用有奖励：**被其他证明 import 的次数越多，贡献分越高**（"平台的引用形式"）。

### 3.7 discussion channel：给人/agent 看的旁路

用于实时发布"进展、中间发现、经验教训"。它是**次级通道**——主通道永远是共享产物图。§1.4③ 的 `gotsman_linial → 反证 → 修正` 例子就发生在"产物图 + 讨论"的配合里。

### 3.8 DAG：包含什么、怎么生成（重点）

Anthropic 官方对 DAG 的定义（FLT 文章原话）：*"Maintaining a **directed acyclic graph (DAG) of theorem statements** that agents used to decide what proofs they should attempt next."*【有据】

**① 节点与边各是什么**

| 元素 | 含义 |
|---|---|
| 节点 | **定理/引理的语句（statement）**，不是证明。一条语句一个节点，可挂多个证明 |
| 边 | **依赖/引用关系**。方向 `A → B` = "证明 A 时导入了 B"（A 依赖 B） |
| 无环 | Lean 禁止循环依赖，所以天然是 DAG |

**② 怎么生成——三步递归**

1. **加节点**：agent 提交一个定理卡片（语句，`sorry` 占位）→ 出现一个新节点；若它是"开放"（未证），就是个待办子目标。
2. **加边 + 制造子目标**：另一个 agent 提交 proof-sketch，其 `Preamble` 里 import 了别的定理 → 每条 import 就是一条边（`被证定理 → 被导入定理`）；import 一个**尚未证明**的定理 = 把它标记为开放节点。
3. **关节点**：某 agent 对该节点提交合法证明（`solution`，无 sorry/新公理）→ 节点关闭。

milestones 是插入在其中的**人工锚点**：它们从源论文逐字转录，保证关键引理的语句"正确且唯一"，防止第 2 步长出互不兼容的平行分支。

**③ 具体长什么样——FLT 项目的实测结构**

第三方 `Lyken17/fermat-last-theorem-viz` 把 `anthropics/fermats-last-theorem` 的依赖关系做了可视化与统计（<https://github.com/Lyken17/fermat-last-theorem-viz>，数据源自 Anthropic 仓库的 `html/data/edges.js` / `meta.js`）：

| 指标 | 数值 |
|---|---:|
| theorem / lemma 节点 | **29,511** |
| 直接 citation 边 | **106,853** |
| 是否为 DAG | 是 |
| 无项目内直接依赖的叶子 | 8,230 |
| 从 `fermat_last_theorem` 沿 citation 可达（含根） | 29,489 |
| 最短路径树最大深度 / 最长依赖链 | 46 / 117 |
| 人工标出的 landmark theorem | 49 |

结构说明（有据）：
- `Theorems/Thm_<name>.lean` 存语句；`P2M/Sol/S_<name>.lean` 存证明，并**通过 import 其他 `Theorems.Thm_*` 文件声明直接依赖**——这些 import 就是 DAG 的边。
- "最短路径树（parent）"是便于总览的**生成树**，**不等于完整 DAG**；完整 DAG 有 106,853 条边。
- 顶层路线（依赖方向从结论指向前置）：

```text
fermat_last_theorem
└── FLT.fermatLastTheorem
    └── FreyPackage.fermatLastTheoremFor_of_five_le
        └── FreyPackage.no_frey_package   ← 主要汇合点
            ├── Mazur_Frey          （Mazur 路线：Frey 曲线模 p 表示的不可约性）
            ├── frey_isModular      （Wiles / Taylor–Wiles：半稳定椭圆曲线模性）
            ├── level_lowering_to_two（Ribet 路线：降层到 Γ₀(2)）
            └── S2_Gamma0_2_eq_zero （S₂(Γ₀(2))=0，导出矛盾）
```

- 三个大分支的传递依赖：Mazur 5,435；模性（Wiles/Taylor–Wiles）**27,797**；降层 27,851；`S₂(Γ₀(2))=0` 为 0。可见**最重的是模性分支**。
- 复用热点：被最多定理引用的节点是 `ModularCurve.transcendental_jqModC`（入边 398）；单条证明 import 最多的是 91 条出边。

**④ DAG 之于 agent 系统，究竟是什么**

它是**把"计划"和"记忆"从 agent 脑子里搬出来的外部数据结构**：既是**待办清单**（开放节点），又是**已办清单**（已证节点），还是**协作协议**（谁能复用谁、谁被谁依赖）。Anthropic 用它"决定下一步证什么"，正是因为它**可查询、可并行、不会忘**。这也回答了 §1.1 的"任务怎么切分"——**不是哪个 agent 聪明到会切分，而是切分被编码成了 import 关系本身。**

### 3.9 边界与风险

- 论文明说"naive sorry-filling 不可扩展"（重编译成本 + 无法原子化），Prove2Me 是为了绕开它。
- **"编译通过"≠"定理成立"**：2026-07 的 Collatz 事件里，AI 反证同时骗过 Lean 内核和独立内核 Nanoda（两个无关 bug 叠加，见 de Moura postmortem：<https://leodemoura.github.io/blog/2026-8-1-postmortem-for-kernel-soundness-bug-14576/>）。
- 论文自承：*"How best to coordinate the decentralized, asynchronous agents... remains an open question."* 去中心化协调仍是研究问题，不是已解决的问题。

---

## 4. 来源

- Anthropic RH：<https://www.anthropic.com/research/riemann-zeta>
- Anthropic FLT：<https://www.anthropic.com/research/formalizing-fermats-last-theorem>
- Prove2Me 论文：<https://arxiv.org/abs/2608.28433>
- FLT 依赖图 atlas：<https://github.com/Lyken17/fermat-last-theorem-viz>
- Anthropic FLT 仓库：<https://github.com/anthropics/fermats-last-theorem>
- OpenAI NS 发布页：<https://openai.com/index/navier-stokes-solution/>（403，转述见 CNBC / Quanta / The Batch）
- Buckmaster 声明：<https://cims.nyu.edu/~tristanb/statement.pdf>
- 本目录姊妹篇：`2026-AI数学突破方法拆解.md`、`AIMO3-方案综述.md`
