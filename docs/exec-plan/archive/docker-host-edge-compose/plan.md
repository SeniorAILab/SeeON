---
slug: docker-host-edge-compose
date: 2026-06-21
author: ralplan (2026-06-21-docker-edge-split)
status: done
spec: ./spec.md
related-adrs: [ADR-062, ADR-063]
---

# Plan — Docker 토폴로지 재정렬 + compose.override 제거

> Source (scratch): `.gjc/plans/ralplan/2026-06-21-docker-edge-split/` (stage-04-final).
> Consensus: Planner → Architect BLOCK → revision → Critic REJECT → revision → Critic OKAY/APPROVE.
> This file is the git-canonical exec-plan summary for slug `docker-host-edge-compose`.
> Shipped: PR #299 (topology, ADR-062) + PR #301 (override cleanup, ADR-063). Both merged to `main`.

## Decision Summary

- 호스트 스택 = `compose.yaml`(`db` + `backend` + `front`[nginx]); `backend`/`front`는 `full` 프로파일 게이트.
- ML = 외부 엣지 → `compose.edge.yaml`; backend `ML_SERVING_URL` 제거(pull seam dormant, ADR-029/048).
- front = nginx 정적 SPA + same-origin 리버스 프록시(`/api`·`/auth`·`/ingest`→`backend:8080`, `/api/sse` 무버퍼링).
- db = 단일 호스트 동거 유지 + pg_dump 백업.
- dev = 네이티브 hot reload 전용. `compose.override.yaml`(컨테이너-dev) 제거 — 느린 경로 + 드리프트 온상(ADR-063).
- compose 파일 = `compose.yaml`(full 프로파일) + `compose.prod.yaml`(prod overlay) + `compose.edge.yaml`(edge).

## Slices

### S1 — front 부팅 복구 (PR #299)
- 신규 `front/Dockerfile`(node:24-alpine + pnpm@10.32.1 멀티스테이지 → nginx:1.27-alpine, port 3000) + `front/nginx.conf`(`try_files` SPA 폴백; `/api`·`/auth`·`/ingest`→backend; `= /api/sse` `proxy_buffering off`) + `front/.dockerignore`.
- 검증: `docker compose --profile full build front` 성공(이전 `failed to read dockerfile`).

### S2 — compose 호스트 스택 + edge (PR #299)
- `compose.yaml`: ml-serving 제거, backend `ML_SERVING_URL` 제거, FRONT_ORIGIN 유지, front 블록 nginx.
- `compose.override.yaml`/`compose.prod.yaml`: ml-serving 제거.
- 신규 `compose.edge.yaml`: ml-serving + env `ALERT_API_URL`/`INGEST_KEY_ID`/`INGEST_SECRET`/`DEMO_RESIDENT_ID`/`DEMO_FACILITY_ID`(전부 required).
- `.env.example`: same-origin `/api` 설명 + 엣지 ingest 섹션.

### S3 — db 백업 (PR #299)
- `scripts/db-backup.sh`(pg_dump -Fc + 로테이션) + `docs/runbooks/db-backup-restore.md`(크론 + 클린 볼륨 복원).

### S4 — ADR/docs (PR #299)
- `ADR-062`(host/edge 토폴로지) + `docs/architecture.md` + `docs/decisions/README.md`.

### S5 — compose.override 제거 (PR #301)
- `profiles: [full]`을 `compose.override.yaml` → `compose.yaml`(backend/front)로 이동, override 삭제.
- `package.json`: `compose:dev:full` → `compose:full`.
- `ADR-063`(native-only dev) + ADR-041/062 cross-ref + README/AGENTS/architecture/인덱스 갱신.

## Verification (실증 완료)

- `docker compose config --services` → db only(기본); `--profile full` → db/backend/front; `compose.edge.yaml` → ml-serving.
- `docker compose --profile full build` 성공.
- 호스트 스택 up(기존 db 연결) → `/` 200(브라우저 스크린샷), `/api/floors` 401, `/auth/kakao/login` 302, `/api/sse` 401, `/dashboard` 200; backend가 `ML_SERVING_URL` 없이 부팅.
- CI: 두 PR 모두 Backend/Frontend/CI gate/Base/Draft/Size pass. Architect 리뷰 all-CLEAR/APPROVE.

## Outcome

- PR #299 merged (issue #298 closed) — ADR-062.
- PR #301 merged (issue #300 closed) — ADR-063.
- `docker compose --profile full`이 실제로 기동(이전엔 front Dockerfile 부재로 빌드 불가).

## Deferrals / Follow-ups

- 풀 엣지 런타임 이미지 패키징(ml/Dockerfile sibling 패키지) → `ml-edge-device-relayout`.
- 비-mock front 운영 전환(VITE_USE_MOCK=false) → Phase 2.
- 실제 prod 배포 실행 / HMAC 키 회전 / nginx 런타임 resolver·backend healthcheck 하드닝(ADR-062 follow-up) / CI.
