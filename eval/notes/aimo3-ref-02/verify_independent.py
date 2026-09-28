"""
Independent verification of the per-term valuations and of v2(N), v5(N).

Method A (Kummer): v_p(binom(2n,n)) = number of carries when adding n+n in base p.
Method B (Legendre, the main script) -- compare.
Method C: exact big-integer N_m for m <= 14, read off v2, v5 directly.
Method D: strip 2s and 5s from each Catalan(2^j) exactly (needs comb up to j=M-1).
"""
from math import comb

def carries_add(n, p):
    """number of carries when adding n+n in base p (Kummer)."""
    c = 0; carry = 0
    while n or carry:
        s = (n % p) * 2 + carry
        carry = s // p
        c += carry
        n //= p
    return c

def vp_int(n, p):
    e = 0
    while n % p == 0: n //= p; e += 1
    return e

def vp_catalan_kummer(n, p):
    return carries_add(n, p) - vp_int(n + 1, p)

for p in (2, 5):
    print(f"Kummer vs Legendre for p={p}:")
    for j in range(20):
        n = 2**j
        L = vp_catalan_kummer(n, p)  # Kummer
        # build exact Catalan only for small j, else trust comb
        C = comb(2*n, n) // (n + 1)
        exact = vp_int(C, p)
        assert L == exact, (j, p, L, exact)
        print(f"  j={j:2d} n=2^{j:2d}: Kummer={L}, exact v_p(Catalan)={exact}")
print("per-term valuations verified by Kummer + direct exact Catalan.\n")

# ---- exact N_m for m <= 14 via recursion, compare formula valuations ----
def formula_vals(m):
    V2 = sum(vp_catalan_kummer(2**j, 2) * 2**(m-1-j) for j in range(m))
    V5 = sum(vp_catalan_kummer(2**j, 5) * 2**(m-1-j) for j in range(m))
    return V2, V5

for m in range(1, 15):
    N = 1
    for i in range(1, m+1):
        n = 2**(i-1)
        N = (comb(2*n, n)//(n+1)) * N**2
    e2, e5 = vp_int(N, 2), vp_int(N, 5)
    f2, f5 = formula_vals(m)
    assert (e2, e5) == (f2, f5), (m, e2, e5, f2, f5)
print("exact N_m for m=1..14 matches formula valuations for both p=2 and p=5.")

# final numbers for m=20
V2, V5 = formula_vals(20)
k = min(V2, V5)
print(f"\nM=20: v2={V2}, v5={V5}, k={k}, k mod 10^5={k%100000}, k mod 105={k%105}")
