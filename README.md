# Yank

> *Pulls the slack out of WhatsApp.*

Yank is a self-hosted, Slack-style PWA that sits in front of a personal WhatsApp account. It is single-user, Tailscale-only, and designed to replace the daily-use WhatsApp Web/Desktop experience with a denser, search-first, channel-and-thread-organised UI — while leaving the user's existing phone number and personal chats untouched on their phone.

- **One user, one tailnet.** No public internet exposure, no SaaS.
- **Multi-device protocol via [Baileys](https://github.com/WhiskeySockets/Baileys).** WhatsApp's Cloud/Business API does not expose personal chats; Baileys is the only viable path.
- **Multi-user-shaped from day one.** Every table carries `user_id` so phase 2 can add auth without a schema migration.

The design is captured in [`docs/superpowers/specs/2026-05-14-yank-design.md`](docs/superpowers/specs/2026-05-14-yank-design.md). Implementation is tracked milestone-by-milestone in [`docs/superpowers/plans/`](docs/superpowers/plans/).

> Use of unofficial WhatsApp client libraries is against WhatsApp's Terms of Service and carries account-ban risk. Yank is intended for personal, single-account use that behaves like a normal Desktop client.

## Architecture

```
                Tailnet only
                     ↓
        ┌────────────────────────┐
        │     web (Vite PWA)     │
        └───────────┬────────────┘
                    │  /api, /events (SSE)
                    ↓
        ┌────────────────────────┐
        │   api (Fastify, SSE)   │
        └──┬───────────────────┬─┘
           │ SQL               │ pub/sub + streams
           ↓                   ↓
      ┌──────────┐        ┌──────────┐        ┌─────────────┐
      │ postgres │        │  redis   │◀──────▶│   daemon    │
      └──────────┘        └──────────┘        │  (Baileys)  │
                                              └─────────────┘
                                                     │
                                              ┌─────────────┐
                                              │ media-worker│
                                              └─────────────┘
```

Three architectural invariants are load-bearing and must not be relaxed:

1. **The daemon talks Redis only.** No inbound HTTP, ever. Commands in via Redis Streams (`commands:user:<userId>`), events out via Redis pub/sub (`events:user:<userId>`).
2. **Multi-user-shaped schema from day one.** Every table carries `user_id`.
3. **Library boundary.** Baileys-specific code lives only in the `daemon` package; `api` and `web` consume the normalised event/command shapes from `@yank/shared`.

## Tech stack

| Layer | Choice |
|---|---|
| WhatsApp connector | Baileys (WhiskeySockets) |
| Daemon / API runtime | Node 22 LTS, TypeScript (ESM, strict) |
| API framework | Fastify 5 |
| Web | Vite 6 + React 19 + TanStack Router + TanStack Query + Zustand |
| Realtime to browser | SSE (Server-Sent Events) |
| Database | Postgres 16 (Drizzle ORM, `drizzle-kit` migrations) |
| Pub/sub & job queue | Redis 7 (Streams for commands, pub/sub for events) |
| Logging | Pino |
| Validation | Zod |
| Tests | Vitest, Playwright, Testcontainers |
| Lint / format | ESLint 9 (flat config), Prettier |
| Package manager | pnpm 9 workspaces |
| Container orchestration | Docker Compose |
| Reverse proxy / TLS | Tailscale Serve (`*.ts.net` MagicDNS) |

## Repository layout

```
packages/
  shared/        @yank/shared       env loader, logger, UUIDv7, Redis channel/stream helpers, event + command schemas
  db/            @yank/db           Drizzle schema (one table per file), postgres-js client, migrations
  daemon/        @yank/daemon       Baileys connector — only package allowed to import Baileys
  api/           @yank/api          Fastify REST + SSE fan-out
  media-worker/  @yank/media-worker downloads + transcodes media referenced by events
  web/           @yank/web          Vite + React PWA
docs/superpowers/
  specs/         design + UI mockups
  plans/         milestone implementation plans (M1 foundation, M2 vertical slice, M3 frontend, …)
scripts/
  deploy.sh      one-shot SSH-based deploy to the NAS
```

## Getting started

### Prerequisites

- **Node 22+** and **pnpm 9** (see the `packageManager` field — `corepack enable` will pick up the right pnpm).
- **Docker** + **Docker Compose v2** for Postgres and Redis.
- A WhatsApp account you can scan a pairing code with from a phone you control. The same account drives both work and personal traffic; the UI separates them.

### 1. Clone and install

```bash
git clone <this repo>
cd yank
pnpm install
```

### 2. Set up env

```bash
cp .env.example .env
```

The defaults in `.env.example` work against the local-dev compose file (`postgres://yank:yank@localhost:5432/yank`, `redis://localhost:6379`). Generate a stable v7 user id and paste it into `YANK_USER_ID`:

```bash
node -e "import('uuid').then(u => console.log(u.v7()))"
```

### 3. Start Postgres + Redis

```bash
docker compose -f docker-compose.local.yml up -d
```

This brings up Postgres on `127.0.0.1:5432` and Redis on `127.0.0.1:6379`.

### 4. Apply database migrations

```bash
pnpm --filter @yank/db drizzle:migrate
```

If you've edited the schema in `packages/db/src/schema/`, regenerate SQL first:

```bash
pnpm --filter @yank/db drizzle:generate
```

### 5. Run the services

In separate terminals:

```bash
pnpm --filter @yank/daemon dev        # connects to WhatsApp via Baileys
pnpm --filter @yank/api dev           # REST + SSE on :3001
pnpm --filter @yank/media-worker dev  # media download/transcode
pnpm --filter @yank/web dev           # Vite dev server
```

On first run the daemon emits a pairing code event; the web setup flow at `/setup` walks you through scanning it from WhatsApp on your phone (Settings → Linked Devices → Link a Device).

### 6. Develop

```bash
pnpm lint        # eslint .
pnpm format      # prettier --write .
pnpm typecheck   # tsc -b across workspaces
pnpm test        # vitest run --passWithNoTests
```

Run a single test file or filter by name:

```bash
pnpm exec vitest run packages/shared/test/env.test.ts
pnpm exec vitest run -t "loadEnv rejects bad URL"
```

> Tests live at `packages/*/test/**/*.test.ts` — co-located `*.test.ts` files next to source are not picked up by `vitest.config.ts`.

### Code conventions

- **ESM only.** With `verbatimModuleSyntax` + `moduleResolution: Bundler`, relative imports must include the `.js` extension even when the source is `.ts` (e.g. `import { foo } from './foo.js'`). Type-only imports must use `import type`.
- TypeScript is strict, with `noUncheckedIndexedAccess` and `noImplicitOverride`.
- Branch names and commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat(web): pairing flow`).
- Workspace packages are referenced as `@yank/shared`, `@yank/db` with `workspace:*`. They are consumed as source — no build step.

## Deploying to a NAS

The production stack lives in `docker-compose.yml` and is intended to run on a Tailscale-joined NAS. Tailscale Serve provides the TLS cert on `https://yank.<tailnet>.ts.net`; nothing is exposed to the public internet.

One-time NAS setup:

1. Install Tailscale and join the tailnet.
2. Install Docker + Docker Compose v2.
3. Clone this repo at `/srv/yank` (or override via `YANK_REMOTE_PATH`).
4. Drop a production `.env` alongside `docker-compose.yml` with a strong `POSTGRES_PASSWORD`.

Then deploy from your workstation:

```bash
./scripts/deploy.sh                # rebuild and restart everything
./scripts/deploy.sh daemon         # rebuild and restart only the daemon
./scripts/deploy.sh daemon api     # multiple specific services
```

The script pushes to `origin`, SSHes into the NAS (`YANK_REMOTE_HOST`, default `nas`), pulls, and runs `docker compose up -d --build`.

## Status

Foundation and vertical slice are landing milestone-by-milestone. See [`docs/superpowers/plans/`](docs/superpowers/plans/) for the current plan; read the relevant plan before making structural changes — it pins file layout and task order.
