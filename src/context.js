import { createContext, useContext } from 'react'
import { CONFIG } from './config.js'

// Everything the views need to know about the data, loaded once in App:
//   idx   index.json written by make_tiles.sh (bin size, bands, max_bin per chromosome, thresholds)
//   meta  meta.json, optional and hand-written (cohort, filters, individuals, genome build, citation)
//   chrs  chromosome numbers present in the data
export const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)
export const useIndex = () => useContext(AppCtx).idx

// Where a block links to: meta.locus_url_template with {chrom} {start} {end}, else UCSC for the genome build.
export function locusUrl(meta, chrom, start, end) {
  if (meta.locus_url_template)
    return meta.locus_url_template.replace('{chrom}', chrom).replace('{start}', start).replace('{end}', end)
  const db = meta.genome_build || CONFIG.defaultGenomeBuild
  return `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${db}&position=${chrom}%3A${start}-${end}`
}

export const locusLabel = (meta) => (meta.locus_url_template ? 'Open locus' : 'UCSC')
