#!/usr/bin/env python3
"""L1 constraint predicate for aime-1991-01 (answer 146). Hand-written ground truth.

Find x^2 + y^2 where x,y are positive integers, xy + x + y = 71, and x^2 y + x y^2 = 880.
The candidate n must be x^2 + y^2 for some positive integer (x,y) satisfying both equations.
"""
import json
import sys


def verify(n: int) -> list[str]:
    failures = []
    found = False
    for x in range(1, 100):
        for y in range(1, 100):
            if x * y + x + y == 71 and x * x * y + x * y * y == 880:
                if x * x + y * y == n:
                    found = True
                    break
        if found:
            break
    if not found:
        failures.append("no positive integers (x,y) satisfy xy+x+y=71, x^2 y + x y^2 = 880 with x^2 + y^2 = n")
    return failures


if __name__ == '__main__':
    print(json.dumps(verify(int(sys.argv[1]))))
