# Human checkpoint queue — fall-autoresearch-loop (#74)

Unattended mode active (handoff 2026-06-10). Items below REQUIRE human action;
the loop records them here and continues with other work instead of blocking.

| # | Checkpoint | State | What the human must do |
|---|-----------|-------|------------------------|
| 1 | NH gold label confirmation (plan Step 9) | **m3 REDO DELIVERED + VALIDATED (2026-06-11, commit 0978349)** — fresh visual re-judgment on processed stems: **19 fall rows** (`status=proposed`, 3 marked BORDERLINE in notes: 2026-01-09 202호, 2026-02-25 502호, 2026-04-08 503호) + **4 no-fall** (2025-11-27 202호, 2026-02-19 404호, 2026-03-02 301호, 2026-04-19 203호 — no rows by design). m1-pro validation passed with 0 errors/0 warnings: all 19 stems ∈ processed 23, no dups, frame ranges within nb_frames, all `proposed`, fps within 5% of effective fps, pose npz present per stem; `parse_gold_csv` → confirmed=0/proposed=19 (NH gate correctly un-armed). Earlier raw-based judgments diverged heavily (6 of the old 7 "no-fall" videos are falls under processed-quality review) — no-inheritance mandate vindicated | Review the 19 proposals (esp. 3 BORDERLINE), set `status=confirmed`. **Auto-confirm is forbidden** — only after this human step can the mask freeze (item 2) proceed |
| 2 | NH reference mask freeze approval (plan Step 13b) | waiting — gold confirmed (dd5cfb8); batch-1 NH eval done (rf 8/19, logreg 6/19, svm 4/19 — inverse of LE2I rank); threshold sweep + transformer/gcn eval pending before a mask proposal is drafted | Approve freezing `ml/experiments/nh_reference_mask.json` (separate commit). Until then the NH gate cannot arm and no model adoption is final |
| 4 | Plan-scope governance: 6th family (logreg) vs 5-family plan body | **RESOLVED 2026-06-11** — user picked option (a); new slug `docs/exec-plan/active/fall-loop-phase3-linear-calibration/` retro-documents the logreg extension and carries all phase-3 work (scaler pipeline, calibration, NH threshold policy, mask proposal). Original plan stays active for loop ops | No action — slug finalized on commit |
| 5 | Privacy sign-off: facility names in committed CSVs | **RESOLVED 2026-06-11** — user decision: repo stays private, CSVs keep real facility names as-is. Standing caveat recorded: pseudonymize (NH-A/NH-B) + strip run-JSON local paths before any future public release; KakaoTalk-channel consent check deferred to the human | No action now; re-open only if the repo is ever made public |
| 3 | ~~LE2I annotation txts missing on m1-pro~~ | **RESOLVED 2026-06-11** — fetched directly from the UBFC official dataset (see decision log); 130/130 installed, smoke passed | No action needed. The pending sender-side txt push is now harmless (`--ignore-existing` will skip identical files) |

## Decision log (autonomous decisions taken within plan/spec constraints)

- 2026-06-10: ADR number 015→016→**017** — `ADR-015-ml-models-single-root.md` then
  `ADR-016-enforcement-timing-principle.md` landed on main via successive rebases;
  plan Step 17 mandated re-checking the number (`ls docs/decisions/`). Final:
  `ADR-017-fall-model-adoption-criteria.md`.
- 2026-06-10: LE2I-dependent steps unblocked early — user confirmed `le2i/poses` npz
  + Annotation_files txt fully arrived; only NH-dependent steps (evaluate_nh run,
  gold strips) wait on `ml/data/.RSYNC_DONE`. `le2i/raw` videos are NOT awaited
  (explicitly excluded by user — not needed by the loop).
- 2026-06-10: Phase 4 agent killed by process exit mid-run; partial REGISTRY refactor
  (train/evaluate/__init__) verified by pytest before completion agent resumed on top.
- 2026-06-10: worktree had a REAL ml/models dir (git wt only links ml/data) — failed
  smoke runs left a half-written random-forest folder there, tripping
  test_models_layout. Canonical store untouched (verified by mtime/size). Fixed by
  applying the m1-pro-lab skill procedure: worktree ml/models + ml/artifacts are now
  symlinks to the main clone.
- 2026-06-10: zero-positive-window fail-fast guard added to train.py (smoke mode
  previously skipped the fall-fraction gate → obscure IndexError on single-class
  predict_proba).
- 2026-06-10: `.RSYNC_DONE` marker protocol hardened after a network-glitch bug
  created a premature marker on the local side: the marker is a one-way signal
  owned by the local transfer chain (this side never creates/deletes it); it is
  trusted ONLY if its content contains `verified-by-local-chain`; empty/unsigned
  markers are ignored. Verified no marker or stray test marker existed on the
  remote at protocol adoption; no NH step had consumed the buggy early marker.
- 2026-06-10: unattended-mode directory removal: use `mv` into /tmp instead of
  `rm -rf` (project ask-rule stalls rm -rf in unattended runs).
- 2026-06-10 ~21:45: **NH transfer stall observed** — nursing-home reached
  3.97G/59 files by ~21:05, then zero growth. Two inbound rsync server
  processes are hung: the 18:08 data transfer (partial temp
  `.KakaoTalk_Video_2026-06-07-17-06-00.mp4.kUqehv9rbe`, last write 18:19) and
  a 21:24 verification dry-run (`rsync --server -n`, no activity in 20+ min).
  Looks like orphaned sessions from sender-side network glitches. Per marker
  protocol nothing was killed or touched from this side; no signed
  `.RSYNC_DONE` yet, so NH steps remain paused. **If the local chain did not
  auto-retry, re-kick the NH rsync + verification from the local mac.**
- 2026-06-10 23:38 — **refined NH stall diagnosis for sender-side debugging**:
  data has been static at 3.95G / 57 files since ~21:05. The chain ran
  verification dry-runs (`rsync --server -n` over `nursing-home/`) at 21:24
  (hung, never wrote) and 22:24 (completed in seconds), but **no signed marker
  was ever written**, and no further retry appeared in the 23:24 window —
  chain activity seems to have ceased. Two interpretations to check on the
  local mac: (a) the verification file-count check is failing (sender manifest
  vs receiver 57 files — note the full
  `KakaoTalk_Video_2026-06-07-17-06-00.mp4` IS present; only a stale 24.8MB
  rsync temp dotfile from the dead 18:08 session lingers next to it), or
  (b) verification passed but the marker-write ssh step failed on the flaky
  network and the chain did not retry it. Remote side continues polling per
  protocol and will start NH steps within 1 min of a signed marker.
  → RESOLVED 23:41: signed marker `verified-by-local-chain 2026-06-10 23:41:10`
  arrived; NH-dependent steps started immediately.
- 2026-06-11: **LE2I annotation txts acquired directly** (user-authorized:
  "직접 받을 수 있을텐데"). Reverse ssh to the mac refused (sshd off), so used
  the provenance documented in `docs/research/le2i-poc-verification.md`
  Option B — UBFC official `FallDataset.zip` (presigned S3). Avoided the
  8.95 GB download via HTTP-Range zip parsing (outer zip STORED → windowed
  inner-zip central directories): 130 txts in 6 HTTP requests. Verification
  before install: ① 1:1 clip-name match vs all 130 poses npz (70 Coffee_room
  + 60 Home, no dups) ② frame ranges valid — 96 falls, 31 ADL(0,0), 3 known
  header-defect files (Coffee_room video 26/50/52, research-doc caveat C1;
  loader logs warning and treats as ADL — same behavior as the original PoC)
  ③ 5-clip spot-check: hip-y descent confirmed within every fall interval
  ④ provenance = official UBFC source. Installed to
  `ml/data/le2i/raw/{scenario}/Annotation_files/`; smoke `--smoke-n 4` exit 0
  (all 5 families). Full 5-family baseline training launched.
- 2026-06-11: `ModelMetadata` lacked ADR-015 contract fields — train.py-written
  metadata.json failed `test_models_layout` (`source`/`reacquire` missing).
  Added `source="trained"` default + per-model `reacquire` command. Also note:
  smoke overwrote the canonical PoC artifacts under `ml/models/fall/` with toy
  models; full baseline training rewrites them properly right after.
- 2026-06-11: **Pipeline fully validated, loop ready.** Full 5-family baselines
  trained + evaluated (leaderboard initialized: gcn P@R90 0.132 > svm 0.114 >
  rf 0.103 > transformer 0.061 > lstm 0.046; all recall_90 ✓). NH pose cache
  warmed 23/23 (0 fails). Gold proposals for all 23 videos committed (16 falls
  + 7 no-fall). Rehearsal runs rehearsal-rf-001 / rehearsal-gcn-002 exercised
  the harness end-to-end: both exit 0, latency gate ✓ (87.8 ms / 0.7 ms),
  run-JSONs with eval_split_hash + params, loop_status heartbeat OK, NH gate
  correctly un-armed pre-confirmation. Operational fix: harness must run as
  `python -m experiments.harness` from `ml/` (skill doc corrected).
  **The 8h unattended run now waits ONLY on the two human gates above**
  (gold confirm → 13b mask freeze approval).
- 2026-06-11: **Gold proposals retracted — raw vs processed video mismatch**
  (human-review finding, directive `.omc/GOLD_REDO_PROCESSED.md`). Strips and
  gold rows had been produced from `raw/` stems while the canonical eval
  videos are `ml/data/nursing-home/processed/`. Executed before stand-down:
  ① raw↔processed mapping extracted and pixel-verified — **23/23 matched**,
  processed = full-length spatial crop of raw (KakaoTalk 1080×2520→1080×668
  crop at y=652/648, hospital_1 y=108, hospital_3 bit-identical), frame_offset
  0 everywhere → `ml/data/eval/raw-processed-mapping.csv` (text-only, tracked);
  ② raw-stem artifacts quarantined via `mv` to
  `/tmp/gold-raw-quarantine-1781136923/` (20 strip dirs + 935 npz); gold CSV
  truncated to header. ③ Re-detection/strip regeneration was then **stood
  down by user decision — m3 performs the redo locally**; no raw-based label
  may ever be marked confirmed. Processed-video pose npz re-extraction
  continues here (eval-infra cache, not labeling).
- 2026-06-11: pose cache rebuilt from processed videos — 23/23 OK, 0 fails,
  1,169 track npz, zero raw-stem files remaining in the canonical poses dir.
- 2026-06-11: **m3 gold redo received (0978349) and validated on m1-pro.**
  Checks run: stem membership vs `enumerate_processed_videos()` (19/19),
  duplicate rows (0), frame ranges vs ffprobe nb_frames (all within bounds),
  status uniformly `proposed`, CSV fps vs effective fps nb_frames/duration
  (all within 5%), pose npz presence per fall stem (all present),
  `parse_gold_csv` loader → confirmed=0 / proposed=19 → NH gate stays
  un-armed until human confirm. Divergence note: under processed-quality
  review, 6 of the 7 videos previously judged "no-fall" from raw strips are
  now falls (incl. 2025-12-17 301호 "detector top5 missed") and 2 previously
  "fall" videos are now no-fall (2026-02-19 404호, 2026-04-19 203호) —
  the no-inheritance mandate was the right call. Confirm remains
  human-only; mask freeze and the 8h run stay blocked behind it.
- 2026-06-11 12:35 — **Autoresearch loop phase 1 complete (waves 1–7,
  exp-003…025, ~1.5h wall).** User authorized starting without gold confirm
  (train.py is NH-independent; NH gate defers as un-armed). Highlights:
  HP wiring (47d3cc3) immediately productive — svm linear-kernel discovery
  lifted P@R90 0.114→0.4333; A-axis logistic-regression family added (46
  params, 0.04 ms) and C-curve mapped to a peak of **0.4483 at C≈1000**, a
  statistical tie with svm at the top; transformer settled at 0.2574 (d=64,
  1 layer), gcn 0.1871, rf 0.1307; lstm retired on a pre-stated bar. Both
  linear families' C curves fully mapped (over-regularized and
  near-unregularized ends both degrade). Wave 7 retrained per-family-best
  configs — exact score reproduction 5/5 — so `ml/models/fall/*` now holds
  the leaderboard-best artifacts, ready for post-confirm NH batch
  evaluation. Adoption note for the human: logreg-C1000 vs svm-C16 vs
  logreg-C29 (best AUC-PR 0.628) should be decided WITH the NH gate, not on
  LE2I P@R90 alone. Loop idles pending gates; processed-video staging
  transfer stalled at 3/23 (531 MB) since ~11:00 — sender-side check needed.
- 2026-06-11: **Gold gate 1 cleared by explicit human confirmation** — user
  directive "19건 전부 컨펌한다" recorded; all rows proposed→confirmed
  (dd5cfb8), including the 3 BORDERLINE videos.
- 2026-06-11: **NH batch-1 results invert the LE2I ranking** (snapshot
  artifacts, deployment-equivalent path, 19 confirmed falls):
  rf 8/19 > logreg-C1000 6/19 > svm-C16 4/19. Misses cluster on slow
  bed-slides / blanket occlusion / multi-person scenes; catches cluster on
  rapid collapses. Threshold-transfer vs representation-gap separation in
  progress (per-fall max-prob sweep). LE2I-only adoption would have picked
  the wrong model — the NH gate design is vindicated.
- 2026-06-11: **ultracode review (64 agents) — 4 confirmed findings, all
  actioned or queued**: ① leaderboard F1 typos fixed (svm 0.5591→0.5909
  copy-paste from exp-016; lstm 0.1773→0.1769); ② logreg Optuna C-cap 100
  raised to 3000 (the 0.4483 winner at C=1000 was only reachable via manual
  hp_override — not autonomously discoverable); ③ `propose_nh_gold.py`
  aggregate detector truncates all tracks to the SHORTEST track length
  (min_len stack) — late-video falls invisible to the slow-descent aggregate
  path; impact contained because m3's gold redo was a fresh VISUAL judgment,
  but the tool needs a NaN-pad fix before any future automated proposal run
  (flagged to m3); ④ plan-scope governance gap → queue item 4. Plus: logreg
  fit/save/load round-trip test added (was untested while being the P@R90
  leader). Phase-3 priority from the hypothesis panel: bootstrap CI +
  operating-point bandwidth audit (the 0.4483 may be a single-threshold-step
  knife edge), then a **StandardScaler pipeline experiment** — unscaled
  features are the leading structural explanation for the logreg C-inversion
  AND a plausible contributor to the NH threshold-transfer failure.
