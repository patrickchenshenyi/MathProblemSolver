#!/usr/bin/env python3
"""L1 constraint predicate for aime-1987-05 (answer 588). Hand-written ground truth.

Find 3 x^2 y^2 where x,y are integers and y^2 + 3 x^2 y^2 = 30 x^2 + 517.
The candidate n must be 3 x^2 y^2 for some integer (x,y) satisfying that equation.
"""
import json
import math
import sys


def verify(n: int) -> list[str]:
    failures = []
    if n <= 0:
        failures.append("3 x^2 y^2 must be positive")
        return failures
    found = False
    for x in range(1, 200):
        denom = 3 * x * x
        if n % denom != 0:
            continue
        y2 = n // denom
        y = math.isqrt(y2)
        if y * y != y2:
            continue
        if y * y + 3 * x * x * y * y == 30 * x * x + 517:
            found = True
            break
    if not found:
        failures.append("no integer (x,y) satisfies y^2 + 3 x^2 y^2 = 30 x^2 + 517 with 3 x^2 y^2 = n")
    return failures


if __name__ == '__main__':
    print(json.dumps(verify(int(sys.argv[1]))))
