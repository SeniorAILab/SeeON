"""Compatibility shim for the L1 sources registry."""

from __future__ import annotations

from sources.registry import (
    DEFAULT_MAX_DURATION_SEC,
    DEFAULT_SOURCE_BASE_DIR,
    LIVE_SCHEMES,
    SUPPORTED_EXTENSIONS,
    SUPPORTED_MIME_PREFIXES,
    ResolvedSource,
    SourceRecord,
    SourceRegistry,
    SourceRegistryError,
    get_source_registry,
)

__all__ = [
    "SUPPORTED_EXTENSIONS",
    "SUPPORTED_MIME_PREFIXES",
    "DEFAULT_MAX_DURATION_SEC",
    "DEFAULT_SOURCE_BASE_DIR",
    "LIVE_SCHEMES",
    "SourceRegistryError",
    "SourceRecord",
    "ResolvedSource",
    "SourceRegistry",
    "get_source_registry",
]
