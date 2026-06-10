#!/usr/bin/env sh
# git wt — issue-driven worktree manager.
#
#   git wt <issue#>            Create branch <type>/<issue#>-<slug> off origin/<default>
#                              and a worktree for it; print the worktree path.
#   git wt rm <issue#|branch>  Remove the worktree (git worktree remove + prune).
#                              Does NOT delete the branch — use `git branch -d` after merge.
#   git wt ls                  List worktrees.
#
# <type> is read from the issue's `type: <x>` label (feat|fix|chore|docs|refactor|test),
# falling back to feat. Override with `git wt <issue#> --type fix`.
#
# Worktrees live OUTSIDE the repo to avoid dirtying status:
#   WORKTREE_ROOT (default: <repo-parent>/<repo>-worktrees) / <branch>
#
# Research basis (run wf_eb2eff77-150): no tool maps issue -> worktree, and teardown
# MUST use `git worktree remove` (never rm -rf) + `git worktree prune` or phantom
# .git/worktrees/ entries block branch checkout and `git branch -d`.
set -eu

_gg_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=scripts/git-guard/lib.sh
. "$_gg_dir/lib.sh"

usage() {
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

require_gh() {
  command -v gh >/dev/null 2>&1 || gg_die "gh CLI not found — install it: https://cli.github.com"
}

repo_root() { git rev-parse --show-toplevel 2>/dev/null || gg_die "not inside a git repository"; }

repo_name() {
  url=$(git remote get-url origin 2>/dev/null || true)
  if [ -n "$url" ]; then
    basename "$url" .git
  else
    basename "$(repo_root)"
  fi
}

default_branch() {
  # origin/HEAD -> origin/<default>, fall back to main.
  ref=$(git symbolic-ref --quiet refs/remotes/origin/HEAD 2>/dev/null || true)
  if [ -n "$ref" ]; then
    basename "$ref"
  else
    echo main
  fi
}

worktree_root() {
  root=$(repo_root)
  parent=$(dirname "$root")
  printf '%s' "${WORKTREE_ROOT:-$parent/$(repo_name)-worktrees}"
}

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
    | cut -c1-50 \
    | sed -E 's/-+$//'
}

# Echo the type derived from the issue's `type: <x>` label, or empty.
issue_type() {
  gh issue view "$1" --json labels \
    --jq 'first(.labels[].name | select(startswith("type: ")) | sub("type: "; "")) // ""' \
    2>/dev/null || printf ''
}

issue_title() { gh issue view "$1" --json title --jq '.title' 2>/dev/null || printf ''; }

cmd_create() {
  num=""
  type_override=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --type) type_override="${2:-}"; shift 2 ;;
      -h|--help) usage 0 ;;
      -*) gg_die "unknown flag: $1" ;;
      *) num="$1"; shift ;;
    esac
  done
  [ -n "$num" ] || usage 1
  case "$num" in *[!0-9]*) gg_die "issue number must be numeric: $num" ;; esac
  require_gh

  title=$(issue_title "$num")
  [ -n "$title" ] || gg_die "could not read issue #$num (does it exist? is gh authed?)"

  type="$type_override"
  [ -n "$type" ] || type=$(issue_type "$num")
  [ -n "$type" ] || type="feat"
  case "$type" in
    feat|fix|chore|docs|refactor|test) ;;
    *) gg_warn "non-standard type '$type' — proceeding anyway" ;;
  esac

  slug=$(slugify "$title")
  [ -n "$slug" ] || slug="issue"
  branch="$type/$num-$slug"

  if git show-ref --verify --quiet "refs/heads/$branch"; then
    existing=$(git worktree list --porcelain | awk -v b="refs/heads/$branch" '
      /^worktree /{p=$2} /^branch /{if($2==b) print p}')
    gg_die "branch '$branch' already exists${existing:+ (worktree: $existing)}"
  fi

  base=$(default_branch)
  git fetch --quiet origin "$base" 2>/dev/null || gg_warn "could not fetch origin/$base — branching off local ref"

  path="$(worktree_root)/$branch"
  mkdir -p "$(dirname "$path")"
  git worktree add -b "$branch" "$path" "origin/$base" >&2
  link_ml_data "$path"
  link_ml_models "$path"

  printf '%s\n' "$path"
}

# ml/data is gitignored, so a fresh worktree sees an empty data tree. The
# canonical physical store is the MAIN checkout's ml/data (ADR-012 /
# docs/rules/ml-filesystem-layout.md); link the new worktree to it so the
# demo and training scripts see real data. A missing link degrades silently
# in the demo (empty dropdown) but hard-crashes training.
link_ml_data() {
  wt_path="$1"
  main_root=$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')
  main_data="$main_root/ml/data"
  if [ ! -d "$main_data" ]; then
    gg_warn "main checkout has no ml/data ($main_data) — skipped ml/data symlink; demo/training will see no data"
    return 0
  fi
  [ -d "$wt_path/ml" ] || return 0
  if [ -e "$wt_path/ml/data" ]; then
    gg_warn "$wt_path/ml/data already exists — skipped ml/data symlink"
    return 0
  fi
  ln -s "$main_data" "$wt_path/ml/data"
  gg_warn "linked ml/data -> $main_data"
}

# ml/models is gitignored (whole tree — weights, trained artifacts, third-party
# checkpoints).  The canonical physical store is the MAIN checkout's ml/models
# (ADR-015); link the new worktree to it so training/serving scripts see real
# models.  A missing link degrades silently in the demo (models report unavailable)
# but hard-crashes any serving path that tries to load a model.
link_ml_models() {
  wt_path="$1"
  main_root=$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')
  main_models="$main_root/ml/models"
  if [ ! -d "$main_models" ]; then
    gg_warn "main checkout has no ml/models ($main_models) — skipped ml/models symlink; serving/training will see no models"
    return 0
  fi
  [ -d "$wt_path/ml" ] || return 0
  if [ -e "$wt_path/ml/models" ]; then
    gg_warn "$wt_path/ml/models already exists — skipped ml/models symlink"
    return 0
  fi
  ln -s "$main_models" "$wt_path/ml/models"
  gg_warn "linked ml/models -> $main_models"
}

resolve_worktree_path() {
  arg="$1"
  # Build candidate branch refs: exact, or any */<num>-*
  git worktree list --porcelain | awk -v a="$arg" '
    /^worktree /{p=$2}
    /^branch /{
      b=$2; sub("refs/heads/","",b)
      if (b==a) {print p; exit}
      n=a
      if (n ~ /^[0-9]+$/ && b ~ ("/" n "-")) {print p; exit}
    }'
}

cmd_rm() {
  force=""
  arg=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --force|-f) force="--force"; shift ;;
      *) arg="$1"; shift ;;
    esac
  done
  [ -n "$arg" ] || usage 1
  path=$(resolve_worktree_path "$arg")
  [ -n "$path" ] || gg_die "no worktree found for '$arg'"
  # shellcheck disable=SC2086
  git worktree remove $force "$path" || gg_die "worktree remove failed (dirty? use: git wt rm $arg --force)"
  git worktree prune
  gg_warn "removed worktree $path (branch kept — delete after merge with: git branch -d)"
}

main() {
  [ $# -gt 0 ] || usage 1
  case "$1" in
    rm|remove) shift; cmd_rm "$@" ;;
    ls|list) git worktree list ;;
    -h|--help) usage 0 ;;
    *) cmd_create "$@" ;;
  esac
}

main "$@"
