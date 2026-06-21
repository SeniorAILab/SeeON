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
    "runtime": 3,
    "events": 4,
    "serving": 5,
    "demo": 5,
}
TRAINING_ALLOWED = {"training", "contracts", "features", "sources", "runners"}
TRAINING_FORBIDDEN = {
    "core",
    "util",
    "perception",
    "domains",
    "runtime",
    "events",
    "serving",
    "demo",
}
SERVING_FORBIDDEN = {"training"}
CLEANUP_FORBIDDEN = {"core", "util"}


def _python_files(package: str) -> list[Path]:
    package_dir = ML_ROOT / package
    if not package_dir.exists():
        return []
    return sorted(
        path
        for path in package_dir.rglob("*.py")
        if "__pycache__" not in path.parts
    )


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
    for path in _python_files("serving"):
        for line, package in _imports(path):
            if package in SERVING_FORBIDDEN:
                failures.append((path, line, package))
    assert not failures, _format_failures(failures)


def test_dependency_ladder_direction() -> None:
    failures: list[str] = []
    for package, rank in RANKS.items():
        if package in {"serving", "demo"}:
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
