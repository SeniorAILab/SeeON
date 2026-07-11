# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@10.32.1 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY front/package.json ./front/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --filter front... --frozen-lockfile

FROM deps AS dev
COPY front ./front
WORKDIR /app/front
EXPOSE 3000
CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", "3000"]

FROM deps AS build
COPY front ./front
# Browser-baked build args. Same-origin deployment: the browser calls the relative
# /api/v1 path that nginx reverse-proxies to the backend, so no absolute API host is baked.
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG NODE_OPTIONS=--max-old-space-size=1536
ENV NODE_OPTIONS=$NODE_OPTIONS
RUN pnpm --filter front build

FROM nginx:1.27-alpine AS runner
# Replace the stock default server with the SPA + reverse-proxy config.
COPY front/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/front/dist /usr/share/nginx/html
ARG DEPLOY_SHA
RUN printf '%s\n' "$DEPLOY_SHA" | grep -E '^[0-9a-f]{40}$' > /usr/share/nginx/html/version.txt
EXPOSE 3000
