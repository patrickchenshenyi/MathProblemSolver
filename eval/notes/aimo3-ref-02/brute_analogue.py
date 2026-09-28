#!/usr/bin/env python3
"""Exhaustive ground truth for the small analogues of AIMO3 aimo3-21818.

TRUE problem (Lead-confirmed): 2^20 runners, 20 rounds; round i (1..20) awards
2^{20-i} points; k = v_10(N); answer k mod 10^5.

Scaled analogue: n = 2^m runners, r = m rounds, round i awards 2^{m-i} points
(weights 2^{m-1}, ..., 1).  m=20 is the real case.

Rules modelled:
  * runners labelled 0..n-1 by DECREASING speed (0 fastest);
  * each round, current score classes are matched maximally (for n=2^m every
    class has power-of-two size, so no byes);
  * faster runner of a pair wins and gains the round weight;
  * ALL admissible winner sets per class are enumerated exhaustively.

Key facts (proved in the accompanying report):
  (1) distinct weights are powers of two => final score <-> set of rounds won;
      hence after m rounds the 2^m runners hold all 2^m distinct win-sets and
      all final scores are distinct (no ties, in particular no more races).
  (2) a class of size c listed fastest-first can have winner set W (|W|=c/2)
      iff every prefix has #winners >= #losers (Hall / ballot) => Catalan(c/2).
  (3) the choice at every node is independent and determines the final win-set
      assignment injectively => N(m) = prod_{i=1}^m C(2^{m-i})^{2^{i-1}}
      = prod_{j=0}^{m-1} C(2^j)^{2^{m-1-j}}.

State encoding: integer code = sum_r mask[r] << (m*r), mask[r] = win-set of
runner r (m bits), giving an exact compressed final state.
"""

import sys
from itertools import combinations, permutations, product
from math import comb, factorial
from collections import defaultdict


def catalan(k):
    return comb(2 * k, k) // (k + 1)


_BALLOT = {}


def ballot_deltas(c, bit, members, m):
    """All OR-deltas for one class of positions `members` (fastest first)."""
    key = (c, bit, tuple(members), m)
    if key in _BALLOT:
        return _BALLOT[key]
    half = c // 2
    out = []
    for comb_ in combinations(range(c), half):
        s = set(comb_)
        w = l = 0
        ok = True
        for p in range(c):
            if p in s:
                w += 1
            else:
                l += 1
            if w < l:
                ok = False
                break
        if ok:
            d = 0
            for p in range(c):
                if p in s:
                    d |= bit << (m * members[p])
            out.append(d)
    _BALLOT[key] = out
    return out


def run(m, verbose=False):
    n = 1 << m
    full = (1 << m) - 1
    states = {0}  # all masks 0
    counts = []
    for i in range(1, m + 1):
        bit = 1 << (m - i)
        nxt = set()
        for code in states:
            groups = defaultdict(list)
            for r in range(n):
                groups[(code >> (m * r)) & full].append(r)
            opts = [ballot_deltas(len(mem), bit, mem, m)
                    for mem in groups.values()]
            cur = [code]
            for dl in opts:
                cur = [c + d for c in cur for d in dl]
            nxt.update(cur)
        states = nxt
        counts.append(len(states))
        if verbose:
            print(f"    m={m} round {i}: {len(states)} distinct states", flush=True)
    # every final state must be a permutation of 0..2^m-1 (distinct scores)
    all_distinct = all(len({(st >> (m * r)) & full for r in range(n)}) == n
                       for st in states)
    return states, counts, all_distinct


def formula_N(m):
    N = 1
    for i in range(1, m + 1):
        N *= catalan(1 << (m - i)) ** (1 << (i - 1))
    return N


def formula_partial(m, upto):
    N = 1
    for i in range(1, upto + 1):
        N *= catalan(1 << (m - i)) ** (1 << (i - 1))
    return N


def vp(x, p):
    e = 0
    while x % p == 0:
        x //= p
        e += 1
    return e


# ---------------- general (non power-of-two) helpers, PART 2 ---------------

def perfect_pairings(group):
    group = tuple(sorted(group))
    if not group:
        return [((), ())]
    first, rest = group[0], group[1:]
    res = []
    for i, other in enumerate(rest):
        sub = rest[:i] + rest[i + 1:]
        for pairs, byes in perfect_pairings(sub):
            res.append((((first, other),) + pairs, byes))
    if len(group) % 2 == 1:
        for pairs, byes in perfect_pairings(rest):
            res.append((pairs, (first,)))
    return res


def enumerate_general(n, r):
    states = {tuple([0] * n)}
    for i in range(r):
        w = n - 1 - i
        nxt = set()
        for st in states:
            groups = defaultdict(list)
            for rank, sc in enumerate(st):
                groups[sc].append(rank)
            choices = [perfect_pairings(g) for g in groups.values()]
            for combo in product(*choices):
                new = list(st)
                for pairs, _byes in combo:
                    for a, b in pairs:
                        new[a] += w
                nxt.add(tuple(new))
        states = nxt
    return states


def weak_key(st):
    groups = defaultdict(list)
    for rank, sc in enumerate(st):
        groups[sc].append(rank)
    return tuple(tuple(sorted(groups[sc])) for sc in sorted(groups, reverse=True))


def tie_sizes(st):
    groups = defaultdict(int)
    for sc in st:
        groups[sc] += 1
    return sorted(groups.values(), reverse=True)


def main():
    print("=" * 96)
    print("PART 1  exhaustive scaled analogue n=2^m runners, r=m rounds, weights 2^{m-i}")
    print("=" * 96)
    hdr = (f"{'m':>2} {'n':>4} {'r':>2} {'N_brute':>12} {'N_formula':>12} "
           f"{'match':>5} {'v2':>7} {'v5':>7} {'v10':>7} {'W=L':>4} "
           f"{'distinct':>8}")
    print(hdr)
    brute = {}
    for m in (1, 2, 3):
        st, counts, ds = run(m, verbose=True)
        Nb, Nf = len(st), formula_N(m)
        brute[m] = (Nb, Nf, counts, ds)
        print(f"{m:>2} {1 << m:>4} {m:>2} {Nb:>12} {Nf:>12} {str(Nb == Nf):>5} "
              f"{vp(Nb,2):>7} {vp(Nb,5):>7} {min(vp(Nb,2),vp(Nb,5)):>7} "
              f"{str(Nb == Nf):>4} {str(ds):>8}")
        print(f"     per-round counts  brute  : {counts}")
        print(f"     per-round counts  formula: "
              f"{[formula_partial(m, i) for i in range(1, m + 1)]}", flush=True)

    # m=4: full exhaustive run (4,484,480 final states, no intermediate blowup)
    print("    running m=4 (16 runners, 4 rounds) exhaustive ...", flush=True)
    st4, counts4, ds4 = run(4, verbose=True)
    Nb, Nf = len(st4), formula_N(4)
    brute[4] = (Nb, Nf, counts4, ds4)
    print(f"{4:>2} {16:>4} {4:>2} {Nb:>12} {Nf:>12} {str(Nb == Nf):>5} "
          f"{vp(Nb,2):>7} {vp(Nb,5):>7} {min(vp(Nb,2),vp(Nb,5)):>7} "
          f"{str(Nb == Nf):>4} {str(ds4):>8}")
    print(f"     per-round counts  brute  : {counts4}")
    print(f"     per-round counts  formula: "
          f"{[formula_partial(4, i) for i in range(1, 5)]}")

    print()
    print("PART 1b  formula-only test vectors (m=5..10, m=20)")
    print(f"{'m':>3} {'N(m)':>30} {'v2':>9} {'v5':>9} {'v10':>9} "
          f"{'v10 mod 1e5':>12}")
    for m in list(range(5, 11)) + [20]:
        N = formula_N(m)
        v10 = min(vp(N, 2), vp(N, 5))
        print(f"{m:>3} {N:>30} {vp(N,2):>9} {vp(N,5):>9} {v10:>9} {v10 % 100000:>12}")

    print()
    print("=" * 96)
    print("PART 2  tie readings on instances WITH ties (interpretation pinning)")
    print("=" * 96)
    print("These are NOT the scaled analogue: they use weights n-i and few rounds,")
    print("so final ties exist.  W = #distinct weak orders; L = #distinct total")
    print("orders obtained by breaking ties (union of refinements); naive = sum of")
    print("prod(tie!) over states (double counts refinements shared by weak orders).")
    cases = [(4, 1), (6, 1), (8, 1), (5, 2), (6, 2), (8, 2), (6, 3)]
    print(f"{'n':>3} {'r':>2} {'#states':>8} {'W':>8} {'L':>10} {'naive':>12} "
          f"{'W=L?':>7}")
    for n, r in cases:
        states = enumerate_general(n, r)
        weak = {weak_key(s) for s in states}
        lin = set()
        npr = list(permutations(range(n)))
        for s in states:
            for pi in npr:
                if all(s[pi[i]] >= s[pi[i + 1]] for i in range(n - 1)):
                    lin.add(pi)
        naive = 0
        for s in states:
            p = 1
            for t in tie_sizes(s):
                p *= factorial(t)
            naive += p
        print(f"{n:>3} {r:>2} {len(states):>8} {len(weak):>8} {len(lin):>10} "
              f"{naive:>12} {str(len(weak)==len(lin)):>7}")
    print()
    print("On the scaled analogue (PART 1) all scores are distinct, hence")
    print("W = L = T(fixed tiebreak) = naive = #states = N_formula:")
    for m in (1, 2, 3, 4):
        Nb, Nf, counts, ds = brute[m]
        print(f"  m={m}: #states={Nb} N_formula={Nf} all scores distinct={ds} "
              f"W=L={Nb == Nf}")


if __name__ == "__main__":
    main()
