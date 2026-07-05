from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from contracts.worker_config import WORKER_CONFIG_PATH, PulledWorkerConfig


def pull_worker_config(
    relay_url: str,
    relay_token: str | None,
    *,
    timeout_sec: float = 5.0,
) -> PulledWorkerConfig | None:
    url = f"{relay_url.rstrip('/')}{WORKER_CONFIG_PATH}"
    headers = {"Accept": "application/json"}
    if relay_token:
        headers["X-Edge-Relay-Token"] = relay_token
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout_sec) as response:
            if response.status != 200:
                print(f"worker config pull skipped: HTTP {response.status}", file=sys.stderr)
                return None
            body = response.read().decode("utf-8")
        return PulledWorkerConfig.from_dict(json.loads(body))
    except (
        TimeoutError,
        OSError,
        urllib.error.URLError,
        urllib.error.HTTPError,
        json.JSONDecodeError,
        ValueError,
        TypeError,
    ) as exc:
        print(f"worker config pull skipped: {exc}", file=sys.stderr)
        return None


__all__ = ["pull_worker_config"]
