#!/usr/bin/env python3
"""L1 constraint predicate for aime-1988-03 (answer 7). Hand-written ground truth.

(log_2 3)(log_3 4) ... (log_127 128) telescopes to log_2 128 = n, so 2^n = 128.
"""
import json
import sys


def verify(n: int) -> list[str]:
    failures = []
    if n < 0 or 2 ** n != 128:
        failures.append("log product telescopes to log_2 128 = n, so 2^n must equal 128")
    return failures


if __name__ == '__main__':
    print(json.dumps(verify(int(sys.argv[1]))))
