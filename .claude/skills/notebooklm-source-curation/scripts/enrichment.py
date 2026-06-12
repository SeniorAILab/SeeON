#!/usr/bin/env python3
"""enrichment.py — Source metadata enrichment.

Contract:
    enrich_source(url: str, title: str) -> dict
        Resolves a NotebookLM source (URL + title) to structured metadata
        via a three-stage resolution pipeline:
            a. URL-regex     — extract DOI/arXiv ID directly from URL
            b. source_describe — parse structured metadata from NotebookLM
               source_describe response (caller provides pre-fetched dict)
            c. S2 title search — Semantic Scholar /paper/search with
               match-confidence ≥ 0.85
            d. UNRESOLVABLE — all three fail

        Returns:
            {
                "doi": str | None,
                "arxiv_id": str | None,
                "year": int | None,
                "venue": str | None,
                "citation_count": int | None,   # None = UNRESOLVABLE (never pass)
                "resolution_path": str,          # "url_regex" | "source_describe" | "s2_title" | "unresolvable"
            }

        citation_count of None means UNRESOLVABLE — callers must route to
        manual review, never auto-pass or auto-delete.

CLI usage:
    python3 enrichment.py <url> [--title "Paper Title"]
    python3 enrichment.py --help
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

# Import sibling module — handle both direct execution and package use
try:
    from semantic_scholar import fetch_citations, search_by_title
except ImportError:
    import importlib.util, os as _os
    _dir = _os.path.dirname(_os.path.abspath(__file__))
    _spec = importlib.util.spec_from_file_location(
        "semantic_scholar", _os.path.join(_dir, "semantic_scholar.py")
    )
    _mod = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_mod)
    fetch_citations = _mod.fetch_citations
    search_by_title = _mod.search_by_title


# ── URL-regex patterns ────────────────────────────────────────────────────────

_ARXIV_PATTERNS = [
    re.compile(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})", re.I),
    re.compile(r"arxiv\.org/(?:abs|pdf)/([a-z\-]+/\d{7})", re.I),
]

_DOI_PATTERNS = [
    re.compile(r"doi\.org/(10\.[^/?#\s]+/[^/?#\s]+)", re.I),
    re.compile(r"dl\.acm\.org/doi/(10\.[^/?#\s]+/[^/?#\s]+)", re.I),
    re.compile(r"ieeexplore\.ieee\.org/[^?]*document/(\d+)", re.I),  # IEEE doc id — not DOI
    re.compile(r"link\.springer\.com/article/(10\.[^/?#\s]+/[^/?#\s]+)", re.I),
    re.compile(r"(?:^|/)(?:doi|DOI)[:/](10\.[^/\s]+/[^\s]+)"),
]

# IEEE Xplore document IDs can sometimes be resolved via DOI pattern
_IEEE_DOC_RE = re.compile(r"ieeexplore\.ieee\.org/[^?]*document/(\d+)", re.I)


def _extract_from_url(url: str) -> tuple[Optional[str], Optional[str]]:
    """Return (doi, arxiv_id) extracted from URL via regex. Both may be None."""
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None

    for pat in _ARXIV_PATTERNS:
        m = pat.search(url)
        if m:
            arxiv_id = m.group(1)
            break

    if not arxiv_id:
        for pat in _DOI_PATTERNS:
            m = pat.search(url)
            if m:
                candidate = m.group(1)
                # Skip IEEE doc-ID pattern (numeric only); those aren't DOIs
                if not re.fullmatch(r"\d+", candidate):
                    doi = candidate
                break

    return doi, arxiv_id


def _fetch_s2_for_ids(doi: Optional[str], arxiv_id: Optional[str]) -> Optional[dict]:
    """Call fetch_citations for one paper and return a metadata dict or None."""
    s2_id: Optional[str] = None
    if arxiv_id:
        s2_id = f"arXiv:{arxiv_id}"
    elif doi:
        s2_id = doi

    if not s2_id:
        return None

    try:
        results = fetch_citations([s2_id])
    except urllib.error.URLError:
        return None

    count = results.get(s2_id)
    if count is None:
        return None  # Not found on S2

    return {"citation_count": count}


def enrich_source(
    url: str,
    title: str,
    source_describe_meta: Optional[dict] = None,
) -> dict:
    """Resolve a NotebookLM source to structured metadata.

    Resolution order:
        a. URL-regex (fastest, no network)
        b. source_describe metadata (caller provides pre-fetched dict, no extra call)
        c. Semantic Scholar title search (network, confidence ≥ 0.85)
        d. UNRESOLVABLE

    Args:
        url: The source URL as stored in NotebookLM.
        title: The source title as stored in NotebookLM.
        source_describe_meta: Pre-fetched dict from NotebookLM source_describe
            (optional). If provided, used in stage (b) before S2 title search.
            Expected keys (all optional): title, year, authors, doi, arxiv_id.

    Returns:
        {
            "doi": str | None,
            "arxiv_id": str | None,
            "year": int | None,
            "venue": str | None,
            "citation_count": int | None,
            "resolution_path": "url_regex" | "source_describe" | "s2_title" | "unresolvable",
        }
    """
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    year: Optional[int] = None
    venue: Optional[str] = None
    citation_count: Optional[int] = None
    resolution_path = "unresolvable"

    # ── Stage a: URL-regex ───────────────────────────────────────────────────
    doi_from_url, arxiv_from_url = _extract_from_url(url)
    if doi_from_url or arxiv_from_url:
        doi = doi_from_url
        arxiv_id = arxiv_from_url
        s2_result = _fetch_s2_for_ids(doi, arxiv_id)
        if s2_result is not None:
            citation_count = s2_result.get("citation_count")
            resolution_path = "url_regex"
            return {
                "doi": doi,
                "arxiv_id": arxiv_id,
                "year": year,
                "venue": venue,
                "citation_count": citation_count,
                "resolution_path": resolution_path,
            }
        # DOI/arXiv extracted but not on S2 — still record IDs, path stays unresolvable for now

    # ── Stage b: source_describe metadata ───────────────────────────────────
    if source_describe_meta:
        sd_doi = source_describe_meta.get("doi")
        sd_arxiv = source_describe_meta.get("arxiv_id")
        sd_year = source_describe_meta.get("year")
        sd_venue = source_describe_meta.get("venue")

        if sd_doi or sd_arxiv:
            doi = doi or sd_doi
            arxiv_id = arxiv_id or sd_arxiv
            year = sd_year
            venue = sd_venue
            s2_result = _fetch_s2_for_ids(doi, arxiv_id)
            if s2_result is not None:
                citation_count = s2_result.get("citation_count")
                resolution_path = "source_describe"
                return {
                    "doi": doi,
                    "arxiv_id": arxiv_id,
                    "year": year,
                    "venue": venue,
                    "citation_count": citation_count,
                    "resolution_path": resolution_path,
                }

    # ── Stage c: S2 title search ─────────────────────────────────────────────
    if title and title.strip():
        try:
            match = search_by_title(title, confidence_threshold=0.85)
        except urllib.error.URLError:
            match = None

        if match:
            doi = doi or match.get("doi")
            arxiv_id = arxiv_id or match.get("arxiv_id")
            year = year or match.get("year")
            venue = venue or match.get("venue")
            citation_count = match.get("citation_count")
            resolution_path = "s2_title"
            return {
                "doi": doi,
                "arxiv_id": arxiv_id,
                "year": year,
                "venue": venue,
                "citation_count": citation_count,
                "resolution_path": resolution_path,
            }

    # ── Stage d: UNRESOLVABLE ────────────────────────────────────────────────
    return {
        "doi": doi,
        "arxiv_id": arxiv_id,
        "year": year,
        "venue": venue,
        "citation_count": None,   # None = UNRESOLVABLE; never treat as 0 or pass
        "resolution_path": "unresolvable",
    }


# ── CLI ──────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="enrichment.py",
        description=(
            "Resolve a source URL (and optional title) to structured metadata\n"
            "via URL-regex → source_describe → S2 title search → UNRESOLVABLE.\n\n"
            "Outputs JSON with: doi, arxiv_id, year, venue, citation_count, resolution_path.\n"
            "citation_count=null means UNRESOLVABLE — route to manual review, never auto-pass."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("url", help="Source URL to enrich")
    p.add_argument("--title", default="", help="Source title (improves S2 title-search accuracy)")
    p.add_argument(
        "--source-describe-json",
        metavar="FILE",
        help="Path to JSON file containing source_describe metadata (optional)",
    )
    return p


def main(argv: Optional[list[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    source_describe_meta: Optional[dict] = None
    if args.source_describe_json:
        with open(args.source_describe_json) as f:
            source_describe_meta = json.load(f)

    result = enrich_source(args.url, args.title, source_describe_meta)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
