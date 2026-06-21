"""Serving route modules."""

from serving.routes import debug, health, models, status

__all__ = ["debug", "health", "models", "status"]
