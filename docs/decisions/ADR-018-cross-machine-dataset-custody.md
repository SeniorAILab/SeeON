# ADR-018: Cross-Machine Dataset Custody and Sync

## Status

Accepted

## Date

2026-06-11

## Context

ADR-012 partitions `ml/data/` *within one machine* (domain-first layout, raw is
sacred, gitignore boundary, main-checkout-is-canonical for worktrees). The
autoresearch loop (#74) added a second machine: **m1-pro** runs long training
sweeps while **m3-pro** (operator's machine) holds the privately collected
nursing-home footage and performs human label review. That introduced questions
no existing ADR answers:

- Which machine is the **authority** for each asset class (videos, pose caches,
  gold labels, trained models, experiment results)?
- How do assets move between machines, given that nursing-home footage must
  never transit a third party (no cloud bucket, no git remote)?
- macOS TCC blocks `sshd` from reading `~/Documents` on m1-pro, so a remote
  repo under `~/Documents` is **unreachable by direct ssh/rsync** — transfers
  need an intermediate directory that sshd *can* read.
- During the loop, both machines write to the same git branch; data artifacts
  (gold CSV, eval JSONs) and weights (models, poses) have different
  git-trackability (`.gitignore` lines 71-81: only
  `ml/data/eval/nursing-home-gold.csv` and `raw-processed-mapping.csv` are
  trackable under `ml/data/`).

An undocumented convention emerged operationally and worked; this ADR records
it before it drifts.

## Decision

**1. Custody: m3-pro main checkout is the canonical store for all source
data.** `<main>/ml/data/` on m3-pro holds the master copy of every domain's
`raw/` and `processed/` footage (extends ADR-012's "main checkout is canonical"
from worktree-scope to fleet-scope). m1-pro holds **working replicas only**;
losing the m1-pro copy must never lose data.

**2. Source data flows one-way, m3 → m1, via rsync without `--delete`.**
Transfers go over the local network directly (LAN IP, not the overlay/Tailscale
address) and land in a **staging directory** (`~/eldercare-staging/<set>/`)
that m1-pro's sshd can read despite TCC; the remote agent moves files from
staging into its repo's `ml/data/` itself. `--delete` is forbidden — a sync
must never be able to remove footage.

**3. Results flow one-way, m1 → m3, via the staging handshake.** The remote
agent copies (never moves — running jobs keep their files) result artifacts
into `~/eldercare-staging/results-out/` preserving repo-relative paths, then
writes `FILELIST.txt` (sizes + paths) and an empty `STAGING_DONE` marker.
m3-pro polls for the marker, pulls over LAN, and verifies against
`FILELIST.txt` before placing files into the branch worktree.

**4. Git is the authority channel for labels and result text; weights never
enter it.** Gold labels (`nursing-home-gold.csv`) and experiment JSONs ride the
branch — git's history *is* the cross-machine ordering for label corrections
(e.g. a human-review fix must reach m1 by `git pull`, not by file copy).
Models, pose caches, and footage stay gitignored and move only via the staging
path.

**5. Label authority is human-only and lives on m3.** The remote agent may
propose (`status: proposed`) but never flip a row to `confirmed`; confirmation
requires human review on the operator's machine (where the footage is).

## Alternatives Considered

### Shared cloud bucket / NAS (S3, Drive, Synology)

- Pros: no staging choreography, both machines mount one truth
- Cons: nursing-home CCTV would transit/persist on third-party or
  network-exposed storage
- Rejected: violates the privacy perimeter (ADR-012 Access Boundary). The data
  must stay on operator-controlled disks.

### git-lfs for footage and weights

- Pros: one sync mechanism (git) for everything
- Cons: pushes patient-adjacent video to the GitHub remote; also bloats the
  repo for ephemeral, regenerable weights
- Rejected: the gitignore privacy chain is deliberate and non-negotiable.

### Two-way rsync (full mirror both directions)

- Pros: simplest mental model ("both sides identical")
- Cons: a mistake on either side propagates; `--delete` or a clobber could
  destroy sacred raw footage; the two machines legitimately diverge (m1 has
  models m3 lacks; m3 has raw footage m1 never needs)
- Rejected: asymmetric custody needs asymmetric flow. One-way per asset class
  is the safety property, not a limitation.

### Direct rsync into the remote repo path (no staging)

- Rejected on facts: macOS TCC denies sshd access to `~/Documents`
  ("Operation not permitted"); granting sshd Full Disk Access would widen the
  attack surface of the machine holding CCTV footage. Staging keeps sshd's
  reach to one purpose-built directory.

## Consequences

**Positive:**

- Loss of m1-pro (disk, theft, wipe) loses compute state only — never data.
- No third party ever holds nursing-home footage; the privacy perimeter stays
  two operator-controlled machines.
- Label corrections are totally ordered by git history; the 0408-503 window
  correction propagated as a commit, not a racy file copy.
- The handshake (FILELIST + STAGING_DONE + size verification) makes transfers
  verifiable and resumable (`--partial --append`; note macOS stock rsync is
  openrsync — `--append-verify` is unsupported).

**Negative / Trade-offs:**

- Staging doubles disk usage on m1-pro transiently; staging dirs need periodic
  cleanup (move to `/tmp`, never `rm -rf`, per unattended-run convention).
- Two extra hops (m3 → staging → repo) add latency and require the remote
  agent's cooperation for the final move.
- The branch worktree on m3 currently holds a **real** `ml/data/` directory
  (gold-review strips, returned pose caches) instead of the ADR-012 symlink to
  the main checkout — a known, deliberate deviation while the loop is
  mid-flight. At branch merge, consolidate: pose caches and any keeper outputs
  move into `<main>/ml/data/`, models into the main checkout's `ml/models/`,
  and the worktree reverts to the symlink convention.

Operational detail (commands, registry of current datasets, handshake steps)
lives in [`docs/rules/ml-dataset-custody.md`](../rules/ml-dataset-custody.md).
