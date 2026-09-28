#!/usr/bin/env python3
"""Exact solution of the AIMO tournament-ordering problem (dataset id 424e18),
solver-8 copy.  Independent implementation with exhaustive small-case checks.

PROMPT RECOVERY
---------------
The task text flattens the exponent: the real statement (AIMO3 reference, id
424e18) is

    n = 2^20 runners of pairwise different speeds, m = 20 rounds; in round i
    (1 <= i <= m) the winner gains 2^(m-i) points and the loser 0; in every
    round runners are paired so both members of a pair have equal score at the
    start of the round; rank runners by final score; N = number of possible
    orderings of the runners; k = largest integer with 10^k | N; report
    k mod 10^5.

Reference answer: 21818.

MODEL
-----
1. "Ordering" = a total ranking of the n labelled runners by final score.  For
   the n = 2^m instance every final score is distinct (see 3), so each outcome
   yields exactly one ranking and there is no tie-breaking ambiguity.  (Were
   ties present, a weak ordering / any linear extension would be the natural
   reading; the brute force below prints both readings for small analogues:
   they coincide here.)
2. Odd score class: a maximal matching is taken inside each class, so an odd
   class of size 2t+1 leaves exactly one runner unpaired (a bye, 0 points).
   In the n = 2^m instance every class size is a power of two, hence even at
   the start of every round, so no bye ever occurs.
3. Weights 2^(m-i) dominate all later weights (2^(m-i-1)+...+1 = 2^(m-i)-1), so
   the score order after any round i is the lexicographic order of the win/loss
   vector (round 1 first).  A score class is exactly a win-prefix class.
4. A class of even size s splits into its winners W and losers L, |W|=|L|=s/2.
   A subset W is realisable iff the winners can be matched to losers with every
   winner faster; sorting the class fastest-first this is Hall's condition
   "#W >= #L in every prefix".  The number of such W is the Catalan number
   C(s/2) = binom(s, s/2)/(s/2+1).
5. Root class size 2^m halves every round: 2^m -> 2^(m-1) -> ... -> 1.  A class
   of size 2^j has C(2^(j-1)) admissible splits and there are 2^(m-j) such
   classes, so

        N = PROD_{j=1}^{m} C(2^(j-1))^(2^(m-j)).

   The final ranking determines each node's winner set (round-i result is bit i
   of the score, and bits of earlier rounds dominate), so ranking <-> split
   tree is a bijection: the product is exact, not an upper bound.
6. Valuations (Legendre/Kummer):  v_p(N) = SUM_j 2^(m-j) * v_p(C(2^(j-1))),
   v_p(C_n) = v_p(binom(2n,n)) - v_p(n+1).  v_2(C(2^(j-1))) = 1 for j >= 2, so
   v_2(N) = 2^(m-1) - 1.  For m = 20: v_2 = 524287, v_5 = 121818,
   k = min = 121818, k mod 10^5 = 21818.
"""

from collections import defaultdict
from itertools import combinations, product
from math import comb


# --------------------------------------------------------------- exact counts
def catalan(n):
    """Exact Catalan number C_n = binom(2n,n)/(n+1).

    @param n: nonnegative integer.
    @returns: exact integer value.
    """
    return comb(2 * n, n) // (n + 1)


def N_exact(m):
    """Exact N = PROD_{j=1}^{m} C(2^(j-1))^(2^(m-j)) for n = 2^m runners.

    @param m: number of rounds (and log2 of the runner count).
    @returns: exact integer number of final orderings.
    """
    N = 1
    for j in range(1, m + 1):
        N *= catalan(2 ** (j - 1)) ** (2 ** (m - j))
    return N


def vp(x, p):
    """Exact p-adic valuation of a positive integer.

    @param x: positive integer.
    @param p: prime.
    @returns: largest e with p^e | x.
    """
    assert x > 0 and p > 1
    e = 0
    while x % p == 0:
        x //= p
        e += 1
    return e


def binom_valuation(n, p):
    """v_p(binom(2n, n)) by Legendre's formula, exact.

    @param n: nonnegative integer.
    @param p: prime.
    @returns: v_p(binom(2n,n)).
    """
    two_n = 2 * n
    e = 0
    pk = p
    while pk <= two_n:
        e += two_n // pk - 2 * (n // pk)
        pk *= p
    return e


def vp_catalan(n, p):
    """v_p(C_n) = v_p(binom(2n,n)) - v_p(n+1), exact."""
    return binom_valuation(n, p) - vp(n + 1, p)


def N_valuations(m, p):
    """v_p(N) from the per-class Catalan factors, independent of N_exact."""
    return sum(
        2 ** (m - j) * vp_catalan(2 ** (j - 1), p) for j in range(1, m + 1)
    )


# --------------------------------------------------- exhaustive small analogue
def perfect_pairings(group):
    """All maximal matchings of a sorted tuple of runner labels (0 fastest).

    @param group: tuple of labels, ascending.
    @returns: list of (pairs, byes); pairs = ((faster, slower), ...), byes is a
      tuple of 0 or 1 unpaired labels.
    """
    group = tuple(sorted(group))
    if not group:
        return [((), ())]
    first, rest = group[0], group[1:]
    res = []
    for i, other in enumerate(rest):
        rest2 = rest[:i] + rest[i + 1:]
        for pairs, byes in perfect_pairings(rest2):
            res.append((((first, other),) + pairs, byes))
    if len(group) % 2 == 1:  # odd class: first may be the bye
        for pairs, byes in perfect_pairings(rest):
            res.append((pairs, (first,)))
    return res


def reachable_final_states(n, m):
    """Exhaustively enumerate final score vectors of all admissible pairings.

    @param n: runner count, labels 0..n-1 with 0 fastest.
    @param m: rounds; round i (1-based) awards 2^(m-i) to the faster of a pair.
    @returns: set of final score tuples over all round-by-round pairing choices.
    """
    weights = [2 ** (m - i) for i in range(1, m + 1)]
    states = {tuple([0] * n)}
    for w in weights:
        nxt = set()
        for state in states:
            groups = defaultdict(list)
            for runner, sc in enumerate(state):
                groups[sc].append(runner)
            choices = [perfect_pairings(g) for g in groups.values()]
            for combo in product(*choices):
                new = list(state)
                for pairs, _byes in combo:
                    for faster, _slower in pairs:
                        new[faster] += w
                nxt.add(tuple(new))
        states = nxt
    return states


def brute_counts(n, m):
    """Brute-force ordering counts under both tie readings.

    @param n: runner count.
    @param m: rounds.
    @returns: (linear_count, weak_count): number of achievable total rankings
      (each ranking is one linear extension of the score order) and number of
      achievable weak orderings (ordered partition by decreasing score).
    """
    linear = set()
    weak = set()
    for state in reachable_final_states(n, m):
        linear.add(tuple(sorted(range(n), key=lambda r: (-state[r], r))))
        groups = defaultdict(list)
        for r, sc in enumerate(state):
            groups[sc].append(r)
        weak.add(tuple(tuple(sorted(groups[sc])) for sc in sorted(groups,
                                                                  reverse=True)))
    return len(linear), len(weak)


def matching_vs_ballot(m):
    """Verify realisable class winner-sets equal the ballot/Catalan count.

    @param m: even class size.
    @returns: (count by explicit matching test, Catalan(m/2)).
    """
    people = list(range(m))  # 0 fastest
    count = 0
    for W in combinations(people, m // 2):
        Wset = set(W)
        used = set()
        ok = True
        for loser in (p for p in people if p not in Wset):  # fastest-first
            cand = [w for w in W if w < loser and w not in used]
            if not cand:
                ok = False
                break
            used.add(min(cand))  # match to a faster winner
        if ok:
            count += 1
    return count, catalan(m // 2)


def main():
    m = 20
    print("=" * 72)
    print(f"AIMO 424e18: n = 2^{m} runners, {m} rounds, round i awards 2^(m-i)")
    print("=" * 72)

    # (d) exhaustive validation of the formula on small analogues
    print("\n[d] exhaustive brute force over ALL pairings vs formula")
    print(f"{'runners':>8} {'rounds':>7} {'linear':>8} {'weak':>8} "
          f"{'formula':>8}  match")
    for mm in (1, 2, 3):
        n = 2 ** mm
        lin, weak = brute_counts(n, mm)
        formula = N_exact(mm)
        print(f"{n:>8} {mm:>7} {lin:>8} {weak:>8} {formula:>8}  "
              f"{lin == weak == formula}")
        assert lin == weak == formula, (n, mm, lin, weak, formula)

    print("\n[d2] realisable winner-sets of a size-m class == Catalan(m/2)")
    for msize in (2, 4, 6, 8):
        got, want = matching_vs_ballot(msize)
        print(f"   class size {msize}: explicit matching test = {got}, "
              f"Catalan = {want}  {'OK' if got == want else 'MISMATCH'}")
        assert got == want, (msize, got, want)

    # (b) exact valuations for the real instance
    print(f"\n[b] exact valuations for n = 2^{m}, m = {m}")
    v2 = N_valuations(m, 2)
    v5 = N_valuations(m, 5)
    assert v2 == 2 ** (m - 1) - 1, (v2, 2 ** (m - 1) - 1)
    print(f"   v2(N) = {v2}   (closed form 2^(m-1)-1 = {2 ** (m - 1) - 1})")
    print(f"   v5(N) = {v5}")
    print("   v5 breakdown (j, class size 2^j, #classes, v5(C), "
          "contribution):")
    for j in range(1, m + 1):
        c = catalan(2 ** (j - 1))
        a = vp(c, 5)
        print(f"     j={j:>2}  size=2^{j - 1:<2}  classes=2^{m - j:<2}  "
              f"v5(C)={a}  contribution={2 ** (m - j) * a}")

    k = min(v2, v5)
    print(f"\n   k = min(v2(N), v5(N)) = {k}")
    print(f"   k mod 10^5 = {k % 10 ** 5}")
    print(f"   k mod 105  = {k % 105}")

    # (c) certificate on the exact integer N
    N = N_exact(m)
    print(f"\n[c] certificate on N (exact big int, {N.bit_length()} bits)")
    assert N % (10 ** k) == 0
    assert N % (10 ** (k + 1)) != 0
    print(f"   10^{k} | N  and  10^{k + 1} does not divide N  =>  k = {k}")

    print("\nANSWER: k mod 10^5 =", k % 10 ** 5)


if __name__ == "__main__":
    main()
