---
slug: claude-design-parity-real-api
status: pending-approval
date: 2026-06-19
author: gobeumsu
issue: TBD (type:feat — front)
---

# Claude Design 목업 충실도 × 실제 backend API 바인딩

## Requirements Summary

투자자 데모 프론트(`front/`)를 Claude Design 프로젝트 *"Eldercare Fall Detection — Demo UI"*
(`claude.ai/design/p/0563d083…`)의 TailAdmin 스타일 충실도로 끌어올린다. 단,
**모든 위젯은 실제 backend API 계약에 바인딩한다 — 없는 데이터는 만들지 않는다.**

- 범위: 6개 라우트군 전체 (`dashboard`, `monitoring`, `alerts(+[id])`, `admin/{residents(+[id]),guardians,cameras}`, `reports`, `settings/*`).
- 차트: **recharts** 추가 (mood = 따뜻한 돌봄형, warm 토큰 재사용).
- 디자인 시스템: 기존 `front/src/app/globals.css` warm @theme 토큰 그대로 (Tailwind v4). 신규 색 토큰 없음.
- 데모/실서버 동형: `IS_DEMO`면 `mockApi`, 아니면 실 backend. **mock도 실 계약과 어긋난 부분을 교정**한다.

## 하드 제약 — 실제 API 바인딩 (이 계획의 핵심)

backend에 **stats/aggregation/metrics 엔드포인트가 0개**다. `Alert.type`은 freeform string,
`ackedAt` 타임스탬프 없음. 따라서 위젯별 바인딩을 아래 표로 고정한다.

| 목업 위젯 | 실제 백킹 | 결정 |
|---|---|---|
| 오늘 낙상 감지 (count) | `GET /api/alerts` → client filter `type==='FALL' && detectedAt>=오늘00:00` | **파생** (ponytail: limit 200 cap, 오늘 FALL>200이면 부정확 — 데모 규모 충분) |
| 모니터링 구역 (count) | `GET /api/cameras` → `length` (또는 `online===true` 수) | **파생** |
| 미확인 알림 (ACK 대기) | `GET /api/alerts?status=NEW` → `length` | **파생** (200 cap 동일 주석) |
| ~~평균 대응 시간~~ | **백킹 없음** — `Alert`에 `ackedAt` 없음 | **드롭 → 교체**: "현재 위험 구역" = `GET /api/status` 중 `state==='FALL'` 수 (실데이터·SSE 갱신) |
| 시간대별 추이 (area) | `GET /api/alerts` → `hour(detectedAt)` 그룹 | **파생** (ponytail: 단일 호출 200 cap, 페이지네이션 안 함 — 데모는 "오늘" 1일치만; 주/월 탭은 비활성 or 동일 데이터 라벨) |
| 알림 유형 (donut) | `GET /api/alerts` → `type` 그룹 | **파생** + 라벨은 `sse-utils.ts:156-161` 사용(`FALL→낙상, BED_EXIT→침대 이탈, NO_MOTION→움직임 없음, DETECTION_LOST→감지 끊김`). 목업의 "이상 자세/장시간 무동작" 임의 라벨 폐기 |
| 구역 실시간 상태 그리드 | `GET /api/status` (`ResidentStatus[]`, `state`, `cameraOnline`, `resident.room`) + SSE `status-snapshot`/`status` | **완전 백킹** (충실 구현) |
| 최근 낙상 알림 피드 | `GET /api/alerts` (`resident{name,room}`, `detectedAt`, `status`, `type`, `probability`) + SSE alert 이벤트 | **완전 백킹** |

### 부수 교정 (mock ↔ 실계약 드리프트)
- `mock/api.ts:23` `?type=` 필터: backend 미지원 → **클라 파생으로 이동**, mock에서 제거 or 무시 명시.
- `mock/api.ts` 합성 `GET /api/residents/:id`(guardians/cameras/status/alerts 포함): 실 backend는 flat `Resident`만. **resident 상세는 4개 실 호출 조합으로 재구성** (`/api/residents/:id` + `/api/guardians?residentId=` + `/api/status/:residentId` + `/api/alerts?residentId=`). mock도 동일 조합으로 맞춤.
- `DemoResident.{birthYear,careLevel,admittedAt}`: backend에 없음 → UI에서 **제거** (목업의 "82세" 등 나이 표기는 실데이터 없음 → room/name만, 또는 입소자 카드에서 해당 필드 비표시).
- `DemoRole='CAREGIVER'`: backend는 `OWNER|ADMIN`뿐 → RoleSwitcher의 CAREGIVER는 **데모 전용 UI 역할**임을 주석으로 명시(이미 demo flag 하). 실서버 토폴로지엔 영향 없음.
- `ResidentStatus.source`(front) vs `sourceId`(DB): 직렬화 레이어 1회 확인, 어긋나면 front 타입을 `sourceId`로 통일.

## Acceptance Criteria (testable)

1. `pnpm --filter front build` (with `NEXT_PUBLIC_DEMO=1 DEMO=1`) 성공, 18+ 페이지 컴파일.
2. `recharts`가 `front/package.json` `dependencies`에 1개만 추가, lockfile 갱신.
3. `/dashboard`에 4 KPI 카드가 렌더되며 **"평균 대응 시간" KPI는 존재하지 않음**(grep `평균 대응` → 0). 대체 KPI "현재 위험 구역"이 `/api/status`에서 파생.
4. 차트 2종(area trend, donut)이 recharts로 렌더, warm 토큰 색 사용. donut 카테고리 라벨이 `sse-utils` 라벨과 정확히 일치(grep로 "이상 자세"/"장시간 무동작" → 0).
5. KPI/차트의 모든 수치가 `api.get(...)` 호출 결과에서 파생(하드코딩 숫자 없음). 각 파생 카운터에 truncation 한계 `// ponytail:` 주석 1개.
6. resident 상세 화면이 합성 mock route가 아니라 4개 실 엔드포인트 조합으로 동작(실 backend에서도 깨지지 않음).
7. 데모 모드에서 `/dashboard`,`/monitoring`,`/alerts`,`/alerts/[id]`,`/admin/residents`,`/admin/residents/[id]`,`/admin/guardians`,`/admin/cameras`,`/reports`,`/settings/*` 모두 200.
8. 기존 테스트(`api.test.ts`, `sse.test.ts`, `scenario.test.ts`, `session.test.ts`) 통과; 변경된 mock route 계약은 테스트 갱신.
9. 라이브 검증: `next start -p 3100`, 위 라우트 200 + `/dashboard` HTML에 KPI/차트 컨테이너 존재.

## Implementation Steps (파일 참조)

### Phase 0 — 데이터 파생 레이어 (공통, 선행)
- `front/src/lib/dashboard-metrics.ts` (신규, ~80줄): 순수 함수
  `deriveKpis(alerts, cameras, statuses)`, `deriveHourlyTrend(alerts)`, `deriveTypeBreakdown(alerts)`.
  입력은 `SseAlert[]`/`Camera[]`/`ResidentStatus[]`(실 타입), 출력은 차트/카드용 뷰모델.
  각 파생에 `// ponytail:` 한계 주석. **runnable check**: 같은 파일 하단 `if (require.main===module)` 또는
  별도 `dashboard-metrics.test.ts` 1개 — 합성 입력으로 카운트/그룹핑 assert.
- `front/src/lib/mock/api.ts`: `?type=` 필터 제거(또는 무시 주석), 합성 `/api/residents/:id`를 flat로 축소,
  `DemoResident` 잉여 필드 정리. `mock/types.ts` 동기화.

### Phase 1 — 차트 컴포넌트 (recharts)
- `pnpm --filter front add recharts`.
- `front/src/components/charts/TrendArea.tsx`, `TypeDonut.tsx` (신규): recharts `AreaChart`/`PieChart`,
  warm 토큰 색(`--color-brand`,`--color-danger` 등 CSS 변수 또는 리터럴), `"use client"`.
  데이터는 props로만 받음(파생 로직 미포함).

### Phase 2 — Dashboard
- `front/src/app/(dashboard)/dashboard/page.tsx`: hero(+시계), 4 KPI(낙상/구역/미확인/**현재 위험 구역**),
  TrendArea, TypeDonut, 구역 상태 그리드, 최근 알림 피드. 전부 `api.get` + Phase 0 파생.
  기존 `KPI_ICONS`/`TONES`/`Kpi` 재사용.

### Phase 3 — Monitoring / Alerts
- `monitoring/page.tsx`: 구역 상태 그리드 풀뷰 + SSE 라이브(`/api/sse` `status-snapshot`/`status`). 기존 SSE 훅 재사용.
- `alerts/page.tsx`: 목업 피드 스타일 리스트(필터 status, 클라 type 파생). `alerts/[id]/page.tsx`: PoseFrameCard 유지(이미 실 데이터).

### Phase 4 — Admin / Reports / Settings
- `admin/residents(+[id])`, `admin/guardians`, `admin/cameras`: 카드/테이블 warm 스타일, 실 엔드포인트.
  resident 상세는 4-call 조합.
- `reports/page.tsx`: 동일 차트 컴포넌트 재사용(파생 데이터). 백킹 없는 지표 비표시.
- `settings/*`: 카드/폼 warm 스타일만(데이터 계약 변화 없음).

### Phase 5 — 검증 + 정리
- 빌드/라이브/테스트(Acceptance 1–9). 미사용 자산 정리. plan archive + (해당 시) ADR distill.

## PR Decomposition (size/XL → fan-out, ADR-016/rules)

각 PR은 size/M 이하·독립 리뷰 가능:
1. **feat(front): dashboard-metrics 파생 레이어 + mock 계약 교정** (Phase 0) — 테스트 포함, UI 변화 최소.
2. **feat(front): recharts 차트 컴포넌트** (Phase 1).
3. **feat(front): dashboard 목업 충실도** (Phase 2).
4. **feat(front): monitoring + alerts 리치 스타일** (Phase 3).
5. **feat(front): admin/reports/settings 스타일 + resident 4-call 상세** (Phase 4).

각 PR 머지 전 리뷰 evidence 기록(`docs/rules/pr-decomposition-and-review.md`).

## Risks & Mitigations

- **R1 파생 카운터 truncation (200 cap):** 데모 1일 규모에선 무해. `// ponytail:` 주석으로 상한·업그레이드 경로(서버 count 엔드포인트) 명시. → 미티게이션: 데모 시드가 200 미만 보장.
- **R2 "평균 대응 시간" 기대치:** 투자자가 목업에서 봤을 수 있음. → 미티게이션: "현재 위험 구역"으로 교체하고, 향후 `ackedAt` 추가 시 부활 가능함을 plan/ADR에 남김(스키마 변경은 별도 backend 이슈).
- **R3 recharts SSR:** App Router에서 `"use client"` 누락 시 hydration 오류. → 차트 컴포넌트 전부 client.
- **R4 mock 계약 교정이 기존 테스트 깨뜨림:** → 같은 PR에서 테스트 갱신, 실 backend 계약을 진실원으로.
- **R5 resident 4-call 조합 비용:** N+1 느낌. → 데모 단일 상세 화면, 병렬 `Promise.all`. 충분.

## Verification Steps

1. `NEXT_PUBLIC_DEMO=1 DEMO=1 pnpm --filter front build` → exit 0, 페이지 수 확인.
2. `pnpm --filter front test` → 파생 레이어 테스트 + 기존 통과.
3. `grep -r "평균 대응\|이상 자세\|장시간 무동작" front/src` → 0 (드롭/교정 확인).
4. `next start -p 3100` → 9 라우트 curl 200, `/dashboard` HTML에 차트/KPI 마커.
5. (가능 시) 실 backend 기동 후 `IS_DEMO=0`로 resident 상세 4-call·status 그리드 동작 확인.

## 후속 (별도 이슈)
- backend `Alert.ackedAt` 추가 → "평균 대응 시간" 복원 (스키마 변경 = backend ADR 대상).
- 서버측 stats/aggregation 엔드포인트 → 클라 파생 truncation 제거.
