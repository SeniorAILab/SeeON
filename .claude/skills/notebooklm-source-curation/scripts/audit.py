#!/usr/bin/env python3
"""audit.py — NotebookLM notebook retroactive audit.

Contract:
    Scans all sources in a NotebookLM notebook, applies the curation gate to
    each, produces a violation report, and — only after explicit user confirm —
    deletes the flagged sources via NotebookLM MCP.

    This script is designed to be called by the AI agent (Claude) within a
    NotebookLM MCP session. The actual MCP calls (source_list, source_describe,
    source_delete) are expressed as pseudo-calls that the orchestrating agent
    executes. When run standalone (no MCP context), the script accepts a JSON
    file of sources for dry-run testing.

    Deletion guard:
        source_delete is NEVER called without --confirm flag.
        Without --confirm the script exits after printing the violation table.

    UNRESOLVABLE sources are NEVER auto-deleted — always manual review.
    OTHER-type sources are NEVER auto-deleted — always manual review.

    Report output:
        docs/exec-plan/active/notebooklm-source-curation/audit-{YYYY-MM-DD}.md

    Venue-only pass state file (updated after audit):
        docs/rules/notebooklm-venue-only-passes.yaml

Exit codes:
    0 — audit complete (violations found or not; report written)
    1 — error
    2 — no sources found

CLI usage:
    python3 audit.py <notebook_id> [--sources-json FILE] [--confirm]
    python3 audit.py --help
"""

import argparse
import datetime
import json
import os
import sys
from pathlib import Path
from typing import Optional

# Sibling module imports
try:
    from enrichment import enrich_source
    from gate import (
        _classify_source_type,
        _dedup_key,
        _is_official_tech_doc,
        _is_top_venue,
        _min_citations_for_age,
        _age_years,
        _int_env,
        _load_allowlist,
        _thresholds,
    )
except ImportError:
    import importlib.util as _ilu
    _dir = Path(__file__).parent
    for _name in ("semantic_scholar", "enrichment", "gate"):
        _spec = _ilu.spec_from_file_location(_name, _dir / f"{_name}.py")
        _m = _ilu.module_from_spec(_spec)
        _spec.loader.exec_module(_m)
        if _name == "enrichment":
            enrich_source = _m.enrich_source
        elif _name == "gate":
            _classify_source_type = _m._classify_source_type
            _dedup_key = _m._dedup_key
            _is_official_tech_doc = _m._is_official_tech_doc
            _is_top_venue = _m._is_top_venue
            _min_citations_for_age = _m._min_citations_for_age
            _age_years = _m._age_years
            _int_env = _m._int_env
            _load_allowlist = _m._load_allowlist
            _thresholds = _m._thresholds


# ── Paths ─────────────────────────────────────────────────────────────────────

_REPO_ROOT_CANDIDATES = [
    Path(__file__).parents[5],   # .claude/skills/notebooklm-source-curation/scripts/ -> repo
    Path(__file__).parents[4],
    Path("."),
]


def _repo_root() -> Path:
    for p in _REPO_ROOT_CANDIDATES:
        if (p / "docs" / "rules").exists():
            return p
    return Path(".")


def _venue_passes_path() -> Path:
    return _repo_root() / "docs" / "rules" / "notebooklm-venue-only-passes.yaml"


def _report_path(date_str: str) -> Path:
    return (_repo_root()
            / "docs" / "exec-plan" / "active" / "notebooklm-source-curation"
            / f"audit-{date_str}.md")


# ── Venue-only passes state file ──────────────────────────────────────────────

def _load_venue_passes() -> list[dict]:
    path = _venue_passes_path()
    if not path.exists():
        return []
    try:
        import yaml  # type: ignore
        with open(path) as f:
            data = yaml.safe_load(f)
        return data if isinstance(data, list) else []
    except ImportError:
        pass
    # Minimal parser: each entry starts with "- source_id:"
    entries: list[dict] = []
    current: Optional[dict] = None
    import re
    with open(path) as f:
        for raw in f:
            line = raw.rstrip()
            stripped = line.lstrip()
            if stripped.startswith("- source_id:"):
                if current:
                    entries.append(current)
                current = {"source_id": stripped[len("- source_id:"):].strip().strip('"')}
            elif current is not None:
                m = re.match(r"\s+(\w+(?:_\w+)*):\s*(.*)", line)
                if m:
                    current[m.group(1)] = m.group(2).strip().strip('"\'')
    if current:
        entries.append(current)
    return entries


def _save_venue_passes(passes: list[dict]) -> None:
    path = _venue_passes_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["# Auto-updated by audit.py — do not edit manually\n",
             "# Schema: source_id, url, title, first_passed_date, venue, year_at_approval\n"]
    for entry in passes:
        lines.append(f"- source_id: \"{entry.get('source_id', '')}\"\n")
        for k in ("url", "title", "first_passed_date", "venue"):
            v = entry.get(k, "")
            lines.append(f"  {k}: \"{v}\"\n")
        lines.append(f"  year_at_approval: {entry.get('year_at_approval', 'null')}\n")
    with open(path, "w") as f:
        f.writelines(lines)


# ── Per-source audit ──────────────────────────────────────────────────────────

_DISPOSITION_DELETE = "삭제"
_DISPOSITION_KEEP = "유지"
_DISPOSITION_MANUAL = "manual review"


def _audit_one(
    source: dict,
    allowlist: list[dict],
    thresholds: dict,
    existing_keys: set[str],
    venue_passes: list[dict],
) -> dict:
    """Audit one source. Returns a result dict with disposition."""
    source_id = source.get("source_id", "")
    url = source.get("url", "")
    title = source.get("title", "")

    # Enrich
    try:
        meta = enrich_source(url, title)
    except Exception as exc:
        return {
            "source_id": source_id,
            "title": title,
            "url": url,
            "type": "UNRESOLVABLE",
            "violation": f"enrichment error: {exc}",
            "disposition": _DISPOSITION_MANUAL,
            "meta": {},
        }

    source_type = _classify_source_type(url, meta)

    # ── OTHER — always manual review, never auto-delete ───────────────────────
    # Must be checked BEFORE dedup so an OTHER source is never given 삭제
    # just because it shares a key with another source.
    if source_type == "OTHER":
        return {
            "source_id": source_id,
            "title": title,
            "url": url,
            "type": "OTHER",
            "violation": "automated gate cannot evaluate this source type",
            "disposition": _DISPOSITION_MANUAL,
            "meta": meta,
        }

    # ── Dedup — runs for all non-OTHER sources ───────────────────────────────
    # _dedup_key returns None when there is no DOI/arXiv and the URL is empty;
    # in that case there is no stable identity to deduplicate against (Bug 1
    # fix).  When a key IS present (strong DOI/arXiv or non-empty URL),
    # duplicates are flagged 삭제 even when citation count is UNRESOLVABLE —
    # the extra copy should be removed regardless of S2 availability.
    key = _dedup_key(meta, url)
    if key is not None:
        if key in existing_keys:
            return {
                "source_id": source_id,
                "title": title,
                "url": url,
                "type": source_type,
                "violation": f"duplicate key: {key}",
                "disposition": _DISPOSITION_DELETE,
                "meta": meta,
            }
        existing_keys.add(key)

    # ── Tech doc ──────────────────────────────────────────────────────────────
    # Evaluated BEFORE the UNRESOLVABLE check: tech docs have no S2 entry by
    # design, so resolution_path is always "unresolvable" for them.  Domain
    # check is the only gate that matters here.
    if source_type == "기술문서":
        ok, reason = _is_official_tech_doc(url)
        if ok:
            return _keep(source_id, title, url, source_type, meta)
        return {
            "source_id": source_id,
            "title": title,
            "url": url,
            "type": source_type,
            "violation": f"unofficial tech doc: {reason}",
            "disposition": _DISPOSITION_DELETE,
            "meta": meta,
        }

    # ── UNRESOLVABLE — always manual review, never auto-delete ───────────────
    # Checked AFTER dedup so that duplicate arXiv/DOI sources are still
    # flagged 삭제 even when S2 is rate-limited (the first occurrence is
    # UNRESOLVABLE → manual review; extra copies are duplicates → 삭제).
    # Checked AFTER 기술문서 because tech docs legitimately have no S2 record.
    if meta["resolution_path"] == "unresolvable":
        return {
            "source_id": source_id,
            "title": title,
            "url": url,
            "type": "UNRESOLVABLE",
            "violation": "metadata unresolvable after all resolution stages",
            "disposition": _DISPOSITION_MANUAL,
            "meta": meta,
        }

    # ── Preprint ──────────────────────────────────────────────────────────────
    if source_type == "프리프린트":
        cit = meta.get("citation_count")
        if cit is None:
            return {
                "source_id": source_id,
                "title": title,
                "url": url,
                "type": source_type,
                "violation": "citation count unresolvable on S2",
                "disposition": _DISPOSITION_MANUAL,
                "meta": meta,
            }
        min_cit = thresholds["cit_arxiv_only"]
        if cit >= min_cit:
            return _keep(source_id, title, url, source_type, meta)
        return {
            "source_id": source_id,
            "title": title,
            "url": url,
            "type": source_type,
            "violation": f"arXiv-only citation {cit} < SRC_GATE_CIT_ARXIV_ONLY={min_cit}",
            "disposition": _DISPOSITION_DELETE,
            "meta": meta,
        }

    # ── Paper ─────────────────────────────────────────────────────────────────
    year = meta.get("year")
    venue = meta.get("venue") or ""
    cit = meta.get("citation_count")

    if year is None:
        return {
            "source_id": source_id,
            "title": title,
            "url": url,
            "type": source_type,
            "violation": "publication year unknown",
            "disposition": _DISPOSITION_MANUAL,
            "meta": meta,
        }

    age = _age_years(year)

    # Check new-paper re-audit: was this source a venue-only pass in a prior cycle?
    prev_pass = next((p for p in venue_passes if p.get("source_id") == source_id), None)
    if prev_pass:
        # Force citation check at current age (ignore venue-only exemption)
        min_cit_recheck = _min_citations_for_age(age, is_arxiv_only=False, thresholds=thresholds)
        if min_cit_recheck is not None:
            if cit is None:
                return {
                    "source_id": source_id,
                    "title": title,
                    "url": url,
                    "type": source_type,
                    "violation": f"venue-only re-audit (age={age}y): citation unresolvable",
                    "disposition": _DISPOSITION_MANUAL,
                    "meta": meta,
                }
            if cit < min_cit_recheck:
                return {
                    "source_id": source_id,
                    "title": title,
                    "url": url,
                    "type": source_type,
                    "violation": f"venue-only re-audit (age={age}y): citation {cit} < {min_cit_recheck}",
                    "disposition": _DISPOSITION_DELETE,
                    "meta": meta,
                }

    min_cit = _min_citations_for_age(age, is_arxiv_only=False, thresholds=thresholds)

    # 0–1 year: venue-only pass
    if min_cit is None:
        top_n = thresholds["venue_top_n"]
        if _is_top_venue(venue, allowlist, top_n):
            return _keep(source_id, title, url, source_type, meta, venue_only_pass=True)
        return {
            "source_id": source_id,
            "title": title,
            "url": url,
            "type": source_type,
            "violation": f"new paper (age={age}y): venue '{venue}' not top-tier (Top-{top_n})",
            "disposition": _DISPOSITION_DELETE,
            "meta": meta,
        }

    # 1y+: citation threshold
    if cit is None:
        return {
            "source_id": source_id,
            "title": title,
            "url": url,
            "type": source_type,
            "violation": f"paper (age={age}y): citation count unresolvable on S2",
            "disposition": _DISPOSITION_MANUAL,
            "meta": meta,
        }

    bracket = ("1–3y" if age <= 3 else "4–5y" if age <= 5 else "6y+")
    if cit >= min_cit:
        return _keep(source_id, title, url, source_type, meta)
    return {
        "source_id": source_id,
        "title": title,
        "url": url,
        "type": source_type,
        "violation": f"paper ({bracket}, age={age}y): citation {cit} < threshold {min_cit}",
        "disposition": _DISPOSITION_DELETE,
        "meta": meta,
    }


def _keep(source_id, title, url, source_type, meta, venue_only_pass=False) -> dict:
    return {
        "source_id": source_id,
        "title": title,
        "url": url,
        "type": source_type,
        "violation": None,
        "disposition": _DISPOSITION_KEEP,
        "venue_only_pass": venue_only_pass,
        "meta": meta,
    }


# ── Expansion candidates ──────────────────────────────────────────────────────

def _find_expansion_candidates(
    results: list[dict],
    thresholds: dict,
) -> list[dict]:
    """Identify expansion candidates from co-citation and frequent-author analysis.

    This is a best-effort offline analysis. Full co-citation data requires
    Semantic Scholar reference endpoint (not batch citations). Here we flag
    the pattern for the orchestrating agent to follow up via S2 API.
    """
    cocite_min = _int_env("SRC_GATE_COCITE_MIN", thresholds.get("cocite_min", 3))
    author_min = _int_env("SRC_GATE_AUTHOR_MIN", thresholds.get("author_min", 3))

    # Collect author counts from enriched metadata
    author_counts: dict[str, int] = {}
    for r in results:
        meta = r.get("meta", {})
        for author in meta.get("authors", []):
            name = author.strip()
            if name:
                author_counts[name] = author_counts.get(name, 0) + 1

    frequent_authors = [
        a for a, count in author_counts.items() if count >= author_min
    ]

    # Note: full co-citation analysis requires S2 references endpoint
    # (not covered by batch citations). The agent should call:
    #   GET /paper/{id}/references?fields=paperId,citationCount,venue,year
    # and aggregate cross-references across the corpus.

    return [
        {
            "type": "frequent_author",
            "value": author,
            "count": author_counts[author],
            "threshold": author_min,
            "note": "fetch author's papers via S2 /author/{id}/papers and re-apply gate",
        }
        for author in frequent_authors
    ]


# ── Report writer ─────────────────────────────────────────────────────────────

def _write_report(
    notebook_id: str,
    date_str: str,
    total: int,
    results: list[dict],
    expansion_candidates: list[dict],
    confirmed: bool,
) -> Path:
    path = _report_path(date_str)
    path.parent.mkdir(parents=True, exist_ok=True)

    violations = [r for r in results if r["disposition"] != _DISPOSITION_KEEP]
    kept = [r for r in results if r["disposition"] == _DISPOSITION_KEEP]
    deleted = [r for r in violations if r["disposition"] == _DISPOSITION_DELETE]
    manual = [r for r in violations if r["disposition"] == _DISPOSITION_MANUAL]

    lines = [
        f"# NotebookLM 소스 감사 리포트\n\n",
        f"- **노트북 ID**: `{notebook_id}`\n",
        f"- **감사 날짜**: {date_str}\n",
        f"- **처분 확인**: {'완료 (삭제 실행됨)' if confirmed else '미확인 (dry-run — 삭제 없음)'}\n\n",
        "## 요약\n\n",
        f"| 항목 | 수량 |\n|---|---|\n",
        f"| 총 소스 수 | {total} |\n",
        f"| 유지 | {len(kept)} |\n",
        f"| 삭제 대상 | {len(deleted)} |\n",
        f"| manual review 대상 | {len(manual)} |\n\n",
    ]

    if violations:
        lines.append("## 위반 소스 목록\n\n")
        lines.append("| 소스명 | 유형 | 위반사유 | 처분 |\n")
        lines.append("|---|---|---|---|\n")
        for r in violations:
            t = r.get("title") or r.get("url", "")[:60]
            lines.append(
                f"| {t} | {r['type']} | {r['violation']} | {r['disposition']} |\n"
            )
        lines.append("\n")

    if expansion_candidates:
        lines.append("## 확장 후보 (동일 기준표 통과 필요)\n\n")
        lines.append("| 유형 | 값 | 빈도 | 임계값 | 비고 |\n")
        lines.append("|---|---|---|---|---|\n")
        for c in expansion_candidates:
            lines.append(
                f"| {c['type']} | {c['value']} | {c['count']} | {c['threshold']} | {c.get('note', '')} |\n"
            )
        lines.append("\n")

    if not violations:
        lines.append("_위반 소스 없음 — 모든 소스가 기준을 통과했습니다._\n")

    with open(path, "w") as f:
        f.writelines(lines)

    return path


# ── Main audit flow ───────────────────────────────────────────────────────────

def run_audit(
    notebook_id: str,
    sources: list[dict],
    confirm: bool = False,
    allowlist_path: Optional[str] = None,
) -> int:
    """Run audit on a list of sources. Returns exit code."""
    if not sources:
        print("No sources found.", file=sys.stderr)
        return 2

    allowlist = _load_allowlist(allowlist_path)
    thresholds = _thresholds()
    thresholds["cocite_min"] = _int_env("SRC_GATE_COCITE_MIN", 3)
    thresholds["author_min"] = _int_env("SRC_GATE_AUTHOR_MIN", 3)
    venue_passes = _load_venue_passes()
    existing_keys: set[str] = set()
    total = len(sources)

    print(f"Auditing {total} sources in notebook {notebook_id} ...")
    results: list[dict] = []
    for i, source in enumerate(sources, 1):
        title_short = (source.get("title") or source.get("url", ""))[:50]
        print(f"  [{i}/{total}] {title_short}", end="\r")
        result = _audit_one(source, allowlist, thresholds, existing_keys, venue_passes)
        results.append(result)
    print()

    # ── Violation table ───────────────────────────────────────────────────────
    violations = [r for r in results if r["disposition"] != _DISPOSITION_KEEP]
    to_delete = [r for r in violations if r["disposition"] == _DISPOSITION_DELETE]
    manual_review = [r for r in violations if r["disposition"] == _DISPOSITION_MANUAL]

    print("\n## 위반 소스 목록\n")
    if not violations:
        print("위반 소스 없음 — 모든 소스가 기준을 통과했습니다.\n")
    else:
        header = f"{'소스명':<50} {'유형':<12} {'위반사유':<55} {'처분'}"
        print(header)
        print("-" * len(header))
        for r in violations:
            t = (r.get("title") or r.get("url", ""))[:48]
            print(f"{t:<50} {r['type']:<12} {r['violation']:<55} {r['disposition']}")

    print(f"\n요약: 총 {total}건 | 유지 {total - len(violations)}건 | "
          f"삭제 대상 {len(to_delete)}건 | manual review {len(manual_review)}건\n")

    # ── Expansion candidates ──────────────────────────────────────────────────
    expansion = _find_expansion_candidates(results, thresholds)
    if expansion:
        print("## 확장 후보 (동일 기준표 통과 필요)\n")
        for c in expansion:
            print(f"  {c['type']}: {c['value']} (빈도 {c['count']} / 임계값 {c['threshold']})")
        print()

    # ── Guard: no deletion without --confirm ──────────────────────────────────
    if not confirm:
        print("삭제를 실행하려면 --confirm 플래그를 추가하세요.")
        print("(이 실행은 dry-run입니다 — 아무것도 삭제되지 않았습니다.)\n")
    else:
        if to_delete:
            ids_to_delete = [r["source_id"] for r in to_delete if r.get("source_id")]
            print(f"[confirm=True] {len(ids_to_delete)}건 삭제 대상:")
            for sid in ids_to_delete:
                print(f"  - {sid}")
            print()
            print("NOTE: 실제 삭제는 NotebookLM MCP 도구를 통해 실행됩니다.")
            print("  mcp_notebooklm_source_delete(")
            print(f"      notebook_id='{notebook_id}',")
            print(f"      source_ids={json.dumps(ids_to_delete)},")
            print("      confirm=True")
            print("  )")
        else:
            print("삭제할 소스가 없습니다.")

    # ── Update venue-only passes ──────────────────────────────────────────────
    new_passes = [
        r for r in results
        if r.get("venue_only_pass") and r["disposition"] == _DISPOSITION_KEEP
    ]
    if new_passes:
        date_str = datetime.date.today().isoformat()
        existing_pass_ids = {p.get("source_id") for p in venue_passes}
        for r in new_passes:
            if r["source_id"] not in existing_pass_ids:
                venue_passes.append({
                    "source_id": r["source_id"],
                    "url": r["url"],
                    "title": r.get("title", ""),
                    "first_passed_date": date_str,
                    "venue": r["meta"].get("venue", ""),
                    "year_at_approval": r["meta"].get("year"),
                })
        _save_venue_passes(venue_passes)
        print(f"venue-only passes 상태 파일 업데이트: {len(new_passes)}건 추가")

    # ── Write report ──────────────────────────────────────────────────────────
    date_str = datetime.date.today().isoformat()
    report_path = _write_report(
        notebook_id, date_str, total, results, expansion, confirmed=confirm
    )
    print(f"\n리포트 저장: {report_path}")

    return 0


# ── CLI ──────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="audit.py",
        description=(
            "Retroactive audit of all sources in a NotebookLM notebook.\n\n"
            "Without --confirm: prints violation table only (dry-run, no deletions).\n"
            "With --confirm:    also prints the source_delete MCP call to execute.\n\n"
            "UNRESOLVABLE and OTHER sources are always routed to manual review.\n"
            "Deletion never happens without explicit --confirm.\n\n"
            "Env-var overrides:\n"
            "  SRC_GATE_CIT_1_3Y       (default 3)\n"
            "  SRC_GATE_CIT_4_5Y       (default 5)\n"
            "  SRC_GATE_CIT_6Y         (default 5)\n"
            "  SRC_GATE_CIT_ARXIV_ONLY (default 50)\n"
            "  SRC_GATE_VENUE_TOP_N    (default 10)\n"
            "  SRC_GATE_COCITE_MIN     (default 3)\n"
            "  SRC_GATE_AUTHOR_MIN     (default 3)\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("notebook_id", help="NotebookLM notebook ID to audit")
    p.add_argument(
        "--sources-json",
        metavar="FILE",
        help=(
            "JSON file with source list for standalone/dry-run testing. "
            "Format: [{\"source_id\": \"...\", \"url\": \"...\", \"title\": \"...\"}]. "
            "In a live MCP session the agent calls mcp_notebooklm_source_list instead."
        ),
    )
    p.add_argument(
        "--confirm",
        action="store_true",
        help="Print the source_delete MCP call (actual deletion requires agent execution).",
    )
    p.add_argument(
        "--allowlist",
        metavar="PATH",
        help="Path to notebooklm-venue-allowlist.yaml (auto-detected if omitted)",
    )
    return p


def main(argv: Optional[list[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    sources: list[dict] = []
    if args.sources_json:
        with open(args.sources_json) as f:
            sources = json.load(f)
    else:
        print(
            "INFO: No --sources-json provided. In a live MCP session the orchestrating\n"
            "      agent calls mcp_notebooklm_source_list to retrieve sources and passes\n"
            "      them to run_audit(). Running with empty source list (dry-run only).",
            file=sys.stderr,
        )
        # Proceed with empty list — will exit code 2
        sources = []

    return run_audit(
        notebook_id=args.notebook_id,
        sources=sources,
        confirm=args.confirm,
        allowlist_path=args.allowlist,
    )


if __name__ == "__main__":
    sys.exit(main())
