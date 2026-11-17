import React, { useMemo, useState } from 'react'
import { AppCtx } from './context.js'
import { useRoute } from './lib/router.js'
import { DATA, useJson } from './lib/tiles.js'
import { chromosomes, compact } from './lib/blocks.js'
import Home from './views/Home.jsx'
import Pair from './views/Pair.jsx'
import Network from './views/Network.jsx'
import About from './views/About.jsx'
import { Notice } from './components/Ui.jsx'

export default function App() {
  const route = useRoute()
  const idx = useJson(`${DATA}/index.json`)
  const metaT = useJson(`${DATA}/meta.json`)
  const [copied, setCopied] = useState(false)

  // meta.json is optional: a missing file means no cohort or filter line, nothing invented.
  const meta = metaT.data || {}
  const value = useMemo(() => (idx.data ? { idx: idx.data, meta, chrs: chromosomes(idx.data) } : null), [idx.data, metaT.data])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be blocked on plain http; the address bar still has the link */
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-5">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <a href="#/" className="text-xl font-semibold tracking-tight text-slate-900">
            {meta.title || 'HaploGraph'}
          </a>
          {meta.cohort && <span className="text-sm text-slate-500">{meta.cohort}</span>}
          <nav className="ml-auto flex items-center gap-4 text-sm">
            <a href="#/" className="text-sky-700 hover:underline">Genome</a>
            <a href="#/about" className="text-sky-700 hover:underline">About</a>
            <button type="button" onClick={copyLink} className="rounded-lg border border-slate-200 px-3 py-1 text-slate-600 hover:border-sky-300">
              {copied ? 'Link copied' : 'Copy link'}
            </button>
          </nav>
        </div>
        {meta.filters && <p className="mt-1 text-sm text-slate-500">{meta.filters}</p>}
        {idx.data?.dev && (
          <p className="mt-2 inline-block rounded-full border border-dashed border-slate-300 px-3 py-0.5 text-xs uppercase tracking-wide text-slate-500">
            Development data, not real results
          </p>
        )}
      </header>

      {idx.loading && <Notice>Loading…</Notice>}
      {idx.error && <Notice>Could not load index.json ({idx.error}). Is the data folder in place?</Notice>}
      {value && (
        <AppCtx.Provider value={value}>
          {route.name === 'home' && <Home params={route.params} />}
          {route.name === 'pair' && <Pair a={route.a} b={route.b} bins={route.bins} params={route.params} />}
          {route.name === 'chr' && <Network key={route.chr} chr={route.chr} params={route.params} />}
          {route.name === 'about' && <About />}
          <footer className="mt-10 border-t border-slate-100 pt-4 text-xs text-slate-400">
            {idx.data.generated && idx.data.generated !== 'dev' ? `Tiles generated ${idx.data.generated} · ` : ''}
            {compact(idx.data.edges_total)} edges · {idx.data.bin_bp / 1e6} Mb bins ·{' '}
            <a href="#/about" className="underline">definitions and data</a>
          </footer>
        </AppCtx.Provider>
      )}
    </div>
  )
}
