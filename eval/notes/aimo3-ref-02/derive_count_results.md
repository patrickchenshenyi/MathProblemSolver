# aimo3-21818 tournament orderings — verified result

Original problem (AIMO3 row `aimo3-21818`, reference answer **21818**; the prompt's
"220 / 220-i / 105" are LaTeX-degraded "$2^{20} / 2^{20-i} / 10^5$"):

> $2^{20}$ runners, distinct speeds, 20 rounds, equal-score pairing each round,
> winner of round $i$ gets $2^{20-i}$ points, loser 0. $N$ = number of possible
> final orderings. $k$ = largest integer with $10^k\mid N$. Find $k \bmod 10^5$.

## Model

- Final score $=\sum_{i:\text{won}}2^{20-i}$, a 20-bit integer. By induction the
  multiset of scores after round $i$ is every $i$-bit prefix, each repeated
  $2^{20-i}$ times, so the final scores are $\{0,\dots,2^{20}-1\}$ each exactly
  once: no ties. Every score class has size a power of two, so it is even and
  no bye is ever needed; "ordering" = total order = bijection runner -> score.
- Round 1: winner set $W$ scores $\ge 2^{19}$, complement $L$ scores $\le 2^{19}-1$,
  so the order is (order inside $W$) then (order inside $L$).
- $W$ is realisable iff it admits a perfect matching to $L$ with each winner
  faster than its partner. With runners ranked $1..2^m$ fastest-first, Hall's
  condition is $|W\cap[1..t]|\ge|L\cap[1..t]|\ \forall t$ (ballot condition);
  the number of such $W$ is Catalan$(2^{m-1})=\binom{2^m}{2^{m-1}}/(2^{m-1}+1)$.
- The orderings inside $W$ and $L$ are independent $(m-1)$-round tournaments;
  relabelling in speed order shows each has $N_{m-1}$ orderings.

$$N_m = \mathrm{Cat}(2^{m-1})\,N_{m-1}^2,\qquad N_1=1
  \qquad\Longrightarrow\qquad
  N_{20}=\prod_{j=0}^{19}\mathrm{Cat}(2^{j})^{\,2^{19-j}}$$

## Valuations

$v_p(\mathrm{Cat}(n))=v_p\binom{2n}{n}-v_p(n+1)$. For $n=2^j$,
$v_2\binom{2^{j+1}}{2^j}=s_2(2^j)=1$ and $2^j+1$ is odd, so
$v_2(\mathrm{Cat}(2^j))=1$ for $j\ge1$, $0$ for $j=0$:

$$v_2(N_{20})=\sum_{j=1}^{19}2^{19-j}=2^{19}-1=524287.$$

Legendre/Kummer gives the per-term $v_5$:

| j | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| $v_5(\mathrm{Cat}(2^j))$ | 0 | 0 | 0 | 1 | 1 | 0 | 2 | 1 | 0 | 1 | 1 | 3 | 3 | 4 | 0 | 2 | 3 | 5 | 4 | 6 |

$$v_5(N_{20})=\sum_{j=0}^{19}2^{19-j}v_5(\mathrm{Cat}(2^j))=121818.$$

$$k=\min(v_2,v_5)=121818,\quad k\bmod 10^5=\boxed{21818}\ \text{(matches reference)},$$
$$\text{literal }k\bmod105=18.$$

## Verification

- `work/derive_count.py`: brute-force enumeration of all pairings gives
  $N_1,N_2,N_3=1,2,56$, equal to the recursion; winner-set counts
  $1,2,14,1430=\mathrm{Cat}(2^{m-1})$ for $m=1..4$.
- `work/verify_independent.py`: per-term valuations confirmed by Kummer carry
  counts AND by exact $\mathrm{Cat}(2^j)$ (including $j=19$); exact big-integer
  $N_m$ for $m=1..14$ reproduces both $v_2$ and $v_5$ from the formula.
- Explicit Hopcroft-Karp matching check confirms "W admits a winner->loser
  matching" equals the ballot condition, count $=\mathrm{Cat}(2^{m-1})$, $m\le4$.
- Official CSV `aimo3-21818` answer = 21818.

**Answer: k = 121818; k mod 10^5 = 21818 (k mod 105 = 18).**
