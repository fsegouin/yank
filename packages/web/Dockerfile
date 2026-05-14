# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

# Workspace metadata first (cache-friendly)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/web/package.json packages/web/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter @yank/web...

# Source for the workspace packages web depends on
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/web ./packages/web

RUN pnpm --filter @yank/web build

FROM nginx:alpine AS runtime
COPY packages/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 8080
