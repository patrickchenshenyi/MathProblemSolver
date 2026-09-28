#!/usr/bin/env python3
"""Exhaustive small-case ground truth for the AIMO tournament problem (task-3).

Owned by solver-5.  Lives at work/brute_small_task3.py to avoid clobbering the
parallel copy at work/brute_small.py owned by solver-9 (subject group
"small-case-ground-truth"); both produce the same ground truth independently.

True problem (the state text was a LaTeX-degraded copy of AIMO3 aimo3-21818):
  A tournament is held with 2^20 runners, each with a different running speed.
  In each race the faster runner always wins.  There are 20 rounds; every runner
  starts at score 0.  In each round the runners are paired so that both members
  of a pair have the same score at the start of the round.  The winner of a race
  in round i receives 2^(20-i) points, the loser 0.  At the end the competitors
  are ranked by score; N is the number of possible final orderings and k is the
  largest positive integer with 10^k | N.  Asked: k mod 10^5.

This file produces ground truth for the analogous small instances
n = 2^m runners, m rounds, round r awarding 2^(m-r) points (r = 1..m),
by EXHAUSTIVE enumeration of every admissible pairing arrangement.

Model and conventions
---------------------
* Runners are labelled 0..n-1 with FIXED speeds: runner 0 fastest, runner n-1
  slowest.  The pairing arrangement of each round is the only free input, so N
  counts distinct final orderings over ALL admissible pairings.  The count is
  independent of which label is fastest (relabelling symmetry), which is why
  WLOG label 0 is fastest.
* At the start of a round the runners are partitioned into score classes
  (equal current score).  A class of even size is split into pairs; a class of
  odd size is split into pairs plus one unpaired "bye" runner (bye earns
  nothing).  Every admissible pairing of every class is enumerated.
* In a pair the faster runner wins and gains the round's points.

Readings of "ordering":
  (W) weak order / score ranking: the ordered set partition of labels by
      decreasing final score.  This is N_weak.
  (L) tie-broken total orders: every weak ordering with score-class sizes
      s_1..s_t has prod_j s_j! linear extensions.  Two natural counts are
      reported for tie-producing instances: the sum over distinct weak
      orderings (reading "ordering + arbitrary tie-break", counted per weak
      order) and the UNION over distinct weak orderings of their linear
      extensions (reading "any total order consistent with some outcome").
  For the pure 2^m / m-round analogue all final scores are distinct, so (W)
  and (L) coincide and the interpretation is unambiguous.

Exhaustiveness / equivalence lemma (verified in code)
-----------------------------------------------------
For one score class C (|C| = s, members listed fastest..slowest as positions
0..s-1) only the winner set W matters for the future: W determines the scores
and the next round's classes.  Enumerating ALL matchings of C and keeping the
induced winner set yields exactly

  { W subset of {0..s-1} : |W| = floor(s/2) and for every suffix of size u,
    #(W in that suffix) <= floor(u/2) }                            (Hall cond.)

Proof sketch: we need an injective map winner -> strictly slower non-winner
(the single unmatched non-winner, when s is odd, is the bye), which is a
bipartite matching problem; Hall's tight sets are the suffixes.  Conversely any
pairing induces such a W.  validate_equivalence() checks both enumerations are
identical for every class size used here, including size 16 (root class of the
n=16 instance).

This Hall restriction is exactly why N is a product of Catalan numbers and NOT
(2^m)!: not every assignment of winners/permutation is realizable, because the
global speed order has to be consistent with every race.

Runtime: n<=8 well under a second; n=16 is ~4.5e6 enumerated pairing histories
and takes a couple of minutes in CPython.
"""

from __future__ import annotations

import itertools
import sys
import time
from functools import lru_cache
from math import comb, factorial


# --------------------------------------------------------------------------
# 1. Pairing / winner-set machinery
# --------------------------------------------------------------------------

def all_matchings(items):
    """Yield every perfect matching of the sequence `items` as a list of pairs."""
    if not items:
        yield []
        return
    first, rest = items[0], items[1:]
    for k in range(len(rest)):
        other = rest[k]
        remaining = rest[:k] + rest[k + 1:]
        for sub in all_matchings(remaining):
            yield [(first, other)] + sub


def winner_sets_by_matching(s):
    """Winner sets reachable by literally enumerating all pairings of a class
    of size s.  Positions 0..s-1 are fastest..slowest; a pair's winner is its
    faster (smaller) position; odd s additionally chooses which runner is the
    bye."""
    out = set()
    positions = list(range(s))
    if s % 2 == 0:
        for matching in all_matchings(positions):
            out.add(frozenset(min(a, b) for a, b in matching))
    else:
        for bye in positions:
            rest = [x for x in positions if x != bye]
            for matching in all_matchings(rest):
                out.add(frozenset(min(a, b) for a, b in matching))
    return out


@lru_cache(maxsize=None)
def valid_winner_sets(s):
    """Hall-condition winner sets for a class of size s (tuple of frozensets)."""
    k = s // 2
    out = []
    for W in itertools.combinations(range(s), k):
        Wset = set(W)
        count = 0
        ok = True
        for u in range(1, s + 1):          # suffix of the u slowest positions
            if (s - u) in Wset:
                count += 1
            if count > u // 2:
                ok = False
                break
        if ok:
            out.append(frozenset(W))
    return tuple(out)


def validate_equivalence(sizes=(1, 2, 3, 4, 5, 6, 7, 8, 16), verbose=True):
    """Prove by exhaustion that pairing enumeration == Hall condition."""
    for s in sizes:
        a = winner_sets_by_matching(s)
        b = set(valid_winner_sets(s))
        if a != b:
            raise AssertionError(
                f"equivalence FAILED for class size {s}: "
                f"matchings {len(a)} vs Hall {len(b)}")
        if verbose:
            print(f"  class size {s:2d}: |W from all pairings| = |Hall W| = "
                  f"{len(a)}")
    if verbose:
        print("  equivalence lemma verified exhaustively for sizes", sizes)


# --------------------------------------------------------------------------
# 2. Exhaustive tournament enumeration
# --------------------------------------------------------------------------

def simulate(n, points, collect_weak=True, dedup_pack_bits=None):
    """Exhaustively enumerate all admissible pairings, round by round.

    Returns dict with keys:
      leaves        number of pairing histories == number of final outcomes
      weak          set of weak orderings (ordered score classes)
      n_weak        number of distinct weak orderings
      n_linear      sum of prod(class size!) over distinct weak orderings
      distinct_pack number of distinct packed final score vectors (if requested)
      all_scores_distinct  whether every runner ends with a different score
    """
    m = len(points)
    scores = [0] * n
    leaves = 0
    weak = set()
    n_linear = 0
    packed = set() if dedup_pack_bits else None
    all_distinct = True

    def groups():
        d = {}
        for i, sc in enumerate(scores):
            d.setdefault(sc, []).append(i)
        return [tuple(v) for v in d.values()]   # labels ascending within class

    def rec(r):
        nonlocal leaves, n_linear, all_distinct
        if r == m:
            leaves += 1
            order = sorted(range(n), key=lambda i: (-scores[i], i))
            classes = []
            cur = [order[0]]
            last = scores[order[0]]
            for i in order[1:]:
                if scores[i] == last:
                    cur.append(i)
                else:
                    classes.append(tuple(cur))
                    cur = [i]
                    last = scores[i]
            classes.append(tuple(cur))
            if len(classes) != n:
                all_distinct = False
            if collect_weak:
                key = tuple(classes)
                if key not in weak:
                    weak.add(key)
                    mult = 1
                    for c in classes:
                        mult *= factorial(len(c))
                    n_linear += mult
            if packed is not None:
                bits = dedup_pack_bits
                v = 0
                for i, sc in enumerate(scores):
                    v |= sc << (bits * i)
                packed.add(v)
            return

        p = points[r]
        classes = groups()
        options = [valid_winner_sets(len(c)) for c in classes]
        for combo in itertools.product(*options):
            touched = []
            for c, W in zip(classes, combo):
                for pos in W:
                    idx = c[pos]
                    scores[idx] += p
                    touched.append(idx)
            rec(r + 1)
            for idx in touched:
                scores[idx] -= p

    rec(0)
    union = None
    if collect_weak and n <= 6:
        # Number of total orders that are a linear extension of AT LEAST ONE
        # reachable weak ordering (ties broken arbitrarily).  This is a UNION,
        # which can be smaller than the sum over weak orderings of prod s_j!.
        union = set()
        for classes in weak:
            for perm in itertools.permutations(range(n)):
                pos = [0] * n
                for i, x in enumerate(perm):
                    pos[x] = i
                good = True
                for A, B in zip(classes, classes[1:]):
                    if max(pos[a] for a in A) > min(pos[b] for b in B):
                        good = False
                        break
                if good:
                    union.add(perm)
        union = len(union)
    return {
        "leaves": leaves,
        "weak": weak,
        "n_weak": len(weak) if collect_weak else None,
        "n_linear": n_linear if collect_weak else None,
        "n_union": union,
        "distinct_pack": len(packed) if packed is not None else None,
        "all_scores_distinct": all_distinct,
    }


# --------------------------------------------------------------------------
# 3. Candidate formulas
# --------------------------------------------------------------------------

def catalan(n):
    return comb(2 * n, n) // (n + 1)


def formula_catalan_product(m):
    """Conjectured intended count: prod_{i=0}^{m-1} Catalan(2^i)^(2^(m-1-i))."""
    prod = 1
    for i in range(m):
        prod *= catalan(2 ** i) ** (2 ** (m - 1 - i))
    return prod


def formula_no_hall(m):
    """Count when every half-size winner subset is allowed (wrong: ignores the
    global speed-order consistency / Hall condition)."""
    prod = 1
    for r in range(1, m + 1):
        cls = 2 ** (m - r + 1)
        nodes = 2 ** (r - 1)
        prod *= comb(cls, cls // 2) ** nodes
    return prod


def vp_fact(p, n):
    """p-adic valuation of n! (Legendre)."""
    s = 0
    while n:
        n //= p
        s += n
    return s


def vp_int(p, n):
    """p-adic valuation of the integer n."""
    if n == 0:
        return 0
    s = 0
    while n % p == 0:
        n //= p
        s += 1
    return s


def vp_catalan(p, n):
    """v_p(Catalan(n)) = v_p((2n)!) - 2 v_p(n!) - v_p(n+1)."""
    return vp_fact(p, 2 * n) - 2 * vp_fact(p, n) - vp_int(p, n + 1)


def vp_N_formula(p, m):
    return sum(2 ** (m - 1 - i) * vp_catalan(p, 2 ** i) for i in range(m))


def valuations(x):
    return vp_int(2, x), vp_int(5, x)


# --------------------------------------------------------------------------
# 4. Reporting
# --------------------------------------------------------------------------

def main():
    t0 = time.time()
    print("=" * 78)
    print("Exhaustive small-case ground truth for the tournament problem")
    print("=" * 78)

    print("\n[0] Equivalence lemma: all pairings vs Hall condition")
    validate_equivalence((1, 2, 3, 4, 5, 6, 7, 8, 16))

    print("\n[1] Main analogue: n = 2^m runners, m rounds, round r worth 2^(m-r)")
    print("    (exhaustive over all admissible pairings; WLOG fixed speed order)")
    print(f"    {'m':>2} {'n':>4} {'leaves':>12} {'N_weak':>12} "
          f"{'N_linear':>12} {'v2':>6} {'v5':>5} {'all_distinct':>12} {'time':>7}")
    rows = []
    for m in range(1, 5):
        n = 2 ** m
        points = [2 ** (m - 1 - i) for i in range(m)]
        t = time.time()
        # Storing 4.5e6 nested-tuple weak orderings for n=16 is needless memory:
        # for m>=4 the final scores are all distinct, so the packed final score
        # vector is a bijective encoding of the ordering.  Count that set.
        do_weak = (m <= 3)
        res = simulate(n, points, collect_weak=do_weak, dedup_pack_bits=m)
        dt = time.time() - t
        if do_weak:
            N = res["n_weak"]
            Nlin = res["n_linear"]
        else:
            N = res["distinct_pack"]
            Nlin = N
        v2, v5 = valuations(N)
        rows.append((m, n, res, v2, v5, N, Nlin))
        print(f"    {m:>2} {n:>4} {res['leaves']:>12} {N:>12} "
              f"{Nlin:>12} {v2:>6} {v5:>5} "
              f"{str(res['all_scores_distinct']):>12} {dt:>6.1f}s"
              f"   (dedup distinct={res['distinct_pack']})")
        assert res["all_scores_distinct"], "score tie in the pure analogue!"
        assert res["distinct_pack"] == res["leaves"], "pairing histories collide!"
        assert res["distinct_pack"] == N

    print("\n[2] Comparison table: brute N vs candidate formulas")
    print(f"    {'m':>2} {'n':>4} {'brute N':>14} {'Catalan product':>16} "
          f"{'match?':>7} {'(2^m)!':>20} {'no-Hall count':>16} {'match?':>7}")
    for (m, n, res, v2, v5, N, Nlin) in rows:
        fc = formula_catalan_product(m)
        ffact = factorial(n)
        fnh = formula_no_hall(m)
        print(f"    {m:>2} {n:>4} {N:>14} {fc:>16} {str(N == fc):>7} "
              f"{ffact:>20} {fnh:>16} {str(N == fnh):>7}")
        print(f"        brute == Catalan-product: {N == fc}; "
              f"brute == (2^m)!: {N == ffact}; "
              f"brute == no-Hall: {N == fnh}")
        if N != fc:
            print(f"        !!! MISMATCH vs Catalan product m={m}: "
                  f"brute={N}, formula={fc}")
        if N != ffact:
            print(f"        (2^m)! = {ffact} is too big by factor "
                  f"{ffact // N}")
        if N != fnh:
            print(f"        no-Hall count = {fnh} is too big by factor "
                  f"{fnh // N}")

    print("\n[3] Valuation cross-check (brute N vs formula, small m)")
    print(f"    {'m':>2} {'v2(brute)':>10} {'v2(formula)':>12} "
          f"{'v5(brute)':>10} {'v5(formula)':>12}")
    for (m, n, res, v2, v5, N, Nlin) in rows:
        print(f"    {m:>2} {v2:>10} {vp_N_formula(2, m):>12} "
              f"{v5:>10} {vp_N_formula(5, m):>12}")
        assert v2 == vp_N_formula(2, m) and v5 == vp_N_formula(5, m)

    print("\n[4] Tie interpretation: extra instances where ties DO occur")
    print("    (the pure 2^m analogue has no ties; these separate readings W/L)")
    tie_cases = [
        ("n=3, 1 round,  points [1]", 3, [1]),
        ("n=5, 1 round,  points [1]", 5, [1]),
        ("n=4, 2 rounds, points [1,1]", 4, [1, 1]),
    ]
    print(f"    {'instance':>28} {'leaves':>8} {'N_weak':>8} "
          f"{'sum prod s!':>12} {'union':>7}")
    for name, n, pts in tie_cases:
        res = simulate(n, pts, collect_weak=True)
        print(f"    {name:>28} {res['leaves']:>8} {res['n_weak']:>8} "
              f"{res['n_linear']:>12} {res['n_union']:>7}")

    print("\n[5] Real instance m = 20 (factorized, exact p-adic valuations)")
    m = 20
    v2_20 = vp_N_formula(2, m)
    v5_20 = vp_N_formula(5, m)
    k = min(v2_20, v5_20)
    print(f"    N = prod_{{i=0}}^{{19}} Catalan(2^i)^(2^(19-i))")
    print(f"    v2(N) = {v2_20}")
    print(f"    v5(N) = {v5_20}")
    print(f"    k = min(v2,v5) = {k}")
    print(f"    k mod 10^5 = {k % 100000}")
    print(f"    k mod 105  = {k % 105}   (degraded text's modulus; the true ")
    print(f"                               problem asks for k mod 10^5)")
    print("    term-by-term v5: i, 2^i, v5(C(2^i)), coeff 2^(19-i), contribution")
    for i in range(m):
        c = 2 ** (m - 1 - i)
        vc = vp_catalan(5, 2 ** i)
        print(f"      {i:>2} {2**i:>7} {vc:>4} {c:>8} {c * vc:>8}")
    # independent v2 sanity: v2(Catalan(2^i)) = 1 for i>=1
    print("    v2(Catalan(2^i)) for i=0..19 =",
          [vp_catalan(2, 2 ** i) for i in range(m)])

    print(f"\nTotal runtime: {time.time() - t0:.1f}s")
    print("=" * 78)


if __name__ == "__main__":
    sys.setrecursionlimit(10000)
    main()
