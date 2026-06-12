---
name: notebooklm-source-curation
description: >
  Gate and audit NotebookLM sources against the standing curation rule
  (docs/rules/notebooklm-source-curation.md). Two modes: (1) gate — evaluate
  a single candidate source before adding it, returning PASS/BLOCK + reason;
  (2) audit — scan an entire notebook, produce a violation report, then delete
  flagged sources after user confirm. Use whenever: adding a new source to a
  NotebookLM notebook, running a periodic quality audit, enforcing citation
  thresholds, or checking for duplicate/unofficial sources. Trigger phrases:
  "소스 추가", "입수 게이트", "게이트 체크", "노트북 감사", "audit notebook",
  "source gate", "curation check", "인용 기준 확인".
---

# notebooklm-source-curation

Enforce `docs/rules/notebooklm-source-curation.md` on NotebookLM sources.

Two modes — **gate** (pre-add check) and **audit** (full notebook scan).
All numeric thresholds are overridable via `SRC_GATE_*` environment variables.
Actual deletion requires explicit user `confirm=True`; scripts only output
deletion candidates.

## Mode A — Gate (`gate`)

**Invocation**: `/notebooklm-source-curation gate <url_or_doi>`

Check a single candidate source before adding it to a notebook.

### Workflow

1. Run `scripts/gate.py <url_or_doi>` (or paste a DOI/title).
2. The script classifies the source type, fetches citation data from Semantic
   Scholar, checks the venue allowlist, and applies the age-bracket thresholds.
3. Outputs one line: `PASS` or `BLOCK` with a human-readable reason.
4. If `PASS` → proceed to `mcp_notebooklm_source_add`.
5. If `BLOCK` → show the reason and ask the user whether to override.
6. If `UNRESOLVABLE` or `OTHER` → route to **manual review**; never auto-pass.

### Source types

| Type | Gate logic |
|---|---|
| 논문 (paper) | Year bracket + venue allowlist + citation threshold |
| 기술문서 (tech doc) | Official source check only |
| 프리프린트 (preprint) | arXiv-only citation ≥ `SRC_GATE_CIT_ARXIV_ONLY` |
| OTHER | Manual review — no auto pass/block |
| UNRESOLVABLE | Manual review — no auto pass/block |

---

## Mode B — Audit (`audit`)

**Invocation**: `/notebooklm-source-curation audit <notebook_id>`

Full retroactive scan of all sources in a notebook.

### Workflow

1. Call `mcp_notebooklm_source_list(notebook_id)` to retrieve all sources.
2. Run `scripts/audit.py` bulk enrichment (`enrich_sources_bulk(sources)`):
   **Phase 1** (zero-network): extract DOI/arXiv IDs from all URLs and title
   bracket prefixes; partition into (a) has-ID, (b) title-only, (c) empty.
   **Phase 2** (one batch call): resolve all group-(a) IDs via a single
   `POST /paper/batch` to Semantic Scholar (up to 500 IDs per request).
   **Phase 3** (per-title, rate-limited): `search_by_title` for group (b) +
   group (a) nulls. defuddle is **disabled by default** in audit bulk mode;
   enable with `--defuddle` (see below).
   Resolution paths: `url_regex` | `s2_title` | `defuddle+s2_title` |
   `unresolvable`.
3. Classify each source by type and apply gate thresholds (type-differentiated).
4. Load `docs/rules/notebooklm-venue-only-passes.yaml` for new-paper re-audit
   (venue-only passes from previous cycle re-evaluated at current age).
5. Scan for expansion candidates: co-cite ≥ `SRC_GATE_COCITE_MIN`, frequent
   author ≥ `SRC_GATE_AUTHOR_MIN`.
6. Output violation table (소스명 | 유형 | 위반사유 | 처분).
7. **Wait for user confirm** — do NOT call `source_delete` without `confirm=True`.
8. After confirm: call `mcp_notebooklm_source_delete(notebook_id, source_ids, confirm=True)`.
9. Write report to `docs/exec-plan/active/notebooklm-source-curation/audit-{date}.md`.
10. Update `docs/rules/notebooklm-venue-only-passes.yaml` with this cycle's venue-only passes.

---

## Bundled scripts

| Script | Contract |
|---|---|
| `scripts/semantic_scholar.py` | `fetch_citations(ids)`, `fetch_paper_meta(ids)` — batch S2 lookup (up to 500 IDs/call) |
| `scripts/enrichment.py` | `enrich_source(url, title) -> dict` — single-source pipeline (gate use); `enrich_sources_bulk(sources, use_defuddle=False) -> dict[source_id, meta]` — bulk audit path |
| `scripts/gate.py` | CLI: `gate.py <url_or_doi>` → stdout `PASS\|BLOCK\|MANUAL_REVIEW` + reason |
| `scripts/audit.py` | CLI: `audit.py <notebook_id> [--confirm] [--defuddle]` → bulk enrichment + violation table + optional delete |

All scripts: stdlib-only Python, executable via `python3 scripts/<name>.py --help`.

### defuddle enrichment stage (optional)

`enrichment.py` includes a defuddle stage ([kepano/defuddle](https://github.com/kepano/defuddle),
Obsidian Clipper content extractor) positioned between source_describe and S2
title search. It fires only when **no DOI/arXiv ID** was found **and** the stored
title is unreliable (empty, ≤ 20 chars, or a generic string such as `"PDF"` /
the domain name). defuddle fetches the live page, extracts a clean title (+ author
/ published date), strips common page-title prefixes (`"Paper page - "`,
`"[PDF] "`, etc.), normalises whitespace, then feeds the result into S2 title
search. `resolution_path` is set to `"defuddle+s2_title"` when this stage
produced the match. **Requires `defuddle` (or `npx`) on PATH; skipped gracefully
otherwise** — one `INFO:` line to stderr, pipeline continues unchanged.

**Audit bulk mode**: defuddle is **disabled by default** (`--defuddle` not set)
because it shells out one subprocess per affected URL and is slow at scale.
Enable it only when live page extraction is needed for opaque / Google Drive
sources: `python3 scripts/audit.py <id> --defuddle`.
`enrich_source()` (used by `gate.py` for single-source evaluation) still
runs defuddle unconditionally when triggered by an unreliable title.

---

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `SRC_GATE_CIT_1_3Y` | `3` | Min citations for papers aged 1–3 years |
| `SRC_GATE_CIT_4_5Y` | `5` | Min citations for papers aged 4–5 years |
| `SRC_GATE_CIT_6Y` | `5` | Min citations for papers aged 6+ years |
| `SRC_GATE_CIT_ARXIV_ONLY` | `50` | Min citations for arXiv-only preprints |
| `SRC_GATE_VENUE_TOP_N` | `10` | Top-N rank cutoff in GS Metrics category |
| `SRC_GATE_COCITE_MIN` | `3` | Co-citation threshold for expansion candidates |
| `SRC_GATE_AUTHOR_MIN` | `3` | Frequent-author threshold for expansion candidates |
| `S2_API_KEY` | _(empty)_ | Semantic Scholar API key; if set, reduces rate limit to 100ms |

### .env file support

All variables above can be placed in a `.env` file instead of being set in the
shell. `semantic_scholar.py` loads `.env` automatically at import time (stdlib-only,
no `python-dotenv` dependency). Because every other script in this skill imports
`semantic_scholar` first, `.env` is effectively loaded for the entire pipeline.

**Search order** (first file found wins):
1. `<repo_root>/.env` — resolved via `parents[4]` / `parents[3]` from the script
2. `./.env` — current working directory

**Rules:**
- Real environment variables always win — `.env` never overrides an already-set key.
- Blank lines and `#` comments are ignored.
- Values may be quoted with `'` or `"` (quotes are stripped).
- Leading `export ` prefix is tolerated.

**Setup:**
```bash
cp .env.example .env          # .env is gitignored; .env.example is tracked
# Edit .env and set S2_API_KEY=<your-key>
```

`.env.example` at the repo root documents all supported variables with their defaults.

---

## Dedup keys (DOI > arXiv ID > normalized URL)

Before calling `source_add`, run gate with the duplicate check enabled.
The gate script checks the dedup key against a provided existing-source list
(pass via `--existing-keys` flag or pipe from audit output).

---

## Success criteria

- [ ] `gate.py <url>` returns `PASS`, `BLOCK`, or `MANUAL_REVIEW` within ≤30s.
- [ ] All numeric thresholds overridable: `SRC_GATE_CIT_1_3Y=1 python3 scripts/gate.py …` changes behaviour.
- [ ] `audit.py <notebook_id>` outputs violation table without deleting anything.
- [ ] `audit.py <notebook_id> --confirm` deletes only after table is shown and user approves.
- [ ] UNRESOLVABLE and OTHER sources always land in manual-review, never auto-deleted.
- [ ] Report written to `docs/exec-plan/active/notebooklm-source-curation/audit-{date}.md`.
