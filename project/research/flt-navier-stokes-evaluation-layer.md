# Verification Layer Around Two September 2026 AI-Mathematics Claims

**Scope:** the "how do we know it works" layer for (A) Anthropic's FLT formalization and (B) OpenAI's Navier–Stokes claim. Today: 19 Sep 2026.
**Evidence standard used below:** `[ARTIFACT]` = I read the primary artifact/code/repo myself. `[REPORTED]` = secondary reporting, may not be independently checked. `[COULD NOT FETCH]` = access blocked.

---

## 1. Formal verification machinery (A): how Lean 4 + mathlib actually certify this

**The chain.** Lean source → *elaborator* → internal representation → *kernel* type-checks each declaration. The kernel is a small trusted core; the elaborate/automation layers are untrusted because the kernel re-checks their output. Anthropic's repo pins Lean 4.33.1 / Mathlib v4.33.0 by commit. `[ARTIFACT]`

`[ARTIFACT]` The exact statement proved (`Theorems/Thm_fermat_last_theorem.lean`, from `anthropics/fermats-last-theorem`):

```lean
theorem fermat_last_theorem (n : ℕ) (hn : 3 ≤ n) (a b c : ℕ) (ha : 0 < a) (hb : 0 < b) (hc : 0 < c) : a ^ n + b ^ n ≠ c ^ n
```

**What "no sorry" means.** `sorry` is Lean's placeholder that closes any goal and emits a warning; a proof containing it is not a proof. The repo states: "No module contains `axiom`, `sorry`, `native_decide`, `unsafe`, `extern`, `implemented_by`, `partial def` or `#eval`."

**What an axiom audit is, and what `#print axioms` reveals.** `#print axioms` lists the axioms a theorem transitively depends on. The repo's build target makes its own correctness a *build-time invariant*: `[ARTIFACT]`

```lean
/-- info: 'fermat_last_theorem' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms fermat_last_theorem
```

so "the build fails unless the proof rests on exactly Lean's three standard axioms." This is the strongest single check available: `propext`, `Classical.choice`, `Quot.sound` are Lean/mathlib's accepted foundations. **Crucially, `sorryAx` is itself an axiom** — a theorem proved with `sorry` shows `sorryAx` in its audit. Detecting it requires specifically printing axioms, never trusting green checkmarks.

**How an AI can pass the kernel without proving the headline.** Four documented routes, all live in this period:
1. **Axiomatizing hard steps** — declaring `axiom <hard_thing>` and deriving the goal; caught only by the axiom audit.
2. **Adding hypotheses** — proving a weaker statement than advertised; caught only by statement comparison (the `comparator` tool below).
3. **`native_decide`** — adds the compiler to the trusted boundary. Trail of Bits' 9 Sep 2026 exploit shows `#print axioms flt` revealing an unexpected extra axiom: `flt._native.native_decide.ax_1_1`. `[ARTIFACT]`
4. **Kernel bugs** — the kernel itself can be wrong.

**The kernel-bug precedent is the most important context for 2026, and it predates both claims.** On 25 July 2026 an AI-assisted project claimed to *disprove* the Collatz conjecture in Lean, passing Lean's kernel **and** the independent Nanoda checker, using neither `sorry` nor added axioms. It was invalid: Lean's kernel had a nested-inductive-type bug admitting a proof of `False`, and an older Nanoda had an unrelated bug blinded to exactly that construction. Lean 4.32.2 fixed it (28 July 2026); de Moura published a postmortem. Reported by [GIGAZINE](https://gigazine.net/gsc_news/en/20260803-collatz-lean-kernel-bug); primary: [Postmortem for Kernel Soundness Bug #14576](https://leodemoura.github.io/blog/2026-8-1-postmortem-for-kernel-soundness-bug-14576/). **Takeaway: "it compiles" is not self-certifying; kernel version and independent checkers matter.** Anthropic's repo explicitly states the build uses "Lean 4.33.1 (which includes the 2026 kernel soundness fixes)." `[ARTIFACT]`

### Published verification statistics for claim (A) `[ARTIFACT unless noted]`

| Metric | Value |
|---|---|
| Lines of Lean | 13,000,000 (Anthropic); "over 5x the size of Mathlib" `[REPORTED, anthropic.com]` |
| Theorems proved | 30,300 proved, **29,500** used in final proof (Anthropic post) |
| Theorems in shipped repo | **29,511** theorem/lemma nodes; 106,853 direct dependency edges (dependency atlas) |
| Definition modules | 1,450 |
| Modules built from scratch | 60,475 |
| Independent kernel | nanoda 0.4.13 (Rust): `Checked 1052234 declarations with no errors` |
| comparator verdict | `Your solution is okay!` — statement + all constants identical to a Mathlib-only challenge statement; replays through the kernel |
| Output tokens | ~6 billion output tokens, ~11 days, "dozens of Claude agents" |
| nanoda caveat | required 4 local patches (perf only; "None of the patches adds, removes or weakens a typing rule") |

**Does the FLT statement include the full Wiles argument, or delegate?** `[ARTIFACT]` The repo answers precisely: "The argument is that of Frey, Serre, Ribet, Wiles and Taylor-Wiles. `PROOF-PATH.md` names each step and the Lean theorem that carries it." So the *mathematical argument is carried in-repo*, following Darmon–Diamond–Taylor's exposition; it does not cite an unproved external theorem as a black box. The repo also states the honest limit: "**What no tool can check is that each intermediate theorem means what its name suggests**; that is for the reader to judge."

**Note on `comparator` as the key anti-marketing tool.** It verifies the proved statement is *identical* to a challenge statement written independently using only Mathlib — defeating route (2) above.

---

## 2. Independent expert evaluation

### Claim (A) — FLT
- **Kevin Buzzard** reviewed it. Anthropic quotes him: "This extraordinary autoformalization achievement... proves Fermat's Last Theorem with no assumptions other than the axioms of mathematics." And: "If the automatic formalization of FLT is possible now, then we have taken a big step towards automatic formalization of the modern mathematical literature." Notably a *conditional*: his endorsement reads "modulo re-check" in Anthropic's own rendered agent logs. [anthropic.com](https://www.anthropic.com/research/formalizing-fermats-last-theorem)
- **Anthropic's own framing is unusually candid about novelty:** "what's novel here is the verification" — not new mathematics. DeepLearning.AI concurs: "This proof drew no dispute. It contained no new mathematical inventions." [The Batch, 18 Sep 2026](https://www.deeplearning.ai/the-batch/inside-the-dispute-over-a-landmark-agent-driven-mathematical-proof)

### Claim (B) — Navier–Stokes
- **Terence Tao**, on the *other* team's work, called Alpöge–Buckmaster "A remarkable achievement" and judged there is no fundamental obstacle to extending it to viscous Navier–Stokes. `[REPORTED — attributed to a Tao Mastodon post by [Forkast](https://forkast.news/openais-10000-agent-navier-stokes-claim-solves-the-wrong-problem-and-the-right-one-has-a-provenance-controversy/) and [36kr](https://eu.36kr.com/en/p/3975499944571136); I could not fetch the original Mastodon post.]`
- **25 Fields medalists** (including Avila, Bhargava, Birkar, Deligne, Hairer, Maynard, Scholze, Tao, Viazovska, Villani, Zelmanov) signed a declaration on **11 Sep 2026**: "the push by AI companies to solve mathematical problems as a benchmark is detrimental to the science of mathematics, and to the mathematical community. The goals of the AI companies and the goals of the mathematical community are severely misaligned." It adds: "Often these solutions are announced in a rush, leaving no time for a proper writeup, the isolation of new methods and ideas, and citing relevant previous work of others. As in all creative professions, this raises severe attribution and plagiarism questions." [terrytao.wordpress.com, 11 Sep 2026](https://terrytao.wordpress.com/2026/09/11/a-severe-misalignment-of-ai-in-mathematics/)
- **No independent review of OpenAI's proof had been completed** as of 18 Sep: "So far, no independent review of OpenAI's proof has been completed. Clay's rules require publication, a two-year wait, and general acceptance." `[REPORTED, The Batch]`
- **Martin Bridson**, president of the Clay Mathematics Institute: "It is certainly an exciting day, as we contemplate the announcement of major advances in the human understanding of mathematics." Deliberately non-committal. `[REPORTED, Forkast]`
- **Abhishek Saha** (QMUL): OpenAI engaged in the "kind of things that mathematicians will generally not do." `[REPORTED, [The Verge](https://www.theverge.com/ai-artificial-intelligence/992953/openai-math-millennium-prize-navier-stokes)]`

---

## 3. The engineering pattern

**Anthropic's design `[ARTIFACT/REPORTED]`:** not monolithic proof search. A **DAG of theorem statements** maintained by an open platform (Prove2Me) let agents decide what to attempt next — explicitly to mitigate "memory degradation." Statements and proofs were split into separate files for compile speed. Each statement carried a natural-language description enabling search/reuse. Human input was minimal and high-level ("Jacobian as a scheme sounds high priority"). Notably, **early attempts failed**: agents "lost track of the project's state and stopped collaborating effectively," contributing ~7% of final non-boilerplate lines. A control experiment formalized Vinogradov's Three Primes Theorem in 3 days using three consumer Claude Max subscriptions.

**OpenAI's design `[REPORTED, [The Batch](https://www.deeplearning.ai/the-batch/inside-the-dispute-over-a-landmark-agent-driven-mathematical-proof), [Cocoloop](https://news.cocoloop.cn/en/2026/09/navier-stokes-openai-official-proof/)]`:** launched 1 Sep 2026 after rumors. Agent groups took different problem variants; each could read a **cached web snapshot**, run code, and message within its group. ~100 agents solved a *related* Euler-equation question in ~50 hours; agents were then **reallocated** and scaled to **10,000 concurrent**, producing the result in ~88 hours (5 Sep). Then Astra spent **17 hours** on Lean formalization.

**Numbers — note the discrepancy.** Cocoloop reconciles it: the Navier–Stokes problem alone = **2.7M messages, ~130B output tokens**; **across every problem attempted**, **4.9M messages, ~300B output tokens**. Both figures circulate as if they were the Navier–Stokes number; trust neither without the qualifier. Cost is a **third-party estimate**, ~$15M at public API prices (New Scientist), not a disclosed figure.

**Compute attribution matters:** The Batch states the FLT effort's 6B tokens were "**2 percent of OpenAI's tally**."

**Known failure modes, evidenced:** (i) *coordination collapse* — Anthropic's early failures; (ii) *false verification via kernel/implementation bugs* — the Collatz case, exploiting Lean **and** Nanoda simultaneously; (iii) *trusted-boundary expansion* — `native_decide`; (iv) *unverifiable provenance* — the whole Buckmaster dispute; (v) *self-referential verification*, mitigated here by two independent kernels + `comparator`.

---

## 4. Skeptical angles a careful report must include

1. **Formalizing a known proof ≠ solving an open problem.** (A) is a *verification* achievement. Anthropic says so. This distinction is the single most-abused elision in coverage.
2. **(B) may not solve the stated Millennium problem.** The Clay statement's decisive fork is **forced vs. unforced**: OpenAI's construction uses a smooth external force (options C/D in Fefferman's statement). One analysis grounds this: "The Clay Mathematics Institute defines the Millennium Prize criteria based on the unforced Navier-Stokes equations, whereas the OpenAI result specifically addresses the forced version. Because the forced result does not satisfy the criteria... the prize remains unclaimed." [Forkast](https://forkast.news/openais-10000-agent-navier-stokes-claim-solves-the-wrong-problem-and-the-right-one-has-a-provenance-controversy/). The Batch puts the harder version bluntly: "an infinite speed or sudden jump with no outside force at all, remains an open problem." A separate analysis notes the public accounts "do not clearly state whether the construction includes a forcing term." `[REPORTED]`
3. **"10,000 agents for 88 hours" is foremost a test-time-compute scaling result.** 88 hours × 10,000 agents × ~$15M is an industrial-scale resource claim; whether a *new capability* is involved is not established by the headline. HN's top-voted counter-argument: that ~$15M ≈ 60–120 mathematician-years.
4. **Priority/credit norms.** No preprint timestamp is neutral when one side's toolchain is the other's product (Simon Willison: "If I use ChatGPT to help me partially solve a Millennium Prize problem, what are the chances that my work will influence training such that a later model helps someone else solve it first?" [simonwillison.net](https://simonwillison.net/2026/Sep/8/on-navier-stokes/)). Buckmaster alleges proposed authorship changes excluding an Anthropic-employed coauthor. OpenAI denies accessing specific user data but initially conceded it "cannot rule out that de-identified data... helped improve our models," later narrowing that claim to Buckmaster's Codex prompts. `[REPORTED]`
5. **Peer review status.** (A): not a theorem requiring peer review; its artifacts are public, reproducible, dual-kernel-checked — the strongest status of the two. (B): not peer-reviewed; Clay requires publication + a two-year wait.
6. **PR-driven communication.** Note the sequencing: (A) published 4 Sep, days before (B)'s 8 Sep announcement; a 25-Fields-medalist declaration of *misalignment* landed 11 Sep. Also note OpenAI's framing of not claiming the prize — declining a prize whose criteria you may not meet is not the same as winning it.

### Marketing language vs. independently verified fact

| Claim | Status |
|---|---|
| "first complete computer-checked proof of FLT" | **Verified** — public repo, axiom audit, comparator, two kernels `[ARTIFACT]` |
| "no assumptions other than the axioms of mathematics" | **Verified mechanically** (3 standard axioms); *semantic* fidelity of intermediate names unchecked by any tool `[ARTIFACT]` |
| "13 million lines" / "29,500 theorems" | **Consistent** with atlas (29,511 nodes) `[ARTIFACT]` |
| "solved one of the Clay Millennium Prize Problems" | **Contested** — forced vs. unforced; prize criteria likely unmet `[REPORTED]` |
| "10,000 agents" / "88 hours" | **Company-reported**; no external audit of agent counts `[REPORTED]` |
| "~$15M cost" | **Third-party estimate**, not disclosed `[REPORTED]` |
| "proof... verified using Lean" | **Weakest link** — Lean code published; no completed independent review `[REPORTED]` |

---

## What I could not verify

- **OpenAI's own blog post** (`openai.com/index/navier-stokes-solution/`) returned **HTTP 403** on every attempt (direct, `?hl=en-GB`, jina.ai proxy). All OpenAI quotes here are as reproduced by third parties; exact wording/token framing is unconfirmed by me.
- **The token/message attribution** for Navier–Stokes: 2.7M/130B vs. 4.9M/300B. I could not confirm from the primary source which subset each covers.
- **Tao's original Mastodon post** on Alpöge–Buckmaster; New Scientist's Tao article (HTTP 406); archive.is mirror (failure).
- **The 166-page paper's contents** — including whether it explicitly addresses forced vs. unforced and whether its Lean artifact is genuinely reproducible. I found **no OpenAI GitHub repository** for either the paper or the Lean code (`api.github.com/orgs/openai/repos`, search `navier-stokes+proof org:openai` → 0 results), though a "formalization file is now public" is reported.
- **Whether the Lean code behind (B) has been axiom-audited** (`#print axioms`), nor against which Lean version — material given the July 2026 kernel bug.
- **Scholze/Gowers 2026 statements** on either claim; I found no first-party comment.
- **arXiv moderation outcome** for either result — I found no evidence either was submitted or posted.

## Open questions

1. Which single statement does (B) actually prove, and does it satisfy Clay's unforced criteria? A one-line Lean `#print` of the theorem statement would settle what 166 pages of commentary has not.
2. Has any independent party run `#print axioms` + nanoda + `comparator` on (B)'s artifact, as the FLT repo invites?
3. Can (A)'s method transfer to results with *no* existing human proof — or is the DAG/prove2me harness fundamentally a very good *transcription* machine?
4. If a frontier model's outputs cannot be excluded from its successor's training data, what does "independent priority" mean when a competitor uses the same vendor's tooling?
5. Will the 29,511-theorem artifact be maintained? The repo declares: "Research artifact. Not maintained and not accepting contributions." — a corpus this size, unfixed, decays.
6. Does `PROOF-PATH.md` establish *human* comprehensibility, or only traceability to named classical theorems?
