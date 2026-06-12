#!/usr/bin/env python3
"""enrichment.py — Source metadata enrichment.

Contract:
    enrich_source(url: str, title: str) -> dict
        Resolves a NotebookLM source (URL + title) to structured metadata
        via a four-stage resolution pipeline:
            a. URL-regex       — extract DOI/arXiv ID directly from URL
            b. source_describe — parse structured metadata from NotebookLM
               source_describe response (caller provides pre-fetched dict)
            c. defuddle        — for opaque URLs with no DOI/arXiv and an
               unreliable title (empty / ≤20 chars / generic), fetch the page
               via `defuddle parse <url> --json` to extract a clean title (+
               author/published), then feed into stage d. Skipped gracefully
               if Node/defuddle is unavailable.
            d. S2 title search — Semantic Scholar /paper/search with
               match-confidence ≥ 0.85
            e. UNRESOLVABLE    — all four fail

        Returns:
            {
                "doi": str | None,
                "arxiv_id": str | None,
                "year": int | None,
                "venue": str | None,
                "citation_count": int | None,   # None = UNRESOLVABLE (never pass)
                "resolution_path": str,          # "url_regex" | "source_describe" |
                                                 # "defuddle+s2_title" | "s2_title" |
                                                 # "unresolvable"
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
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

# Import sibling module — handle both direct execution and package use
try:
    from semantic_scholar import fetch_paper_meta, search_by_title
except ImportError:
    import importlib.util, os as _os
    _dir = _os.path.dirname(_os.path.abspath(__file__))
    _spec = importlib.util.spec_from_file_location(
        "semantic_scholar", _os.path.join(_dir, "semantic_scholar.py")
    )
    _mod = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_mod)
    fetch_paper_meta = _mod.fetch_paper_meta
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

# ── Title-based extraction helpers ───────────────────────────────────────────

# Matches titles of the form "[1805.07694] Paper Name" or "[cs.CV/0612032] ..."
_ARXIV_IN_TITLE_RE = re.compile(r"^\[(\d{4}\.\d{4,5})\]|^\[([a-z\-]+/\d{7})\]", re.I)

# Matches trailing parenthetical containing a 4-digit year, e.g.:
#   "(Applied Sciences 2021, 11(1):329)"  "(CVPR 2019)"  "(arXiv 2023)"
# Allows one level of nested parens inside (e.g. "11(1):329").
_TITLE_TRAIL_PAREN_RE = re.compile(
    r"\s*\((?:[^()]*|\([^()]*\))*\d{4}(?:[^()]*|\([^()]*\))*\)\s*$"
)


def _extract_from_title(title: str) -> Optional[str]:
    """Return arXiv ID extracted from title bracket prefix, or None.

    Handles titles stored as "[1805.07694] Two-Stream Adaptive..." where the
    arXiv ID appears as a leading bracket tag.
    """
    m = _ARXIV_IN_TITLE_RE.match(title.strip())
    if not m:
        return None
    return m.group(1) or m.group(2)


def _clean_title_for_search(title: str) -> str:
    """Return a cleaned title suitable for Semantic Scholar title search.

    Removes:
    - Leading arXiv bracket prefix: "[1805.07694] " -> ""
    - Leading generic short bracket tags: "[PDF] " -> ""
    - Trailing parenthetical with year: "Title (Journal 2021, 5(1):12)" -> "Title"
    """
    cleaned = title.strip()
    # Strip leading arXiv ID bracket: "[1805.07694] ..."
    cleaned = re.sub(r"^\[\d{4}\.\d{4,5}\]\s*", "", cleaned)
    # Strip leading old-style arXiv bracket: "[cs.CV/0612032] ..."
    cleaned = re.sub(r"^\[[a-z\-]+/\d{7}\]\s*", "", cleaned, flags=re.I)
    # Strip other short bracket prefixes like "[PDF]", "[arXiv]", "[1]"
    cleaned = re.sub(r"^\[[^\]]{1,20}\]\s*", "", cleaned)
    # Strip trailing parenthetical containing a year: "(Applied Sciences 2021, ...)"
    cleaned = _TITLE_TRAIL_PAREN_RE.sub("", cleaned).strip()
    return cleaned


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
    """Call fetch_paper_meta for one paper and return structured metadata or None.

    Returns a dict with keys: citation_count, year, venue, doi, arxiv_id.
    Returns None if the paper is not found on S2.
    """
    s2_id: Optional[str] = None
    if arxiv_id:
        s2_id = f"arXiv:{arxiv_id}"
    elif doi:
        s2_id = doi

    if not s2_id:
        return None

    try:
        results = fetch_paper_meta([s2_id])
    except urllib.error.URLError:
        return None

    paper = results.get(s2_id)
    if paper is None:
        return None  # Not found on S2

    ext_ids = paper.get("externalIds") or {}
    return {
        "citation_count": paper.get("citationCount"),
        "year": paper.get("year"),
        "venue": paper.get("venue") or "",
        "doi": ext_ids.get("DOI"),
        "arxiv_id": ext_ids.get("ArXiv"),
    }


# ── Defuddle stage helpers ────────────────────────────────────────────────────

_GENERIC_TITLES = frozenset({
    "pdf", "document", "untitled", "page", "article", "paper",
    "file", "download", "view", "read",
})


def _is_unreliable_title(title: str, url: str) -> bool:
    """Return True when the stored title is too unreliable to use for S2 search.

    Triggers defuddle fallback when any of:
    - title is empty / whitespace-only
    - title length ≤ 20 characters
    - title (lowercased, stripped) is in the generic-titles blocklist
    - title equals the URL's domain name (NotebookLM sometimes stores the host
      as the title for opaque/drive sources)
    """
    stripped = title.strip()
    if not stripped or len(stripped) <= 20:
        return True
    if stripped.lower() in _GENERIC_TITLES:
        return True
    try:
        host = urllib.parse.urlparse(url).netloc.lstrip("www.").split(":")[0]
        if stripped.lower() == host.lower():
            return True
    except Exception:
        pass
    return False


def _defuddle_extract(url: str) -> Optional[dict]:
    """Fetch page content via defuddle and return extracted metadata.

    Uses `defuddle parse <url> --json` (the kepano/defuddle CLI).
    Availability check via shutil.which; if Node or defuddle is absent,
    logs a one-line notice to stderr and returns None — caller falls through
    to S2 title search unchanged.

    Returns dict with keys: title (str), author (str), published (str) —
    or None on any failure (CLI unavailable, non-zero exit, JSON parse error,
    network timeout).
    """
    cmd = shutil.which("defuddle") or shutil.which("npx")
    if not cmd:
        print(
            "INFO: defuddle stage skipped — neither 'defuddle' nor 'npx' found on PATH",
            file=sys.stderr,
        )
        return None

    # Build the invocation: `defuddle parse <url> --json`
    # or `npx -y defuddle parse <url> --json` when using npx
    if cmd.endswith("npx"):
        argv = [cmd, "-y", "defuddle", "parse", url, "--json"]
    else:
        argv = [cmd, "parse", url, "--json"]

    try:
        proc = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        print(f"INFO: defuddle stage skipped — subprocess error: {exc}", file=sys.stderr)
        return None

    if proc.returncode != 0:
        print(
            f"INFO: defuddle stage skipped — exit {proc.returncode}: "
            f"{proc.stderr.strip()[:120]}",
            file=sys.stderr,
        )
        return None

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        print(f"INFO: defuddle stage skipped — JSON parse error: {exc}", file=sys.stderr)
        return None

    extracted_title = " ".join((data.get("title") or "").split()).strip()
    if not extracted_title:
        return None

    extracted_title = _clean_page_title(extracted_title)
    if not extracted_title:
        return None

    return {
        "title": extracted_title,
        "author": (data.get("author") or "").strip(),
        "published": (data.get("published") or "").strip(),
    }


def _clean_page_title(title: str) -> str:
    """Strip common web-page title prefixes that aren't part of the paper title.

    Many academic aggregators prepend their site name or section label, e.g.:
        "Paper page - YOLOv7: Trainable bag-of-freebies..."
        "[PDF] Attention Is All You Need"
        "Abstract: Masked Autoencoders Are Scalable Vision Learners"
        "Papers With Code - CVPR 2024"

    Strategy: if the title contains " - " or " | ", take the *longer* segment.
    This works because site prefixes are usually short ("Paper page", "[PDF]",
    "Abstract") while the actual paper title is longer.

    Common bracket/tag prefixes are stripped unconditionally first.
    """
    # Strip leading bracket tags: "[PDF]", "[arXiv]", "[1]" etc.
    title = re.sub(r"^\[[^\]]{1,20}\]\s*", "", title).strip()

    # Split on first " - " or " | " and keep the longer segment
    for sep in (" - ", " | ", " – ", " — "):
        if sep in title:
            parts = title.split(sep, 1)
            # Keep the longer part; if roughly equal, keep the right side
            # (site names are on the left, paper titles on the right)
            if len(parts[0]) < len(parts[1]) or len(parts[0]) <= 20:
                title = parts[1].strip()
            break

    return title.strip()


def enrich_source(
    url: str,
    title: str,
    source_describe_meta: Optional[dict] = None,
) -> dict:
    """Resolve a NotebookLM source to structured metadata.

    Resolution order:
        a. URL-regex (fastest, no network)
        b. source_describe metadata (caller provides pre-fetched dict, no extra call)
        c. defuddle page extraction (optional, requires Node/defuddle on PATH);
           only triggered when no DOI/arXiv found and title is unreliable.
           Feeds cleaned title into stage d.
        d. Semantic Scholar title search (network, confidence ≥ 0.85)
        e. UNRESOLVABLE

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
            "resolution_path": "url_regex" | "source_describe" |
                               "defuddle+s2_title" | "s2_title" | "unresolvable",
        }
    """
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    year: Optional[int] = None
    venue: Optional[str] = None
    citation_count: Optional[int] = None
    resolution_path = "unresolvable"

    # ── Stage a: URL-regex + title arXiv bracket extraction ──────────────────
    # Extract IDs from the URL first, then fall back to title bracket prefix
    # (handles titles stored as "[1805.07694] Paper Name" with empty/opaque URL).
    doi_from_url, arxiv_from_url = _extract_from_url(url)
    arxiv_from_title = _extract_from_title(title) if title else None
    doi_cand = doi_from_url
    arxiv_cand = arxiv_from_url or arxiv_from_title  # URL takes precedence

    if doi_cand or arxiv_cand:
        doi = doi_cand
        arxiv_id = arxiv_cand
        s2_result = _fetch_s2_for_ids(doi, arxiv_id)
        if s2_result is not None:
            citation_count = s2_result.get("citation_count")
            year = s2_result.get("year")
            venue = s2_result.get("venue") or ""
            doi = doi or s2_result.get("doi")
            arxiv_id = arxiv_id or s2_result.get("arxiv_id")
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
                year = year or s2_result.get("year")
                venue = venue or s2_result.get("venue") or ""
                doi = doi or s2_result.get("doi")
                arxiv_id = arxiv_id or s2_result.get("arxiv_id")
                resolution_path = "source_describe"
                return {
                    "doi": doi,
                    "arxiv_id": arxiv_id,
                    "year": year,
                    "venue": venue,
                    "citation_count": citation_count,
                    "resolution_path": resolution_path,
                }

    # ── Stage c: defuddle page extraction ───────────────────────────────────
    # Only triggered when no DOI/arXiv ID has been found AND the stored title
    # looks unreliable (empty / too short / generic / equals domain name).
    # defuddle fetches the live page and extracts a clean title; that title is
    # then fed into stage d (S2 title search) below.
    # If defuddle is unavailable or fails, this stage is a silent no-op.
    defuddle_used = False
    if not doi and not arxiv_id and _is_unreliable_title(title, url):
        extracted = _defuddle_extract(url)
        if extracted and extracted.get("title"):
            title = extracted["title"]   # replace unreliable title with clean one
            defuddle_used = True

    # ── Stage d: S2 title search ─────────────────────────────────────────────
    # Clean the title: strip arXiv bracket prefix and trailing parenthetical
    # venue/year info (e.g. "(Applied Sciences 2021, 11(1):329)") before
    # passing to S2, which only knows the canonical paper title.
    raw_title = title.strip() if title else ""
    search_title = _clean_title_for_search(raw_title) if raw_title else ""
    if not search_title:
        search_title = raw_title  # fallback: use as-is if cleaning removed everything
    if search_title:
        try:
            match = search_by_title(search_title, confidence_threshold=0.85)
        except urllib.error.URLError:
            match = None

        if match:
            doi = doi or match.get("doi")
            arxiv_id = arxiv_id or match.get("arxiv_id")
            year = year or match.get("year")
            venue = venue or match.get("venue")
            citation_count = match.get("citation_count")
            resolution_path = "defuddle+s2_title" if defuddle_used else "s2_title"
            return {
                "doi": doi,
                "arxiv_id": arxiv_id,
                "year": year,
                "venue": venue,
                "citation_count": citation_count,
                "resolution_path": resolution_path,
            }

    # ── Stage e: UNRESOLVABLE ────────────────────────────────────────────────
    return {
        "doi": doi,
        "arxiv_id": arxiv_id,
        "year": year,
        "venue": venue,
        "citation_count": None,   # None = UNRESOLVABLE; never treat as 0 or pass
        "resolution_path": "unresolvable",
    }


# ── Bulk enrichment ──────────────────────────────────────────────────────────

def _unresolvable_meta(doi: Optional[str], arxiv_id: Optional[str]) -> dict:
    """Return the canonical unresolvable meta dict."""
    return {
        "doi": doi,
        "arxiv_id": arxiv_id,
        "year": None,
        "venue": None,
        "citation_count": None,
        "resolution_path": "unresolvable",
    }


def enrich_sources_bulk(
    sources: list,
    use_defuddle: bool = False,
) -> dict:
    """Bulk-enrich sources using a batched Semantic Scholar resolution strategy.

    Significantly faster than calling enrich_source() per source because it
    resolves all DOI/arXiv IDs in a single S2 batch call (up to 500 per
    request) instead of one HTTP request per source.

    Three phases:
      Phase 1 — local extraction (zero network):
          Extract DOI/arXiv IDs from each source URL and title bracket prefix.
          Partition sources into:
            (a) has_id     — DOI or arXiv ID found; resolved via batch call
            (b) title_only — no ID, has a usable title; uses search_by_title
            (c) empty      — no ID, no usable title; UNRESOLVABLE immediately
      Phase 2 — single batch call:
          Collect all IDs from group (a) and call fetch_paper_meta() once.
          fetch_paper_meta() handles the 500-ID chunking internally.
          Group (a) sources whose batch result is null fall through to Phase 3.
      Phase 3 — per-title search (rate-limited at 1 req/sec):
          Run search_by_title for group (b) sources and group (a) null
          fallbacks. defuddle is skipped unless use_defuddle=True (it shells
          out one subprocess per URL — slow; not suitable for bulk mode by
          default).

    Args:
        sources:      list of dicts with keys: source_id, url, title.
        use_defuddle: enable defuddle page fetch for unreliable titles.
                      Default False. Pass True via --defuddle in audit CLI.

    Returns:
        dict[source_id, meta] where meta has the same shape as enrich_source():
        doi, arxiv_id, year, venue, citation_count, resolution_path.
    """
    result: dict = {}

    # ── Phase 1: local extraction, zero network ──────────────────────────────
    # group_a: (source_id, url, title, doi_cand, arxiv_cand, s2_id)
    # group_b: (source_id, url, title) — queued for per-title search
    group_a: list = []
    group_b: list = []

    for source in sources:
        source_id = source.get("source_id", "")
        url = (source.get("url") or "").strip()
        title = (source.get("title") or "").strip()

        doi_cand, arxiv_cand = _extract_from_url(url)
        if not arxiv_cand and title:
            arxiv_cand = _extract_from_title(title) or arxiv_cand

        if doi_cand or arxiv_cand:
            s2_id = f"arXiv:{arxiv_cand}" if arxiv_cand else doi_cand
            group_a.append((source_id, url, title, doi_cand, arxiv_cand, s2_id))
        else:
            search_title = _clean_title_for_search(title) if title else ""
            if not search_title:
                search_title = title
            if search_title and len(search_title) > 5:
                group_b.append((source_id, url, title))
            else:
                result[source_id] = _unresolvable_meta(doi=None, arxiv_id=None)

    # ── Phase 2: single batch call for all group (a) IDs ────────────────────
    batch_results: dict = {}
    if group_a:
        all_s2_ids = [item[5] for item in group_a]
        try:
            batch_results = fetch_paper_meta(all_s2_ids)
        except Exception:
            batch_results = {sid: None for sid in all_s2_ids}

    for source_id, url, title, doi_cand, arxiv_cand, s2_id in group_a:
        paper = batch_results.get(s2_id)
        if paper is not None:
            ext_ids = paper.get("externalIds") or {}
            result[source_id] = {
                "doi": doi_cand or ext_ids.get("DOI"),
                "arxiv_id": arxiv_cand or ext_ids.get("ArXiv"),
                "year": paper.get("year"),
                "venue": paper.get("venue") or "",
                "citation_count": paper.get("citationCount"),
                "resolution_path": "url_regex",
            }
        else:
            # Batch returned null — record extracted IDs and queue for title search
            result[source_id] = _unresolvable_meta(doi=doi_cand, arxiv_id=arxiv_cand)
            group_b.append((source_id, url, title))

    # ── Phase 3: per-title search for group (b) + group (a) null fallbacks ───
    for source_id, url, title in group_b:
        prev = result.get(source_id, {})
        prev_doi = prev.get("doi")
        prev_arxiv = prev.get("arxiv_id")

        working_title = title
        defuddle_used = False
        if use_defuddle and not prev_doi and not prev_arxiv:
            if _is_unreliable_title(title, url):
                extracted = _defuddle_extract(url)
                if extracted and extracted.get("title"):
                    working_title = extracted["title"]
                    defuddle_used = True

        raw = working_title.strip()
        search_title = _clean_title_for_search(raw) if raw else ""
        if not search_title:
            search_title = raw

        if not search_title:
            if source_id not in result:
                result[source_id] = _unresolvable_meta(doi=prev_doi, arxiv_id=prev_arxiv)
            continue

        try:
            match = search_by_title(search_title, confidence_threshold=0.85)
        except Exception:
            match = None

        if match:
            result[source_id] = {
                "doi": prev_doi or match.get("doi"),
                "arxiv_id": prev_arxiv or match.get("arxiv_id"),
                "year": match.get("year"),
                "venue": match.get("venue"),
                "citation_count": match.get("citation_count"),
                "resolution_path": "defuddle+s2_title" if defuddle_used else "s2_title",
            }
        elif source_id not in result:
            result[source_id] = _unresolvable_meta(doi=prev_doi, arxiv_id=prev_arxiv)

    return result


# ── CLI ──────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="enrichment.py",
        description=(
            "Resolve a source URL (and optional title) to structured metadata\n"
            "via URL-regex → source_describe → defuddle → S2 title search → UNRESOLVABLE.\n\n"
            "defuddle stage: optional (requires Node/defuddle on PATH); triggered only when\n"
            "no DOI/arXiv found and stored title is unreliable (empty/short/generic).\n"
            "resolution_path values: url_regex | source_describe | defuddle+s2_title |\n"
            "                        s2_title | unresolvable\n\n"
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
