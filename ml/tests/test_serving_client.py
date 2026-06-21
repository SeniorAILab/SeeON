from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import numpy as np
import pytest

from serving.client import ServingFallClassifier, ServingPredictError


class _StubServing(BaseHTTPRequestHandler):
    """Returns a fixed fall_probability; records the window it received."""

    fall_probability = 0.8
    status = 200
    received_windows: list[list[list[float]]] = []

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers["Content-Length"])
        body = json.loads(self.rfile.read(length).decode("utf-8"))
        self.__class__.received_windows.append(body["window"])
        self.send_response(self.__class__.status)
        if self.__class__.status == 200:
            payload = json.dumps(
                {
                    "model": "random-forest",
                    "version": "test",
                    "fall_probability": self.__class__.fall_probability,
                    "operating_threshold": 0.09,
                    "is_fall": self.__class__.fall_probability >= 0.09,
                }
            ).encode("utf-8")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(payload)
        else:
            self.end_headers()
            self.wfile.write(b'{"detail":"bad window"}')

    def log_message(self, _format: str, *args: object) -> None:
        return


@pytest.fixture
def serving():
    _StubServing.received_windows = []
    _StubServing.status = 200
    server = ThreadingHTTPServer(("127.0.0.1", 0), _StubServing)
    Thread(target=server.serve_forever, daemon=True).start()
    host, port = server.server_address
    try:
        yield f"http://{host}:{port}"
    finally:
        server.shutdown()


def test_predict_proba_posts_window_and_parses_probability(serving):
    clf = ServingFallClassifier(serving)
    X = np.zeros((2, 30, 51), dtype=np.float32)
    probs = clf.predict_proba(X)

    assert probs.shape == (2, 2)
    # column 1 = fall probability from serving; column 0 = 1 - p
    assert probs[:, 1] == pytest.approx(0.8)
    assert probs[:, 0] == pytest.approx(0.2)
    # one POST per window, each carrying the raw [W][51] frames
    assert len(_StubServing.received_windows) == 2
    assert len(_StubServing.received_windows[0]) == 30
    assert len(_StubServing.received_windows[0][0]) == 51


def test_http_error_fails_loud(serving):
    _StubServing.status = 400
    clf = ServingFallClassifier(serving)
    with pytest.raises(ServingPredictError):
        clf.predict_proba(np.zeros((1, 30, 51), dtype=np.float32))


def test_unreachable_fails_loud():
    # nothing listening on this port → fail loud, no silent fallback
    clf = ServingFallClassifier("http://127.0.0.1:1", timeout_sec=0.5)
    with pytest.raises(ServingPredictError):
        clf.predict_proba(np.zeros((1, 30, 51), dtype=np.float32))


def test_rejects_wrong_shape(serving):
    clf = ServingFallClassifier(serving)
    with pytest.raises(ValueError):
        clf.predict_proba(np.zeros((2, 45), dtype=np.float32))
