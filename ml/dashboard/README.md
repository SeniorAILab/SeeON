빌드: `pnpm install && pnpm build`

## Tailnet dashboard access

Default operator access is direct tailnet port access from the operator machine:

```text
http://<edge-tailnet-ip>:5173
```

The dashboard runs on the nursing-home edge host; `ml-api` stays local to that
host and is reached through the dashboard proxy. Keep access tailnet-only and do
not publish the dashboard to the public internet.

Defaults:

- `ML_DASHBOARD_PORT=5173`
- `ML_SERVING_PORT=8000`

Start or confirm `ml-api` on loopback first. The edge compose default publishes
it as `127.0.0.1:${ML_SERVING_PORT:-8000}:8000`.

Start the dashboard on a tailnet-reachable interface:

```bash
ML_API_PROXY_TARGET="http://127.0.0.1:${ML_SERVING_PORT:-8000}" \
  pnpm --dir ml/dashboard dev --host 0.0.0.0 --port "${ML_DASHBOARD_PORT:-5173}"
```

The edge host firewall must allow TCP `5173` from the Tailscale interface or
tailnet only.

Use Tailscale Serve only as a fallback when the dashboard must stay bound to
loopback:

```bash
tailscale serve --bg --https=5173 http://127.0.0.1:5173
```

Fallback teardown:

```bash
tailscale serve status
tailscale serve reset
```

Operational rule: `docs/rules/nursing-home-edge-dashboard-access.md`.

## `/api/v1/system` 확장 제안

시스템 화면은 클립 스토어 사용량을 게이지로 표시할 수 있도록 다음 선택 필드를 읽습니다.

```json
{
  "storage": {
    "clips_used_bytes": 2147483648,
    "clips_limit_bytes": 10737418240
  },
  "update_history": [
    { "id": "deploy-20260706", "version": "2026.07.06", "created_at": "2026-07-06T00:00:00.000Z", "status": "applied" }
  ],
  "rollback_history": []
}
```

필드가 없으면 대시보드는 사용량을 추정하지 않고 안내문을 표시합니다.
