# demo-clean vs demo-fixed —— 题面损坏如何把"答对"变成"答错"

> 运行：`node run-phase4.mjs --config C --dataset aimo3 --ids aimo3-ref-02 --k 1 --tag demo-{clean,fixed}`
> 日期：2026-09-28 · 结果：`eval/phase4-results-demo-clean.json` / `phase4-results-demo-fixed.json`，日志同名 `.log`
> 结论一句话：**两次运行的唯一差别是数据集里的题面文本**；13 人团队的"错"不是推理错，而是**题面保真**问题——
> 它答的 `100` 恰好等于 `520 mod 105`，即按被损坏的题面它完全正确。

## 1. 两次运行的对照

| | `demo-clean` | `demo-fixed` |
|---|---|---|
| 配置 | C（团队，coordinator + 12~13 solvers/critic） | C（同） |
| 题目 | `aimo3-ref-02`（500×500，周长互异，最大 k） | 同 |
| 数据集里的运算 | **`K mod 105`**（PDF 文本层丢了上标：`10^5` → `105`） | **`K mod 10⁵`**（已修） |
| 官方答案（判分基准） | 520 | 520 |
| 团队提交 | **100** | **520** |
| 判定 | ❌ `wrong_answer` | ✅ `correct` |
| 墙钟 | 720 s | 620 s |
| 输入 / 输出 token | 557,446 / 1,295,728 | 645,486 / 1,110,796 |
| cache-read / reasoning | 10,041,600 / 1,186,090 | 12,923,136 / 981,228 |
| 团队规模 | 13 teammates | 12 teammates |

## 2. 关键点：`100` 不是错答案

`520 mod 105 = 100`。

也就是说：**按题面实际写的内容（`mod 105`），团队给出的 100 是正确答案**。判它错，是因为判分基准用的是官方答案（按 `mod 10^5` 的 520）。
这不是"模型不会做"，而是**题面在数据链路里被改写了**：

```
PDF 文本层（丢上标）→ aimo3-reference.json（statement_quality: "clean"，未被人工复核）
   → prompt → 13 人团队（正确地做了一道不一样的题）→ 100
                                   ↓ 与官方 520 比对
                              wrong_answer
```

注意 `statement_quality` 当时标的是 `clean` —— **质量标记本身也会骗人**：坏了的那一版被标成干净，
于是没人复看。修复后该题面才是真正的 `clean`。

## 3. 对项目结论的意义

1. **强验收器（L0 格式/范围）永远发现不了这类错误**：`100` 是合法整数、在 `[0, 99999]` 内、`\boxed{}` 格式完美。
   验收器强度再高，也无法给"题面被改写"兜底——这类错误只能靠**语句对齐**（FLT 评估层的 comparator 铁律）拦住。
2. **这正是 Prove2Me 的 `read-back`（反向复述）要防的东西**：让 agent 复述它理解的题面，就能在花掉 130 万 token 之前
   发现"被要求算的是 `mod 105`"。对应的工程动作是 `project/docs/Deep_Improvement_Plan.md` 里的 T2/T10（milestones / 语句锚点）。
3. **口径纪律补充**：`eval/phase4-p2-report.md` 里 520 那类"团队解出"的结论，必须同时记录**用的是哪一版题面**；
   否则同一个 tag 下的 pass@k 数字可能跨越了不同的题面版本，不可比。

## 4. 复现

```sh
node eval/run-phase4.mjs --config C --dataset aimo3 --ids aimo3-ref-02 --k 1 --tag demo-clean
# 把 eval/aimo3-reference.json 里 ref-02 的 "mod 10⁵" 改回 "mod 105" 后重跑即得 clean 组的行为
```

> 数据集修复来自 `eval/aimo3-reference.json` 中 `aimo3-ref-02.statement` 的订正（2026-09-28 20:43，工坊侧）。
