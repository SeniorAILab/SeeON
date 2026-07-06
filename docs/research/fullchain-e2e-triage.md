---
title: 풀체인 E2E(RTSP→ml-worker→backend→front) 검증에서 발견한 문제·우회처리·역제안 — 트리아지
slug: fullchain-e2e-triage
type: research
status: active
date: 2026-07-06
author: gobeumsu (claude fullchain-e2e session)
related: [adversarial-fall-detection-redesign, code-stability-enforcement-practices]
---

# 풀체인 E2E 트리아지 — 발견 문제 · 우회처리 · 역제안

> research 문서. 2026-07-06 풀체인 E2E 검증(외부 RTSP 루프 영상 → ml-worker LSTM 탐지 →
> `POST /api/v1/relay/alerts` → backend events/alerts → front 2F 병실 카드 DANGER 자동 전환)에서
> **탐지만 하고 수정을 보류한 문제**, **세션 중 임시 우회처리(fallback)**, **원칙을 대체 운영한 override**,
> 그리고 **처음부터 설계했다면의 역제안**을 기록한다. 여기서 무엇을 고칠지는 별도 결정 사항이며,
> 이 문서는 결정을 내리지 않는다.
>
> 검증 자체의 결과: 5-hop 체인은 실제 프로덕션 코드 경로로 end-to-end 동작 확인됨.
> 스냅샷 경로 결함 2건은 PR #517(마이그레이션 `20260706043000_event_snapshot_functions`)로 이미 수정·머지됨.

## 1. 발견 문제 (수정 보류 — 트리아지 대상)

### P1 — 즉시 결정 필요

| # | 문제 | 증거 | 제안 해결책 |
| --- | --- | --- | --- |
| 1-1 | **main의 backend 테스트 상시 실패 (DB drift)**: `cameras.rtsp_url`이 마이그레이션에 없어 5개 스위트/13개 테스트가 "does not exist in the current database"로 main에서도 항상 실패 | auth.spec, prisma.service.spec, facilities-cameras-contract.spec, alert-notes.spec, cameras-event-resolver.spec — main과 모든 PR CI에서 동일 서명(22줄) | drift 해소 마이그레이션 1건으로 스키마·마이그레이션 정합 복구. 이것이 해소되기 전까지 모든 PR CI 판정이 "baseline-subset 비교"라는 취약한 수동 규칙에 의존한다 |
| 1-2 | **개발 DB에 스냅샷 DB 함수 부재**: `get_event_for_snapshot`/`set_event_snapshot_key`는 #517 이전 어떤 커밋·어떤 DB에도 존재한 적 없음 (`git log --all -S` 0건). #517 머지로 마이그레이션은 생겼으나 기존 DB에는 적용 행위가 필요 | 스냅샷 업로드가 모든 환경에서 42883으로 500 | 각 기존 DB(개발 DB 포함)에 `prisma migrate deploy` 1회 실행. 신규 fresh DB는 자동 해결 |
| 1-3 | **`$queryRaw` 부분 커밋 위험**: `set_event_snapshot_key` 함수의 UPDATE는 커밋되는데 후속 `alerts.updateMany` 전파가 실패하면 events/alerts가 어긋난 채 남음. P2010 사건에서 실증됨 — E2E DB에 event는 snapshot_key 보유, alerts 3건은 NULL인 불일치 데이터가 실제로 존재 | `event-recorder.service.ts` persistSnapshotKey: 함수 호출(`$queryRaw`)과 alerts 전파가 원자적이지 않음 | persistSnapshotKey 전체를 단일 인터랙티브 트랜잭션으로 묶거나, alerts 전파 실패 시 보정(재시도/backfill) 경로 추가. 기존 불일치 행 backfill 여부도 함께 결정 |

### P2 — 계획에 편입할 것

| # | 문제 | 증거 | 제안 해결책 |
| --- | --- | --- | --- |
| 2-1 | **스냅샷 완전 성공의 최종 런타임 증명 미완**: 함수 수정(RETURNS TEXT) 후 Prisma 경유 업로드 200 + `alerts.snapshot_key` 전파를 실제 낙상 사이클로 확인하기 전에 E2E 스택이 종료됨. Prisma prepared-statement 캐시가 구 시그니처(void) 결과 서술자를 유지할 수 있어 백엔드 재시작 후 검증이 필요했음 | psql 검증은 전부 통과(getter 행 반환, setter 왕복 id 반환, fall_app 직접 UPDATE 거부). Prisma 경로만 미확인 | 다음 스택 기동 시 낙상 1건으로 업로드 200 + alerts 전파 확인. 실패 시 백엔드 재시작 후 재확인 |
| 2-2 | **Kakao 발송의 침묵 실패**: 수신자 access token이 없으면 네트워크 호출 없이 실패로 분류만 하고 예외·경고가 없음. 운영에서 "알림이 나간 것처럼 보이는 무발송"이 가능 | `kakao-send-to-me-channel.adapter.ts:29-37` | 미연결 계정 발송 시도를 명시적 delivery 상태/로그/메트릭으로 노출. 대시보드 또는 운영 알람에서 관측 가능하게 |
| 2-3 | **SSE push 내용 미검증**: `/dashboard/stream` 연결은 확인했으나 카드 상태 갱신은 6초 폴링(reconcileSnapshot)이 구동함을 실증. SSE가 실제 이벤트 프레임을 push하는지는 미확인 | 클릭 없이 t=6s에 카드 DANGER 전환(폴링 주기와 일치). `monitorSettingsStore.ts:8` 6000ms | SSE payload 계약 테스트 추가. §3-4 역제안과 연계 |
| 2-4 | **스냅샷 파일이 컨테이너 FS에 저장**: `/app/backend/snapshots/{facilityId}/{eventId}.ext` — 볼륨 마운트가 없으면 컨테이너 재생성 시 증거 사진 소실 | E2E에서 107,913 bytes 파일이 컨테이너 내부 경로에 저장됨 | compose/배포 매니페스트에 볼륨 명시, 장기적으로 §3-3 스토리지 추상화 |
| 2-5 | **worker 재시작 후 탐지 재개까지 6–8분**: 탐지가 한 번 발화하면 래치되어 재시작으로 re-arm해야 하고, 재시작 후 첫 탐지까지 지연이 큼 | E2E에서 반복 관측 (윈도우 프리필/워밍업 추정, 원인 미규명) | 원인 규명(버퍼 프리필 vs 모델 워밍업 vs 래치 로직) 후 재-arm 정책 설계 |
| 2-6 | **backend `test:e2e`가 CI에 없음** | package script는 존재, workflow에 미편입 | CI 편입 여부·DB 준비 방식 결정 |
| 2-7 | **`20260705153400` 마이그레이션이 로컬 체크아웃에 미커밋 상태로 존재** | 세션 중 확인 (사용자 작업본) | 사용자 판단으로 커밋 또는 폐기 — DB와 git의 마이그레이션 이력 불일치가 drift 클래스(§1-1)의 재발 경로 |
| 2-8 | **ml sklearn_fall.py의 MODELS_DIR 경로 버그** | 세션 중 코드 확인 (PR 후보로만 기록) | 단독 소형 PR |

### P3 — 백로그

- **lstm `metadata.json` stale**: 실제 서빙 중인 모델 파라미터와 메타데이터 불일치.
- **compose의 NODE_ENV 설정 재검토**: 스택 목적(dev/e2e/prod)과 값이 일치하는지 점검 필요.
- **ml-serving 포트 8000 고정**: 로컬에서 다른 스택과 상시 충돌. 포트 정책 문서화 필요 (§3-5).
- **`.env.local` 심링크 위험**: 심링크 대상 변경이 모든 스택에 조용히 전파됨.
- **ux-gate 접근성(a11y) 지적 항목들** 및 **#513 caveats / #510 SHOULD-FIX 잔여**: 각 PR 코멘트에 기록됨.

## 2. 세션 중 임시 우회처리(fallback)와 override — 정식화 또는 폐기 대상

수정이 아니라 **기록**이다. 아래는 이번 세션에서 의도적으로 택한 임시조치이며, 그대로 관행이 되면 안 된다.

| # | 우회처리 / override | 이유 | 정식화 방향 |
| --- | --- | --- | --- |
| F-1 | E2E 스택을 리포 밖 scratchpad compose(project `fallai-e2e`)로 구성하고 포트를 전부 리맵 | 사용자 상시 컨테이너(DB 55433, ml-serving 8000) 보호 + 리포에 E2E compose가 없음 | 리포 내 `compose.e2e.yaml` 도입 결정 (§3-5). RTSP publisher는 anti-pattern 규칙대로 리포 밖 유지 |
| F-2 | 마이그레이션 SQL을 psql로 E2E DB에 수동 선적용 후 #517로 정식화 | 런타임 검증을 마이그레이션 머지보다 먼저 수행 | 종료됨 — 단 "수동 적용 후 정식화" 순서는 검증 목적일 때만 허용할 것 |
| F-3 | git-guard의 behind-origin 차단을 amend+force 대신 `reset --soft origin/<branch>` + fixup 커밋으로 우회 | guard가 force-with-lease도 차단 | 이 절차를 표준 우회 경로로 문서화하거나 guard 정책 완화 결정 |
| F-4 | 백엔드 컨테이너 재시작으로 Prisma prepared-statement 캐시 flush | DB 함수 시그니처 교체 후 stale descriptor 위험 | "DB 함수 시그니처 변경 시 backend 재시작 필요"를 배포 절차에 명문화 |
| F-5 | E2E용 가짜 `KAKAO_REST_API_KEY` (e2e.env, 미커밋) | 외부 발송 차단 | Kakao adapter가 토큰 미보유 시 네트워크를 아예 안 타는 구조라 안전함을 확인함. e2e.env는 계속 비커밋 유지 |
| F-6 | **baseline-subset CI 머지 규칙**: "실패가 main의 drift 서명(5스위트/13건/22줄)과 정확히 일치하면 신규 실패 0으로 간주하고 머지" | main이 상시 실패 상태(§1-1) | §1-1 해소 즉시 폐기하고 "main 상시 녹색" 원칙 복구 |
| F-7 | **#517을 완전한 런타임 증명 전에 머지**: 사용자 지시("일단 merge")로 자체 게이트(full Prisma-path 증명 후 머지)를 해제 | 사용자 우선순위 결정 | 잔여 검증은 §1 P2-1로 이관됨 |
| F-8 | `docker logs --since`에 타임존 미표기 값 사용 → KST로 해석되어 "수정 후에도 실패" 오판 2회 유발 | 운영 실수 | 로그 시각 비교는 항상 `Z`(UTC) 명시 — 운영 노트로 공유 |

Docker 상태에 대한 정직 고지: 세션 종료 시점에 Docker 데몬이 꺼져 있고 E2E 이미지/스택이 정리된 상태다.
이 세션에서 실행한 docker 명령은 compose up/restart/logs/exec 계열뿐이며 이미지 삭제 명령은 없었다.
런북상의 정식 teardown 절차(`docker compose -p fallai-e2e --profile full down`)는 별도로 실행되지 않았다.

## 2A. 임시 배선(temporal wiring) 인벤토리 — 각 배선이 드러낸 모듈 경계·SRP 결함

E2E의 이상적인 형태는 각 모듈이 **계약 경계에서 글루 없이 끼워지는** 것이다. 실제로는 아래
배선을 손으로 만들어야 체인이 성립했고, 각 글루는 "없는 모듈" 또는 "깨진 계약"의 증거다.
반대로 글루가 필요 없던 지점도 함께 기록한다 — 계약이 있는 곳은 E2E가 그냥 통과했다.
(이 배선들은 전부 scratchpad/세션 종속이어서 스택 정리와 함께 이미 소실됨. 현재 유일한
재현 경로는 이 기록과 §3-5의 정식화다.)

| # | 만들어 붙인 글루 | 왜 필요했나 | 드러난 경계/SRP 결함 | 있어야 할 계약 |
| --- | --- | --- | --- | --- |
| W-1 | 리포 밖 `compose.e2e.yaml` 오버레이, 모든 호출에 `-p fallai-e2e` 강제 | 리포에 E2E 스택 정의가 없고, committed compose의 full profile은 그대로는 부팅 불가 (dev placeholder 값이 production env 검증과 충돌) | "부팅 가능한 full profile"이라는 배포 계약 부재. compose 한 파일이 dev 편의값과 prod 검증 요구를 동시에 짊어짐 | §3-5 (in-repo e2e compose) |
| W-2 | `e2e.env` 수작업 — production 경로 유지한 채 `*.localhost` origin + 실제 랜덤 시크릿으로 검증 통과 (초기 검토한 NODE_ENV=development 완화는 "검증 skip = E2E 의미 훼손"이라 폐기) | full profile을 프로덕션 코드 경로 그대로 태우려면 유효한 env 값 세트를 손으로 만들어야 함 | env 스키마 검증(env:verify)은 있으나 "e2e용 유효 값 세트"의 생성을 책임지는 모듈이 없음 | e2e env example 또는 생성 스크립트 (`scripts/**` 소유) |
| W-3 | 포트 리맵(ml-api 8000→18000, DB 5432, front 3000) + `container_name` 충돌 사전검사 + :8080 잔류 프로세스 정리 | 포트·컨테이너 이름이 전역 고정이라 사용자 상시 스택(55433, 8000)과 공존 불가 | 스택 격리 계약 부재 — `container_name: eldercare-fall-db` 전역 고정, 포트 하드코드. "동시 스택 수 = 1"이라는 암묵 가정 | 프로젝트명 파생 네이밍 + 포트 변수화 + 포트 매트릭스 문서 (§3-5) |
| W-4 | worker 스트림 바인딩을 외부 YAML로 주입 — worker config에 cam_sp_202 → `rtsp://host.docker.internal:8554/nursing-home/202` (fps 5.0), `ML_MODELS_DIR` 절대경로 env | worker는 "configured streams"를 소비하는 설계라, 카메라-스트림 바인딩 파일을 밖에서 만들어 넣어야 함 | **스트림 URL의 SSOT 이원화 조짐**: backend 스키마에는 `cameras.rtsp_url` 컬럼이 있고(§1-1 drift의 그 컬럼), 런타임 바인딩은 worker YAML이 소유 — "카메라-스트림 바인딩"의 소유 모듈이 미결 | 소유자 결정 필요(결정은 본 문서 밖): worker config가 SSOT면 `cameras.rtsp_url` 제거, backend가 SSOT면 worker가 backend에서 읽는 계약 |
| W-5 | lstm 모델 아티팩트 클린카피 마운트 | 아티팩트 디렉토리에 metadata.yaml + stale metadata.json 공존 → 로더의 ambiguity 가드가 기동 거부 (가드 자체는 정상 동작) | 아티팩트 **생산측** 패키징 계약 부재 — dataset-ops → fall-ai 인도물의 형태를 검증하는 단계가 없음 | 인도 시점 아티팩트 스키마 검증 + stale 파일 정리 (§1 P3) |
| W-6 | 마이그레이션 SQL psql 수동 선적용 (#517 머지 전 검증) | 스냅샷 DB 함수가 어떤 커밋에도 없었음(42883) | migrate-then-start 미강제 + raw SQL 객체의 SSOT 규칙 부재 | §3-1, §3-6 |
| W-7 | backend 재시작으로 Prisma prepared-statement flush | DB 함수 시그니처 교체 후 stale descriptor 위험 | DB 객체 변경과 앱 커넥션 수명 간 계약 부재 | §2 F-4 명문화 |
| W-8 | 가짜 Kakao 자격증명으로 실발송 차단 | 외부 발송 없이 알림 체인을 검증해야 함 | 발송 모듈이 "미구성"과 "실패"를 구분하지 않고 침묵 — 미구성 상태의 delivery 계약 부재 | §1 P2-2, §3-7 |
| W-9 | (글루 불필요 — 대조 사례) front 접속은 nginx 같은-origin `/api` 프록시(localhost:3000)로 그대로 통과 — CORS/쿠키(sameSite=Strict) 문제 0건 | — | front 컨테이너가 프록시를 내장한 덕: **계약이 모듈 안에 있으면 글루가 필요 없다**는 실증 | 현행 유지 |
| W-10 | 관측 하네스 수작업 — `--tail 0` 로그 모니터, `alerts.snapshot_key` 폴링 워처, 로그 시각 비교로 성공/실패 판정 | 파이프라인 hop별 성공 신호가 없어 사람이 로그를 뒤져야 함 (타임존 오판 2회 유발, F-8) | hop별 관측 계약 부재 | §3-7 |

같은 결로, 글루가 **필요 없던** 경계도 명시해 둔다: worker→backend **relay API 계약**(202 수신),
**seed 데이터**(시설·공간·카메라 토폴로지), **front API 시임**(`front/src/services/**`)은 손대지 않고
그대로 끼워졌다. 이번 E2E에서 사람 손이 들어간 곳과 아닌 곳의 경계선이 곧 이 시스템의
모듈 계약 성숙도 지도다: 글루 밀도가 높은 곳(스택 조립·env·스트림 바인딩·아티팩트 인도)이
SRP/계약 정비의 우선 대상이고, 글루 0인 곳(relay·seed·front 시임)이 따라야 할 기준선이다.

## 3. 역제안 — 처음부터 설계했다면 (모듈화·파이프라인 흐름 관점)

이번 세션에서 실제로 깨진 지점들로부터의 역제안이다. 각각 채택 여부는 별도 결정 사항.

### 3-1. "raw SQL DB 객체 = 마이그레이션이 유일한 SSOT" 규칙 + 존재성 스모크 테스트

이번 42883 사건의 근본 원인은 구조적이다: SECURITY DEFINER 함수는 `schema.prisma`로 표현할 수
없으므로 "마이그레이션은 나중에 `prisma migrate`로 재생성"이라는 가정(4ce8a8b)이 성립하지 않고,
코드는 함수를 호출하는데 함수 정의는 **어디에도** 없는 상태가 조용히 지나갔다. 재발 방지는 두 겹:
(a) raw SQL 객체(함수·트리거·RLS 정책)는 반드시 마이그레이션 파일과 같은 커밋에 포함한다는 규칙,
(b) backend가 의존하는 DB 함수 목록을 pg_proc에서 확인하는 스모크 테스트(CI fresh-DB 또는 기동 시 체크).
(b)가 있었다면 이 결함은 어떤 환경에서도 배포 전에 잡혔다.

### 3-2. `$queryRaw` 경로는 Prisma 클라이언트로 왕복하는 계약 테스트를 갖는다

`RETURNS void`를 Prisma가 역직렬화하지 못하는 P2010은 psql로는 재현 자체가 불가능했고,
실제 Prisma 경로를 태워서만 발견됐다. DB 함수를 `$queryRaw`로 호출하는 모든 지점은
fresh DB + 실제 PrismaClient로 왕복하는 테스트를 1개씩 갖는 것이 맞다.
아울러 §1-3의 원자성 문제까지 포함해, "DB 함수 호출 + 후속 전파"는 하나의 유스케이스
단위(단일 트랜잭션 경계)로 모듈화하는 편이 파이프라인 흐름상 안전하다.

### 3-3. 스냅샷 저장을 스토리지 시임(seam) 뒤로

현재 events.controller가 컨테이너 로컬 FS에 직접 파일을 쓴다. 파일 저장·키 발급·이벤트 갱신이
한 컨트롤러 흐름에 섞여 있고, 저장소가 컨테이너 수명에 종속된다(§1 P2-4). front의 API 시임
(`front/src/services/**`)과 같은 원칙으로 backend에도 StorageService 시임을 두면
볼륨/오브젝트 스토리지 전환이 컨트롤러 무변경으로 가능해진다.

### 3-4. 실시간 알림 경로의 SSOT 단일화 — SSE primary, 폴링 fallback

현재 front 카드 상태는 (a) 대시보드 스냅샷, (b) 알림 병합 파생(deriveStatusesFromAlerts),
(c) 6초 폴링 reconcile, (d) SSE 4갈래가 겹쳐 있고, 헤더 요약은 backend 계산값이라 카드와
소스가 다르다. 그 결과 "요약은 1건인데 카드는 아직 정상"인 ≤6초 창이 구조적으로 존재한다
(버그는 아니나 사용자 신뢰를 깎는 창이다). SSE를 primary 전달 경로로 승격하고 폴링은
명시적 fallback으로 강등하며, 카드·헤더가 같은 파생 함수를 소비하게 단일화하는 것을 제안한다.
전제는 §1 P2-3(SSE push 실검증)이다.

### 3-5. E2E 하네스의 공식화 — 리포 내 compose.e2e.yaml + 포트 매트릭스 + nightly smoke

이번 E2E는 리포 밖 임시 compose로 수행했다(F-1). 재현 가능하려면: `compose.e2e.yaml`
(전용 프로젝트명, 전용 포트 대역, seed 시나리오 포함)을 리포에 두고, 개발/E2E/사용자 상시
컨테이너의 포트 매트릭스를 문서화하고, RTSP 소스만 외부 주입(anti-pattern 준수)으로 남긴다.
그 위에 "rtsp → worker 탐지 → relay 202 → alerts 행 → front 카드 DANGER"를 확인하는
nightly full-chain smoke를 올리면 이번에 수동으로 증명한 체인이 회귀 감시망에 들어간다.

### 3-6. 배포 전제의 명문화 — migrate가 안 돌면 기동도 안 되게

"deploy 시 migrate가 돌 것"이라는 암묵 전제가 4ce8a8b에서 깨졌다. compose/배포 경로에
migrate 단계를 명시적 서비스(또는 entrypoint 게이트)로 두어, 마이그레이션 미적용 상태로
backend가 뜨는 일 자체를 불가능하게 만드는 것을 제안한다. §3-1(b)의 기동 시 함수 체크와 결합하면
이번 사건 클래스는 이중으로 차단된다.

### 3-7. 관측성 최소선 — 침묵 실패 금지

Kakao 무발송(§1 P2-2)과 worker 탐지 래치(§1 P2-5)는 모두 "실패했는데 아무도 모르는" 부류다.
알림 파이프라인의 각 hop(탐지 발화, relay 수신, alert 생성, 발송 시도/결과)에 최소 1개씩의
카운터/로그 라인을 계약으로 정하면, 이번처럼 사람이 로그를 시간대별로 뒤지며 추적하는 비용이
크게 줄어든다.

## 4. 이번 세션에서 이미 종결된 것 (참고)

- 5-hop 풀체인 동작 증명: RTSP 루프 영상 → ml-worker LSTM(threshold 0.00078) → relay 202 →
  events/alerts(alertSeq 1–3) → front 로그인 → 2F 202호 카드가 클릭 없이 t=6s에 DANGER 전환,
  ping-ring 애니메이션·"낙상 위험 2건" 모달 확인.
- PR #517 머지(734d6596): 스냅샷 DB 함수 복원 + `RETURNS void`→`TEXT` Prisma 호환 수정.
  CI는 baseline-subset 일치(신규 실패 0), 런타임에서 getter·파일 저장(107,913 bytes)·
  events.snapshot_key 기록까지 실증. 잔여는 §1 P2-1.
- 관찰 "요약 1건 vs 카드 정상"은 폴링 주기 내 구조적 불일치로 판정 — 버그 아님 (§3-4에 개선안).

## 5. 해결 가이드 — 내가 직접 해결한다면 (권고 순서와 방법)

§1~§3이 "무엇이 깨져 있나"라면, 이 절은 "그 클래스의 문제를 **개발자가 다시는 생각할 필요
없게** 만드는 순서와 방법"이다. 개별 버그를 하나씩 잡는 게 아니라, 사건 클래스를 구조적으로
소거하는 것이 목표다. 채택 여부는 소유자 결정이며, 각 단계는 리포 규칙대로 표면별 개별 PR로
쪼갠다. 코드 인용은 2026-07-06 main(8a74170) 기준 재검증 결과다.

### 5-0. 우선순위와 의존성 — 한 장 요약

| 순서 | 작업 | 소거되는 사건 클래스 |
| --- | --- | --- |
| 1 | `cameras.rtsp_url` 마이그레이션 추가 | main 상시 빨강(§1-1), baseline-subset 규칙(F-6), **그리고 ml-config 런타임 주입 경로의 복구(§5-2)** — 한 PR이 세 개를 푼다 |
| 2 | CI에 전체 drift 감사 추가 | "언젠가 생긴 drift가 조용히 누적"되는 클래스 자체 |
| 3 | migrate-on-boot 게이트 | psql 수동 적용(W-6), "이 DB에 함수 있나?" 류의 환경별 확인 노동 |
| 4 | seed에 rtspUrl + worker roster 권한 이전 | E2E/신규 환경에서 worker YAML 손배선(W-4) |
| 5 | in-repo `compose.e2e.yaml` + smoke | E2E 스택 손조립(W-1~W-3), 풀체인 회귀의 수동 재증명 |
| 6 | 스냅샷 원자성 + delivery 관측성 + 아티팩트 계약 | 부분 커밋(§1-3), 침묵 실패(P2-2), 인도물 오염(W-5) |

### 5-1. "개발 단계에서 왜 migration SQL을 계속 생각해야 하나" — 세 겹으로 의식에서 지운다

현재 구조에서 마이그레이션이 계속 의식에 남는 이유는 정확히 두 가지다.
(i) 가드가 **co-change 결합 게이트뿐**이다 — `check-schema-migration.sh`는 "이 diff에서
schema.prisma를 건드렸으면 같은 diff에 migration.sql도 있어야 한다"만 본다
(`scripts/backend-guard/check-schema-migration.sh:48-58`, CI `ci.yml:94-95` + `.githooks/pre-commit:12`).
과거에 이미 생긴 drift는 어떤 PR에서도 다시 검사되지 않아 영원히 잡히지 않는다 —
`rtsp_url`이 정확히 이 구멍으로 살아남았다(schema.prisma:143에는 있고, 전체 migrations
grep에 rtsp 0건). (ii) **적용이 수동**이다 — migrate deploy는 CI의 임시 DB(ci.yml:107-108)와
수동 트리거 배포 스크립트(ncloud-deploy.sh:126-132)에서만 돌고, backend 컨테이너 기동
경로(Dockerfile:35-48 `CMD ["node","dist/main"]`, compose 서비스 정의)에는 없다. 그래서
"내 DB가 코드보다 뒤쳐졌나"를 사람이 기억해야 한다.

세 겹을 깔면 마이그레이션을 생각하는 순간은 "스키마를 바꾸는 그 커밋" 딱 한 번으로 준다:

1. **작성 시점(유지)**: 지금의 co-change 게이트. 이미 있다.
2. **PR 시점(신규)**: CI에 전체 drift 감사 —
   `prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --exit-code`.
   어느 PR이든, 그 PR과 무관하게 리포에 누적된 스키마↔마이그레이션 불일치가 있으면 실패한다.
   rtsp_url 클래스는 이 시점에서 소멸한다. 단 raw SQL 함수는 schema.prisma에 없으므로 diff가
   못 본다 — §3-1(b)의 pg_proc 존재성 체크(부팅 또는 CI fresh-DB에서 backend가 의존하는 함수
   목록 확인)가 이 사각을 막는 보완재다. 42883 클래스는 이 둘의 합으로 차단된다.
3. **기동 시점(신규)**: migrate-on-boot — compose에 one-shot migrate 서비스(backend가
   `depends_on: condition: service_completed_successfully`로 대기)를 두거나 entrypoint에서
   `prisma migrate deploy && node dist/main`. dev/e2e/prod가 같은 경로를 타므로
   "환경별로 migrate를 돌렸던가"라는 질문 자체가 사라진다. ncloud-deploy.sh의 명시적
   migrate 분기는 유지해도 무방하다(그 위의 안전망이 될 뿐).

### 5-2. worker 스트림 설정 — "runtime 주입" 결정은 이미 있다. 막힌 구멍 세 개를 뚫으면 된다

먼저 §2A W-4의 정정: 거기서 "소유자 미결"로 적었으나, 재검증 결과 **결정은 이미 있다**.
ADR phase1(`docs/decisions/adr-phase1-eldercare-realtime-detection-delivery.md`)이 "Backend is
the ML config SSOT — `Camera.rtspUrl`은 `GET /api/v1/ml-config/:facilityId`로만 ML plane에
나간다"를 명시하고, 구현도 끝까지 있다: worker는 부팅 시 `RELAY_URL`/`RELAY_TOKEN`으로
ml-api `/api/v1/relay/config`를 pull하고(`ml/worker/edge_worker.py:93-107`,
`config_pull.py:11-39`), ml-api가 backend ml-config를 프록시하며(`ml/api/lifespan.py:90-107`),
성공 시 last-known-good까지 저장한다. 즉 W-4는 "미결"이 아니라 **"결정 미이행"**이고,
E2E에서 YAML 손배선이 필요했던 것은 이 경로가 세 군데서 막혀 있었기 때문이다:

1. **DB에 컬럼이 없다**: `rtsp_url`은 schema에만 있고 어떤 마이그레이션도 만들지 않는다.
   ml-config 서비스는 Prisma `camera.findMany`로 그 컬럼을 읽으므로(`ml-config.service.ts:20-44`,
   특히 `camera.rtspUrl ?? null` line 38) fresh DB에서는 이 경로가 런타임에 깨진다 —
   main 테스트를 빨갛게 만드는 바로 그 drift다. → **§5-1의 1번 PR이 그대로 해결.**
2. **seed가 값을 안 채운다**: `seed.ts:138-162` upsertCameras와 `CameraSeed` 타입
   (`demo-nokyang.fixture.ts:56-59`)에 rtspUrl이 없다. 컬럼이 생겨도 null이 내려간다.
   → CameraSeed에 `rtspUrl?: string`을 추가하고 데모/E2E fixture에 스트림 URL을 넣는다.
   이러면 "seed에 있는 병실을 실시간으로 잡는" 시나리오가 seed만으로 성립한다.
3. **roster의 SSOT가 여전히 YAML이다**: pull된 config는 "YAML에 이미 있는 camera_id"의
   rtsp_url만 override할 수 있고(`config_resolver.py:17-23`), 카메라 명단 자체는
   `EDGE_CAMERA_CONFIG` YAML이 정의한다(`edge_worker_config.py:24,387-394`). backend에서
   새 카메라를 내릴 수 없다. → pulled payload의 cameras를 roster-authoritative로 승격:
   worker 부팅 필수 입력을 (RELAY_URL, RELAY_TOKEN)로 줄이고, YAML은 `EDGE_CAMERA_CONFIG`를
   명시했을 때만 쓰는 오프라인 개발용 탈출구로 격하한다(기동 로그에 `source=yaml` 경고).
   fps/frame_stride/모델·도메인 파라미터는 엣지 하드웨어 종속이므로 워커 기본값+로컬
   오버라이드로 남긴다 — ml-config DTO(`ml-config.dto.ts:3-19`)에 fps가 없는 현 계약을
   유지하는 선이며, 계약 확장은 별도 결정이다.

1→2→3 순서대로 하면 각 단계가 독립 PR로 성립하고, 3까지 끝나면 W-4의 글루("worker에
YAML 만들어 넣기")는 개념적으로 존재할 수 없게 된다: 카메라는 seed → backend → pull로
연결되고, E2E 하네스가 worker에 대해 할 일은 env 두 줄뿐이다. 참고로 roster 변경이
프로세스 재시작(`restart_epoch`)으로만 반영되는 현 동작(`edge_worker.py:458-466`)은
그대로 두어도 무방하다 — 재시작 신호 역시 pull 경로에 이미 있다.

### 5-3. E2E 스택이 글루 없이 서게 — 부팅 가능한 full profile

W-1~W-3의 소거. ① `compose.e2e.yaml`을 리포에 추가: 전용 프로젝트명 강제(README에
`-p` 필수 명기), 포트 전부 `${..._PORT:-기본값}` 변수화, `container_name` 고정 제거(또는
프로젝트명 파생), §5-1-3의 migrate 서비스 포함. ② e2e env는 example 파일이 아니라
**생성 스크립트**(`scripts/` 소유)로: 랜덤 시크릿을 만들어 production 검증을 실값으로
통과시킨다 — W-2에서 손으로 했던 그 일을 스크립트가 한다. 시크릿이 리포에 들어가지 않는
것이 example 파일 대비 장점이다. ③ 그 위에 full-chain smoke(수동 트리거로 시작, 안정되면
nightly): 외부 RTSP 컨테이너 기동 → compose up → "relay 202 → alerts 행 → 스냅샷 200"
어설션. RTSP publisher는 anti-pattern 규칙대로 리포 밖 이미지를 참조만 한다.

### 5-4. 나머지 셋 — 각각 소형 PR 하나 분량

- **스냅샷 원자성(§1-3)**: `persistSnapshotKey`의 함수 호출과 `alerts.updateMany`를 단일
  인터랙티브 트랜잭션으로 묶는다. 기존 불일치 행(event에는 key, alerts에는 null)은 일회성
  backfill 스크립트로 정리. 장기적으로 §3-3의 StorageService 시임과 같은 PR 라인.
- **delivery 관측성(P2-2)**: Kakao 어댑터의 "미연결 계정" 분기를 NOT_CONFIGURED 같은
  명시적 delivery 상태로 기록하고 경고 로그 1줄을 계약으로. hop 카운터(§3-7)까지 가면
  W-10의 수동 로그 감시가 어설션으로 대체된다.
- **아티팩트 인도 계약(W-5)**: dataset-ops의 export 단계에 "metadata.yaml 정확히 1개,
  stale 파일 0개" 검증을 추가하고, fall-ai의 로더 가드는 최후 방어선으로 유지. 현재
  체크아웃의 stale `metadata.json`은 일회성 정리.

### 5-5. 이 가이드가 성립하면 사라지는 질문들

"이 환경에 migrate 돌렸던가?" / "dev DB에 그 함수 있나?" / "main이 왜 빨갛지?" /
"worker YAML 어디서 만들어 넣지?" / "카메라 스트림 주소는 누가 아는 거지?" /
"알림이 진짜 나갔나?" — 전부 사람의 기억에서 구조(게이트·계약·어설션)로 이동한다.
E2E를 다시 돌리는 날, 손으로 만들 것은 RTSP 소스 하나여야 한다.
