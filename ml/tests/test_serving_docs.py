from __future__ import annotations

import pytest

from serving.main import (
    STATIC_DIR,
    app,
    custom_swagger_ui_html,
    swagger_ui_redirect,
)


def test_default_cdn_docs_disabled():
    # Auto /docs (CDN-backed) is off; we serve a custom one from vendored assets.
    assert app.docs_url is None


def test_swagger_assets_are_vendored():
    js = STATIC_DIR / "swagger-ui-bundle.js"
    css = STATIC_DIR / "swagger-ui.css"
    assert js.is_file(), f"missing vendored {js}"
    assert css.is_file(), f"missing vendored {css}"
    # sanity: real bundle/css, not empty placeholders, and under the 5 MB git-guard cap.
    assert 100_000 < js.stat().st_size < 5_000_000
    assert 10_000 < css.stat().st_size < 5_000_000


def test_docs_html_points_at_self_hosted_assets():
    res = custom_swagger_ui_html()
    assert res.status_code == 200
    body = res.body.decode()
    assert "/static/swagger-ui-bundle.js" in body
    assert "/static/swagger-ui.css" in body
    # the whole point: no external CDN dependency.
    assert "cdn.jsdelivr.net" not in body
    assert "unpkg.com" not in body


def test_oauth2_redirect_route_renders():
    res = swagger_ui_redirect()
    assert res.status_code == 200
    assert b"oauth2" in res.body.lower()


def test_static_assets_served_over_http():
    # Stronger end-to-end check when httpx is available: /docs renders and the
    # vendored bundle is actually served from /static (no network).
    httpx = pytest.importorskip("httpx")
    from fastapi.testclient import TestClient

    del httpx  # only needed to gate the import above
    with TestClient(app) as client:
        docs = client.get("/docs")
        assert docs.status_code == 200
        assert "/static/swagger-ui-bundle.js" in docs.text

        bundle = client.get("/static/swagger-ui-bundle.js")
        assert bundle.status_code == 200
        assert bundle.headers["content-type"].startswith(
            ("application/javascript", "text/javascript")
        )
