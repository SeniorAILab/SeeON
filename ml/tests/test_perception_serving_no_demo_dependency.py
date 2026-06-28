from __future__ import annotations

import ast
from pathlib import Path


def _python_files(package: str) -> list[Path]:
    package_dir = Path(__file__).parent.parent / package
    return list(package_dir.rglob("*.py"))


def _imports_demo(source: str) -> list[str]:
    """Return import statements that reference the 'demo' package."""
    tree = ast.parse(source)
    violations: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "demo" or alias.name.startswith("demo."):
                    violations.append(f"import {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if module == "demo" or module.startswith("demo."):
                violations.append(f"from {module} import ...")
    return violations


def _assert_no_demo_imports(package: str) -> None:
    files = _python_files(package)
    assert files, f"Expected at least one .py file under ml/{package}/"

    all_violations: dict[str, list[str]] = {}
    for path in files:
        hits = _imports_demo(path.read_text(encoding="utf-8"))
        if hits:
            all_violations[str(path)] = hits

    assert not all_violations, f"ml/{package}/ must not import from demo/. Found:\n" + "\n".join(
        f"  {f}: {vs}" for f, vs in all_violations.items()
    )


def test_perception_has_no_demo_imports() -> None:
    _assert_no_demo_imports("worker/perception")


def test_serving_has_no_demo_imports() -> None:
    _assert_no_demo_imports("api")
