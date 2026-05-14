# syntax=docker/dockerfile:1.7
FROM node:22-alpine
WORKDIR /app
RUN corepack enable && addgroup -S app && adduser -S app -G app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/daemon/package.json packages/daemon/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY packages/daemon ./packages/daemon

ENV NODE_ENV=production
USER app
CMD ["pnpm", "--filter", "@yank/daemon", "start"]
