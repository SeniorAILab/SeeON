from __future__ import annotations

import ast
from pathlib import Path


def _sources_python_files() -> list[Path]:
    sources_dir = Path(__file__).parent.parent / "sources"
    return list(sources_dir.rglob("*.py"))


def _imports_demo(source: str) -> list[str]:
    """Return a list of import statements that reference the 'demo' package."""
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


def test_sources_has_no_demo_imports() -> None:
    files = _sources_python_files()
    assert files, "Expected at least one .py file under ml/sources/"

    all_violations: dict[str, list[str]] = {}
    for path in files:
        source = path.read_text(encoding="utf-8")
        hits = _imports_demo(source)
        if hits:
            all_violations[str(path)] = hits

    assert not all_violations, "ml/sources/ must not import from demo/. Found:\n" + "\n".join(
        f"  {f}: {vs}" for f, vs in all_violations.items()
    )
