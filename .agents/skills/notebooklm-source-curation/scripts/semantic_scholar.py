#!/usr/bin/env python3
"""semantic_scholar.py — Semantic Scholar batch API wrapper.

Contract:
    fetch_citations(ids: list[str]) -> dict[str, int | None]
        ids: DOI strings or "arXiv:XXXX.XXXXX" format.
        Returns {id: citation_count}.
        None = paper not found on S2 (UNRESOLVABLE).
        Callers MUST treat None as a separate disposition (manual review),
        never as citation_count=0 or as an auto-pass.

    fetch_paper_meta(ids: list[str]) -> dict[str, dict | None]
        Returns full paper metadata (citationCount, year, venue, externalIds)
        or None if the paper is not found on S2.

Rate limits:
    Unauthenticated: 1 request per second (1000ms sleep between batches).
    Authenticated (S2_API_KEY env var): 100ms sleep between batches.
    Maximum 500 IDs per batch call.

    HTTP 429 handling: bounded exponential backoff — up to 3 retries with
    delays of 2s, 5s, 10s before each retry.

CLI usage:
    python3 semantic_scholar.py arXiv:2505.19877
    python3 semantic_scholar.py 10.1109/CVPR.2023.00001 arXiv:2301.00001
    python3 semantic_scholar.py --help
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional


# ── .env loader (stdlib-only, runs once at module import) ────────────────────

_ENV_SEARCH_PATHS = [
    Path(__file__).parents[4] / ".env",  # repo root via .claude/skills/.../scripts/
    Path(__file__).parents[3] / ".env",  # one level up (handles .agents/skills depth)
]


def _load_dotenv() -> None:
    """Load a .env file into os.environ; real environment variables always win.

    Search order:
        1. <repo_root>/.env  — via parents[4] then parents[3] from this script
        2. ./.env            — current working directory (fallback)

    Parsing rules:
        - Blank lines and lines starting with '#' are ignored.
        - Leading 'export ' prefix is stripped (tolerated, not required).
        - Values may be surrounded by single or double quotes (stripped).
        - No variable interpolation is performed.
        - If a key is already present in os.environ it is never overwritten.
    """
    candidates = list(_ENV_SEARCH_PATHS) + [Path(".env")]
    for path in candidates:
        try:
            if not path.exists():
                continue
            with open(path) as _f:
                for _line in _f:
                    _line = _line.strip()
                    if not _line or _line.startswith("#"):
                        continue
                    if _line.startswith("export "):
                        _line = _line[7:].strip()
                    if "=" not in _line:
                        continue
                    _key, _, _val = _line.partition("=")
                    _key = _key.strip()
                    _val = _val.strip()
                    if (len(_val) >= 2
                            and _val[0] == _val[-1]
                            and _val[0] in ('"', "'")):
                        _val = _val[1:-1]
                    if _key and _key not in os.environ:
                        os.environ[_key] = _val
            break  # stop at the first .env file found
        except OSError:
            continue


_load_dotenv()

_S2_BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch"
_S2_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
_S2_FIELDS = "citationCount,year,venue,externalIds"
_BATCH_SIZE = 500
_RATE_LIMIT_NO_KEY = 1.0   # seconds
_RATE_LIMIT_WITH_KEY = 0.1  # seconds
# Exponential backoff delays (seconds) before retries 1, 2, 3 on HTTP 429
_RETRY_DELAYS = (2, 5, 10)

# ── 429 circuit breaker ───────────────────────────────────────────────────────
# After _CIRCUIT_OPEN_THRESHOLD consecutive full-retry-exhaustion events, the
# circuit opens and all subsequent S2 calls fast-fail with HTTP 429 without
# making any network requests.  This prevents the audit from spending 17+s per
# source when S2 is IP-rate-limited at the hourly level.  Sources that hit the
# open circuit become UNRESOLVABLE → manual review (correct per contract).
# The circuit resets on the first successful S2 response.
_CIRCUIT_OPEN_THRESHOLD = 5    # consecutive exhaustions before opening
_circuit_consecutive_429: int = 0
_circuit_open: bool = False


def _circuit_check() -> None:
    """Raise HTTP 429 immediately if the circuit is open (no network call made)."""
    global _circuit_open
    if _circuit_open:
        raise urllib.error.HTTPError(
            _S2_BATCH_URL, 429,
            "Circuit open: S2 persistently rate-limited — skipping call", {}, None,
        )


def _circuit_record_success() -> None:
    global _circuit_consecutive_429, _circuit_open
    _circuit_consecutive_429 = 0
    _circuit_open = False


def _circuit_record_exhaustion() -> None:
    global _circuit_consecutive_429, _circuit_open
    _circuit_consecutive_429 += 1
    if _circuit_consecutive_429 >= _CIRCUIT_OPEN_THRESHOLD:
        if not _circuit_open:
            print(
                f"INFO: S2 circuit opened after {_circuit_consecutive_429} consecutive "
                "429-exhaustions — fast-failing remaining calls (all → UNRESOLVABLE/manual review)",
                file=sys.stderr,
            )
        _circuit_open = True


def _s2_id(paper_id: str) -> str:
    """Convert caller-facing ID format to S2 paper ID format.

    Supported input formats:
        "arXiv:2505.19877"  -> "arXiv:2505.19877"  (S2 accepts this directly)
        "10.1109/..."       -> "DOI:10.1109/..."
        "DOI:10.1109/..."   -> "DOI:10.1109/..."
    """
    if paper_id.startswith("arXiv:") or paper_id.startswith("DOI:"):
        return paper_id
    if paper_id.startswith("10."):
        return f"DOI:{paper_id}"
    return paper_id


def _build_request(url: str, data: Optional[bytes] = None,
                   api_key: Optional[str] = None) -> urllib.request.Request:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["x-api-key"] = api_key
    return urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")


def _urlopen_with_retry(req: urllib.request.Request, timeout: int = 30):
    """Open a URL request with bounded exponential backoff on HTTP 429.

    Checks the circuit breaker first (fast-fail if circuit is open).
    Attempts the request once, then retries up to len(_RETRY_DELAYS) more times
    when the server responds with 429 Too Many Requests.  Non-429 HTTP errors
    and other URLErrors are re-raised immediately.

    On success, resets the circuit breaker.
    On full-retry-exhaustion, increments the exhaustion counter (may open circuit).

    Returns the parsed JSON response body as a Python object.
    """
    _circuit_check()  # fast-fail if circuit already open
    last_exc: Optional[urllib.error.HTTPError] = None
    for attempt in range(len(_RETRY_DELAYS) + 1):
        if attempt > 0:
            delay = _RETRY_DELAYS[attempt - 1]
            print(
                f"INFO: S2 HTTP 429 — backing off {delay}s before retry {attempt}/{len(_RETRY_DELAYS)}",
                file=sys.stderr,
            )
            time.sleep(delay)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                _circuit_record_success()
                return data
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                last_exc = exc
                if attempt >= len(_RETRY_DELAYS):
                    break   # all retries used — fall through to exhaustion recording
                # else: loop continues to next attempt
            else:
                raise   # non-429 HTTP error — propagate immediately
    # All retries exhausted (or circuit just opened via _circuit_record_exhaustion)
    _circuit_record_exhaustion()
    raise last_exc


def _fetch_paper_batch_raw(ids: list[str]) -> dict[str, "dict | None"]:
    """Internal: batch-fetch full paper metadata from Semantic Scholar.

    Returns a dict mapping each caller ID to the raw S2 paper dict
    (keys: citationCount, year, venue, externalIds) or None if not found.
    """
    api_key: Optional[str] = os.environ.get("S2_API_KEY")
    sleep_interval = _RATE_LIMIT_WITH_KEY if api_key else _RATE_LIMIT_NO_KEY

    results: dict[str, "dict | None"] = {paper_id: None for paper_id in ids}
    s2_ids = [_s2_id(pid) for pid in ids]

    # Build a mapping from s2_id -> original caller id for result mapping
    s2_to_caller: dict[str, str] = {}
    for caller_id, s2_id_str in zip(ids, s2_ids):
        s2_to_caller[s2_id_str] = caller_id

    # Process in batches of _BATCH_SIZE
    batch_start = 0
    while batch_start < len(s2_ids):
        batch = s2_ids[batch_start: batch_start + _BATCH_SIZE]
        payload = json.dumps({
            "ids": batch,
            "fields": _S2_FIELDS,
        }).encode("utf-8")

        url = f"{_S2_BATCH_URL}?fields={_S2_FIELDS}"
        req = _build_request(url, data=payload, api_key=api_key)

        # Use retry-aware helper; let non-429 errors propagate
        data = _urlopen_with_retry(req, timeout=30)

        # S2 batch returns a list aligned to the request IDs;
        # null entries indicate not-found papers.
        for s2_id_str, paper in zip(batch, data):
            caller_id = s2_to_caller.get(s2_id_str, s2_id_str)
            results[caller_id] = paper  # may be None (not found)

        batch_start += _BATCH_SIZE
        if batch_start < len(s2_ids):
            time.sleep(sleep_interval)

    return results


def fetch_citations(ids: list[str]) -> dict[str, "int | None"]:
    """Batch-fetch citation counts from Semantic Scholar.

    Args:
        ids: List of paper identifiers. Accepted formats:
             - "arXiv:2505.19877"
             - "10.1234/doi.suffix" or "DOI:10.1234/doi.suffix"

    Returns:
        dict mapping each input id to its citationCount (int) or None if
        the paper was not found on S2. None is UNRESOLVABLE — callers must
        not treat it as 0 or as a passing condition.

    Raises:
        urllib.error.URLError: On network failure (caller should catch).
    """
    raw = _fetch_paper_batch_raw(ids)
    return {
        pid: (paper.get("citationCount") if paper is not None else None)
        for pid, paper in raw.items()
    }


def fetch_paper_meta(ids: list[str]) -> dict[str, "dict | None"]:
    """Batch-fetch full paper metadata from Semantic Scholar.

    Args:
        ids: List of paper identifiers (same formats as fetch_citations).

    Returns:
        dict mapping each input id to a metadata dict with keys
        (citationCount, year, venue, externalIds) or None if not found.
        None is UNRESOLVABLE — callers must route to manual review.

    Raises:
        urllib.error.URLError: On network failure (caller should catch).
    """
    return _fetch_paper_batch_raw(ids)


def search_by_title(title: str, confidence_threshold: float = 0.85) -> Optional[dict]:
    """Search S2 by title and return the best match above confidence_threshold.

    Returns a dict with keys: doi, arxiv_id, year, venue, citation_count,
    confidence — or None if no match above threshold.

    Confidence is computed as a normalised Levenshtein ratio against the
    query title (simple character-level DP). S2 already ranks by relevance;
    we further validate the top result's title similarity.
    """
    _circuit_check()  # fast-fail if circuit is open
    api_key: Optional[str] = os.environ.get("S2_API_KEY")
    sleep_interval = _RATE_LIMIT_WITH_KEY if api_key else _RATE_LIMIT_NO_KEY

    fields = "title,citationCount,year,venue,externalIds"
    encoded = urllib.parse.quote(title)
    url = f"{_S2_SEARCH_URL}?query={encoded}&fields={fields}&limit=5"
    req = _build_request(url, api_key=api_key)

    try:
        data = _urlopen_with_retry(req, timeout=30)
    except urllib.error.URLError:
        return None

    time.sleep(sleep_interval)

    papers = data.get("data", [])
    if not papers:
        return None

    best = papers[0]
    result_title = best.get("title", "")
    confidence = _title_similarity(title, result_title)

    if confidence < confidence_threshold:
        return None

    ext_ids = best.get("externalIds") or {}
    return {
        "doi": ext_ids.get("DOI"),
        "arxiv_id": ext_ids.get("ArXiv"),
        "year": best.get("year"),
        "venue": best.get("venue"),
        "citation_count": best.get("citationCount"),
        "confidence": confidence,
    }


def _title_similarity(a: str, b: str) -> float:
    """Normalised character-level edit distance similarity in [0, 1]."""
    a = a.lower().strip()
    b = b.lower().strip()
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    # Levenshtein DP
    la, lb = len(a), len(b)
    dp = list(range(lb + 1))
    for i in range(1, la + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, lb + 1):
            temp = dp[j]
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dp[j] = min(dp[j] + 1, dp[j - 1] + 1, prev + cost)
            prev = temp
    distance = dp[lb]
    return 1.0 - distance / max(la, lb)


# ── CLI ──────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="semantic_scholar.py",
        description=(
            "Fetch citation counts from Semantic Scholar for one or more paper IDs.\n"
            "Accepted formats: arXiv:XXXX.XXXXX  or  DOI (e.g. 10.1109/CVPR.2023.00001).\n"
            "None in output means UNRESOLVABLE — treat as manual review, not as 0 citations."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "ids",
        nargs="+",
        metavar="ID",
        help="arXiv:XXXX.XXXXX or DOI string(s) to look up",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON instead of plain text",
    )
    return p


def main(argv: Optional[list[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    try:
        results = fetch_citations(args.ids)
    except urllib.error.URLError as exc:
        print(f"ERROR: network failure — {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        for paper_id, count in results.items():
            status = str(count) if count is not None else "UNRESOLVABLE"
            print(f"{paper_id}\t{status}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
