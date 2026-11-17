import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { locusLabel, locusUrl, useApp } from '../context.js'
import { DATA, useTsv } from '../lib/tiles.js'
import { fmt, parseBlock, region } from '../lib/blocks.js'
import { go, setParams } from '../lib/router.js'
import { captionLines, downloadText, saveFigure, slug, svgFrame, toCsv } from '../lib/export.js'
import { Crumbs, DownloadMenu, Panel, Segmented, Stat, TileState } from '../components/Ui.jsx'

const W = 920
const H = 600
const NEIGHBOURS = 10 // neighbours listed for a pinned block
const erow = (d) => ({ source: d.source, target: d.target, w: +d.weight, lift: +d.lift })
const nrow = (d) => ({ id: d.node, chrom: d.chrom, start: +d.start, end: +d.end, cluster: d.cluster, degree: +d.degree })

export default function Network({ chr, params }) {
  const { idx, chrs } = useApp()
  const edgesT = useTsv(`${DATA}/network/chr${chr}.edges.tsv`, erow)
  const nodesT = useTsv(`${DATA}/network/chr${chr}.nodes.tsv`, nrow)
  const state = { loading: edgesT.loading || nodesT.loading, error: edgesT.error || nodesT.error }
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Crumbs items={[{ label: 'Genome', to: '/' }, { label: `chr${chr} network` }]} />
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          Chromosome
          <select value={chr} onChange={(e) => go(`/chr/${e.target.value}`)} className="rounded-lg border border-slate-200 bg-white px-2 py-1">
            {chrs.map((c) => (
              <option key={c} value={c}>chr{c}</option>
            ))}
          </select>
        </label>
      </div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Haploblocks on chr{chr} that travel together</h1>
      <p className="mb-4 max-w-3xl text-slate-600">
        Each dot is a haplotype cluster, coloured by its position along the chromosome. A line joins two clusters that co-occur, and thicker means higher lift.
        This shows the strongest {fmt(idx.network_top)} edges inside chr{chr} (lift ≥ {idx.network_min_lift}). Click a dot to pin it.
      </p>
      <TileState state={state} what={`chr${chr} network`}>
        {edgesT.data && nodesT.data && <NetCanvas chr={chr} edges={edgesT.data} nodes={nodesT.data} params={params} />}
      </TileState>
    </div>
  )
}

function NetCanvas({ chr, edges, nodes, params }) {
  const { idx, meta } = useApp()
  const chrLen = ((idx.max_bin[`chr${chr}`] ?? 0) + 1) * idx.bin_bp
  const [lo, hi] = useMemo(() => d3.extent(edges, (e) => e.lift), [edges])
  const [wlo, whi] = useMemo(() => d3.extent(edges, (e) => e.w), [edges])
  const layout = params.get('layout') === 'arc' ? 'arc' : 'force'
  const minLift = Math.min(Math.max(+params.get('lift') || lo, lo), hi)
  const minW = Math.min(Math.max(+params.get('w') || wlo, wlo), whi)
  const query = params.get('q') || ''
  const selId = params.get('sel') || null

  const [hover, setHover] = useState(null)
  const cvRef = useRef(null)
  const tRef = useRef(d3.zoomIdentity)
  const zoomRef = useRef(null)
  const view = useRef({})

  const graph = useMemo(() => {
    const keep = edges.filter((e) => e.lift >= minLift && e.w >= minW)
    const meta0 = new Map(nodes.map((n) => [n.id, n]))
    const deg = new Map()
    for (const e of keep) {
      deg.set(e.source, (deg.get(e.source) || 0) + 1)
      deg.set(e.target, (deg.get(e.target) || 0) + 1)
    }
    const ns = [...deg.keys()].map((id) => {
      const m = meta0.get(id) || { id, chrom: `chr${chr}`, ...parseBlock(id) }
      const d = deg.get(id)
      return { ...m, deg: d, r: Math.min(10, 2.5 + Math.sqrt(d) * 0.9), t: m.start / chrLen }
    })
    const byId = new Map(ns.map((n) => [n.id, n]))
    const links = keep
      .map((e) => ({ source: byId.get(e.source), target: byId.get(e.target), lift: e.lift, w: e.w }))
      .sort((p, q) => p.lift - q.lift)
    const adj = new Map(ns.map((n) => [n.id, []]))
    for (const l of links) {
      adj.get(l.source.id).push({ node: l.target, lift: l.lift, w: l.w })
      adj.get(l.target.id).push({ node: l.source, lift: l.lift, w: l.w })
    }
    if (layout === 'arc') {
      for (const n of ns) {
        n.x = 30 + n.t * (W - 60)
        n.y = H * 0.82
      }
    } else {
      const sim = d3
        .forceSimulation(ns)
        .force('link', d3.forceLink(links).distance(26).strength(0.35))
        .force('charge', d3.forceManyBody().strength(-18).distanceMax(250))
        .force('x', d3.forceX().strength(0.04))
        .force('y', d3.forceY().strength(0.04))
        .force('collide', d3.forceCollide((d) => d.r + 1.5))
        .stop()
      for (let i = 0; i < 300; i++) sim.tick()
    }
    return { nodes: ns, links, adj, byId }
  }, [edges, nodes, minLift, minW, layout, chrLen, chr])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? new Set(graph.nodes.filter((n) => n.id.toLowerCase().includes(q)).map((n) => n.id)) : new Set()
  }, [graph, query])

  const pinned = selId ? graph.byId.get(selId) || null : null
  view.current = { graph, hover, matches, layout, pinned }

  const draw = () => {
    const cv = cvRef.current
    if (!cv) return
    const { graph: g, hover: hv, matches: mt, layout: lay, pinned: pin } = view.current
    const dpr = window.devicePixelRatio || 1
    if (cv.width !== W * dpr) {
      cv.width = W * dpr
      cv.height = H * dpr
    }
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    const t = tRef.current
    ctx.save()
    ctx.translate(t.x, t.y)
    ctx.scale(t.k, t.k)
    const hot = hv ? hv.node : pin
    const near = hot ? new Set(g.adj.get(hot.id).map((x) => x.node.id)) : null
    const path = (l) => {
      ctx.beginPath()
      if (lay === 'arc') {
        const x1 = l.source.x
        const x2 = l.target.x
        const h = Math.min(Math.abs(x2 - x1) * 0.6, 420) * 1.33
        ctx.moveTo(x1, l.source.y)
        ctx.bezierCurveTo(x1, l.source.y - h, x2, l.source.y - h, x2, l.source.y)
      } else {
        ctx.moveTo(l.source.x, l.source.y)
        ctx.lineTo(l.target.x, l.target.y)
      }
    }
    const lw = (l) => (0.4 + Math.min(l.lift, 40) / 14) / Math.sqrt(t.k)
    ctx.strokeStyle = hot ? 'rgba(100,116,139,0.07)' : 'rgba(71,85,105,0.25)'
    for (const l of g.links) {
      ctx.lineWidth = lw(l)
      path(l)
      ctx.stroke()
    }
    if (hot) {
      ctx.strokeStyle = 'rgba(194,87,26,0.9)'
      for (const l of g.links) {
        if (l.source !== hot && l.target !== hot) continue
        ctx.lineWidth = lw(l) + 0.4
        path(l)
        ctx.stroke()
      }
    }
    for (const n of g.nodes) {
      ctx.globalAlpha = hot && n !== hot && !near.has(n.id) ? 0.18 : 1
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r, 0, 2 * Math.PI)
      ctx.fillStyle = d3.interpolatePlasma(Math.min(0.97, n.t))
      ctx.fill()
      ctx.lineWidth = 0.8 / Math.sqrt(t.k)
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    const ring = (n, color) => {
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r + 3 / t.k, 0, 2 * Math.PI)
      ctx.lineWidth = 1.8 / t.k
      ctx.strokeStyle = color
      ctx.stroke()
    }
    for (const n of g.nodes) if (mt.has(n.id)) ring(n, '#c2571a')
    if (pin) ring(pin, '#0f172a')
    ctx.restore()
  }

  const fit = () => {
    const cv = cvRef.current
    if (!cv || !zoomRef.current) return
    let tr = d3.zoomIdentity
    if (layout === 'force' && graph.nodes.length) {
      const [x0, x1] = d3.extent(graph.nodes, (n) => n.x)
      const [y0, y1] = d3.extent(graph.nodes, (n) => n.y)
      const k = Math.min(W / (x1 - x0 + 80), H / (y1 - y0 + 80), 3)
      tr = d3.zoomIdentity.translate(W / 2 - (k * (x0 + x1)) / 2, H / 2 - (k * (y0 + y1)) / 2).scale(k)
    }
    d3.select(cv).call(zoomRef.current.transform, tr)
  }

  const focusOn = (n) => {
    const k = Math.max(tRef.current.k, 2.5)
    d3.select(cvRef.current).call(zoomRef.current.transform, d3.zoomIdentity.translate(W / 2 - k * n.x, H / 2 - k * n.y).scale(k))
  }

  useEffect(() => {
    const cv = cvRef.current
    const z = d3
      .zoom()
      .scaleExtent([0.3, 14])
      .extent([[0, 0], [W, H]])
      .on('zoom', (e) => {
        tRef.current = e.transform
        draw()
      })
    zoomRef.current = z
    d3.select(cv).call(z).on('dblclick.zoom', null)
    return () => d3.select(cv).on('.zoom', null)
  }, [])
  useEffect(() => {
    fit()
  }, [graph])
  useEffect(() => {
    draw()
  }, [graph, hover, matches, pinned])

  const nodeAt = (e) => {
    const r = cvRef.current.getBoundingClientRect()
    const mx = (e.clientX - r.left) * (W / r.width)
    const my = (e.clientY - r.top) * (H / r.height)
    const t = tRef.current
    const wx = (mx - t.x) / t.k
    const wy = (my - t.y) / t.k
    let best = null
    let bd = Infinity
    for (const n of graph.nodes) {
      const d = Math.hypot(n.x - wx, n.y - wy)
      if (d < n.r + 3 / t.k && d < bd) {
        best = n
        bd = d
      }
    }
    return { best, px: e.clientX - r.left, py: e.clientY - r.top }
  }
  const onMove = (e) => {
    const { best, px, py } = nodeAt(e)
    if (best) setHover({ node: best, px, py })
    else if (hover) setHover(null)
  }

  const neighbours = pinned ? [...graph.adj.get(pinned.id)].sort((p, q) => q.lift - p.lift).slice(0, NEIGHBOURS) : []
  const caption = `lift ≥ ${minLift.toFixed(1)}, weight ≥ ${minW}`

  // ---- exports -----------------------------------------------------------------------------
  const figure = (kind) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const n of graph.nodes) {
      x0 = Math.min(x0, n.x - n.r); x1 = Math.max(x1, n.x + n.r)
      y0 = Math.min(y0, n.y - n.r); y1 = Math.max(y1, n.y + n.r)
    }
    if (layout === 'arc') {
      y0 = Math.min(y0, H * 0.82 - 420 * 1.33 * 0.75)
      y1 = y1 + 6
    }
    const pad = 20
    const bw = x1 - x0 + 2 * pad
    const bh = y1 - y0 + 2 * pad
    const scale = Math.min(W / bw, 560 / bh)
    const fw = Math.round(bw * scale)
    const fh = Math.round(bh * scale)
    const f = (v) => v.toFixed(1)
    const pt = (n) => [(n.x - x0 + pad) * scale, (n.y - y0 + pad) * scale]
    const lines = graph.links
      .map((l) => {
        const [ax, ay] = pt(l.source)
        const [bx, by] = pt(l.target)
        const sw = (0.4 + Math.min(l.lift, 40) / 14).toFixed(2)
        const d =
          layout === 'arc'
            ? `M${f(ax)} ${f(ay)}C${f(ax)} ${f(ay - Math.min(Math.abs(bx - ax) * 0.6, 420 * scale) * 1.33)} ${f(bx)} ${f(by - Math.min(Math.abs(bx - ax) * 0.6, 420 * scale) * 1.33)} ${f(bx)} ${f(by)}`
            : `M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}`
        return `<path d="${d}" fill="none" stroke="#475569" stroke-opacity="0.25" stroke-width="${sw}"/>`
      })
      .join('')
    const dots = graph.nodes
      .map((n) => {
        const [cx, cy] = pt(n)
        return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${(n.r * scale).toFixed(1)}" fill="${d3.interpolatePlasma(Math.min(0.97, n.t))}" stroke="#ffffff" stroke-width="0.8"/>`
      })
      .join('')
    const lgY = fh + 14
    const stops = d3.range(0, 1.001, 0.1).map((t) => `<stop offset="${t * 100}%" stop-color="${d3.interpolatePlasma(Math.min(0.97, t))}"/>`).join('')
    const legend =
      `<rect x="0" y="${lgY}" width="200" height="10" fill="url(#lgp)"/>` +
      `<text x="0" y="${lgY + 24}" font-size="11" fill="#475569">0 Mb</text>` +
      `<text x="200" y="${lgY + 24}" font-size="11" fill="#475569" text-anchor="end">${Math.round(chrLen / 1e6)} Mb</text>` +
      `<text x="216" y="${lgY + 9}" font-size="11" fill="#475569">position on chr${chr}; line width = lift</text>`
    const { svg, width, height } = svgFrame({
      w: fw,
      h: fh + 40,
      title: `chr${chr} network${layout === 'arc' ? ' (arcs by position)' : ''}`,
      subtitle: `${fmt(graph.links.length)} edges, ${fmt(graph.nodes.length)} clusters (${caption})`,
      caption: captionLines(meta, idx),
      body: lines + dots + legend,
      extraDefs: `<linearGradient id="lgp" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient>`,
    })
    return saveFigure(kind, `haplograph_chr${chr}_network_${layout}_${slug(caption)}`, { svg, width, height })
  }

  const edgesCsv = () => {
    const rows = [...graph.links].sort((p, q) => q.lift - p.lift).map((l) => ({
      source: l.source.id, target: l.target.id,
      source_start: l.source.start, source_end: l.source.end,
      target_start: l.target.start, target_end: l.target.end,
      weight: l.w, lift: l.lift,
    }))
    downloadText(`haplograph_chr${chr}_network_edges_${slug(caption)}.csv`, toCsv(rows, ['source', 'target', 'source_start', 'source_end', 'target_start', 'target_end', 'weight', 'lift']), 'text/csv')
  }
  const nodesCsv = () => {
    const rows = graph.nodes.map((n) => ({ node: n.id, chrom: n.chrom, start: n.start, end: n.end, cluster: n.cluster, links_shown: n.deg }))
    downloadText(`haplograph_chr${chr}_network_nodes_${slug(caption)}.csv`, toCsv(rows, ['node', 'chrom', 'start', 'end', 'cluster', 'links_shown']), 'text/csv')
  }

  const step = hi - lo > 40 ? 1 : 0.5
  const searchHint = nodes.length ? nodes[0].id.slice(0, nodes[0].id.indexOf('_') + 3) : ''

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
      <div className="relative overflow-hidden rounded-xl border border-slate-200">
        <canvas
          ref={cvRef}
          style={{ width: '100%', aspectRatio: `${W} / ${H}`, display: 'block', cursor: hover ? 'pointer' : 'grab' }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const { best } = nodeAt(e)
            setParams({ sel: best && best.id !== selId ? best.id : null })
          }}
        />
        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md"
            style={{ left: Math.min(hover.px + 14, 520), top: hover.py + 14 }}
          >
            <div className="font-semibold">{region(hover.node)}</div>
            <div className="text-slate-500">cluster {hover.node.cluster} · {hover.node.deg} links shown</div>
          </div>
        )}
        <div className="absolute bottom-2 left-3 text-xs text-slate-400">Scroll to zoom, drag to pan, click a dot to pin it</div>
      </div>

      <div className="flex flex-col gap-4">
        <Panel title="Layout">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Layout"
              value={layout}
              onChange={(v) => setParams({ layout: v === 'arc' ? 'arc' : null })}
              options={[{ value: 'force', label: 'Network' }, { value: 'arc', label: 'Arcs by position' }]}
            />
            <DownloadMenu
              items={[
                { label: 'Figure (SVG)', onClick: () => figure('svg') },
                { label: 'Figure (PNG)', onClick: () => figure('png') },
                { label: 'Edges (CSV)', onClick: edgesCsv },
                { label: 'Clusters (CSV)', onClick: nodesCsv },
              ]}
            />
          </div>
        </Panel>
        <Panel title="Filter">
          <label htmlFor="lift" className="text-sm font-medium">Minimum lift: {minLift.toFixed(1)}</label>
          <input id="lift" type="range" min={lo} max={hi} step={step} value={minLift} onChange={(e) => setParams({ lift: +e.target.value <= lo ? null : e.target.value })} className="mt-1 w-full accent-sky-700" />
          <label htmlFor="wt" className="mt-3 block text-sm font-medium">Minimum weight: {minW}</label>
          <input id="wt" type="range" min={wlo} max={whi} step={1} value={minW} onChange={(e) => setParams({ w: +e.target.value <= wlo ? null : e.target.value })} className="mt-1 w-full accent-sky-700" />
          <label htmlFor="q" className="mt-3 block text-sm font-medium">Find a block</label>
          <input id="q" type="search" value={query} onChange={(e) => setParams({ q: e.target.value })} placeholder={searchHint ? `e.g. ${searchHint}` : ''} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm" />
          {query && <div className="mt-1 text-xs text-slate-500">{matches.size} found</div>}
        </Panel>
        <Panel title="Shown">
          <Stat label="Edges" value={`${fmt(graph.links.length)} of ${fmt(edges.length)}`} />
          <Stat label="Clusters" value={fmt(graph.nodes.length)} />
          <div className="mt-3 text-xs text-slate-500">Position on chr{chr} (Mb)</div>
          <div className="mt-1 h-2.5 w-full rounded" style={{ background: `linear-gradient(90deg, ${d3.range(0, 1.01, 0.1).map((v) => d3.interpolatePlasma(Math.min(0.97, v))).join(',')})` }} />
          <div className="mt-1 flex justify-between text-xs text-slate-500"><span>0</span><span>{Math.round(chrLen / 1e6)}</span></div>
        </Panel>
        {pinned && (
          <Panel title="Pinned block">
            <div className="text-sm">
              <a className="font-semibold text-sky-700 hover:underline" href={locusUrl(meta, pinned.chrom, pinned.start, pinned.end)} target="_blank" rel="noreferrer" title={`Open in ${locusLabel(meta)}`}>
                {region(pinned)}
              </a>
              <div className="text-slate-500">cluster {pinned.cluster} · {pinned.deg} links shown</div>
              <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Strongest neighbours</div>
              <ul className="mt-1 flex flex-col gap-1">
                {neighbours.map((nb) => (
                  <li key={nb.node.id} className="flex justify-between gap-2">
                    <button type="button" className="text-left text-sky-700 hover:underline" onClick={() => setParams({ sel: nb.node.id })}>
                      {mbLabel(nb.node.start)} Mb · c{nb.node.cluster}
                    </button>
                    <span className="tabular-nums text-slate-500">lift {nb.lift.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-3">
                <button type="button" className="text-sky-700 hover:underline" onClick={() => focusOn(pinned)}>Zoom to it</button>
                <button type="button" className="text-slate-500 hover:underline" onClick={() => setParams({ sel: null })}>Unpin</button>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}

const mbLabel = (bp) => String(+(bp / 1e6).toFixed(2))
