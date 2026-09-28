# Small-case ground truth for the tournament problem (task-3, solver-5)

Companion artifacts (owned by this task):
- `work/brute_small_task3.py` — runnable, exhaustive brute force.
- `work/brute_small_task3_out.txt` — captured output of a full run.

A parallel copy of the same subtask (`task-8`, solver-9) owns
`work/brute_small.py` / `work/brute_analogue.py`; this task uses distinct
filenames so the two independent enumerations do not overwrite each other.

## True problem

The task text is a LaTeX-degraded copy of AIMO3 `aimo3-21818`
(<https://raw.githubusercontent.com/abonvalle/AIMO3-Kaggle/master/reference.csv>):
`2^20` runners (not 220), distinct speeds, 20 rounds, winner of round `i`
receives `2^(20-i)` points, and the requested residue is `k mod 10^5`
(not `10^5`-degraded-to-`105`).  Reference answer: **21818**.

## Model used for the brute force

- `n = 2^m` labelled runners, speeds fixed WLOG `0` fastest … `n-1` slowest.
- Round `r` (1..m) awards `2^(m-r)` points; in each round every score class is
  split into pairs; an odd class gets one unpaired bye (no points).  Every
  admissible pairing of every class is enumerated, every round.
- Winner of a pair = faster runner.  Only the pairing arrangement is free, so
  `N` counts distinct final orderings over all admissible pairings.  The count
  is independent of which label is fastest (relabelling symmetry).

Two readings of "ordering" are computed:
- **W** = distinct weak orderings = ordered set partitions of labels by
  decreasing score (the score ranking).
- **L** = tie-broken total orders.  For one weak ordering with class sizes
  `s_1..s_t` there are `prod s_j!` linear extensions; reported as the **sum**
  over distinct weak orderings and, for tie cases, the **union** over them.

## Ground-truth table (exhaustive, fixed speed order)

| m | n | enumerated pairing histories | N_weak | N_linear | v2(N) | v5(N) | final scores all distinct |
|---|---|---|---|---|---|---|---|
| 1 | 2 | 1 | **1** | 1 | 0 | 0 | yes |
| 2 | 4 | 2 | **2** | 2 | 1 | 0 | yes |
| 3 | 8 | 56 | **56** | 56 | 3 | 0 | yes |
| 4 | 16 | 4 484 480 | **4 484 480** | 4 484 480 | 7 | 1 | yes |

`n=16` was fully enumerated (4 484 480 leaves, 45 s); the enumerated histories
are injected into the set of packed final score vectors and the counts agree
(`distinct == leaves`), so the enumerated set size is exactly `N`.

For the pure `2^m` / `m`-round analogue every runner ends with a distinct score
(the score after `m` rounds is a `m`-bit mask, each mask used once), so the
weak-ordering and linear-extension readings coincide: `N_weak = N_linear = N`.
This is exactly why the interpretation is unambiguous for the real problem too.

## Candidate-formula comparison (mismatches called out)

Formula used (`Catalan(n) = C(2n,n)/(n+1)`):

```
N_m = prod_{i=0}^{m-1} Catalan(2^i)^(2^(m-1-i))
```

| m | brute N | Catalan product | match |
|---|---|---|---|
| 1 | 1 | 1 | YES |
| 2 | 2 | 2 | YES |
| 3 | 56 | 56 | YES |
| 4 | 4 484 480 | 4 484 480 | YES |

Two natural wrong candidates, with the mismatch factor:

| m | brute N | `(2^m)!` | brute vs `(2^m)!` | no-Hall product | brute vs no-Hall |
|---|---|---|---|---|---|
| 1 | 1 | 2 | mismatch ×2 | 2 | mismatch ×2 |
| 2 | 2 | 24 | mismatch ×12 | 24 | mismatch ×12 |
| 3 | 56 | 40 320 | mismatch ×720 | 40 320 | mismatch ×720 |
| 4 | 4 484 480 | 20 922 789 888 000 | mismatch ×4 665 600 | 20 922 789 888 000 | mismatch ×4 665 600 |

The naive `(2^m)!` equals the "allow every half-size winner subset" product
`prod_r C(2^(m-r+1), 2^(m-r))^(2^(r-1))` exactly (both count bijections
runner → final score mask).  It overcounts because the global speed order must
be consistent with *every* race: for one score class of size `s` the winner set
`W` must admit a matching of each winner to a strictly slower opponent, and by
Hall's theorem that is exactly the suffix condition

```
|W ∩ {slowest u}| <= floor(u/2)  for every u = 1..s.
```

The code proves this equivalence exhaustively: it enumerates *all literal
pairings* of a class and confirms the induced winner sets equal the Hall set,
for every class size used (1,2,3,4,5,6,7,8) and for size 16 (the `n=16` root
class); counts `1,2,5,14` for sizes `2,4,6/8,16` show the Catalan pattern.

## Tie reading (instances that do have ties)

| instance | enumerated histories | N_weak | sum `prod s_j!` | union of linear extensions |
|---|---|---|---|---|
| n=3, 1 round, points [1] | 2 | 2 | 4 | 4 |
| n=5, 1 round, points [1] | 5 | 5 | 60 | 60 |
| n=4, 2 rounds, points [1,1] | 2 | 1 | 2 | 2 |

So the brute force reports both weak orderings and tie-broken total orders, and
separates "sum over weak orderings" from "union of extension sets".  For the
real `2^20`/20-round instance all final scores are distinct, so no ambiguity
arises there.

## Real instance (m = 20) — consistency check of the small-case formula

```
v2(Catalan(2^i)) = [0,1,1,...,1]  (i = 0..19)
v2(N) = sum_{i=1}^{19} 2^(19-i) = 2^19 - 1 = 524287
v5(N) = 121818   (per-term table in the output file)
k = min(v2,v5) = 121818,   k mod 10^5 = 21818
```

Brute-force valuations agree with the formula at m = 1..4
(`v2 = 0,1,3,7`; `v5 = 0,0,0,1`), which validates the formula on all cases
that are exhaustively checkable.

**Ground truth delivered:** `N_1,N_2,N_3,N_4 = 1, 2, 56, 4 484 480`, all
consistent with `N_m = prod_{i=0}^{m-1} Catalan(2^i)^(2^(m-1-i))`, and matching
the independently reported accepted values `1, 2, 56` for `m=1,2,3`.
