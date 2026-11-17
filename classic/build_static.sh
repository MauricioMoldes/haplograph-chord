#!/bin/sh
# Bake chrpair_by_band.tsv into the page so it needs no file load at all.
# Usage: sh build_static.sh haplograph_chord.html chrpair_by_band.tsv OUT.html
set -eu
H=$1; T=$2; O=$3
[ -f "$H" ] && [ -f "$T" ] || { echo "usage: sh build_static.sh haplograph_chord.html chrpair_by_band.tsv OUT.html"; exit 1; }
grep -q '/\*__DATA__\*/' "$H" || { echo "marker /*__DATA__*/ not found in $H (use the latest haplograph_chord.html)"; exit 1; }
awk -v T="$T" '
index($0,"/*__DATA__*/") {
  printf "const EMBEDDED_TSV = \n"
  while ((getline line < T) > 0) {
    gsub(/\\/,"\\\\",line); gsub(/"/,"\\\"",line); gsub(/\r/,"",line); gsub(/\t/,"\\t",line)
    printf "  \"%s\\n\" +\n", line
  }
  printf "  \"\";\n"
  next
}
{ print }' "$H" > "$O"
echo "wrote $O ($(wc -c < "$O") bytes, $(wc -l < "$T") table lines embedded)"
