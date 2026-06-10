```yaml
slug: convention-enforcement-hooks
issue: "#71"
date: 2026-06-10
author: claude-fable-5
status: done
```

# 비가역 asset 유출 deny 훅 — git + Claude + Codex

## Problem

요양원 영상·모델 가중치가 실수로 커밋되면 PR 시점 발견은 너무 늦다(원격
히스토리·캐시·포크 잔존). 현재 방어는 gitignore뿐이라 `git add -f`·비표준
경로 유입을 막지 못한다. spec(같은 폴더) 인터뷰 결정: 비가역 피해만 가장
이른 로컬 지점에서 deny, 가역 규약은 훅 비대상(주기 감사), CI·warn 불채택.

## Design

### 1. scripts/git-guard/deny-assets.sh (단일 소스, ADR-008 패턴)

- 모드 인자: `staged`(pre-commit — `git diff --cached` 대상 검사) |
  `push`(pre-push — stdin의 ref range에서 새로 추가되는 blob 검사) |
  인자 없음 = `staged`.
- Deny 대상:
  - 가중치 확장자: `*.pt *.pth *.pkl *.onnx *.h5 *.safetensors *.tflite *.ckpt`
  - 영상/미디어: `*.mp4 *.avi *.mov *.mkv *.webm`
  - 대용량 blob: 5MB 초과 (lib.sh에 상수, 단위 명시)
- 위반 시 exit 1 + 위반 파일 목록·사유·해제 방법 출력.
- Escape hatch: `GIT_GUARD_ALLOW_ASSETS=1` (기존 `GIT_GUARD_PROTECTED=`와
  동일 관례) — 의도적 예외 시에만.
- POSIX sh, lib.sh 재사용, 통과 시 무출력·즉시 종료(에이전트 훅에서 매 호출
  되므로 빠른 no-op 필수).

### 2. 훅 배선 (zero inline logic 유지)

- `.githooks/pre-commit`: `deny-assets.sh staged` 호출 추가.
- `.githooks/pre-push`: `deny-assets.sh push` 호출 추가 — pre-push의 stdin
  (local/remote ref lines)을 deny 스크립트로 전달. 기존 check-freshness가
  stdin을 소비하지 않음을 확인하고 순서 배치.
- `.claude/settings.json` PreToolUse: `Bash` matcher 항목 추가 →
  `deny-assets.sh staged` (스테이징 없으면 즉시 0 — early guidance).
- `.codex/config.toml [hooks] pre_tool_use`: 기존 assert-not-main 호출에
  deny-assets 체이닝 (`sh -c '... && ...'` 한 줄, 기존 주석 형식 유지).

### 3. ml/models 규약 pytest (#56 의존)

- `ml/tests/test_models_layout.py`: `ml/models/` 존재 시에만 검사
  (없으면 skip) — 1계층 `{pose, fall}` 외 디렉토리 금지, 각 모델 폴더에
  metadata.json 존재 + 필수 필드(source/reacquire) 검증.
- **#56 머지 후 이 브랜치를 리베이스하여 구현.** PR 시점까지 #56이 머지되지
  않으면 이 단계는 follow-up 이슈로 분리하고 본 PR은 deny 훅만으로 닫는다.

### 4. ADR (오케스트레이터 담당 — executor 비대상)

- ADR-016 "강제 타이밍 원칙"(ADR-008 보완)은 구현 완료 후
  `/documentation-and-adrs` 스킬로 별도 작성. 이 plan의 범위 밖.

## Tests

- 셸 시나리오 검증 (임시 브랜치/임시 파일로 executor가 실제 실행):
  1. dummy `x.pt` `git add -f` 후 commit → **차단** 확인
  2. `GIT_GUARD_ALLOW_ASSETS=1` → 통과 확인
  3. 6MB 더미 바이너리 → 차단, 일반 텍스트 파일 → 통과
  4. push 모드: 차단 파일 포함 커밋 push 시도 → 차단 (로컬 bare remote로 검증)
  5. 검증 후 임시 산출물 완전 정리 (커밋 히스토리에 더미 잔존 금지 —
     검증용 커밋은 reset으로 폐기)
- `sh -n` 문법 체크 + shellcheck 가능하면 실행.
- pytest 단계 구현 시: `cd ml && uv run ruff check . && uv run --group test pytest -q` 그린.

## Steps

1. spec.md + plan.md 커밋 (finalize).
2. deny-assets.sh + lib.sh 상수 + .githooks 두 훅 배선 — 커밋.
3. .claude/settings.json + .codex/config.toml 에이전트 훅 — 커밋.
4. 셸 시나리오 검증 실행, 결과 보고.
5. (#56 머지 시) 리베이스 + ml/models pytest — 커밋. 아니면 follow-up 분리.
6. 게이트 그린 보고 (PR은 오케스트레이터 생성).

## Non-goals

- 컨벤션 CI workflow, warn 계층 신설, plan-first/미러 동기화/브랜치명 훅
- GitHub branch protection 변경, 기존 freshness·assert-not-main 동작 변경
- 히스토리에 이미 존재하는 자산 소급 검사(BFG 등)
