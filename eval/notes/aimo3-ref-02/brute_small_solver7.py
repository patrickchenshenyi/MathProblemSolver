#!/usr/bin/env python3
"""Exhaustive ground truth for small analogues of the AIMO3 tournament problem aimo3-21818.

The prompt text is a LaTeX-degraded copy.  The true statement is:

    A tournament is held with 2^20 runners, each with a different running speed.
    In each race the faster runner wins.  There are 20 rounds; every runner starts
    at score 0.  In each round runners are paired so that both members of a pair
    have the same score at the start of the round.  The winner of a race in the
    i-th round receives 2^(20-i) points, the loser receives 0.  Runners are ranked
    by final score; N is the number of possible final orderings.  Find the largest
    k with 10^k | N, reduced modulo 10^5.

The rendered "220 runners", "220-i points" and "105" are 2^20, 2^(20-i) and 10^5
with the superscripts lost.

Model
-----
Label runners 0,1,...,n-1 with 0 the fastest; faster always wins.  Round i:
partition runners by current score.  Inside a class of size s the runners are
split into floor(s/2) pairs plus one unpaired runner (a bye) when s is odd.
Each pair is played and its winner gains points[i]; losers and the bye gain 0.

Two facts used below:
  * The multiset of scores at the start of every round is independent of the
    pairing choices, because exactly floor(s/2) members of each class gain the
    round's points.
  * With points 2^(m-i) (distinct powers of two) subset sums are unique, so a
    runner's final score determines the exact set of rounds it won.

Tie interpretations (acceptance criterion d)
--------------------------------------------
  N_weak : number of distinct final score-rank *weak orderings* -- the reachable
           score vectors, read as ordered partitions of the runners.
  N_lin  : size of the union over reachable score vectors of all linear
           extensions of the induced weak ordering (all total orders obtainable
           by breaking ties arbitrarily).

When every final score class is a singleton the two readings coincide.  For the
real instance (2^20 runners, 20 rounds) the class sizes are powers of two and
reach 1, so there are no ties and both readings equal the product formula.

General formula (validated exhaustively below)
----------------------------------------------
For n = 2^m runners and r rounds with points 2^(m-i):

    N(2^m, r) = prod_{i=1}^{min(r,m)} Catalan(2^(m-i))^(2^(i-1)).

Reason: at round i there are 2^(i-1) score classes of size 2^(m-i+1); the number
of admissible winner subsets of a class of even size s is the Catalan number
Catalan(s/2) = C(2^(m-i)); the choices at all rounds/nodes are independent.

Run:  python3 work/brute_small_solver7.py            # fast tables (<= ~30 s)
      python3 work/brute_small_solver7.py --full     # also n=16, r=2 (about 2-4 min)
"""

import itertools
import math
import sys
import time


def perfect_matchings_with_bye(members):
    """Yield (pairs, bye) for one score class.

    pairs is a list of (a, b) pairs; bye is the unpaired member for odd-sized
    classes and None for even-sized classes.  Every admissible pairing is
    generated exactly once (exhaustive, not random).
    """
    if not members:
        yield [], None
        return
    if len(members) == 1:
        yield [], members[0]
        return
    first, rest = members[0], members[1:]
    if len(members) % 2 == 1:
        # first sits out (bye)
        for pairs, bye in perfect_matchings_with_bye(rest):
            yield pairs, first
    # first is paired with each possible partner
    for idx, partner in enumerate(rest):
        others = rest[:idx] + rest[idx + 1:]
        for pairs, bye in perfect_matchings_with_bye(others):
            yield [(first, partner)] + pairs, bye


def brute_reachable(n, r, points, want_linear=True):
    """Exhaustively enumerate every admissible pairing each round.

    Returns (n_weak, n_linear, n_states, max_tie, elapsed_seconds).
    n_linear is None when want_linear is False (tie groups too large to
    enumerate).
    """
    t0 = time.time()
    states = {(0,) * n}
    for i in range(r):
        nxt = set()
        for sc in states:
            groups = {}
            for idx, s in enumerate(sc):
                groups.setdefault(s, []).append(idx)
            class_choices = [(s, list(perfect_matchings_with_bye(m)))
                             for s, m in groups.items()]
            for combo in itertools.product(*[c[1] for c in class_choices]):
                new = list(sc)
                for (s, _), (pairs, bye) in zip(class_choices, combo):
                    for a, b in pairs:
                        winner = min(a, b)          # faster runner wins
                        new[winner] = sc[winner] + points[i]
                    # loser and bye gain nothing
                nxt.add(tuple(new))
        states = nxt

    n_weak = 0
    n_linear = 0
    seen_weak = set()
    perms = set()
    for sc in states:
        order = sorted(range(n), key=lambda x: -sc[x])
        groups = []
        cur = [order[0]]
        for x in order[1:]:
            if sc[x] == sc[cur[-1]]:
                cur.append(x)
            else:
                groups.append(tuple(sorted(cur)))
                cur = [x]
        groups.append(tuple(sorted(cur)))
        sig = tuple(groups)
        if sig not in seen_weak:
            seen_weak.add(sig)
        if want_linear:
            for plists in itertools.product(*[itertools.permutations(g) for g in groups]):
                perms.add(tuple(x for pp in plists for x in pp))

    n_weak = len(seen_weak)
    n_linear = len(perms) if want_linear else None
    max_tie = max(max(__import__("collections").Counter(sc).values()) for sc in states)
    return n_weak, n_linear, len(states), max_tie, time.time() - t0


def catalan(k):
    return math.comb(2 * k, k) // (k + 1)


def formula_count(m, r):
    """N(2^m runners, r rounds, points 2^(m-i)) from the product formula."""
    prod = 1
    for i in range(1, min(r, m) + 1):
        prod *= catalan(2 ** (m - i)) ** (2 ** (i - 1))
    return prod


def vp(n, p):
    e = 0
    while n % p == 0:
        n //= p
        e += 1
    return e


def main():
    full = "--full" in sys.argv
    print(__doc__)
    print("=" * 100)

    rows = []  # (label, n, r, weak, linear, formula, note)

    # --- self-similar family: n = 2^r runners, r rounds, points 2^(r-i) ---
    print("Table 1. Self-similar family n=2^r, r rounds, points 2^(r-i).")
    print("       The lead's expected exhaustive counts are r=1,2,3 -> 1,2,56.")
    for r in (1, 2, 3):
        n = 2 ** r
        pts = [2 ** (r - i) for i in range(1, r + 1)]
        w, l, ns, mt, dt = brute_reachable(n, r, pts, want_linear=True)
        f = formula_count(r, r)
        rows.append((f"n=2^{r},r={r}", n, r, w, l, f, ""))
        print(f"  n={n:<3} r={r}  points={pts}  states={ns}  max_tie={mt}  "
              f"weak={w}  linear={l}  formula={f}  {'MATCH' if w == f else 'MISMATCH'}  ({dt:.1f}s)")

    # n=2^4=16, r=4 is the next self-similar term; 4.48M states -> formula only.
    f4 = formula_count(4, 4)
    print(f"  n=16  r=4  formula={f4}  (4,484,480 states; exhaustive pairing "
          f"enumeration infeasible, formula validated on n<=8)")
    rows.append(("n=2^4,r=4", 16, 4, None, None, f4, "formula only"))

    # --- tie-rich cases: fewer rounds than needed to split classes to size 1 ---
    print()
    print("Table 2. Tie-rich cases n=2^m with r <= m (final classes still tied).")
    print("       Here the formula counts the WEAK reading, not linear extensions.")
    for (m, r) in [(1, 1), (2, 1), (2, 2), (3, 1), (3, 2), (3, 3)]:
        n = 2 ** m
        pts = [2 ** (m - i) for i in range(1, r + 1)]
        w, l, ns, mt, dt = brute_reachable(n, r, pts, want_linear=True)
        f = formula_count(m, r)
        rows.append((f"n=2^{m},r={r}", n, r, w, l, f, "tie-rich"))
        print(f"  n={n:<3} r={r}  states={ns}  max_tie={mt}  weak={w}  linear={l}  "
              f"formula(weak)={f}  {'MATCH' if w == f else 'MISMATCH'}  ({dt:.1f}s)")

    # --- 16 runners, r=1 (and r=2 with --full): exhaustive pairing enumeration ---
    print()
    print("Table 3. 16 runners, exhaustive enumeration of all pairings.")
    for r in ([1, 2] if full else [1]):
        n, m = 16, 4
        pts = [2 ** (m - i) for i in range(1, r + 1)]
        # linear extensions are astronomically many for big tie classes -> weak only
        w, l, ns, mt, dt = brute_reachable(n, r, pts, want_linear=False)
        f = formula_count(m, r)
        rows.append((f"n=16,r={r}", n, r, w, None, f, "weak only"))
        print(f"  n=16 r={r}  states={ns}  max_tie={mt}  weak={w}  formula={f}  "
              f"{'MATCH' if w == f else 'MISMATCH'}  (linear extensions not "
              f"enumerated: tie groups too large)  ({dt:.1f}s)")

    print()
    print("Table 4. Comparison summary (brute weak vs product formula).")
    bad = 0
    for label, n, r, w, l, f, note in rows:
        if w is not None and w != f:
            bad += 1
            print(f"  MISMATCH {label}: brute weak={w} formula={f} {note}")
        else:
            print(f"  OK       {label}: brute weak={w} formula={f} "
                  f"linear={l} {note}")
    print(f"  mismatches = {bad}")

    print()
    print("Table 5. Valuations and main result.")
    print("  small family valuations (from the formula):")
    for r in range(1, 5):
        f = formula_count(r, r)
        print(f"    n=2^{r}, r={r}: N={f}  v2={vp(f,2)}  v5={vp(f,5)}  "
              f"v10={min(vp(f,2), vp(f,5))}")

    m, r = 20, 20
    N = formula_count(m, r)
    v2N, v5N = vp(N, 2), vp(N, 5)
    k = min(v2N, v5N)
    print(f"\n  Main instance: n=2^{m}, r={r}, points 2^(20-i).")
    print(f"  N = prod_{{j=0}}^{{{r-1}}} Catalan(2^j)^(2^(r-1-j)) = {N}")
    print(f"  v2(N) = {v2N}   (= 2^19 - 1 = sum_(j=1..19) 2^(19-j))")
    print(f"  v5(N) = {v5N}")
    print(f"  k = min(v2,v5) = {k}")
    print(f"  k mod 10^5 = {k % 10**5}      <- the intended answer (AIMO3 aimo3-21818)")
    print(f"  k mod 105  = {k % 105}        <- if the degraded '105' were literal")


if __name__ == "__main__":
    main()
