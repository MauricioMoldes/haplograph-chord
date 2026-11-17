import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { locusLabel, locusUrl, useApp } from '../context.js'
import { DATA, bandNames, pairKey, useTsv } from '../lib/tiles.js'
import { bandLo, bandsCaption, fmt, mb, parseBlock, region } from '../lib/blocks.js'
import { go, goKeep, setParams } from '../lib/router.js'
import { enrichment } from '../lib/matrix.js'
import { captionLines, downloadText, saveFigure, slug, svgFrame, toCsv, xmlEsc } from '../lib/export.js'
import { BandChips, Crumbs, DownloadMenu, Legend, Panel, Segmented, Stat, TileState, Toolbar } from '../components/Ui.jsx'

const MAX_W = 820
const MAX_H = 560
const LR_MAX = 3 // enrichment colour range: x1/8 ... x8
const MIN_LIST_EDGES = 20 // squares need at least this many edges to appear in the enriched list
const AXIS_L = 44

const mrow = (d) => ({ x: +d.bin_a, y: +d.bin_b, band: d.lift_band, n: +d.n_edges, w: +d.mean_weight, l: +d.max_lift })
const erow = (d) => ({ x: +d.bin_a, y: +d.bin_b, source: d.source, target: d.target, w: +d.weight, lift: +d.lift })

const niceStep = (totalMb) => [5, 10, 20, 25, 50, 100].find((s) => s >= totalMb / 6) || 100
const colorObs = (n, nmax) => d3.interpolateBlues(0.12 + (0.88 * Math.log(n + 1)) / Math.log(nmax + 1))
const colorEnr = (lr) => d3.interpolateRdBu(0.5 - Math.max(-LR_MAX, Math.min(LR_MAX, lr)) / (2 * LR_MAX))

export default function Pair({ a, b, bins, params }) {
  const { idx, meta, chrs } = useApp()
  const { A, B, file } = pairKey(a, b)
  const sym = A === B
  const bands = useMemo(() => bandNames(idx.bands), [idx])
  const dflt = useMemo(() => {
    const high = bands.filter((x) => bandLo(x) >= 5)
    return high.length ? high : bands
  }, [bands])
  const bandParam = params.get('bands')
  const on = useMemo(() => {
    const s = new Set((bandParam || '').split(',').filter((x) => bands.includes(x)))
    return s.size ? s : new Set(dflt)
  }, [bandParam, bands, dflt])
  const color = params.get('color') === 'obs' ? 'obs' : 'enr'
  const swap = !sym && params.get('swap') === '1'
  const X = swap ? B : A
  const Y = swap ? A : B

  const tile = useTsv(`${DATA}/matrix/${file}.tsv`, mrow)
  const canvasRef = useRef(null)
  const [hover, setHover] = useState(null)

  const binBp = idx.bin_bp
  const nxC = (idx.max_bin[`chr${A}`] ?? 0) + 1
  const nyC = (idx.max_bin[`chr${B}`] ?? 0) + 1
  const nx = swap ? nyC : nxC
  const ny = swap ? nxC : nyC
  const cell = Math.max(1.2, Math.min(14, MAX_W / nx, MAX_H / ny))
  const W = Math.ceil(nx * cell)
  const H = Math.ceil(ny * cell)

  // Cells in tile coordinates (x on chrA, y on chrB), then displayed with or without swapped axes.
  const { cells, byKey, stats } = useMemo(() => {
    const m = new Map()
    for (const r of tile.data || []) {
      if (!on.has(r.band)) continue
      const k = r.x * 100000 + r.y
      const c = m.get(k) || { x: r.x, y: r.y, n: 0, sw: 0, l: 0 }
      c.n += r.n
      c.sw += r.w * r.n
      if (r.l > c.l) c.l = r.l
      m.set(k, c)
    }
    const list = [...m.values()]
    enrichment(list, nxC, nyC, sym)
    let n = 0
    let max = 0
    for (const c of list) {
      c.dx = swap ? c.y : c.x
      c.dy = swap ? c.x : c.y
      n += c.n
      if (c.n > max) max = c.n
    }
    const keyed = new Map(list.map((c) => [c.dx * 100000 + c.dy, c]))
    return { cells: list, byKey: keyed, stats: { n, max, count: list.length } }
  }, [tile.data, on, swap, nxC, nyC, sym])

  const fill = (c) => (color === 'enr' ? colorEnr(c.lr) : colorObs(c.n, stats.max))

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    cv.width = W * dpr
    cv.height = H * dpr
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#f4f7fb'
    ctx.fillRect(0, 0, W, H)
    const s = Math.max(cell - (cell > 4 ? 0.6 : 0), 1)
    for (const c of cells) {
      ctx.fillStyle = fill(c)
      ctx.fillRect(c.dx * cell, c.dy * cell, s, s)
    }
  }, [cells, color, stats, W, H, cell])

  const where = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return {
      x: Math.floor(((e.clientX - r.left) / r.width) * nx),
      y: Math.floor(((e.clientY - r.top) / r.height) * ny),
      px: e.clientX - r.left,
      py: e.clientY - r.top,
    }
  }
  const canonOf = (dx, dy) => (swap ? [dy, dx] : [dx, dy])
  const open = (cx, cy) => goKeep(`/pair/${A}-${B}/${cx}-${cy}`)

  const sel = bins ? byKey.get((swap ? bins[1] : bins[0]) * 100000 + (swap ? bins[0] : bins[1])) : null
  const selD = bins ? (swap ? [bins[1], bins[0]] : bins) : null
  const stepX = niceStep((nx * binBp) / 1e6)
  const stepY = niceStep((ny * binBp) / 1e6)
  const ticks = (n, step) => d3.range(0, (n * binBp) / 1e6, step)

  const topEnriched = useMemo(
    () => cells.filter((c) => c.n >= MIN_LIST_EDGES).sort((p, q) => q.lr - p.lr).slice(0, 8),
    [cells],
  )
  const caption = bandsCaption(bands, on)
  const label = (c) => (sym ? `chr${A}` : `chr${c}`)

  // ---- exports -----------------------------------------------------------------------------
  const gradientStops = () =>
    d3
      .range(0, 1.001, 0.1)
      .map((t) => `<stop offset="${t * 100}%" stop-color="${color === 'enr' ? d3.interpolateRdBu(1 - t) : d3.interpolateBlues(0.12 + 0.88 * t)}"/>`)
      .join('')

  const matrixFigure = (kind) => {
    const rects = cells
      .map((c) => `<rect x="${(AXIS_L + c.dx * cell).toFixed(2)}" y="${(c.dy * cell).toFixed(2)}" width="${(cell + 0.3).toFixed(2)}" height="${(cell + 0.3).toFixed(2)}" fill="${fill(c)}"/>`)
      .join('')
    const yt = ticks(ny, stepY)
      .map((t) => `<text x="${AXIS_L - 6}" y="${((t * 1e6) / binBp) * cell + 4}" font-size="11" fill="#475569" text-anchor="end">${t}</text>`)
      .join('')
    const xt = ticks(nx, stepX)
      .map((t) => `<text x="${AXIS_L + ((t * 1e6) / binBp) * cell}" y="${H + 16}" font-size="11" fill="#475569">${t}</text>`)
      .join('')
    const lgY = H + 56
    const legend =
      `<rect x="${AXIS_L}" y="${lgY}" width="200" height="10" fill="url(#lg)"/>` +
      `<text x="${AXIS_L}" y="${lgY + 24}" font-size="11" fill="#475569">${color === 'enr' ? `x${(2 ** -LR_MAX).toFixed(2)}` : '1'}</text>` +
      `<text x="${AXIS_L + 200}" y="${lgY + 24}" font-size="11" fill="#475569" text-anchor="end">${color === 'enr' ? `x${2 ** LR_MAX}` : fmt(stats.max)}</text>` +
      `<text x="${AXIS_L + 216}" y="${lgY + 9}" font-size="11" fill="#475569">${color === 'enr' ? 'enrichment over density expectation' : 'edges per square (log scale)'}</text>`
    const body =
      `<rect x="${AXIS_L}" y="0" width="${W}" height="${H}" fill="#f4f7fb"/>${rects}${yt}${xt}` +
      `<text x="${AXIS_L}" y="${H + 34}" font-size="12" fill="#334155">chr${X} position, Mb (columns) · chr${Y} position, Mb (rows)</text>${legend}`
    const title = sym ? `chr${A} against itself` : `chr${X} and chr${Y}`
    const { svg, width, height } = svgFrame({
      w: AXIS_L + W,
      h: H + 84,
      title,
      subtitle: `${fmt(stats.n)} edges in ${fmt(stats.count)} squares of ${mb(binBp)} Mb (${caption})`,
      caption: captionLines(meta, idx),
      body,
      extraDefs: `<linearGradient id="lg" x1="0" x2="1" y1="0" y2="0">${gradientStops()}</linearGradient>`,
    })
    return saveFigure(kind, `haplograph_chr${X}_chr${Y}_${color}_${slug(caption)}`, { svg, width, height })
  }

  const matrixCsv = () => {
    const rows = cells
      .slice()
      .sort((p, q) => p.x - q.x || p.y - q.y)
      .map((c) => ({
        chrom_a: `chr${A}`,
        start_a: c.x * binBp,
        end_a: (c.x + 1) * binBp,
        chrom_b: `chr${B}`,
        start_b: c.y * binBp,
        end_b: (c.y + 1) * binBp,
        n_edges: c.n,
        mean_weight: (c.sw / c.n).toFixed(2),
        max_lift: c.l.toFixed(2),
        expected_edges: c.e.toFixed(2),
        log2_enrichment: c.lr.toFixed(3),
      }))
    downloadText(
      `haplograph_chr${A}_chr${B}_squares_${slug(caption)}.csv`,
      toCsv(rows, ['chrom_a', 'start_a', 'end_a', 'chrom_b', 'start_b', 'end_b', 'n_edges', 'mean_weight', 'max_lift', 'expected_edges', 'log2_enrichment']),
      'text/csv',
    )
  }

  const hv = hover ? byKey.get(hover.x * 100000 + hover.y) : null

  return (
    <div>
      <div className="mb-3">
        <Crumbs
          items={[
            { label: 'Genome', to: '/' },
            { label: sym ? `chr${A} within` : `chr${A} ↔ chr${B}`, to: null },
          ]}
        />
      </div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        {sym ? `Where does chr${A} link to itself?` : `Where do chr${A} and chr${B} share haplotypes?`}
      </h1>
      <p className="mb-4 max-w-3xl text-slate-600">
        Each square is a pair of {mb(binBp)} Mb regions.{' '}
        {color === 'enr'
          ? 'Red squares have more edges than their row and column totals would predict; blue ones have fewer. Click a square to list its strongest block pairs.'
          : 'Darker means more edges between the two regions. Dense regions light up whole rows and columns, so try Enrichment to see links beyond that. Click a square to list its strongest block pairs.'}
      </p>

      <Toolbar>
        <BandChips all={bands} on={on} />
        <Segmented
          label="Colour"
          value={color}
          onChange={(v) => setParams({ color: v === 'enr' ? null : 'obs' })}
          options={[
            { value: 'enr', label: 'Enrichment', title: 'Edges over the count expected from the row and column totals' },
            { value: 'obs', label: 'Edges', title: 'Number of edges' },
          ]}
        />
        {!sym && (
          <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:border-sky-300" onClick={() => setParams({ swap: swap ? null : '1' })}>
            Swap axes
          </button>
        )}
        <div className="ml-auto flex items-center gap-4 text-sm">
          <a className="text-sky-700 hover:underline" href={`#/chr/${A}`}>chr{A} network</a>
          {!sym && <a className="text-sky-700 hover:underline" href={`#/chr/${B}`}>chr{B} network</a>}
          <DownloadMenu
            items={[
              { label: 'Figure (SVG)', onClick: () => matrixFigure('svg') },
              { label: 'Figure (PNG)', onClick: () => matrixFigure('png') },
              { label: 'Squares (CSV)', onClick: matrixCsv },
            ]}
          />
        </div>
      </Toolbar>

      <TileState state={tile} what={`chr${A} × chr${B} matrix`}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
          <div className="overflow-x-auto">
            <div className="relative" style={{ width: W + 64, height: H + 50 }}>
              <div className="absolute" style={{ left: 56, top: 6 }}>
                <canvas
                  ref={canvasRef}
                  style={{ width: W, height: H, cursor: 'crosshair', borderRadius: 6 }}
                  onMouseMove={(e) => setHover(where(e))}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    const p = where(e)
                    if (byKey.has(p.x * 100000 + p.y)) open(...canonOf(p.x, p.y))
                  }}
                />
                {selD && (
                  <div
                    className="pointer-events-none absolute border-2 border-orange-600"
                    style={{ left: selD[0] * cell - 1, top: selD[1] * cell - 1, width: Math.max(cell, 6) + 2, height: Math.max(cell, 6) + 2 }}
                  />
                )}
                {hover && (
                  <div
                    className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md"
                    style={{ left: Math.min(hover.px + 14, Math.max(W - 210, 0)), top: hover.py + 14 }}
                  >
                    <div className="font-semibold">
                      chr{X} {mb(hover.x * binBp)} Mb · chr{Y} {mb(hover.y * binBp)} Mb
                    </div>
                    {hv ? (
                      <div className="text-slate-500">
                        {fmt(hv.n)} edges · expected {fmt(Math.round(hv.e))}
                        <br />
                        enrichment x{(2 ** hv.lr).toFixed(2)} · max lift {hv.l.toFixed(1)}
                      </div>
                    ) : (
                      <div className="text-slate-400">no edges</div>
                    )}
                  </div>
                )}
              </div>
              <svg className="pointer-events-none absolute left-0 top-0" width={W + 64} height={H + 50} aria-hidden>
                {ticks(ny, stepY).map((t) => (
                  <text key={`y${t}`} x={50} y={6 + ((t * 1e6) / binBp) * cell + 4} fontSize="11" fill="#64748b" textAnchor="end">{t}</text>
                ))}
                {ticks(nx, stepX).map((t) => (
                  <text key={`x${t}`} x={56 + ((t * 1e6) / binBp) * cell} y={H + 22} fontSize="11" fill="#64748b">{t}</text>
                ))}
                <text x={56} y={H + 42} fontSize="12" fill="#475569">
                  chr{X} position, Mb (columns) · chr{Y} position, Mb (rows)
                </text>
              </svg>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Panel title="In view">
              <Stat label="Edges" value={fmt(stats.n)} />
              <Stat label="Non-empty squares" value={fmt(stats.count)} />
              {color === 'enr' ? (
                <Legend
                  from={d3.interpolateRdBu(1)}
                  to={d3.interpolateRdBu(0)}
                  left={`x${(2 ** -LR_MAX).toFixed(2)}`}
                  right={`x${2 ** LR_MAX}`}
                  caption="Enrichment over the density expectation"
                />
              ) : (
                <Legend from={d3.interpolateBlues(0.12)} to={d3.interpolateBlues(1)} left="1" right={fmt(stats.max)} caption="Edges per square (log scale)" />
              )}
            </Panel>
            {sel && (
              <Panel title="Selected square">
                <div className="text-sm leading-relaxed">
                  chr{A} {mb(bins[0] * binBp)}–{mb((bins[0] + 1) * binBp)} Mb
                  <br />
                  chr{B} {mb(bins[1] * binBp)}–{mb((bins[1] + 1) * binBp)} Mb
                  <div className="mt-1 text-slate-500">
                    {fmt(sel.n)} edges, expected {fmt(Math.round(sel.e))} (x{(2 ** sel.lr).toFixed(2)})
                    <br />
                    mean weight {(sel.sw / sel.n).toFixed(0)} · max lift {sel.l.toFixed(1)}
                  </div>
                </div>
              </Panel>
            )}
            <Panel title="Most enriched squares">
              {topEnriched.length === 0 ? (
                <div className="text-sm text-slate-500">None with at least {MIN_LIST_EDGES} edges.</div>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {topEnriched.map((c) => (
                    <li key={`${c.x}-${c.y}`} className="flex justify-between gap-2">
                      <button type="button" className="text-left text-sky-700 hover:underline" onClick={() => open(c.x, c.y)}>
                        {mb(c.x * binBp)} Mb × {mb(c.y * binBp)} Mb
                      </button>
                      <span className="tabular-nums text-slate-500">x{(2 ** c.lr).toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </TileState>

      {bins && <EdgeTable A={A} B={B} file={file} bx={bins[0]} by={bins[1]} params={params} />}
    </div>
  )
}

function EdgeTable({ A, B, file, bx, by, params }) {
  const { idx, meta } = useApp()
  const tile = useTsv(`${DATA}/edges/${file}.tsv`, erow)
  const sort = params.get('sort') === 'weight' ? 'weight' : 'lift'
  const minW = Math.max(0, +params.get('minw') || 0)

  const all = useMemo(() => {
    const out = []
    for (const r of tile.data || []) {
      if (r.x !== bx || r.y !== by) continue
      let s = parseBlock(r.source)
      let t = parseBlock(r.target)
      if (s.chrom !== `chr${A}` && t.chrom === `chr${A}`) [s, t] = [t, s]
      out.push({ s, t, w: r.w, lift: r.lift })
    }
    return out
  }, [tile.data, bx, by, A])
  const rows = useMemo(
    () => all.filter((r) => r.w >= minW).sort((p, q) => (sort === 'weight' ? q.w - p.w || q.lift - p.lift : q.lift - p.lift)),
    [all, sort, minW],
  )
  const lmax = d3.max(rows, (r) => r.lift) || 1

  const csv = () =>
    downloadText(
      `haplograph_chr${A}_${bx}_chr${B}_${by}_edges.csv`,
      toCsv(
        rows.map((r, i) => ({
          rank: i + 1,
          chrom_a: r.s.chrom, start_a: r.s.start, end_a: r.s.end, cluster_a: r.s.cluster,
          chrom_b: r.t.chrom, start_b: r.t.start, end_b: r.t.end, cluster_b: r.t.cluster,
          weight: r.w, lift: r.lift,
        })),
        ['rank', 'chrom_a', 'start_a', 'end_a', 'cluster_a', 'chrom_b', 'start_b', 'end_b', 'cluster_b', 'weight', 'lift'],
      ),
      'text/csv',
    )

  const link = (blk) => (
    <a className="text-sky-700 hover:underline" href={locusUrl(meta, blk.chrom, blk.start, blk.end)} target="_blank" rel="noreferrer" title={`Open in ${locusLabel(meta)}`}>
      {region(blk)}
    </a>
  )

  return (
    <section className="mt-8">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">The strongest links in this region pair</h2>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-slate-600">
            Sort by
            <select value={sort} onChange={(e) => setParams({ sort: e.target.value === 'lift' ? null : e.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-1">
              <option value="lift">lift</option>
              <option value="weight">weight</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-slate-600">
            Min weight
            <input
              type="number"
              min="0"
              value={minW || ''}
              placeholder="0"
              onChange={(e) => setParams({ minw: e.target.value })}
              className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1"
            />
          </label>
          <DownloadMenu items={[{ label: 'Table (CSV)', onClick: csv }]} />
        </div>
      </div>
      <p className="mb-3 max-w-3xl text-sm text-slate-600">
        The top {idx.k_per_bin_pair} edges by lift for this pair of squares. Lift is how much more often two haplotype blocks occur together than chance predicts; weight is the number of individuals carrying both.
      </p>
      <TileState state={tile} what="edge list">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            {all.length === 0
              ? `No edge list for this square. Edge lists only exist for squares with an edge of lift ≥ ${idx.edge_min_lift}.`
              : 'No edges pass the weight filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-sky-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Block on chr{A}</th>
                  <th className="px-4 py-2">Block on chr{B}</th>
                  <th className="px-4 py-2">Lift</th>
                  <th className="px-4 py-2">Weight</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-2 tabular-nums">{link(r.s)} <span className="text-slate-400">· cluster {r.s.cluster}</span></td>
                    <td className="px-4 py-2 tabular-nums">{link(r.t)} <span className="text-slate-400">· cluster {r.t.cluster}</span></td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-12 font-semibold tabular-nums text-orange-700">{r.lift.toFixed(1)}</span>
                        <div className="h-1.5 rounded bg-sky-600/70" style={{ width: `${(100 * r.lift) / lmax}px` }} />
                      </div>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{r.w}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TileState>
    </section>
  )
}
