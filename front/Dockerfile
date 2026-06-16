# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY front/package.json ./front/package.json
RUN pnpm install --filter front... --frozen-lockfile

FROM deps AS dev
COPY . .
WORKDIR /app/front
ENV NODE_ENV=development
ENV PORT=3000
EXPOSE 3000
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]

FROM deps AS build
COPY . .
RUN pnpm --filter front build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/front/.next/standalone ./
COPY --from=build /app/front/.next/static ./front/.next/static
COPY --from=build /app/front/public ./front/public
EXPOSE 3000
# Next standalone in a pnpm workspace emits the server entry under front/.
CMD ["node", "front/server.js"]
