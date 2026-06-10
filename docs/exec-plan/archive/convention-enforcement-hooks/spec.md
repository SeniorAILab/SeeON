```yaml
slug: convention-enforcement-hooks
date: 2026-06-10
author: deep-interview (claude-fable-5)
interview: 4 rounds + topology, final ambiguity 17% (threshold 20%)
status: spec-final
```

# Convention 강제 — 무엇을 hook으로 걸고, 무엇을 걸지 않는가

## 핵심 결정 (인터뷰 확정)

### 1. 강제 타이밍 원칙 — "늦은 것과 안 늦은 것" (R1+R2)

- **비가역 피해**(요양원 영상·모델 가중치 등 민감/대용량 asset이 git 히스토리에
  박히는 것)는 **가장 이른 로컬 지점에서 block** — pre-commit과 pre-push 양쪽
  deny. PR 시점 발견은 이미 원격 히스토리·캐시·포크에 남은 뒤라 너무 늦다.
- **가역적 규약 위반**(exec-plan 라이프사이클, plan 불변성, 미러 동기화,
  브랜치명, plan-first 등)은 **hook으로 block하지 않는다**. 고치면 되는 것을
  막으면 `--no-verify` 습관만 키운다.

### 2. CI 불채택 (R3)

- 컨벤션 검사용 CI는 만들지 않는다. "script 단에서 가역/비가역을 확인하면
  되고" — block 권위는 로컬 deny 스크립트, 나머지는 감사로.
- warn 계층도 신설하지 않는다 ("warning을 없애는거지") — 가역 위반에 대한
  warn 훅을 깔지 않는다. 기존 ADR-008의 freshness warn(리베이스 신선도)은
  컨벤션 warn이 아니므로 유지.

### 3. 게이트별 처분 (Round 0 토폴로지 5개 → 최종)

| # | 후보 | 처분 |
|---|------|------|
| ① | git 훅 게이트 | **채택 — deny 전용**: asset/모델 가중치 커밋 deny (pre-commit + pre-push). 기존 assert-not-main 유지 |
| ② | 에이전트 런타임 훅 | **채택 — Claude Code + Codex 양쪽** (사용자 명시: "hook을 claude code도", "codex도 훅 달아야해"). 동일 deny 스크립트를 조기 호출 — ADR-008의 "agent hooks are early guidance, not the gate" 패턴 그대로. Codex는 `.codex/config.toml [hooks]` (shell-scope 한계는 ADR-008 기록 준용) |
| ③ | pytest 런타임 검증 (ml/models 레이아웃+metadata) | **채택** — hook이 아니라 테스트 스위트의 일부. gitignore된 경로라 git 훅이 못 보는 영역의 보완 (#56 ADR-015 규약 검증) |
| ④ | CI 연계 (#37) | **불채택** — 컨벤션 검사 CI 없음. #37(테스트/린트 CI)과 무관하게 진행 |
| ⑤ | 주기적 에이전트 감사 | **채택** — 가역적·의미론적 규약(MECE, 문서 신선도, exec-plan 라이프사이클)의 유일한 검증 수단. 훅 아님, 온디맨드/마일스톤 전 실행 |

### 4. ADR 증류 (R4 + 사용자 지시)

- **신규 ADR-016 "강제 타이밍 원칙"** — ADR-008 **보완** (supersede 아님):
  비가역=조기 deny / 가역=주기 감사 / CI 불채택 / warn 불신설 + 오늘 결정 전부.
- ADR-008(워크트리 강제·단일 스크립트 소스)은 유지 — 서로 다른 결정.
  양쪽 status header에 상호참조 추가 (본문 불변).
- ADR-012 line 69 "hook/script validation is deliberately deferred" 각주 —
  이번 결정으로 유보 해소됨을 ADR-016에서 참조.
- 작성은 사용자 명시대로 **`/documentation-and-adrs` 스킬로 마지막 단계에서**.

## 구현 스코프 (plan 단계 입력)

1. `scripts/git-guard/`에 deny 스크립트 신규 (단일 소스, ADR-008 패턴:
   "zero inline logic in hooks"). 검사 대상 패턴(가중치 확장자 *.pt/*.pkl/
   *.onnx 등, 영상 *.mp4/*.avi 등, 대용량 임계)의 정확한 목록은 plan에서 확정.
   gitignore 우회(`git add -f`)와 비표준 경로 유입이 주 방어 대상.
2. `.githooks/pre-commit` + `pre-push`에서 호출 추가.
3. `.claude/settings.json` 훅 + `.codex/config.toml [hooks]`에 동일 스크립트
   연결 (Codex 훅 메커니즘 세부는 plan 단계 조사).
4. ml/models 레이아웃+metadata.json pytest (exec-56 산출 규약 기준 —
   **#56 머지 후 착수**, wt.sh/.gitignore 충돌 회피).
5. ADR-016 + (필요시) docs/rules 운영 한 줄 — `/documentation-and-adrs`로.

## Non-goals

- 컨벤션 CI workflow, warn 계층, plan-first 훅, 미러 동기화 훅, 브랜치명 훅
- 서버측(remote) 강제 — GitHub branch protection 변경
- 기존 freshness warn/block 동작 변경

## 인터뷰 기록

- R0: 토폴로지 5개 확정 ("5개 맞음")
- R1: plan 불변성 — local warn, "거는 타이밍은 commit이 아니라 PR 단위" →
  R3에서 PR/CI 자체가 불채택되며 가역 위반은 훅 비대상으로 수렴
- R2: "되돌릴 수 없으면 commit-block" — 유출 가드는 pre-commit+pre-push
- R3: "추가적인 CI는 필요 없을 듯 … asset과 모델 관련 가중치 업로드만
  deny하고, warning을 없애는거지"
- R4: ADR 형태 — 신규 보완 ADR(타이밍 원칙), ADR-008 유지
- 중간 지시: Claude Code 훅 필수, Codex 훅 필수, 마지막에
  /documentation-and-adrs 실행
