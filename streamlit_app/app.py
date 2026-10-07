"""
TreeViz – interactive phylogenetic tree viewer / editor with metadata and frequency tables.
Run:  streamlit run app.py
"""
import hashlib
import io
import json
import re
from pathlib import Path

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

st.set_page_config(page_title="TreeViz", page_icon="🌳", layout="wide")

_component = components.declare_component(
    "treeviz", path=str(Path(__file__).parent / "treeviz_component")
)

TREE_EXT = ["nwk", "newick", "tree", "treefile", "tre", "nex", "nexus", "xml", "phyloxml", "nexml", "txt", "contree", "tsv_tree"]
TABLE_EXT = ["csv", "tsv", "txt", "xlsx", "xls"]

# ----------------------------------------------------------------------------- helpers
TIP_RE = re.compile(r"[(,]\s*(?:'((?:[^']|'')+)'|([^():,;\[\]'\s][^():,;\[\]']*?))\s*(?=[:,)\[])")


def tip_names_from_newick(nwk: str):
    nwk = re.sub(r"\[[^\]]*\]", "", nwk)
    out = []
    for m in TIP_RE.finditer(nwk):
        out.append(m.group(1).replace("''", "'") if m.group(1) is not None else m.group(2).strip())
    return out


def nexus_to_newick(text: str):
    """Return (newick, translate_map) from a NEXUS file (handles FigTree/BEAST/MrBayes style)."""
    translate = {}
    m = re.search(r"translate\s+(.*?);", text, re.I | re.S)
    if m:
        for part in m.group(1).split(","):
            bits = part.strip().split(None, 1)
            if len(bits) == 2:
                translate[bits[0]] = bits[1].strip().strip("'")
    t = re.search(r"^\s*tree\s+[^=]*=\s*(?:\[&[RU]\]\s*)?(.*?;)", text, re.I | re.M | re.S)
    if not t:
        raise ValueError("No 'tree ... = (...);' statement found in the NEXUS file.")
    return t.group(1).strip(), translate


def read_tree(data: bytes, filename: str):
    """Return (newick_text, translate_map). Supports Newick, NEXUS, PhyloXML, NeXML."""
    text = data.decode("utf-8", errors="replace").lstrip("﻿")
    low = filename.lower()
    head = text.lstrip()[:200].lower()
    if head.startswith("#nexus") or low.endswith((".nex", ".nexus")):
        return nexus_to_newick(text)
    if head.startswith("<") or low.endswith((".xml", ".phyloxml", ".nexml")):
        from Bio import Phylo
        for fmt in ("phyloxml", "nexml"):
            try:
                tree = next(Phylo.parse(io.StringIO(text), fmt))
                buf = io.StringIO()
                Phylo.write(tree, buf, "newick")
                return buf.getvalue().strip(), {}
            except Exception:
                continue
        raise ValueError("Could not read the XML tree (tried PhyloXML and NeXML).")
    # newick: first non-empty line(s) up to ';'
    m = re.search(r"\(.*?;", text, re.S)
    if not m:
        raise ValueError("No Newick string (…;) found in this file.")
    return m.group(0).strip(), {}


def read_table(upload, sep_hint=None) -> pd.DataFrame:
    name = upload.name.lower()
    raw = upload.getvalue()
    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(raw))
    text = raw.decode("utf-8", errors="replace").lstrip("﻿")
    return pd.read_csv(io.StringIO(text), sep=sep_hint or None, engine="python")


def best_id_column(df: pd.DataFrame, tips):
    tipset = {t.lower().strip() for t in tips}
    best, score = df.columns[0], -1
    for c in df.columns:
        s = df[c].astype(str).str.lower().str.strip()
        sc = s.isin(tipset).sum()
        if sc > score:
            best, score = c, sc
    return best


def jsonable(v):
    if pd.isna(v):
        return ""
    if isinstance(v, (int, float, str, bool)):
        return v
    return str(v)


# ----------------------------------------------------------------------------- sidebar
st.sidebar.title("🌳 TreeViz")
st.sidebar.caption("Upload a tree + (optional) metadata and frequency tables.")
tree_up = st.sidebar.file_uploader("Tree file (Newick / NEXUS / PhyloXML / NeXML)", type=None, key="tree_up")
meta_up = st.sidebar.file_uploader("Metadata table (CSV / TSV / XLSX)", type=TABLE_EXT, key="meta_up")
freq_up = st.sidebar.file_uploader("Frequency table (CSV / TSV / XLSX)", type=TABLE_EXT, key="freq_up")
other_up = st.sidebar.file_uploader("Other related files (optional)", accept_multiple_files=True, key="other_up")

newick, translate, tree_name = None, {}, "tree"
meta_df = freq_df = None
err = None
if tree_up:
    try:
        newick, translate = read_tree(tree_up.getvalue(), tree_up.name)
        tree_name = Path(tree_up.name).stem
    except Exception as e:  # noqa
        err = f"Could not read tree: {e}"

if err:
    st.error(err)
if not newick:
    st.title("TreeViz")
    st.info("Upload a tree file in the sidebar to start.")
    st.markdown(
        "**What you can do:** view the tree beside sample metadata and a frequency table, reroot (any branch, MRCA, midpoint), "
        "highlight / colour branches and clades, collapse, flip, prune, rename, ladderize, colour tips by metadata, "
        "and export Newick / SVG / PNG."
    )
    st.stop()

tips = tip_names_from_newick(newick)
if translate:
    tips = [translate.get(t, t) for t in tips]
if not tips:
    st.error("No tips found in the tree.")
    st.stop()

# metadata ------------------------------------------------------------------------
if meta_up is not None:
    try:
        meta_df = read_table(meta_up)
    except Exception as e:  # noqa
        st.sidebar.error(f"Metadata: {e}")
if freq_up is not None:
    try:
        freq_df = read_table(freq_up)
    except Exception as e:  # noqa
        st.sidebar.error(f"Frequency table: {e}")

meta_rows, meta_cols, matched_meta = {}, [], 0
with st.sidebar.expander("Metadata options", expanded=meta_df is not None):
    split_on = st.text_input("Also split tip names on delimiter into columns", value="", placeholder="e.g. _  (A_ANL_W1 → f1,f2,f3)")
    split_names = st.text_input("Names for split columns (comma-separated)", value="", placeholder="Person,Site,Week")
    id_col = None
    if meta_df is not None and len(meta_df.columns):
        meta_df.columns = [str(c) for c in meta_df.columns]
        default = best_id_column(meta_df, tips)
        id_col = st.selectbox("Sample-ID column", list(meta_df.columns), index=list(meta_df.columns).index(default))

mdf = pd.DataFrame({"__tip__": tips})
if meta_df is not None and id_col:
    m = meta_df.copy()
    m["__tip__"] = m[id_col].astype(str)
    m = m.drop(columns=[id_col] if id_col != "__tip__" else [])
    m = m.drop_duplicates("__tip__")
    mdf = mdf.merge(m, how="left", on="__tip__")
    matched_meta = int(mdf.drop(columns="__tip__").notna().any(axis=1).sum())
if split_on:
    parts = pd.Series(tips).str.split(split_on, regex=False, expand=True)
    names = [n.strip() for n in split_names.split(",") if n.strip()]
    parts.columns = [names[i] if i < len(names) else f"f{i+1}" for i in range(parts.shape[1])]
    for c in parts.columns:
        mdf[c if c not in mdf.columns else c + "_split"] = parts[c].values
mdf = mdf.reset_index(drop=True)
meta_cols = [c for c in mdf.columns if c != "__tip__"]
for _, r in mdf.iterrows():
    meta_rows[r["__tip__"]] = {c: jsonable(r[c]) for c in meta_cols}

# frequency table -------------------------------------------------------------------
freq_rows, freq_cols, matched_freq = {}, [], 0
freq_long = None
if freq_df is not None and len(freq_df.columns):
    freq_df.columns = [str(c) for c in freq_df.columns]
    with st.sidebar.expander("Frequency table options", expanded=True):
        long_fmt = st.checkbox("Long format (sample, category, value)", value=False)
        if long_fmt:
            cols = list(freq_df.columns)
            c1 = st.selectbox("Sample column", cols, index=cols.index(best_id_column(freq_df, tips)))
            c2 = st.selectbox("Category column", [c for c in cols if c != c1])
            c3 = st.selectbox("Value column", [c for c in cols if c not in (c1, c2)])
            wide = freq_df.pivot_table(index=c1, columns=c2, values=c3, aggfunc="sum").reset_index()
            wide.columns = [str(c) for c in wide.columns]
            fid = c1
        else:
            wide = freq_df
            fid = st.selectbox("Sample-ID column", list(wide.columns), index=list(wide.columns).index(best_id_column(wide, tips)))
        numeric = [c for c in wide.columns if c != fid and pd.to_numeric(wide[c], errors="coerce").notna().mean() > 0.5]
        freq_cols = st.multiselect("Columns to use", numeric, default=numeric)
    if freq_cols:
        fw = wide[[fid] + freq_cols].copy()
        fw[fid] = fw[fid].astype(str)
        for c in freq_cols:
            fw[c] = pd.to_numeric(fw[c], errors="coerce").fillna(0)
        fw = fw.groupby(fid, as_index=False).mean(numeric_only=True)
        tipset = set(tips)
        matched_freq = int(fw[fid].isin(tipset).sum())
        freq_long = fw
        freq_rows = {r[fid]: {c: float(r[c]) for c in freq_cols} for _, r in fw.iterrows()}

# --------------------------------------------------------------------------------- main
sig_src = json.dumps([newick, translate, meta_cols, list(meta_rows.items())[:2000], freq_cols, list(freq_rows.items())[:2000]], default=str, sort_keys=True)
sig = hashlib.md5(sig_src.encode()).hexdigest()[:12]

c1, c2, c3 = st.columns(3)
c1.metric("Tips in tree", len(tips))
c2.metric("Matched to metadata", f"{matched_meta}/{len(tips)}" if meta_df is not None else "–")
c3.metric("Matched to frequency table", f"{matched_freq}/{len(tips)}" if freq_cols else "–")

tab_view, tab_meta, tab_freq, tab_export, tab_other, tab_help = st.tabs(
    ["🌳 Tree viewer / editor", "Metadata", "Frequency table", "Edited tree / Export", "Other files", "Help"]
)

with tab_view:
    state = _component(
        tree=newick,
        translate=translate,
        meta={"columns": meta_cols, "rows": meta_rows},
        freq={"columns": freq_cols, "rows": freq_rows},
        sig=sig,
        height=860,
        key="treeviz",
        default=None,
    )

edited = state if (isinstance(state, dict) and state.get("sig") == sig) else None
cur_newick = edited["newick"] if edited else newick
order = edited["tips"] if edited else tips
orig_order = edited["orig"] if edited else tips

with tab_meta:
    if meta_cols:
        view = mdf.rename(columns={"__tip__": "Tip"})
        st.dataframe(view, use_container_width=True, height=450)
        if meta_df is not None:
            miss = sorted(set(tips) - set(meta_df[id_col].astype(str)))
            extra = sorted(set(meta_df[id_col].astype(str)) - set(tips))
            with st.expander(f"Tips without metadata ({len(miss)})"):
                st.write(miss)
            with st.expander(f"Metadata rows not in the tree ({len(extra)})"):
                st.write(extra)
    else:
        st.info("No metadata loaded. Upload a table, or split the tip names with a delimiter (sidebar → Metadata options).")

with tab_freq:
    if freq_long is not None:
        st.dataframe(freq_long, use_container_width=True, height=300)
        ordered = freq_long.set_index(freq_long.columns[0]).reindex([o for o in orig_order if o in set(freq_long.iloc[:, 0])])
        st.caption("Frequencies in current tree order")
        st.bar_chart(ordered, horizontal=True, height=max(300, 18 * len(ordered)))
        if meta_cols:
            g = st.selectbox("Mean frequency grouped by", ["(none)"] + meta_cols)
            if g != "(none)":
                j = freq_long.merge(mdf[["__tip__", g]], left_on=freq_long.columns[0], right_on="__tip__", how="left")
                st.dataframe(j.groupby(g)[freq_cols].mean().round(4), use_container_width=True)
    else:
        st.info("No frequency table loaded.")

with tab_export:
    st.caption("Edits made in the viewer appear here automatically." if edited else "No edits yet – this is the original tree.")
    st.text_area("Newick", cur_newick, height=160)
    colA, colB, colC = st.columns(3)
    colA.download_button("⬇ Newick", cur_newick + "\n", file_name=f"{tree_name}_edited.nwk")
    if edited:
        colB.download_button("⬇ Newick with colours (FigTree NEXUS)", "#NEXUS\nbegin trees;\n\ttree tree1 = [&R] " + edited["newick_annotated"] + "\nend;\n", file_name=f"{tree_name}_edited.nex")
    tbl = pd.DataFrame({"order": range(1, len(order) + 1), "tip": order, "original_name": orig_order})
    if meta_cols:
        tbl = tbl.merge(mdf.rename(columns={"__tip__": "original_name"}), on="original_name", how="left")
    colC.download_button("⬇ Tip table (tree order) CSV", tbl.to_csv(index=False), file_name=f"{tree_name}_tip_table.csv")
    st.dataframe(tbl, use_container_width=True, height=300)
    if edited and edited.get("selected"):
        st.write("Currently selected tips:", edited["selected"])

with tab_other:
    if other_up:
        for f in other_up:
            with st.expander(f.name, expanded=False):
                try:
                    if f.name.lower().endswith(tuple("." + e for e in TABLE_EXT)):
                        st.dataframe(read_table(f), use_container_width=True)
                    else:
                        st.code(f.getvalue().decode("utf-8", errors="replace")[:20000])
                except Exception as e:  # noqa
                    st.warning(str(e))
                st.download_button("Download", f.getvalue(), file_name=f.name, key="dl_" + f.name)
    else:
        st.info("Upload any related file in the sidebar (alignment stats, SNP tables, notes…) to preview it here.")

with tab_help:
    st.markdown(
        """
**Selecting** – click a branch, internal node, or tip name. Ctrl/Shift+click adds to the selection. Double-click an internal node to collapse/expand.
Keys: `R` reroot at selection · `Del` prune · `Esc` clear · `Ctrl+Z / Ctrl+Y` undo/redo.

**Rerooting** – *Reroot here* places the root on the selected branch (position 0–1 along the branch); *MRCA* roots on the common ancestor of several selected tips (outgroup rooting); *Midpoint root* roots at the midpoint of the longest tip-to-tip path.

**Highlighting** – colour a branch or whole clade, add a shaded background to a clade, colour tip labels, or add a bracket label for a clade.

**Metadata** – sample IDs are matched to tip names (case-insensitive). If you have no table, use *Split tip names on delimiter* in the sidebar. Colour tips by any column, add colour strips beside the tips.

**Frequency table** – wide format (one row per sample, one column per strain/allele/lineage) or long format. Shown as stacked bars or a heatmap beside the tree.

**Export** – Newick, FigTree-style NEXUS with branch colours, SVG, PNG, and a tip table in current tree order (viewer sidebar section 6, or the Export tab).
        """
    )
