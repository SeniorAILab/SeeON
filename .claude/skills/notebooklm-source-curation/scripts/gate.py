#!/usr/bin/env python3
"""gate.py — NotebookLM source intake gate.

Contract:
    Evaluates a single candidate source (URL or DOI/arXiv ID) against the
    standing curation rule in docs/rules/notebooklm-source-curation.md.

    Exit codes:
        0 — PASS
        1 — BLOCK
        2 — MANUAL_REVIEW (OTHER / UNRESOLVABLE / user confirmation required)
        3 — error (network failure, bad input, etc.)

    Stdout (one line):
        PASS      <reason>
        BLOCK     <reason>
        MANUAL_REVIEW  <reason>

All numeric thresholds are read from SRC_GATE_* environment variables.
Defaults match the rule doc. No hardcoded thresholds anywhere in this file.

CLI usage:
    python3 gate.py <url_or_doi>
    python3 gate.py --allowlist /path/to/notebooklm-venue-allowlist.yaml <url_or_doi>
    python3 gate.py --existing-keys dois.txt <url_or_doi>
    python3 gate.py --help
"""

import argparse
import datetime
import json
import os
import re
import sys
import urllib.error
from pathlib import Path
from typing import Optional

# Sibling module imports
try:
    from enrichment import enrich_source
    from semantic_scholar import fetch_citations
except ImportError:
    import importlib.util as _ilu
    _dir = Path(__file__).parent
    for _name in ("semantic_scholar", "enrichment"):
        _spec = _ilu.spec_from_file_location(_name, _dir / f"{_name}.py")
        _mod = _ilu.module_from_spec(_spec)
        _spec.loader.exec_module(_mod)
        if _name == "semantic_scholar":
            fetch_citations = _mod.fetch_citations
        else:
            enrich_source = _mod.enrich_source


# ── Env-var thresholds (all have defaults; no hardcoding elsewhere) ──────────

def _int_env(key: str, default: int) -> int:
    return int(os.environ.get(key, default))


def _thresholds() -> dict:
    return {
        "cit_1_3y":       _int_env("SRC_GATE_CIT_1_3Y", 3),
        "cit_4_5y":       _int_env("SRC_GATE_CIT_4_5Y", 5),
        "cit_6y":         _int_env("SRC_GATE_CIT_6Y", 5),
        "cit_arxiv_only": _int_env("SRC_GATE_CIT_ARXIV_ONLY", 50),
        "venue_top_n":    _int_env("SRC_GATE_VENUE_TOP_N", 10),
    }


# ── Venue allowlist loader ────────────────────────────────────────────────────

_ALLOWLIST_SEARCH_PATHS = [
    Path(__file__).parents[4] / "docs/rules/notebooklm-venue-allowlist.yaml",
    Path(__file__).parents[3] / "docs/rules/notebooklm-venue-allowlist.yaml",
    Path("docs/rules/notebooklm-venue-allowlist.yaml"),
]


def _load_allowlist(path: Optional[str] = None) -> list[dict]:
    """Load venue allowlist YAML without requiring PyYAML.

    Uses a minimal line-by-line parser for the specific YAML shape used in
    notebooklm-venue-allowlist.yaml (sequence of mappings, no complex nesting).
    Falls back gracefully: returns empty list if file not found.
    """
    search = [Path(path)] if path else _ALLOWLIST_SEARCH_PATHS
    found: Optional[Path] = None
    for p in search:
        if p.exists():
            found = p
            break
    if not found:
        return []

    # Try PyYAML first (available in most environments)
    try:
        import yaml  # type: ignore
        with open(found) as f:
            data = yaml.safe_load(f)
        return data.get("venues", []) if isinstance(data, dict) else []
    except ImportError:
        pass

    # Minimal fallback parser (handles the specific YAML shape in our allowlist)
    return _parse_allowlist_minimal(found)


def _parse_allowlist_minimal(path: Path) -> list[dict]:
    """Parse the allowlist YAML without PyYAML.

    Handles only the flat-sequence-of-mappings shape used in this project.
    """
    venues: list[dict] = []
    current: Optional[dict] = None

    with open(path) as f:
        for raw_line in f:
            line = raw_line.rstrip()
            # Skip comments and blank lines
            if not line.strip() or line.strip().startswith("#"):
                continue

            # New venue entry starts with "  - venue:" or "- venue:"
            stripped = line.lstrip()
            if stripped.startswith("- venue:"):
                if current is not None:
                    venues.append(current)
                current = {}
                val = stripped[len("- venue:"):].strip().strip('"\'')
                current["venue"] = val
                continue

            if current is None:
                continue

            # Key: value lines under current entry
            m = re.match(r"\s+(\w+(?:_\w+)*):\s*(.*)", line)
            if not m:
                continue
            key, val = m.group(1), m.group(2).strip().strip('"\'')
            if val.lower() == "true":
                current[key] = True
            elif val.lower() == "false":
                current[key] = False
            elif val.lower() == "null" or val == "":
                current[key] = None
            else:
                try:
                    current[key] = int(val)
                except ValueError:
                    try:
                        current[key] = float(val)
                    except ValueError:
                        current[key] = val

    if current is not None:
        venues.append(current)
    return venues


def _is_top_venue(venue_name: str, allowlist: list[dict], top_n: int) -> bool:
    """Return True if venue_name matches an allowlisted entry with gs_rank <= top_n."""
    if not venue_name:
        return False
    name_lower = venue_name.lower()
    for entry in allowlist:
        if not entry.get("include", False):
            continue
        gs_rank = entry.get("gs_rank")
        entry_venue = str(entry.get("venue", "")).lower()
        entry_short = str(entry.get("short", "")).lower()

        # Match by substring for flexibility (e.g. "CVPR" matches the full name)
        if name_lower in entry_venue or entry_venue in name_lower:
            if gs_rank is None or gs_rank <= top_n:
                return True
        if entry_short and (name_lower == entry_short or entry_short == name_lower):
            if gs_rank is None or gs_rank <= top_n:
                return True
    return False


# ── Source type classifier ────────────────────────────────────────────────────

_OFFICIAL_TECH_DOC_DOMAINS = re.compile(
    r"(?:^|\.)(?:"
    r"pytorch\.org|tensorflow\.org|docs\.python\.org|"
    r"docs\.github\.com|docs\.docker\.com|"
    r"developer\.apple\.com|developer\.android\.com|"
    r"cloud\.google\.com|docs\.aws\.amazon\.com|"
    r"learn\.microsoft\.com|docs\.microsoft\.com|"
    r"openai\.com/docs|platform\.openai\.com|"
    r"huggingface\.co|ultralytics\.com|"
    r"scikit\-learn\.org|numpy\.org|scipy\.org|pandas\.pydata\.org|"
    r"opencv\.org|mmdetection\.readthedocs\.io|"
    r"mediapipe\.dev|coral\.ai|"
    r"notebooklm\.google\.com|support\.google\.com|"
    r"arxiv\.org|doi\.org|dl\.acm\.org|ieeexplore\.ieee\.org|"
    r"link\.springer\.com|nature\.com|sciencedirect\.com|"
    r"pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov"
    r")",
    re.I,
)

_COMMUNITY_DOMAINS = re.compile(
    r"(?:^|\.)(?:reddit\.com|stackoverflow\.com|medium\.com|"
    r"towardsdatascience\.com|dev\.to|hashnode\.dev|"
    r"qiita\.com|zenn\.dev|velog\.io|tistory\.com|naver\.com)",
    re.I,
)

_ARXIV_URL_RE = re.compile(r"arxiv\.org", re.I)
_DOI_URL_RE = re.compile(
    r"doi\.org|dl\.acm\.org|ieeexplore\.ieee\.org|link\.springer\.com|"
    r"nature\.com|sciencedirect\.com|pubmed|journals\.",
    re.I,
)


def _classify_source_type(url: str, meta: dict) -> str:
    """Return one of: 논문 | 기술문서 | 프리프린트 | OTHER."""
    doi = meta.get("doi")
    arxiv_id = meta.get("arxiv_id")
    venue = meta.get("venue") or ""

    # arXiv-only preprint: has arxiv_id but no DOI and no venue
    if arxiv_id and not doi and not venue.strip():
        return "프리프린트"

    # Paper: has DOI or arXiv with venue, or URL looks like academic publisher
    if doi or (arxiv_id and venue.strip()):
        return "논문"
    if _DOI_URL_RE.search(url) or _ARXIV_URL_RE.search(url):
        return "논문"

    # Tech doc: official vendor URL
    try:
        from urllib.parse import urlparse
        host = urlparse(url).netloc.lstrip("www.")
    except Exception:
        host = ""
    if host and _OFFICIAL_TECH_DOC_DOMAINS.search(host):
        return "기술문서"

    return "OTHER"


def _is_official_tech_doc(url: str) -> tuple[bool, str]:
    """Return (is_official, reason)."""
    if _COMMUNITY_DOMAINS.search(url):
        return False, f"community source domain: {url}"
    try:
        from urllib.parse import urlparse
        host = urlparse(url).netloc.lstrip("www.")
    except Exception:
        host = url
    if _OFFICIAL_TECH_DOC_DOMAINS.search(host):
        return True, f"official domain: {host}"
    return False, f"unrecognised tech-doc domain: {host} — manual review recommended"


# ── Age bracket ───────────────────────────────────────────────────────────────

def _age_years(pub_year: int) -> int:
    return datetime.date.today().year - pub_year


def _min_citations_for_age(age: int, is_arxiv_only: bool, thresholds: dict) -> Optional[int]:
    """Return required citation count, or None for venue-only (0-1y) papers."""
    if is_arxiv_only:
        return thresholds["cit_arxiv_only"]
    if age <= 1:
        return None   # Venue-only pass; re-audit next cycle
    if age <= 3:
        return thresholds["cit_1_3y"]
    if age <= 5:
        return thresholds["cit_4_5y"]
    return thresholds["cit_6y"]


# ── Dedup check ───────────────────────────────────────────────────────────────

def _dedup_key(meta: dict, url: str) -> Optional[str]:
    """Return the canonical dedup key: DOI > arXiv ID > normalized URL.

    Returns None when there is no DOI, no arXiv ID, and the URL is empty or
    blank.  Callers must treat None as "no key — skip dedup entirely"; they
    must NOT add None to the existing_keys set.
    """
    if meta.get("doi"):
        return f"doi:{meta['doi'].lower()}"
    if meta.get("arxiv_id"):
        return f"arxiv:{meta['arxiv_id'].lower()}"
    # No strong identifier — fall back to URL only when non-empty
    if not url or not url.strip():
        return None  # empty URL → no stable key → never deduplicate
    # Normalize URL: strip trailing slash, lowercase scheme+host
    try:
        from urllib.parse import urlparse, urlunparse
        p = urlparse(url)
        norm = urlunparse((p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/"),
                           p.params, p.query, ""))
        return f"url:{norm}"
    except Exception:
        return f"url:{url.lower()}"


def _load_existing_keys(path: str) -> set[str]:
    with open(path) as f:
        return {line.strip() for line in f if line.strip()}


# ── Core gate logic ───────────────────────────────────────────────────────────

_VERDICT = tuple[str, str, int]  # (verdict, reason, exit_code)


def evaluate(
    url: str,
    title: str = "",
    allowlist: Optional[list[dict]] = None,
    existing_keys: Optional[set[str]] = None,
) -> _VERDICT:
    """Evaluate a source and return (verdict, reason, exit_code).

    verdict: "PASS" | "BLOCK" | "MANUAL_REVIEW"
    exit_code: 0 | 1 | 2
    """
    if allowlist is None:
        allowlist = _load_allowlist()
    thresholds = _thresholds()

    # Enrich
    try:
        meta = enrich_source(url, title)
    except Exception as exc:
        return ("MANUAL_REVIEW",
                f"enrichment error — {exc}; route to manual review", 2)

    # Dedup check — skip entirely when there is no stable key (empty URL + no DOI/arXiv)
    if existing_keys:
        key = _dedup_key(meta, url)
        if key is not None and key in existing_keys:
            return ("BLOCK", f"duplicate — key already present: {key}", 1)

    source_type = _classify_source_type(url, meta)

    # ── Tech doc ─────────────────────────────────────────────────────────────
    if source_type == "기술문서":
        ok, reason = _is_official_tech_doc(url)
        if ok:
            return ("PASS", f"official tech doc — {reason}", 0)
        return ("BLOCK", f"unofficial tech doc — {reason}", 1)

    # ── OTHER ─────────────────────────────────────────────────────────────────
    if source_type == "OTHER":
        return ("MANUAL_REVIEW",
                "source type OTHER (YouTube / GitHub repo / Drive doc / text blob) — "
                "automated gate cannot evaluate; route to manual review", 2)

    # ── UNRESOLVABLE enrichment ───────────────────────────────────────────────
    if meta["resolution_path"] == "unresolvable":
        return ("MANUAL_REVIEW",
                "metadata unresolvable (URL-regex / source_describe / S2 title search all failed) — "
                "route to manual review; do not auto-pass or auto-delete", 2)

    # ── Preprint (arXiv-only) ─────────────────────────────────────────────────
    if source_type == "프리프린트":
        cit = meta.get("citation_count")
        if cit is None:
            return ("MANUAL_REVIEW",
                    "arXiv-only preprint — citation count unresolvable (S2 not found); "
                    "route to manual review", 2)
        min_cit = thresholds["cit_arxiv_only"]
        if cit >= min_cit:
            return ("PASS",
                    f"arXiv-only preprint — citation {cit} ≥ SRC_GATE_CIT_ARXIV_ONLY={min_cit}", 0)
        return ("BLOCK",
                f"arXiv-only preprint — citation {cit} < SRC_GATE_CIT_ARXIV_ONLY={min_cit}", 1)

    # ── Paper ─────────────────────────────────────────────────────────────────
    year = meta.get("year")
    venue = meta.get("venue") or ""
    cit = meta.get("citation_count")
    arxiv_id = meta.get("arxiv_id")
    doi = meta.get("doi")

    # Determine if this is arXiv-only (preprint classified as 논문 via DOI-bearing arXiv)
    is_arxiv_only = bool(arxiv_id and not doi and not venue.strip())

    if year is None:
        return ("MANUAL_REVIEW",
                "paper year unknown — cannot apply age-bracket threshold; route to manual review", 2)

    age = _age_years(year)
    min_cit = _min_citations_for_age(age, is_arxiv_only, thresholds)

    # 0–1 year: venue-only pass
    if min_cit is None:
        top_n = thresholds["venue_top_n"]
        if _is_top_venue(venue, allowlist, top_n):
            return ("PASS",
                    f"new paper (age={age}y) — top-tier venue '{venue}'; "
                    f"venue-only pass — re-audit at next cycle", 0)
        return ("BLOCK",
                f"new paper (age={age}y) — venue '{venue}' not in allowlist Top-{top_n}; "
                f"not a recognised top-tier venue", 1)

    # 1y+ : citation threshold
    if cit is None:
        return ("MANUAL_REVIEW",
                f"paper (age={age}y) — citation count unresolvable (S2 not found); "
                "route to manual review", 2)

    if cit >= min_cit:
        return ("PASS",
                f"paper (age={age}y, venue='{venue}') — citation {cit} ≥ threshold {min_cit}", 0)

    # Also check venue for 1-3y papers where both citation and venue matter
    top_n = thresholds["venue_top_n"]
    bracket = ("1–3y" if age <= 3 else "4–5y" if age <= 5 else "6y+")
    return ("BLOCK",
            f"paper (age={age}y, bracket={bracket}) — citation {cit} < threshold {min_cit}; "
            f"venue='{venue}'", 1)


# ── CLI ──────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="gate.py",
        description=(
            "Evaluate a single candidate source against the NotebookLM curation rule.\n\n"
            "Exit codes: 0=PASS  1=BLOCK  2=MANUAL_REVIEW  3=error\n\n"
            "All numeric thresholds are read from SRC_GATE_* environment variables:\n"
            "  SRC_GATE_CIT_1_3Y       (default 3)\n"
            "  SRC_GATE_CIT_4_5Y       (default 5)\n"
            "  SRC_GATE_CIT_6Y         (default 5)\n"
            "  SRC_GATE_CIT_ARXIV_ONLY (default 50)\n"
            "  SRC_GATE_VENUE_TOP_N    (default 10)\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("url", help="Source URL or DOI/arXiv ID to evaluate")
    p.add_argument("--title", default="", help="Source title (improves S2 lookup)")
    p.add_argument(
        "--allowlist",
        metavar="PATH",
        help="Path to notebooklm-venue-allowlist.yaml (auto-detected if omitted)",
    )
    p.add_argument(
        "--existing-keys",
        metavar="FILE",
        help="File with one dedup key per line; used to detect duplicates",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Output result as JSON",
    )
    return p


def main(argv: Optional[list[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    allowlist = _load_allowlist(args.allowlist)
    existing_keys: Optional[set[str]] = None
    if args.existing_keys:
        existing_keys = _load_existing_keys(args.existing_keys)

    try:
        verdict, reason, exit_code = evaluate(
            args.url,
            title=args.title,
            allowlist=allowlist,
            existing_keys=existing_keys,
        )
    except urllib.error.URLError as exc:
        msg = f"network error: {exc}"
        if args.json:
            print(json.dumps({"verdict": "ERROR", "reason": msg}))
        else:
            print(f"ERROR  {msg}")
        return 3
    except Exception as exc:
        msg = f"unexpected error: {exc}"
        if args.json:
            print(json.dumps({"verdict": "ERROR", "reason": msg}))
        else:
            print(f"ERROR  {msg}")
        return 3

    if args.json:
        print(json.dumps({"verdict": verdict, "reason": reason}))
    else:
        print(f"{verdict}\t{reason}")

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
