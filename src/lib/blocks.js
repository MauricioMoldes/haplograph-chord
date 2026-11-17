import * as d3 from 'd3'

export const fmt = d3.format(',')

// "chr21_39655927-39674795_cluster90" -> { chrom, start, end, cluster }
export function parseBlock(name) {
  const [chrom, range, cl] = name.split('_')
  const [start, end] = range.split('-').map(Number)
  return { chrom, start, end, cluster: (cl || '').replace('cluster', '') }
}

export const region = (b) => `${b.chrom}:${fmt(b.start)}–${fmt(b.end)}`

export const mb = (bp) => String(+(bp / 1e6).toFixed(1))

export const compact = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} billion` : n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : fmt(n)

export const chrColor = (i, n = 22) => d3.hcl(((i * 360) / n + 20) % 360, 42, 66).formatHex()

// Lift bands are named like make_tiles.sh writes them: "2-3", "3-5", ">=20".
export const bandLo = (b) => (b.startsWith('>=') ? +b.slice(2) : +b.split('-')[0])
export const bandLabel = (b) => (b.startsWith('>=') ? `≥ ${b.slice(2)}` : b)

// Bands as a short caption: "lift 5-10, 10-20, ≥ 20".
export const bandsCaption = (all, on) =>
  on.size === all.length ? 'all lift bands' : `lift ${all.filter((b) => on.has(b)).map(bandLabel).join(', ')}`

// Chromosome numbers present in the data, from index.json.
export const chromosomes = (idx) =>
  Object.keys(idx.max_bin)
    .map((k) => +k.replace('chr', ''))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
