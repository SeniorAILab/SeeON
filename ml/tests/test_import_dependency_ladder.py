from __future__ import annotations

import ast
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
RANKS = {
    "contracts": 0,
    "features": 0,
    "sources": 1,
    "runners": 1,
    "perception": 2,
    "domains": 3,
    "events": 4,
    "api": 5,
    "demo": 5,
}
TRAINING_ALLOWED = {"training", "contracts", "features", "sources", "runners"}
TRAINING_FORBIDDEN = {
    "core",
    "util",
    "perception",
    "domains",
    "events",
    "api",
    "demo",
}
SERVING_FORBIDDEN = {"training"}
CLEANUP_FORBIDDEN = {"core", "util"}


def _python_files(package: str) -> list[Path]:
    package_dir = ML_ROOT / package
    if not package_dir.exists():
        return []
    return sorted(path for path in package_dir.rglob("*.py") if "__pycache__" not in path.parts)


def _package_parts(path: Path) -> list[str]:
    relative = path.relative_to(ML_ROOT).with_suffix("")
    parts = list(relative.parts)
    if parts[-1] == "__init__":
        parts.pop()
    return parts


def _parse(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _resolve_imported_package(path: Path, node: ast.AST) -> str | None:
    if isinstance(node, ast.Import):
        if not node.names:
            return None
        name = node.names[0].name
        parts = name.split(".")
    elif isinstance(node, ast.ImportFrom):
        module_parts = node.module.split(".") if node.module else []
        if node.level:
            package_parts = _package_parts(path)
            keep = len(package_parts) - node.level + 1
            if keep < 0:
                return None
            parts = package_parts[:keep] + module_parts
        else:
            parts = module_parts
    else:
        return None

    if not parts:
        return None
    if parts[0] == "ml":
        parts = parts[1:]
    return parts[0] if parts else None


def _imports(path: Path) -> list[tuple[int, str]]:
    found: list[tuple[int, str]] = []
    for node in ast.walk(_parse(path)):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".")[0]
                if top == "ml":
                    parts = alias.name.split(".")[1:]
                    if not parts:
                        continue
                    top = parts[0]
                found.append((node.lineno, top))
        elif isinstance(node, ast.ImportFrom):
            top = _resolve_imported_package(path, node)
            if top:
                found.append((node.lineno, top))
    return found


def _format_failures(failures: list[tuple[Path, int, str]]) -> str:
    return "\n".join(
        f"{path.relative_to(ML_ROOT)}:{line}: imports forbidden package {package!r}"
        for path, line, package in failures
    )


def test_training_imports_only_allowed_packages() -> None:
    failures: list[tuple[Path, int, str]] = []
    for path in _python_files("training"):
        for line, package in _imports(path):
            forbidden = package in TRAINING_FORBIDDEN or (
                package in RANKS and package not in TRAINING_ALLOWED
            )
            if forbidden:
                failures.append((path, line, package))
    assert not failures, _format_failures(failures)


def test_serving_never_imports_training() -> None:
    failures: list[tuple[Path, int, str]] = []
    for path in _python_files("api"):
        for line, package in _imports(path):
            if package in SERVING_FORBIDDEN:
                failures.append((path, line, package))
    assert not failures, _format_failures(failures)


def test_dependency_ladder_direction() -> None:
    failures: list[str] = []
    for package, rank in RANKS.items():
        if package in {"api", "demo"}:
            continue
        for path in _python_files(package):
            for line, imported in _imports(path):
                if imported not in RANKS or imported == package:
                    continue
                imported_rank = RANKS[imported]
                if imported_rank > rank:
                    failures.append(
                        f"{path.relative_to(ML_ROOT)}:{line}: "
                        f"{package} (L{rank}) imports {imported} (L{imported_rank})"
                    )
                if {package, imported} == {"domains", "runtime"}:
                    failures.append(
                        f"{path.relative_to(ML_ROOT)}:{line}: "
                        "domains/runtime same-rank imports are banned"
                    )
                if package == "runtime" and imported == "events":
                    failures.append(
                        f"{path.relative_to(ML_ROOT)}:{line}: runtime must not import events"
                    )
    assert not failures, "\n".join(failures)


def test_no_core_util_after_cleanup() -> None:
    assert not (ML_ROOT / "core").exists()
    assert not (ML_ROOT / "util").exists()

    failures: list[tuple[Path, int, str]] = []
    for path in sorted(ML_ROOT.rglob("*.py")):
        if "__pycache__" in path.parts or any(part.startswith(".") for part in path.parts):
            continue
        for line, package in _imports(path):
            if package in CLEANUP_FORBIDDEN:
                failures.append((path, line, package))
    assert not failures, _format_failures(failures)


CONTRACTS_FRAMEWORK_FORBIDDEN = {
    "pydantic",
    "pydantic_settings",
    "fastapi",
    "starlette",
    "uvicorn",
    "cv2",
    "torch",
    "torchvision",
    "ultralytics",
    "sklearn",
    "huggingface_hub",
    "requests",
    "httpx",
}


def test_contracts_is_framework_free() -> None:
    """contracts (L0) stays framework-free: no web/ML/IO framework imports.

    Lightweight typing deps (e.g. numpy for array TypeAliases) are allowed; the
    rule bars heavy frameworks so every higher layer can depend on contracts.
    """
    failures: list[tuple[Path, int, str]] = []
    for path in _python_files("contracts"):
        for lineno, package in _imports(path):
            if package in CONTRACTS_FRAMEWORK_FORBIDDEN:
                failures.append((path, lineno, package))
    assert not failures, _format_failures(failures)


# --- Module-level worker/api boundary guards (ADR-067 hybrid MECE) ---
# These resolve imports to FULL module identity (not just top-level package) so
# that worker-owned modules can be forbidden in `api` by full module identity, and
# block re-export smuggling if a `runtime` package is ever re-introduced.

# `runtime` was removed by the ADR-067 MECE refactor; worker-owned modules now
# live under `worker/`. These pre-move identities stay in the guard so api cannot
# import them and a regression cannot re-introduce a `runtime` package exposing them.
WORKER_OWNED_RUNTIME_MODULES = {
    "runtime.edge_worker_supervisor",
    "runtime.camera_worker",
    "runtime.edge_worker_config",
    "runtime.status_store",
    "runtime.latest_frame",
    "runtime.incident_manager",
    "runtime.scheduler",
    "runtime.fall_window_classifier",
}
DELETED_RUNTIME_MODULES = {"runtime.edge_runtime", "runtime.camera_manager"}
API_FORBIDDEN_RUNTIME_MODULES = WORKER_OWNED_RUNTIME_MODULES | DELETED_RUNTIME_MODULES
WORKER_FORBIDDEN_TOP = {"api", "demo", "training"}


def _normalize_module(name: str) -> str:
    parts = name.split(".")
    if parts and parts[0] == "ml":
        parts = parts[1:]
    return ".".join(parts)


def _runtime_reexport_map() -> dict[str, str]:
    """Symbol re-exported by a `runtime/__init__.py` -> its source module identity.

    The `runtime` package was removed by ADR-067, so this map is normally empty.
    It stays as regression protection: if a `runtime` package is re-introduced and
    re-exports worker-owned modules (relative, absolute, or `from runtime import X`
    submodule forms), api could smuggle worker internals through it — this catches it.
    """
    init_path = ML_ROOT / "runtime" / "__init__.py"
    mapping: dict[str, str] = {}
    if not init_path.exists():
        return mapping
    for node in ast.walk(_parse(init_path)):
        if not isinstance(node, ast.ImportFrom):
            continue
        if node.level == 1:
            base = f"runtime.{node.module}" if node.module else "runtime"
        elif node.level == 0 and node.module:
            base = _normalize_module(node.module)
        else:
            continue
        if base == "runtime":
            for alias in node.names:
                mapping[alias.asname or alias.name] = f"runtime.{alias.name}"
        elif base.startswith("runtime."):
            for alias in node.names:
                mapping[alias.asname or alias.name] = base
    return mapping


def _resolve_module_identities(path: Path, node: ast.AST, reexport: dict[str, str]) -> list[str]:
    if isinstance(node, ast.Import):
        return [_normalize_module(alias.name) for alias in node.names]
    if not isinstance(node, ast.ImportFrom):
        return []
    if node.level:
        package_parts = _package_parts(path)
        keep = len(package_parts) - node.level + 1
        if keep < 0:
            return []
        base = package_parts[:keep] + (node.module.split(".") if node.module else [])
        base_mod = _normalize_module(".".join(base))
    else:
        base_mod = _normalize_module(node.module) if node.module else ""
    if not base_mod:
        return []
    ids: list[str] = []
    for alias in node.names:
        if base_mod == "runtime":
            # `from runtime import X`: X is either a submodule or a re-exported symbol.
            if (ML_ROOT / "runtime" / f"{alias.name}.py").exists():
                ids.append(f"runtime.{alias.name}")
            elif alias.name in reexport:
                ids.append(reexport[alias.name])
            else:
                ids.append(base_mod)
        else:
            ids.append(base_mod)
    return ids


def _module_imports(path: Path, reexport: dict[str, str]) -> list[tuple[int, str]]:
    found: list[tuple[int, str]] = []
    for node in ast.walk(_parse(path)):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for ident in _resolve_module_identities(path, node, reexport):
                found.append((node.lineno, ident))
    return found


def test_api_does_not_import_worker_or_worker_owned_runtime() -> None:
    reexport = _runtime_reexport_map()
    failures: list[str] = []
    for path in _python_files("api"):
        for line, ident in _module_imports(path, reexport):
            top = ident.split(".")[0]
            if top == "worker":
                failures.append(
                    f"{path.relative_to(ML_ROOT)}:{line}: api imports worker module {ident!r}"
                )
            elif ident in API_FORBIDDEN_RUNTIME_MODULES:
                failures.append(
                    f"{path.relative_to(ML_ROOT)}:{line}: "
                    f"api imports worker-owned runtime module {ident!r}"
                )
    assert not failures, "\n".join(failures)


def test_worker_does_not_import_api_demo_training() -> None:
    failures: list[str] = []
    for path in _python_files("worker"):
        for line, ident in _module_imports(path, {}):
            if ident.split(".")[0] in WORKER_FORBIDDEN_TOP:
                failures.append(
                    f"{path.relative_to(ML_ROOT)}:{line}: worker imports forbidden {ident!r}"
                )
    assert not failures, "\n".join(failures)


def test_runtime_init_does_not_reexport_worker_owned_modules() -> None:
    reexport = _runtime_reexport_map()
    failures = [
        f"runtime/__init__.py re-exports {symbol!r} from worker-owned/deleted module {source!r}"
        for symbol, source in sorted(reexport.items())
        if source in API_FORBIDDEN_RUNTIME_MODULES
    ]
    assert not failures, "\n".join(failures)


def test_worker_owned_runtime_modules_located_under_worker() -> None:
    failures: list[str] = []
    for module in sorted(WORKER_OWNED_RUNTIME_MODULES):
        name = module.split(".", 1)[1]
        if (ML_ROOT / "runtime" / f"{name}.py").exists():
            failures.append(f"{module} still at runtime/{name}.py; must move to worker/{name}.py")
        if not (ML_ROOT / "worker" / f"{name}.py").exists():
            failures.append(f"worker/{name}.py missing; worker-owned module {module} not relocated")
    assert not failures, "\n".join(failures)
