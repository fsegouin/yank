# syntax=docker/dockerfile:1.7
FROM node:22-alpine
WORKDIR /app
RUN corepack enable && addgroup -S app && adduser -S app -G app

# Install deps first for cache friendliness
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/api/package.json packages/api/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# Source
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY packages/api ./packages/api

ENV NODE_ENV=production
USER app
EXPOSE 3001
CMD ["pnpm", "--filter", "@yank/api", "start"]
