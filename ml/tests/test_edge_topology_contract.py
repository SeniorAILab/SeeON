from __future__ import annotations

import json
from pathlib import Path
from typing import Final

import yaml

REPO_ROOT: Final = Path(__file__).resolve().parents[2]
HOST_COMPOSE_FILES: Final = ("compose.yaml", "compose.prod.yaml")
EDGE_COMPOSE_FILE: Final = "compose.edge.yaml"
EDGE_SERVICES: Final = {
    "ml-api": "ml/Dockerfile.api",
    "ml-worker": "ml/Dockerfile.worker",
}


class ComposeLoader(yaml.SafeLoader):
    pass


def _compose_tag(
    loader: ComposeLoader,
    tag_suffix: str,
    node: yaml.Node,
) -> str | list[str] | dict[str, str] | None:
    del tag_suffix
    if isinstance(node, yaml.ScalarNode):
        return loader.construct_scalar(node)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node)
    if isinstance(node, yaml.MappingNode):
        return loader.construct_mapping(node)
    return None


ComposeLoader.add_multi_constructor("!", _compose_tag)


def _compose_services(compose_file: str) -> dict[str, dict[str, str]]:
    compose = yaml.load(
        (REPO_ROOT / compose_file).read_text(encoding="utf-8"),
        Loader=ComposeLoader,
    )
    return compose.get("services", {})


def test_host_compose_services_are_ml_free() -> None:
    failures: list[str] = []
    for compose_file in HOST_COMPOSE_FILES:
        services = _compose_services(compose_file)
        for service_name, service in services.items():
            build = service.get("build", {})
            dockerfile = build.get("dockerfile", "") if isinstance(build, dict) else ""
            image = service.get("image", "")
            fields = (service_name, dockerfile, image)
            if any("ml" in field.lower() for field in fields):
                failures.append(f"{compose_file}:{service_name} contains ML topology: {fields}")

    assert not failures, "\n".join(failures)


def test_edge_compose_contains_exactly_ml_edge_api_and_worker() -> None:
    services = _compose_services(EDGE_COMPOSE_FILE)

    assert set(services) == set(EDGE_SERVICES), sorted(services)


def test_edge_services_pin_release_images_with_dockerfiles_for_build() -> None:
    services = _compose_services(EDGE_COMPOSE_FILE)
    expected_image_env = {
        "ml-api": "ML_API_IMAGE",
        "ml-worker": "ML_WORKER_IMAGE",
    }

    failures: list[str] = []
    for service_name, expected_dockerfile in EDGE_SERVICES.items():
        service = services[service_name]
        image = str(service.get("image", ""))
        if expected_image_env[service_name] not in image:
            failures.append(
                f"{service_name} must pin {expected_image_env[service_name]}, "
                f"image is {image!r}"
            )
        if service.get("pull_policy") != "always":
            failures.append(
                f"{service_name} must set pull_policy: always for pinned release images"
            )
        if not (REPO_ROOT / expected_dockerfile).exists():
            failures.append(
                f"{expected_dockerfile} must exist for the release image build"
            )

    assert not failures, "\n".join(failures)


def test_legacy_multi_target_ml_dockerfile_is_removed() -> None:
    assert not (REPO_ROOT / "ml/Dockerfile").exists()


def test_edge_api_host_port_is_loopback_only() -> None:
    services = _compose_services(EDGE_COMPOSE_FILE)
    ports = services["ml-api"].get("ports", [])

    assert ports == ["127.0.0.1:${ML_SERVING_PORT:-8000}:8000"]


def test_native_ml_dev_server_binds_loopback_only() -> None:
    package_json = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))
    assert package_json["scripts"]["dev:ml"] == "pnpm dev:ml:api"
    command = package_json["scripts"]["dev:ml:api"]

    assert "--host 127.0.0.1" in command
    assert "--host 0.0.0.0" not in command


def test_edge_service_builds_do_not_depend_on_dockerfile_targets() -> None:
    services = _compose_services(EDGE_COMPOSE_FILE)

    failures: list[str] = []
    for service_name in EDGE_SERVICES:
        build = services[service_name].get("build", {})
        if isinstance(build, dict) and "target" in build:
            failures.append(f"{service_name} build target is {build['target']!r}")

    assert not failures, "\n".join(failures)


def test_api_image_does_not_copy_worker_package() -> None:
    dockerfile = (REPO_ROOT / "ml/Dockerfile.api").read_text(encoding="utf-8")

    assert "COPY ml/worker" not in dockerfile


def test_rtsp_script_surface_uses_reusable_worker_names() -> None:
    scripts_dir = REPO_ROOT / "scripts"
    smoke_script = scripts_dir / "ml-worker-rtsp-smoke.sh"

    assert (scripts_dir / "ml-worker-nursing-home-backend-e2e.sh").exists()
    assert smoke_script.exists()
    assert not (scripts_dir / "ml-edge-four-rtsp-smoke.sh").exists()
    assert not (scripts_dir / "ml-edge-four-mock-rtsp-e2e.sh").exists()
    assert not (scripts_dir / "ml-edge-four-mock-rtsp-ingest-e2e.sh").exists()

    smoke_source = smoke_script.read_text(encoding="utf-8")
    e2e_source = (scripts_dir / "ml-worker-nursing-home-backend-e2e.sh").read_text(
        encoding="utf-8"
    )
    assert "load_edge_worker_config" in smoke_source
    assert "expected exactly 4 cameras" not in smoke_source
    assert "ml-edge-four" not in smoke_source
    assert "NURSING_HOME_RTSP_URL" in e2e_source
    assert "rtsp-loop-video.sh" not in e2e_source


def test_repo_does_not_own_rtsp_generation_surface() -> None:
    scripts_dir = REPO_ROOT / "scripts"
    package_json = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))

    assert not (scripts_dir / "rtsp-loop-video.sh").exists()
    assert "dev:rtsp" not in package_json["scripts"]

    active_surface = [
        "\n".join(package_json["scripts"].values()),
        *[
            script.read_text(encoding="utf-8")
            for script in sorted(scripts_dir.glob("*.sh"))
        ],
    ]
    active_text = "\n".join(active_surface)

    forbidden_generation_terms = (
        "rtsp-loop-video",
        "mediamtx",
        "stream_loop",
        "-f rtsp",
        "NURSING_HOME_FALL_VIDEO",
        "RTSP_FIXTURE_IMAGE",
        "RTSP_FIXTURE_WAIT_SECONDS",
        "E2E_RTSP_STREAM_NAME",
        "RTSP_DOCKER_NETWORK",
        "RTSP_NETWORK_ALIAS",
        "RTSP_HOST_PORT",
        "RTSP_DETACH",
        "RTSP_READY_WAIT_SECONDS",
    )
    failures = [
        term for term in forbidden_generation_terms if term.lower() in active_text.lower()
    ]

    assert not failures, f"RTSP generation terms remain in active surface: {failures}"


def test_worker_imports_no_api_or_serving_packages() -> None:
    source = (REPO_ROOT / "ml/worker/edge_worker.py").read_text(encoding="utf-8")

    assert "from api" not in source
    assert "import api" not in source
    assert "from serving" not in source
    assert "import serving" not in source


def test_edge_compose_keeps_backend_event_url_on_api_only() -> None:
    services = _compose_services(EDGE_COMPOSE_FILE)
    api_env = services["ml-api"].get("environment", {})
    worker_env = services["ml-worker"].get("environment", {})

    assert "API_BACKEND_EVENTS_URL" in api_env
    assert "API_BACKEND_" + "ALERT_URL" not in api_env
    assert "API_BACKEND_" + "HEARTBEAT_URL" not in api_env
    assert "API_" + "INGEST_" + "KEY_ID" not in api_env
    assert "API_" + "INGEST_" + "SECRET" not in api_env
    assert "API_EDGE_RELAY_TOKEN" in api_env
    assert worker_env["RELAY_URL"] == "http://ml-api:8000"
    assert "RELAY_TOKEN" in worker_env
    assert "API_BACKEND_EVENTS_URL" not in worker_env
    assert "API_" + "INGEST_" + "KEY_ID" not in worker_env
    assert "API_" + "INGEST_" + "SECRET" not in worker_env
