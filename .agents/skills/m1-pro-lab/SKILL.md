---
name: m1-pro-lab
description: Access, bootstrap, and run the eldercare-fall-ai autoresearch loop on the remote m1-pro machine. Use when connecting to m1-pro, setting up a worktree on the remote, syncing assets, running smoke tests, or launching an unattended autoresearch run.
---

# m1-pro Lab

Operational reference for the eldercare-fall-ai remote lab on m1-pro.
Every command below is copy-pasteable. Follow the sections in order for a fresh session.

## Access

The ssh config sets a `RemoteCommand` that breaks scripted ssh and rsync channels.
The `-o RemoteCommand=none` flag is **mandatory** — omitting it causes hang or silent failure.

```bash
ssh -o RemoteCommand=none m1-pro
```

## Session

Always create or reattach to the dedicated tmux session. **Never use the existing `main` session** — it may be running other work.

```bash
tmux new -As eldercare-fall
```

`new -As` creates the session if absent and attaches if it already exists.

### Local shortcut: 2-pane reusable-slot session (`eflab`)

For two goals side by side, a local zsh function (`~/.dotfiles/.zshrc`) opens the
`eldercare-fall` session split into two panes, each `cd`-ed into a worktree and running
plain `gjc`:

```bash
eflab                         # default: panes in lab/a + lab/b
eflab feat/81-... feat/83-... # or any paths under eldercare-fall-ai-worktrees/
```

The function (single double-quoted remote string so ssh quoting never breaks):

```zsh
eflab() {
  local a="${1:-lab/a}" b="${2:-lab/b}"
  ssh -t -o RemoteCommand=none m1-pro "
    s=eldercare-fall
    base=\"\$HOME/Documents/01_Project/eldercare-fall-ai-worktrees\"
    tmux has-session -t \$s 2>/dev/null || {
      tmux new-session -d -s \$s -c \"\$base/$a\"
      tmux send-keys -t \$s gjc C-m
      tmux split-window -h -t \$s -c \"\$base/$b\"
      tmux send-keys -t \$s gjc C-m
      tmux select-pane -t \$s.0
    }
    tmux attach -t \$s
  "
}
```

- Re-running `eflab` just reattaches (`has-session` guard skips re-launch) — reuse forever.
- `-o RemoteCommand=none` is mandatory: the `m1-pro` host's `RemoteCommand tmux ... main`
  would otherwise hijack into the shared `main` session.
- `gjc` resolves only under the pane's **zsh** (`~/.bun/bin/gjc` via `.zshrc`); `bash -lc`
  does not see it. tmux panes spawn zsh, so it works.

#### Reusable lab slots (`lab/a`, `lab/b`)

Persistent personal sandboxes, **outside** the issue-driven `git wt` convention (raw worktree
add off `main`; no hook blocks creation — only commit/push are guarded). Use plain `gjc` here,
not `gjc --worktree` (which lands in a separate `.gajae-code-worktrees/` bucket symlinking only
`node_modules`). For a real PR, branch properly inside the slot: `git wt <issue#>`.

Recreate the slots if missing (run on m1-pro):

```bash
MAIN=~/Documents/01_Project/eldercare-fall-ai
WT=~/Documents/01_Project/eldercare-fall-ai-worktrees
cd "$MAIN" && git fetch origin --quiet && mkdir -p "$MAIN/ml/artifacts"
for slot in a b; do
  git worktree add -b "lab/$slot" "$WT/lab/$slot" main
  for d in data models artifacts; do ln -s "$MAIN/ml/$d" "$WT/lab/$slot/ml/$d"; done
done
```

Gaps to fill manually per slot: `.env.development` (backend work — not symlinked) and the
**shared Postgres `fall_dev`** — two goals migrating the same DB collide; for true isolation
give each goal its own schema/DB.

## Repo path

The repo lives at the same absolute path as on the local machine:

```
~/Documents/01_Project/eldercare-fall-ai
```

## First-time clone setup

After a fresh clone on m1-pro, run the git-guard setup once. Without it the `git wt` alias and `.githooks/` enforcement are inactive, and the entire worktree workflow is broken.

```bash
cd ~/Documents/01_Project/eldercare-fall-ai
sh scripts/git-guard/setup-hooks.sh
```

## Worktree procedure

Run these steps inside the `eldercare-fall` tmux session every time you start a new task.

```bash
# 1. Bring main up to date
cd ~/Documents/01_Project/eldercare-fall-ai
git pull

# 2. Create the worktree (reads issue title + label automatically)
git wt <issue#>
# e.g. git wt 74  →  worktree at ../eldercare-fall-ai-worktrees/feat/74-fall-autoresearch-loop

# 3. Enter the worktree
cd <worktree-path>   # path printed by git wt

# 4. Asset symlinks
#    ml/data, ml/models, ml/artifacts are git-ignored — a fresh worktree lacks them.
#    git wt already symlinks ml/data automatically.
#    You must manually link ml/models and ml/artifacts from the MAIN clone.

MAIN=~/Documents/01_Project/eldercare-fall-ai

# ml/artifacts may not exist before first training — create it so the symlink survives
mkdir -p "$MAIN/ml/artifacts"

ln -s "$MAIN/ml/models"    ml/models
ln -s "$MAIN/ml/artifacts" ml/artifacts

# 5. Verify all three links resolve (guard against dangling symlinks)
ls -la ml/data ml/models ml/artifacts

# 6. Update Claude Code before launching
claude update

# 7. Launch Claude Code inside the tmux session
claude
```

## Asset rsync (local → remote)

Run from your **local machine**. Direction is one-way: local → remote only.
`--ignore-existing` and the absence of `--delete` protect read-only raw footage from accidental overwrite or deletion.
`-e 'ssh -o RemoteCommand=none'` is required — the ssh config `RemoteCommand` breaks the rsync transport channel without it.

```bash
# Sync raw data and processed poses
rsync -a --ignore-existing -e 'ssh -o RemoteCommand=none' ml/data/   m1-pro:~/Documents/01_Project/eldercare-fall-ai/ml/data/

# Sync weights and model artifacts (ml/models — NOT ml/weights)
rsync -a --ignore-existing -e 'ssh -o RemoteCommand=none' ml/models/ m1-pro:~/Documents/01_Project/eldercare-fall-ai/ml/models/
```

Run both commands before the first smoke test or unattended run.

### Transfer-completion marker (`ml/data/.RSYNC_DONE`)

The local transfer chain — and only the local chain — writes `ml/data/.RSYNC_DONE`
on the remote after its file-count verification passes. The remote side (Claude
included) must treat it as a strictly one-way, read-only signal:

- **Never create, modify, or delete** the marker from the remote side.
- Trust the marker **only if its content contains `verified-by-local-chain`**.
  An empty or unsigned marker is a known network-glitch artifact — ignore it.
- Tests of marker-polling logic must use tmp-directory fixture paths, never the
  real `ml/data/.RSYNC_DONE` path (a test marker there sends false signals to
  local monitoring).

## Smoke test

Run inside the worktree on m1-pro. Validates the data pipeline end-to-end and arm64 torch correctness.

> Note: `uv run python -m training.evaluate` alone is a vacuous pass when artifacts are absent (it exits 0 with an empty table). Always use `training.train --smoke-n 4` for the smoke gate.

```bash
cd ml
uv sync
uv run python -m training.train --smoke-n 4
uv run pytest tests/
```

Both commands must exit 0 before proceeding to any training or unattended run.

## Unattended-run protocol

This section defines how Claude operates during an autonomous autoresearch session on m1-pro. The loop runs inside the `eldercare-fall` tmux session with no human present.

### Permissions prerequisite

Before launching an unattended run, verify that `~/.claude/settings.local.json` (m1-pro clone) contains an allowlist that permits at minimum:

- `uv` (sync, run)
- `python` / `uv run python` (harness, train, evaluate, pytest)
- `pytest`
- Read/write access to `ml/experiments/`

Without this allowlist Claude will be blocked by permission prompts mid-run and the session will stall.

### Loop behaviour

1. **Read context** — Read `ml/experiments/leaderboard.md` and recent `ml/experiments/runs/*.md` journal entries to understand the current best models, failure patterns, and untried directions.

2. **Propose next experiment** — Formulate one architecture- or feature-level hypothesis (examples: "add temporal attention to ST-GCN", "apply isotonic calibration to RF probabilities", "reduce LSTM layers to 1 to lower latency"). **Do not propose hyperparameter values** — HP search is Optuna's job inside `harness.py` (`n_trials ≈ 5` per run).

3. **Run harness** — Execute the hypothesis via the single-experiment CLI.
   Must run as a module from `ml/` (script-path execution breaks `training`
   imports), and `--config` takes a JSON **file path**, not inline JSON:

   ```bash
   cd ml && uv run python -m experiments.harness --config /tmp/<id>.json
   ```

   `harness.py` performs internally: Optuna HP search → best-trial train → LE2I evaluate → NH gate check → writes `ml/experiments/runs/{id}.json`.

4. **Record results** — Write `ml/experiments/runs/{id}.md` with sections: Hypothesis, Changes, Results (metrics from run JSON), Adoption decision, and — for rejected experiments — a mandatory **Failure Analysis** section explaining why the experiment failed. Update `ml/experiments/leaderboard.md` with the new result.

5. **Check loop_status** — After each experiment, read `ml/experiments/loop_status.json` (updated by harness). If `elapsed_h >= 8` or `experiments_completed >= 20`, stop and write the summary report (see below). If `disk_free_gb < 10` or three consecutive experiments have `recall_90_achieved: false`, pause and write a status report before continuing.

6. **Repeat** from step 1 until budget is reached.

### Budget

- Hard stop: **8 hours elapsed** OR **20 experiments completed**, whichever comes first.
- Do not re-run a hypothesis that already has a `runs/{id}.json` entry (check the journal on crash-restart to avoid duplicates).

### End-of-run summary

When the budget is reached, write `ml/experiments/summary_report.md` containing:

- **Single best model**: family, `weights_path`, LE2I precision@recall≥0.90, NH gate status, `inference_latency_ms`.
- **Lessons Learned**: a concise block summarising which architecture/feature directions consistently failed, which showed promise, and recommended next steps.
