// Downloads: SVG, PNG and CSV. Figures are always drawn on white, with a caption that says what
// is shown and where it comes from, so they can go straight into a paper or a report.

export function download(name, blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export const downloadText = (name, text, type = 'text/plain') =>
  download(name, new Blob([text], { type: `${type};charset=utf-8` }))

export const xmlEsc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function toCsv(rows, cols) {
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n'
}

// Safe file name part: "lift 5-10, ≥ 20" -> "lift_5-10_20"
export const slug = (s) =>
  String(s)
    .replace(/[≥]/g, '')
    .replace(/[^A-Za-z0-9.+-]+/g, '_')
    .replace(/^_+|_+$/g, '')

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
const HEAD = 64
const FOOT = 20

// Wrap a drawing (SVG markup in its own coordinates, size w x h) in a white page with a title,
// a subtitle and caption lines underneath.
export function svgFrame({ w, h, title, subtitle, caption = [], body, extraDefs = '' }) {
  const width = Math.max(w + 48, 560)
  const height = HEAD + h + FOOT + caption.length * 16 + 16
  const lines = caption
    .map((c, i) => `<text x="24" y="${HEAD + h + FOOT + i * 16}" font-size="11" fill="#64748b">${xmlEsc(c)}</text>`)
    .join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family='${FONT}'>` +
    `<defs>${extraDefs}</defs>` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    `<text x="24" y="28" font-size="18" font-weight="600" fill="#0f172a">${xmlEsc(title)}</text>` +
    (subtitle ? `<text x="24" y="48" font-size="12" fill="#475569">${xmlEsc(subtitle)}</text>` : '') +
    `<g transform="translate(${24 + (width - 48 - w) / 2} ${HEAD})">${body}</g>` +
    lines +
    `</svg>`
  return { svg, width, height }
}

export async function svgToPngBlob(svg, width, height, scale = 2) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('could not render the image'))
      img.src = url
    })
    const cv = document.createElement('canvas')
    cv.width = Math.round(width * scale)
    cv.height = Math.round(height * scale)
    const ctx = cv.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cv.width, cv.height)
    ctx.drawImage(img, 0, 0, cv.width, cv.height)
    return await new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG failed'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Save a framed figure as SVG or PNG.
export async function saveFigure(kind, name, frame) {
  if (kind === 'svg') downloadText(`${name}.svg`, frame.svg, 'image/svg+xml')
  else download(`${name}.png`, await svgToPngBlob(frame.svg, frame.width, frame.height, 2))
}

// Caption lines used in every figure.
export function captionLines(meta, idx, extra = []) {
  const out = [...extra]
  const bits = [meta.cohort, meta.filters].filter(Boolean)
  if (bits.length) out.push(bits.join(' · '))
  const gen = []
  if (idx.generated && idx.generated !== 'dev') gen.push(`tiles generated ${idx.generated}`)
  if (idx.dev) gen.push('DEVELOPMENT DATA, NOT REAL RESULTS')
  gen.push(`${(idx.bin_bp / 1e6).toString()} Mb bins`)
  out.push(gen.join(' · '))
  return out
}
