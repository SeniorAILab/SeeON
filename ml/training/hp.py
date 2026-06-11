"""Receiver side of the harness HP plumbing — ``HARNESS_HP_*`` env overrides.

The experiment harness (``experiments.harness``) samples hyper-parameters with
Optuna and forwards them to training subprocesses as ``HARNESS_HP_<NAME>``
environment variables.  Model factories call the typed getters below so that:

* with no env vars set, every factory builds the exact same default
  configuration as before the wiring (zero behavioral drift), and
* inside a harness trial subprocess, the sampled values take effect.

Explicit constructor kwargs always win over env vars — the env is only the
default-of-last-resort, which keeps ``load()``-time reconstruction (driven by
``arch.json``, see ``training.models.base``) independent of the environment.
"""

from __future__ import annotations

import os

_PREFIX = "HARNESS_HP_"


def _raw(name: str) -> str | None:
    return os.environ.get(_PREFIX + name.upper())


def hp_int(name: str, default: int) -> int:
    """Return ``HARNESS_HP_<NAME>`` as int, or *default* when unset."""
    v = _raw(name)
    return default if v is None else int(v)


def hp_float(name: str, default: float) -> float:
    """Return ``HARNESS_HP_<NAME>`` as float, or *default* when unset."""
    v = _raw(name)
    return default if v is None else float(v)


def hp_str(name: str, default: str) -> str:
    """Return ``HARNESS_HP_<NAME>`` verbatim, or *default* when unset."""
    v = _raw(name)
    return default if v is None else v


def hp_opt_int(name: str) -> int | None:
    """Return ``HARNESS_HP_<NAME>`` as int, or ``None`` when unset.

    For params whose library default is not an int (e.g. RF ``max_depth=None``).
    """
    v = _raw(name)
    return None if v is None else int(v)


def hp_opt_float(name: str) -> float | None:
    """Return ``HARNESS_HP_<NAME>`` as float, or ``None`` when unset.

    For params whose library default is not a float (e.g. SVC ``gamma="scale"``).
    """
    v = _raw(name)
    return None if v is None else float(v)


def active_hps() -> dict[str, str]:
    """Return all currently-set ``HARNESS_HP_*`` vars (for logging)."""
    return {
        k[len(_PREFIX) :].lower(): v
        for k, v in os.environ.items()
        if k.startswith(_PREFIX)
    }
