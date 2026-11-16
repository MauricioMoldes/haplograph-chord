# haplograph-chord

Interactive chord diagram of the cross-chromosome HaploGraph (1000 Genomes, N = 2,548;
lift >= 2, weight >= 5; clusters with min(support, N - support) >= 25).
Each ribbon joins two chromosomes and its width is the number of edges between them.
A lift-band control filters ribbons by link strength. The figure is descriptive.

Live page: https://haplograph.haploblocks.org/

## Files
- `haplograph_chord.html`  the page (d3 v7.9.0 from cdnjs)
- `chrpair_by_band.tsv`    edge counts per chromosome pair and lift band
                           (columns: chrom_a chrom_b lift_band n_edges mean_weight)
- `build_static.sh`        bakes the table into the page so it needs no file load

## Build the page
    sh build_static.sh haplograph_chord.html chrpair_by_band.tsv index.html

Put `index.html` in the web root of haplograph.haploblocks.org.

## Query options
`?theme=dark`  `?bands=2-3,3-5`  `?scale=sqrt`  `?note=text`
SVG and PNG exports are always drawn on a white background.
