from __future__ import annotations

import ast
import subprocess
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_ROOT.parent
OLD_ROOTS = {"runners", "sources", "perception", "domains"}
MOVED_PACKAGES = ("runners", "sources", "perception", "domains")
INTERNAL_TOPS = {
    "api",
    "contracts",
    "demo",
    "events",
    "features",
    "training",
    "worker",
    *OLD_ROOTS,
}

API_ALLOWED = {"api", "contracts", "events.edge_ingest_client"}
WORKER_ALLOWED = {"worker", "contracts", "features", "events"}
TRAINING_ALLOWED = {"training", "contracts", "features"}
DEMO_ALLOWED = {"demo", "contracts", "features", "worker", "events", "training"}
LOWER_LAYER_ALLOWED = {
    "contracts": {"contracts"},
    "features": {"contracts", "features"},
}
EXPECTED_RUNNER_CONTRACT_SYMBOLS = {
    "RunnerResult",
    "PoseRunnerResult",
    "PersonRunnerResult",
    "BedRunnerResult",
    "DetectionRunnerResult",
    "pose_result",
    "person_result",
    "bed_result",
    "detection_result",
}
EXPECTED_TRACKER_CONTRACT_SYMBOLS = {"TrackerProtocol"}
EXPECTED_WORKER_CONFIG_CONTRACT_SYMBOLS = {
    "WORKER_CONFIG_PATH",
    "WORKER_RESTART_PATH",
    "CONFIG_VERSION_KEY",
    "RESTART_EPOCH_KEY",
    "PulledCameraConfig",
    "PulledNightWindow",
    "PulledWorkerConfig",
}




def _tracked_python_files() -> list[Path]:
    output = subprocess.check_output(
        ["git", "ls-files", "ml/**/*.py"],
        cwd=REPO_ROOT,
        text=True,
    )
    return [REPO_ROOT / line for line in output.splitlines()]


def _module_parts(path: Path) -> list[str]:
    relative = path.relative_to(ML_ROOT).with_suffix("")
    return [part for part in relative.parts if part != "__init__"]


def _top_package(path: Path) -> str | None:
    parts = _module_parts(path)
    return parts[0] if parts else None


def _parse(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _absolute_module(path: Path, node: ast.ImportFrom) -> str | None:
    if node.level == 0:
        return node.module

    parts = _module_parts(path)
    if not parts:
        return node.module

    if path.name == "__init__.py":
        package_parts = parts
    else:
        package_parts = parts[:-1]

    keep = len(package_parts) - node.level + 1
    if keep < 0:
        return node.module

    base = package_parts[:keep]
    if node.module:
        base.extend(node.module.split("."))
    return ".".join(base) if base else None


def _import_modules(path: Path) -> list[tuple[int, str]]:
    imports: list[tuple[int, str]] = []
    for node in ast.walk(_parse(path)):
        if isinstance(node, ast.Import):
            imports.extend((node.lineno, alias.name) for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            module = _absolute_module(path, node)
            if module:
                imports.append((node.lineno, module))
    return imports


def _is_internal(module: str) -> bool:
    return module.split(".", 1)[0] in INTERNAL_TOPS


def _allowed_for(top: str, module: str) -> bool:
    if top == "api":
        return module in API_ALLOWED or any(
            module.startswith(f"{allowed}.") for allowed in API_ALLOWED
        )
    if top == "worker":
        return module.split(".", 1)[0] in WORKER_ALLOWED
    if top == "training":
        return module.split(".", 1)[0] in TRAINING_ALLOWED
    if top == "demo":
        return module.split(".", 1)[0] in DEMO_ALLOWED
    if top in LOWER_LAYER_ALLOWED:
        return module.split(".", 1)[0] in LOWER_LAYER_ALLOWED[top]
    return True


def _format(failures: list[tuple[Path, int, str]]) -> str:
    return "\n".join(
        f"{path.relative_to(ML_ROOT)}:{line}: {module}" for path, line, module in failures
    )


def test_old_live_ml_roots_are_not_imported() -> None:
    failures: list[tuple[Path, int, str]] = []
    for path in _tracked_python_files():
        for line, module in _import_modules(path):
            if module.split(".", 1)[0] in OLD_ROOTS:
                failures.append((path, line, module))

    assert not failures, _format(failures)


def test_live_ml_packages_were_moved_under_worker() -> None:
    missing: list[str] = []
    unexpected: list[str] = []
    for package in MOVED_PACKAGES:
        old_path = ML_ROOT / package
        new_path = ML_ROOT / "worker" / package
        if old_path.exists():
            unexpected.append(str(old_path.relative_to(ML_ROOT)))
        if not new_path.exists():
            missing.append(str(new_path.relative_to(ML_ROOT)))

    assert not unexpected, "old top-level package dirs still exist: " + ", ".join(unexpected)
    assert not missing, "worker package dirs are missing: " + ", ".join(missing)


def test_module_level_import_allowlist() -> None:
    failures: list[tuple[Path, int, str]] = []
    for path in _tracked_python_files():
        top = _top_package(path)
        if top not in {"api", "worker", "training", "demo", "contracts", "features"}:
            continue
        for line, module in _import_modules(path):
            if _is_internal(module) and not _allowed_for(top, module):
                failures.append((path, line, module))

    assert not failures, _format(failures)
def test_runner_contract_exports_tagged_result_symbols() -> None:
    namespace: dict[str, object] = {}
    exec((ML_ROOT / "contracts" / "runner.py").read_text(encoding="utf-8"), namespace)
    exported = set(namespace["__all__"])
    assert EXPECTED_RUNNER_CONTRACT_SYMBOLS <= exported

def test_tracker_contract_exports_protocol_symbol() -> None:
    namespace: dict[str, object] = {}
    exec((ML_ROOT / "contracts" / "tracker.py").read_text(encoding="utf-8"), namespace)
    exported = set(namespace["__all__"])
    assert EXPECTED_TRACKER_CONTRACT_SYMBOLS <= exported


def test_worker_config_contract_exports_pull_symbols() -> None:
    namespace: dict[str, object] = {}
    exec(
        (ML_ROOT / "contracts" / "worker_config.py").read_text(encoding="utf-8"),
        namespace,
    )
    exported = set(namespace["__all__"])
    assert EXPECTED_WORKER_CONFIG_CONTRACT_SYMBOLS <= exported



def _imported_roots(node: ast.AST) -> set[str]:
    roots: set[str] = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Import):
            roots.update(alias.name.split(".", 1)[0] for alias in child.names)
        elif isinstance(child, ast.ImportFrom):
            if child.module:
                roots.add(child.module.split(".", 1)[0])
    return roots


def _has_old_worker_dual_import(handler: ast.ExceptHandler) -> bool:
    roots = _imported_roots(handler)
    return "worker" in roots and bool(roots & OLD_ROOTS)


def test_no_old_root_worker_dual_import_fallbacks() -> None:
    failures: list[str] = []
    for path in _tracked_python_files():
        for node in ast.walk(_parse(path)):
            if not isinstance(node, ast.Try):
                continue
            body_roots = _imported_roots(ast.Module(body=node.body, type_ignores=[]))
            for handler in node.handlers:
                handler_roots = _imported_roots(ast.Module(body=handler.body, type_ignores=[]))
                if ("worker" in body_roots and handler_roots & OLD_ROOTS) or (
                    body_roots & OLD_ROOTS and "worker" in handler_roots
                ) or _has_old_worker_dual_import(handler):
                    failures.append(f"{path.relative_to(ML_ROOT)}:{node.lineno}")

    assert not failures, (
        "try/except ImportError dual old-root/worker imports found:\n"
        + "\n".join(failures)
    )
