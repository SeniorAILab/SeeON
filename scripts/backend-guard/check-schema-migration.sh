#!/usr/bin/env sh
# check-schema-migration.sh — Prisma 스키마↔마이그레이션 결합(coupling) 검사.
#
# 목적: backend/prisma/schema.prisma 가 바뀌었는데 동반 마이그레이션
#   (backend/prisma/migrations/*/migration.sql) 이 없으면 거부한다. 스키마만 바꾸고
#   마이그레이션을 빠뜨리면 'prisma migrate deploy' 가 깨지거나 DB/코드가 어긋난다.
#
# 이 검사는 ESLint로 잡을 수 없는 "배포 계약(contract)" 이므로 lint가 아니라 스크립트로
# 둔다. ADR-008 단일소스 패턴: .githooks/pre-commit 와 CI 가 이 스크립트 하나를 호출한다
# (로직을 어디서도 재구현하지 않는다). 에이전트 pre-edit 훅에는 넣지 않는다 — 스키마만
# 스테이지된 동안 모든 셸/편집을 막아 데드락을 유발할 수 있고, pre-commit 이 이미 전 벤더를
# 커밋 시점에 커버하기 때문이다.
#
# 주의: tenant 격리는 여기서 검사하지 않는다. Postgres RLS + PrismaService 런타임
#   가드(withFacilityContext/$allOperations)가 구조적 SoT다 — README.md 참고.
#
# 사용법:
#   check-schema-migration.sh staged          # 스테이지된 변경(.githooks/pre-commit)
#   check-schema-migration.sh base <ref>       # <ref>...HEAD diff (CI)
#   check-schema-migration.sh auto             # CI면 base, 아니면 staged (기본값)
#
# 종료코드: 0=통과, 1=위반(스키마 변경 + 마이그레이션 누락) 또는 도구 오류.
set -eu

_bg_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=scripts/git-guard/lib.sh
. "$_bg_dir/../git-guard/lib.sh"

SCHEMA="backend/prisma/schema.prisma"
# 변경 경로 중 마이그레이션 SQL 을 가려내는 정규식(레포 루트 기준 경로).
MIG_RE='^backend/prisma/migrations/[^/]*/migration\.sql$'

mode="${1:-auto}"

# 선택된 모드에 따라 "변경된 파일 경로" 목록을 newline 으로 출력한다.
changed_paths() {
  case "$mode" in
    staged)
      git diff --cached --name-only --diff-filter=ACMR
      ;;
    base)
      _base="${2:-}"
      [ -n "$_base" ] || gg_die "backend-guard: base 모드에는 비교 ref가 필요합니다 (예: base origin/main)"
      git diff --name-only --diff-filter=ACMR "$_base...HEAD"
      ;;
    auto)
      if [ "${GITHUB_ACTIONS:-}" = "true" ] || [ -n "${CI:-}" ]; then
        _ref="${GITHUB_BASE_REF:-main}"
        _base="origin/$_ref"
        # base ref 가 로컬에 없으면 얕게 fetch 해서 확보한다(없어도 계속 시도).
        git rev-parse --verify --quiet "$_base" >/dev/null 2>&1 ||
          git fetch --no-tags --depth=1 origin "$_ref:refs/remotes/origin/$_ref" >/dev/null 2>&1 || true
        git diff --name-only --diff-filter=ACMR "$_base...HEAD"
      else
        git diff --cached --name-only --diff-filter=ACMR
      fi
      ;;
    *)
      gg_die "backend-guard: 알 수 없는 모드 '$mode' (staged | base <ref> | auto)"
      ;;
  esac
}

paths=$(changed_paths "$@")

# 1) 스키마가 변경되지 않았으면 통과.
echo "$paths" | grep -qx "$SCHEMA" || exit 0

# 2) 스키마가 변경됐으면 동반 migration.sql 변경이 반드시 있어야 한다.
if echo "$paths" | grep -qE "$MIG_RE"; then
  exit 0
fi

# 3) 스키마만 바뀌고 마이그레이션이 없음 → 거부.
gg_die "backend-guard: $SCHEMA 가 변경됐지만 동반 Prisma 마이그레이션(backend/prisma/migrations/*/migration.sql)이 없습니다.
  → 'pnpm --filter backend run prisma:migrate' 로 마이그레이션을 생성·스테이지하거나, schema.prisma 변경을 되돌리세요.
  (마이그레이션만 단독 변경하는 것은 허용됩니다: 데이터 보정/수기 RLS 마이그레이션 등.)"
