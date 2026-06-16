# syntax=docker/dockerfile:1.7

FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS base

ENV UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:${PATH}"

WORKDIR /app

FROM base AS deps
COPY ml/pyproject.toml ml/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-default-groups --no-install-project

FROM deps AS dev
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project
COPY ml/serving ./serving
EXPOSE 8000
CMD ["uvicorn", "serving.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS runner
COPY ml/pyproject.toml ml/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-default-groups --no-install-project
COPY ml/serving ./serving
ENV PORT=8000
EXPOSE 8000
CMD ["uvicorn", "serving.main:app", "--host", "0.0.0.0", "--port", "8000"]
