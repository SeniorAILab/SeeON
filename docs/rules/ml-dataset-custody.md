# Rule: dataset custody and cross-machine sync

> Scope: every dataset and model artifact that exists on more than one machine.
> Records the *operational* "who holds what, and how it moves" rule; the *why*
> lives in decision map.
> Single-machine layout is [ml-filesystem-layout.md](./ml-filesystem-layout.md)
> (decision map); model layout is [ml-models.md](./ml-models.md) (decision map).

## Custody map — who is the authority

| Asset class | Authority (master copy) | Replica | Moves via |
|---|---|---|---|
| Footage (`{domain}/raw`, `{domain}/processed`) | **m3-pro** `<main>/ml/data/` | m1-pro working copy | staging rsync, m3 → m1 only |
| Gold labels (`ml/data/eval/nursing-home-gold.csv`) | **git branch** (human-confirmed on m3 only) | both checkouts | `git pull` — never file copy |
| Pose caches (`{domain}/poses/*.npz`) | regenerable — producing machine | other machine on demand | staging rsync (or re-extract) |
| Trained models (`ml/models/`) | **m1-pro** (training machine) until adoption | m3-pro pulled snapshot | staging handshake, m1 → m3 |
| Experiment results (`ml/experiments/*.json`, analysis MD) | **git branch** | both checkouts | commit + `git pull` |

Rules of thumb:

- **Footage is irreplaceable** → only m3 is authoritative, sync is one-way,
  `--delete` is forbidden, raw is never modified in place (decision map).
- **Labels are law** → corrections travel as commits so both machines agree on
  ordering. The remote agent never sets `status: confirmed` (human gate).
- **Weights are regenerable** → never committed, freely re-synced or rebuilt.

## Provenance registry

One row per domain. Update this table only when a dataset is added or its
source changes — per-file counts are discovery, not registry (see below).

| Domain | Source / provenance | Privacy class | Entry path |
|---|---|---|---|
| `nursing-home` | 베스트요양원 1·2 CCTV exports, provided by 준호형 (KakaoTalk video transfers); cropped to incident clips in `processed/` | **operator-only** — never leaves the two operator machines, never in git, never served externally | `ml/data/nursing-home/` |
| `le2i` | Le2i public academic fall-detection dataset (Coffee room / Home scenes) | public — no constraint, keep source annotations alongside | `ml/data/le2i/` |

Discovery commands (run, don't hand-maintain):

```bash
find ml/data -maxdepth 2 -type d                  # what domains/roles exist here
ls ml/data/{nursing-home,le2i}/processed | wc -l  # clip counts
find ml/models -name metadata.json | wc -l        # model artifacts (decision map contract)
```

## Transfer procedure — m3 → m1 (source data)

1. Use the **LAN address directly** (`beomsu@192.168.0.12`), not the
   Tailscale `100.x` overlay address — same subnet, ~double-digit× faster.
2. rsync into the staging dir, never the repo path (TCC blocks sshd from
   `~/Documents`): `~/eldercare-staging/<set-name>/`.
3. Flags: `-a --partial --append` (macOS stock rsync is openrsync;
   `--append-verify` is unsupported). Parallelize per-file with `xargs -P 4`
   and retry loops for large sets. **Never `--delete`.**
4. Verify: compare per-file size fingerprints
   (`md5 of sorted size list, local vs remote`).
5. Tell the remote agent (tmux) to `mv` staging → `ml/data/...` and verify
   (e.g. pose-cache frame counts against clips).

## Transfer procedure — m1 → m3 (results)

1. Remote agent **copies** (`cp -R`, never `mv` — running jobs keep their
   files) artifacts into `~/eldercare-staging/results-out/` preserving
   repo-relative paths, excluding footage.
2. Remote writes `FILELIST.txt` (size + path per line) and an empty
   `STAGING_DONE` marker, in that order.
3. m3 polls for `STAGING_DONE`, pulls over LAN, verifies every FILELIST entry
   exists locally, then places files into the **branch worktree**.
4. Text artifacts (eval JSONs, analysis MD) get committed to the branch;
   weights and pose caches stay gitignored where they land.
5. Staging cleanup on m1: move to `/tmp`, never `rm -rf` (unattended-run
   convention).

## Invariants

- **Footage never transits a third party.** No cloud bucket, no git remote, no
  LFS — the privacy perimeter is exactly the two operator machines (decision map,
  decision map Demo Access Boundary).
- **The only git-trackable files under `ml/data/` are
  `eval/nursing-home-gold.csv` and `eval/raw-processed-mapping.csv`**
  (`.gitignore` negation chain). Everything else under `ml/data/` and all of
  `ml/models/` stays untracked — check `git status` before every commit.
- **Sync is one-way per asset class** (table above). There is no "mirror both
  machines" operation, by design.
- **`ml/data/.RSYNC_DONE` is operator-managed** — agents never create or
  delete it.
- **Known deviation:** the feat/74 worktree holds a real `ml/data/` (strips,
  returned poses) instead of the decision map symlink while the loop runs.
  Consolidate into `<main>/ml/data/` and restore the symlink at branch merge
  (decision map Consequences).
