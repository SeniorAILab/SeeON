---
slug: docker-host-edge-compose
date: 2026-06-21
type: brownfield
author: deep-interview (di-docker-edge-split-20260621)
rounds: 6
final-ambiguity: 5%
status: done
related-adrs: [ADR-062, ADR-063]
---

# Spec — Docker 토폴로지 재정렬: ML 엣지 분리 + front+backend+db 단일 호스트

> Source (scratch): `.gjc/specs/deep-interview-docker-compose-edge-ml-split-single-host.md`.
> This file is the git-canonical exec-plan mirror for slug `docker-host-edge-compose`.
> Implemented across PR #299 (topology) and PR #301 (override cleanup). Decisions distilled to ADR-062 / ADR-063.

## Goal

현재 docker / docker compose / db 구성이 타깃 토폴로지에 부합하는지 검증하고 재정렬한다. 타깃:
1. **ML = 외부 엣지 디바이스**에서 구동, 호스트 compose에서 분리(엣지는 외부에서 backend `/ingest`로 HMAC push, ADR-029).
2. **front + backend + db = 단일 호스트** compose. front(Vite SPA)는 nginx로 정적 서빙 + `/api`·`/auth`·`/ingest` same-origin 리버스 프록시(현 compose의 Next.js 잔재·부재 Dockerfile 정리).
3. **db**는 현 RLS/init/healthcheck/볼륨 구성을 단일 호스트에 유지 + 정기 백업 추가.

## Topology (Round 0 confirmed)

| Component | Status | Coverage |
|-----------|--------|----------|
| ML 엣지 분리 | active | `compose.edge.yaml` 신규; 배포 backend `ML_SERVING_URL` 제거(seam dormant, ADR-029/048); 엣지=외부→공인 ingest URL + HMAC |
| front+backend 단일 호스트 | active | 신규 `front/Dockerfile`(build→nginx); SPA `try_files` 폴백; `/api`·`/auth`·`/ingest` 프록시, `/api/sse` 무버퍼링; VITE 상대 `/api`; Next 잔재 제거; same-origin CORS 소멸 |
| DB 구성 검증 | active | postgres:17-alpine, RLS 롤 fall/fall_app, init, healthcheck, pgdata 유지; pg_dump 백업 + 복원 런북 |

## Constraints

- 호스트 compose = `db` + `backend` + `front`(nginx). ml-serving은 호스트 스택 제외(엣지).
- backend는 `ML_SERVING_URL` 없이 부팅; 라이브 ML 통합은 edge-push(`/ingest`)만. pull seam(`AlertsModule`/`prediction.port.ts`/`ml-serving-prediction.adapter.ts`)은 dormant 보존(ADR-048).
- front 브라우저 API base = 상대 `/api`(same-origin); `NEXT_PUBLIC_*`/`API_INTERNAL_URL`/`next dev` 제거.
- nginx는 backend 3개 prefix(`/api`,`/auth`,`/ingest`)를 명시 프록시(backend는 글로벌 `/api` prefix 없음, route-inventory 참조), SSE는 `/api/sse`에 `proxy_buffering off`.
- 엣지 이미지 env = 공인 ingest URL(`ALERT_API_URL`, verbatim `/ingest/alerts`) + HMAC(`INGEST_KEY_ID`/`INGEST_SECRET`) + `DEMO_RESIDENT_ID`/`DEMO_FACILITY_ID`(전부 required).
- db는 단일 호스트 동거 유지 + pg_dump 백업; 매니지드 Postgres 이전은 범위 밖.
- 데일리 dev = 네이티브 hot reload(`pnpm dev:*` + `pnpm db:up`). 컨테이너-dev override 없음(ADR-063).

## Non-Goals

- 실제 prod 배포 실행/호스팅(클라우드/도메인/TLS).
- 엣지 디바이스 하드웨어 프로비저닝 및 풀 엣지 런타임 이미지 패키징(ml-edge-device-relayout 소관).
- backend↔ml pull seam 재활성화.
- 비-mock front 실배선(VITE_USE_MOCK=false 운영 전환, Phase 2).
- HMAC 키 발급/회전 체계, CI 파이프라인.

## Acceptance Criteria (검증 완료)

- [x] `docker compose --profile full config --services` → db/backend/front (ml-serving 없음); `compose.edge.yaml` config → ml-serving(required env).
- [x] `docker compose --profile full build` 성공(front 포함 — 이전 `front/Dockerfile` 부재로 빌드 불가였음).
- [x] 호스트 스택 up → `/` 200(SPA), `/api/floors` 401, `/auth/kakao/login` 302, `/api/sse` 401, `/dashboard` 200(try_files); backend가 `ML_SERVING_URL` 없이 부팅.
- [x] db 백업 스크립트(`scripts/db-backup.sh`) + 복원 런북(`docs/runbooks/db-backup-restore.md`).
- [x] 기본 `docker compose up`/`pnpm db:up` = db-only; `pnpm compose:full` = 호스트 풀 스택(override 제거 후).
- [x] ADR-062 + ADR-063 + `docs/architecture.md` 갱신.

## Technical Context

- 스택: Vite+React SPA(front), NestJS 11(backend, Prisma→Postgres), FastAPI(ml-serving, uv, 엣지), Postgres 17.
- 발견된 드리프트(해소): `front/Dockerfile` 부재(빌드 불가), front Vite인데 compose가 Next 가정, ml-serving 호스트 동거 vs ML=엣지, backend `ML_SERVING_URL` dormant pull seam.
- 엣지 ingest 계약: `POST /ingest/alerts|heartbeat`, HMAC(`X-Ingest-Key-Id`/`X-Ingest-Timestamp`±5분/`X-Signature`).

## Ontology (Key Entities)

Host Stack, Edge Device(external), Compose File, Service, nginx Front, Backend Env, DB(RLS roles/pgdata), Ingest Path(HMAC), Backup.
