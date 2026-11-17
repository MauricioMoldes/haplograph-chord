import React, { useState } from 'react'
import { bandLabel } from '../lib/blocks.js'
import { setParams } from '../lib/router.js'

export function Chip({ on, onClick, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={
        'rounded-full border px-3 py-1 text-sm transition ' +
        (on
          ? 'border-sky-300 bg-sky-50/80 text-sky-900'
          : 'border-slate-200 bg-white text-slate-500 hover:border-sky-200')
      }
    >
      {children}
    </button>
  )
}

// One choice out of a few: [{ value, label }]
export function Segmented({ value, options, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-full border border-slate-200 bg-white text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          title={o.title}
          className={'px-3 py-1 transition ' + (value === o.value ? 'bg-sky-50/80 text-sky-900' : 'text-slate-500 hover:bg-slate-50')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Panel({ title, children, className = '' }) {
  return (
    <div className={`rounded-xl border border-sky-100 bg-sky-50/60 p-4 ${className}`}>
      {title && <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>}
      {children}
    </div>
  )
}

export function Toolbar({ children }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3">
      {children}
    </div>
  )
}

export const ToolLabel = ({ children }) => (
  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</span>
)

// Lift-band chips. `on` is a Set of the selected band names, `all` the ordered list.
// The selection lives in the URL (?bands=...), so the view can be shared.
export function BandChips({ all, on }) {
  const toggle = (b) => {
    const n = new Set(on)
    if (n.has(b)) n.delete(b)
    else n.add(b)
    if (n.size === 0) return
    setParams({ bands: all.filter((x) => n.has(x)).join(',') })
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToolLabel>Lift</ToolLabel>
      {all.map((b) => (
        <Chip key={b} on={on.has(b)} onClick={() => toggle(b)} title="Show or hide edges in this lift band">
          {bandLabel(b)}
        </Chip>
      ))}
    </div>
  )
}

// items: [{ label, onClick }]. Handlers may be async; a failure is shown under the button.
export function DownloadMenu({ items, label = 'Download' }) {
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="relative">
      <details className="group">
        <summary className="cursor-pointer list-none rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:border-sky-300">
          {busy ? 'Preparing…' : `${label} ▾`}
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-md">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-sky-50"
              onClick={async (e) => {
                const d = e.currentTarget.closest('details')
                if (d) d.open = false
                setErr(null)
                setBusy(true)
                try {
                  await it.onClick()
                } catch (ex) {
                  setErr(ex.message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      </details>
      {err && <div className="absolute right-0 top-full z-20 mt-9 w-56 rounded bg-white p-2 text-xs text-red-700 shadow">{err}</div>}
    </div>
  )
}

export function Crumbs({ items }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden>›</span>}
          {it.to ? (
            <a href={`#${it.to}`} className="text-sky-700 hover:underline">
              {it.label}
            </a>
          ) : (
            <span className="font-semibold text-slate-800">{it.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}

export function Notice({ children }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">{children}</div>
}

export function TileState({ state, what, children }) {
  if (state.loading) return <Notice>Loading {what}…</Notice>
  if (state.error === 'not-found') return <Notice>The {what} tile is not available for this selection.</Notice>
  if (state.error) return <Notice>Could not load {what} ({state.error}).</Notice>
  return children
}

export function Stat({ label, value }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

export function Legend({ from, to, left, right, caption }) {
  return (
    <div>
      {caption && <div className="mt-3 text-xs text-slate-500">{caption}</div>}
      <div className="mt-1 h-2.5 w-full rounded" style={{ background: `linear-gradient(90deg, ${from}, ${to})` }} />
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  )
}
