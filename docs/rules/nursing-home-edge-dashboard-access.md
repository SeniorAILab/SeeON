# Nursing Home Edge Dashboard Access

## Rule

Use direct tailnet port access for the nursing-home ML dashboard:

```text
http://<edge-tailnet-ip>:5173
```

The operator machine and the nursing-home edge host must be on the same tailnet. Do not publish this
dashboard to the public internet.

## Operating Contract

- Keep the dashboard on `ML_DASHBOARD_PORT=5173` for edge operation.
- Bind the dashboard to a tailnet-reachable interface, for example `--host 0.0.0.0`, when the
  operator needs to open it from another tailnet device.
- Keep `ml-api` local to the edge host; the dashboard should proxy to
  `http://127.0.0.1:${ML_SERVING_PORT:-8000}`.
- Keep the host firewall open for TCP `5173` from the Tailscale interface or tailnet only.
- Use Tailscale Serve only as a fallback when the dashboard must remain bound to `127.0.0.1`.
- Use the operator-approved Google account fallback only when Tailscale is unavailable.

## Checks

From the operator machine:

```bash
tailscale status
curl -I http://<edge-tailnet-ip>:5173
```

On the edge host, if direct access fails:

```bash
ss -ltnp | grep ':5173'
sudo ufw status
```

The expected fix is usually one of: bind Vite to a tailnet-reachable host, start the dashboard on
port `5173`, connect the operator machine to the same tailnet, or allow TCP `5173` on the edge
host firewall for tailnet traffic.

## Do Not Record

Do not put real Tailscale IPs, tailnet domains, passwords, RTSP URLs, camera topology, or facility
network details in docs, logs, screenshots, fixtures, or evidence.
