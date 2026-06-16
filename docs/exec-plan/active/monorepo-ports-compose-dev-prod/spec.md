---
slug: monorepo-ports-compose-dev-prod
date: 2026-06-16
type: brownfield
author: deep-interview (di-port-compose-strategy)
rounds: 8
final-ambiguity: 4%
status: active
related-adrs: [ADR-041]
---

# Spec — 모노레포 포트 표준화 + Docker Compose dev/prod 전략

> Source: `.gjc/specs/deep-interview-monorepo-ports-compose-dev-prod.md`.
> This file is the git-canonical exec-plan mirror for slug `monorepo-ports-compose-dev-prod`.

## What

`front`, `backend`, `ml-serving`, and `db`의 포트를 표준화하고, 일상 개발은 네이티브 hot reload로 유지하면서 단일 서버 Compose 배포에 필요한 base/override/prod 3-파일 전략과 앱별 Dockerfile을 갖춘다.

## 확정 포트맵

| Service | Port |
|---|---:|
| `front` | `3000` |
| `backend` | `8080` |
| `ml-serving` | `8000` |
| `db` | `5432` |

## 확정 요구사항

1. **일상 개발은 네이티브 우선**: `pnpm db:up`으로 PostgreSQL만 Compose에서 띄우고, 앱은 `pnpm dev:backend`, `pnpm dev:ml`, `pnpm dev:front`로 실행한다.
2. **Compose는 3-파일 전략**: `compose.yaml` base, `compose.override.yaml` dev overlay, `compose.prod.yaml` prod overlay를 사용한다.
3. **활성화 경계**: dev override의 app 서비스는 `profiles: [full]`로 게이트한다. 기본 `docker compose up`과 `pnpm db:up`은 db-only여야 한다.
4. **배포/parity 경로**: full dev parity는 `--profile full`, prod는 `-f compose.yaml -f compose.prod.yaml` 조합으로 실행한다.
5. **Dockerfile 구조**: app Dockerfile은 `base -> deps -> dev -> build -> runner` 멀티스테이지를 사용한다.
6. **빌드 재현성**: TypeScript 서비스는 루트 context와 root pnpm workspace lockfile을 사용하고, lockfile-first dependency layer를 만든다.
7. **ML dependency boundary**: prod runner는 `uv sync --frozen --no-default-groups`를 사용한다.
8. **Backend Prisma boundary**: backend 이미지는 빌드타임 `prisma generate`를 수행하고 runner에 generated client/native engine artifact를 포함한다. startup generate/migrate/seed는 하지 않는다.
9. **포트/URL SSOT**: 루트 `.env` / `.env.example`이 포트와 URL의 단일 출처다.
10. **URL 경계**: 브라우저는 `localhost` URL을 사용하고, 컨테이너/서버 내부 통신은 Compose service name을 사용한다.

## Acceptance Criteria

- `pnpm db:up` + native `dev:*` 명령으로 front `:3000`, backend `:8080`, ml-serving `:8000`, db `:5432`가 충돌 없이 기동한다.
- front는 기본 `3000`에서 실행된다.
- root `.env.example`에 포트/URL 변수가 있고 Compose가 `${VAR}` 기본값으로 참조한다.
- 기본 Compose config는 db-only이고, `--profile full` config는 4서비스다.
- prod overlay config는 app 서비스를 활성화하고 dev bind mount/reload를 포함하지 않는다.
- ADR과 README에 포트맵, native daily loop, Compose parity/prod command, URL 경계가 문서화된다.

## Non-goals

- 실제 운영 배포 실행, TLS/도메인/클라우드 프로비저닝, Kubernetes/PaaS, CI/CD, prod secret 관리.
- `ml/demo`를 표준 4서비스 런타임에 편입.
- frontend callsite가 없는 상태에서 speculative URL resolver를 추가.
- Node engine 불일치 해결.
