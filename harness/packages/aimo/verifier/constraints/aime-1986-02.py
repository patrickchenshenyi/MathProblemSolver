#!/usr/bin/env python3
"""L1 constraint predicate for aime-1986-02 (answer 104). Hand-written ground truth.

Product (a+b+c)(-a+b+c)(a-b+c)(a+b-c) with a=sqrt(5), b=sqrt(6), c=sqrt(7)
equals 2(a^2 b^2 + b^2 c^2 + c^2 a^2) - (a^4 + b^4 + c^4).
"""
import json
import sys


def verify(n: int) -> list[str]:
    failures = []
    a2, b2, c2 = 5, 6, 7
    expected = 2 * (a2 * b2 + b2 * c2 + c2 * a2) - (a2 * a2 + b2 * b2 + c2 * c2)
    if n != expected:
        failures.append(f"product must equal 2(a^2 b^2 + b^2 c^2 + c^2 a^2) - (a^4+b^4+c^4) = {expected}")
    return failures


if __name__ == '__main__':
    print(json.dumps(verify(int(sys.argv[1]))))
