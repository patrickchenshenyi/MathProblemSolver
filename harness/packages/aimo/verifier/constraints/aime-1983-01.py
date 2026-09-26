#!/usr/bin/env python3
"""L1 constraint predicate for aime-1983-01 (answer 60). Hand-written ground truth.

Problem: log_x(w)=24, log_y(w)=40, log_{xyz}(w)=12; find log_z(w).
In base w: log_w x = 1/24, log_w y = 1/40, log_w(xyz) = 1/12, so
log_w z = 1/12 - 1/24 - 1/40 = 1/60, hence n = log_z w = 60.
"""
import json
import sys
from fractions import Fraction


def verify(n: int) -> list[str]:
    failures = []
    if n <= 0:
        failures.append("log_z(w) must be positive")
        return failures
    if Fraction(1, n) != Fraction(1, 12) - Fraction(1, 24) - Fraction(1, 40):
        failures.append("violates log identity: 1/log_z(w) must equal 1/12 - 1/24 - 1/40")
    return failures


if __name__ == '__main__':
    print(json.dumps(verify(int(sys.argv[1]))))
