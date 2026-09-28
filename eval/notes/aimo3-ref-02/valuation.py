"""AIMO3 problem 424e18 (aimo3-21818): 2^20 runners, 20 rounds, round i awards 2^(20-i).

Counts N = number of possible final orderings, then k = min(v2(N), v5(N)) = v10(N),
and prints k mod 10^5.

Model
-----
Points are distinct powers of two, so a runner's final score is the binary number
whose bit i (i=1..20) records whether the runner won round i.  Hence score <-> win-set
is a bijection and two runners tie iff they have identical win-sets.

In round i, everyone in a score class (same win-set) is paired within the class, so a
class of size m splits into winners/losers of size m/2 each.  Sorting a class by speed,
a subset W (|W|=m/2) can be the winner set iff every prefix contains at least as many
winners as losers (#W >= #L); this is exactly Hall's condition for matching every loser
to a distinct faster winner.  Those subsets are counted by the Catalan number C_{m/2}.

At the root the class has size 2^20 and halves each round, so depths are sizes
2^20 -> 2^19 -> ... -> 1, and a class of size 2^j has C_{2^(j-1)} possible splits.

The final ranking determines every node's winner set (bit i of a runner's score says
whether it is in that node's W), so distinct split choices give distinct rankings.
There are therefore no collisions and

    N = prod_{j=0}^{19} C_{2^j}^{ 2^(19-j) }.

Legendre's formula gives v_p(N) exactly for p = 2, 5; k = min(v2, v5).

Self-checks in this file
------------------------
1. v_p(C_n) from Legendre is compared against exact big-integer Catalan numbers.
2. Exhaustive enumeration of all perfect matchings of a class of size 2,4,6,8 confirms
   the winner-set count equals C_{m/2} and satisfies the prefix condition.
3. Exhaustive enumeration of every pairing in every round for r = 1,2,3 rounds
   (n = 2,4,8 runners, points 2^(r-i)) counts distinct final orderings and matches the
   product formula (1, 2, 56).
"""

from math import comb

R = 20


def catalan(n: int) -> int:
    return comb(2 * n, n) // (n + 1)


def vp_factorial(n: int, p: int) -> int:
    """Legendre: exponent of prime p in n!."""
    total, q = 0, p
    while q <= n:
        total += n // q
        q *= p
    return total


def vp_catalan(n: int, p: int) -> int:
    """EXACT v_p(C_n) = v_p((2n)!) - v_p(n!) - v_p((n+1)!)."""
    return vp_factorial(2 * n, p) - vp_factorial(n, p) - vp_factorial(n + 1, p)


def vp_int(x: int, p: int) -> int:
    c = 0
    while x % p == 0:
        x //= p
        c += 1
    return c


# ---------------------------------------------------------------- self-check 1
for n in range(200):
    for p in (2, 5):
        assert vp_catalan(n, p) == vp_int(catalan(n), p), (n, p)
for j in range(R):
    n = 2 ** j
    for p in (2, 5):
        assert vp_catalan(n, p) == vp_int(catalan(n), p), ("2^j", j, p)
print("check 1 (Legendre v_p(C_n) == exact big-int Catalan): OK for n<200 and n=2^0..2^19")


# ---------------------------------------------------------------- self-check 2
def matchings(lst):
    if not lst:
        yield []
        return
    a = lst[0]
    for i in range(1, len(lst)):
        b = lst[i]
        rest = lst[1:i] + lst[i + 1:]
        for m in matchings(rest):
            yield [(a, b)] + m


def winner_sets_bruteforce(m):
    """All winner sets realizable by some perfect matching of m runners (0 = fastest)."""
    res = set()
    for mm in matchings(list(range(m))):
        res.add(frozenset(a for a, b in mm))  # a < b, so a is faster and wins
    return res


for m in (2, 4, 6, 8):
    ws = winner_sets_bruteforce(m)
    assert len(ws) == catalan(m // 2), (m, len(ws), catalan(m // 2))
    for W in ws:  # prefix condition #W >= #L
        for k in range(1, m + 1):
            assert sum(1 for x in W if x < k) >= (k + 1) // 2, (m, W, k)
        assert len(W) == m // 2
print("check 2 (winner sets of a class = Catalan(m/2), prefix condition holds): OK")


# ---------------------------------------------------------------- self-check 3
def brute_rankings(r):
    """Enumerate every pairing in every round; return the set of final orderings."""
    n = 2 ** r
    rankings = set()

    def rec(round_idx, classes):
        if round_idx == r:
            scores = [0] * n
            for sc, members in classes:
                for x in members:
                    scores[x] = sc
            rankings.add(tuple(sorted(range(n), key=lambda x: -scores[x])))
            return
        pts = 2 ** (r - round_idx - 1)
        options = []
        for sc, members in classes:
            opts = []
            for mm in matchings(list(members)):
                W = tuple(sorted(a for a, b in mm))
                L = tuple(sorted(b for a, b in mm))
                opts.append((W, L))
            options.append(opts)
        idx = [0] * len(options)
        while True:
            new = []
            for ci, (sc, _members) in enumerate(classes):
                W, L = options[ci][idx[ci]]
                new.append((sc + pts, W))
                new.append((sc, L))
            rec(round_idx + 1, tuple(sorted(new)))
            j = len(options) - 1
            while j >= 0:
                idx[j] += 1
                if idx[j] < len(options[j]):
                    break
                idx[j] = 0
                j -= 1
            if j < 0:
                break

    rec(0, ((0, tuple(range(n))),))
    return rankings


def formula(r):
    prod = 1
    for j in range(r):
        prod *= catalan(2 ** j) ** (2 ** (r - 1 - j))
    return prod


for r in (1, 2, 3):
    brute = len(brute_rankings(r))
    assert brute == formula(r), (r, brute, formula(r))
    print(f"check 3 (r={r}, n={2**r}): brute-force orderings = {brute}, formula = {formula(r)}: OK")


# ---------------------------------------------------------------- main computation
v2 = sum(2 ** (R - 1 - j) * vp_catalan(2 ** j, 2) for j in range(R))
v5 = sum(2 ** (R - 1 - j) * vp_catalan(2 ** j, 5) for j in range(R))

print()
print("Catalan exponents v_p(C_{2^j}) for j=0..19:")
for p in (2, 5):
    print(f"  p={p}: " + ", ".join(f"C_2^{j}:{vp_catalan(2**j, p)}" for j in range(R)))

print()
print("v2(N) =", v2)
print("v5(N) =", v5)
k = min(v2, v5)
print("k = min(v2(N), v5(N)) =", k)
print("k mod 10^5 =", k % 100000)

assert v2 == 524287
assert v5 == 121818
assert k == 121818
assert k % 100000 == 21818
print("all assertions passed")
