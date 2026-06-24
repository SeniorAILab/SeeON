# ADR-062 — Host/Edge Compose topology: ML on the edge, front+backend+db on a single host

- Status: Accepted
- Date: 2026-06-21
- Deciders: deep-interview + ralplan consensus (run 2026-06-21-docker-edge-split)
- Supersedes (partial): ADR-041 — the four-service single-host compose topology is amended so `ml-serving` is no longer part of the host stack. ADR-041's port map remains in force. (Update: the `compose.override.yaml` dev overlay referenced below is removed by ADR-063 — dev is native-only; the host stack is `compose.yaml` under the `full` profile + `compose.prod.yaml` + `compose.edge.yaml`.)
- Related: ADR-029 (edge inference deployment topology), ADR-048 (ml/backend window predict seam), ADR-023 (ML/backend prediction boundary), ADR-002 (Postgres everywhere), ADR-055 (Vite + React front stack), ADR-067 (ML edge API/worker split).

## Context

Docker Compose was structured as a single four-service stack (`db`, `backend`, `ml-serving`, `front`) per ADR-041. Two facts invalidated that topology:

1. **ML runs on the edge.** Inference happens on the external edge device, which performs detection locally and pushes signed events to the backend `POST /ingest/*` endpoint over HMAC (ADR-029). The backend's `MlServingPredictionAdapter` pull seam (`ML_SERVING_URL` → `/predict`) is dormant and not invoked on the live edge-push path (ADR-048/ADR-029). Co-locating `ml-serving` with backend on the host contradicts the edge deployment model.
2. **The front service was unbuildable and built on stale assumptions.** `front/Dockerfile` did not exist, yet `compose.yaml` referenced it (so `docker compose --profile full build` failed at `front`), and the compose blocks carried Next.js assumptions (`NEXT_PUBLIC_*`, `next dev`) even though the front is a Vite SPA (ADR-055).

The deployment target is therefore two units: a single host running `front + backend + db`, and an external edge device running ML.

## Decision

1. **Host stack = `db` + `backend` + `front`.** `compose.yaml` defines only these three services. `compose.override.yaml` (dev) and `compose.prod.yaml` (prod overlay) no longer contain `ml-serving`.
2. **Front is served by nginx with a same-origin reverse proxy.** A new multi-stage `front/Dockerfile` builds the Vite SPA and serves it from `nginx:1.27-alpine` on port 3000. `front/nginx.conf` serves the static SPA with a `try_files … /index.html` fallback and reverse-proxies the backend's three route prefixes — `/api/`, `/auth/`, `/ingest/` — to `http://backend:8080`, with `proxy_buffering off` scoped to `/api/sse`. The backend has no global `/api` prefix (see `docs/api/route-inventory.md`), so each prefix is proxied explicitly. Same-origin makes browser CORS a non-issue.
3. **ML moves to `compose.edge.yaml`.** The edge-only compose file builds explicit images from `ml/Dockerfile.api` and `ml/Dockerfile.worker` (ADR-068): `ml-edge-api` for FastAPI health/status/debug routes and `ml-edge-worker` for production RTSP camera ownership. The worker consumes a mounted `EDGE_CAMERA_CONFIG` JSON with per-camera RTSP URLs and ingest credentials. Because the edge is on a separate host/network, ingest URLs in that file must use the backend's public endpoint — a Docker service name cannot reach it.
4. **`ML_SERVING_URL` is removed from the deployed backend env; the code seam stays dormant.** The `AlertsModule` / `prediction.port.ts` / `ml-serving-prediction.adapter.ts` seam is retained (ADR-048) but unused on the edge-push path; re-add `ML_SERVING_URL` only if a future topology re-enables backend-pull prediction.
5. **DB stays co-located on the host + gets periodic backups.** The `db` service keeps its current shape (postgres:17-alpine, RLS roles `fall`/`fall_app`, `backend/prisma/init`, healthcheck, `pgdata` volume). `scripts/db-backup.sh` (pg_dump custom format + rotation) and `docs/runbooks/db-backup-restore.md` add durability. Managed-Postgres migration is explicitly out of scope.

## Decision Drivers

- Restore a buildable, runnable host stack (front was a hard build blocker).
- Reflect the real ML deployment model (external edge, push ingest) in compose.
- Same-origin front serving removes CORS coupling and gives one host entrypoint.
- Data durability for a single-host Postgres without adopting managed infrastructure yet.

## Alternatives Considered

- **Keep `ml-serving` co-located on the host** — rejected: contradicts ML-on-edge; the host would build/run an unused model server.
- **Serve the SPA from the NestJS backend (`ServeStaticModule`)** — rejected: nginx static + reverse proxy was chosen for clean SPA routing and a single same-origin entrypoint.
- **Move `db` to managed/external Postgres** — rejected for now: the current RLS-aware config is solid and the MVP is single-host; revisit when scaling.

## Consequences

- The front container depends on nginx and on the backend being reachable as `backend:8080` inside the host network; the edge depends on the backend's public ingest URL.
- The edge image now packages the ML runtime sibling packages needed by both API and worker services; camera credentials stay outside git and enter only through the mounted edge-camera config.
- Front remains mock-first (`VITE_USE_MOCK` default `true`); non-mock backend wiring is a later (Phase 2) change. The nginx proxy is forward-compatible with it.

## Follow-ups

- Non-mock front wiring (`VITE_USE_MOCK=false`) for the host stack.
- Real production deploy execution, HMAC key provisioning/rotation, and CI for the compose lanes.
