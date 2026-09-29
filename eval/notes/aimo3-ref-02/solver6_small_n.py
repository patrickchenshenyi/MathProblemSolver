"""Exact f(n): max number of axis-parallel integer-sided rectangles tiling an n x n square
with pairwise distinct perimeters (semiperimeter s = a+b, perimeter 2s).

Upper bound (valid for every n): a rectangle inside the n x n square with semiperimeter s has
area >= minarea(s), where
    minarea(s) = s-1        for 2 <= s <= n+1   (attained by 1 x (s-1))
    minarea(s) = n(s-n)     for n+1 <= s <= 2n  (attained by n x (s-n))
and minarea is nondecreasing.  For k rectangles with distinct semiperimeters,
    n^2 = sum areas >= sum minarea(s_i) >= sum_{s=2}^{k+1} minarea(s),
so f(n) <= max{k : sum_{s=2}^{k+1} minarea(s) <= n^2}.

Exact table (min-area bound matched by an explicit witness for every n except n=2,
where exhaustive enumeration shows the bound 2 is not attainable):
    n        : 1  2  3  4  5  6  7  8
    f(n)     : 1  1  3  4  6  7  8  9
    bound    : 1  2  3  4  6  7  8  9

f(2)=1 because any partition of the 2x2 square into 2 rectangles is a single straight cut,
giving two 1x2 rectangles with equal perimeter; exhaustive DFS over all rectangle partitions
confirms f(1..5) = 1, 1, 3, 4, 6.

Asymptotics: the bound allows k = n+1+m with m = max{m : (m+2)(m+3) <= n+1}, i.e.
m ~ sqrt(n), so f(n) = n + Theta(sqrt n) (not n + sqrt(2n)).
"""

def minarea(s, n):
    return s - 1 if s - 1 <= n else n * (s - n)

def bound(n):
    k = 1
    while sum(minarea(s, n) for s in range(2, k + 2)) <= n * n:
        k += 1
    return k - 1

def verify(n, rects):
    occ = [[0] * n for _ in range(n)]
    for x, y, w, h in rects:
        assert 1 <= w and 1 <= h and 0 <= x and x + w <= n and 0 <= y and y + h <= n
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                assert occ[yy][xx] == 0, "overlap"
                occ[yy][xx] = 1
    assert all(all(r) for r in occ), "not covered"
    assert sum(w * h for _, _, w, h in rects) == n * n
    sem = [w + h for _, _, w, h in rects]
    assert len(set(sem)) == len(sem), sem
    return len(rects)

# witnesses: list of (x, y, width, height), square = [0,n]x[0,n]
WITNESSES = {
    1: [(0, 0, 1, 1)],
    2: [(0, 0, 2, 2)],
    3: [(0, 0, 2, 3), (2, 0, 1, 2), (2, 2, 1, 1)],
    4: [(0, 0, 2, 4), (2, 0, 1, 4), (3, 0, 1, 1), (3, 1, 1, 3)],
    5: [(0, 3, 5, 2), (0, 2, 5, 1), (0, 1, 1, 1), (1, 1, 4, 1), (0, 0, 2, 1), (2, 0, 3, 1)],
    6: [(0, 3, 5, 3), (5, 3, 1, 3), (0, 2, 2, 1), (2, 2, 4, 1),
        (0, 1, 1, 1), (1, 1, 5, 1), (0, 0, 6, 1)],
    7: [(0, 4, 7, 3), (0, 3, 7, 1), (0, 2, 1, 1), (1, 2, 6, 1),
        (0, 1, 2, 1), (2, 1, 5, 1), (0, 0, 3, 1), (3, 0, 4, 1)],
    8: [(0, 4, 7, 4), (7, 4, 1, 4), (0, 3, 8, 1),
        (0, 2, 1, 1), (1, 2, 7, 1), (0, 1, 2, 1), (2, 1, 6, 1),
        (0, 0, 3, 1), (3, 0, 5, 1)],
}

if __name__ == "__main__":
    print(" n  f(n)  upper bound  witness-k  semiperimeters")
    for n in range(1, 9):
        rects = WITNESSES[n]
        k = verify(n, rects)
        sem = sorted(w + h for _, _, w, h in rects)
        print("%2d %5d %10d %10d  %s" % (n, k, bound(n), k, sem))
