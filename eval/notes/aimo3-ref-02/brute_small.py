#!/usr/bin/env python3
"""Exhaustive enumeration of small analogues of the 220-runner / 20-round tournament.

Model (as used throughout):
  - n runners with distinct speeds, labelled 0..n-1 (0 = fastest).
  - r rounds; in round i (0-indexed) the winner gains weight w_i = n-1-i.
    (Real instance: n=220, r=20 => weights 219,218,...,200.)
  - At the start of every round the runners are partitioned by current score;
    inside each score class we take a MAXIMAL matching (all runners paired)
    so an odd class leaves exactly one runner unpaired -> bye (no points).
  - Every race is won by the faster (smaller label) runner.
  - All admissible round-by-round pairing choices are enumerated exhaustively;
    the result is the set of reachable final score vectors.

Two readings of "ordering of the competitors at the end":
  (W) weak order: runners with equal final score are tied; a state gives the
      ordered partition of runners by decreasing score.
  (L) linear order: a permutation pi of the runners is achievable iff some
      reachable final score vector is non-increasing along pi (i.e. pi refines
      the weak order of that state).  The count is the size of the UNION of
      the refinement sets (not the sum of prod tie!).
  (T) tie-broken-by-speed reading: each weak order maps to exactly one total
      order (break ties by speed), so this count equals (W).
"""

from itertools import product, permutations
from collections import defaultdict
import sys


def perfect_pairings(group):
    """All maximal pairings of `group` (sorted tuple of labels).

    Returns list of (pairs, byes) where pairs is a tuple of (faster, slower)
    label pairs and byes is a tuple with 0 or 1 unpaired label.
    """
    group = tuple(sorted(group))
    if not group:
        return [((), ())]
    first, rest = group[0], group[1:]
    res = []
    # first is paired with some other element
    for i, other in enumerate(rest):
        sub = rest[:i] + rest[i + 1:]
        for pairs, byes in perfect_pairings(sub):
            res.append((((first, other),) + pairs, byes))
    # if odd size, first may be the unique bye
    if len(group) % 2 == 1:
        for pairs, byes in perfect_pairings(rest):
            res.append((pairs, (first,)))
    return res


def step(state, w):
    groups = defaultdict(list)
    for rank, sc in enumerate(state):
        groups[sc].append(rank)
    choices = [perfect_pairings(g) for g in groups.values()]
    out = set()
    for combo in product(*choices):
        new = list(state)
        for pairs, _byes in combo:
            for a, b in pairs:
                new[a] += w  # a is faster than b
        out.add(tuple(new))
    return out


def reachable_final_states(n, r):
    weights = [n - 1 - i for i in range(r)]
    states = {tuple([0] * n)}
    for w in weights:
        nxt = set()
        for s in states:
            nxt |= step(s, w)
        states = nxt
    return states


def weak_key(state):
    groups = defaultdict(list)
    for rank, sc in enumerate(state):
        groups[sc].append(rank)
    return tuple(tuple(sorted(groups[sc])) for sc in sorted(groups, reverse=True))


def orderings(n, r):
    states = reachable_final_states(n, r)
    weak = {weak_key(s) for s in states}
    # linear reading: union over reachable states of perms non-increasing in score
    lin = set()
    for s in states:
        for pi in permutations(range(n)):
            ok = all(s[pi[i]] >= s[pi[i + 1]] for i in range(n - 1))
            if ok:
                lin.add(pi)
    return states, weak, lin


def vp(x, p):
    if x == 0:
        return None
    e = 0
    while x % p == 0:
        x //= p
        e += 1
    return e


def main():
    cases = []
    for n in [4, 5, 6, 8]:
        for r in range(1, n):
            cases.append((n, r))
    print(f"{'n':>3} {'r':>2} {'#states':>8} {'W':>10} {'L':>10} "
          f"{'v2(W)':>6} {'v5(W)':>6} {'v2(L)':>8} {'v5(L)':>8}")
    for n, r in cases:
        if n == 8 and r > 4:
            continue  # keep runtime bounded; n=8,r=5+ handled separately if needed
        states, weak, lin = orderings(n, r)
        W, L = len(weak), len(lin)
        print(f"{n:>3} {r:>2} {len(states):>8} {W:>10} {L:>10} "
              f"{vp(W,2)!s:>6} {vp(W,5)!s:>6} {vp(L,2)!s:>8} {vp(L,5)!s:>8}")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
