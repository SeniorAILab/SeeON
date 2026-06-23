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
COPY ml/contracts ./contracts
COPY ml/domains ./domains
COPY ml/events ./events
COPY ml/features ./features
COPY ml/perception ./perception
COPY ml/runners ./runners
COPY ml/runtime ./runtime
COPY ml/serving ./serving
COPY ml/sources ./sources
COPY ml/worker ./worker
EXPOSE 8000
CMD ["uvicorn", "serving.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS runner
COPY ml/pyproject.toml ml/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-default-groups --no-install-project
COPY ml/contracts ./contracts
COPY ml/domains ./domains
COPY ml/events ./events
COPY ml/features ./features
COPY ml/perception ./perception
COPY ml/runners ./runners
COPY ml/runtime ./runtime
COPY ml/serving ./serving
COPY ml/sources ./sources
COPY ml/worker ./worker
ENV PORT=8000
EXPOSE 8000
CMD ["uvicorn", "serving.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS worker-runner
COPY ml/pyproject.toml ml/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-default-groups --group worker --no-install-project
COPY ml/contracts ./contracts
COPY ml/domains ./domains
COPY ml/events ./events
COPY ml/features ./features
COPY ml/perception ./perception
COPY ml/runners ./runners
COPY ml/runtime ./runtime
COPY ml/sources ./sources
COPY ml/worker ./worker
CMD ["python", "-m", "worker.edge_worker"]
