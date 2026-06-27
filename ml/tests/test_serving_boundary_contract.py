from __future__ import annotations

import ast
import subprocess
import sys
from pathlib import Path
from typing import Final

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from api.main import create_app, no_lifespan

ML_ROOT: Final = Path(__file__).resolve().parents[1]
SERVING_ROOT: Final = ML_ROOT / "api"
ALLOWED_PATHS: Final = {
    "/debug/predict/source",
    "/debug/predict/window",
    "/docs",
    "/docs/oauth2-redirect",
    "/health",
    "/health/live",
    "/health/ready",
    "/models",
    "/openapi.json",
    "/redoc",
    "/relay/alerts",
    "/relay/heartbeat",
    "/status",
}
PRODUCTION_ROUTE_TERMS: Final = (
    "rtsp",
    "frame relay",
    "frame_relay",
    "camera stream",
)
FORBIDDEN_IMPORTS: Final = (
    "worker",
    "events.publisher",
    "runtime.edge_worker",
)


def _serving_python_files() -> list[Path]:
    return sorted(path for path in SERVING_ROOT.rglob("*.py") if "__pycache__" not in path.parts)


def _route_descriptor(route: APIRoute) -> str:
    tags = " ".join(str(tag) for tag in route.tags)
    return f"{route.name} {route.path} {tags}".lower()


def _import_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Import):
        return node.names[0].name
    if isinstance(node, ast.ImportFrom):
        return node.module
    return None


def _is_forbidden_import(import_name: str, forbidden: str) -> bool:
    return import_name == forbidden or import_name.startswith(f"{forbidden}.")


def test_serving_app_exposes_only_documented_boundary_routes() -> None:
    app = create_app(lifespan=no_lifespan)
    api_routes = [route for route in app.routes if isinstance(route, APIRoute)]

    exposed_paths = {route.path for route in app.routes}
    production_routes = [
        route.path
        for route in api_routes
        if any(term in _route_descriptor(route) for term in PRODUCTION_ROUTE_TERMS)
    ]

    assert exposed_paths == ALLOWED_PATHS
    assert not production_routes, (
        "Serving must not expose production edge/runtime surfaces: " + ", ".join(production_routes)
    )


def test_debug_predict_window_rejects_raw_frame_or_image_payloads() -> None:
    client = TestClient(create_app(lifespan=no_lifespan))

    for payload in (
        {"frame": [0, 1, 2]},
        {"frames": [[0, 1, 2]]},
        {"image": "data:image/jpeg;base64,AA=="},
        {"image_bytes": "AA=="},
    ):
        response = client.post("/debug/predict/window", json=payload)
        assert response.status_code in {400, 422}


def test_serving_files_do_not_import_edge_worker_or_ingest_runtime() -> None:
    violations: list[str] = []

    for path in _serving_python_files():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            import_name = _import_name(node)
            if import_name is None:
                continue
            for forbidden in FORBIDDEN_IMPORTS:
                if _is_forbidden_import(import_name, forbidden):
                    violations.append(
                        f"{path.relative_to(ML_ROOT)}:{node.lineno}: imports {import_name}"
                    )

    assert not violations, "\n".join(violations)


def test_serving_import_allows_api_owned_backend_ingest_client_but_not_worker() -> None:
    probe = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import sys; import api.main; "
                "forbidden = {'events.publisher', 'worker', 'worker.edge_worker'}; "
                "loaded = sorted(forbidden.intersection(sys.modules)); "
                "print(loaded); raise SystemExit(1 if loaded else 0)"
            ),
        ],
        cwd=ML_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    assert probe.returncode == 0, probe.stdout
