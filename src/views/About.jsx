import React from 'react'
import { useApp } from '../context.js'
import { DATA } from '../lib/tiles.js'
import { bandNames } from '../lib/tiles.js'
import { bandLabel, compact, fmt } from '../lib/blocks.js'
import { Panel } from '../components/Ui.jsx'

const Term = ({ name, children }) => (
  <div className="mb-3">
    <dt className="font-semibold text-slate-800">{name}</dt>
    <dd className="text-slate-600">{children}</dd>
  </div>
)

export default function About() {
  const { idx, meta, chrs } = useApp()
  const bands = bandNames(idx.bands)
  const N = meta.n_individuals
  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">About this map</h1>
      <p className="mb-6 text-slate-600">
        HaploGraph links haplotype clusters that occur together in the same individuals. A cluster is a group of people who share the same haplotype across one haploblock, and a
        link ties two clusters, on the same chromosome or on different ones, that are carried by overlapping sets of people.
        {meta.cohort ? ` The data come from ${meta.cohort}.` : ''}
      </p>

      <dl className="mb-8">
        <Term name="Node (cluster)">One haplotype cluster in one haploblock, named by chromosome, position and cluster number, for example chr21_39655927-39674795_cluster90.</Term>
        <Term name="Edge">A link between two clusters carried by overlapping sets of individuals. Only edges that pass the filters are kept.</Term>
        <Term name="Weight">The number of individuals who carry both clusters.</Term>
        <Term name="Support">The number of individuals who carry a cluster.</Term>
        <Term name="Lift">
          How much more often two clusters occur together than chance predicts: weight × {N ? fmt(N) : 'N'} / (support of the first × support of the second), where {N ? 'N is' : 'N is'} the number of individuals.
          A lift of 1 means no association; higher means a stronger association.
        </Term>
        <Term name="Lift bands">The edges are grouped by lift: {bands.map(bandLabel).join(', ')}. The chips at the top of each view show or hide bands.</Term>
        <Term name={`Square (${idx.bin_bp / 1e6} Mb)`}>In the matrix view each square is a pair of {idx.bin_bp / 1e6} Mb regions. Its count is the number of edges between clusters in the two regions.</Term>
        <Term name="Enrichment">
          Regions with many clusters have many edges with everything, which shows as stripes. Enrichment divides each square by the count expected from its row and column totals, so what stands out is linkage beyond density.
          It is shown as the ratio of observed to expected edges with a small pseudo-count (log2 of (observed + 1) / (expected + 1)).
        </Term>
        <Term name="Empty bands">Blank rows and columns are regions without clusters, such as centromeres and other gaps in the assembly.</Term>
      </dl>

      <Panel title="This data release" className="mb-8">
        <table className="w-full text-sm">
          <tbody>
            {[
              ['Edges', fmt(idx.edges_total)],
              ['Chromosomes', chrs.length ? `${chrs[0]}–${chrs[chrs.length - 1]} (${chrs.length})` : '–'],
              ['Square size', `${idx.bin_bp / 1e6} Mb`],
              ['Lift bands', bands.map(bandLabel).join(', ')],
              ['Edge lists', `top ${idx.k_per_bin_pair} edges by lift per square, for squares with an edge of lift ≥ ${idx.edge_min_lift}`],
              ['Chromosome networks', `top ${fmt(idx.network_top)} edges per chromosome, lift ≥ ${idx.network_min_lift}`],
              ...(meta.filters ? [['Edge and node filters', meta.filters]] : []),
              ...(meta.genome_build ? [['Genome build', meta.genome_build]] : []),
              ...(idx.generated && idx.generated !== 'dev' ? [['Tiles generated', idx.generated]] : []),
            ].map(([k, v]) => (
              <tr key={k} className="border-b border-sky-100 last:border-0">
                <td className="py-1.5 pr-4 align-top text-slate-500">{k}</td>
                <td className="py-1.5">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <h2 className="mb-2 text-lg font-semibold">Download</h2>
      <p className="mb-2 text-slate-600">
        Every view has a Download menu with the figure as SVG or PNG, drawn on white with a caption, and the underlying numbers as CSV. The tiles behind the views are plain tab-separated files:
      </p>
      <ul className="mb-6 list-disc pl-6 text-slate-600">
        <li><a className="text-sky-700 hover:underline" href={`${DATA}/index.json`}>index.json</a>, the settings of this release</li>
        <li><a className="text-sky-700 hover:underline" href={`${DATA}/chrpair_by_band.tsv`}>chrpair_by_band.tsv</a>, edges per chromosome pair and lift band</li>
        <li><code className="rounded bg-slate-100 px-1">{DATA}/matrix/chrA_chrB.tsv</code>, edges per square and lift band</li>
        <li><code className="rounded bg-slate-100 px-1">{DATA}/edges/chrA_chrB.tsv</code>, the top edges per square</li>
        <li><code className="rounded bg-slate-100 px-1">{DATA}/network/chrN.edges.tsv</code> and <code className="rounded bg-slate-100 px-1">chrN.nodes.tsv</code>, the chromosome networks</li>
      </ul>
      {meta.citation && (
        <>
          <h2 className="mb-2 text-lg font-semibold">Citation</h2>
          <p className="text-slate-600">{meta.citation}</p>
        </>
      )}
      <p className="mt-6 text-sm text-slate-400">{compact(idx.edges_total)} edges in total.</p>
    </div>
  )
}
