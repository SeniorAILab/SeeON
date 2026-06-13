# ADR-016: Enforcement Timing Principle — Irreversible Harm Blocks Early, Reversible Violations Audit

## Status

Accepted. **Complements ADR-008** (which owns *where* enforcement lives: git-native hooks
from single-source `scripts/git-guard/` scripts, identical across actors). This ADR owns
*what* is blocked and *when*. **Resolves the deferral in ADR-012** ("hook/script validation
is deliberately deferred"): layout conventions are audit-tier, not hook-blocked.

## Date

2026-06-10

## Context

After the docs↔code alignment audit (#66), the question arose: which repository
conventions should be *code-enforced* (hooks, CI, tests) and which should stay
convention-level? The candidate list was broad: exec-plan lifecycle, plan immutability,
ADR protection, skill-mirror sync, branch naming, plan-first, data-leak protection,
`ml/models/` layout, periodic docs-code audit. A structured adversarial interview
(4 rounds, recorded in `docs/exec-plan/archive/convention-enforcement-hooks/spec.md`)
settled the principle.

Two facts shaped the decision:

1. **Some failures cannot be undone.** If nursing-home footage or a model weight is
   committed and pushed, a PR-time catch is too late — the data is already in remote
   history, GitHub caches, and potential forks. Force-push cleanup is unreliable.
2. **Some failures are trivially undone.** A plan archived late, a stale mirror, a
   misnamed branch — all fixable with a follow-up commit. Blocking these locally
   produces false positives, and false positives breed a `--no-verify` habit that
   erodes the gates that matter.

The repo also has no CI today (#37 open), so "PR-level blocking authority" would have
been an unbuilt promise.

## Decision

**Classify enforcement by reversibility, not importance.**

1. **Irreversible harm → deny at the earliest local point.** Asset leakage (model
   weights `*.pt *.pth *.pkl *.onnx *.h5 *.safetensors *.tflite *.ckpt`, media
   `*.mp4 *.avi *.mov *.mkv *.webm`, any blob > 5 MB) is blocked by
   `scripts/git-guard/deny-assets.sh` at **four wiring points**: `.githooks/pre-commit`
   (staged mode), `.githooks/pre-push` (push mode), Claude Code `PreToolUse Bash`,
   and Codex `pre_tool_use` — all thin callers of the same script (ADR-008 pattern).
   Escape hatch for deliberate exceptions: `GIT_GUARD_ALLOW_ASSETS=1`.
2. **Reversible convention violations → never hook-blocked, no warn tier.**
   exec-plan lifecycle, plan immutability, mirror sync, branch naming, plan-first and
   similar semantic conventions are verified by **periodic agent audit** (the #66-style
   docs↔code alignment pass), not by hooks. No new warn-level hooks: warn noise
   desensitizes and invites bypass.
3. **No convention CI.** Local deny scripts are the blocking authority for the
   irreversible class; everything else is audit. (Unrelated to #37 test/lint CI.)
4. **Gitignored paths are enforced by pytest, not git hooks.** Git hooks cannot see
   `ml/models/` (gitignored in its entirety) — `ml/tests/test_models_layout.py`
   validates the ADR-015 layout + `metadata.json` contract whenever the tree exists,
   and skips on fresh clones.

## Alternatives Considered

### Uniform PR-level blocking (block everything at PR/CI time)
- Pros: one consistent enforcement point; local friction stays zero.
- Cons: too late for irreversible leaks (already in remote history/caches/forks);
  requires a CI that does not exist yet.
- Rejected: interview rounds 2–3 — "되돌릴 수 없으면 commit-block".

### Warn-tier local hooks for reversible conventions
- Pros: early feedback without hard blocks.
- Cons: heuristic checks (e.g. plan-first) false-positive routinely; warn spam
  trains contributors to ignore or `--no-verify` past *all* gates.
- Rejected: warn layer adds noise without authority.

### Block all conventions locally
- Pros: maximal enforcement.
- Cons: reversible-violation blocks are pure friction; the deny gate's credibility
  depends on it firing only when the harm is real.
- Rejected: reversibility is the line.

### One consolidated "hooks" ADR superseding ADR-008
- Pros: single place to read everything hook-related.
- Cons: ADR-008 (*where* enforcement lives) and this decision (*what/when*) are
  different decisions with different lifespans; bundling by topic instead of by
  decision breaks MECE and would supersede a day-old accepted ADR.
- Rejected: complement, cross-reference in status headers.

## Consequences

- The deny list (extensions, 5 MB limit `GG_MAX_ASSET_BYTES`) lives in
  `scripts/git-guard/deny-assets.sh` + `lib.sh`; extending the irreversible class is a
  script change, not a new ADR.
- Known limitation: only **added** files are checked (`--diff-filter=A`); an already
  tracked file growing past 5 MB passes — acceptable because assets never enter
  tracking in the first place.
- Reversible-convention quality depends on actually running the periodic agent audit;
  there is no automated cadence (operator-triggered).
- Agents get the same refusal earlier (tool-call time) via the Claude/Codex wiring;
  humans hit it at commit time — identical message, single source.
- `docs/rules/ml-models.md` + `test_models_layout.py` are the model-layout enforcement
  pair; new gitignored trees needing contracts should follow the same pytest pattern.
