#!/usr/bin/env python3
"""
Tournament orderings -- exact count and 2-adic / 5-adic valuations.

Problem (AIMO3 reference, id aimo3-21818):
  2^20 runners, distinct speeds, 20 rounds, equal-score pairing each round.
  Winner of round i gets 2^(20-i) points, loser 0.  N = # possible final
  orderings; k = largest integer with 10^k | N.  Output k mod 10^5
  (the original asks k mod 10^5; the flattened statement's "105").

Model / derivation
------------------
* A runner's final score is  sum over rounds he won of 2^(20-i), i.e. a
  20-bit integer; writing W_i for the set of round-i winners, a runner's
  bit i is 1 iff he is in W_i.
* Claim: the 2^20 final scores are exactly {0,...,2^20-1}, each once.
  Induction: before round i every score-class has the form
  {prefix + t : t in [0,2^(20-i+1)) } of size 2^(20-i+1) (power of two);
  each even class splits evenly into winners (bit set) and losers (bit clear).
  Hence no class is ever odd, no bye occurs, and there are no score ties:
  "ordering" = a total order, equivalently a bijection runner -> score.
* Let W be the round-1 winner set and L its complement.  Every winner has
  at least 2^19 points and every loser has at most 2^19 - 1, so W entirely
  outranks L: final order = (achievable order of W) ++ (achievable order of L).
* W is realisable iff the faster runner of every pair can be chosen to be the
  winner, i.e. W admits a perfect matching to L with each element of W faster
  than its partner.  With runners ranked 1..2^m fastest-first, Hall's
  condition is  |W cap [1..t]| >= |L cap [1..t]|  for every prefix t.
  The number of such W of size 2^(m-1) is the ballot number
  C(2^(m-1)) = binom(2^m, 2^(m-1)) / (2^(m-1)+1)  (Catalan).
* Internal relative orders of W and of L are independent, and each is an
  (m-1)-round tournament on 2^(m-1) runners after dividing scores by 2.
  Relabeling W, L in speed order makes their counts equal to N_{m-1}.
  Distinct (W, internal orders) give distinct global orders, so

        N_m = Catalan(2^(m-1)) * N_{m-1}^2 ,     N_1 = 1.
  Unrolled:  N_20 = prod_{j=0}^{19} Catalan(2^j)^(2^(19-j)).

Valuations
----------
  v_p(Catalan(n)) = v_p(binom(2n,n)) - v_p(n+1).
  For n = 2^j:  v_2(binom(2^(j+1),2^j)) = s_2(2^j) = 1, and 2^j+1 is odd,
  so v_2(Catalan(2^j)) = 1 for j>=1 and 0 for j=0.  Hence
        v_2(N_20) = sum_{j=1}^{19} 2^(19-j) = 2^19 - 1 = 524287.
  v_5 is computed exactly per term by Legendre's formula.
  k = min(v_2, v_5).
"""
from math import comb

M = 20
N_RUNNERS = 2**M

# ---- exact 5-adic valuation of binom(2n,n) and of Catalan(n) ----
def vp_fact(n, p):
    """Exponent of prime p in n!."""
    s = 0
    while n:
        n //= p
        s += n
    return s

def vp_binom(n, k, p):
    return vp_fact(n, p) - vp_fact(k, p) - vp_fact(n - k, p)

def vp_int(n, p):
    e = 0
    while n % p == 0:
        n //= p
        e += 1
    return e

def vp_catalan(n, p):
    """Exponent of prime p in Catalan(n) = binom(2n,n)/(n+1)."""
    return vp_binom(2 * n, n, p) - vp_int(n + 1, p)

def catalan(h):
    return comb(2 * h, h) // (h + 1)

# ---- (d) brute-force small analogue: enumerate all matchings ----
def _matchings(items):
    if not items:
        yield []
        return
    first, rest = items[0], items[1:]
    for i, partner in enumerate(rest):
        for m in _matchings(rest[:i] + rest[i + 1:]):
            yield [(first, partner)] + m

from functools import lru_cache

@lru_cache(maxsize=None)
def brute_orders(m, runners):
    """runners fastest-first; return set of achievable final orders (m rounds)."""
    if m == 1:
        return frozenset([(runners[0], runners[1])])
    idx = {r: i for i, r in enumerate(runners)}
    out = set()
    for mt in _matchings(runners):
        W = tuple(sorted((a for a, _ in mt), key=idx.get))
        L = tuple(sorted((b for _, b in mt), key=idx.get))
        for ow in brute_orders(m - 1, W):
            for ol in brute_orders(m - 1, L):
                out.add(ow + ol)
    return frozenset(out)

def brute_winner_subsets(m):
    from itertools import combinations
    n, h = 2**m, 2**(m - 1)
    cnt = 0
    for W in combinations(range(n), h):
        w = sorted(W)
        l = [x for x in range(n) if x not in set(W)]
        if all(w[j] < l[j] for j in range(h)):
            cnt += 1
    return cnt

if __name__ == "__main__":
    print("=" * 70)
    print("(d) brute-force validation of N_m = Catalan(2^(m-1)) * N_{m-1}^2")
    print("=" * 70)
    rec = [0] * (M + 1)
    rec[1] = 1
    for m in range(2, M + 1):
        rec[m] = catalan(2**(m - 1)) * rec[m - 1]**2
    for m in (1, 2, 3):
        bf = len(brute_orders(m, tuple(range(2**m))))
        cw = brute_winner_subsets(m)
        print(f"  m={m}: brute N={bf:5d}   recursion N={rec[m]:5d}   "
              f"achievable winner sets={cw}, Catalan(2^(m-1))={catalan(2**(m-1))}")
    print(f"  m=4: recursion N={rec[4]}  (brute infeasible) ; "
          f"winner sets={brute_winner_subsets(4)}=Catalan(8)")
    assert rec[1] == 1 and rec[2] == 2 and rec[3] == 56

    print()
    print("=" * 70)
    print("per-term valuations j=0..19")
    print("=" * 70)
    v2, v5 = [], []
    for j in range(M):
        n = 2**j
        a, b = vp_catalan(n, 2), vp_catalan(n, 5)
        v2.append(a); v5.append(b)
        print(f"  j={j:2d}  Catalan(2^{j}) has v2={a}, v5={b}")
    assert all(x == (0 if j == 0 else 1) for j, x in enumerate(v2))

    # N_20 = prod_j Catalan(2^j)^(2^(19-j))
    V2 = sum(v2[j] * 2**(M - 1 - j) for j in range(M))
    V5 = sum(v5[j] * 2**(M - 1 - j) for j in range(M))
    k = min(V2, V5)

    print()
    print("=" * 70)
    print("RESULTS")
    print("=" * 70)
    print(f"  v2(N) = {V2}   (closed form 2^19 - 1 = {2**19 - 1})")
    print(f"  v5(N) = {V5}")
    print(f"  k = min(v2,v5) = {k}")
    print(f"  k mod 10^5 = {k % 100000}   <-- reference answer for aimo3-21818")
    print(f"  (literal 'k mod 105' from the flattened statement = {k % 105})")
    assert V2 == 2**19 - 1
    assert k == 121818 and k % 100000 == 21818
