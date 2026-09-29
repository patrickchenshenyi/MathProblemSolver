"""Explicit 520-rectangle tiling of the 500x500 square with pairwise distinct perimeters.

Construction (all coordinates integers, square = [0,500]x[0,500]):

Bottom half  y in [0,250]  -- 499 unit strips:
  for i = 1..249:  [0,i]x[i-1,i]   (i x 1,        semiperimeter i+1)
                   [i,500]x[i-1,i] ((500-i) x 1,  semiperimeter 501-i)
  row 250:         [0,500]x[249,250] (500 x 1,    semiperimeter 501)
  widths used: {1,...,249} u {251,...,499} u {500} = {1..500} minus {250}
  semiperimeters: {2..501}\{251}

Top half  y in [250,500]:
  [499,500]x[250,500]              (1 x 250, semiperimeter 251)
  for t = 3..22 (heights sum 250):
     [0,499] x [250+sum_{u< t}u, 250+sum_{u<=t}u]   (499 x t, semiperimeter 499+t)
  semiperimeters: 251 and {502,...,521}

Total k = 499 + 20 + 1 = 520; semiperimeters are exactly 2..521 (distinct); area = 250000.
Upper bound: min area of an integer rectangle inside the square with semiperimeter s is
s-1 for s<=501 and 500(s-500) for s>=502; sum_{s=2}^{521} min_area(s)=240250<=250000 but
sum_{s=2}^{522}=251250>250000, so k<=520. Hence K=520.
"""
import itertools

def build():
    S = 500
    rects = []          # (x0, y0, x1, y1)
    for i in range(1, 250):
        rects.append((0, i - 1, i, i))
        rects.append((i, i - 1, S, i))
    rects.append((0, 249, S, 250))
    rects.append((499, 250, 500, 500))
    y = 250
    for t in range(3, 23):
        rects.append((0, y, 499, y + t))
        y += t
    assert y == 500
    return rects

def verify(rects, S=500):
    for x0, y0, x1, y1 in rects:
        assert 0 <= x0 < x1 <= S and 0 <= y0 < y1 <= S
    sides = [(x1 - x0, y1 - y0) for x0, y0, x1, y1 in rects]
    assert all(a >= 1 and b >= 1 for a, b in sides)
    area = sum(a * b for a, b in sides)
    assert area == S * S, area
    sem = [a + b for a, b in sides]
    assert len(set(sem)) == len(sem)
    for p, q in itertools.combinations(range(len(rects)), 2):
        ax0, ay0, ax1, ay1 = rects[p]
        bx0, by0, bx1, by1 = rects[q]
        w = min(ax1, bx1) - max(ax0, bx0)
        h = min(ay1, by1) - max(ay0, by0)
        assert not (w > 0 and h > 0), (p, q)
    return len(rects), area, min(sem), max(sem)

if __name__ == "__main__":
    R = build()
    k, area, lo, hi = verify(R)
    print("k =", k, "area =", area, "semiperimeters = [%d,%d]" % (lo, hi))
    print("semiperimeters exactly 2..521:", sorted(a + b for a, b in
          [(x1 - x0, y1 - y0) for x0, y0, x1, y1 in R]) == list(range(2, 522)))
    print("K = 520, K mod 10^5 =", 520 % 100000)
