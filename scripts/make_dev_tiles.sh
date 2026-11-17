#!/bin/sh
# make_dev_tiles.sh - synthetic tiles in the exact format make_tiles.sh writes, for developing the app
# without the real data. Covers the chord table, chromosome pairs among chr1/6/21/22, and networks for
# chr21 and chr22. Everything here is made up (index.json carries "dev": true so the page says so).
# Usage: sh scripts/make_dev_tiles.sh public/data
set -eu
OUT=${1:-public/data}
mkdir -p "$OUT/matrix" "$OUT/edges" "$OUT/network"

awk -v OUT="$OUT" '
function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
function name(c, bin,   s, e) {
  s = bin * 1000000 + int(rnd() * 800000); e = s + 20000 + int(rnd() * 130000)
  return sprintf("chr%d_%d-%d_cluster%d", c, s, e, 1 + int(rnd() * 400))
}
BEGIN {
  seed = 20261116
  split("248 241 197 189 180 170 158 144 137 133 134 132 113 105 101 89 82 79 58 63 46 50", MB, " ")
  nb = 5; BN[1] = "2-3"; BN[2] = "3-5"; BN[3] = "5-10"; BN[4] = "10-20"; BN[5] = ">=20"
  FR[1] = .62; FR[2] = .25; FR[3] = .10; FR[4] = .028; FR[5] = .002
  LO[1] = 2; LO[2] = 3; LO[3] = 5; LO[4] = 10; LO[5] = 20
  HI[1] = 3; HI[2] = 5; HI[3] = 10; HI[4] = 20; HI[5] = 60
  TOTAL = 2797635191
  # index.json
  f = OUT "/index.json"
  printf "{\n  \"dev\": true,\n  \"generated\": \"dev\",\n  \"edges_total\": %d,\n  \"bin_bp\": 1000000,\n  \"k_per_bin_pair\": 10,\n  \"edge_min_lift\": 5,\n  \"network_min_lift\": 8,\n  \"network_top\": 3000,\n  \"bands\": \"2,3,5,10,20\",\n  \"max_bin\": {", TOTAL > f
  for (c = 1; c <= 22; c++) printf "%s\n    \"chr%d\": %d", (c > 1 ? "," : ""), c, MB[c] > f
  printf "\n  }\n}\n" > f
  close(f)
  # chord table
  sum = 0
  for (a = 1; a <= 22; a++) for (b = a; b <= 22; b++) { W[a, b] = (MB[a] + 1) * (MB[b] + 1) * (a == b ? 0.06 : 1); sum += W[a, b] }
  f = OUT "/chrpair_by_band.tsv"
  print "chrom_a\tchrom_b\tlift_band\tn_edges\tmean_weight" > f
  for (a = 1; a <= 22; a++) for (b = a; b <= 22; b++) for (k = 1; k <= nb; k++)
    printf "chr%d\tchr%d\t%s\t%d\t%.2f\n", a, b, BN[k], TOTAL * W[a, b] / sum * FR[k], 6 + rnd() * 8 + k > f
  close(f)
  # pair tiles for chr1/6/21/22
  split("1 6 21 22", S, " ")
  for (i = 1; i <= 4; i++) for (j = i; j <= 4; j++) {
    a = S[i]; b = S[j]; nA = MB[a] + 1; nB = MB[b] + 1
    mf = OUT "/matrix/chr" a "_chr" b ".tsv"; ef = OUT "/edges/chr" a "_chr" b ".tsv"
    print "bin_a\tbin_b\tlift_band\tn_edges\tmean_weight\tmax_lift" > mf
    print "bin_a\tbin_b\tsource\ttarget\tweight\tlift" > ef
    for (h = 1; h <= 4; h++) { HX[h] = rnd() * nA; HY[h] = rnd() * nB }
    for (x = 0; x < nA; x++) for (y = (a == b ? x : 0); y < nB; y++) {
      hot = 0
      for (h = 1; h <= 4; h++) hot += exp(-((x - HX[h]) ^ 2 + (y - HY[h]) ^ 2) / 40)
      if (rnd() > 0.28 + 0.5 * hot) continue
      n = int(3 + exp(rnd() * 4) * (1 + 8 * hot))
      mx = 0
      for (k = 1; k <= nb; k++) {
        c = int(n * FR[k] * (0.6 + rnd() * 0.8) + (k == 1 ? 1 : 0))
        if (k >= 4 && rnd() > 0.15 + hot) c = 0
        if (c < 1) continue
        ml = LO[k] + rnd() * (HI[k] - LO[k])
        printf "%d\t%d\t%s\t%d\t%.2f\t%.2f\n", x, y, BN[k], c, 5 + rnd() * 14, ml > mf
        if (ml > mx) mx = ml
      }
      if (mx >= 5 && n >= 25) {
        r = 2 + int(rnd() * 7)
        for (e = 1; e <= r; e++)
          printf "%d\t%d\t%s\t%s\t%d\t%.4f\n", x, y, name(a, x), name(b, y), 5 + int(rnd() * 40), 5 + rnd() * (mx - 5) > ef
      }
    }
    close(mf); close(ef)
  }
  # networks for chr21 and chr22
  for (t = 21; t <= 22; t++) {
    L = (MB[t] + 1) * 1000000; N = 1500
    for (v = 1; v <= N; v++) { S0[v] = int(rnd() * (L - 200000)); E0[v] = S0[v] + 20000 + int(rnd() * 130000); CL[v] = 1 + int(rnd() * 400); D[v] = 0; M[v] = 0 }
    ef = OUT "/network/chr" t ".edges.tsv"; nf = OUT "/network/chr" t ".nodes.tsv"
    print "source\ttarget\tweight\tlift" > ef
    for (k = 0; k < 3000; k++) {
      u = 1 + int(N * rnd() ^ 2); v = 1 + int(rnd() * N)
      if (u == v) continue
      li = 8 + exp(rnd() * 3.2); w = 5 + int(rnd() * 30)
      printf "chr%d_%d-%d_cluster%d\tchr%d_%d-%d_cluster%d\t%d\t%.4f\n", t, S0[u], E0[u], CL[u], t, S0[v], E0[v], CL[v], w, li > ef
      D[u]++; D[v]++; if (li > M[u]) M[u] = li; if (li > M[v]) M[v] = li
    }
    close(ef)
    print "node\tchrom\tstart\tend\tcluster\tdegree\tmax_lift" > nf
    for (v = 1; v <= N; v++) if (D[v] > 0)
      printf "chr%d_%d-%d_cluster%d\tchr%d\t%d\t%d\t%d\t%d\t%.4f\n", t, S0[v], E0[v], CL[v], t, S0[v], E0[v], CL[v], D[v], M[v] > nf
    close(nf)
  }
}'
echo "dev tiles in $OUT"
du -sh "$OUT"
