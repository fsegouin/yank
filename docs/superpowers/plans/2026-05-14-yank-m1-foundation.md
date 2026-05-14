# Yank — M1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the Yank monorepo, database schema, container orchestration, and CI so that all subsequent milestones (M2 onward) can build app features on top without revisiting foundation work.

**Architecture:** A pnpm workspace with two library packages (`shared`, `db`) and four service packages (`daemon`, `api`, `web`, `media-worker`). A single `docker-compose.yml` runs the full stack on the NAS via `build:` directives (no registry — git pull + rebuild on the NAS). A `docker-compose.local.yml` provides Postgres+Redis only for clean-room/offline dev. Everyday dev runs `api`/`web` on the laptop pointing at the NAS database over Tailscale.

**Tech Stack:** Node 22 LTS, pnpm 9, TypeScript 5.6 (strict), Drizzle ORM + drizzle-kit, Postgres 16, Redis 7, Fastify 5 (api), Vite 6 + React 19 (web), Pino (logging), Zod (validation), Vitest + Testcontainers (tests), ESLint flat config + Prettier (lint/format), GitHub Actions (CI).

**End state when M1 is complete:**

- `pnpm install` from clean state succeeds.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.
- `docker compose -f docker-compose.local.yml up -d` brings up Postgres + Redis; migrations apply against them.
- `docker compose up -d --build` brings up the full 6-service stack (postgres, redis, migrate, daemon, api, web, media-worker), all `healthy`, with the api responding `200` on `/healthz` and the web serving a static "hello from Yank" page.
- GitHub Actions runs lint + type + test on every push.
- `scripts/deploy.sh` exists and can deploy to a NAS host over SSH.

---

## File structure introduced in M1

```
yank/
├── .env.example
├── .gitignore                       (exists)
├── .nvmrc                           Node version pin
├── .prettierrc
├── README.md                        Short project intro
├── eslint.config.js                 Flat ESLint config
├── package.json                     Root, workspace config + scripts
├── pnpm-workspace.yaml              Workspace member globs
├── tsconfig.base.json               Shared TS settings
├── vitest.config.ts                 Workspace-wide test config
├── docker-compose.yml               Full prod stack
├── docker-compose.local.yml         Postgres + Redis only
├── scripts/
│   └── deploy.sh                    NAS deploy wrapper
├── .github/
│   └── workflows/
│       └── ci.yml                   Lint + type + test on push/PR
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts             Re-exports
│   │   │   ├── env.ts               Zod-validated env var loader
│   │   │   ├── logger.ts            Pino factory
│   │   │   ├── ids.ts               UUIDv7 helper
│   │   │   ├── time.ts              Timestamp helpers
│   │   │   └── events.ts            Redis event/command Zod schemas
│   │   └── test/
│   │       ├── env.test.ts
│   │       ├── ids.test.ts
│   │       └── events.test.ts
│   ├── db/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts
│   │   ├── src/
│   │   │   ├── index.ts             Client factory
│   │   │   ├── migrate.ts           Programmatic migrator entry point
│   │   │   └── schema/
│   │   │       ├── index.ts         Re-exports all tables
│   │   │       ├── users.ts
│   │   │       ├── whatsapp-sessions.ts
│   │   │       ├── push-subscriptions.ts
│   │   │       ├── contacts.ts
│   │   │       ├── chats.ts
│   │   │       ├── chat-assignments.ts
│   │   │       ├── group-members.ts
│   │   │       ├── messages.ts
│   │   │       ├── message-media.ts
│   │   │       ├── reactions.ts
│   │   │       ├── read-state.ts
│   │   │       ├── stars.ts
│   │   │       └── directory-entries.ts
│   │   ├── drizzle/                 Generated migration SQL (committed)
│   │   └── test/
│   │       └── migrations.test.ts   Testcontainers
│   ├── daemon/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       └── index.ts             Shell: DB ping, Redis ping
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts             Fastify bootstrap
│   │       └── healthz.ts
│   ├── web/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.node.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── Dockerfile               Multi-stage: Vite build → nginx
│   │   ├── nginx.conf
│   │   └── src/
│   │       └── main.tsx             Hello world
│   └── media-worker/
│       ├── package.json
│       ├── tsconfig.json
│       ├── Dockerfile
│       └── src/
│           └── index.ts             Shell
```

## Conventions (apply to every task)

- **Commits:** Conventional Commits (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`). Each task ends with one commit unless noted.
- **Branch:** all M1 work goes directly on `main` (this is initial setup, nothing to PR against). Future milestones use feature branches.
- **Imports:** workspace packages referenced as `@yank/shared`, `@yank/db`, etc., using `workspace:*` protocol.
- **TS:** `"strict": true`, `"moduleResolution": "bundler"`, `"target": "ES2022"`.
- **Ports:** Postgres 5432, Redis 6379, api 3001, web (dev) 5173, web (prod nginx) 8080.
- **Container names:** `yank-postgres`, `yank-redis`, `yank-daemon`, `yank-api`, `yank-web`, `yank-media-worker`, `yank-migrate` (one-shot).

---

## Group A — Workspace scaffolding

### Task A1: Initialize pnpm workspace + repo metadata

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `README.md`

- [ ] **Step 1: Verify prerequisites**

Run:
```bash
node --version
pnpm --version
```

Expected: Node `v22.x.x` and pnpm `9.x.x` or higher. If pnpm missing: `corepack enable && corepack prepare pnpm@latest --activate`.

- [ ] **Step 2: Create `.nvmrc`**

```
22
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 4: Create root `package.json`**

```json
{
  "name": "yank",
  "private": true,
  "version": "0.1.0",
  "description": "Pulls the slack out of WhatsApp.",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "pnpm -r run typecheck",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {}
}
```

- [ ] **Step 5: Create minimal `README.md`**

```markdown
# Yank

> *Pulls the slack out of WhatsApp.*

Self-hosted, Tailscale-only, Slack-style PWA over WhatsApp. See [`docs/superpowers/specs/2026-05-14-yank-design.md`](docs/superpowers/specs/2026-05-14-yank-design.md) for the design.

## Status

Foundation in progress. See [`docs/superpowers/plans/`](docs/superpowers/plans/) for current milestone.
```

- [ ] **Step 6: Verify pnpm install works**

Run:
```bash
pnpm install
```

Expected: succeeds with `Done in <Xs>` and creates `pnpm-lock.yaml` + an empty `node_modules/`.

- [ ] **Step 7: Commit**

```bash
git add .nvmrc pnpm-workspace.yaml package.json pnpm-lock.yaml README.md
git commit -m "chore: initialize pnpm workspace"
```

---

### Task A2: TypeScript + ESLint + Prettier setup

**Files:**
- Create: `tsconfig.base.json`
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Modify: `package.json` (add dev deps + scripts)

- [ ] **Step 1: Install tooling**

Run:
```bash
pnpm add -w -D typescript@~5.6.3 @types/node@22 \
  eslint@~9.16.0 @eslint/js typescript-eslint \
  prettier@~3.4.0 \
  globals
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/drizzle/**',
      'packages/web/dist/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
);
```

- [ ] **Step 4: Create `.prettierrc`**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "semi": true,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

- [ ] **Step 5: Run lint to verify no errors on empty repo**

Run:
```bash
pnpm lint
```

Expected: exit code 0, no output (no files to lint yet).

- [ ] **Step 6: Commit**

```bash
git add tsconfig.base.json eslint.config.js .prettierrc package.json pnpm-lock.yaml
git commit -m "chore: add TypeScript, ESLint, and Prettier config"
```

---

### Task A3: Vitest workspace config

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add Vitest dev deps)

- [ ] **Step 1: Install Vitest**

Run:
```bash
pnpm add -w -D vitest@~2.1.0 @vitest/coverage-v8
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
    },
  },
});
```

- [ ] **Step 3: Run tests to verify it works on empty suite**

Run:
```bash
pnpm test
```

Expected: `No test files found, exiting with code 0` or similar. **Tweak the include glob if the message says it found nothing matching** — we want the test command itself to succeed.

If pnpm test exits non-zero because no tests yet, modify the script:
```json
"test": "vitest run --passWithNoTests"
```

Re-run; expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml
git commit -m "chore: add Vitest workspace test config"
```

---

## Group B — Shared package

### Task B1: Create `@yank/shared` package skeleton

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create directory structure**

Run:
```bash
mkdir -p packages/shared/src packages/shared/test
```

- [ ] **Step 2: Create `packages/shared/package.json`**

```json
{
  "name": "@yank/shared",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "*"
  }
}
```

- [ ] **Step 3: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "composite": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `packages/shared/src/index.ts`**

```ts
export {};
```

- [ ] **Step 5: Install and verify typecheck**

Run:
```bash
pnpm install
pnpm --filter @yank/shared typecheck
```

Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "chore(shared): initialize package skeleton"
```

---

### Task B2: Env loader with Zod

**Files:**
- Create: `packages/shared/src/env.ts`
- Create: `packages/shared/test/env.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json` (add Zod)

- [ ] **Step 1: Install Zod**

Run:
```bash
pnpm --filter @yank/shared add zod@~3.23.0
```

- [ ] **Step 2: Write the failing test at `packages/shared/test/env.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/env.js';

describe('loadEnv', () => {
  it('parses required env vars', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://yank:secret@localhost:5432/yank',
      REDIS_URL: 'redis://localhost:6379',
      LOG_LEVEL: 'info',
      NODE_ENV: 'development',
    });
    expect(env.DATABASE_URL).toBe('postgres://yank:secret@localhost:5432/yank');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.NODE_ENV).toBe('development');
  });

  it('defaults LOG_LEVEL to info when missing', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://yank:secret@localhost:5432/yank',
      REDIS_URL: 'redis://localhost:6379',
      NODE_ENV: 'development',
    });
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('throws a readable error when DATABASE_URL is missing', () => {
    expect(() =>
      loadEnv({ REDIS_URL: 'redis://localhost:6379', NODE_ENV: 'development' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is not a valid postgres URL', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: 'not-a-url',
        REDIS_URL: 'redis://localhost:6379',
        NODE_ENV: 'development',
      }),
    ).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run:
```bash
pnpm test
```

Expected: FAIL — `Cannot find module '../src/env.js'`.

- [ ] **Step 4: Implement `packages/shared/src/env.ts`**

```ts
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
      message: 'DATABASE_URL must be a postgres URL',
    }),
  REDIS_URL: z.string().url().startsWith('redis://'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
```

- [ ] **Step 5: Re-export from `packages/shared/src/index.ts`**

```ts
export { loadEnv, type Env } from './env.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
pnpm test
```

Expected: PASS — 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): add Zod-validated env loader"
```

---

### Task B3: Pino logger factory

**Files:**
- Create: `packages/shared/src/logger.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json` (add pino)

- [ ] **Step 1: Install pino**

Run:
```bash
pnpm --filter @yank/shared add pino@~9.5.0
pnpm --filter @yank/shared add -D pino-pretty@~13.0.0
```

- [ ] **Step 2: Implement `packages/shared/src/logger.ts`**

(Skipping a dedicated unit test — pino is well-tested upstream; we'd be testing pino itself. Smoke-tested via downstream usage.)

```ts
import pino, { type Logger } from 'pino';

export interface LoggerOptions {
  service: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger({ service, level = 'info', pretty }: LoggerOptions): Logger {
  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
        }
      : undefined,
  });
}

export type { Logger };
```

- [ ] **Step 3: Re-export from `packages/shared/src/index.ts`**

```ts
export { loadEnv, type Env } from './env.js';
export { createLogger, type Logger, type LoggerOptions } from './logger.js';
```

- [ ] **Step 4: Verify typecheck passes**

Run:
```bash
pnpm --filter @yank/shared typecheck
```

Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): add pino logger factory"
```

---

### Task B4: UUIDv7 helper

**Files:**
- Create: `packages/shared/src/ids.ts`
- Create: `packages/shared/test/ids.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json` (add uuid)

- [ ] **Step 1: Install uuid**

Run:
```bash
pnpm --filter @yank/shared add uuid@~11.0.0
pnpm --filter @yank/shared add -D @types/uuid@~10.0.0
```

- [ ] **Step 2: Write the failing test at `packages/shared/test/ids.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { newId } from '../src/ids.js';

describe('newId', () => {
  it('returns a UUID-shaped string', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns values sorted by creation time (ascending lex)', async () => {
    const a = newId();
    await new Promise((r) => setTimeout(r, 5));
    const b = newId();
    expect(a < b).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run:
```bash
pnpm test
```

Expected: FAIL — `Cannot find module '../src/ids.js'`.

- [ ] **Step 4: Implement `packages/shared/src/ids.ts`**

```ts
import { v7 as uuidv7 } from 'uuid';

export function newId(): string {
  return uuidv7();
}
```

- [ ] **Step 5: Re-export from `packages/shared/src/index.ts`**

```ts
export { loadEnv, type Env } from './env.js';
export { createLogger, type Logger, type LoggerOptions } from './logger.js';
export { newId } from './ids.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
pnpm test
```

Expected: PASS — 6 tests pass total (4 from B2 + 2 here).

- [ ] **Step 7: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): add UUIDv7 id helper"
```

---

### Task B5: Redis event + command Zod schemas

**Files:**
- Create: `packages/shared/src/events.ts`
- Create: `packages/shared/test/events.test.ts`
- Modify: `packages/shared/src/index.ts`

These define the daemon↔api contract that flows over Redis. Per architectural invariant 1 (spec §4), this is the *only* boundary between the daemon and the rest of the system. Future M2 will reference these schemas on both sides — get them right now.

- [ ] **Step 1: Write the failing test at `packages/shared/test/events.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { DaemonEventSchema, ApiCommandSchema } from '../src/events.js';

describe('DaemonEventSchema', () => {
  it('parses a connected event', () => {
    const e = DaemonEventSchema.parse({
      type: 'connected',
      userId: '0193fe00-0000-7000-8000-000000000001',
      jid: '15555550100@s.whatsapp.net',
      phone: '+15555550100',
    });
    expect(e.type).toBe('connected');
  });

  it('parses a qr event', () => {
    const e = DaemonEventSchema.parse({
      type: 'qr',
      userId: '0193fe00-0000-7000-8000-000000000001',
      data: '2@abc123…',
    });
    expect(e.type).toBe('qr');
  });

  it('parses a message event', () => {
    const e = DaemonEventSchema.parse({
      type: 'message',
      userId: '0193fe00-0000-7000-8000-000000000001',
      chatId: '0193fe00-0000-7000-8000-000000000002',
      messageId: '0193fe00-0000-7000-8000-000000000003',
    });
    expect(e.type).toBe('message');
  });

  it('rejects unknown event types', () => {
    expect(() =>
      DaemonEventSchema.parse({ type: 'bogus', userId: 'x' }),
    ).toThrow();
  });
});

describe('ApiCommandSchema', () => {
  it('parses a pair command', () => {
    const c = ApiCommandSchema.parse({
      type: 'pair',
      userId: '0193fe00-0000-7000-8000-000000000001',
      method: 'qr',
    });
    expect(c.type).toBe('pair');
  });

  it('parses a send command', () => {
    const c = ApiCommandSchema.parse({
      type: 'send',
      userId: '0193fe00-0000-7000-8000-000000000001',
      localId: '0193fe00-0000-7000-8000-000000000099',
      chatJid: '15555550100@s.whatsapp.net',
      text: 'hello world',
    });
    expect(c.type).toBe('send');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run:
```bash
pnpm test
```

Expected: FAIL — `Cannot find module '../src/events.js'`.

- [ ] **Step 3: Implement `packages/shared/src/events.ts`**

```ts
import { z } from 'zod';

// Events: daemon → Redis pub/sub `events:user:<userId>` → api → SSE → browser

const Base = z.object({ userId: z.string().uuid() });

export const QrEvent = Base.extend({
  type: z.literal('qr'),
  data: z.string(),
});

export const ConnectedEvent = Base.extend({
  type: z.literal('connected'),
  jid: z.string(),
  phone: z.string(),
});

export const DisconnectedEvent = Base.extend({
  type: z.literal('disconnected'),
  reason: z.string().optional(),
});

export const SyncProgressEvent = Base.extend({
  type: z.literal('sync-progress'),
  synced: z.number().int().nonnegative(),
  total: z.number().int().positive().optional(),
});

export const SyncCompleteEvent = Base.extend({
  type: z.literal('sync-complete'),
});

export const MessageEvent = Base.extend({
  type: z.literal('message'),
  chatId: z.string().uuid(),
  messageId: z.string().uuid(),
});

export const MessageStatusEvent = Base.extend({
  type: z.literal('status'),
  localId: z.string().uuid(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  waMessageId: z.string().optional(),
});

export const DaemonEventSchema = z.discriminatedUnion('type', [
  QrEvent,
  ConnectedEvent,
  DisconnectedEvent,
  SyncProgressEvent,
  SyncCompleteEvent,
  MessageEvent,
  MessageStatusEvent,
]);

export type DaemonEvent = z.infer<typeof DaemonEventSchema>;

// Commands: api → Redis stream `commands:user:<userId>` → daemon → WhatsApp

export const PairCommand = Base.extend({
  type: z.literal('pair'),
  method: z.enum(['qr', 'code']),
});

export const SendCommand = Base.extend({
  type: z.literal('send'),
  localId: z.string().uuid(),
  chatJid: z.string(),
  text: z.string(),
  quotedWaId: z.string().optional(),
});

export const ReactCommand = Base.extend({
  type: z.literal('react'),
  chatJid: z.string(),
  waMessageId: z.string(),
  emoji: z.string().nullable(), // null = remove reaction
});

export const MarkReadCommand = Base.extend({
  type: z.literal('mark-read'),
  chatJid: z.string(),
  waMessageId: z.string(),
});

export const TypingCommand = Base.extend({
  type: z.literal('typing'),
  chatJid: z.string(),
  state: z.enum(['composing', 'paused']),
});

export const ApiCommandSchema = z.discriminatedUnion('type', [
  PairCommand,
  SendCommand,
  ReactCommand,
  MarkReadCommand,
  TypingCommand,
]);

export type ApiCommand = z.infer<typeof ApiCommandSchema>;

// Redis channel helpers — single source of truth for channel naming.
export const eventsChannel = (userId: string) => `events:user:${userId}`;
export const commandsStream = (userId: string) => `commands:user:${userId}`;
```

- [ ] **Step 4: Re-export from `packages/shared/src/index.ts`**

```ts
export { loadEnv, type Env } from './env.js';
export { createLogger, type Logger, type LoggerOptions } from './logger.js';
export { newId } from './ids.js';
export {
  DaemonEventSchema,
  ApiCommandSchema,
  eventsChannel,
  commandsStream,
  type DaemonEvent,
  type ApiCommand,
} from './events.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
pnpm test
```

Expected: PASS — 12 tests total (4 env + 2 ids + 6 events).

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add daemon event and api command Zod schemas"
```

---

## Group C — Database package + schema

Drizzle is used for two things: defining tables as TypeScript and generating SQL migrations from those definitions. The generated SQL is committed to the repo and applied via a programmatic runner.

### Task C1: Create `@yank/db` package skeleton with Drizzle

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create directory structure**

Run:
```bash
mkdir -p packages/db/src/schema packages/db/test packages/db/drizzle
```

- [ ] **Step 2: Create `packages/db/package.json`**

```json
{
  "name": "@yank/db",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "drizzle:generate": "drizzle-kit generate",
    "drizzle:migrate": "tsx src/migrate.ts"
  },
  "dependencies": {
    "@yank/shared": "workspace:*",
    "drizzle-orm": "~0.36.0",
    "postgres": "~3.4.0"
  },
  "devDependencies": {
    "drizzle-kit": "~0.28.0",
    "tsx": "~4.19.0",
    "typescript": "*"
  }
}
```

- [ ] **Step 3: Create `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "composite": true
  },
  "references": [{ "path": "../shared" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `packages/db/drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://yank:yank@localhost:5432/yank',
  },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 5: Create empty `packages/db/src/schema/index.ts`**

```ts
// Re-export all tables — populated in later tasks.
export {};
```

- [ ] **Step 6: Create `packages/db/src/index.ts` with the client factory**

```ts
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Db = PostgresJsDatabase<typeof schema>;

export interface CreateDbOptions {
  url: string;
  max?: number;
}

export function createDb({ url, max = 10 }: CreateDbOptions): { db: Db; close: () => Promise<void> } {
  const client = postgres(url, { max });
  const db = drizzle(client, { schema });
  return {
    db,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}

export * as schema from './schema/index.js';
```

- [ ] **Step 7: Install + verify typecheck**

Run:
```bash
pnpm install
pnpm --filter @yank/db typecheck
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/db pnpm-lock.yaml
git commit -m "chore(db): initialize package with Drizzle scaffold"
```

---

### Task C2: Identity tables (users, whatsapp_sessions, push_subscriptions)

**Files:**
- Create: `packages/db/src/schema/users.ts`
- Create: `packages/db/src/schema/whatsapp-sessions.ts`
- Create: `packages/db/src/schema/push-subscriptions.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create `packages/db/src/schema/users.ts`**

```ts
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().notNull(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  settings: jsonb('settings').notNull().default({}),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- [ ] **Step 2: Create `packages/db/src/schema/whatsapp-sessions.ts`**

```ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const whatsappSessions = pgTable('whatsapp_sessions', {
  userId: uuid('user_id')
    .primaryKey()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  jid: text('jid'),
  phoneNumber: text('phone_number'),
  status: text('status', { enum: ['unlinked', 'pairing', 'connected', 'disconnected'] })
    .notNull()
    .default('unlinked'),
  lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
});

export type WhatsAppSession = typeof whatsappSessions.$inferSelect;
```

- [ ] **Step 3: Create `packages/db/src/schema/push-subscriptions.ts`**

```ts
import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    keys: jsonb('keys').notNull(),
    userAgent: text('ua'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byUser: index('push_subscriptions_by_user').on(t.userId),
  }),
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
```

- [ ] **Step 4: Update `packages/db/src/schema/index.ts`**

```ts
export * from './users.js';
export * from './whatsapp-sessions.js';
export * from './push-subscriptions.js';
```

- [ ] **Step 5: Verify typecheck**

Run:
```bash
pnpm --filter @yank/db typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema
git commit -m "feat(db): add identity schema (users, sessions, push)"
```

---

### Task C3: Chat tables (contacts, chats, chat_assignments, group_members)

**Files:**
- Create: `packages/db/src/schema/contacts.ts`
- Create: `packages/db/src/schema/chats.ts`
- Create: `packages/db/src/schema/chat-assignments.ts`
- Create: `packages/db/src/schema/group-members.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create `packages/db/src/schema/contacts.ts`**

```ts
import { pgTable, uuid, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const contacts = pgTable(
  'contacts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jid: text('jid').notNull(),
    displayName: text('display_name'),
    pushName: text('push_name'),
    businessName: text('business_name'),
    avatarPath: text('avatar_path'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.jid] }),
  }),
);

export type Contact = typeof contacts.$inferSelect;
```

- [ ] **Step 2: Create `packages/db/src/schema/chats.ts`**

```ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const chats = pgTable(
  'chats',
  {
    id: uuid('id').primaryKey().notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jid: text('jid').notNull(),
    type: text('type', { enum: ['dm', 'group', 'community', 'newsletter'] }).notNull(),
    subject: text('subject'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastMessagePreview: text('last_message_preview'),
    archived: boolean('archived').notNull().default(false),
    mutedUntil: timestamp('muted_until', { withTimezone: true }),
    pinned: boolean('pinned').notNull().default(false),
  },
  (t) => ({
    byUserJid: uniqueIndex('chats_user_jid_uq').on(t.userId, t.jid),
    byUserActivity: index('chats_user_activity_idx').on(t.userId, t.lastMessageAt),
  }),
);

export type Chat = typeof chats.$inferSelect;
```

- [ ] **Step 3: Create `packages/db/src/schema/chat-assignments.ts`**

```ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { chats } from './chats.js';

export const chatAssignments = pgTable('chat_assignments', {
  chatId: uuid('chat_id')
    .primaryKey()
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  workspace: text('workspace', { enum: ['work', 'personal', 'triage', 'hidden'] })
    .notNull()
    .default('triage'),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ChatAssignment = typeof chatAssignments.$inferSelect;
```

- [ ] **Step 4: Create `packages/db/src/schema/group-members.ts`**

```ts
import { pgTable, uuid, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { chats } from './chats.js';

export const groupMembers = pgTable(
  'group_members',
  {
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    jid: text('jid').notNull(),
    role: text('role', { enum: ['member', 'admin', 'superadmin'] })
      .notNull()
      .default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chatId, t.jid] }),
  }),
);

export type GroupMember = typeof groupMembers.$inferSelect;
```

- [ ] **Step 5: Update `packages/db/src/schema/index.ts`**

```ts
export * from './users.js';
export * from './whatsapp-sessions.js';
export * from './push-subscriptions.js';
export * from './contacts.js';
export * from './chats.js';
export * from './chat-assignments.js';
export * from './group-members.js';
```

- [ ] **Step 6: Verify typecheck**

Run:
```bash
pnpm --filter @yank/db typecheck
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema
git commit -m "feat(db): add chat schema (contacts, chats, assignments, members)"
```

---

### Task C4: Message tables (messages, message_media, reactions)

**Files:**
- Create: `packages/db/src/schema/messages.ts`
- Create: `packages/db/src/schema/message-media.ts`
- Create: `packages/db/src/schema/reactions.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create `packages/db/src/schema/messages.ts`**

The `text_tsv` generated column is added via raw SQL in the migration step (Drizzle's Postgres `generatedAlwaysAs` for tsvector still requires raw SQL).

```ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { chats } from './chats.js';

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    waMessageId: text('wa_message_id'),
    senderJid: text('sender_jid').notNull(),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    kind: text('kind', {
      enum: ['text', 'image', 'video', 'audio', 'document', 'sticker', 'poll', 'system', 'call'],
    }).notNull(),
    text: text('text'),
    replyToId: uuid('reply_to_id').references((): AnyPgColumn => messages.id, {
      onDelete: 'set null',
    }),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    status: text('status', {
      enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    })
      .notNull()
      .default('sent'),
  },
  (t) => ({
    waUq: uniqueIndex('messages_user_wa_uq').on(t.userId, t.waMessageId),
    chatTs: index('messages_chat_ts_idx').on(t.userId, t.chatId, t.ts),
    replyTo: index('messages_reply_to_idx').on(t.userId, t.replyToId),
  }),
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
```

- [ ] **Step 2: Create `packages/db/src/schema/message-media.ts`**

```ts
import { pgTable, uuid, text, integer } from 'drizzle-orm/pg-core';
import { messages } from './messages.js';

export const messageMedia = pgTable('message_media', {
  messageId: uuid('message_id')
    .primaryKey()
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes'),
  width: integer('width'),
  height: integer('height'),
  durationMs: integer('duration_ms'),
  filePath: text('file_path'),
  thumbnailPath: text('thumbnail_path'),
  status: text('status', { enum: ['queued', 'downloading', 'ready', 'failed'] })
    .notNull()
    .default('queued'),
});

export type MessageMedia = typeof messageMedia.$inferSelect;
```

- [ ] **Step 3: Create `packages/db/src/schema/reactions.ts`**

```ts
import { pgTable, uuid, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { messages } from './messages.js';

export const reactions = pgTable(
  'reactions',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    reactorJid: text('reactor_jid').notNull(),
    emoji: text('emoji').notNull(),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.messageId, t.reactorJid] }),
  }),
);

export type Reaction = typeof reactions.$inferSelect;
```

- [ ] **Step 4: Update `packages/db/src/schema/index.ts`**

```ts
export * from './users.js';
export * from './whatsapp-sessions.js';
export * from './push-subscriptions.js';
export * from './contacts.js';
export * from './chats.js';
export * from './chat-assignments.js';
export * from './group-members.js';
export * from './messages.js';
export * from './message-media.js';
export * from './reactions.js';
```

- [ ] **Step 5: Verify typecheck**

Run:
```bash
pnpm --filter @yank/db typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema
git commit -m "feat(db): add message schema (messages, media, reactions)"
```

---

### Task C5: State tables (read_state, stars, directory_entries)

**Files:**
- Create: `packages/db/src/schema/read-state.ts`
- Create: `packages/db/src/schema/stars.ts`
- Create: `packages/db/src/schema/directory-entries.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create `packages/db/src/schema/read-state.ts`**

```ts
import { pgTable, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { chats } from './chats.js';
import { messages } from './messages.js';

export const readState = pgTable(
  'read_state',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    lastReadMessageId: uuid('last_read_message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    lastReadTs: timestamp('last_read_ts', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.chatId] }),
  }),
);

export type ReadState = typeof readState.$inferSelect;
```

- [ ] **Step 2: Create `packages/db/src/schema/stars.ts`**

```ts
import { pgTable, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { messages } from './messages.js';

export const stars = pgTable(
  'stars',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    starredAt: timestamp('starred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.messageId] }),
  }),
);

export type Star = typeof stars.$inferSelect;
```

- [ ] **Step 3: Create `packages/db/src/schema/directory-entries.ts`**

```ts
import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { chats } from './chats.js';

export const directoryEntries = pgTable('directory_entries', {
  id: uuid('id').primaryKey().notNull(),
  ownerUserId: uuid('user_id_owner')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  visibility: text('visibility', { enum: ['public', 'link-only', 'private'] }).notNull(),
  inviteLink: text('invite_link'),
  description: text('description'),
});

export type DirectoryEntry = typeof directoryEntries.$inferSelect;
```

- [ ] **Step 4: Update `packages/db/src/schema/index.ts`**

```ts
export * from './users.js';
export * from './whatsapp-sessions.js';
export * from './push-subscriptions.js';
export * from './contacts.js';
export * from './chats.js';
export * from './chat-assignments.js';
export * from './group-members.js';
export * from './messages.js';
export * from './message-media.js';
export * from './reactions.js';
export * from './read-state.js';
export * from './stars.js';
export * from './directory-entries.js';
```

- [ ] **Step 5: Verify typecheck**

Run:
```bash
pnpm --filter @yank/db typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema
git commit -m "feat(db): add state schema (read_state, stars, directory_entries)"
```

---

### Task C6: Generate the initial migration

**Files:**
- Create: `packages/db/drizzle/0000_*.sql` (generated)
- Create: `packages/db/drizzle/meta/*` (generated)

- [ ] **Step 1: Ensure a local Postgres is reachable for drizzle-kit metadata**

drizzle-kit doesn't need to apply the migration to introspect the schema for generation — it works from the TypeScript schema files alone. No DB connection required for `generate`.

- [ ] **Step 2: Run the generator**

Run:
```bash
pnpm --filter @yank/db drizzle:generate
```

Expected: creates `packages/db/drizzle/0000_<random-name>.sql` and a `meta/` directory. The SQL file should contain `CREATE TABLE` statements for all 13 tables defined in C2–C5.

- [ ] **Step 3: Open the generated SQL and add the tsvector + pg_trgm indexes**

Open the new `packages/db/drizzle/0000_*.sql` file. At the end of the file, append:

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Generated tsvector column for full-text search on messages.text
ALTER TABLE "messages" ADD COLUMN "text_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("text", ''))) STORED;

-- FTS GIN index
CREATE INDEX "messages_text_tsv_idx" ON "messages" USING GIN ("text_tsv");

-- Trigram GIN for fuzzy / substring
CREATE INDEX "messages_text_trgm_idx" ON "messages" USING GIN ("text" gin_trgm_ops);

-- Partial index for recovery of pending sends
CREATE INDEX "messages_pending_idx" ON "messages" ("user_id") WHERE "status" = 'pending';
```

These match the spec §7 "Search" and "Critical indexes" sections.

- [ ] **Step 4: Verify SQL parses (offline check)**

Open the file and ensure the appended SQL is at the bottom and the file is valid SQL. (We'll verify against a real Postgres in C8.)

- [ ] **Step 5: Commit**

```bash
git add packages/db/drizzle
git commit -m "feat(db): generate initial migration with FTS + trigram indexes"
```

---

### Task C7: Migration runner

**Files:**
- Create: `packages/db/src/migrate.ts`

- [ ] **Step 1: Create `packages/db/src/migrate.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { loadEnv, createLogger } from '@yank/shared';

const env = loadEnv();
const log = createLogger({ service: 'migrate', level: env.LOG_LEVEL, pretty: env.NODE_ENV !== 'production' });

const client = postgres(env.DATABASE_URL, { max: 1 });

try {
  log.info('applying migrations');
  await migrate(drizzle(client), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
  log.info('migrations complete');
} catch (err) {
  log.error({ err }, 'migration failed');
  process.exitCode = 1;
} finally {
  await client.end();
}
```

- [ ] **Step 2: Verify typecheck**

Run:
```bash
pnpm --filter @yank/db typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/migrate.ts
git commit -m "feat(db): add programmatic migration runner"
```

---

### Task C8: Migration integration test (Testcontainers)

**Files:**
- Create: `packages/db/test/migrations.test.ts`
- Modify: `packages/db/package.json` (add testcontainers, vitest)

- [ ] **Step 1: Install Testcontainers + Vitest in db package**

Run:
```bash
pnpm --filter @yank/db add -D vitest@~2.1.0 testcontainers@~10.13.0 @testcontainers/postgresql@~10.13.0
```

- [ ] **Step 2: Write the failing test at `packages/db/test/migrations.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { users, chats, chatAssignments, messages } from '../src/schema/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', 'drizzle');

describe('migrations', () => {
  let pg: StartedPostgreSqlContainer;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    client = postgres(pg.getConnectionUri(), { max: 1 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder });
  }, 60_000);

  afterAll(async () => {
    await client?.end();
    await pg?.stop();
  });

  it('creates the users table and accepts a row', async () => {
    await db.insert(users).values({
      id: '0193fe00-0000-7000-8000-000000000001',
      displayName: 'Florent',
    });
    const got = await db.select().from(users);
    expect(got).toHaveLength(1);
    expect(got[0]?.displayName).toBe('Florent');
  });

  it('inserts a chat and an assignment', async () => {
    await db.insert(chats).values({
      id: '0193fe00-0000-7000-8000-000000000010',
      userId: '0193fe00-0000-7000-8000-000000000001',
      jid: '15555550100@s.whatsapp.net',
      type: 'dm',
    });
    await db.insert(chatAssignments).values({
      chatId: '0193fe00-0000-7000-8000-000000000010',
      workspace: 'triage',
    });
    const got = await db.select().from(chatAssignments);
    expect(got).toHaveLength(1);
    expect(got[0]?.workspace).toBe('triage');
  });

  it('inserts a message and finds it via FTS', async () => {
    await db.insert(messages).values({
      id: '0193fe00-0000-7000-8000-000000000020',
      userId: '0193fe00-0000-7000-8000-000000000001',
      chatId: '0193fe00-0000-7000-8000-000000000010',
      senderJid: '15555550100@s.whatsapp.net',
      ts: new Date(),
      kind: 'text',
      text: 'hello taut world from yank',
      status: 'sent',
    });

    const rows = await db.execute<{ id: string }>(
      sql`SELECT id FROM messages WHERE text_tsv @@ plainto_tsquery('english', 'yank')`,
    );
    expect(rows).toHaveLength(1);
  });

  it('finds messages with trigram fuzzy match', async () => {
    const rows = await db.execute<{ id: string }>(
      sql`SELECT id FROM messages WHERE text % 'yankk'`, // intentional typo
    );
    // pg_trgm with default threshold (0.3) should match "yank" vs "yankk"
    expect(rows.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails (no Docker yet for test runner? Testcontainers needs Docker)**

Run:
```bash
pnpm test
```

Expected outcomes:
- If Docker is running on the host: PASS (4 new tests).
- If not: FAIL with "could not find Docker host". Start Docker (`systemctl --user start docker` or equivalent) and re-run.

- [ ] **Step 4: Commit**

```bash
git add packages/db/test packages/db/package.json pnpm-lock.yaml
git commit -m "test(db): add Testcontainers migration integration test"
```

---

## Group D — Service shells

### Task D1: API shell with Fastify + /healthz

**Files:**
- Create: `packages/api/package.json`
- Create: `packages/api/tsconfig.json`
- Create: `packages/api/src/index.ts`
- Create: `packages/api/src/healthz.ts`
- Create: `packages/api/Dockerfile`

- [ ] **Step 1: Create directory structure**

Run:
```bash
mkdir -p packages/api/src
```

- [ ] **Step 2: Create `packages/api/package.json`**

```json
{
  "name": "@yank/api",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@yank/db": "workspace:*",
    "@yank/shared": "workspace:*",
    "drizzle-orm": "~0.36.0",
    "fastify": "~5.1.0",
    "ioredis": "~5.4.0",
    "tsx": "~4.19.0"
  },
  "devDependencies": {
    "typescript": "*"
  }
}
```

- [ ] **Step 3: Create `packages/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "composite": true
  },
  "references": [{ "path": "../shared" }, { "path": "../db" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `packages/api/src/healthz.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { Db } from '@yank/db';
import { sql } from 'drizzle-orm';
import type Redis from 'ioredis';

export function registerHealthz(app: FastifyInstance, deps: { db: Db; redis: Redis }) {
  app.get('/healthz', async () => {
    await deps.db.execute(sql`SELECT 1`);
    const pong = await deps.redis.ping();
    if (pong !== 'PONG') throw new Error('redis unhealthy');
    return { ok: true };
  });
}
```

- [ ] **Step 5: Create `packages/api/src/index.ts`**

```ts
import Fastify from 'fastify';
import Redis from 'ioredis';
import { createDb } from '@yank/db';
import { loadEnv, createLogger } from '@yank/shared';
import { registerHealthz } from './healthz.js';

const env = loadEnv();
const log = createLogger({
  service: 'api',
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV !== 'production',
});

const { db, close: closeDb } = createDb({ url: env.DATABASE_URL });
const redis = new Redis(env.REDIS_URL);

const app = Fastify({ loggerInstance: log });
registerHealthz(app, { db, redis });

const port = Number(process.env.PORT ?? 3001);
try {
  await app.listen({ host: '0.0.0.0', port });
  log.info({ port }, 'api listening');
} catch (err) {
  log.error({ err }, 'failed to start');
  process.exit(1);
}

const shutdown = async () => {
  log.info('shutting down');
  await app.close();
  await redis.quit();
  await closeDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

- [ ] **Step 6: Create `packages/api/Dockerfile`**

Single-stage with tsx running TypeScript directly — no build step, no `dist/`. Same code path in dev and prod. Startup penalty ≈100 ms, negligible for a long-running api.

```dockerfile
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
```

- [ ] **Step 7: Verify typecheck**

Run:
```bash
pnpm install
pnpm --filter @yank/api typecheck
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/api pnpm-lock.yaml
git commit -m "feat(api): add Fastify shell with /healthz"
```

---

### Task D2: Daemon shell

**Files:**
- Create: `packages/daemon/package.json`
- Create: `packages/daemon/tsconfig.json`
- Create: `packages/daemon/src/index.ts`
- Create: `packages/daemon/Dockerfile`

- [ ] **Step 1: Create directory structure**

Run:
```bash
mkdir -p packages/daemon/src
```

- [ ] **Step 2: Create `packages/daemon/package.json`**

```json
{
  "name": "@yank/daemon",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@yank/db": "workspace:*",
    "@yank/shared": "workspace:*",
    "drizzle-orm": "~0.36.0",
    "ioredis": "~5.4.0",
    "tsx": "~4.19.0"
  },
  "devDependencies": {
    "typescript": "*"
  }
}
```

- [ ] **Step 3: Create `packages/daemon/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "composite": true
  },
  "references": [{ "path": "../shared" }, { "path": "../db" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `packages/daemon/src/index.ts`**

This is an M1 shell. M2 replaces it with the Baileys integration. For now: connect to DB and Redis, log connected, idle.

```ts
import Redis from 'ioredis';
import { sql } from 'drizzle-orm';
import { createDb } from '@yank/db';
import { loadEnv, createLogger } from '@yank/shared';

const env = loadEnv();
const log = createLogger({
  service: 'daemon',
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV !== 'production',
});

const { db, close: closeDb } = createDb({ url: env.DATABASE_URL });
const redis = new Redis(env.REDIS_URL);

await db.execute(sql`SELECT 1`);
const pong = await redis.ping();
log.info({ pong }, 'daemon shell up — db + redis healthy. Baileys integration arrives in M2.');

const shutdown = async () => {
  log.info('shutting down');
  await redis.quit();
  await closeDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Keep alive
setInterval(() => log.debug('heartbeat'), 60_000);
```

- [ ] **Step 5: Create `packages/daemon/Dockerfile`**

```dockerfile
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
```

- [ ] **Step 6: Refresh installs + verify typecheck**

Run:
```bash
pnpm install
pnpm --filter @yank/daemon typecheck
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/daemon pnpm-lock.yaml
git commit -m "feat(daemon): add shell that pings db + redis"
```

---

### Task D3: Media-worker shell

**Files:**
- Create: `packages/media-worker/package.json`
- Create: `packages/media-worker/tsconfig.json`
- Create: `packages/media-worker/src/index.ts`
- Create: `packages/media-worker/Dockerfile`

- [ ] **Step 1: Create directory structure**

Run:
```bash
mkdir -p packages/media-worker/src
```

- [ ] **Step 2: Create `packages/media-worker/package.json`**

```json
{
  "name": "@yank/media-worker",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@yank/db": "workspace:*",
    "@yank/shared": "workspace:*",
    "drizzle-orm": "~0.36.0",
    "ioredis": "~5.4.0",
    "tsx": "~4.19.0"
  },
  "devDependencies": {
    "typescript": "*"
  }
}
```

- [ ] **Step 3: Create `packages/media-worker/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "composite": true
  },
  "references": [{ "path": "../shared" }, { "path": "../db" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `packages/media-worker/src/index.ts`**

```ts
import Redis from 'ioredis';
import { sql } from 'drizzle-orm';
import { createDb } from '@yank/db';
import { loadEnv, createLogger } from '@yank/shared';

const env = loadEnv();
const log = createLogger({
  service: 'media-worker',
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV !== 'production',
});

const { db, close: closeDb } = createDb({ url: env.DATABASE_URL });
const redis = new Redis(env.REDIS_URL);

await db.execute(sql`SELECT 1`);
await redis.ping();
log.info('media-worker shell up — media download arrives in M6');

const shutdown = async () => {
  await redis.quit();
  await closeDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

setInterval(() => log.debug('heartbeat'), 60_000);
```

- [ ] **Step 5: Create `packages/media-worker/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-alpine
WORKDIR /app
RUN corepack enable && addgroup -S app && adduser -S app -G app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/media-worker/package.json packages/media-worker/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY packages/media-worker ./packages/media-worker

ENV NODE_ENV=production
USER app
CMD ["pnpm", "--filter", "@yank/media-worker", "start"]
```

- [ ] **Step 6: Refresh installs + verify typecheck**

Run:
```bash
pnpm install
pnpm --filter @yank/media-worker typecheck
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/media-worker pnpm-lock.yaml
git commit -m "feat(media-worker): add shell that pings db + redis"
```

---

### Task D4: Web shell (Vite + React + nginx)

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/tsconfig.node.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/nginx.conf`
- Create: `packages/web/Dockerfile`

- [ ] **Step 1: Create directory structure**

Run:
```bash
mkdir -p packages/web/src
```

- [ ] **Step 2: Create `packages/web/package.json`**

```json
{
  "name": "@yank/web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 0.0.0.0",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "~19.0.0",
    "react-dom": "~19.0.0"
  },
  "devDependencies": {
    "@types/react": "~19.0.0",
    "@types/react-dom": "~19.0.0",
    "@vitejs/plugin-react": "~4.3.0",
    "typescript": "*",
    "vite": "~6.0.0"
  }
}
```

- [ ] **Step 3: Create `packages/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "useDefineForClassFields": true,
    "moduleResolution": "Bundler",
    "noEmit": true
  },
  "include": ["src/**/*"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create `packages/web/tsconfig.node.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create `packages/web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
});
```

- [ ] **Step 6: Create `packages/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Yank</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `packages/web/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';

const App = () => (
  <main style={{ fontFamily: 'system-ui', padding: 24 }}>
    <h1>Yank</h1>
    <p>Pulls the slack out of WhatsApp.</p>
    <p style={{ color: '#888' }}>M1 shell — real UI lands in M3.</p>
  </main>
);

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');
ReactDOM.createRoot(root).render(<App />);
```

- [ ] **Step 8: Create `packages/web/nginx.conf`**

```
worker_processes  1;
events { worker_connections 1024; }
http {
  include       /etc/nginx/mime.types;
  default_type  application/octet-stream;
  sendfile      on;
  keepalive_timeout  65;

  server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;

    location / {
      try_files $uri /index.html;
    }

    location = /healthz {
      access_log off;
      return 200 "ok\n";
      add_header Content-Type text/plain;
    }
  }
}
```

- [ ] **Step 9: Create `packages/web/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/web/package.json packages/web/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile --filter @yank/web...
COPY tsconfig.base.json ./
COPY packages/web ./packages/web
RUN pnpm --filter @yank/web build

FROM nginx:alpine AS runtime
COPY packages/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 8080
```

- [ ] **Step 10: Verify dev server starts**

Run:
```bash
pnpm install
pnpm --filter @yank/web dev
```

Open another terminal, then:
```bash
curl -s http://localhost:5173 | head -5
```

Expected: HTML output starting with `<!doctype html>`. Stop the dev server with `Ctrl-C`.

- [ ] **Step 11: Verify production build**

Run:
```bash
pnpm --filter @yank/web build
ls packages/web/dist
```

Expected: `dist/` contains `index.html` and an `assets/` directory.

- [ ] **Step 12: Commit**

```bash
git add packages/web pnpm-lock.yaml
git commit -m "feat(web): add Vite + React shell with nginx Dockerfile"
```

---

## Group E — Orchestration

### Task E1: docker-compose.local.yml (Postgres + Redis only)

**Files:**
- Create: `docker-compose.local.yml`
- Create: `.env.example`

- [ ] **Step 1: Create `.env.example`**

```bash
# ─── Local clean-room dev ────────────────────────────────────────────
# These point at containers from docker-compose.local.yml.
DATABASE_URL=postgres://yank:yank@localhost:5432/yank
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
NODE_ENV=development

# ─── Pointing at the NAS over Tailscale (everyday dev) ───────────────
# Uncomment and replace with your NAS Tailscale hostname.
# DATABASE_URL=postgres://yank:CHANGE_ME@nas.tailfd123.ts.net:5432/yank
# REDIS_URL=redis://nas.tailfd123.ts.net:6379

# ─── Postgres credentials (used by docker-compose) ───────────────────
POSTGRES_USER=yank
POSTGRES_PASSWORD=yank
POSTGRES_DB=yank

# ─── Production-only (read on NAS) ──────────────────────────────────
# A strong password for the NAS Postgres.
# POSTGRES_PASSWORD=<generate a long random string>
```

- [ ] **Step 2: Create `docker-compose.local.yml`**

```yaml
name: yank-local

services:
  postgres:
    image: postgres:16-alpine
    container_name: yank-postgres-local
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-yank}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-yank}
      POSTGRES_DB: ${POSTGRES_DB:-yank}
    ports:
      - '127.0.0.1:5432:5432'
    volumes:
      - postgres-local-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER:-yank} -d $${POSTGRES_DB:-yank}']
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: yank-redis-local
    ports:
      - '127.0.0.1:6379:6379'
    volumes:
      - redis-local-data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres-local-data:
  redis-local-data:
```

- [ ] **Step 3: Bring up the stack and verify healthchecks**

Run:
```bash
cp .env.example .env
docker compose -f docker-compose.local.yml up -d
sleep 5
docker compose -f docker-compose.local.yml ps
```

Expected: both services show `running (healthy)`.

- [ ] **Step 4: Apply migrations against local stack**

Run:
```bash
source .env && export DATABASE_URL REDIS_URL LOG_LEVEL NODE_ENV
pnpm --filter @yank/db drizzle:migrate
```

Expected: log shows `applying migrations` and `migrations complete` and exit 0.

- [ ] **Step 5: Verify the schema landed**

Run:
```bash
docker exec -i yank-postgres-local psql -U yank -d yank -c '\dt'
```

Expected: list shows all 13 tables (users, whatsapp_sessions, push_subscriptions, contacts, chats, chat_assignments, group_members, messages, message_media, reactions, read_state, stars, directory_entries) plus drizzle's migration tracking table.

- [ ] **Step 6: Tear down**

Run:
```bash
docker compose -f docker-compose.local.yml down
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.local.yml .env.example
git commit -m "build: add local-only docker-compose for Postgres + Redis"
```

---

### Task E2: Full docker-compose.yml (NAS prod stack)

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
name: yank

x-common-env: &common-env
  DATABASE_URL: postgres://${POSTGRES_USER:-yank}:${POSTGRES_PASSWORD:-yank}@postgres:5432/${POSTGRES_DB:-yank}
  REDIS_URL: redis://redis:6379
  LOG_LEVEL: ${LOG_LEVEL:-info}
  NODE_ENV: production

services:
  postgres:
    image: postgres:16-alpine
    container_name: yank-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-yank}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-yank}
      POSTGRES_DB: ${POSTGRES_DB:-yank}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER:-yank} -d $${POSTGRES_DB:-yank}']
      interval: 10s
      timeout: 5s
      retries: 10
    networks: [app-net]

  redis:
    image: redis:7-alpine
    container_name: yank-redis
    restart: unless-stopped
    volumes:
      - redis-data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 10
    networks: [app-net]

  migrate:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    container_name: yank-migrate
    environment: *common-env
    command: ['pnpm', '--filter', '@yank/db', 'drizzle:migrate']
    depends_on:
      postgres:
        condition: service_healthy
    networks: [app-net]
    restart: 'no'

  daemon:
    build:
      context: .
      dockerfile: packages/daemon/Dockerfile
    container_name: yank-daemon
    restart: unless-stopped
    environment: *common-env
    volumes:
      - baileys-auth:/app/baileys-auth
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    networks: [app-net]

  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    container_name: yank-api
    restart: unless-stopped
    environment: *common-env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:3001/healthz']
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [app-net]

  media-worker:
    build:
      context: .
      dockerfile: packages/media-worker/Dockerfile
    container_name: yank-media-worker
    restart: unless-stopped
    environment: *common-env
    volumes:
      - media:/app/media
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    networks: [app-net]

  web:
    build:
      context: .
      dockerfile: packages/web/Dockerfile
    container_name: yank-web
    restart: unless-stopped
    ports:
      - '127.0.0.1:8080:8080'
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:8080/healthz']
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [app-net]

volumes:
  postgres-data:
  redis-data:
  baileys-auth:
  media:

networks:
  app-net:
    driver: bridge
```

Notes:

- `web` is bound to `127.0.0.1:8080`. **Tailscale Serve** (configured at M7) proxies `https://yank.<tailnet>.ts.net:443 → 127.0.0.1:8080`.
- The api is **not** published to the host — only reachable from the `app-net` and via the web container's reverse-proxy config (added in M3 when the api gets real endpoints).
- The migrate service runs once at startup, blocks the others until success.
- Persistent volumes: `postgres-data`, `baileys-auth` (encrypted dataset on NAS — see runbook in M7), `media`.

- [ ] **Step 2: Build all images**

Run:
```bash
docker compose build
```

Expected: 4 image builds succeed (`yank-daemon`, `yank-api`, `yank-media-worker`, `yank-web`).

- [ ] **Step 3: Bring the stack up**

Run:
```bash
docker compose up -d
sleep 30
docker compose ps
```

Expected: all services `running`. `yank-migrate` shows `exited (0)` (one-shot). `yank-api` and `yank-web` show `(healthy)`.

- [ ] **Step 4: Hit the api healthz from inside the network**

Run:
```bash
docker exec yank-web wget -qO- http://yank-api:3001/healthz
```

Expected: `{"ok":true}`.

- [ ] **Step 5: Hit web on the host port**

Run:
```bash
curl -s http://localhost:8080 | head -5
```

Expected: HTML containing `<title>Yank</title>`.

- [ ] **Step 6: Tear down**

Run:
```bash
docker compose down
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml
git commit -m "build: add full docker-compose stack"
```

---

### Task E3: Deploy script

**Files:**
- Create: `scripts/deploy.sh`

- [ ] **Step 1: Create directory**

Run:
```bash
mkdir -p scripts
```

- [ ] **Step 2: Create `scripts/deploy.sh`**

```bash
#!/usr/bin/env bash
#
# Deploy Yank to the NAS.
#
# Prerequisites on NAS (one-time):
#   1. Tailscale installed and joined to the tailnet
#   2. Docker + Docker Compose v2 installed
#   3. Repo cloned at $YANK_REMOTE_PATH (default: /srv/yank)
#   4. A .env file alongside docker-compose.yml on the NAS with prod secrets
#
# Usage:
#   ./scripts/deploy.sh                 # rebuild and restart everything
#   ./scripts/deploy.sh daemon          # rebuild and restart only the daemon
#   ./scripts/deploy.sh daemon api      # multiple specific services

set -euo pipefail

YANK_REMOTE_HOST="${YANK_REMOTE_HOST:-nas}"
YANK_REMOTE_PATH="${YANK_REMOTE_PATH:-/srv/yank}"

services=("$@")

echo "▶ Pushing latest commits to origin"
git push

echo "▶ Pulling on ${YANK_REMOTE_HOST} at ${YANK_REMOTE_PATH}"
ssh "${YANK_REMOTE_HOST}" "cd ${YANK_REMOTE_PATH} && git pull --ff-only"

if [ ${#services[@]} -eq 0 ]; then
  echo "▶ Building and restarting all services"
  ssh "${YANK_REMOTE_HOST}" "cd ${YANK_REMOTE_PATH} && docker compose up -d --build"
else
  echo "▶ Building and restarting: ${services[*]}"
  ssh "${YANK_REMOTE_HOST}" "cd ${YANK_REMOTE_PATH} && docker compose up -d --build ${services[*]}"
fi

echo "▶ Status"
ssh "${YANK_REMOTE_HOST}" "cd ${YANK_REMOTE_PATH} && docker compose ps"
```

- [ ] **Step 3: Make it executable**

Run:
```bash
chmod +x scripts/deploy.sh
```

- [ ] **Step 4: Smoke check syntax**

Run:
```bash
bash -n scripts/deploy.sh
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy.sh
git commit -m "build: add deploy script for NAS"
```

---

## Group F — CI

### Task F1: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create directory**

Run:
```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.15.0

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test
```

Note: the Testcontainers test (`packages/db/test/migrations.test.ts`) requires Docker, which is available on `ubuntu-latest` runners by default.

- [ ] **Step 3: Verify YAML is well-formed**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint + typecheck + test workflow"
git push
```

- [ ] **Step 5: Verify the first CI run on GitHub**

Open the repo on GitHub → Actions tab. The latest run should be green. If it fails, read the failing job's log, fix the issue, push a follow-up commit. Common first-run issues:

- Missing dev dep — install it locally with `pnpm add -w -D <name>` and re-push.
- Lint errors on generated files — extend the `ignores` array in `eslint.config.js`.
- Docker not available — only relevant if running tests locally without Docker; CI's `ubuntu-latest` has Docker.

---

## Final smoke test

A whole-stack rehearsal of the M1 deliverables.

- [ ] **Step 1: Clean slate**

Run:
```bash
docker compose down -v
docker compose -f docker-compose.local.yml down -v
rm -rf node_modules packages/*/node_modules packages/*/dist
```

- [ ] **Step 2: Install fresh**

Run:
```bash
pnpm install
```

Expected: success.

- [ ] **Step 3: Lint, typecheck, test**

Run:
```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all three pass.

- [ ] **Step 4: Bring up local stack + run migrations**

Run:
```bash
cp .env.example .env
docker compose -f docker-compose.local.yml up -d
sleep 5
source .env && export $(grep -v '^#' .env | xargs)
pnpm --filter @yank/db drizzle:migrate
```

Expected: migrations apply cleanly. Verify tables exist:
```bash
docker exec yank-postgres-local psql -U yank -d yank -c '\dt' | wc -l
```
Expected: at least 14 lines (header + 13 tables + drizzle's tracking table).

- [ ] **Step 5: Tear local stack, bring up full stack**

Run:
```bash
docker compose -f docker-compose.local.yml down
docker compose up -d --build
sleep 60
docker compose ps
```

Expected: all 6 long-running services (`postgres`, `redis`, `daemon`, `api`, `media-worker`, `web`) running, with `(healthy)` for those with healthchecks. `yank-migrate` shows `exited (0)`.

- [ ] **Step 6: Verify web serves and api responds**

Run:
```bash
curl -s http://localhost:8080 | grep -q '<title>Yank</title>' && echo 'web ok'
docker exec yank-web wget -qO- http://yank-api:3001/healthz
```

Expected: `web ok` and `{"ok":true}`.

- [ ] **Step 7: Verify daemon + media-worker logs**

Run:
```bash
docker logs yank-daemon --tail 5
docker logs yank-media-worker --tail 5
```

Expected: both log `... shell up — ...`.

- [ ] **Step 8: Tear down**

Run:
```bash
docker compose down
```

- [ ] **Step 9: Tag the milestone**

Run:
```bash
git tag -a m1-foundation -m "M1 — Foundation complete"
git push --tags
```

---

## What's NOT in M1 (deferred to later milestones)

- Baileys integration, QR/pairing, message ingestion → **M2**
- Outbound send pipeline, REST endpoints, SSE → **M2 + M3**
- Frontend shell + routing + state → **M3**
- Workspaces, Triage, search, saved → **M4–M5**
- Media download, PWA install, push notifications → **M6**
- Tailscale Serve config, encrypted volumes, backup runbook, diagnostics page → **M7**

The schema in M1 is the **final** schema for v1 — M2+ should not need migrations beyond fixing genuine bugs. If a later milestone needs a schema change, generate a new migration via `drizzle:generate` and treat it as production-bound (review SQL, test on shadow DB, apply).

---

## Cross-references

- Architectural invariants: see [`docs/superpowers/specs/2026-05-14-yank-design.md`](../specs/2026-05-14-yank-design.md) §4.
- Schema mapping: spec §7.
- Container topology: spec §6.
- Flow contracts: spec §8 (these schemas come alive in M2).
