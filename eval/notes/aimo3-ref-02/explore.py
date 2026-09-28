#!/usr/bin/env python3
"""Explore W(n,r) = number of achievable final weak orders, and state space."""
import sys
from collections import defaultdict
from itertools import product
sys.path.insert(0, '.')
from brute_small import perfect_pairings, step, weak_key, vp


def reachable(n, r):
    states = {tuple([0] * n)}
    for i in range(r):
        w = n - 1 - i
        nxt = set()
        for s in states:
            nxt |= step(s, w)
        states = nxt
    return states


def main():
    print(f"{'n':>3} {'r':>2} {'#states':>9} {'W':>12}")
    for n in range(2, 13):
        for r in range(1, min(n, 12) + 1):
            st = reachable(n, r)
            w = len({weak_key(s) for s in st})
            print(f"{n:>3} {r:>2} {len(st):>9} {w:>12}")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
