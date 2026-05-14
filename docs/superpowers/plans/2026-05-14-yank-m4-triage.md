# Yank — M4 Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M3 `/triage` stub with the keyboard-first card grid; ship `POST /api/chats/:chatId/assignment` (with a `chat-assignment` SSE event so multi-tab stays in sync); add a single-slot undo toast; ensure the command palette quick-switcher hides `hidden` chats.

**Architecture:** New web component family `components/triage/*` reading from a new selector layer `lib/selectors.ts` over the existing `useChats()` query. Optimistic assignment via TanStack Query's `onMutate`/`onError` with a Zustand-backed `<UndoToast>` mounted at `__root`. Multi-tab consistency via a new `chat-assignment` event published by the api directly to `events:user:<u>` (the daemon does not see it — invariant 3 stays intact). All channel/stream naming continues to flow through `eventsChannel()` from `@yank/shared`.

**Tech Stack added in M4:** none. M4 reuses M3's React 19 + TanStack Router/Query + Zustand + Vitest + RTL + MSW + Playwright stack and M2's Fastify + Drizzle + Testcontainers stack.

**Design source:** [`docs/superpowers/specs/2026-05-14-yank-m4-triage-design.md`](../specs/2026-05-14-yank-m4-triage-design.md).

**Baseline (verified at revision time, 2026-05-14):**

- M1 + M2 + M3 are merged to `main` (or about to be — this plan assumes M3 has landed).
- `packages/web/src/routes/triage.tsx` is a 10-line stub.
- `useAssignWorkspace(chatId)` exists in `packages/web/src/lib/mutations.ts` but is typed `Exclude<Workspace, 'triage'>` — M4 widens this so undo can re-triage.
- `Rail.tsx` inline-computes `triageCount = chats.filter(c => c.workspace === 'triage').length`; `Sidebar.tsx` inline-filters by `c.workspace === workspace`. Both will switch to the new selectors.
- `CommandPalette.tsx` lists every chat from `useChats()`, including `hidden`. M4 fixes this.
- `useEventStream` has no `chat-assignment` case. M4 adds it.
- The api's `packages/api/src/events-bus.ts` is subscribe-only. M4 adds a small `events-publisher.ts` for the api to push events back into Redis pub/sub.
- `packages/db/src/schema/chat-assignments.ts` already enumerates the four workspaces and defaults to `'triage'`; no schema/migration work required.

**End state when M4 is complete:**

- `/triage` renders every chat with `workspace='triage'` as a card; the user clears via `1`/`2`/`3` keys or the per-card buttons.
- An assignment optimistically removes the card and shows `<UndoToast>` for 5 s. Clicking Undo (or `Cmd+Z` while the toast is up) re-triages the chat.
- A second tab open on `/triage` mirrors assignments from the first tab via the `chat-assignment` SSE event.
- The command palette excludes hidden chats. The rail's red-dot count reflects the live triage list (it already did, but now via a shared selector).
- `pnpm lint`, `pnpm typecheck`, `pnpm test` pass. One new Playwright spec exercises the happy path + undo path.

---

## API contract owned by M4

| Method + path | Body | Response | Notes |
|---|---|---|---|
| `POST /api/chats/:chatId/assignment` | `{ workspace: 'work' \| 'personal' \| 'triage' \| 'hidden' }` | `204 No Content` | UPSERT into `chat_assignments`. 404 if the chat is not owned by the current user. 400 if the body fails Zod validation. **Idempotent** — repeating the same body is allowed; `assigned_at` advances. |

The api publishes a `chat-assignment` event on `events:user:<userId>` after every successful UPSERT.

### New SSE event added to `DaemonEvent`

```ts
{
  type: 'chat-assignment',
  userId: string,           // uuid
  chatId: string,           // uuid
  workspace: Workspace,     // 'work' | 'personal' | 'triage' | 'hidden'
  assignedAt: string,       // ISO 8601
}
```

---

## File structure introduced in M4

```
packages/api/
├── src/
│   ├── events-publisher.ts          (NEW — Redis publisher with schema validation)
│   └── routes/
│       └── chats.ts                 (EXTEND — add POST /api/chats/:id/assignment + body schema)
└── test/
    └── chats-assignment.test.ts     (NEW — Testcontainers integration test)

packages/shared/
└── src/
    ├── dto.ts                       (EXTEND — AssignmentBodySchema + AssignmentBody)
    ├── events.ts                    (EXTEND — ChatAssignmentEvent variant)
    └── index.ts                     (EXTEND — re-export the new shapes)

packages/web/
├── src/
│   ├── components/
│   │   ├── primitives/
│   │   │   ├── UndoToast.tsx + .module.css       (NEW)
│   │   ├── triage/                                (NEW directory)
│   │   │   ├── TriageView.tsx + .module.css
│   │   │   ├── TriageCard.tsx + .module.css
│   │   │   ├── TriageProgressBar.tsx + .module.css
│   │   │   ├── TriageEmptyState.tsx + .module.css
│   │   │   └── TriageActions.tsx + .module.css   (the three Work/Personal/Hide buttons)
│   │   ├── shell/Rail.tsx                        (EDIT — read selector instead of inline filter)
│   │   ├── shell/Sidebar.tsx                     (EDIT — read selector instead of inline filter)
│   │   └── palette/CommandPalette.tsx            (EDIT — exclude hidden chats from quick-switcher)
│   ├── hooks/
│   │   └── useTriageKeys.ts         (NEW — route-scoped 1/2/3, j/k/↑/↓, Cmd+Z)
│   ├── lib/
│   │   ├── selectors.ts             (NEW — useChatsForWorkspace, useTriageChats, useTriageCount, useChatsExcludingHidden)
│   │   ├── mutations.ts             (EDIT — widen useAssignWorkspace; add optimistic + onError + toast)
│   │   └── eventStream.ts           (EDIT — handle 'chat-assignment')
│   ├── routes/
│   │   ├── __root.tsx               (EDIT — mount <UndoToast />)
│   │   └── triage.tsx               (REWRITE — mount <TriageView />)
│   └── state/
│       └── toast.ts                 (NEW — Zustand single-slot toast store)
└── test/
    ├── components/
    │   ├── triage/
    │   │   ├── TriageCard.test.tsx
    │   │   ├── TriageView.test.tsx
    │   │   └── TriageEmptyState.test.tsx
    │   ├── primitives/
    │   │   └── UndoToast.test.tsx
    │   └── palette/CommandPalette.test.tsx        (EDIT — add 'excludes hidden chats' test)
    ├── hooks/
    │   └── useTriageKeys.test.tsx
    ├── lib/
    │   ├── selectors.test.tsx
    │   ├── mutations.test.tsx                     (NEW — test useAssignWorkspace optimistic/onError/undo)
    │   └── eventStream.test.tsx                   (EDIT — add chat-assignment case)
    ├── state/
    │   └── toast.test.ts
    └── e2e/
        └── triage.spec.ts            (NEW — Playwright happy path + undo)
```

---

## Conventions (apply to every task)

- **Branch:** all M4 work goes on `feat/m4-triage` off `main`, with each task as a separate commit. Open the PR after Group C wraps so the API + state plumbing is reviewable early; keep pushing onto the same branch for the rest.
- **Commits:** Conventional Commits — `feat(api): …`, `feat(web): …`, `feat(shared): …`, `test(api): …`, `test(web): …`. CSS-only tweaks → `style(web): …`. Refactors → `refactor(web): …`.
- **Imports:** relative paths inside `packages/web/src` use the `.js` extension (ESM + `verbatimModuleSyntax`). Cross-package as `@yank/shared`, `@yank/db`.
- **Type imports:** `import type { … } from '…'` or inline `import { type Foo, bar } from '…'` (ESLint enforces).
- **CSS Modules:** every component has a sibling `*.module.css`. Class names are lower-camelCase.
- **Tokens:** any color/spacing/font-size used by more than one component MUST come from a CSS variable in `tokens.css` (M3). No magic hex literals.
- **Tests:** UI tests in `packages/web/test/**/*.test.{ts,tsx}` (jsdom env via `packages/web/vitest.config.ts`). API integration tests in `packages/api/test/**/*.test.ts` (Testcontainers).
- **Channel names:** never hand-format Redis channel strings. Always call `eventsChannel(userId)` from `@yank/shared`.

---

## Group A — Shared types (zero dependencies; land first)

### Task A1: Add `AssignmentBodySchema` to `@yank/shared/src/dto.ts`

**Files:**
- Modify: `packages/shared/src/dto.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/test/dto.test.ts` (if it exists — otherwise create `packages/shared/test/assignment-body.test.ts`)

- [ ] **Step 1: Write the failing test**

If `packages/shared/test/dto.test.ts` already exists from M3, append the cases below. Otherwise create `packages/shared/test/assignment-body.test.ts` with the imports + describe block:

```ts
// packages/shared/test/assignment-body.test.ts
import { describe, it, expect } from 'vitest';
import { AssignmentBodySchema } from '../src/dto.js';

describe('AssignmentBodySchema', () => {
  it('accepts each valid workspace value', () => {
    for (const ws of ['work', 'personal', 'triage', 'hidden'] as const) {
      expect(AssignmentBodySchema.parse({ workspace: ws })).toEqual({ workspace: ws });
    }
  });

  it('rejects unknown workspace values', () => {
    expect(() => AssignmentBodySchema.parse({ workspace: 'archive' })).toThrow();
  });

  it('rejects missing workspace', () => {
    expect(() => AssignmentBodySchema.parse({})).toThrow();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
pnpm exec vitest run packages/shared/test/assignment-body.test.ts
```

Expected: FAIL with "AssignmentBodySchema is not defined" or similar.

- [ ] **Step 3: Add the schema to `packages/shared/src/dto.ts`**

After the existing `WorkspaceSchema` export (around line 6), append:

```ts
export const AssignmentBodySchema = z.object({ workspace: WorkspaceSchema });
export type AssignmentBody = z.infer<typeof AssignmentBodySchema>;
```

- [ ] **Step 4: Re-export from `packages/shared/src/index.ts`**

In the `dto` export block, add `AssignmentBodySchema` and `AssignmentBody`:

```ts
export {
  ChatSchema,
  MessageSchema,
  MessagesPageSchema,
  ChatMemberSchema,
  ReactionSchema,
  MediaSchema,
  SendMessageBodySchema,
  WorkspaceSchema,
  ChatKindSchema,
  MessageKindSchema,
  MessageStatusSchema,
  AssignmentBodySchema,
  type Chat,
  type Message,
  type MessagesPage,
  type ChatMember,
  type Reaction,
  type Media,
  type SendMessageBody,
  type Workspace,
  type AssignmentBody,
} from './dto.js';
```

- [ ] **Step 5: Run tests + typecheck, verify pass**

```bash
pnpm exec vitest run packages/shared/test/assignment-body.test.ts
pnpm --filter @yank/shared typecheck
```

Expected: 3 tests pass; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/dto.ts packages/shared/src/index.ts \
        packages/shared/test/assignment-body.test.ts
git commit -m "feat(shared): add AssignmentBodySchema for chat workspace assignment"
```

---

### Task A2: Add `ChatAssignmentEvent` to `@yank/shared/src/events.ts`

**Files:**
- Modify: `packages/shared/src/events.ts`
- Create: `packages/shared/test/chat-assignment-event.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/test/chat-assignment-event.test.ts
import { describe, it, expect } from 'vitest';
import { DaemonEventSchema } from '../src/events.js';

describe('chat-assignment DaemonEvent', () => {
  const valid = {
    type: 'chat-assignment',
    userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
    chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
    workspace: 'personal' as const,
    assignedAt: '2026-05-14T12:00:00.000Z',
  };

  it('parses a well-formed chat-assignment event', () => {
    expect(DaemonEventSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an unknown workspace', () => {
    expect(() => DaemonEventSchema.parse({ ...valid, workspace: 'archive' })).toThrow();
  });

  it('rejects a non-ISO assignedAt', () => {
    expect(() => DaemonEventSchema.parse({ ...valid, assignedAt: 'yesterday' })).toThrow();
  });

  it('rejects a missing userId', () => {
    const { userId: _userId, ...rest } = valid;
    expect(() => DaemonEventSchema.parse(rest)).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm exec vitest run packages/shared/test/chat-assignment-event.test.ts
```

Expected: FAIL — `DaemonEventSchema` does not recognise `chat-assignment`.

- [ ] **Step 3: Extend `events.ts`**

At the top of `packages/shared/src/events.ts`, import `WorkspaceSchema` (this introduces a `dto → events` import direction that does not currently exist; it's safe because `dto.ts` does not import from `events.ts`):

```ts
import { z } from 'zod';
import { WorkspaceSchema } from './dto.js';
```

Add the new event variant after `MessageStatusEvent` (around line 49):

```ts
export const ChatAssignmentEvent = Base.extend({
  type: z.literal('chat-assignment'),
  chatId: z.string().uuid(),
  workspace: WorkspaceSchema,
  assignedAt: z.string().datetime(),
});
```

Add it to the discriminated union:

```ts
export const DaemonEventSchema = z.discriminatedUnion('type', [
  QrEvent,
  PairCodeEvent,
  ConnectedEvent,
  DisconnectedEvent,
  SyncProgressEvent,
  SyncCompleteEvent,
  MessageEvent,
  MessageStatusEvent,
  ChatAssignmentEvent,
]);
```

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm exec vitest run packages/shared/test/chat-assignment-event.test.ts
pnpm --filter @yank/shared typecheck
```

Expected: 4 tests pass; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/events.ts packages/shared/test/chat-assignment-event.test.ts
git commit -m "feat(shared): add chat-assignment event to DaemonEvent union"
```

---

## Group B — API endpoint

### Task B1: Add the `events-publisher.ts` helper to `@yank/api`

The api currently has `events-bus.ts` (subscriber + fan-out). It needs a separate small publisher to push the `chat-assignment` event into Redis pub/sub. We keep the publisher schema-validating to honour invariant 1 (Redis is the trust boundary).

**Files:**
- Create: `packages/api/src/events-publisher.ts`
- Create: `packages/api/test/events-publisher.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/test/events-publisher.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import Redis from 'ioredis';
import { eventsChannel, type DaemonEvent } from '@yank/shared';
import { createEventsPublisher } from '../src/events-publisher.js';

const USER = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';

describe('events-publisher', () => {
  let redisC: StartedRedisContainer;
  let pub: Redis;
  let sub: Redis;
  let received: DaemonEvent[];

  beforeAll(async () => {
    redisC = await new RedisContainer('redis:7-alpine').start();
    pub = new Redis(redisC.getConnectionUrl());
    sub = new Redis(redisC.getConnectionUrl());
    received = [];
    await sub.subscribe(eventsChannel(USER));
    sub.on('message', (_ch, payload) => received.push(JSON.parse(payload) as DaemonEvent));
  }, 60_000);

  afterAll(async () => {
    await pub?.quit();
    await sub?.quit();
    await redisC?.stop();
  });

  it('publishes a schema-validated event onto events:user:<u>', async () => {
    const before = received.length;
    const publisher = createEventsPublisher(pub, USER);
    await publisher.publish({
      type: 'chat-assignment',
      userId: USER,
      chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
      workspace: 'personal',
      assignedAt: new Date('2026-05-14T12:00:00.000Z').toISOString(),
    });
    // brief poll — pub/sub delivery is async
    for (let i = 0; i < 50 && received.length === before; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(received.length).toBe(before + 1);
    expect(received[received.length - 1]).toMatchObject({
      type: 'chat-assignment',
      chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
      workspace: 'personal',
    });
  });

  it('throws on a malformed event without publishing', async () => {
    const before = received.length;
    const publisher = createEventsPublisher(pub, USER);
    await expect(
      // @ts-expect-error intentionally malformed
      publisher.publish({ type: 'chat-assignment', userId: USER, chatId: 'not-a-uuid' }),
    ).rejects.toBeTruthy();
    // give pub/sub a moment to deliver if it (wrongly) did
    await new Promise((r) => setTimeout(r, 100));
    expect(received.length).toBe(before);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm exec vitest run packages/api/test/events-publisher.test.ts
```

Expected: FAIL — `createEventsPublisher` not found.

- [ ] **Step 3: Implement `events-publisher.ts`**

```ts
// packages/api/src/events-publisher.ts
import type Redis from 'ioredis';
import { DaemonEventSchema, eventsChannel, type DaemonEvent } from '@yank/shared';

export interface EventsPublisher {
  publish(evt: DaemonEvent): Promise<void>;
}

export function createEventsPublisher(redis: Redis, userId: string): EventsPublisher {
  const channel = eventsChannel(userId);
  return {
    async publish(evt) {
      const parsed = DaemonEventSchema.parse(evt);
      await redis.publish(channel, JSON.stringify(parsed));
    },
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm exec vitest run packages/api/test/events-publisher.test.ts
```

Expected: 2 tests pass (Testcontainers boot may take ~30 s on first run).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/events-publisher.ts packages/api/test/events-publisher.test.ts
git commit -m "feat(api): add Redis events publisher for api-originated events"
```

---

### Task B2: Wire the events publisher into `ChatsDeps` and the api entrypoint

**Files:**
- Modify: `packages/api/src/routes/chats.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Extend `ChatsDeps` in `packages/api/src/routes/chats.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { chats, chatAssignments } from '@yank/db/schema';
import type { EventsPublisher } from '../events-publisher.js';

export interface ChatsDeps {
  db: Db;
  userId: string;
  publisher: EventsPublisher;
}
```

Leave the existing GET routes untouched — Task B3 adds the POST. Keep the `app: FastifyInstance<any, any, any, any>` cast already present.

- [ ] **Step 2: Pass the publisher in `packages/api/src/index.ts`**

```ts
import Fastify from 'fastify';
import Redis from 'ioredis';
import { createDb } from '@yank/db';
import { loadEnv, createLogger } from '@yank/shared';
import { registerHealthz } from './healthz.js';
import { ensureSingleUser } from './bootstrap.js';
import { createCommandsBus } from './commands-bus.js';
import { createEventsBus } from './events-bus.js';
import { createEventsPublisher } from './events-publisher.js';
import { registerEventsRoute } from './routes/events.js';
import { registerSetupRoutes } from './routes/setup.js';
import { registerChatsRoutes } from './routes/chats.js';
import { registerMessagesRoutes } from './routes/messages.js';

const env = loadEnv();
const log = createLogger({
  service: 'api',
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV !== 'production',
});

const { db, close: closeDb } = createDb({ url: env.DATABASE_URL });
const redis = new Redis(env.REDIS_URL);
const subscriber = new Redis(env.REDIS_URL);

await ensureSingleUser(db, env.YANK_USER_ID);

const eventsBus = createEventsBus(subscriber, env.YANK_USER_ID);
await eventsBus.start();
const commandsBus = createCommandsBus(redis, env.YANK_USER_ID);
const publisher = createEventsPublisher(redis, env.YANK_USER_ID);

const app = Fastify({ loggerInstance: log });
registerHealthz(app, { db, redis });
registerEventsRoute(app, { bus: eventsBus });
registerSetupRoutes(app, { db, userId: env.YANK_USER_ID, commands: commandsBus });
registerChatsRoutes(app, { db, userId: env.YANK_USER_ID, publisher });
registerMessagesRoutes(app, { db, userId: env.YANK_USER_ID, commands: commandsBus });

// ...keep the existing listen / shutdown blocks unchanged...
```

(The `// ...` is illustrative. Don't delete the listen / shutdown blocks — only insert the `createEventsPublisher` import, the `publisher` const, and the `publisher` arg on `registerChatsRoutes`.)

- [ ] **Step 3: Update `packages/api/test/roundtrip.test.ts` to pass the new dep**

The existing roundtrip test instantiates `registerChatsRoutes` directly:

```ts
registerChatsRoutes(app, { db, userId: USER });
```

Add the publisher:

```ts
import { createEventsPublisher } from '../src/events-publisher.js';

// ...inside beforeAll, after the eventsBus / commandsBus setup:
const publisher = createEventsPublisher(redis, USER);

// ...later in the registration block:
registerChatsRoutes(app, { db, userId: USER, publisher });
```

- [ ] **Step 4: Verify typecheck + existing tests**

```bash
pnpm --filter @yank/api typecheck
pnpm exec vitest run packages/api/test/roundtrip.test.ts
```

Expected: typecheck exits 0; roundtrip still passes (it doesn't exercise the new route yet).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/chats.ts packages/api/src/index.ts \
        packages/api/test/roundtrip.test.ts
git commit -m "refactor(api): inject events publisher into chats routes"
```

---

### Task B3: Implement `POST /api/chats/:id/assignment` (TDD)

**Files:**
- Modify: `packages/api/src/routes/chats.ts`
- Create: `packages/api/test/chats-assignment.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/test/chats-assignment.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import Redis from 'ioredis';
import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { eventsChannel, newId, type DaemonEvent } from '@yank/shared';
import { users, chats, chatAssignments } from '@yank/db/schema';
import { and, eq } from 'drizzle-orm';
import { createEventsPublisher } from '../src/events-publisher.js';
import { registerChatsRoutes } from '../src/routes/chats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', '..', 'db', 'drizzle');
const USER = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';
const OTHER = 'b1ee0d52-2c8e-7e7a-a4cf-000000000098';

describe('POST /api/chats/:id/assignment', () => {
  let pg: StartedPostgreSqlContainer;
  let redisC: StartedRedisContainer;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let redis: Redis;
  let sub: Redis;
  let app: ReturnType<typeof Fastify>;
  let baseUrl: string;
  let chatId: string;
  let otherChatId: string;
  let received: DaemonEvent[];

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    redisC = await new RedisContainer('redis:7-alpine').start();
    client = postgres(pg.getConnectionUri(), { max: 5 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder });

    await db.insert(users).values([
      { id: USER, displayName: 'Me' },
      { id: OTHER, displayName: 'Them' },
    ]);

    chatId = newId();
    otherChatId = newId();
    await db.insert(chats).values([
      { id: chatId, userId: USER, jid: 'a@s.whatsapp.net', type: 'dm' },
      { id: otherChatId, userId: OTHER, jid: 'b@s.whatsapp.net', type: 'dm' },
    ]);
    await db.insert(chatAssignments).values([
      { chatId, workspace: 'triage' },
      { chatId: otherChatId, workspace: 'triage' },
    ]);

    redis = new Redis(redisC.getConnectionUrl());
    sub = new Redis(redisC.getConnectionUrl());
    received = [];
    await sub.subscribe(eventsChannel(USER));
    sub.on('message', (_ch, payload) => received.push(JSON.parse(payload) as DaemonEvent));

    const publisher = createEventsPublisher(redis, USER);
    app = Fastify({ logger: false });
    registerChatsRoutes(app, { db, userId: USER, publisher });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await sub?.quit();
    await redis?.quit();
    await client?.end();
    await pg?.stop();
    await redisC?.stop();
  });

  async function waitForReceived(expected: number, timeoutMs = 1000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (received.length < expected && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  it('UPSERTs the assignment and returns 204', async () => {
    const before = received.length;
    const res = await fetch(`${baseUrl}/api/chats/${chatId}/assignment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'personal' }),
    });
    expect(res.status).toBe(204);

    const row = await db
      .select()
      .from(chatAssignments)
      .where(eq(chatAssignments.chatId, chatId))
      .limit(1);
    expect(row[0]?.workspace).toBe('personal');

    await waitForReceived(before + 1);
    const evt = received[received.length - 1];
    expect(evt).toMatchObject({
      type: 'chat-assignment',
      chatId,
      workspace: 'personal',
    });
  });

  it('is idempotent — repeating the same body returns 204 and republishes', async () => {
    const before = received.length;
    const res1 = await fetch(`${baseUrl}/api/chats/${chatId}/assignment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'personal' }),
    });
    const res2 = await fetch(`${baseUrl}/api/chats/${chatId}/assignment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'personal' }),
    });
    expect(res1.status).toBe(204);
    expect(res2.status).toBe(204);
    await waitForReceived(before + 2);
    expect(received.length).toBeGreaterThanOrEqual(before + 2);
  });

  it('accepts workspace="triage" (used by undo)', async () => {
    const res = await fetch(`${baseUrl}/api/chats/${chatId}/assignment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'triage' }),
    });
    expect(res.status).toBe(204);

    const row = await db
      .select()
      .from(chatAssignments)
      .where(eq(chatAssignments.chatId, chatId))
      .limit(1);
    expect(row[0]?.workspace).toBe('triage');
  });

  it('returns 400 for a malformed body', async () => {
    const res = await fetch(`${baseUrl}/api/chats/${chatId}/assignment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'archive' }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the chat is not owned by the current user", async () => {
    const res = await fetch(`${baseUrl}/api/chats/${otherChatId}/assignment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'personal' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-existent chatId', async () => {
    const ghost = newId();
    const res = await fetch(`${baseUrl}/api/chats/${ghost}/assignment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'personal' }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm exec vitest run packages/api/test/chats-assignment.test.ts
```

Expected: FAIL — route is not registered (POST returns 404 from Fastify's "Not Found").

- [ ] **Step 3: Implement the route**

In `packages/api/src/routes/chats.ts`, add imports at the top:

```ts
import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { chats, chatAssignments } from '@yank/db/schema';
import { AssignmentBodySchema } from '@yank/shared';
import type { EventsPublisher } from '../events-publisher.js';
```

Inside the `registerChatsRoutes` function, after the existing `GET /api/chats/:id` route, append:

```ts
app.post<{ Params: { id: string }; Body: unknown }>(
  '/api/chats/:id/assignment',
  async (req, reply) => {
    // Validate body
    const parsed = AssignmentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }

    // Ownership check
    const owned = await deps.db
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.userId, deps.userId), eq(chats.id, req.params.id)))
      .limit(1);
    if (!owned[0]) return reply.code(404).send({ error: 'not_found' });

    // UPSERT assignment
    const assignedAt = new Date();
    await deps.db
      .insert(chatAssignments)
      .values({ chatId: req.params.id, workspace: parsed.data.workspace, assignedAt })
      .onConflictDoUpdate({
        target: chatAssignments.chatId,
        set: { workspace: parsed.data.workspace, assignedAt },
      });

    // Publish event (after successful write)
    await deps.publisher.publish({
      type: 'chat-assignment',
      userId: deps.userId,
      chatId: req.params.id,
      workspace: parsed.data.workspace,
      assignedAt: assignedAt.toISOString(),
    });

    return reply.code(204).send();
  },
);
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm exec vitest run packages/api/test/chats-assignment.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Run typecheck + the full api test suite**

```bash
pnpm --filter @yank/api typecheck
pnpm --filter @yank/api test
```

Expected: typecheck exits 0; all suites pass (roundtrip + events-sse + events-publisher + chats-assignment).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/chats.ts packages/api/test/chats-assignment.test.ts
git commit -m "feat(api): add POST /api/chats/:id/assignment with chat-assignment event"
```

---

## Group C — Web: lib + state plumbing

### Task C1: Selectors over the `useChats()` cache

**Files:**
- Create: `packages/web/src/lib/selectors.ts`
- Create: `packages/web/test/lib/selectors.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/lib/selectors.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { Chat } from '@yank/shared';
import {
  useChatsExcludingHidden,
  useChatsForWorkspace,
  useTriageChats,
  useTriageCount,
} from '../../src/lib/selectors.js';

const baseChat: Chat = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  jid: 'a@g.us',
  type: 'group',
  subject: 'A',
  lastMessageAt: null,
  lastMessagePreview: null,
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'work',
  memberCount: 0,
  unreadCount: 0,
};

function chat(overrides: Partial<Chat>): Chat {
  return { ...baseChat, ...overrides, id: overrides.id ?? baseChat.id };
}

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

function withChats(rows: Chat[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['chats'], rows);
  return qc;
}

describe('selectors', () => {
  it('useChatsExcludingHidden filters out hidden chats', () => {
    const qc = withChats([
      chat({ id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001', workspace: 'work', subject: 'A' }),
      chat({ id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002', workspace: 'hidden', subject: 'B' }),
      chat({ id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000003', workspace: 'triage', subject: 'C' }),
    ]);
    const { result } = renderHook(() => useChatsExcludingHidden(), { wrapper: wrap(qc) });
    expect(result.current.map((c) => c.subject)).toEqual(['A', 'C']);
  });

  it('useChatsForWorkspace filters by the given workspace', () => {
    const qc = withChats([
      chat({ id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001', workspace: 'work', subject: 'A' }),
      chat({ id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002', workspace: 'personal', subject: 'B' }),
    ]);
    const { result } = renderHook(() => useChatsForWorkspace('personal'), {
      wrapper: wrap(qc),
    });
    expect(result.current.map((c) => c.subject)).toEqual(['B']);
  });

  it('useTriageChats returns triage chats sorted by lastMessageAt DESC (nulls last)', () => {
    const qc = withChats([
      chat({
        id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
        workspace: 'triage',
        subject: 'older',
        lastMessageAt: '2026-05-13T10:00:00.000Z',
      }),
      chat({
        id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002',
        workspace: 'triage',
        subject: 'newest',
        lastMessageAt: '2026-05-14T10:00:00.000Z',
      }),
      chat({
        id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000003',
        workspace: 'triage',
        subject: 'never',
        lastMessageAt: null,
      }),
      chat({
        id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000004',
        workspace: 'work',
        subject: 'work',
      }),
    ]);
    const { result } = renderHook(() => useTriageChats(), { wrapper: wrap(qc) });
    expect(result.current.map((c) => c.subject)).toEqual(['newest', 'older', 'never']);
  });

  it('useTriageCount returns the length of useTriageChats', () => {
    const qc = withChats([
      chat({ id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001', workspace: 'triage' }),
      chat({ id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002', workspace: 'triage' }),
      chat({ id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000003', workspace: 'work' }),
    ]);
    const { result } = renderHook(() => useTriageCount(), { wrapper: wrap(qc) });
    expect(result.current).toBe(2);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web exec vitest run test/lib/selectors.test.tsx
```

Expected: FAIL — `selectors` module not found.

- [ ] **Step 3: Implement `selectors.ts`**

```ts
// packages/web/src/lib/selectors.ts
import { useMemo } from 'react';
import type { Chat, Workspace } from '@yank/shared';
import { useChats } from './queries.js';

type ActiveWorkspace = Exclude<Workspace, 'hidden'>;

function compareLastMessageAtDesc(a: Chat, b: Chat): number {
  // Nulls last
  if (a.lastMessageAt && !b.lastMessageAt) return -1;
  if (!a.lastMessageAt && b.lastMessageAt) return 1;
  if (!a.lastMessageAt && !b.lastMessageAt) return 0;
  return (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '');
}

export function useChatsExcludingHidden(): Chat[] {
  const { data: chats = [] } = useChats();
  return useMemo(() => chats.filter((c) => c.workspace !== 'hidden'), [chats]);
}

export function useChatsForWorkspace(workspace: ActiveWorkspace): Chat[] {
  const { data: chats = [] } = useChats();
  return useMemo(() => chats.filter((c) => c.workspace === workspace), [chats, workspace]);
}

export function useTriageChats(): Chat[] {
  const { data: chats = [] } = useChats();
  return useMemo(
    () =>
      chats
        .filter((c) => c.workspace === 'triage')
        .slice()
        .sort(compareLastMessageAtDesc),
    [chats],
  );
}

export function useTriageCount(): number {
  return useTriageChats().length;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter @yank/web exec vitest run test/lib/selectors.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/selectors.ts packages/web/test/lib/selectors.test.tsx
git commit -m "feat(web): add chat selectors (workspace filter, triage list, triage count)"
```

---

### Task C2: Toast Zustand store (single-slot, auto-dismiss)

**Files:**
- Create: `packages/web/src/state/toast.ts`
- Create: `packages/web/test/state/toast.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/test/state/toast.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useToastStore } from '../../src/state/toast.js';

describe('useToastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toast: null });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('show() stores a toast and dismiss() clears it', () => {
    useToastStore.getState().show({ label: 'Moved', onUndo: () => {} });
    expect(useToastStore.getState().toast?.label).toBe('Moved');
    useToastStore.getState().dismiss();
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('auto-dismisses after the default duration (5000 ms)', () => {
    useToastStore.getState().show({ label: 'Moved', onUndo: () => {} });
    expect(useToastStore.getState().toast).not.toBeNull();
    vi.advanceTimersByTime(4999);
    expect(useToastStore.getState().toast).not.toBeNull();
    vi.advanceTimersByTime(2);
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('replacing a toast clears the previous timer', () => {
    useToastStore.getState().show({ label: 'first', onUndo: () => {} });
    vi.advanceTimersByTime(2000);
    useToastStore.getState().show({ label: 'second', onUndo: () => {} });
    // Previous timer would have fired at 5000; advance to 5100 → first timer must NOT fire
    vi.advanceTimersByTime(3100);
    expect(useToastStore.getState().toast?.label).toBe('second');
    // Now advance past second's deadline (started at 2000 + 5000 = 7000; we're at 5100 → need 2000 more)
    vi.advanceTimersByTime(2000);
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('invokeUndo() calls onUndo and dismisses the toast', () => {
    const onUndo = vi.fn();
    useToastStore.getState().show({ label: 'Moved', onUndo });
    useToastStore.getState().invokeUndo();
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('invokeUndo() with no toast is a no-op', () => {
    expect(() => useToastStore.getState().invokeUndo()).not.toThrow();
  });

  it('show({ kind: "error" }) stores an error toast and invokeUndo() is a no-op on it', () => {
    useToastStore.getState().show({ kind: 'error', label: "Couldn't move chat" });
    const t = useToastStore.getState().toast;
    expect(t?.kind).toBe('error');
    expect(t?.onUndo).toBeNull();
    useToastStore.getState().invokeUndo();
    // Error toast survives an attempted undo
    expect(useToastStore.getState().toast?.kind).toBe('error');
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web exec vitest run test/state/toast.test.ts
```

Expected: FAIL — `useToastStore` not found.

- [ ] **Step 3: Implement `toast.ts`**

```ts
// packages/web/src/state/toast.ts
import { create } from 'zustand';

const DEFAULT_DURATION_MS = 5_000;

export type ToastKind = 'undo' | 'error';

export interface UndoToastPayload {
  kind?: 'undo';
  label: string;
  onUndo: () => void;
  /** Override the auto-dismiss duration (ms). Defaults to 5_000. */
  durationMs?: number;
}

export interface ErrorToastPayload {
  kind: 'error';
  label: string;
  durationMs?: number;
}

export type ToastPayload = UndoToastPayload | ErrorToastPayload;

export interface ActiveToast {
  kind: ToastKind;
  label: string;
  /** Present only for kind = 'undo'. */
  onUndo: (() => void) | null;
  expiresAt: number;
}

interface ToastState {
  toast: ActiveToast | null;
  show: (payload: ToastPayload) => void;
  dismiss: () => void;
  invokeUndo: () => void;
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function clearPendingTimer(): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

export const useToastStore = create<ToastState>((set, get) => ({
  toast: null,
  show: (payload) => {
    clearPendingTimer();
    const duration = payload.durationMs ?? DEFAULT_DURATION_MS;
    const expiresAt = Date.now() + duration;
    const kind: ToastKind = payload.kind ?? 'undo';
    const onUndo = kind === 'undo' ? (payload as UndoToastPayload).onUndo : null;
    set({ toast: { kind, label: payload.label, onUndo, expiresAt } });
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      set({ toast: null });
    }, duration);
  },
  dismiss: () => {
    clearPendingTimer();
    set({ toast: null });
  },
  invokeUndo: () => {
    const current = get().toast;
    if (!current || current.kind !== 'undo' || !current.onUndo) return;
    clearPendingTimer();
    const cb = current.onUndo;
    set({ toast: null });
    cb();
  },
}));
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter @yank/web exec vitest run test/state/toast.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/state/toast.ts packages/web/test/state/toast.test.ts
git commit -m "feat(web): add single-slot toast Zustand store with auto-dismiss"
```

---

### Task C3: `<UndoToast>` primitive component

**Files:**
- Create: `packages/web/src/components/primitives/UndoToast.tsx`
- Create: `packages/web/src/components/primitives/UndoToast.module.css`
- Create: `packages/web/test/components/primitives/UndoToast.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/components/primitives/UndoToast.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UndoToast } from '../../../src/components/primitives/UndoToast.js';
import { useToastStore } from '../../../src/state/toast.js';

describe('UndoToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toast: null });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when no toast is active', () => {
    render(<UndoToast />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the label and an Undo button when a toast is active', () => {
    useToastStore.getState().show({ label: 'Moved to Personal', onUndo: () => {} });
    render(<UndoToast />);
    expect(screen.getByText('Moved to Personal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
  });

  it('clicking Undo calls onUndo and dismisses', () => {
    const onUndo = vi.fn();
    useToastStore.getState().show({ label: 'Moved', onUndo });
    render(<UndoToast />);
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('disappears after the auto-dismiss timeout', () => {
    useToastStore.getState().show({ label: 'Moved', onUndo: () => {} });
    render(<UndoToast />);
    expect(screen.getByText('Moved')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5001);
    });
    expect(screen.queryByText('Moved')).not.toBeInTheDocument();
  });

  it('Cmd+Z while a toast is active triggers undo', () => {
    const onUndo = vi.fn();
    useToastStore.getState().show({ label: 'Moved', onUndo });
    render(<UndoToast />);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web exec vitest run test/components/primitives/UndoToast.test.tsx
```

Expected: FAIL — `UndoToast` not found.

- [ ] **Step 3: Implement `UndoToast.tsx`**

```tsx
// packages/web/src/components/primitives/UndoToast.tsx
import { useEffect } from 'react';
import { useToastStore } from '../../state/toast.js';
import styles from './UndoToast.module.css';

export function UndoToast() {
  const toast = useToastStore((s) => s.toast);
  const invokeUndo = useToastStore((s) => s.invokeUndo);

  useEffect(() => {
    if (!toast || toast.kind !== 'undo') return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        invokeUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toast, invokeUndo]);

  if (!toast) return null;
  if (toast.kind === 'error') {
    return (
      <div
        className={styles.toast + ' ' + styles.error}
        role="alert"
        aria-live="assertive"
      >
        <span className={styles.label}>{toast.label}</span>
      </div>
    );
  }
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span className={styles.label}>{toast.label}</span>
      <button type="button" className={styles.undo} onClick={invokeUndo}>
        Undo
        <span className={styles.kbd}>⌘Z</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Add `UndoToast.module.css`**

```css
/* packages/web/src/components/primitives/UndoToast.module.css */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  background: var(--bg-2);
  color: var(--fg-0);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
  font-size: 13px;
  z-index: 60;
}

.label {
  color: var(--fg-1);
}

.undo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--fg-0);
  padding: 2px 8px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
}

.undo:hover {
  background: var(--bg-3);
}

.kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-3);
  border: 1px solid var(--border);
  padding: 0 4px;
  border-radius: 3px;
}

.error {
  border-color: var(--c-triage);
  background: var(--c-triage-soft);
}

.error .label {
  color: var(--c-triage);
}
```

- [ ] **Step 4b: Append the error-variant test to `UndoToast.test.tsx`**

Inside the existing `describe('UndoToast', …)` block, add:

```tsx
it('renders an error toast without an Undo button', () => {
  useToastStore.getState().show({ kind: 'error', label: "Couldn't move chat" });
  render(<UndoToast />);
  expect(screen.getByRole('alert')).toHaveTextContent("Couldn't move chat");
  expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
});

it('Cmd+Z is ignored while an error toast is active', () => {
  useToastStore.getState().show({ kind: 'error', label: "Couldn't move chat" });
  render(<UndoToast />);
  fireEvent.keyDown(window, { key: 'z', metaKey: true });
  // Error toast is unaffected
  expect(useToastStore.getState().toast?.kind).toBe('error');
});
```

- [ ] **Step 5: Run tests, verify pass**

```bash
pnpm --filter @yank/web exec vitest run test/components/primitives/UndoToast.test.tsx
```

Expected: 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/primitives/UndoToast.tsx \
        packages/web/src/components/primitives/UndoToast.module.css \
        packages/web/test/components/primitives/UndoToast.test.tsx
git commit -m "feat(web): add UndoToast primitive bound to toast store"
```

---

### Task C4: Widen `useAssignWorkspace` with optimistic + undo

**Files:**
- Modify: `packages/web/src/lib/mutations.ts`
- Create: `packages/web/test/lib/mutations.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/lib/mutations.test.tsx
import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { Chat } from '@yank/shared';
import { useAssignWorkspace } from '../../src/lib/mutations.js';
import { useToastStore } from '../../src/state/toast.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const CHAT_ID = 'b1ee0d52-2c8e-7e7a-a4cf-000000000001';
const seed: Chat[] = [
  {
    id: CHAT_ID,
    userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
    jid: 'a@s.whatsapp.net',
    type: 'dm',
    subject: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    archived: false,
    mutedUntil: null,
    pinned: false,
    workspace: 'triage',
    memberCount: 0,
    unreadCount: 0,
  },
];

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

function withChats(rows: Chat[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['chats'], rows);
  return qc;
}

beforeEach(() => {
  useToastStore.setState({ toast: null });
  vi.useRealTimers();
});

describe('useAssignWorkspace', () => {
  it('optimistically patches the cache and shows an undo toast on success', async () => {
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, () => new HttpResponse(null, { status: 204 })),
    );
    const qc = withChats(seed);
    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });

    act(() => {
      result.current.mutate({ workspace: 'personal' });
    });

    // Optimistic update is synchronous in onMutate
    expect((qc.getQueryData(['chats']) as Chat[])[0].workspace).toBe('personal');
    expect(useToastStore.getState().toast?.label).toMatch(/personal/i);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back the cache and shows an error toast on failure', async () => {
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const qc = withChats(seed);
    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });

    act(() => {
      result.current.mutate({ workspace: 'personal' });
    });
    expect((qc.getQueryData(['chats']) as Chat[])[0].workspace).toBe('personal');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((qc.getQueryData(['chats']) as Chat[])[0].workspace).toBe('triage');
    expect(useToastStore.getState().toast?.kind).toBe('error');
    expect(useToastStore.getState().toast?.label).toMatch(/couldn['’]t move chat/i);
  });

  it('the undo callback re-assigns to the previous workspace without showing a second toast', async () => {
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, () => new HttpResponse(null, { status: 204 })),
    );
    const qc = withChats(seed);
    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });

    act(() => {
      result.current.mutate({ workspace: 'personal' });
    });
    expect(useToastStore.getState().toast).not.toBeNull();

    const onUndo = useToastStore.getState().toast!.onUndo;
    act(() => {
      onUndo();
    });

    // Cache should swing back to 'triage'
    await waitFor(() => {
      expect((qc.getQueryData(['chats']) as Chat[])[0].workspace).toBe('triage');
    });
    // No second toast popped
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('suppressUndo: true skips showing the toast', async () => {
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, () => new HttpResponse(null, { status: 204 })),
    );
    const qc = withChats(seed);
    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });

    act(() => {
      result.current.mutate({ workspace: 'personal', suppressUndo: true });
    });
    expect(useToastStore.getState().toast).toBeNull();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web exec vitest run test/lib/mutations.test.tsx
```

Expected: FAIL — current signature doesn't match the new `{ workspace, suppressUndo? }` shape; toast not shown.

- [ ] **Step 3: Rewrite `useAssignWorkspace` in `packages/web/src/lib/mutations.ts`**

Replace the existing `useAssignWorkspace` export with:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSchema, type Chat, type Message, type SendMessageBody, type Workspace } from '@yank/shared';
import { apiFetch } from './api.js';
import { queryKeys } from './queryKeys.js';
import { useToastStore } from '../state/toast.js';

// ... keep useSendMessage / useMarkRead / useReact / useStar unchanged ...

interface AssignArgs {
  workspace: Workspace;
  /** Pass true to skip the undo toast (used by the undo callback itself). */
  suppressUndo?: boolean;
}

interface AssignContext {
  snapshot: Chat[] | undefined;
  previousWorkspace: Workspace;
}

function workspaceLabel(ws: Workspace): string {
  switch (ws) {
    case 'work':
      return 'Work';
    case 'personal':
      return 'Personal';
    case 'triage':
      return 'Triage';
    case 'hidden':
      return 'Hidden';
  }
}

export function useAssignWorkspace(chatId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, AssignArgs, AssignContext>({
    mutationFn: ({ workspace }) =>
      apiFetch<void>(`/api/chats/${chatId}/assignment`, {
        method: 'POST',
        body: { workspace },
      }),
    onMutate: ({ workspace, suppressUndo }) => {
      const snapshot = qc.getQueryData<Chat[]>(queryKeys.chats());
      const previousWorkspace: Workspace =
        snapshot?.find((c) => c.id === chatId)?.workspace ?? 'triage';

      qc.setQueryData<Chat[] | undefined>(queryKeys.chats(), (old) =>
        old?.map((c) => (c.id === chatId ? { ...c, workspace } : c)),
      );

      if (!suppressUndo && workspace !== previousWorkspace) {
        useToastStore.getState().show({
          label: `Moved to ${workspaceLabel(workspace)}`,
          onUndo: () => {
            // Re-assign to the previous workspace without showing a second toast
            void apiFetch<void>(`/api/chats/${chatId}/assignment`, {
              method: 'POST',
              body: { workspace: previousWorkspace },
            }).then(() => {
              qc.setQueryData<Chat[] | undefined>(queryKeys.chats(), (old) =>
                old?.map((c) =>
                  c.id === chatId ? { ...c, workspace: previousWorkspace } : c,
                ),
              );
            });
          },
        });
      }

      return { snapshot, previousWorkspace };
    },
    onError: (_err, _args, context) => {
      if (context?.snapshot) {
        qc.setQueryData(queryKeys.chats(), context.snapshot);
      }
      useToastStore.getState().show({
        kind: 'error',
        label: "Couldn't move chat — try again.",
      });
    },
    // No onSettled invalidation — the SSE chat-assignment event reconciles
  });
}
```

Note: this replaces the old narrow `Exclude<Workspace, 'triage'>` typing. The body is identical to the existing pattern but now widened and instrumented with the toast.

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter @yank/web exec vitest run test/lib/mutations.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Run typecheck across the whole web package**

```bash
pnpm --filter @yank/web typecheck
```

Expected: exits 0. (No other M3 caller of `useAssignWorkspace` exists yet — the function was added in M3 but never wired into a component. Verify with `git grep useAssignWorkspace packages/web/src` — should return only `mutations.ts`.)

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib/mutations.ts packages/web/test/lib/mutations.test.tsx
git commit -m "feat(web): widen useAssignWorkspace with optimistic update + undo toast"
```

---

### Task C5: Add `chat-assignment` case to `useEventStream`

**Files:**
- Modify: `packages/web/src/lib/eventStream.ts`
- Modify: `packages/web/test/lib/eventStream.test.tsx`

- [ ] **Step 1: Extend the named-events list and the test**

In `packages/web/test/lib/eventStream.test.tsx`, append a new test inside the existing `describe('useEventStream', ...)` block:

```tsx
it('patches the chats cache in place on a chat-assignment event', () => {
  const qc = new QueryClient();
  qc.setQueryData(['chats'], [
    {
      id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
      userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
      jid: 'a@s.whatsapp.net',
      type: 'dm',
      subject: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      archived: false,
      mutedUntil: null,
      pinned: false,
      workspace: 'triage',
      memberCount: 0,
      unreadCount: 0,
    },
  ]);
  renderHook(() => useEventStream(), { wrapper: wrap(qc) });
  act(() => {
    FakeEventSource.instances[0]?.emit('chat-assignment', {
      type: 'chat-assignment',
      userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
      chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
      workspace: 'personal',
      assignedAt: '2026-05-14T12:00:00.000Z',
    });
  });
  const updated = qc.getQueryData(['chats']) as Array<{ id: string; workspace: string }>;
  expect(updated[0].workspace).toBe('personal');
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web exec vitest run test/lib/eventStream.test.tsx
```

Expected: FAIL — the new test fails because the FakeEventSource has no `chat-assignment` listener registered.

- [ ] **Step 3: Extend `eventStream.ts`**

Update the `NAMED_EVENTS` constant and add a switch case for `chat-assignment`. Edit `packages/web/src/lib/eventStream.ts`:

```ts
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DaemonEventSchema, type DaemonEvent, type Chat } from '@yank/shared';
import { queryKeys } from './queryKeys.js';

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const NAMED_EVENTS = [
  'qr',
  'pair-code',
  'connected',
  'disconnected',
  'sync-progress',
  'sync-complete',
  'message',
  'status',
  'chat-assignment',
] as const;
```

Inside `patchCache`, add the new case alongside the existing ones:

```ts
case 'chat-assignment':
  qc.setQueryData<Chat[] | undefined>(queryKeys.chats(), (old) =>
    old?.map((c) =>
      c.id === evt.chatId ? { ...c, workspace: evt.workspace } : c,
    ),
  );
  return;
```

(Place it just before `default:`. Note: `pair-code` was already on the `NAMED_EVENTS` list in M3 — verify with `git grep "pair-code" packages/web/src/lib/eventStream.ts`. If the M3 file doesn't include it yet, that means this plan's eventStream snapshot is slightly newer than checked-in main; just keep the entry — it harms nothing.)

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter @yank/web exec vitest run test/lib/eventStream.test.tsx
```

Expected: all tests in the file pass (existing + new).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/eventStream.ts packages/web/test/lib/eventStream.test.tsx
git commit -m "feat(web): handle chat-assignment SSE event by patching chats cache"
```

---

## Group D — Triage components

### Task D1: `<TriageEmptyState>` ("Triage clear ✓")

**Files:**
- Create: `packages/web/src/components/triage/TriageEmptyState.tsx`
- Create: `packages/web/src/components/triage/TriageEmptyState.module.css`
- Create: `packages/web/test/components/triage/TriageEmptyState.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/components/triage/TriageEmptyState.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TriageEmptyState } from '../../../src/components/triage/TriageEmptyState.js';

describe('TriageEmptyState', () => {
  it('renders the "triage clear" message', () => {
    render(<TriageEmptyState />);
    expect(screen.getByText(/triage clear/i)).toBeInTheDocument();
    expect(screen.getByText(/new ones will appear here/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web exec vitest run test/components/triage/TriageEmptyState.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// packages/web/src/components/triage/TriageEmptyState.tsx
import styles from './TriageEmptyState.module.css';

export function TriageEmptyState() {
  return (
    <div className={styles.empty} role="status">
      <div className={styles.tick}>✓</div>
      <div className={styles.heading}>Triage clear</div>
      <div className={styles.sub}>All new chats have a home. New ones will appear here.</div>
    </div>
  );
}
```

```css
/* packages/web/src/components/triage/TriageEmptyState.module.css */
.empty {
  padding: 60px 0;
  text-align: center;
  color: var(--fg-2);
}
.tick {
  font-size: 32px;
  margin-bottom: 8px;
}
.heading {
  font-size: 16px;
  color: var(--fg-0);
  font-weight: 500;
  margin-bottom: 4px;
}
.sub {
  color: var(--fg-2);
}
```

- [ ] **Step 4: Run tests, verify pass + commit**

```bash
pnpm --filter @yank/web exec vitest run test/components/triage/TriageEmptyState.test.tsx
git add packages/web/src/components/triage/TriageEmptyState.tsx \
        packages/web/src/components/triage/TriageEmptyState.module.css \
        packages/web/test/components/triage/TriageEmptyState.test.tsx
git commit -m "feat(web): add TriageEmptyState component"
```

---

### Task D2: `<TriageProgressBar>`

**Files:**
- Create: `packages/web/src/components/triage/TriageProgressBar.tsx`
- Create: `packages/web/src/components/triage/TriageProgressBar.module.css`
- Create: `packages/web/test/components/triage/TriageProgressBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/components/triage/TriageProgressBar.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TriageProgressBar } from '../../../src/components/triage/TriageProgressBar.js';

describe('TriageProgressBar', () => {
  it('renders "<done>/<total> cleared"', () => {
    render(<TriageProgressBar done={1} total={4} />);
    expect(screen.getByText('1/4 cleared')).toBeInTheDocument();
  });

  it('sets the fill width to the percentage of done/total', () => {
    const { container } = render(<TriageProgressBar done={3} total={4} />);
    const fill = container.querySelector('.fill') as HTMLElement;
    expect(fill.style.width).toBe('75%');
  });

  it('clamps to 0% when total is 0 (defensive)', () => {
    const { container } = render(<TriageProgressBar done={0} total={0} />);
    const fill = container.querySelector('.fill') as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web exec vitest run test/components/triage/TriageProgressBar.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// packages/web/src/components/triage/TriageProgressBar.tsx
import styles from './TriageProgressBar.module.css';

interface Props {
  done: number;
  total: number;
}

export function TriageProgressBar({ done, total }: Props) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={styles.bar}>
      <span className={styles.text}>{done}/{total} cleared</span>
      <div className={styles.track}>
        <div className={styles.fill + ' fill'} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.hint}>
        <span className={styles.kbd}>↑</span> <span className={styles.kbd}>↓</span> navigate ·
        <span className={styles.kbd}>1</span> work ·
        <span className={styles.kbd}>2</span> personal ·
        <span className={styles.kbd}>3</span> hide
      </span>
    </div>
  );
}
```

(The test selects on the literal `.fill` class; the `+ ' fill'` keeps the class accessible even after CSS-Modules transformation. We rely on `classNameStrategy: 'non-scoped'` from `vitest.config.ts`, but adding the literal token is belt-and-braces.)

```css
/* packages/web/src/components/triage/TriageProgressBar.module.css */
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--fg-2);
  font-size: 12px;
}
.text {
  color: var(--fg-1);
}
.track {
  flex: 1;
  height: 4px;
  background: var(--bg-3);
  border-radius: 2px;
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--c-triage);
  transition: width 120ms ease-out;
}
.hint {
  font-family: var(--font-mono);
  color: var(--fg-3);
  font-size: 11px;
}
.kbd {
  border: 1px solid var(--border);
  padding: 0 4px;
  border-radius: 3px;
}
```

- [ ] **Step 4: Run tests, verify pass + commit**

```bash
pnpm --filter @yank/web exec vitest run test/components/triage/TriageProgressBar.test.tsx
git add packages/web/src/components/triage/TriageProgressBar.tsx \
        packages/web/src/components/triage/TriageProgressBar.module.css \
        packages/web/test/components/triage/TriageProgressBar.test.tsx
git commit -m "feat(web): add TriageProgressBar component"
```

---

### Task D3: `<TriageActions>` — the three Work/Personal/Hide buttons

**Files:**
- Create: `packages/web/src/components/triage/TriageActions.tsx`
- Create: `packages/web/src/components/triage/TriageActions.module.css`
- Create: `packages/web/test/components/triage/TriageActions.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/components/triage/TriageActions.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TriageActions } from '../../../src/components/triage/TriageActions.js';

describe('TriageActions', () => {
  it('renders three buttons with workspace labels and keyboard hints', () => {
    render(<TriageActions onAssign={() => {}} />);
    expect(screen.getByRole('button', { name: /work/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /personal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide/i })).toBeInTheDocument();
  });

  it('calls onAssign with the matching workspace on click', () => {
    const onAssign = vi.fn();
    render(<TriageActions onAssign={onAssign} />);
    fireEvent.click(screen.getByRole('button', { name: /work/i }));
    fireEvent.click(screen.getByRole('button', { name: /personal/i }));
    fireEvent.click(screen.getByRole('button', { name: /hide/i }));
    expect(onAssign).toHaveBeenNthCalledWith(1, 'work');
    expect(onAssign).toHaveBeenNthCalledWith(2, 'personal');
    expect(onAssign).toHaveBeenNthCalledWith(3, 'hidden');
  });

  it('does not bubble the click (e.stopPropagation)', () => {
    const onAssign = vi.fn();
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <TriageActions onAssign={onAssign} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /work/i }));
    expect(onAssign).toHaveBeenCalled();
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web exec vitest run test/components/triage/TriageActions.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// packages/web/src/components/triage/TriageActions.tsx
import type { MouseEvent } from 'react';
import type { Workspace } from '@yank/shared';
import styles from './TriageActions.module.css';

type Assignable = Exclude<Workspace, 'triage'>;

interface Props {
  onAssign: (ws: Assignable) => void;
}

export function TriageActions({ onAssign }: Props) {
  const handle = (ws: Assignable) => (e: MouseEvent) => {
    e.stopPropagation();
    onAssign(ws);
  };
  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.btn + ' ' + styles.work}
        onClick={handle('work')}
      >
        <span className={styles.dot + ' ' + styles.dotWork} />
        Work
        <span className={styles.kbd}>1</span>
      </button>
      <button
        type="button"
        className={styles.btn + ' ' + styles.personal}
        onClick={handle('personal')}
      >
        <span className={styles.dot + ' ' + styles.dotPersonal} />
        Personal
        <span className={styles.kbd}>2</span>
      </button>
      <button
        type="button"
        className={styles.btn + ' ' + styles.hide}
        onClick={handle('hidden')}
      >
        <span className={styles.dot + ' ' + styles.dotHide} />
        Hide
        <span className={styles.kbd}>3</span>
      </button>
    </div>
  );
}
```

```css
/* packages/web/src/components/triage/TriageActions.module.css */
.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--fg-1);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.btn:hover {
  background: var(--bg-3);
  border-color: var(--border-strong);
}
.kbd {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-3);
  border: 1px solid var(--border);
  padding: 0 4px;
  border-radius: 3px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dotWork {
  background: var(--c-work);
}
.dotPersonal {
  background: var(--c-personal);
}
.dotHide {
  background: var(--fg-3);
}
.work:hover {
  border-color: var(--c-work);
  color: var(--c-work);
}
.personal:hover {
  border-color: var(--c-personal);
  color: var(--c-personal);
}
.hide:hover {
  border-color: var(--fg-3);
  color: var(--fg-1);
}
```

- [ ] **Step 4: Run tests, verify pass + commit**

```bash
pnpm --filter @yank/web exec vitest run test/components/triage/TriageActions.test.tsx
git add packages/web/src/components/triage/TriageActions.tsx \
        packages/web/src/components/triage/TriageActions.module.css \
        packages/web/test/components/triage/TriageActions.test.tsx
git commit -m "feat(web): add TriageActions (Work/Personal/Hide buttons)"
```

---

### Task D4: `<TriageCard>` — single card composition

**Files:**
- Create: `packages/web/src/components/triage/TriageCard.tsx`
- Create: `packages/web/src/components/triage/TriageCard.module.css`
- Create: `packages/web/test/components/triage/TriageCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/components/triage/TriageCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Chat } from '@yank/shared';
import { TriageCard } from '../../../src/components/triage/TriageCard.js';

const chat: Chat = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  jid: '4477@s.whatsapp.net',
  type: 'dm',
  subject: 'Ben (plumber)',
  lastMessageAt: '2026-05-14T10:02:00.000Z',
  lastMessagePreview: 'can come Thursday 9-11 for the leak',
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage',
  memberCount: 0,
  unreadCount: 0,
};

describe('TriageCard', () => {
  it('renders subject, last preview, and the action buttons', () => {
    render(<TriageCard chat={chat} focused={false} onFocus={() => {}} onAssign={() => {}} />);
    expect(screen.getByText('Ben (plumber)')).toBeInTheDocument();
    expect(screen.getByText(/can come Thursday/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /work/i })).toBeInTheDocument();
  });

  it('falls back to jid when subject is null', () => {
    render(
      <TriageCard
        chat={{ ...chat, subject: null }}
        focused={false}
        onFocus={() => {}}
        onAssign={() => {}}
      />,
    );
    expect(screen.getByText('4477@s.whatsapp.net')).toBeInTheDocument();
  });

  it('applies the focused style when focused=true', () => {
    const { container } = render(
      <TriageCard chat={chat} focused={true} onFocus={() => {}} onAssign={() => {}} />,
    );
    const card = container.querySelector('article');
    expect(card?.getAttribute('data-focused')).toBe('true');
  });

  it('clicking the card calls onFocus', () => {
    const onFocus = vi.fn();
    render(<TriageCard chat={chat} focused={false} onFocus={onFocus} onAssign={() => {}} />);
    fireEvent.click(screen.getByText('Ben (plumber)'));
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('clicking a button calls onAssign and not onFocus', () => {
    const onAssign = vi.fn();
    const onFocus = vi.fn();
    render(<TriageCard chat={chat} focused={false} onFocus={onFocus} onAssign={onAssign} />);
    fireEvent.click(screen.getByRole('button', { name: /personal/i }));
    expect(onAssign).toHaveBeenCalledWith('personal');
    expect(onFocus).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web exec vitest run test/components/triage/TriageCard.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// packages/web/src/components/triage/TriageCard.tsx
import type { Chat, Workspace } from '@yank/shared';
import { Avatar } from '../primitives/Avatar.js';
import { TriageActions } from './TriageActions.js';
import styles from './TriageCard.module.css';

type Assignable = Exclude<Workspace, 'triage'>;

interface Props {
  chat: Chat;
  focused: boolean;
  onFocus: () => void;
  onAssign: (ws: Assignable) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function TriageCard({ chat, focused, onFocus, onAssign }: Props) {
  const title = chat.subject ?? chat.jid;
  return (
    <article
      className={styles.card + (focused ? ' ' + styles.focused : '')}
      data-focused={focused ? 'true' : 'false'}
      onClick={onFocus}
    >
      <Avatar seed={title} initials={title.slice(0, 2).toUpperCase()} />
      <div className={styles.body}>
        <header className={styles.head}>
          <span className={styles.who}>{title}</span>
          <span className={styles.meta}>· {formatTime(chat.lastMessageAt)}</span>
        </header>
        <p className={styles.preview}>{chat.lastMessagePreview ?? ''}</p>
      </div>
      <TriageActions onAssign={onAssign} />
    </article>
  );
}
```

```css
/* packages/web/src/components/triage/TriageCard.module.css */
.card {
  display: grid;
  grid-template-columns: 32px 1fr auto;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  align-items: start;
}
.card:hover {
  border-color: var(--border-strong);
}
.focused {
  border-color: var(--c-triage);
  box-shadow: 0 0 0 3px var(--c-triage-soft);
}
.body {
  min-width: 0;
}
.head {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.who {
  font-weight: 700;
  font-size: 14.5px;
  color: var(--fg-0);
}
.meta {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-3);
}
.preview {
  margin: 6px 0 0;
  color: var(--fg-2);
  font-size: 13px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
```

- [ ] **Step 4: Run tests, verify pass + commit**

```bash
pnpm --filter @yank/web exec vitest run test/components/triage/TriageCard.test.tsx
git add packages/web/src/components/triage/TriageCard.tsx \
        packages/web/src/components/triage/TriageCard.module.css \
        packages/web/test/components/triage/TriageCard.test.tsx
git commit -m "feat(web): add TriageCard component"
```

---

### Task D5: `useTriageKeys` hook

**Files:**
- Create: `packages/web/src/hooks/useTriageKeys.ts`
- Create: `packages/web/test/hooks/useTriageKeys.test.tsx`

The hook is route-scoped — mounted by `<TriageView>` only. It listens for `1`/`2`/`3`, `j`/`k`/`ArrowUp`/`ArrowDown`. The global `Cmd+Z` is owned by `<UndoToast>` (Task C3); this hook does not also listen for it.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/hooks/useTriageKeys.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTriageKeys } from '../../src/hooks/useTriageKeys.js';

function fire(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }));
}

describe('useTriageKeys', () => {
  it('calls onAssign("work") for "1"', () => {
    const onAssign = vi.fn();
    const onMove = vi.fn();
    renderHook(() => useTriageKeys({ enabled: true, onAssign, onMove }));
    fire('1');
    expect(onAssign).toHaveBeenCalledWith('work');
  });

  it('calls onAssign("personal") for "2"', () => {
    const onAssign = vi.fn();
    renderHook(() => useTriageKeys({ enabled: true, onAssign, onMove: () => {} }));
    fire('2');
    expect(onAssign).toHaveBeenCalledWith('personal');
  });

  it('calls onAssign("hidden") for "3"', () => {
    const onAssign = vi.fn();
    renderHook(() => useTriageKeys({ enabled: true, onAssign, onMove: () => {} }));
    fire('3');
    expect(onAssign).toHaveBeenCalledWith('hidden');
  });

  it('calls onMove(1) for "j" / ArrowDown', () => {
    const onMove = vi.fn();
    renderHook(() => useTriageKeys({ enabled: true, onAssign: () => {}, onMove }));
    fire('j');
    fire('ArrowDown');
    expect(onMove).toHaveBeenNthCalledWith(1, 1);
    expect(onMove).toHaveBeenNthCalledWith(2, 1);
  });

  it('calls onMove(-1) for "k" / ArrowUp', () => {
    const onMove = vi.fn();
    renderHook(() => useTriageKeys({ enabled: true, onAssign: () => {}, onMove }));
    fire('k');
    fire('ArrowUp');
    expect(onMove).toHaveBeenNthCalledWith(1, -1);
    expect(onMove).toHaveBeenNthCalledWith(2, -1);
  });

  it('does nothing when an input is focused', () => {
    const onAssign = vi.fn();
    renderHook(() => useTriageKeys({ enabled: true, onAssign, onMove: () => {} }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    expect(onAssign).not.toHaveBeenCalled();
    input.remove();
  });

  it('does nothing when modifier keys are pressed (Cmd+1 reserved for workspace switch)', () => {
    const onAssign = vi.fn();
    renderHook(() => useTriageKeys({ enabled: true, onAssign, onMove: () => {} }));
    fire('1', { metaKey: true });
    fire('1', { ctrlKey: true });
    expect(onAssign).not.toHaveBeenCalled();
  });

  it('does nothing when enabled=false', () => {
    const onAssign = vi.fn();
    renderHook(() => useTriageKeys({ enabled: false, onAssign, onMove: () => {} }));
    fire('1');
    expect(onAssign).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web exec vitest run test/hooks/useTriageKeys.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// packages/web/src/hooks/useTriageKeys.ts
import { useEffect } from 'react';
import type { Workspace } from '@yank/shared';

type Assignable = Exclude<Workspace, 'triage'>;

interface Options {
  enabled: boolean;
  onAssign: (ws: Assignable) => void;
  onMove: (delta: 1 | -1) => void;
}

export function useTriageKeys({ enabled, onAssign, onMove }: Options): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      const tag = target instanceof HTMLElement ? target.tagName : '';
      const inEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (inEditable) return;

      switch (e.key) {
        case '1':
          e.preventDefault();
          onAssign('work');
          return;
        case '2':
          e.preventDefault();
          onAssign('personal');
          return;
        case '3':
          e.preventDefault();
          onAssign('hidden');
          return;
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          onMove(1);
          return;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          onMove(-1);
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onAssign, onMove]);
}
```

- [ ] **Step 4: Run tests, verify pass + commit**

```bash
pnpm --filter @yank/web exec vitest run test/hooks/useTriageKeys.test.tsx
git add packages/web/src/hooks/useTriageKeys.ts packages/web/test/hooks/useTriageKeys.test.tsx
git commit -m "feat(web): add useTriageKeys hook for 1/2/3 + j/k navigation"
```

---

### Task D6: `<TriageView>` — composition + focus management

**Files:**
- Create: `packages/web/src/components/triage/TriageView.tsx`
- Create: `packages/web/src/components/triage/TriageView.module.css`
- Create: `packages/web/test/components/triage/TriageView.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/components/triage/TriageView.test.tsx
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { Chat } from '@yank/shared';
import { TriageView } from '../../../src/components/triage/TriageView.js';
import { useToastStore } from '../../../src/state/toast.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const triageChats: Chat[] = [1, 2, 3].map((i) => ({
  id: `b1ee0d52-2c8e-7e7a-a4cf-00000000000${i}`,
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  jid: `chat-${i}@g.us`,
  type: 'group',
  subject: `Chat ${i}`,
  lastMessageAt: `2026-05-14T0${i}:00:00.000Z`,
  lastMessagePreview: `preview ${i}`,
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage',
  memberCount: 0,
  unreadCount: 0,
}));

function setup(initial: Chat[]) {
  useToastStore.setState({ toast: null });
  server.use(
    http.get('/api/chats', () => HttpResponse.json(initial)),
    http.post(/\/api\/chats\/.+\/assignment/, () => new HttpResponse(null, { status: 204 })),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client: qc }, createElement(TriageView)),
    { wrapper: wrap(qc) },
  );
}

describe('TriageView', () => {
  it('renders every triage chat as a card sorted newest first', async () => {
    setup(triageChats);
    await waitFor(() => expect(screen.getByText('Chat 3')).toBeInTheDocument());
    const titles = screen.getAllByRole('article').map((a) =>
      (a.querySelector('p, span, header')?.textContent ?? '').slice(0, 6),
    );
    // Newest chat (lastMessageAt = 03:…) first
    expect(titles[0]).toMatch(/Chat 3/);
  });

  it('1 assigns the focused card to work, removes it, and shows the undo toast', async () => {
    setup(triageChats);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
    fireEvent.keyDown(window, { key: '1' });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    expect(useToastStore.getState().toast?.label).toMatch(/work/i);
  });

  it('renders the empty state when the triage list is empty', async () => {
    setup([]);
    await waitFor(() =>
      expect(screen.getByRole('status', { name: /triage clear/i })).toBeInTheDocument(),
    );
  });

  it('renders the empty state after the last card is assigned', async () => {
    setup([triageChats[0]!]);
    await waitFor(() => expect(screen.getByRole('article')).toBeInTheDocument());
    fireEvent.keyDown(window, { key: '1' });
    await waitFor(() =>
      expect(screen.getByRole('status', { name: /triage clear/i })).toBeInTheDocument(),
    );
  });

  it('ArrowDown moves focus and 2 assigns the newly-focused card', async () => {
    setup(triageChats);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: '2' });
    await waitFor(() => expect(useToastStore.getState().toast?.label).toMatch(/personal/i));
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web exec vitest run test/components/triage/TriageView.test.tsx
```

Expected: FAIL — `TriageView` not found.

- [ ] **Step 3: Implement**

```tsx
// packages/web/src/components/triage/TriageView.tsx
import { useState, useEffect, useCallback } from 'react';
import { useTriageChats } from '../../lib/selectors.js';
import { useAssignWorkspace } from '../../lib/mutations.js';
import { useTriageKeys } from '../../hooks/useTriageKeys.js';
import { TriageCard } from './TriageCard.js';
import { TriageEmptyState } from './TriageEmptyState.js';
import { TriageProgressBar } from './TriageProgressBar.js';
import { InboxIcon } from '../icons/index.js';
import styles from './TriageView.module.css';
import type { Workspace } from '@yank/shared';

type Assignable = Exclude<Workspace, 'triage'>;

export function TriageView() {
  const chats = useTriageChats();
  const [focusedIdx, setFocusedIdx] = useState(0);
  // Total triage count *seen so far in this session* — used for the progress bar.
  // Resets on mount and grows when new triage chats appear; never shrinks.
  const [seenTotal, setSeenTotal] = useState(chats.length);

  useEffect(() => {
    setSeenTotal((t) => Math.max(t, chats.length));
  }, [chats.length]);

  useEffect(() => {
    // Keep focused index inside the array bounds when items disappear.
    if (focusedIdx >= chats.length && chats.length > 0) {
      setFocusedIdx(chats.length - 1);
    }
  }, [chats.length, focusedIdx]);

  // Bind a single mutation hook per *focused* chat — mutations.mutate carries
  // the chatId via closure, so we need a stable hook call per render path.
  // Instead, derive the chatId at call time and dispatch via a tiny helper.
  const focusedChat = chats[focusedIdx];
  const assignMutation = useAssignWorkspace(focusedChat?.id ?? '');

  const handleAssign = useCallback(
    (ws: Assignable) => {
      if (!focusedChat) return;
      assignMutation.mutate({ workspace: ws });
    },
    [focusedChat, assignMutation],
  );

  const handleMove = useCallback(
    (delta: 1 | -1) => {
      setFocusedIdx((i) => {
        const next = i + delta;
        if (next < 0) return 0;
        if (next > chats.length - 1) return Math.max(0, chats.length - 1);
        return next;
      });
    },
    [chats.length],
  );

  useTriageKeys({ enabled: chats.length > 0, onAssign: handleAssign, onMove: handleMove });

  const done = Math.max(0, seenTotal - chats.length);

  return (
    <main className={styles.pane}>
      <header className={styles.topbar}>
        <div className={styles.topLeft}>
          <span className={styles.icon}>
            <InboxIcon size={14} />
          </span>
          <div>
            <h1 className={styles.title}>Triage</h1>
            <div className={styles.sub}>
              <span>{chats.length} unassigned chats</span>
              <span className={styles.sep}>·</span>
              <span>
                Decide where each one lives. Use{' '}
                <span className={styles.kbd}>1</span>{' '}
                <span className={styles.kbd}>2</span>{' '}
                <span className={styles.kbd}>3</span>.
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.body}>
        {chats.length > 0 && <TriageProgressBar done={done} total={seenTotal} />}
        {chats.length === 0 && <TriageEmptyState />}
        {chats.map((c, i) => {
          // The focused card uses the bound mutation; non-focused cards bind on demand.
          if (i === focusedIdx) {
            return (
              <TriageCard
                key={c.id}
                chat={c}
                focused={true}
                onFocus={() => setFocusedIdx(i)}
                onAssign={handleAssign}
              />
            );
          }
          return (
            <UnfocusedCard key={c.id} chat={c} index={i} onFocus={setFocusedIdx} />
          );
        })}
      </section>
    </main>
  );
}

interface UnfocusedProps {
  chat: import('@yank/shared').Chat;
  index: number;
  onFocus: (idx: number) => void;
}

function UnfocusedCard({ chat, index, onFocus }: UnfocusedProps) {
  const m = useAssignWorkspace(chat.id);
  return (
    <TriageCard
      chat={chat}
      focused={false}
      onFocus={() => onFocus(index)}
      onAssign={(ws) => m.mutate({ workspace: ws })}
    />
  );
}
```

> Implementation note: each card binds its own `useAssignWorkspace` to keep the mutation closure on the right chatId. This is a small (`<TriageCard>`-sized) overhead and avoids passing chatId through a mutation arg. Hooks are called unconditionally per render of each card → no rules-of-hooks issue.

```css
/* packages/web/src/components/triage/TriageView.module.css */
.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-0);
  color: var(--fg-1);
  overflow: hidden;
}
.topbar {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
}
.topLeft {
  display: flex;
  align-items: center;
  gap: 10px;
}
.icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: var(--c-triage-soft);
  color: var(--c-triage);
}
.title {
  font-size: 14.5px;
  font-weight: 700;
  margin: 0;
  color: var(--fg-0);
}
.sub {
  font-size: 12px;
  color: var(--fg-2);
  margin-top: 2px;
}
.sep {
  margin: 0 6px;
  color: var(--fg-3);
}
.kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-3);
  border: 1px solid var(--border);
  padding: 0 4px;
  border-radius: 3px;
}
.body {
  padding: 16px;
  overflow: auto;
  flex: 1;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter @yank/web exec vitest run test/components/triage/TriageView.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/triage/TriageView.tsx \
        packages/web/src/components/triage/TriageView.module.css \
        packages/web/test/components/triage/TriageView.test.tsx
git commit -m "feat(web): add TriageView composing cards, keys, progress, empty state"
```

---

## Group E — Route + shell wiring

### Task E1: Replace `/triage` route stub with `<TriageView />`

**Files:**
- Modify: `packages/web/src/routes/triage.tsx`

- [ ] **Step 1: Rewrite the route file**

```tsx
// packages/web/src/routes/triage.tsx
import { createFileRoute } from '@tanstack/react-router';
import { TriageView } from '../components/triage/TriageView.js';

export const Route = createFileRoute('/triage')({
  component: TriageView,
});
```

- [ ] **Step 2: Verify the dev server boots and `/triage` renders**

```bash
pnpm --filter @yank/web dev
```

In another terminal:

```bash
curl -s http://localhost:5173/triage > /dev/null
```

Expected: 200. Stop the dev server with Ctrl-C.

- [ ] **Step 3: Run lint + typecheck**

```bash
pnpm --filter @yank/web lint
pnpm --filter @yank/web typecheck
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/routes/triage.tsx
git commit -m "feat(web): wire /triage route to TriageView"
```

---

### Task E2: Mount `<UndoToast>` at the root

**Files:**
- Modify: `packages/web/src/routes/__root.tsx`

- [ ] **Step 1: Add the import + render**

Edit `packages/web/src/routes/__root.tsx`:

```tsx
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { useEventStream } from '../lib/eventStream.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace.js';
import { useUiStore } from '../state/ui.js';
import { Rail } from '../components/shell/Rail.js';
import { Sidebar } from '../components/shell/Sidebar.js';
import { CommandPalette } from '../components/palette/CommandPalette.js';
import { UndoToast } from '../components/primitives/UndoToast.js';
import styles from './__root.module.css';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  useEventStream();
  useKeyboardShortcuts();
  useActiveWorkspace();

  const openThreadId = useUiStore((s) => s.openThreadId);
  const paletteOpen = useUiStore((s) => s.paletteOpen);

  return (
    <div
      className={styles.shell + (openThreadId ? ' ' + styles.threadOpen : '')}
      data-thread-open={openThreadId ? 'true' : 'false'}
    >
      <Rail />
      <Sidebar />
      <Outlet />
      {paletteOpen && <CommandPalette />}
      <UndoToast />
    </div>
  );
}
```

- [ ] **Step 2: Verify dev server boots + lint + typecheck**

```bash
pnpm --filter @yank/web lint
pnpm --filter @yank/web typecheck
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/__root.tsx
git commit -m "feat(web): mount UndoToast at the root layout"
```

---

### Task E3: Refactor `Rail.tsx` to use the new selector

**Files:**
- Modify: `packages/web/src/components/shell/Rail.tsx`
- Modify: `packages/web/test/components/shell/Rail.test.tsx`

- [ ] **Step 1: Update the test** (if `Rail.test.tsx` has assertions about the count badge, they keep working; add or adjust as needed). Open `packages/web/test/components/shell/Rail.test.tsx`, locate the existing assertions on `triageCount`, and confirm they still target the badge.

If the existing Rail test doesn't already check the count badge, add this case (reuses the `renderRail()` helper + `setupServer` boilerplate already in the file):

```tsx
it('shows the triage count badge when there are triage chats', async () => {
  server.use(
    http.get('/api/chats', () =>
      HttpResponse.json([
        {
          id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
          userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
          jid: 'a@g.us',
          type: 'group',
          subject: 'Work A',
          lastMessageAt: null,
          lastMessagePreview: null,
          archived: false,
          mutedUntil: null,
          pinned: false,
          workspace: 'work',
          memberCount: 0,
          unreadCount: 0,
        },
        {
          id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002',
          userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
          jid: 't1@g.us',
          type: 'group',
          subject: 'Triage One',
          lastMessageAt: null,
          lastMessagePreview: null,
          archived: false,
          mutedUntil: null,
          pinned: false,
          workspace: 'triage',
          memberCount: 0,
          unreadCount: 0,
        },
        {
          id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000003',
          userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
          jid: 't2@g.us',
          type: 'group',
          subject: 'Triage Two',
          lastMessageAt: null,
          lastMessagePreview: null,
          archived: false,
          mutedUntil: null,
          pinned: false,
          workspace: 'triage',
          memberCount: 0,
          unreadCount: 0,
        },
      ]),
    ),
  );
  renderRail();
  await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
});
```

- [ ] **Step 2: Swap the inline filter for the selector**

```tsx
// packages/web/src/components/shell/Rail.tsx
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useUiStore } from '../../state/ui.js';
import { useTriageCount } from '../../lib/selectors.js';
import { RailButton } from './RailButton.js';
// ...keep the rest of the imports unchanged...

export function Rail() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const workspace = useUiStore((s) => s.workspace);
  const setWorkspace = useUiStore((s) => s.setWorkspace);
  const triageCount = useTriageCount();

  // ...rest of the component unchanged; remove the now-unused
  // `useChats` import + `const { data: chats = [] }` line + inline filter...
}
```

- [ ] **Step 3: Run tests + typecheck**

```bash
pnpm --filter @yank/web exec vitest run test/components/shell/Rail.test.tsx
pnpm --filter @yank/web typecheck
```

Expected: tests pass; typecheck exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/shell/Rail.tsx \
        packages/web/test/components/shell/Rail.test.tsx
git commit -m "refactor(web): Rail reads useTriageCount selector instead of inline filter"
```

---

### Task E4: Refactor `Sidebar.tsx` to use the new selector

**Files:**
- Modify: `packages/web/src/components/shell/Sidebar.tsx`

The Sidebar's behaviour stays identical (filter by current workspace); the change is plumbing. Hidden chats already can't match because `useUiStore.workspace` is constrained to `Exclude<Workspace, 'hidden'>`.

- [ ] **Step 1: Swap the inline filter for the selector**

```tsx
// packages/web/src/components/shell/Sidebar.tsx
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useChatsForWorkspace } from '../../lib/selectors.js';
import { useUiStore } from '../../state/ui.js';
import { ChatRow } from './ChatRow.js';
import { PhoneStatusFoot } from './PhoneStatusFoot.js';
import { SearchIcon, ChevronDownIcon, PlusIcon, MoreIcon } from '../icons/index.js';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const workspace = useUiStore((s) => s.workspace);
  const togglePalette = useUiStore((s) => s.togglePalette);
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { chatId?: string };
  const activeChatId = params.chatId;
  const wsChats = useChatsForWorkspace(workspace);

  const { pinned, groups, dms } = useMemo(
    () => ({
      pinned: wsChats.filter((c) => c.pinned),
      groups: wsChats.filter((c) => !c.pinned && c.type !== 'dm'),
      dms: wsChats.filter((c) => !c.pinned && c.type === 'dm'),
    }),
    [wsChats],
  );

  // ...keep the rest of the component unchanged; remove the now-unused
  // `useChats` and `Chat` imports if they become unused...
}
```

- [ ] **Step 2: Run the existing Sidebar test + typecheck**

```bash
pnpm --filter @yank/web exec vitest run test/components/shell/Sidebar.test.tsx
pnpm --filter @yank/web typecheck
```

Expected: existing tests pass unchanged.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/shell/Sidebar.tsx
git commit -m "refactor(web): Sidebar reads useChatsForWorkspace selector"
```

---

### Task E5: CommandPalette excludes hidden chats

**Files:**
- Modify: `packages/web/src/components/palette/CommandPalette.tsx`
- Modify: `packages/web/test/components/palette/CommandPalette.test.tsx`

- [ ] **Step 1: Write the failing test** — add this case to the existing `describe('CommandPalette', ...)` block (do not rewrite the file). The existing file already has `setupServer`, `renderPalette`, and `useUiStore` plumbing; reuse them. You'll also need `waitFor` from `@testing-library/react` — add it to the import line at the top of the file if it's not already there.

```tsx
it('does not list chats with workspace="hidden"', async () => {
  useUiStore.setState({ paletteOpen: true });
  server.use(
    http.get('/api/chats', () =>
      HttpResponse.json([
        {
          id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
          userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
          jid: 'a@g.us',
          type: 'group',
          subject: 'Visible One',
          lastMessageAt: null,
          lastMessagePreview: null,
          archived: false,
          mutedUntil: null,
          pinned: false,
          workspace: 'work',
          memberCount: 0,
          unreadCount: 0,
        },
        {
          id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002',
          userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
          jid: 'b@g.us',
          type: 'group',
          subject: 'Hidden One',
          lastMessageAt: null,
          lastMessagePreview: null,
          archived: false,
          mutedUntil: null,
          pinned: false,
          workspace: 'hidden',
          memberCount: 0,
          unreadCount: 0,
        },
      ]),
    ),
  );
  renderPalette();
  await waitFor(() => expect(screen.getByText('Visible One')).toBeInTheDocument());
  expect(screen.queryByText('Hidden One')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web exec vitest run test/components/palette/CommandPalette.test.tsx
```

Expected: FAIL — "Hidden One" *is* in the document.

- [ ] **Step 3: Swap `useChats` for `useChatsExcludingHidden`**

```tsx
// packages/web/src/components/palette/CommandPalette.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useUiStore } from '../../state/ui.js';
import { useChatsExcludingHidden } from '../../lib/selectors.js';
// ...keep the rest of the imports unchanged...

export function CommandPalette() {
  const navigate = useNavigate();
  const togglePalette = useUiStore((s) => s.togglePalette);
  const chats = useChatsExcludingHidden();
  // ...rest unchanged...
}
```

(Drop the `data: chats = [] = useChats()` line and replace with the selector call.)

- [ ] **Step 4: Run tests, verify pass + commit**

```bash
pnpm --filter @yank/web exec vitest run test/components/palette/CommandPalette.test.tsx
pnpm --filter @yank/web typecheck
git add packages/web/src/components/palette/CommandPalette.tsx \
        packages/web/test/components/palette/CommandPalette.test.tsx
git commit -m "fix(web): exclude hidden chats from command palette quick-switcher"
```

---

## Group F — E2E

### Task F1: Playwright triage smoke

**Files:**
- Create: `packages/web/e2e/triage.spec.ts`

This test runs against the existing playwright fixture server (the M3 setup that the M2 smoke already uses). It loads `/triage`, asserts the cards render, hits `1` to assign the first card to Work, asserts it disappears, then clicks Undo and asserts it returns.

- [ ] **Step 1: Confirm the M3 Playwright config + fixtures**

```bash
ls packages/web/playwright.config.ts packages/web/e2e/
```

Expected: `playwright.config.ts` exists; `e2e/happy-path.spec.ts` exists from M2 + M3.

- [ ] **Step 2: Add the spec**

```ts
// packages/web/e2e/triage.spec.ts
import { test, expect } from '@playwright/test';

// The fixture server (configured in playwright.config.ts) seeds at least one
// triage chat. If the underlying api was hit live, this spec would be skipped.

test.describe('triage', () => {
  test('assigning a card removes it from the grid', async ({ page }) => {
    await page.goto('/triage');
    const articles = page.getByRole('article');
    const before = await articles.count();
    test.skip(before === 0, 'no triage chats seeded; skipping');

    await page.keyboard.press('1');

    await expect(articles).toHaveCount(before - 1);
    await expect(page.getByRole('status').filter({ hasText: /moved to work/i })).toBeVisible();
  });

  test('undo restores the assigned card', async ({ page }) => {
    await page.goto('/triage');
    const articles = page.getByRole('article');
    const before = await articles.count();
    test.skip(before === 0, 'no triage chats seeded; skipping');

    await page.keyboard.press('1');
    await expect(articles).toHaveCount(before - 1);

    await page.getByRole('button', { name: /undo/i }).click();
    await expect(articles).toHaveCount(before);
  });

  test('empty state renders when there are no triage chats', async ({ page }) => {
    await page.goto('/triage');
    const articles = page.getByRole('article');
    const before = await articles.count();
    if (before === 0) {
      await expect(page.getByRole('status', { name: /triage clear/i })).toBeVisible();
    }
  });
});
```

- [ ] **Step 3: Run the spec**

```bash
pnpm --filter @yank/web e2e --grep 'triage'
```

Expected: 3 specs pass (or skip when the fixture has 0 triage chats).

- [ ] **Step 4: Commit**

```bash
git add packages/web/e2e/triage.spec.ts
git commit -m "test(web): add Playwright smoke for triage assign + undo"
```

---

## Final verification

- [ ] **Run the full suite**

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all four exit 0.

- [ ] **Manual smoke** — start the full stack and exercise the triage flow:

```bash
pnpm dev
```

In another shell, with a real WhatsApp link or the daemon fake connector:

1. Open `http://localhost:5173/`. Verify there is at least one triage chat (one of the seeded chats from the daemon should land in `workspace='triage'` by default).
2. Click the Triage rail button (or press `Cmd+3`). Verify the card grid renders.
3. Press `1`. Verify the first card disappears and the undo toast shows.
4. Click Undo. Verify the card returns.
5. Press `3`. Verify the card disappears and the toast shows "Moved to Hidden".
6. Wait 6 s. Verify the toast auto-dismisses.
7. Open a second browser tab on `/triage`. In the first tab, press `2`. Verify the card disappears in **both** tabs.

- [ ] **Open PR** (or merge to `main` per the user's branching preference).

```bash
git push -u origin feat/m4-triage
gh pr create --title "feat: M4 Triage (card grid + assignment endpoint + undo toast)" \
  --body "Implements the M4 Triage milestone per [docs/superpowers/specs/2026-05-14-yank-m4-triage-design.md](docs/superpowers/specs/2026-05-14-yank-m4-triage-design.md)."
```

---

## What's NOT in M4 (deferred to later milestones)

- **Per-chat re-assignment from outside `/triage`** (e.g., chat topbar menu to move a chat to a different workspace later). Triage covers the dominant first-run + new-chat flow.
- **Bulk operations** ("Hide all remaining", "Move all to Work"). Out of scope at expected list size.
- **Touch swipe gestures** on `<TriageCard>` — PWA mobile-polish milestone.
- **`/hidden` recovery view** and **`/settings/workspaces`** — recovery for accidentally-hidden chats sits behind the (deferred) settings surface. The 5 s undo toast covers the immediate-mistake case.
- **Search / filter inside `/triage`** — not needed at expected scale (~50 first-run, ~1/day after).

---

## References

- Spec: [`docs/superpowers/specs/2026-05-14-yank-m4-triage-design.md`](../specs/2026-05-14-yank-m4-triage-design.md)
- Design language source: `docs/superpowers/specs/mockups/2026-05-14-claude-design/project/src/views.jsx` (lines 41–149: `TriageView`), `docs/superpowers/specs/mockups/2026-05-14-claude-design/project/styles.css` (lines 945–1011: `triage-*` styles)
- Predecessor plan: [`docs/superpowers/plans/2026-05-14-yank-m3-frontend.md`](2026-05-14-yank-m3-frontend.md)
- Architectural invariants: [`CLAUDE.md`](../../../CLAUDE.md)
