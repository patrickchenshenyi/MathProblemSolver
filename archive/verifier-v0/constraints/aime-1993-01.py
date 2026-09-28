#!/usr/bin/env python3
"""L1 constraint predicate for aime-1993-01 (answer 728). Hand-written ground truth.

The candidate n must equal the count of even integers in [4000, 7000] with four
distinct digits (a deterministic recount, not a stored constant).
"""
import json
import sys


def verify(n: int) -> list[str]:
    failures = []
    count = sum(1 for m in range(4000, 7000) if m % 2 == 0 and len(set(str(m))) == 4)
    if n != count:
        failures.append(f"count of even integers in [4000,7000] with 4 distinct digits is {count}, not {n}")
    return failures


if __name__ == '__main__':
    print(json.dumps(verify(int(sys.argv[1]))))
