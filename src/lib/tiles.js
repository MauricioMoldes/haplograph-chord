import { useEffect, useState } from 'react'
import * as d3 from 'd3'
import { CONFIG } from '../config.js'

export const DATA = CONFIG.dataBase

const cache = new Map()

function fetchText(url) {
  if (!cache.has(url)) {
    const p = fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'not-found' : `HTTP ${r.status}`)
        const t = await r.text()
        // A host that rewrites unknown paths to index.html would otherwise parse as data.
        if (t.trimStart().startsWith('<')) throw new Error('not-found')
        return t
      })
      .catch((e) => {
        cache.delete(url)
        throw e
      })
    cache.set(url, p)
  }
  return cache.get(url)
}

// Generic loader hook: { data, error, loading } for one URL.
function useLoad(url, parse) {
  const [state, setState] = useState({ data: null, error: null, loading: !!url })
  useEffect(() => {
    if (!url) {
      setState({ data: null, error: null, loading: false })
      return undefined
    }
    let live = true
    setState({ data: null, error: null, loading: true })
    fetchText(url)
      .then((t) => live && setState({ data: parse(t), error: null, loading: false }))
      .catch((e) => live && setState({ data: null, error: e.message, loading: false }))
    return () => {
      live = false
    }
    // parse is always a module-level function or a stable callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])
  return state
}

export const useJson = (url) => useLoad(url, (t) => JSON.parse(t))
export const useTsv = (url, row) => useLoad(url, (t) => d3.tsvParse(t.replace(/\r/g, ''), row))

// Band names from the thresholds in index.json ("2,3,5,10,20" -> 2-3, 3-5, 5-10, 10-20, >=20),
// the same convention make_tiles.sh and aggregate_edges.sh write.
export function bandNames(spec) {
  const t = String(spec).split(',').map(Number)
  return t.map((v, i) => (i < t.length - 1 ? `${v}-${t[i + 1]}` : `>=${v}`))
}

// Tiles are keyed on the lower chromosome number first (same orientation as make_tiles.sh).
export const pairKey = (a, b) => {
  const [x, y] = a <= b ? [a, b] : [b, a]
  return { A: x, B: y, file: `chr${x}_chr${y}` }
}
