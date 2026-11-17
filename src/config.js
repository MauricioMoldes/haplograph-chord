// Site-level settings only. Everything that describes the data (cohort, filters, number of
// individuals, genome build, chromosomes, bands, bin size) comes from the data folder:
//   data/index.json  written by make_tiles.sh
//   data/meta.json   optional, written by hand (see README)
export const CONFIG = {
  // Tiles are served next to the page (nginx: /data/).
  dataBase: './data',
  // Used for locus links when meta.json does not give genome_build or locus_url_template.
  defaultGenomeBuild: 'hg38',
}
