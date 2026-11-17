// Density normalisation, as for Hi-C style matrices.
// The number of edges between two regions mostly follows how many haploblocks each region holds,
// so raw counts show stripes. The expected count for a cell is (row total x column total) / grand total;
// enrichment is log2((observed + 1) / (expected + 1)). The pseudo-count keeps empty or tiny cells quiet.
//
// cells: [{ x, y, n }]  (mutated: adds e = expected, lr = log2 enrichment)
// sym:   true when the matrix is a chromosome against itself and only x <= y is stored.
export function enrichment(cells, nx, ny, sym) {
  const mx = new Float64Array(nx)
  const my = new Float64Array(sym ? 0 : ny)
  let total = 0
  for (const c of cells) {
    if (sym) {
      mx[c.x] += c.n
      if (c.x !== c.y) mx[c.y] += c.n
    } else {
      mx[c.x] += c.n
      my[c.y] += c.n
    }
  }
  for (let i = 0; i < nx; i++) total += mx[i]
  if (!total) {
    for (const c of cells) {
      c.e = 0
      c.lr = 0
    }
    return cells
  }
  for (const c of cells) {
    c.e = (sym ? mx[c.x] * mx[c.y] : mx[c.x] * my[c.y]) / total
    c.lr = Math.log2((c.n + 1) / (c.e + 1))
  }
  return cells
}
