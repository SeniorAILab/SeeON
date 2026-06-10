# ADR-004: Relocate Private Video Dataset from assets/ to ml/data/

## Status

Accepted. Partially superseded by
[ADR-012](./ADR-012-ml-data-domain-first-layout.md) (input location rule →
domain-scoped `ml/data/{domain}/{raw,processed}`; the gitignore boundary and
"raw is sacred" invariants remain binding, inherited by ADR-012).

## Date

2026-06-07

## Context

During early development, fall-detection CCTV recordings were stored under a repo-root
`assets/` directory split into `assets/raw/` and `assets/processed/`. These files are
large (hundreds of megabytes per clip), private (patient-adjacent eldercare footage), and
must never be committed to git. They were therefore listed in `.gitignore` from the
beginning, making `assets/` an invisible-to-git local convention.

When the `ml/` sub-project was scaffolded as a standalone Python/uv environment owning the
full ML lifecycle — data ingestion, training, serving, and the Streamlit demo — the
original placement became a coupling problem. The `fall-video-crop-rename` skill, whose
sole job is to batch-process raw CCTV clips into lossless renamed copies, already treated
the data as ML input/output. Keeping the data at repo root while all consumers lived under
`ml/` created an implicit cross-boundary dependency that was not expressed anywhere in the
directory structure.

The project is at the Proof-of-Concept stage. No DVC, S3, or object-storage layer exists
yet; every developer accesses the videos directly from their local filesystem.

## Decision

Relocate the private video dataset from:

```
assets/raw/        →  ml/data/raw/
assets/processed/  →  ml/data/processed/
```

Co-locating the data with the ML lifecycle that consumes it. Both directories remain
git-ignored and are never committed.

The move was a plain filesystem `mv`; because `assets/` was already listed in `.gitignore`,
git had no tracked objects under it, so no git history needed to be rewritten.

The `fall-video-crop-rename` skill (`SKILL.md`) was updated to reference the new paths
throughout: `ml/data/raw/` as the input directory and `ml/data/processed/` as the output
directory. The skill's bundled scripts (`detect_footage_box.py`, `crop_lossless.sh`,
`verify_lossless.sh`, `read_fields_montage.py`) accept positional directory arguments and
were not modified — only the documentation and default path references in `SKILL.md`
changed.

The `.gitignore` was updated to make the new data location explicit with a prose comment,
and retains `assets/` as an additional ignore entry as a safety net for any stale local
copies:

```
# Private/large video assets (kept local, NEVER pushed)
# Relocated assets/ -> ml/data/ (raw inputs + processed clips). Both stay local.
ml/data/
assets/
# extra safety net: block raw media anywhere in the tree
*.mp4
*.mov
*.avi
*.mkv
```

The "raw is sacred" invariant (a hard constraint in the skill) is unchanged: files under
`ml/data/raw/` are never modified in place; all processing writes lossless copies to
`ml/data/processed/` only.

## Alternatives Considered

### Keep assets/ at repo root

The simplest option: do nothing. `assets/raw/` and `assets/processed/` stay at the repo
root, and the `fall-video-crop-rename` skill and any future training code reach upward out
of `ml/` to consume them.

Rejected because it decouples the data from its primary consumer without any compensating
benefit. The repo root is the right home for shared resources that cross multiple package
boundaries (front, backend, ml); video data that is exclusively processed and trained on
by `ml/` is not in that category. The mismatch would grow over time as more ML code
referenced the cross-boundary path.

### Commit the data to git

Store raw and/or processed clips as regular git-tracked files, possibly using Git LFS.

Rejected unconditionally. The clips are large (each raw recording can be hundreds of
megabytes), private, and potentially sensitive given their eldercare context. Committing
them — even to LFS — would require every contributor to pull them on clone, introduce
legal and privacy risk, and make the repository unsuitable for any public or semi-public
hosting. The files were gitignored from day one precisely to prevent this.

### Adopt DVC or cloud object storage now

Use a purpose-built data versioning tool (DVC, lakeFS) or a cloud bucket (S3, GCS) to
manage the dataset with proper versioning, lineage, and remote access.

Rejected as premature. The project is at PoC stage with a single developer and a small
local dataset. DVC adds a non-trivial setup burden (remote configuration, credential
management, `.dvc` pointer files, extra CLI) that is not justified before training
workflows are defined. Cloud object storage introduces cost, IAM, and network dependency.
This path is explicitly deferred and remains the right long-term direction once the
training pipeline matures and the team grows beyond one person.

## Consequences

**Positive:**

- `ml/` now owns its complete data lifecycle: raw input arrives in `ml/data/raw/`,
  processed output lands in `ml/data/processed/`, and trained artifacts are versioned
  under `ml/artifacts/`. No path leaves the `ml/` subtree during normal ML work.
- The `fall-video-crop-rename` skill's paths are self-consistent with the project
  structure a new contributor sees on disk.
- Future training code that reads `ml/data/processed/` needs no cross-boundary path
  hacks.
- `.gitignore` is unambiguous: `ml/data/` is the canonical location for local video
  data; `assets/` is kept as a fallback block to catch any stale copies; the
  tree-wide `*.mp4 / *.mov / *.avi / *.mkv` patterns act as a final safety net
  regardless of where media files land.

**Negative / trade-offs:**

- The move is not reversible via git history (the original `assets/` directory was
  gitignored and therefore has no git objects to recover). Any local copy that was not
  moved manually is lost; contributors must re-acquire or re-generate affected clips
  from their own local sources.
- If a future workspace package outside `ml/` (e.g., `backend/` for a streaming
  endpoint test, or a hypothetical `tools/` package) needs to read the raw video, it
  must cross into `ml/data/`, which is a weaker encapsulation boundary than a shared
  top-level `data/` store would provide. Accepted as an unlikely scenario at PoC stage.
- The `assets/` gitignore entry is now redundant with `ml/data/` as the canonical
  location, but it is intentionally kept as defensive coverage rather than removed.
