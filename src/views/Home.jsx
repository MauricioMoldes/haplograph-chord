import React, { useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useApp } from '../context.js'
import { DATA, bandNames, useTsv } from '../lib/tiles.js'
import { bandsCaption, chrColor, compact, fmt } from '../lib/blocks.js'
import { go, setParams } from '../lib/router.js'
import { enrichment } from '../lib/matrix.js'
import { captionLines, downloadText, saveFigure, slug, svgFrame, toCsv } from '../lib/export.js'
import { BandChips, Chip, DownloadMenu, Legend, Notice, Panel, Segmented, Stat, TileState, Toolbar } from '../components/Ui.jsx'

const R = 330
const CELL = 30
const LR_MAX = 1 // chromosome heatmap: colour range is x1/2 ... x2
const parseChr = (s) => +String(s).replace('chr', '')
const row = (d) => ({ a: parseChr(d.chrom_a), b: parseChr(d.chrom_b), band: d.lift_band, n: +d.n_edges })

export default function Home({ params }) {
  const { idx, meta, chrs } = useApp()
  const bands = useMemo(() => bandNames(idx.bands), [idx])
  const tsv = useTsv(`${DATA}/chrpair_by_band.tsv`, row)
  const svgRef = useRef(null)
  const [tip, setTip] = useState(null)

  const view = params.get('view') === 'heat' ? 'heat' : 'chord'
  const norm = params.get('color') === 'enr' ? 'enr' : 'obs'
  const showSame = params.get('same') !== '0'
  const sqrt = params.get('sqrt') === '1'
  const focus = +params.get('focus') || null
  const bandParam = params.get('bands')
  const on = useMemo(() => {
    const s = new Set((bandParam || '').split(',').filter((b) => bands.includes(b)))
    return s.size ? s : new Set(bands)
  }, [bandParam, bands])

  const n = chrs.length
  const at = useMemo(() => new Map(chrs.map((c, i) => [c, i])), [chrs])

  const pairs = useMemo(() => {
    const m = new Map()
    for (const r of tsv.data || []) {
      if (!at.has(r.a) || !at.has(r.b)) continue
      if (!on.has(r.band) || (!showSame && r.a === r.b)) continue
      const k = `${Math.min(r.a, r.b)}-${Math.max(r.a, r.b)}`
      m.set(k, (m.get(k) || 0) + r.n)
    }
    return m
  }, [tsv.data, on, showSame, at])

  const total = useMemo(() => [...pairs.values()].reduce((s, v) => s + v, 0), [pairs])
  const cross = useMemo(() => [...pairs].reduce((s, [k, v]) => (k.split('-')[0] !== k.split('-')[1] ? s + v : s), 0), [pairs])

  // Chord layout
  const chord = useMemo(() => {
    const mat = chrs.map(() => chrs.map(() => 0))
    const f = (v) => (sqrt ? Math.sqrt(v) : v)
    for (const [k, v] of pairs) {
      const [a, b] = k.split('-').map(Number)
      mat[at.get(a)][at.get(b)] = f(v)
      if (a !== b) mat[at.get(b)][at.get(a)] = f(v)
    }
    const c = d3.chord().padAngle(0.03).sortSubgroups(d3.descending)(mat)
    return { chords: c, groups: c.groups }
  }, [pairs, sqrt, chrs, at])

  // Heatmap cells (upper triangle stored, drawn both ways)
  const heat = useMemo(() => {
    const cells = []
    for (const [k, v] of pairs) {
      const [a, b] = k.split('-').map(Number)
      const x = Math.min(at.get(a), at.get(b))
      const y = Math.max(at.get(a), at.get(b))
      cells.push({ x, y, n: v, a, b })
    }
    enrichment(cells, n, n, true)
    const nmax = d3.max(cells, (c) => c.n) || 1
    return { cells, nmax }
  }, [pairs, n, at])

  const heatColor = (c) =>
    norm === 'enr'
      ? d3.interpolateRdBu(0.5 - Math.max(-LR_MAX, Math.min(LR_MAX, c.lr)) / (2 * LR_MAX))
      : d3.interpolateBlues(0.1 + (0.9 * Math.log(c.n + 1)) / Math.log(heat.nmax + 1))

  const arc = d3.arc().innerRadius(R - 14).outerRadius(R)
  const ribbon = d3.ribbon().radius(R - 16)
  const keyOf = (c) => {
    const a = chrs[c.source.index]
    const b = chrs[c.target.index]
    return `${Math.min(a, b)}-${Math.max(a, b)}`
  }
  const top = [...pairs].sort((x, y) => y[1] - x[1]).slice(0, 8)
  const caption = bandsCaption(bands, on)

  const figure = (kind) => {
    const el = svgRef.current
    const vb = el.viewBox.baseVal
    const title = view === 'chord' ? 'Edges between chromosomes' : norm === 'enr' ? 'Chromosome pairs: enrichment over density' : 'Chromosome pairs: edges'
    const sub = `${compact(total)} edges (${caption}${showSame ? '' : ', between chromosomes only'})`
    const { svg, width, height } = svgFrame({
      w: vb.width,
      h: vb.height,
      title,
      subtitle: sub,
      caption: captionLines(meta, idx),
      body: el.innerHTML,
    })
    return saveFigure(kind, `haplograph_genome_${view}_${slug(caption)}`, { svg, width, height })
  }
  const csv = () => {
    const rows = (tsv.data || []).filter((r) => on.has(r.band) && (showSame || r.a !== r.b))
    downloadText(`haplograph_chromosome_pairs_${slug(caption)}.csv`, toCsv(rows.map((r) => ({ chrom_a: `chr${r.a}`, chrom_b: `chr${r.b}`, lift_band: r.band, n_edges: r.n })), ['chrom_a', 'chrom_b', 'lift_band', 'n_edges']), 'text/csv')
  }

  const showTip = (e, a, b, v, extra) => {
    const r = svgRef.current.getBoundingClientRect()
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, a, b, n: v, extra })
  }

  return (
    <div>
      <p className="mb-4 max-w-3xl text-slate-600">
        {view === 'chord'
          ? 'Each ribbon joins two chromosomes and its width is the number of edges between them. Click a ribbon to open the block-by-block matrix for that pair, or a chromosome to focus it.'
          : 'Each square is a pair of chromosomes. Click one to open the block-by-block matrix for that pair.'}
      </p>
      <Toolbar>
        <Segmented
          label="View"
          value={view}
          onChange={(v) => setParams({ view: v === 'chord' ? null : v })}
          options={[{ value: 'chord', label: 'Chord' }, { value: 'heat', label: 'Heatmap' }]}
        />
        <BandChips all={bands} on={on} />
        <Chip on={showSame} onClick={() => setParams({ same: showSame ? '0' : null })} title="Include edges inside one chromosome">
          same chromosome
        </Chip>
        {view === 'chord' ? (
          <Chip on={sqrt} onClick={() => setParams({ sqrt: sqrt ? null : '1' })} title="Square-root ribbon widths, so small pairs stay visible">
            square-root widths
          </Chip>
        ) : (
          <Segmented
            label="Colour"
            value={norm}
            onChange={(v) => setParams({ color: v === 'enr' ? 'enr' : null })}
            options={[
              { value: 'obs', label: 'Edges', title: 'Number of edges' },
              { value: 'enr', label: 'Enrichment', title: 'Observed over expected from chromosome totals' },
            ]}
          />
        )}
        <div className="ml-auto flex items-center gap-3">
          {focus && (
            <button className="text-sm text-sky-700 hover:underline" onClick={() => setParams({ focus: null })}>
              Clear focus (chr{focus})
            </button>
          )}
          <DownloadMenu
            items={[
              { label: 'Figure (SVG)', onClick: () => figure('svg') },
              { label: 'Figure (PNG)', onClick: () => figure('png') },
              { label: 'Table (CSV)', onClick: csv },
            ]}
          />
        </div>
      </Toolbar>

      <TileState state={tsv} what="chromosome-pair table">
        {pairs.size === 0 && <Notice>No edges match these filters.</Notice>}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="relative">
            {view === 'chord' ? (
              <svg ref={svgRef} viewBox="0 0 820 820" className="w-full" role="img" aria-label="Chord diagram of edges between chromosomes">
                <g transform="translate(410 410)">
                  <g>
                    {chord.chords.map((c, i) => {
                      const k = keyOf(c)
                      const [a, b] = k.split('-').map(Number)
                      const dim = focus && a !== focus && b !== focus
                      return (
                        <path
                          key={i}
                          d={ribbon(c)}
                          fill={chrColor(c.source.index, n)}
                          fillOpacity={dim ? 0.06 : 0.55}
                          stroke={chrColor(c.source.index, n)}
                          strokeOpacity={dim ? 0.05 : 0.8}
                          strokeWidth={0.6}
                          className="cursor-pointer"
                          onClick={() => go(`/pair/${a}-${b}`)}
                          onMouseMove={(e) => showTip(e, a, b, pairs.get(k))}
                          onMouseLeave={() => setTip(null)}
                        />
                      )
                    })}
                  </g>
                  {chord.groups.map((g) => {
                    const c = chrs[g.index]
                    const ang = (g.startAngle + g.endAngle) / 2 - Math.PI / 2
                    const lx = Math.cos(ang) * (R + 18)
                    const ly = Math.sin(ang) * (R + 18)
                    return (
                      <g key={c} className="cursor-pointer" onClick={() => setParams({ focus: focus === c ? null : c })}>
                        <path d={arc(g)} fill={chrColor(g.index, n)} opacity={focus && focus !== c ? 0.35 : 1} />
                        <text
                          x={lx}
                          y={ly}
                          fontSize="13"
                          fill="#475569"
                          textAnchor={Math.cos(ang) > 0.1 ? 'start' : Math.cos(ang) < -0.1 ? 'end' : 'middle'}
                          dominantBaseline="middle"
                        >
                          {c}
                        </text>
                      </g>
                    )
                  })}
                </g>
              </svg>
            ) : (
              <svg ref={svgRef} viewBox={`0 0 ${44 + n * CELL} ${44 + n * CELL}`} className="w-full" role="img" aria-label="Heatmap of edges between chromosome pairs">
                {chrs.map((c, i) => (
                  <React.Fragment key={c}>
                    <text x={44 + i * CELL + CELL / 2} y={30} fontSize="11" fill="#475569" textAnchor="middle">{c}</text>
                    <text x={36} y={44 + i * CELL + CELL / 2 + 4} fontSize="11" fill="#475569" textAnchor="end">{c}</text>
                  </React.Fragment>
                ))}
                {heat.cells.flatMap((c) => {
                  const fill = heatColor(c)
                  const cellsXY = c.x === c.y ? [[c.x, c.y]] : [[c.x, c.y], [c.y, c.x]]
                  return cellsXY.map(([x, y]) => (
                    <rect
                      key={`${x}-${y}`}
                      x={44 + x * CELL}
                      y={44 + y * CELL}
                      width={CELL - 1}
                      height={CELL - 1}
                      rx={2}
                      fill={fill}
                      className="cursor-pointer"
                      onClick={() => go(`/pair/${c.a}-${c.b}`)}
                      onMouseMove={(e) => showTip(e, c.a, c.b, c.n, `enrichment x${(2 ** c.lr).toFixed(2)}`)}
                      onMouseLeave={() => setTip(null)}
                    />
                  ))
                })}
              </svg>
            )}
            {tip && (
              <div
                className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md"
                style={{ left: tip.x + 12, top: tip.y + 12 }}
              >
                <div className="font-semibold">chr{tip.a} {tip.a === tip.b ? '(within)' : `↔ chr${tip.b}`}</div>
                <div className="text-slate-500">{fmt(tip.n)} edges</div>
                {tip.extra && view === 'heat' && <div className="text-slate-400">{tip.extra}</div>}
                <div className="text-slate-400">click to open</div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <Panel title="Selection">
              <Stat label="Edges" value={compact(total)} />
              <Stat label="Between chromosomes" value={`${total ? ((100 * cross) / total).toFixed(1) : '0.0'}%`} />
              {view === 'heat' && norm === 'enr' ? (
                <Legend
                  from={d3.interpolateRdBu(1)}
                  to={d3.interpolateRdBu(0)}
                  left={`x${(2 ** -LR_MAX).toFixed(1)}`}
                  right={`x${(2 ** LR_MAX).toFixed(0)}`}
                  caption="Enrichment: edges over the count expected from each chromosome's total"
                />
              ) : view === 'heat' ? (
                <Legend from={d3.interpolateBlues(0.1)} to={d3.interpolateBlues(1)} left="1" right={fmt(heat.nmax)} caption="Edges (log scale)" />
              ) : null}
            </Panel>
            <Panel title="Strongest pairs">
              <ul className="flex flex-col gap-1 text-sm">
                {top.map(([k, v]) => {
                  const [a, b] = k.split('-').map(Number)
                  return (
                    <li key={k} className="flex justify-between gap-2">
                      <a href={`#/pair/${a}-${b}`} className="text-sky-700 hover:underline">
                        chr{a} {a === b ? '(within)' : `↔ chr${b}`}
                      </a>
                      <span className="tabular-nums text-slate-500">{compact(v)}</span>
                    </li>
                  )
                })}
              </ul>
            </Panel>
            <Panel title="Chromosome network">
              <label htmlFor="chrsel" className="sr-only">Open a chromosome network</label>
              <select
                id="chrsel"
                value={focus || ''}
                onChange={(e) => e.target.value && go(`/chr/${e.target.value}`)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Open a network…</option>
                {chrs.map((c) => (
                  <option key={c} value={c}>chr{c}</option>
                ))}
              </select>
            </Panel>
          </div>
        </div>
      </TileState>
    </div>
  )
}
