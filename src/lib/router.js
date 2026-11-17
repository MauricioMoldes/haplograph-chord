import { useEffect, useState } from 'react'

// Hash routes with an optional query string, so every view and filter is a shareable link:
//   #/                          genome (chord or heatmap)
//   #/pair/6-21                 block matrix for chr6 x chr21
//   #/pair/6-21/10-9            ... with bin pair (10, 9) selected
//   #/chr/21                    network of chr21
//   #/about                     definitions and data provenance
//   ...?bands=5-10,10-20&norm=1 filters (read by each view)
export function parseHash(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const p = path.replace(/^\//, '').split('/').filter(Boolean)
  const params = new URLSearchParams(query)
  if (p[0] === 'about') return { name: 'about', params }
  if (p[0] === 'pair' && p[1]) {
    const [a, b] = p[1].split('-').map(Number)
    const bins = p[2] ? p[2].split('-').map(Number) : null
    if (a >= 1 && b >= 1) return { name: 'pair', a, b, bins, params }
  }
  if (p[0] === 'chr' && p[1] && +p[1] >= 1) return { name: 'chr', chr: +p[1], params }
  return { name: 'home', params }
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', on)
    window.addEventListener('hgparams', on)
    return () => {
      window.removeEventListener('hashchange', on)
      window.removeEventListener('hgparams', on)
    }
  }, [])
  return route
}

export const go = (path) => {
  window.location.hash = path
}

// Change query parameters of the current view without adding a history entry.
// A null, undefined or empty value removes the parameter.
export function setParams(updates) {
  const [path, query = ''] = window.location.hash.replace(/^#/, '').split('?')
  const q = new URLSearchParams(query)
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === undefined || v === '') q.delete(k)
    else q.set(k, String(v))
  }
  const s = q.toString()
  window.history.replaceState(null, '', `#${path}${s ? `?${s}` : ''}`)
  window.dispatchEvent(new Event('hgparams'))
}

// Navigate and keep the current filters (the part after ?).
export const goKeep = (path) => {
  const q = window.location.hash.split('?')[1]
  window.location.hash = q ? `${path}?${q}` : path
}
