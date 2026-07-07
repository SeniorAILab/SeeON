---
title: 풀체인 E2E 검증 세션 최종 보고서 (2026-07-06)
slug: fullchain-e2e-session-report
type: research
status: active
date: 2026-07-06
author: gobeumsu (claude fullchain-e2e session)
related: [fullchain-e2e-triage]
---

# 풀체인 E2E 검증 세션 — 최종 보고서

> 2026-07-06 풀체인 E2E 검증 세션의 종결 보고서. 무엇이 증명됐고, 무엇이 리포에 남았고,
> 무엇이 소유자 결정을 기다리는지를 한 문서로 정리한다.
> 상세 근거(문제 목록·임시 배선·해결 가이드)는 [`fullchain-e2e-triage.md`](./fullchain-e2e-triage.md)가 SSOT이며,
> 이 보고서는 그 문서를 대체하지 않는다. research 문서로서 결정을 내리지 않는다.

## 1. 한 줄 결론

**5-hop 풀체인은 실제 프로덕션 코드 경로로 end-to-end 동작이 확인됐다**:
외부 RTSP 루프 영상 → ml-worker LSTM 낙상 탐지 → `POST /api/v1/relay/alerts` → backend events/alerts 영속화 → front 2F 병실 카드 DANGER 자동 전환.

수정은 스냅샷 경로 결함 2건(PR #517)만 했고, 나머지 발견 사항은 전부 문서로 트리아지했다.
지금 리포에서 가장 레버리지 큰 다음 수는 `cameras.rtsp_url` 마이그레이션 1건이다(§4 참고).

## 2. 이번 세션이 main에 남긴 것 (merge 완료)

| PR | 내용 | 성격 |
| --- | --- | --- |
| #517 | 스냅샷 DB 함수 마이그레이션 `20260706043000_event_snapshot_functions` (RETURNS TEXT 수정 포함) | 코드 수정 (유일) |
| #518 | 트리아지 문서 신설 — 발견 문제 §1 (P1×3 / P2×8 / P3 백로그), 세션 중 fallback·override §2 (F-1~F-8), 역제안 §3 (3-1~3-7), 종결 항목 §4 | 문서 |
| #519 | §2A 임시 배선 인벤토리 W-1~W-10 — 각 글루가 드러낸 모듈 경계·SRP 결함과 있어야 할 계약, 글루 0인 곳(relay·seed·front 시임)을 기준선으로 대조 | 문서 |
| #520 | §5 해결 가이드 — 사건 클래스를 구조적으로 소거하는 권고 순서/방법 (merge commit `b33a011`) | 문서 |

검증 증거(스냅샷 107,913바이트 응답, CI baseline-subset 판정 근거, provenance 확인)는 PR #517 코멘트에 있다.

## 3. 검증에서 확인된 사실 요약

- 체인의 각 hop이 mock 없이 프로덕션 코드로 통과했다. front 카드 전환은 6초 폴링 주기로 관찰됐다.
- "알림 요약 1건 vs 카드 정상" 불일치 관찰은 폴링 주기 내 구조적 시차로 판정 — 버그 아님 (트리아지 §3-4에 SSE 단일화 개선안).
- 스냅샷 경로의 최종 런타임 재증명 1건은 스택 종료로 미완 (트리아지 P2-1, 열린 항목).
- 세션 중 Docker 조작은 compose up/restart/logs/exec뿐이며 이미지 삭제 명령은 실행된 적 없다 (트리아지 §2 정직 고지).

## 4. 핵심 발견 3가지 (상세: 트리아지 §1·§2A·§5)

1. **`cameras.rtsp_url` drift가 최상위 레버리지 지점.** schema.prisma에는 있는데 어떤 마이그레이션도 만들지 않았다.
   이 한 건이 main 상시 빨강(5 suites/13 tests), baseline-subset 임시 merge 규칙(F-6), ml-config 런타임 주입 경로 차단의 공통 원인이다.
   마이그레이션 1건 추가가 세 가지를 동시에 푼다.
2. **worker "runtime 주입"은 미결이 아니라 결정-미이행.** phase1 ADR이 backend를 ML config SSOT로 이미 결정했고
   pull 경로 구현도 끝까지 존재한다. E2E에서 YAML 손배선이 필요했던 건 구멍 3개 때문:
   ① rtsp_url 마이그레이션 부재, ② seed가 rtspUrl 미주입, ③ worker 카메라 명단의 SSOT가 여전히 YAML.
   §5-2에 ①→②→③ 복원 순서를 적었다 — ③까지 가면 worker는 RELAY_URL/TOKEN env 두 줄로 부팅된다.
3. **migration을 "작성 시점에 딱 한 번"만 생각하게 만들 수 있다.** 현재는 co-change 게이트뿐이라 과거 drift가 영원히 안 잡히고
   적용이 수동이라 환경별 상태를 사람이 기억해야 한다. §5-1의 세 겹(co-change 유지 + CI 전체 drift 감사
   `prisma migrate diff --exit-code` + migrate-on-boot)이 이 부담 클래스를 소거한다.

## 5. 권고 실행 순서 (§5-0 요약, 채택은 소유자 결정)

| 순서 | 작업 | 소거되는 것 |
| --- | --- | --- |
| 1 | `cameras.rtsp_url` 마이그레이션 | main 상시 빨강 + F-6 규칙 + ml-config 경로 차단 |
| 2 | CI 전체 drift 감사 | drift 조용한 누적 클래스 |
| 3 | migrate-on-boot | psql 수동 적용, 환경별 확인 노동 |
| 4 | seed rtspUrl + worker roster 권한 이전 | worker YAML 손배선 (W-4) |
| 5 | in-repo compose.e2e.yaml + smoke | E2E 스택 손조립 (W-1~W-3) |
| 6 | 스냅샷 원자성 + delivery 관측성 + 아티팩트 계약 | 부분 커밋·침묵 실패·인도물 오염 |

## 6. 소유자 결정/조치 대기 목록

| # | 항목 | 근거 |
| --- | --- | --- |
| 1 | 기존 dev DB들에 `prisma migrate deploy` 적용 여부 (미적용 시 #517 함수가 dev DB에 없음) | 트리아지 P1-2 |
| 2 | 로컬 미커밋 마이그레이션 `20260705153400` 처리 (커밋 or 폐기) | 트리아지 P2-7 |
| 3 | 로컬 main 체크아웃이 stale — `git pull` 필요 | 세션 정리 상태 |
| 4 | 잔여 worktree 3개(lane-1 / lane-2 / lane-front) 정리 여부 | 세션 정리 상태 |
| 5 | E2E DB에 남은 스냅샷 부분 커밋 불일치 행 backfill 여부 | 트리아지 P1-3, §5-4 |

## 7. 세션 정리 상태

- 이번 세션의 작업 브랜치(fix/…snapshot, docs/e2e-triage, docs/e2e-triage-wiring, docs/e2e-triage-guide)는
  merge ancestry 확인 후 원격·로컬 모두 삭제 완료.
- E2E 하네스(compose 스택, e2e.env, 포트 리맵)는 전부 리포 밖에서만 존재했고 리포에 커밋된 것 없음 (트리아지 F-1, W-2).
- 사용자 상시 컨테이너(eldercare-fall-db-main:55433, ml-serving:8000)는 세션 전체에서 미접촉.
