<p align="center"><img src="logo.svg" width="110" alt="TreeViz logo"></p>

# TreeViz

TreeViz is an interactive phylogenetic tree viewer and editor. It shows the tree together with sample metadata and **population allele-frequency data**, all in one offline web page. There is nothing to install and no server.

**Try it:** open `index.html` in Chrome or Edge, or double-click `TreeViz.bat` on Windows. If GitHub Pages is turned on, the same page runs at the repository's Pages URL. Your data files are read inside the browser and are never uploaded.

## Features
- **Tree files:** Newick, NEXUS (with translate tables) and PhyloXML. You can also paste a tree or drag and drop files onto the page.
- **Layouts:** rectangular, slanted, circular and radial (unrooted).
- **Branch lengths:** phylogram or cladogram, log1p/sqrt transform, cap on very long branches, and short-branch boost.
- **Editing (FigTree-style):**
  - **Rooting:** reroot on any branch, at the MRCA of selected tips, or at the midpoint.
  - **Structure:** collapse, flip, mirror, ladderize, prune, keep only selected tips, or make a subtree the root.
  - **Labels and colours:** rename tips and nodes, set branch lengths, colour branches or clades, highlight clades, and add clade labels.
- **Going back:** undo/redo, restore the original tree, auto-saved last session, named checkpoints, and save/open sessions as `.json` files.
- **Metadata (CSV / TSV / XLSX):**
  - **Display:** metadata columns as tip labels, coloured dots, and tip colours.
  - **Numbers:** number columns get a colour gradient, with a log-scale option.
  - **Missing values:** tips with no value can take it from the matching population sample (same Person + week + BodySite).
- **Population frequency table:** this uses the same long format as PopSeqViz.
  - **Columns:** `Sample, node, true_pos, relative_pos, derived_allele, derived_allele_frequency, depth, A, C, G, T, in_lofreq_vcf`, plus optional `row_type` and `summary_*` columns.
  - **Display:** per-position frequency bars on each named branch, value badges, or branches coloured by frequency.
  - **Filters:** shared positions, LoFreq support, minimum depth, minimum frequency, include/exclude positions, and hide nodes.
  - **Sample table:** filter by Person / week / BodySite, and click a sample name to show just that sample.
- **Export:** SVG, PNG (3×), Newick, FigTree NEXUS with branch colours, the tip table and the frequency rows (CSV).

## Repository layout
| Path | What it is |
|---|---|
| `index.html` / `TreeViz.html` | The complete app (one self-contained file) |
| `TreeViz.bat` | Windows launcher that opens the app in its own Edge/Chrome window |
| `source/` | Source code. `src/` holds the source; `build.py` combines it into `TreeViz.html` |
| `streamlit_app/` | Earlier Streamlit version (`pip install -r requirements.txt` then `streamlit run app.py`) |

## Acknowledgements
- The population-frequency display follows the design of [PopSeqViz](https://github.com/tfursten/popseq_viz) by T. Furstenau.
- Excel reading uses [SheetJS Community Edition](https://sheetjs.com) (Apache-2.0), which is bundled inside the HTML file.
