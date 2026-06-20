"""Compatibility shim for the serving fall model.

The real sklearn fall runner lives in ``runners.sklearn_fall`` (ADR-057).
"""

from __future__ import annotations

import sys

from runners import sklearn_fall as _sklearn_fall
from runners.sklearn_fall import *  # noqa: F403

sys.modules[__name__] = _sklearn_fall
