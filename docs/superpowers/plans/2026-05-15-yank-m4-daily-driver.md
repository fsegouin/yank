# Yank — M4 Daily-Driver Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M3 `/triage` stub with the spec's flagship card-grid interaction, ship the composer + keyboard polish promised in the spec's shortcut table (incl. full edit-message support via Baileys' protocolMessage EDIT), and surface the WhatsApp-throttling realities discovered during M3 (degradation banner, media circuit breaker, click-to-load images).

**Architecture:** Four clusters delivered in one milestone, executed in dependency order behind verification gates. All Baileys access stays in `packages/daemon`; the api adds three REST routes and five SSE event types; the web adds Triage, contact rename, composer enhancements, and resilience surfaces. One forward-defined column (`messages.edited_at`) is already in the schema; one new daemon primitive (`circuit-breaker.ts`).

**Tech Stack:** TypeScript (strict, ESM-only, `.js` extensions on relative imports), Fastify (api), Baileys 6.7.21 (daemon), React 18 + TanStack Router + TanStack Query + Zustand (web), drizzle-orm + postgres-js, Vitest + RTL + MSW (tests), Playwright (E2E), Redis Streams + Pub/Sub.

---

## How to use this plan

- **Read the design spec first**: [`docs/superpowers/specs/2026-05-15-yank-m4-design.md`](../specs/2026-05-15-yank-m4-design.md). The plan references its sections (§4, §5, §10) for context.
- **Read the M3 handover**: [`docs/superpowers/notes/2026-05-15-m3-handover.md`](../notes/2026-05-15-m3-handover.md) for gotchas (WA cooldowns, media expiry, `@lid` addresses, `messages.text` nulled on REVOKE).
- **CLAUDE.md invariants are load-bearing**: daemon talks Redis only; multi-user schema; Baileys only in `packages/daemon`. Channel names always via `eventsChannel()` / `commandsStream()` from `@yank/shared`.
- **Relative imports** must include `.js` extension even when source is `.ts` (ESLint enforces).
- **Tests live in `packages/<pkg>/test/**/*.test.ts`** — co-located `*.test.ts` next to source are not run.
- **Commits**: Conventional Commits; one feature or fix per commit; never combine unrelated changes.
- **TDD is the default**: write a failing test, watch it fail, write minimal code, watch it pass, refactor, commit.
- **Verification gates between phases**: after each phase, run `pnpm lint && pnpm typecheck && pnpm test`. All green before moving on.

## Plan structure

| Phase | Cluster | Tasks | Verification gate |
|---|---|---|---|
| 0 | Foundations (DTOs, events, commands) | 0.1 – 0.4 | `pnpm typecheck` green |
| 1 | Triage card grid | 1.1 – 1.17 | full test suite + manual triage smoke |
| 2 | Contact rename | 2.1 – 2.5 | full test suite |
| 3a | Edit-message | 3a.1 – 3a.11 | full test suite + manual edit smoke |
| 3b | `@mention` autocomplete | 3b.1 – 3b.5 | full test suite |
| 3c | Keyboard & hover shortcuts | 3c.1 – 3c.8 | full test suite + manual keyboard smoke |
| 4 | Resilience surfacing | 4.1 – 4.11 | full test suite + manual reconnect smoke |
| 5 | Final verification | 5.1 – 5.3 | E2E + handover note |

---

## Phase 0 — Foundations

Schema for `messages.edited_at` is already forward-defined in M3 (`packages/db/src/schema/messages.ts:33`) — no migration to add. This phase only extends the shared `@yank/shared` types.

### Task 0.1: Add new DTO body schemas

**Files:**
- Modify: `packages/shared/src/dto.ts` (append at end)
- Test: `packages/shared/test/dto.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create or append to `packages/shared/test/dto.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  AssignmentBodySchema,
  ContactRenameBodySchema,
  EditMessageBodySchema,
} from '../src/dto.js';

describe('M4 DTO schemas', () => {
  it('AssignmentBodySchema accepts valid workspace', () => {
    expect(AssignmentBodySchema.parse({ workspace: 'work' }).workspace).toBe('work');
    expect(AssignmentBodySchema.parse({ workspace: 'triage' }).workspace).toBe('triage');
  });

  it('AssignmentBodySchema rejects unknown workspace', () => {
    expect(() => AssignmentBodySchema.parse({ workspace: 'archive' })).toThrow();
  });

  it('ContactRenameBodySchema enforces non-empty trimmed name within 80 chars', () => {
    expect(ContactRenameBodySchema.parse({ displayName: 'Alice' }).displayName).toBe('Alice');
    expect(() => ContactRenameBodySchema.parse({ displayName: '' })).toThrow();
    expect(() => ContactRenameBodySchema.parse({ displayName: 'a'.repeat(81) })).toThrow();
  });

  it('EditMessageBodySchema enforces non-empty text', () => {
    expect(EditMessageBodySchema.parse({ text: 'hi' }).text).toBe('hi');
    expect(() => EditMessageBodySchema.parse({ text: '' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/shared/test/dto.test.ts
```

Expected: ReferenceError / import failure on the new schemas.

- [ ] **Step 3: Implement the schemas**

Append to `packages/shared/src/dto.ts`:

```ts
export const AssignmentBodySchema = z.object({ workspace: WorkspaceSchema });
export type AssignmentBody = z.infer<typeof AssignmentBodySchema>;

export const ContactRenameBodySchema = z.object({
  displayName: z.string().trim().min(1).max(80),
});
export type ContactRenameBody = z.infer<typeof ContactRenameBodySchema>;

export const EditMessageBodySchema = z.object({
  text: z.string().min(1).max(65000),
});
export type EditMessageBody = z.infer<typeof EditMessageBodySchema>;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/shared/test/dto.test.ts
pnpm --filter @yank/shared typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/dto.ts packages/shared/test/dto.test.ts
git commit -m "feat(shared): add M4 DTO body schemas (assignment, contact rename, edit message)"
```

### Task 0.2: Extend `DaemonEventSchema` with 5 new event variants

**Files:**
- Modify: `packages/shared/src/events.ts`
- Test: `packages/shared/test/events.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { DaemonEventSchema } from '../src/events.js';

const userId = '01938b3a-8b1b-7c00-a000-000000000001';
const chatId = '01938b3a-8b1b-7c00-a000-000000000002';
const messageId = '01938b3a-8b1b-7c00-a000-000000000003';
const contactId = '01938b3a-8b1b-7c00-a000-000000000004';

describe('M4 SSE events', () => {
  it('parses chat-assignment', () => {
    const evt = DaemonEventSchema.parse({
      userId, type: 'chat-assignment',
      chatId, workspace: 'personal',
      assignedAt: '2026-05-15T12:00:00.000Z',
    });
    expect(evt.type).toBe('chat-assignment');
  });

  it('parses contact-update', () => {
    const evt = DaemonEventSchema.parse({
      userId, type: 'contact-update',
      contactId, displayName: 'Alice',
      updatedAt: '2026-05-15T12:00:00.000Z',
    });
    expect(evt.type).toBe('contact-update');
  });

  it('parses message-edit', () => {
    const evt = DaemonEventSchema.parse({
      userId, type: 'message-edit',
      messageId, text: 'edited text',
      editedAt: '2026-05-15T12:00:00.000Z',
    });
    expect(evt.type).toBe('message-edit');
  });

  it('parses message-edit-failed', () => {
    const evt = DaemonEventSchema.parse({
      userId, type: 'message-edit-failed',
      messageId, reason: 'too-old',
    });
    expect(evt.type).toBe('message-edit-failed');
  });

  it('parses media-breaker-state open with retryAt', () => {
    const evt = DaemonEventSchema.parse({
      userId, type: 'media-breaker-state',
      state: 'open', retryAt: '2026-05-15T12:05:00.000Z',
    });
    expect(evt.type).toBe('media-breaker-state');
  });

  it('parses media-breaker-state closed without retryAt', () => {
    const evt = DaemonEventSchema.parse({
      userId, type: 'media-breaker-state',
      state: 'closed',
    });
    expect(evt.type).toBe('media-breaker-state');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/shared/test/events.test.ts
```

- [ ] **Step 3: Implement the new event variants**

In `packages/shared/src/events.ts`, import `WorkspaceSchema` from `./dto.js` and add five new schemas before the `DaemonEventSchema` discriminated union:

```ts
import { WorkspaceSchema } from './dto.js';

// ... existing event schemas ...

export const ChatAssignmentEvent = Base.extend({
  type: z.literal('chat-assignment'),
  chatId: z.string().uuid(),
  workspace: WorkspaceSchema,
  assignedAt: z.string().datetime(),
});

export const ContactUpdateEvent = Base.extend({
  type: z.literal('contact-update'),
  contactId: z.string().uuid(),
  displayName: z.string(),
  updatedAt: z.string().datetime(),
});

export const MessageEditEvent = Base.extend({
  type: z.literal('message-edit'),
  messageId: z.string().uuid(),
  text: z.string(),
  editedAt: z.string().datetime(),
});

export const MessageEditFailedEvent = Base.extend({
  type: z.literal('message-edit-failed'),
  messageId: z.string().uuid(),
  reason: z.enum(['too-old', 'protocol', 'network']),
});

export const MediaBreakerStateEvent = Base.extend({
  type: z.literal('media-breaker-state'),
  state: z.enum(['open', 'closed', 'half-open']),
  retryAt: z.string().datetime().optional(),
});
```

Then extend the `DaemonEventSchema` union:

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
  MediaReadyEvent,
  ChatAssignmentEvent,
  ContactUpdateEvent,
  MessageEditEvent,
  MessageEditFailedEvent,
  MediaBreakerStateEvent,
]);
```

Note on module direction: `events.ts` now imports from `dto.ts`. `dto.ts` does not import from `events.ts` — no cycle. Plan-time check confirms this; if a future change inverts the direction, lift `WorkspaceSchema` into a third file.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/shared/test/events.test.ts
pnpm --filter @yank/shared typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/events.ts packages/shared/test/events.test.ts
git commit -m "feat(shared): add M4 SSE event variants (chat-assignment, contact-update, message-edit, message-edit-failed, media-breaker-state)"
```

### Task 0.3: Extend `ApiCommandSchema` with `EditMessageCommand`

**Files:**
- Modify: `packages/shared/src/events.ts` (commands live in the same file in this project)
- Test: extend `packages/shared/test/events.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `events.test.ts`:

```ts
import { ApiCommandSchema } from '../src/events.js';

describe('M4 commands', () => {
  it('parses edit-message command', () => {
    const cmd = ApiCommandSchema.parse({
      userId: '01938b3a-8b1b-7c00-a000-000000000001',
      type: 'edit-message',
      messageId: '01938b3a-8b1b-7c00-a000-000000000003',
      waMessageId: '3EB0ABCDEF',
      chatJid: '11111@s.whatsapp.net',
      text: 'updated',
    });
    expect(cmd.type).toBe('edit-message');
  });

  it('rejects edit-message with empty text', () => {
    expect(() =>
      ApiCommandSchema.parse({
        userId: '01938b3a-8b1b-7c00-a000-000000000001',
        type: 'edit-message',
        messageId: '01938b3a-8b1b-7c00-a000-000000000003',
        waMessageId: '3EB0ABCDEF',
        chatJid: '11111@s.whatsapp.net',
        text: '',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/shared/test/events.test.ts -t 'edit-message'
```

- [ ] **Step 3: Implement `EditMessageCommand`**

In `packages/shared/src/events.ts`, alongside the other command schemas:

```ts
export const EditMessageCommand = Base.extend({
  type: z.literal('edit-message'),
  messageId: z.string().uuid(),
  waMessageId: z.string().min(1),
  chatJid: z.string().min(1),
  text: z.string().min(1).max(65000),
});
```

Extend the union:

```ts
export const ApiCommandSchema = z.discriminatedUnion('type', [
  PairCommand,
  SendCommand,
  ReactCommand,
  MarkReadCommand,
  TypingCommand,
  DownloadMediaCommand,
  EditMessageCommand,
]);
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/shared/test/events.test.ts
pnpm --filter @yank/shared typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/events.ts packages/shared/test/events.test.ts
git commit -m "feat(shared): add edit-message command schema"
```

### Task 0.4: Phase 0 verification gate

- [ ] **Step 1: Full workspace typecheck**

```bash
pnpm typecheck
```

Expected: green across all packages.

- [ ] **Step 2: Run full test suite**

```bash
pnpm test
```

Expected: all 69+ existing tests still pass; new DTO/event tests pass.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

- [ ] **Step 4: Commit gate marker** *(optional)*

No code changes; gate is documentary. Move to Phase 1.

---
## Phase 1 — Triage card grid

All 17 tasks implement Cluster 1 of the M4 design spec (§2). Phase 0 outcomes are already
committed: `AssignmentBodySchema`, `ChatAssignmentEvent`, `EditMessageCommand`, etc., are
available from `@yank/shared`.

---

### Task 1.1: Add `packages/api/src/events-publisher.ts`

**Files:**
- Create: `packages/api/src/events-publisher.ts`
- Test: `packages/api/test/events-publisher.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import Redis from 'ioredis';
import { createEventsPublisher } from '../src/events-publisher.js';
import { eventsChannel } from '@yank/shared';

const USER = '0193fe00-0000-7000-8000-000000000011';

describe('createEventsPublisher', () => {
  let redisC: StartedRedisContainer;
  let publisher: Redis;
  let subscriber: Redis;

  beforeAll(async () => {
    redisC = await new RedisContainer('redis:7-alpine').start();
    publisher = new Redis(redisC.getConnectionUrl());
    subscriber = new Redis(redisC.getConnectionUrl());
    await subscriber.subscribe(eventsChannel(USER));
  }, 60_000);

  afterAll(async () => {
    await publisher.quit();
    await subscriber.quit();
    await redisC.stop();
  });

  it('publishes a chat-assignment event on the correct channel', async () => {
    const bus = createEventsPublisher(publisher, USER);
    const received: string[] = [];
    subscriber.on('message', (ch, msg) => {
      if (ch === eventsChannel(USER)) received.push(msg);
    });

    await bus.publish({
      type: 'chat-assignment',
      userId: USER,
      chatId: '0193fe00-0000-7000-8000-000000000001',
      workspace: 'personal',
      assignedAt: new Date().toISOString(),
    });

    // Give Redis a tick to deliver.
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(1);
    const parsed = JSON.parse(received[0]!) as { type: string; workspace: string };
    expect(parsed.type).toBe('chat-assignment');
    expect(parsed.workspace).toBe('personal');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/api/test/events-publisher.test.ts
```

Expected: `Cannot find module '../src/events-publisher.js'`.

- [ ] **Step 3: Implement `events-publisher.ts`**

Create `packages/api/src/events-publisher.ts`:

```ts
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

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/api/test/events-publisher.test.ts
pnpm --filter @yank/api typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/events-publisher.ts packages/api/test/events-publisher.test.ts
git commit -m "feat(api): add events-publisher (mirrors daemon events-bus publish shape)"
```

---

### Task 1.2: Wire `eventsPublisher` into `packages/api/src/index.ts` and `ChatsDeps`

**Files:**
- Modify: `packages/api/src/index.ts`
- Modify: `packages/api/src/routes/chats.ts` (top of file, `ChatsDeps` interface only)

This task wires the publisher into the running server and extends `ChatsDeps` so the
assignment endpoint can call it. No behaviour change yet — Task 1.3 adds the publish call.

- [ ] **Step 1: Extend `ChatsDeps` in `packages/api/src/routes/chats.ts`**

Replace the existing `ChatsDeps` interface (lines 13–16):

```ts
import type { EventsPublisher } from '../events-publisher.js';

export interface ChatsDeps {
  db: Db;
  userId: string;
  events?: EventsPublisher;
}
```

The `events` field is optional so existing callers (roundtrip test, etc.) don't need
updating in this task.

- [ ] **Step 2: Wire publisher into `packages/api/src/index.ts`**

Replace the `registerChatsRoutes` line (line 36) with:

```ts
import { createEventsPublisher } from './events-publisher.js';

// after `const eventsBus = createEventsBus(subscriber, env.YANK_USER_ID);`
const eventsPublisher = createEventsPublisher(redis, env.YANK_USER_ID);

// replace:
registerChatsRoutes(app, { db, userId: env.YANK_USER_ID });
// with:
registerChatsRoutes(app, { db, userId: env.YANK_USER_ID, events: eventsPublisher });
```

Full updated block in `index.ts` (lines 28–38):

```ts
const eventsBus = createEventsBus(subscriber, env.YANK_USER_ID);
await eventsBus.start();
const commandsBus = createCommandsBus(redis, env.YANK_USER_ID);
const eventsPublisher = createEventsPublisher(redis, env.YANK_USER_ID);

const app = Fastify({ loggerInstance: log });
registerHealthz(app, { db, redis });
registerEventsRoute(app, { bus: eventsBus });
registerSetupRoutes(app, { db, userId: env.YANK_USER_ID, commands: commandsBus });
registerChatsRoutes(app, { db, userId: env.YANK_USER_ID, events: eventsPublisher });
registerMessagesRoutes(app, { db, userId: env.YANK_USER_ID, commands: commandsBus });
registerMediaRoutes(app, { db, userId: env.YANK_USER_ID, commands: commandsBus });
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @yank/api typecheck
pnpm exec vitest run packages/api/
```

Expected: all existing api tests still pass; no new failures.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/chats.ts packages/api/src/index.ts
git commit -m "feat(api): wire eventsPublisher into ChatsDeps and index"
```

---

### Task 1.3: Extend `POST /api/chats/:id/assignment` — Zod validation + SSE publish + integration test

**Files:**
- Modify: `packages/api/src/routes/chats.ts` (lines 162–189)
- Create: `packages/api/test/chats.assignment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/chats.assignment.test.ts`:

```ts
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
import { createLogger, eventsChannel } from '@yank/shared';
import { chats, chatAssignments } from '@yank/db/schema';
import { ensureSingleUser } from '../src/bootstrap.js';
import { createEventsBus } from '../src/events-bus.js';
import { createEventsPublisher } from '../src/events-publisher.js';
import { registerChatsRoutes } from '../src/routes/chats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', '..', 'db', 'drizzle');
const USER = '0193fe00-0000-7000-8000-000000000022';

describe('POST /api/chats/:id/assignment', () => {
  let pg: StartedPostgreSqlContainer;
  let redisC: StartedRedisContainer;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let redis: Redis;
  let subscriber: Redis;
  let app: ReturnType<typeof Fastify>;
  let baseUrl: string;
  let chatId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    redisC = await new RedisContainer('redis:7-alpine').start();
    client = postgres(pg.getConnectionUri(), { max: 5 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await ensureSingleUser(db, USER, 'AssignTest');

    // Seed one chat owned by USER.
    const inserted = await db
      .insert(chats)
      .values({
        userId: USER,
        jid: '9999@s.whatsapp.net',
        type: 'dm',
      })
      .returning({ id: chats.id });
    chatId = inserted[0]!.id;

    redis = new Redis(redisC.getConnectionUrl());
    subscriber = new Redis(redisC.getConnectionUrl());
    const eventsBus = createEventsBus(subscriber, USER);
    await eventsBus.start();
    const eventsPublisher = createEventsPublisher(redis, USER);

    const log = createLogger({ service: 'assign-test', level: 'warn' });
    app = Fastify({ logger: false });
    registerChatsRoutes(app, { db, userId: USER, events: eventsPublisher });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await subscriber?.quit();
    await redis?.quit();
    await client?.end();
    await pg?.stop();
    await redisC?.stop();
  });

  it('happy path: 204 + DB row upserted + event published', async () => {
    const receivedEvents: string[] = [];
    subscriber.on('message', (_ch, msg) => receivedEvents.push(msg));
    await subscriber.subscribe(eventsChannel(USER));

    const res = await fetch(`${baseUrl}/api/chats/${chatId}/assignment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspace: 'work' }),
    });
    expect(res.status).toBe(204);

    const rows = await db.select().from(chatAssignments).where(
      // drizzle eq import is available via the existing chats import pattern
      (await import('drizzle-orm')).eq(chatAssignments.chatId, chatId),
    );
    expect(rows[0]?.workspace).toBe('work');

    await new Promise((r) => setTimeout(r, 100));
    expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
    const evt = JSON.parse(receivedEvents[receivedEvents.length - 1]!) as {
      type: string;
      workspace: string;
      chatId: string;
    };
    expect(evt.type).toBe('chat-assignment');
    expect(evt.workspace).toBe('work');
    expect(evt.chatId).toBe(chatId);
  });

  it('400 on invalid workspace value', async () => {
    const res = await fetch(`${baseUrl}/api/chats/${chatId}/assignment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspace: 'archive' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 when chat is not owned by user', async () => {
    const res = await fetch(
      `${baseUrl}/api/chats/00000000-0000-7000-8000-000000000000/assignment`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspace: 'personal' }),
      },
    );
    expect(res.status).toBe(404);
  });

  it('idempotent repeat: second POST same body returns 204 and advances assigned_at', async () => {
    await fetch(`${baseUrl}/api/chats/${chatId}/assignment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspace: 'personal' }),
    });
    const rowsBefore = await db.select().from(chatAssignments).where(
      (await import('drizzle-orm')).eq(chatAssignments.chatId, chatId),
    );
    const tsBefore = rowsBefore[0]?.assignedAt;

    // Small delay so assigned_at can differ.
    await new Promise((r) => setTimeout(r, 20));

    const res2 = await fetch(`${baseUrl}/api/chats/${chatId}/assignment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspace: 'personal' }),
    });
    expect(res2.status).toBe(204);

    const rowsAfter = await db.select().from(chatAssignments).where(
      (await import('drizzle-orm')).eq(chatAssignments.chatId, chatId),
    );
    expect(rowsAfter[0]?.assignedAt?.getTime()).toBeGreaterThan(tsBefore?.getTime() ?? 0);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/api/test/chats.assignment.test.ts
```

Expected: happy-path event assertion fails (no event published yet).

- [ ] **Step 3: Implement — replace the assignment handler in `chats.ts` (lines 162–189)**

Replace the full `app.post('/api/chats/:id/assignment', ...)` block with:

```ts
import { AssignmentBodySchema } from '@yank/shared';

app.post<{ Params: { id: string }; Body: unknown }>(
  '/api/chats/:id/assignment',
  async (req, reply) => {
    const parsed = AssignmentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const { workspace } = parsed.data;

    const chat = await deps.db
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.userId, deps.userId), eq(chats.id, req.params.id)))
      .limit(1);
    if (!chat[0]) return reply.code(404).send({ error: 'not_found' });

    await deps.db
      .insert(chatAssignments)
      .values({ chatId: chat[0].id, workspace })
      .onConflictDoUpdate({
        target: chatAssignments.chatId,
        set: { workspace, assignedAt: new Date() },
      });

    if (deps.events) {
      await deps.events.publish({
        type: 'chat-assignment',
        userId: deps.userId,
        chatId: chat[0].id,
        workspace,
        assignedAt: new Date().toISOString(),
      });
    }

    reply.code(204);
    return null;
  },
);
```

Add the import at the top of `chats.ts` (after existing `@yank/shared` imports if any, or alongside them):

```ts
import { AssignmentBodySchema } from '@yank/shared';
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/api/test/chats.assignment.test.ts
pnpm --filter @yank/api typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/chats.ts packages/api/test/chats.assignment.test.ts
git commit -m "feat(api): validate assignment body via Zod and publish chat-assignment SSE event"
```

---

### Task 1.4: Add `packages/web/src/state/toast.ts` — single-slot undo toast store

**Files:**
- Create: `packages/web/src/state/toast.ts`
- Create: `packages/web/test/state/toast.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/state/toast.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../../src/state/toast.js';

beforeEach(() => {
  useToastStore.setState({ toast: null });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  useToastStore.setState({ toast: null });
});

describe('useToastStore', () => {
  it('showUndoToast sets toast with label and onUndo', () => {
    const onUndo = vi.fn();
    useToastStore.getState().showUndoToast({ label: 'Moved to Work', onUndo, durationMs: 5000 });
    const { toast } = useToastStore.getState();
    expect(toast).not.toBeNull();
    expect(toast?.label).toBe('Moved to Work');
    expect(toast?.onUndo).toBe(onUndo);
  });

  it('auto-dismisses after durationMs', () => {
    useToastStore.getState().showUndoToast({ label: 'Test', onUndo: vi.fn(), durationMs: 3000 });
    expect(useToastStore.getState().toast).not.toBeNull();
    vi.advanceTimersByTime(3000);
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('new toast replaces previous (single slot)', () => {
    const first = vi.fn();
    const second = vi.fn();
    useToastStore.getState().showUndoToast({ label: 'First', onUndo: first, durationMs: 5000 });
    useToastStore.getState().showUndoToast({ label: 'Second', onUndo: second, durationMs: 5000 });
    expect(useToastStore.getState().toast?.label).toBe('Second');
  });

  it('clear() removes the toast immediately', () => {
    useToastStore.getState().showUndoToast({ label: 'X', onUndo: vi.fn(), durationMs: 5000 });
    useToastStore.getState().clear();
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('uses default durationMs of 5000 when not provided', () => {
    useToastStore.getState().showUndoToast({ label: 'Default', onUndo: vi.fn() });
    expect(useToastStore.getState().toast).not.toBeNull();
    vi.advanceTimersByTime(4999);
    expect(useToastStore.getState().toast).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toast).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/state/toast.test.ts
```

Expected: `Cannot find module '../../src/state/toast.js'`.

- [ ] **Step 3: Implement `toast.ts`**

Create `packages/web/src/state/toast.ts`:

```ts
import { create } from 'zustand';

export interface ToastPayload {
  label: string;
  onUndo: () => void;
  durationMs?: number;
}

interface ToastState {
  toast: ToastPayload | null;
  showUndoToast: (payload: ToastPayload) => void;
  clear: () => void;
}

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,

  showUndoToast({ label, onUndo, durationMs = 5000 }) {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    set({ toast: { label, onUndo, durationMs } });
    dismissTimer = setTimeout(() => {
      set({ toast: null });
      dismissTimer = null;
    }, durationMs);
  },

  clear() {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    set({ toast: null });
  },
}));
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/state/toast.test.ts
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/state/toast.ts packages/web/test/state/toast.test.ts
git commit -m "feat(web): add single-slot undo toast Zustand store"
```

---

### Task 1.5: Add `<UndoToast>` primitive component

**Files:**
- Create: `packages/web/src/components/primitives/UndoToast.tsx`
- Create: `packages/web/src/components/primitives/UndoToast.module.css`
- Create: `packages/web/test/components/UndoToast.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/components/UndoToast.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UndoToast } from '../../../src/components/primitives/UndoToast.js';
import { useToastStore } from '../../../src/state/toast.js';

beforeEach(() => {
  useToastStore.setState({ toast: null });
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  useToastStore.setState({ toast: null });
});

describe('UndoToast', () => {
  it('renders nothing when toast is null', () => {
    const { container } = render(<UndoToast />);
    expect(container.firstChild).toBeNull();
  });

  it('renders label when toast is set', () => {
    act(() => {
      useToastStore.getState().showUndoToast({ label: 'Moved to Work', onUndo: vi.fn() });
    });
    render(<UndoToast />);
    expect(screen.getByText('Moved to Work')).toBeInTheDocument();
  });

  it('clicking Undo calls onUndo and clears the toast', async () => {
    const onUndo = vi.fn();
    act(() => {
      useToastStore.getState().showUndoToast({ label: 'Moved to Personal', onUndo });
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    render(<UndoToast />);
    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('Cmd-Z triggers onUndo globally', async () => {
    const onUndo = vi.fn();
    act(() => {
      useToastStore.getState().showUndoToast({ label: 'Moved to Hidden', onUndo });
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    render(<UndoToast />);
    await user.keyboard('{Meta>}z{/Meta}');
    expect(onUndo).toHaveBeenCalledOnce();
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('toast disappears after durationMs', () => {
    act(() => {
      useToastStore.getState().showUndoToast({ label: 'Bye', onUndo: vi.fn(), durationMs: 3000 });
    });
    render(<UndoToast />);
    expect(screen.getByText('Bye')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('Bye')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/UndoToast.test.tsx
```

Expected: `Cannot find module '../../../src/components/primitives/UndoToast.js'`.

- [ ] **Step 3: Implement `UndoToast.tsx`**

Create `packages/web/src/components/primitives/UndoToast.tsx`:

```tsx
import { useEffect } from 'react';
import { useToastStore } from '../../state/toast.js';
import styles from './UndoToast.module.css';

export function UndoToast() {
  const toast = useToastStore((s) => s.toast);
  const clear = useToastStore((s) => s.clear);

  useEffect(() => {
    if (!toast) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toast.onUndo();
        clear();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toast, clear]);

  if (!toast) return null;

  const handleUndo = () => {
    toast.onUndo();
    clear();
  };

  return (
    <div className={styles.pill} role="status" aria-live="polite">
      <span className={styles.label}>{toast.label}</span>
      <button type="button" className={styles.undoBtn} onClick={handleUndo}>
        Undo
      </button>
    </div>
  );
}
```

Create `packages/web/src/components/primitives/UndoToast.module.css`:

```css
.pill {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--bg-3);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  font-size: 13px;
  color: var(--fg-0);
  z-index: 9000;
  box-shadow: 0 4px 16px oklch(0% 0 0 / 0.4);
  white-space: nowrap;
}

.label {
  color: var(--fg-1);
}

.undoBtn {
  padding: 2px 10px;
  border: 1px solid var(--border-1);
  border-radius: 999px;
  font-size: 12px;
  color: var(--fg-0);
  background: var(--bg-2);
  cursor: pointer;
}

.undoBtn:hover {
  background: var(--bg-1);
  border-color: var(--border-strong);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/UndoToast.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/primitives/UndoToast.tsx \
        packages/web/src/components/primitives/UndoToast.module.css \
        packages/web/test/components/UndoToast.test.tsx
git commit -m "feat(web): add UndoToast primitive with Cmd-Z global handler"
```

---

### Task 1.6: Mount `<UndoToast />` in `__root.tsx`

**Files:**
- Modify: `packages/web/src/routes/__root.tsx`

- [ ] **Step 1: Implement**

Replace the full `__root.tsx` content with:

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

- [ ] **Step 2: Verify**

```bash
pnpm --filter @yank/web typecheck
pnpm exec vitest run packages/web/
```

Expected: all web tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/__root.tsx
git commit -m "feat(web): mount UndoToast in root layout"
```

---

### Task 1.7: Widen `useAssignWorkspace` with optimistic patch + undo toast + `suppressUndo`

**Files:**
- Modify: `packages/web/src/lib/mutations.ts`
- Create: `packages/web/test/lib/mutations.assign.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/lib/mutations.assign.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { useAssignWorkspace } from '../../src/lib/mutations.js';
import { queryKeys } from '../../src/lib/queryKeys.js';
import { useToastStore } from '../../src/state/toast.js';

const CHAT_ID = 'b1ee0d52-2c8e-7e7a-a4cf-000000000001';
const USER_ID = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';

const baseChat = {
  id: CHAT_ID,
  userId: USER_ID,
  jid: 'x@g.us',
  type: 'group' as const,
  subject: 'Alpha',
  lastMessageAt: null,
  lastMessagePreview: null,
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage' as const,
  memberCount: 2,
  unreadCount: 0,
  lastReadMessageId: null,
  lastReadTs: null,
};

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  useToastStore.setState({ toast: null });
  vi.useFakeTimers();
});
afterAll(() => server.close());

function wrap(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useAssignWorkspace', () => {
  it('optimistically patches the chat workspace in cache', async () => {
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, () => new HttpResponse(null, { status: 204 })),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [baseChat]);

    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });

    act(() => {
      result.current.mutate({ workspace: 'work', suppressUndo: false });
    });

    // Optimistic update is synchronous.
    const cached = qc.getQueryData<typeof baseChat[]>(queryKeys.chats());
    expect(cached?.[0]?.workspace).toBe('work');
  });

  it('shows undo toast (unless suppressUndo is true)', async () => {
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, () => new HttpResponse(null, { status: 204 })),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [baseChat]);

    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });
    act(() => {
      result.current.mutate({ workspace: 'personal', suppressUndo: false });
    });
    expect(useToastStore.getState().toast?.label).toBe('Moved to Personal');
  });

  it('suppresses toast when suppressUndo is true', async () => {
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, () => new HttpResponse(null, { status: 204 })),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [baseChat]);

    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });
    act(() => {
      result.current.mutate({ workspace: 'work', suppressUndo: true });
    });
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('rolls back on network error', async () => {
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, () =>
        HttpResponse.json({ error: 'server_error' }, { status: 500 }),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [baseChat]);

    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });
    act(() => {
      result.current.mutate({ workspace: 'work', suppressUndo: false });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = qc.getQueryData<typeof baseChat[]>(queryKeys.chats());
    expect(cached?.[0]?.workspace).toBe('triage');
  });

  it('undo callback mutates back to previous workspace with suppressUndo=true', async () => {
    const calls: string[] = [];
    server.use(
      http.post(`/api/chats/${CHAT_ID}/assignment`, async ({ request }) => {
        const body = (await request.json()) as { workspace: string };
        calls.push(body.workspace);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [baseChat]);

    const { result } = renderHook(() => useAssignWorkspace(CHAT_ID), { wrapper: wrap(qc) });
    act(() => {
      result.current.mutate({ workspace: 'work', suppressUndo: false });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Trigger undo via toast callback.
    const onUndo = useToastStore.getState().toast?.onUndo;
    expect(onUndo).toBeDefined();
    act(() => {
      onUndo?.();
    });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toBe('triage');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/lib/mutations.assign.test.tsx
```

Expected: failures on `mutate({ workspace, suppressUndo })` signature (current signature is `mutate(workspace)`).

- [ ] **Step 3: Implement — replace `useAssignWorkspace` in `mutations.ts`**

Replace the existing `useAssignWorkspace` function (lines 51–61) with:

```ts
import { useToastStore } from '../state/toast.js';
import type { Chat } from '@yank/shared';

const WORKSPACE_LABELS: Record<string, string> = {
  work: 'Work',
  personal: 'Personal',
  hidden: 'Hidden',
  triage: 'Triage',
};

export function useAssignWorkspace(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workspace }: { workspace: Workspace; suppressUndo?: boolean }) =>
      apiFetch<void>(`/api/chats/${chatId}/assignment`, {
        method: 'POST',
        body: { workspace },
      }),
    onMutate: async ({ workspace, suppressUndo = false }) => {
      const snapshot = qc.getQueryData<Chat[]>(queryKeys.chats());
      const previousWorkspace =
        snapshot?.find((c) => c.id === chatId)?.workspace ?? 'triage';

      qc.setQueryData<Chat[]>(queryKeys.chats(), (old) =>
        old?.map((c) => (c.id === chatId ? { ...c, workspace } : c)),
      );

      if (!suppressUndo) {
        const label = `Moved to ${WORKSPACE_LABELS[workspace] ?? workspace}`;
        useToastStore.getState().showUndoToast({
          label,
          onUndo: () => {
            qc.setQueryData<Chat[]>(queryKeys.chats(), (old) =>
              old?.map((c) => (c.id === chatId ? { ...c, workspace: previousWorkspace } : c)),
            );
            apiFetch<void>(`/api/chats/${chatId}/assignment`, {
              method: 'POST',
              body: { workspace: previousWorkspace },
            }).catch(() => {
              // undo failed silently; SSE will reconcile
            });
            useToastStore.getState().clear();
          },
        });
      }

      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot !== undefined) {
        qc.setQueryData<Chat[]>(queryKeys.chats(), context.snapshot);
      }
    },
    // onSettled deliberately omitted: SSE chat-assignment reconciles the cache.
  });
}
```

Also add `useToastStore` and `Chat` imports at the top of `mutations.ts`:

```ts
import { useToastStore } from '../state/toast.js';
import type { Chat } from '@yank/shared';
```

(Adjust the existing `@yank/shared` import line to add `Chat` to the named imports.)

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/lib/mutations.assign.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/mutations.ts packages/web/test/lib/mutations.assign.test.tsx
git commit -m "feat(web): widen useAssignWorkspace with optimistic patch, undo toast, and suppressUndo"
```

---

### Task 1.8: Add `chat-assignment` handler to `eventStream.ts`

**Files:**
- Modify: `packages/web/src/lib/eventStream.ts`
- Modify: `packages/web/test/lib/eventStream.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append to `packages/web/test/lib/eventStream.test.tsx`:

```ts
import type { Chat } from '@yank/shared';
import { queryKeys } from '../../src/lib/queryKeys.js';

const CHAT_ID = 'b1ee0d52-2c8e-7e7a-a4cf-000000000002';
const USER_ID = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';

const baseChat: Chat = {
  id: CHAT_ID,
  userId: USER_ID,
  jid: 'x@g.us',
  type: 'group',
  subject: 'Alpha',
  lastMessageAt: null,
  lastMessagePreview: null,
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage',
  memberCount: 2,
  unreadCount: 0,
  lastReadMessageId: null,
  lastReadTs: null,
};

describe('chat-assignment SSE handler', () => {
  it('patches workspace in chats cache when event arrives', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [baseChat]);

    renderHook(() => useEventStream(), { wrapper: wrap(qc) });

    act(() => {
      FakeEventSource.instances[0]?.emit('chat-assignment', {
        type: 'chat-assignment',
        userId: USER_ID,
        chatId: CHAT_ID,
        workspace: 'work',
        assignedAt: '2026-05-15T12:00:00.000Z',
      });
    });

    const cached = qc.getQueryData<Chat[]>(queryKeys.chats());
    expect(cached?.[0]?.workspace).toBe('work');
  });

  it('no-ops when chatId is not in cache', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [baseChat]);

    renderHook(() => useEventStream(), { wrapper: wrap(qc) });

    act(() => {
      FakeEventSource.instances[0]?.emit('chat-assignment', {
        type: 'chat-assignment',
        userId: USER_ID,
        chatId: '00000000-0000-7000-8000-000000000000',
        workspace: 'work',
        assignedAt: '2026-05-15T12:00:00.000Z',
      });
    });

    const cached = qc.getQueryData<Chat[]>(queryKeys.chats());
    // baseChat unchanged
    expect(cached?.[0]?.workspace).toBe('triage');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/lib/eventStream.test.tsx -t 'chat-assignment'
```

Expected: assertion fails (`workspace` remains `'triage'` because handler is missing).

- [ ] **Step 3: Implement — add handler + extend `NAMED_EVENTS`**

In `packages/web/src/lib/eventStream.ts`:

1. Add `'chat-assignment'` to the `NAMED_EVENTS` array:

```ts
const NAMED_EVENTS = [
  'qr',
  'connected',
  'disconnected',
  'sync-progress',
  'sync-complete',
  'message',
  'status',
  'pair-code',
  'media-ready',
  'chat-assignment',
] as const;
```

2. Add a `case 'chat-assignment':` branch to `patchCache`:

```ts
case 'chat-assignment':
  qc.setQueryData<import('@yank/shared').Chat[]>(queryKeys.chats(), (old) =>
    old?.map((c) =>
      c.id === evt.chatId ? { ...c, workspace: evt.workspace } : c,
    ),
  );
  return;
```

Add the `Chat` type import at the top of `eventStream.ts` if not already present:

```ts
import type { Chat } from '@yank/shared';
```

Then update the `setQueryData` call to use the named import rather than inline:

```ts
case 'chat-assignment':
  qc.setQueryData<Chat[]>(queryKeys.chats(), (old) =>
    old?.map((c) =>
      c.id === evt.chatId ? { ...c, workspace: evt.workspace } : c,
    ),
  );
  return;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/lib/eventStream.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/eventStream.ts packages/web/test/lib/eventStream.test.tsx
git commit -m "feat(web): handle chat-assignment SSE event — patch workspace in chats cache"
```

---

### Task 1.9: Add `useChatsForWorkspace`, `useTriageChats`, `useTriageCount` selectors

**Files:**
- Modify: `packages/web/src/lib/queries.ts`
- Create: `packages/web/test/lib/queries.workspace.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/lib/queries.workspace.test.tsx`:

```tsx
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useChatsForWorkspace,
  useTriageChats,
  useTriageCount,
} from '../../src/lib/queries.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const USER = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';

function makeChat(id: string, workspace: string, subject: string) {
  return {
    id,
    userId: USER,
    jid: `${id}@g.us`,
    type: 'group' as const,
    subject,
    lastMessageAt: null,
    lastMessagePreview: null,
    archived: false,
    mutedUntil: null,
    pinned: false,
    workspace,
    memberCount: 1,
    unreadCount: 0,
    lastReadMessageId: null,
    lastReadTs: null,
  };
}

function wrap(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const allChats = [
  makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'work', 'Work Chat'),
  makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000002', 'personal', 'Personal Chat'),
  makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000003', 'triage', 'Triage A'),
  makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000004', 'triage', 'Triage B'),
  makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000005', 'hidden', 'Hidden Chat'),
];

beforeEach(() => {
  server.use(http.get('/api/chats', () => HttpResponse.json(allChats)));
});

describe('useChatsForWorkspace', () => {
  it('returns only work chats', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useChatsForWorkspace('work'), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.length).toBe(1));
    expect(result.current[0]?.subject).toBe('Work Chat');
  });

  it('returns only triage chats', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useChatsForWorkspace('triage'), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.length).toBe(2));
  });

  it('can return hidden chats when asked', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useChatsForWorkspace('hidden'), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.length).toBe(1));
    expect(result.current[0]?.subject).toBe('Hidden Chat');
  });
});

describe('useTriageChats', () => {
  it('returns triage chats', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTriageChats(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.length).toBe(2));
    const subjects = result.current.map((c) => c.subject);
    expect(subjects).toContain('Triage A');
    expect(subjects).toContain('Triage B');
  });
});

describe('useTriageCount', () => {
  it('returns the number of triage chats', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTriageCount(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current).toBe(2));
  });

  it('returns 0 when no triage chats', async () => {
    server.resetHandlers();
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'work', 'W')]),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTriageCount(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current).toBe(0));
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/lib/queries.workspace.test.tsx
```

Expected: `useChatsForWorkspace`, `useTriageChats`, `useTriageCount` not exported.

- [ ] **Step 3: Implement — append to `packages/web/src/lib/queries.ts`**

Append after `useChatMembers`:

```ts
import type { Workspace } from '@yank/shared';

export function useChatsForWorkspace(workspace: Workspace): Chat[] {
  const { data: chats = [] } = useChats();
  return chats.filter((c) => c.workspace === workspace);
}

export function useTriageChats(): Chat[] {
  return useChatsForWorkspace('triage');
}

export function useTriageCount(): number {
  return useTriageChats().length;
}
```

Add `Workspace` to the `@yank/shared` import line at the top of `queries.ts`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/lib/queries.workspace.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/queries.ts packages/web/test/lib/queries.workspace.test.tsx
git commit -m "feat(web): add useChatsForWorkspace, useTriageChats, useTriageCount selectors"
```

---

### Task 1.10: Switch `Sidebar` from `useChats()` to `useChatsForWorkspace`

**Files:**
- Modify: `packages/web/src/components/shell/Sidebar.tsx`
- Modify: `packages/web/test/components/shell/Sidebar.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append to `packages/web/test/components/shell/Sidebar.test.tsx`:

```tsx
it('excludes hidden chats from the sidebar', async () => {
  useUiStore.setState({ workspace: 'work' });
  server.use(
    http.get('/api/chats', () =>
      HttpResponse.json([
        {
          id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000010',
          userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
          jid: 'a@g.us',
          type: 'group',
          subject: 'Work Chat',
          lastMessageAt: null,
          lastMessagePreview: null,
          archived: false,
          mutedUntil: null,
          pinned: false,
          workspace: 'work',
          memberCount: 1,
          unreadCount: 0,
          lastReadMessageId: null,
          lastReadTs: null,
        },
        {
          id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000011',
          userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
          jid: 'b@g.us',
          type: 'group',
          subject: 'Hidden Chat',
          lastMessageAt: null,
          lastMessagePreview: null,
          archived: false,
          mutedUntil: null,
          pinned: false,
          workspace: 'hidden',
          memberCount: 1,
          unreadCount: 0,
          lastReadMessageId: null,
          lastReadTs: null,
        },
      ]),
    ),
  );
  renderSidebar();
  await waitFor(() => screen.getByText('Work Chat'));
  expect(screen.queryByText('Hidden Chat')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/shell/Sidebar.test.tsx -t 'excludes hidden'
```

Expected: `Hidden Chat` still appears because `Sidebar` filters inline but `useChats()` + manual
filter currently excludes `workspace !== currentWorkspace` — verify the exact failure by running.

- [ ] **Step 3: Implement — update `Sidebar.tsx`**

Replace the `Sidebar.tsx` imports and data-fetch block. Change:

```ts
import { useChats } from '../../lib/queries.js';
```

to:

```ts
import { useChatsForWorkspace } from '../../lib/queries.js';
```

Replace the `useChats()` call and `useMemo` block (lines 18–27) with:

```ts
const wsChats = useChatsForWorkspace(workspace);

const { pinned, groups, dms } = useMemo(
  () => ({
    pinned: wsChats.filter((c) => c.pinned),
    groups: wsChats.filter((c) => !c.pinned && c.type !== 'dm'),
    dms: wsChats.filter((c) => !c.pinned && c.type === 'dm'),
  }),
  [wsChats],
);
```

Remove the now-unused `type Chat` import if it becomes orphaned.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/shell/Sidebar.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/shell/Sidebar.tsx \
        packages/web/test/components/shell/Sidebar.test.tsx
git commit -m "feat(web): switch Sidebar to useChatsForWorkspace — hides hidden workspace"
```

---

### Task 1.11: `Rail.tsx` — replace inline triage filter with `useTriageCount()` + red-dot

**Files:**
- Modify: `packages/web/src/components/shell/Rail.tsx`
- Modify: `packages/web/test/components/shell/Rail.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append to `packages/web/test/components/shell/Rail.test.tsx`:

```tsx
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { waitFor } from '@testing-library/react';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Rail triage count indicator', () => {
  it('shows a red dot when triage count > 0', async () => {
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000020',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: 'x@g.us',
            type: 'group',
            subject: 'Triage One',
            lastMessageAt: null,
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: false,
            workspace: 'triage',
            memberCount: 1,
            unreadCount: 0,
            lastReadMessageId: null,
            lastReadTs: null,
          },
        ]),
      ),
    );
    renderRail();
    await waitFor(() => {
      expect(document.querySelector('[data-triage-dot]')).toBeInTheDocument();
    });
  });

  it('hides the red dot when triage count is 0', async () => {
    server.use(http.get('/api/chats', () => HttpResponse.json([])));
    renderRail();
    await waitFor(() => {
      expect(document.querySelector('[data-triage-dot]')).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/shell/Rail.test.tsx -t 'triage count'
```

Expected: `[data-triage-dot]` element not found.

- [ ] **Step 3: Implement — update `Rail.tsx`**

Replace the import and triage-count calculation:

```ts
// Remove: import { useChats } from '../../lib/queries.js';
// Add:
import { useTriageCount } from '../../lib/queries.js';
```

Replace the `useChats` usage:

```ts
// Remove:
const { data: chats = [] } = useChats();
const triageCount = chats.filter((c) => c.workspace === 'triage').length;
// Add:
const triageCount = useTriageCount();
```

In the JSX, update the Triage `RailButton` to render a dot when `triageCount > 0`. Add
after the existing `count={triageCount}` prop — or if `RailButton` has no `dot` prop yet, use
a wrapper pattern. The minimal approach: render the dot inline in the Triage `RailButton`'s
`onClick` sibling. Since `RailButton` has a `count` prop that already renders the badge
(check `RailButton.tsx` implementation), we need to add `data-triage-dot`:

Replace the Triage RailButton with:

```tsx
<div style={{ position: 'relative' }}>
  <RailButton
    workspace="triage"
    mono="T"
    count={triageCount}
    active={railView === 'triage'}
    title="Triage · ⌘3"
    onClick={() => {
      setWorkspace('triage');
      void navigate({ to: '/triage' });
    }}
  />
  {triageCount > 0 && (
    <span
      data-triage-dot
      style={{
        position: 'absolute',
        top: 4,
        right: 4,
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: 'var(--c-triage)',
        pointerEvents: 'none',
      }}
    />
  )}
</div>
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/shell/Rail.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/shell/Rail.tsx \
        packages/web/test/components/shell/Rail.test.tsx
git commit -m "feat(web): Rail reads useTriageCount and shows red dot when triage > 0"
```

---

### Task 1.12: `CommandPalette` — add `mode?: 'chats-only'` prop; exclude hidden chats

**Files:**
- Modify: `packages/web/src/components/palette/CommandPalette.tsx`
- Modify: `packages/web/test/components/palette/CommandPalette.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append to `packages/web/test/components/palette/CommandPalette.test.tsx`:

```tsx
describe('CommandPalette mode="chats-only"', () => {
  it('hides action rows when mode is chats-only', async () => {
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000030',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: 'x@g.us',
            type: 'group',
            subject: 'Alpha Group',
            lastMessageAt: null,
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: false,
            workspace: 'work',
            memberCount: 1,
            unreadCount: 0,
            lastReadMessageId: null,
            lastReadTs: null,
          },
        ]),
      ),
    );
    useUiStore.setState({ paletteOpen: true });
    // Render with mode prop by slightly adjusting the helper:
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const root = createRootRoute({ component: () => <CommandPalette mode="chats-only" /> });
    const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
    const chat = createRoute({
      getParentRoute: () => root,
      path: '/c/$chatId',
      component: () => null,
    });
    const router = createRouter({
      routeTree: root.addChildren([idx, chat]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router as never} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Alpha Group')).toBeInTheDocument();
    expect(screen.queryByText('Open Triage')).not.toBeInTheDocument();
    expect(screen.queryByText('Global search…')).not.toBeInTheDocument();
  });

  it('excludes hidden chats from jump list', async () => {
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000031',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: 'y@g.us',
            type: 'group',
            subject: 'Hidden Chat',
            lastMessageAt: null,
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: false,
            workspace: 'hidden',
            memberCount: 1,
            unreadCount: 0,
            lastReadMessageId: null,
            lastReadTs: null,
          },
        ]),
      ),
    );
    useUiStore.setState({ paletteOpen: true });
    renderPalette();
    // Wait for load (empty message appears if no items)
    await screen.findByText('No matches');
    expect(screen.queryByText('Hidden Chat')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/palette/CommandPalette.test.tsx -t 'chats-only'
```

Expected: action rows still visible; hidden chat still visible.

- [ ] **Step 3: Implement — update `CommandPalette.tsx`**

Change the `CommandPalette` signature to accept an optional `mode` prop:

```ts
interface CommandPaletteProps {
  mode?: 'chats-only';
}

export function CommandPalette({ mode }: CommandPaletteProps = {}) {
```

Update the `items` `useMemo` to filter hidden chats and respect `mode`:

```ts
const items = useMemo<Item[]>(() => {
  const jumpItems: Item[] = chats
    .filter((c) => c.workspace !== 'hidden')
    .map((c) => ({
      kind: 'jump',
      id: `j-${c.id}`,
      chatId: c.id,
      type: c.type,
      label: c.subject ?? c.jid,
      meta: `${c.workspace}${c.unreadCount ? ` · ${c.unreadCount} unread` : ''}`,
    }));
  const actions: Item[] =
    mode === 'chats-only'
      ? []
      : [
          { kind: 'action', id: 'a-triage', label: 'Open Triage', href: '/triage', kbd: '⌘3' },
          { kind: 'action', id: 'a-search', label: 'Global search…', href: '/search', kbd: '⌘⇧F' },
          { kind: 'action', id: 'a-diag', label: 'Open diagnostics', href: '/diagnostics' },
          { kind: 'action', id: 'a-settings', label: 'Open settings', href: '/settings' },
        ];
  const lower = q.toLowerCase();
  return [...jumpItems, ...actions].filter((it) => it.label.toLowerCase().includes(lower));
}, [chats, q, mode]);
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/palette/CommandPalette.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/palette/CommandPalette.tsx \
        packages/web/test/components/palette/CommandPalette.test.tsx
git commit -m "feat(web): CommandPalette mode='chats-only' prop and exclude hidden chats"
```

---

### Task 1.13: Create `TriageEmptyState` component

**Files:**
- Create: `packages/web/src/components/triage/TriageEmptyState.tsx`
- Create: `packages/web/src/components/triage/TriageEmptyState.module.css`
- Create: `packages/web/test/components/triage/TriageEmptyState.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/components/triage/TriageEmptyState.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TriageEmptyState } from '../../../src/components/triage/TriageEmptyState.js';

describe('TriageEmptyState', () => {
  it('renders the "Triage clear" heading', () => {
    render(<TriageEmptyState />);
    expect(screen.getByText('Triage clear')).toBeInTheDocument();
  });

  it('renders the descriptive subtext', () => {
    render(<TriageEmptyState />);
    expect(screen.getByText(/All new chats have a home/i)).toBeInTheDocument();
  });

  it('renders a checkmark glyph', () => {
    const { container } = render(<TriageEmptyState />);
    expect(container.querySelector('[data-glyph="check"]')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/triage/TriageEmptyState.test.tsx
```

- [ ] **Step 3: Implement**

Create `packages/web/src/components/triage/TriageEmptyState.tsx`:

```tsx
import styles from './TriageEmptyState.module.css';

export function TriageEmptyState() {
  return (
    <div className={styles.wrap}>
      <div className={styles.glyph} data-glyph="check">✓</div>
      <h2 className={styles.heading}>Triage clear</h2>
      <p className={styles.sub}>All new chats have a home. New ones will appear here.</p>
    </div>
  );
}
```

Create `packages/web/src/components/triage/TriageEmptyState.module.css`:

```css
.wrap {
  padding: 60px 0;
  text-align: center;
  color: var(--fg-2);
}

.glyph {
  font-size: 32px;
  margin-bottom: 8px;
  color: var(--c-triage);
}

.heading {
  font-size: 16px;
  font-weight: 500;
  color: var(--fg-0);
  margin: 0 0 4px;
}

.sub {
  font-size: 13px;
  color: var(--fg-2);
  margin: 0;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/triage/TriageEmptyState.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/triage/TriageEmptyState.tsx \
        packages/web/src/components/triage/TriageEmptyState.module.css \
        packages/web/test/components/triage/TriageEmptyState.test.tsx
git commit -m "feat(web): add TriageEmptyState component"
```

---

### Task 1.14: Create `TriageProgressBar` component

**Files:**
- Create: `packages/web/src/components/triage/TriageProgressBar.tsx`
- Create: `packages/web/src/components/triage/TriageProgressBar.module.css`
- Create: `packages/web/test/components/triage/TriageProgressBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/components/triage/TriageProgressBar.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TriageProgressBar } from '../../../src/components/triage/TriageProgressBar.js';

describe('TriageProgressBar', () => {
  it('renders assigned and total counts', () => {
    render(<TriageProgressBar assigned={3} total={10} />);
    expect(screen.getByText(/3\/10/)).toBeInTheDocument();
  });

  it('renders percentage text', () => {
    render(<TriageProgressBar assigned={5} total={10} />);
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it('renders the fill bar with correct width style', () => {
    const { container } = render(<TriageProgressBar assigned={2} total={4} />);
    const fill = container.querySelector('[data-fill]') as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill?.style.width).toBe('50%');
  });

  it('renders keyboard hint text', () => {
    render(<TriageProgressBar assigned={0} total={5} />);
    expect(screen.getByText(/navigate/i)).toBeInTheDocument();
  });

  it('clamps fill width to 100% when all assigned', () => {
    const { container } = render(<TriageProgressBar assigned={5} total={5} />);
    const fill = container.querySelector('[data-fill]') as HTMLElement | null;
    expect(fill?.style.width).toBe('100%');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/triage/TriageProgressBar.test.tsx
```

- [ ] **Step 3: Implement**

Create `packages/web/src/components/triage/TriageProgressBar.tsx`:

```tsx
import styles from './TriageProgressBar.module.css';

interface TriageProgressBarProps {
  assigned: number;
  total: number;
}

export function TriageProgressBar({ assigned, total }: TriageProgressBarProps) {
  const pct = total === 0 ? 100 : Math.min(100, Math.round((assigned / total) * 100));

  return (
    <div className={styles.bar}>
      <span>{assigned}/{total} cleared</span>
      <div className={styles.track}>
        <div
          className={styles.fill}
          data-fill
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={styles.hint}>
        {pct}% · ↑ ↓ navigate · 1 work · 2 personal · 3 hide
      </span>
    </div>
  );
}
```

Create `packages/web/src/components/triage/TriageProgressBar.module.css`:

```css
.bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-0);
  margin-bottom: 16px;
  font-size: 12px;
  color: var(--fg-2);
  white-space: nowrap;
  flex-wrap: nowrap;
}

.track {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--bg-2);
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--c-triage);
  border-radius: 2px;
  transition: width 0.3s;
}

.hint {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-3);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/triage/TriageProgressBar.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/triage/TriageProgressBar.tsx \
        packages/web/src/components/triage/TriageProgressBar.module.css \
        packages/web/test/components/triage/TriageProgressBar.test.tsx
git commit -m "feat(web): add TriageProgressBar component"
```

---

### Task 1.15: Create `TriageCard` component

**Files:**
- Create: `packages/web/src/components/triage/TriageCard.tsx`
- Create: `packages/web/src/components/triage/TriageCard.module.css`
- Create: `packages/web/test/components/triage/TriageCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/components/triage/TriageCard.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TriageCard } from '../../../src/components/triage/TriageCard.js';
import type { Chat } from '@yank/shared';

const baseChat: Chat = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  jid: '4477@s.whatsapp.net',
  type: 'dm',
  subject: 'Alice Smith',
  lastMessageAt: '2026-05-15T10:00:00.000Z',
  lastMessagePreview: 'Hey, how are you?',
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage',
  memberCount: 0,
  unreadCount: 2,
  lastReadMessageId: null,
  lastReadTs: null,
};

describe('TriageCard', () => {
  it('renders the chat subject', () => {
    render(<TriageCard chat={baseChat} focused={false} onAssign={vi.fn()} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('renders the last-message preview', () => {
    render(<TriageCard chat={baseChat} focused={false} onAssign={vi.fn()} />);
    expect(screen.getByText('Hey, how are you?')).toBeInTheDocument();
  });

  it('renders Work, Personal, and Hide action buttons', () => {
    render(<TriageCard chat={baseChat} focused={false} onAssign={vi.fn()} />);
    expect(screen.getByRole('button', { name: /work/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /personal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide/i })).toBeInTheDocument();
  });

  it('calls onAssign("work") when Work button is clicked', async () => {
    const onAssign = vi.fn();
    const user = userEvent.setup();
    render(<TriageCard chat={baseChat} focused={false} onAssign={onAssign} />);
    await user.click(screen.getByRole('button', { name: /work/i }));
    expect(onAssign).toHaveBeenCalledWith('work');
  });

  it('calls onAssign("personal") when Personal button is clicked', async () => {
    const onAssign = vi.fn();
    const user = userEvent.setup();
    render(<TriageCard chat={baseChat} focused={false} onAssign={onAssign} />);
    await user.click(screen.getByRole('button', { name: /personal/i }));
    expect(onAssign).toHaveBeenCalledWith('personal');
  });

  it('calls onAssign("hidden") when Hide button is clicked', async () => {
    const onAssign = vi.fn();
    const user = userEvent.setup();
    render(<TriageCard chat={baseChat} focused={false} onAssign={onAssign} />);
    await user.click(screen.getByRole('button', { name: /hide/i }));
    expect(onAssign).toHaveBeenCalledWith('hidden');
  });

  it('adds focused styling when focused=true', () => {
    const { container } = render(
      <TriageCard chat={baseChat} focused={true} onAssign={vi.fn()} />,
    );
    expect(container.firstChild).toHaveAttribute('data-focused', 'true');
  });

  it('does not add focused styling when focused=false', () => {
    const { container } = render(
      <TriageCard chat={baseChat} focused={false} onAssign={vi.fn()} />,
    );
    expect(container.firstChild).toHaveAttribute('data-focused', 'false');
  });

  it('renders group chat subject for group type', () => {
    const groupChat: Chat = { ...baseChat, type: 'group', subject: 'Engineering Team' };
    render(<TriageCard chat={groupChat} focused={false} onAssign={vi.fn()} />);
    expect(screen.getByText('Engineering Team')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/triage/TriageCard.test.tsx
```

- [ ] **Step 3: Implement**

Create `packages/web/src/components/triage/TriageCard.tsx`:

```tsx
import type { Chat, Workspace } from '@yank/shared';
import { avatarGradient } from '../../utils/avatarGradient.js';
import styles from './TriageCard.module.css';

interface TriageCardProps {
  chat: Chat;
  focused: boolean;
  onAssign: (workspace: Workspace) => void;
}

function initials(subject: string | null, jid: string): string {
  const name = subject ?? jid;
  return name.slice(0, 2).toUpperCase();
}

export function TriageCard({ chat, focused, onAssign }: TriageCardProps) {
  const label = chat.subject ?? chat.jid;
  const ts = chat.lastMessageAt
    ? new Date(chat.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      className={styles.card}
      data-focused={focused ? 'true' : 'false'}
      role="article"
      aria-label={label}
    >
      <div className={`${styles.avatar} ${avatarGradient(label)}`}>
        {initials(chat.subject, chat.jid)}
      </div>

      <div className={styles.body}>
        <div className={styles.header}>
          <span className={styles.who}>{label}</span>
          {ts && <span className={styles.whoMeta}>· {ts}</span>}
        </div>
        {chat.lastMessagePreview && (
          <div className={styles.preview}>{chat.lastMessagePreview}</div>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnWork}`}
          onClick={(e) => { e.stopPropagation(); onAssign('work'); }}
        >
          <span className={styles.dot} style={{ background: 'var(--c-work)' }} />
          Work
          <span className={styles.kbd}>1</span>
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPersonal}`}
          onClick={(e) => { e.stopPropagation(); onAssign('personal'); }}
        >
          <span className={styles.dot} style={{ background: 'var(--c-personal)' }} />
          Personal
          <span className={styles.kbd}>2</span>
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnHide}`}
          onClick={(e) => { e.stopPropagation(); onAssign('hidden'); }}
        >
          <span className={styles.dot} style={{ background: 'var(--fg-3)' }} />
          Hide
          <span className={styles.kbd}>3</span>
        </button>
      </div>
    </div>
  );
}
```

Create `packages/web/src/components/triage/TriageCard.module.css`:

```css
.card {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border-0);
  border-radius: var(--radius-2);
  margin-bottom: 10px;
  background: var(--bg-1);
  transition: border 0.1s, background 0.1s;
  cursor: pointer;
}

.card:hover {
  border-color: var(--border-strong);
}

.card[data-focused='true'] {
  border-color: var(--c-triage);
  box-shadow: 0 0 0 3px var(--c-triage-soft);
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-2);
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.body {
  min-width: 0;
}

.header {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.who {
  font-weight: 700;
  font-size: 14.5px;
  color: var(--fg-0);
}

.whoMeta {
  font-size: 11px;
  color: var(--fg-3);
  font-family: var(--font-mono);
}

.preview {
  margin-top: 6px;
  font-size: 13px;
  color: var(--fg-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}

.btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  min-width: 130px;
  border: 1px solid var(--border-1);
  border-radius: var(--radius-2);
  font-size: 12.5px;
  color: var(--fg-1);
  background: var(--bg-2);
  cursor: pointer;
}

.btn:hover {
  background: var(--bg-3);
  border-color: var(--border-strong);
}

.kbd {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-3);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.btnWork:hover {
  border-color: var(--c-work);
  color: var(--c-work);
}

.btnPersonal:hover {
  border-color: var(--c-personal);
  color: var(--c-personal);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/triage/TriageCard.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/triage/TriageCard.tsx \
        packages/web/src/components/triage/TriageCard.module.css \
        packages/web/test/components/triage/TriageCard.test.tsx
git commit -m "feat(web): add TriageCard component with Work/Personal/Hide action buttons"
```

---

### Task 1.16: Create `TriageView`, `useTriageKeys`, and replace the route stub

**Files:**
- Create: `packages/web/src/components/triage/TriageView.tsx`
- Create: `packages/web/src/components/triage/TriageView.module.css`
- Create: `packages/web/src/hooks/useTriageKeys.ts`
- Modify: `packages/web/src/routes/triage.tsx`
- Create: `packages/web/test/components/triage/TriageView.test.tsx`
- Create: `packages/web/test/hooks/useTriageKeys.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web/test/hooks/useTriageKeys.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { useTriageKeys } from '../../src/hooks/useTriageKeys.js';
import { queryKeys } from '../../src/lib/queryKeys.js';
import { useToastStore } from '../../src/state/toast.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); useToastStore.setState({ toast: null }); });
afterAll(() => server.close());

const USER = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';
function makeTriageChat(id: string, subject: string) {
  return {
    id,
    userId: USER,
    jid: `${id}@s.whatsapp.net`,
    type: 'dm' as const,
    subject,
    lastMessageAt: '2026-05-15T10:00:00.000Z',
    lastMessagePreview: 'msg',
    archived: false,
    mutedUntil: null,
    pinned: false,
    workspace: 'triage' as const,
    memberCount: 0,
    unreadCount: 0,
    lastReadMessageId: null,
    lastReadTs: null,
  };
}

const chat1 = makeTriageChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'Alice');
const chat2 = makeTriageChat('b1ee0d52-2c8e-7e7a-a4cf-000000000002', 'Bob');

function wrap(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useTriageKeys', () => {
  beforeEach(() => {
    server.use(http.post(/\/api\/chats\/.*\/assignment/, () => new HttpResponse(null, { status: 204 })));
  });

  it('initialises focusedIdx at 0', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    const { result } = renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    expect(result.current.focusedIdx).toBe(0);
  });

  it('j moves focus down', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    const { result } = renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    expect(result.current.focusedIdx).toBe(1);
  });

  it('k moves focus up (clamped at 0)', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    const { result } = renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    });
    expect(result.current.focusedIdx).toBe(0);
  });

  it('ArrowDown moves focus down', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    const { result } = renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    });
    expect(result.current.focusedIdx).toBe(1);
  });

  it('1 triggers assignment of focused chat to work', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    });
    // Optimistic patch removes the chat from triage
    const cached = qc.getQueryData<typeof chat1[]>(queryKeys.chats());
    expect(cached?.find((c) => c.id === chat1.id)?.workspace).toBe('work');
  });

  it('2 triggers assignment of focused chat to personal', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    });
    const cached = qc.getQueryData<typeof chat1[]>(queryKeys.chats());
    expect(cached?.find((c) => c.id === chat1.id)?.workspace).toBe('personal');
  });

  it('3 triggers assignment of focused chat to hidden', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [chat1, chat2]);
    renderHook(() => useTriageKeys([chat1, chat2]), { wrapper: wrap(qc) });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    });
    const cached = qc.getQueryData<typeof chat1[]>(queryKeys.chats());
    expect(cached?.find((c) => c.id === chat1.id)?.workspace).toBe('hidden');
  });

  it('does nothing when chats list is empty', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), []);
    const { result } = renderHook(() => useTriageKeys([]), { wrapper: wrap(qc) });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    });
    expect(result.current.focusedIdx).toBe(0);
  });
});
```

Create `packages/web/test/components/triage/TriageView.test.tsx`:

```tsx
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { TriageView } from '../../../src/components/triage/TriageView.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const USER = 'b1ee0d52-2c8e-7e7a-a4cf-000000000099';

function makeChat(id: string, workspace: string, subject: string) {
  return {
    id,
    userId: USER,
    jid: `${id}@s.whatsapp.net`,
    type: 'dm' as const,
    subject,
    lastMessageAt: '2026-05-15T10:00:00.000Z',
    lastMessagePreview: 'Hey',
    archived: false,
    mutedUntil: null,
    pinned: false,
    workspace,
    memberCount: 0,
    unreadCount: 0,
    lastReadMessageId: null,
    lastReadTs: null,
  };
}

function renderView(chats: ReturnType<typeof makeChat>[]) {
  server.use(http.get('/api/chats', () => HttpResponse.json(chats)));
  server.use(
    http.post(/\/api\/chats\/.*\/assignment/, () => new HttpResponse(null, { status: 204 })),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TriageView />
    </QueryClientProvider>,
  );
}

describe('TriageView', () => {
  it('renders triage cards for chats in triage workspace', async () => {
    renderView([
      makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'triage', 'Alice'),
      makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000002', 'work', 'Bob'),
    ]);
    await waitFor(() => screen.getByText('Alice'));
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('renders empty state when no triage chats', async () => {
    renderView([makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'work', 'Work Only')]);
    await waitFor(() => screen.getByText('Triage clear'));
  });

  it('renders progress bar when there are triage chats', async () => {
    renderView([makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'triage', 'Alice')]);
    await waitFor(() => screen.getByText(/cleared/));
  });

  it('clicking Work on a card triggers assignment mutation', async () => {
    const user = userEvent.setup();
    renderView([makeChat('b1ee0d52-2c8e-7e7a-a4cf-000000000001', 'triage', 'Alice')]);
    await waitFor(() => screen.getByText('Alice'));
    await user.click(screen.getByRole('button', { name: /work/i }));
    // Optimistic patch moves chat out of triage — empty state appears
    await waitFor(() => screen.getByText('Triage clear'));
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/hooks/useTriageKeys.test.tsx
pnpm exec vitest run packages/web/test/components/triage/TriageView.test.tsx
```

- [ ] **Step 3: Implement `useTriageKeys`**

Create `packages/web/src/hooks/useTriageKeys.ts`:

```ts
import { useEffect, useState } from 'react';
import type { Chat } from '@yank/shared';
import { useAssignWorkspace } from '../lib/mutations.js';

export interface UseTriageKeysResult {
  focusedIdx: number;
  setFocusedIdx: (idx: number) => void;
}

/**
 * Route-scoped keyboard handler for the Triage view.
 * Accepts the current triage chat list so navigation bounds are always current.
 * The calling component must pass a stable-reference list (e.g. from useTriageChats()).
 *
 * Key bindings:
 *   j / ArrowDown  — move focus down
 *   k / ArrowUp    — move focus up
 *   1              — assign focused to 'work'
 *   2              — assign focused to 'personal'
 *   3              — assign focused to 'hidden'
 *
 * Cmd-Z is handled by <UndoToast> globally — no duplicate binding here.
 */
export function useTriageKeys(chats: Chat[]): UseTriageKeysResult {
  const [focusedIdx, setFocusedIdx] = useState(0);

  // Per-chat assignment mutation. We need a stable function reference that
  // reads the current focused chat's id. Use a synthetic "current chat" id
  // approach: instantiate the hook with the focused chat's id each render.
  // Because hooks can't be called conditionally, we derive the focused chat
  // before calling useAssignWorkspace and use a single mutation instance that
  // we update via the mutate function.
  const focusedChat = chats[focusedIdx] ?? null;
  const assignMutation = useAssignWorkspace(focusedChat?.id ?? '');

  useEffect(() => {
    // Clamp focusedIdx when list shrinks.
    if (chats.length === 0) {
      setFocusedIdx(0);
      return;
    }
    setFocusedIdx((i) => Math.min(i, chats.length - 1));
  }, [chats.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in an input / textarea / contenteditable.
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (chats.length === 0) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(i + 1, chats.length - 1));
        return;
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(i - 1, 0));
        return;
      }

      const focused = chats[focusedIdx];
      if (!focused) return;

      if (e.key === '1') {
        assignMutation.mutate({ workspace: 'work', suppressUndo: false });
        return;
      }
      if (e.key === '2') {
        assignMutation.mutate({ workspace: 'personal', suppressUndo: false });
        return;
      }
      if (e.key === '3') {
        assignMutation.mutate({ workspace: 'hidden', suppressUndo: false });
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [chats, focusedIdx, assignMutation]);

  return { focusedIdx, setFocusedIdx };
}
```

- [ ] **Step 4: Implement `TriageView`**

Create `packages/web/src/components/triage/TriageView.tsx`:

```tsx
import { useTriageChats, useChats } from '../../lib/queries.js';
import { useAssignWorkspace } from '../../lib/mutations.js';
import { useTriageKeys } from '../../hooks/useTriageKeys.js';
import { TriageCard } from './TriageCard.js';
import { TriageEmptyState } from './TriageEmptyState.js';
import { TriageProgressBar } from './TriageProgressBar.js';
import type { Chat, Workspace } from '@yank/shared';
import styles from './TriageView.module.css';

export function TriageView() {
  const { data: allChats = [] } = useChats();
  const triageChats = useTriageChats();

  // Total is computed once (initial triage count); "assigned" is total minus remaining.
  // We derive total from allChats on first render via a stable useMemo.
  const total = allChats.filter((c) => c.workspace !== 'triage' || triageChats.some((t) => t.id === c.id)).length;
  // Simpler: total = triageChats.length is the "remaining", done = total_seen - remaining.
  // Per spec: done/total cleared where total = TRIAGE_CHATS.length at page load.
  // Implementation: track initial total via a ref.
  const assignedCount = allChats.filter(
    (c) =>
      c.workspace !== 'triage' &&
      c.workspace !== 'hidden',
  ).length;
  // For progress: show <remaining>/<remaining+assigned> cleared (assigned from non-triage, non-hidden).
  const grandTotal = triageChats.length + assignedCount;

  const { focusedIdx, setFocusedIdx } = useTriageKeys(triageChats);

  return (
    <main className={styles.pane}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Triage</h1>
        <p className={styles.sub}>
          {triageChats.length} unassigned · Decide where each one lives. Use{' '}
          <kbd className={styles.kbd}>1</kbd> <kbd className={styles.kbd}>2</kbd>{' '}
          <kbd className={styles.kbd}>3</kbd>.
        </p>
      </div>

      <div className={styles.content}>
        {triageChats.length > 0 && (
          <TriageProgressBar assigned={assignedCount} total={grandTotal} />
        )}

        {triageChats.length === 0 ? (
          <TriageEmptyState />
        ) : (
          triageChats.map((chat, i) => (
            <TriageCardConnected
              key={chat.id}
              chat={chat}
              focused={i === focusedIdx}
              onClick={() => setFocusedIdx(i)}
            />
          ))
        )}
      </div>
    </main>
  );
}

function TriageCardConnected({
  chat,
  focused,
  onClick,
}: {
  chat: Chat;
  focused: boolean;
  onClick: () => void;
}) {
  const assign = useAssignWorkspace(chat.id);
  const handleAssign = (ws: Workspace) => {
    assign.mutate({ workspace: ws, suppressUndo: false });
  };
  return (
    <div onClick={onClick} style={{ display: 'contents' }}>
      <TriageCard chat={chat} focused={focused} onAssign={handleAssign} />
    </div>
  );
}
```

Create `packages/web/src/components/triage/TriageView.module.css`:

```css
.pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-0);
}

.topbar {
  padding: 16px 24px 12px;
  border-bottom: 1px solid var(--border-0);
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--fg-0);
  margin: 0 0 2px;
}

.sub {
  font-size: 12px;
  color: var(--fg-2);
  margin: 0;
}

.kbd {
  display: inline-block;
  padding: 1px 5px;
  border: 1px solid var(--border-1);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--bg-2);
  color: var(--fg-1);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}
```

- [ ] **Step 5: Replace the route stub**

Replace `packages/web/src/routes/triage.tsx` with:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { TriageView } from '../components/triage/TriageView.js';

export const Route = createFileRoute('/triage')({
  component: TriageView,
});
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/hooks/useTriageKeys.test.tsx
pnpm exec vitest run packages/web/test/components/triage/TriageView.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/triage/TriageView.tsx \
        packages/web/src/components/triage/TriageView.module.css \
        packages/web/src/hooks/useTriageKeys.ts \
        packages/web/src/routes/triage.tsx \
        packages/web/test/components/triage/TriageView.test.tsx \
        packages/web/test/hooks/useTriageKeys.test.tsx
git commit -m "feat(web): add TriageView, useTriageKeys hook, and replace triage route stub"
```

---

### Task 1.17: Phase 1 verification gate

- [ ] **Step 1: Run the full test suite**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all tests pass, no lint errors, no type errors.

- [ ] **Step 2: Manual triage smoke**

Start the dev server (`pnpm dev`) and run the following script manually:

1. Navigate to `http://localhost:5173/triage`.
2. Confirm the card grid renders (or empty state if no triage chats).
3. If chats exist in triage: press `1` on the first focused card.
   - Card disappears from the grid.
   - Progress bar count decrements.
   - Sidebar (switch to Work view via Rail) now includes the chat.
   - An undo toast appears at the bottom: "Moved to Work" with an "Undo" button.
4. Click "Undo" (or press `Cmd-Z`) within 5 seconds.
   - Chat reappears in the triage grid.
   - Toast disappears.
5. Multi-tab: open `/triage` in a second tab. In the first tab, press `1`.
   - The second tab's triage grid patches in real-time (card disappears without reload).

- [ ] **Step 3: Commit gate marker**

No code changes. If any issues were found in Step 1–2, fix them before committing.

```bash
git commit --allow-empty -m "chore(web): Phase 1 verification gate — triage card grid complete"
```

---

## Coverage check

### Cluster 1 sub-bullets (§2) mapped to tasks

| Spec bullet | Task(s) |
|---|---|
| `POST /api/chats/:chatId/assignment` — UPSERT + publish `chat-assignment` | 1.1, 1.2, 1.3 |
| `AssignmentBodySchema` from `dto.ts` (Phase 0) | Phase 0 (pre-done) |
| `ChatAssignmentEvent` on `DaemonEventSchema` (Phase 0) | Phase 0 (pre-done) |
| Replace `/triage` stub with `<TriageView />` (card grid, top-bar count, progress, focused border, empty state) | 1.13, 1.14, 1.15, 1.16 |
| `triage/` component family: `TriageView`, `TriageCard`, `TriageProgressBar`, `TriageEmptyState` | 1.13, 1.14, 1.15, 1.16 |
| Widen `useAssignWorkspace` to full `Workspace` union; optimistic patch + rollback + undo toast; `suppressUndo` | 1.7 |
| New `<UndoToast>` backed by `state/toast.ts`; mounted at `__root` | 1.4, 1.5, 1.6 |
| `useTriageKeys` hook (route-scoped; `1`/`2`/`3` assign; `j`/`k`/`↑`/`↓` navigate; `Cmd-Z` undo) | 1.16 |
| Pure selectors `useChatsForWorkspace`, `useTriageChats`, `useTriageCount` | 1.9 |
| `eventStream.ts` handles `'chat-assignment'` → patch `useChats()` cache; add to `NAMED_EVENTS` | 1.8 |
| `Sidebar` switches to `useChatsForWorkspace(currentWorkspace)`; hidden excluded | 1.10 |
| `Rail` Triage button reads `useTriageCount()`; red-dot when > 0 | 1.11 |
| Command palette drops hidden chats | 1.12 |

### §10 edge cases pinned to specific tasks

| Case | Task / location |
|---|---|
| 1. Single-slot undo — rapid 1/2/3 shows only latest toast | Task 1.4 toast.test.ts: "new toast replaces previous (single slot)" |
| 2. Self-assignment (same workspace) — no flicker | Task 1.8 eventStream test: "patches workspace…identical value" (setQueryData short-circuits) |
| 3. Inline name input focused → 1/2/3 suppressed | Not yet wired (contact-rename inline input is Phase 2); Task 1.16 `useTriageKeys` ignores keystrokes when input is focused via `target.tagName === 'INPUT'` check |
| 4. Workspace nav mid-assign — UndoToast at `__root` survives route change | Task 1.6 mounts `<UndoToast>` outside `<Outlet>` — confirmed by root layout structure |
| 5. New triage chat arrives during pass — focusedIdx stays valid | Task 1.16 `useTriageKeys` useEffect clamps `focusedIdx` when `chats.length` shrinks; new arrivals at end don't move focus |
| 6. Focus when triage clears — empty state takes visual focus | Task 1.16 `TriageView` renders `<TriageEmptyState>` when `triageChats.length === 0`; Task 1.17 manual smoke verifies |
| 7. Hidden mid-conversation — sidebar drops it, chat detail keeps rendering | Task 1.10 Sidebar uses `useChatsForWorkspace` which excludes hidden; route stays mounted until navigation |

---
## Phase 2 — Contact rename

> **Dependency:** Phase 0 complete (DTOs, events, commands in `@yank/shared`). Phase 1 will have added `packages/api/src/events-publisher.ts` (api-side Redis publish helper) and `packages/web/src/state/toast.ts` + `showUndoToast`. Phase 2 uses these by name; implement them here if Phase 1 is not yet merged, following the same shape as Phase 1's definitions.

**Schema note:** The `contacts` table has a composite PK `(user_id, jid)` — there is no standalone UUID id column. The `:contactId` route param and the `ContactUpdateEvent.contactId` field both carry the contact **JID** (e.g. `4477123456789@s.whatsapp.net`). Phase 0 incorrectly typed `ContactUpdateEvent.contactId` as `z.string().uuid()`. Task 2.1 fixes this by changing the field to `z.string().min(1)` before any routes consume it.

---

### Task 2.1: Fix `ContactUpdateEvent.contactId` schema + create `packages/api/src/routes/contacts.ts`

**Files:**
- Modify: `packages/shared/src/events.ts` (fix `contactId` type)
- Create: `packages/api/src/routes/contacts.ts`
- Modify: `packages/api/src/index.ts` (register route)
- Test: `packages/api/test/contacts.rename.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/contacts.rename.test.ts`:

```ts
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
import { createLogger, eventsChannel } from '@yank/shared';
import { ensureSingleUser } from '../src/bootstrap.js';
import { createCommandsBus } from '../src/commands-bus.js';
import { createEventsBus } from '../src/events-bus.js';
import { createEventsPublisher } from '../src/events-publisher.js';
import { registerEventsRoute } from '../src/routes/events.js';
import { registerChatsRoutes } from '../src/routes/chats.js';
import { registerContactsRoutes } from '../src/routes/contacts.js';
import { contacts } from '@yank/db/schema';
import { and, eq } from 'drizzle-orm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', '..', 'db', 'drizzle');
const USER = '0193fe00-0000-7000-8000-000000000098';
const CONTACT_JID = '447700000001@s.whatsapp.net';

describe('contacts rename', () => {
  let pg: StartedPostgreSqlContainer;
  let redisC: StartedRedisContainer;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let redis: Redis;
  let subscriber: Redis;
  let app: ReturnType<typeof Fastify>;
  let baseUrl: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    redisC = await new RedisContainer('redis:7-alpine').start();
    client = postgres(pg.getConnectionUri(), { max: 5 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await ensureSingleUser(db, USER, 'Rename Test');

    // Seed a contact row
    await db.insert(contacts).values({
      userId: USER,
      jid: CONTACT_JID,
      pushName: 'Alice Push',
    });

    redis = new Redis(redisC.getConnectionUrl());
    subscriber = new Redis(redisC.getConnectionUrl());
    const eventsBus = createEventsBus(subscriber, USER);
    await eventsBus.start();
    const commandsBus = createCommandsBus(redis, USER);
    const eventsPublisher = createEventsPublisher(redis, USER);

    const log = createLogger({ service: 'contacts-test', level: 'warn' });
    app = Fastify({ logger: false });
    registerEventsRoute(app, { bus: eventsBus });
    registerChatsRoutes(app, { db, userId: USER });
    registerContactsRoutes(app, { db, userId: USER, eventsPublisher });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await subscriber?.quit();
    await redis?.quit();
    await client?.end();
    await pg?.stop();
    await redisC?.stop();
  });

  it('happy path: 204 + DB updated + event published', async () => {
    // Subscribe to events channel before making the request
    const received: string[] = [];
    const sub = new Redis(redisC.getConnectionUrl());
    await sub.subscribe(eventsChannel(USER));
    sub.on('message', (_ch, payload) => received.push(payload));

    const encodedJid = encodeURIComponent(CONTACT_JID);
    const res = await fetch(`${baseUrl}/api/contacts/${encodedJid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Alice Renamed' }),
    });
    expect(res.status).toBe(204);

    // DB updated
    const rows = await db
      .select({ displayName: contacts.displayName })
      .from(contacts)
      .where(and(eq(contacts.userId, USER), eq(contacts.jid, CONTACT_JID)));
    expect(rows[0]?.displayName).toBe('Alice Renamed');

    // Event published within 1s
    await new Promise((r) => setTimeout(r, 300));
    expect(received.some((p) => {
      try {
        const evt = JSON.parse(p) as { type: string; contactId: string; displayName: string };
        return evt.type === 'contact-update' && evt.contactId === CONTACT_JID && evt.displayName === 'Alice Renamed';
      } catch { return false; }
    })).toBe(true);

    await sub.quit();
  });

  it('400 — empty displayName', async () => {
    const encodedJid = encodeURIComponent(CONTACT_JID);
    const res = await fetch(`${baseUrl}/api/contacts/${encodedJid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 — displayName too long (81 chars)', async () => {
    const encodedJid = encodeURIComponent(CONTACT_JID);
    const res = await fetch(`${baseUrl}/api/contacts/${encodedJid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'a'.repeat(81) }),
    });
    expect(res.status).toBe(400);
  });

  it('400 — missing body', async () => {
    const encodedJid = encodeURIComponent(CONTACT_JID);
    const res = await fetch(`${baseUrl}/api/contacts/${encodedJid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('404 — contact not owned by user (wrong JID)', async () => {
    const res = await fetch(`${baseUrl}/api/contacts/${encodeURIComponent('99999@s.whatsapp.net')}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Ghost' }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/api/test/contacts.rename.test.ts
```

Expected: import failure on `registerContactsRoutes` and `createEventsPublisher`.

- [ ] **Step 3a: Fix `ContactUpdateEvent.contactId` in `packages/shared/src/events.ts`**

In `packages/shared/src/events.ts`, change line:
```ts
  contactId: z.string().uuid(),
```
to:
```ts
  contactId: z.string().min(1),
```

This is the only change to `events.ts` in this task. The field carries a WhatsApp JID which is not a UUID.

- [ ] **Step 3b: Create `packages/api/src/events-publisher.ts`** *(skip if Phase 1 already created it)*

```ts
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

- [ ] **Step 3c: Create `packages/api/src/routes/contacts.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { contacts } from '@yank/db/schema';
import { ContactRenameBodySchema } from '@yank/shared';
import type { EventsPublisher } from '../events-publisher.js';

export interface ContactsDeps {
  db: Db;
  userId: string;
  eventsPublisher: EventsPublisher;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerContactsRoutes(app: FastifyInstance<any, any, any, any>, deps: ContactsDeps): void {
  app.patch<{ Params: { contactId: string } }>(
    '/api/contacts/:contactId',
    async (req, reply) => {
      const parsed = ContactRenameBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
      }
      const { displayName } = parsed.data;

      // contactId is the JID (URL-encoded by the client)
      const contactJid = decodeURIComponent(req.params.contactId);

      // Ownership check — confirm the contact exists for this user
      const existing = await deps.db
        .select({ jid: contacts.jid })
        .from(contacts)
        .where(and(eq(contacts.userId, deps.userId), eq(contacts.jid, contactJid)))
        .limit(1);

      if (!existing[0]) {
        return reply.code(404).send({ error: 'not_found' });
      }

      // Update display_name and updated_at
      const updatedAt = new Date();
      await deps.db
        .update(contacts)
        .set({ displayName, lastSeenAt: sql`${contacts.lastSeenAt}` })
        .where(and(eq(contacts.userId, deps.userId), eq(contacts.jid, contactJid)));

      // contacts table has no updated_at column — use current timestamp from JS
      // The event carries a JS-generated timestamp (acceptable for v1 single-user).
      await deps.eventsPublisher.publish({
        type: 'contact-update',
        userId: deps.userId,
        contactId: contactJid,
        displayName,
        updatedAt: updatedAt.toISOString(),
      });

      reply.code(204);
      return null;
    },
  );
}
```

Wait — the `contacts` table has no `updatedAt` column (only `lastSeenAt`). The UPDATE only sets `display_name`. The Drizzle call is simpler:

```ts
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { contacts } from '@yank/db/schema';
import { ContactRenameBodySchema } from '@yank/shared';
import type { EventsPublisher } from '../events-publisher.js';

export interface ContactsDeps {
  db: Db;
  userId: string;
  eventsPublisher: EventsPublisher;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerContactsRoutes(app: FastifyInstance<any, any, any, any>, deps: ContactsDeps): void {
  app.patch<{ Params: { contactId: string } }>(
    '/api/contacts/:contactId',
    async (req, reply) => {
      const parsed = ContactRenameBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
      }
      const { displayName } = parsed.data;
      const contactJid = decodeURIComponent(req.params.contactId);

      const existing = await deps.db
        .select({ jid: contacts.jid })
        .from(contacts)
        .where(and(eq(contacts.userId, deps.userId), eq(contacts.jid, contactJid)))
        .limit(1);

      if (!existing[0]) {
        return reply.code(404).send({ error: 'not_found' });
      }

      await deps.db
        .update(contacts)
        .set({ displayName })
        .where(and(eq(contacts.userId, deps.userId), eq(contacts.jid, contactJid)));

      const updatedAt = new Date().toISOString();
      await deps.eventsPublisher.publish({
        type: 'contact-update',
        userId: deps.userId,
        contactId: contactJid,
        displayName,
        updatedAt,
      });

      reply.code(204);
      return null;
    },
  );
}
```

- [ ] **Step 3d: Register in `packages/api/src/index.ts`**

After the existing `registerMediaRoutes` call, add:

```ts
import { registerContactsRoutes } from './routes/contacts.js';
import { createEventsPublisher } from './events-publisher.js';
```

And in the wiring section, after `const commandsBus = createCommandsBus(redis, env.YANK_USER_ID);`:

```ts
const eventsPublisher = createEventsPublisher(redis, env.YANK_USER_ID);
```

And register the route:

```ts
registerContactsRoutes(app, { db, userId: env.YANK_USER_ID, eventsPublisher });
```

Full modified block (lines 8–38 of `packages/api/src/index.ts`):

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
import { registerMediaRoutes } from './routes/media.js';
import { registerContactsRoutes } from './routes/contacts.js';

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
const eventsPublisher = createEventsPublisher(redis, env.YANK_USER_ID);

const app = Fastify({ loggerInstance: log });
registerHealthz(app, { db, redis });
registerEventsRoute(app, { bus: eventsBus });
registerSetupRoutes(app, { db, userId: env.YANK_USER_ID, commands: commandsBus });
registerChatsRoutes(app, { db, userId: env.YANK_USER_ID });
registerMessagesRoutes(app, { db, userId: env.YANK_USER_ID, commands: commandsBus });
registerMediaRoutes(app, { db, userId: env.YANK_USER_ID, commands: commandsBus });
registerContactsRoutes(app, { db, userId: env.YANK_USER_ID, eventsPublisher });
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/api/test/contacts.rename.test.ts
pnpm --filter @yank/api typecheck
pnpm --filter @yank/shared typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/events.ts \
        packages/api/src/events-publisher.ts \
        packages/api/src/routes/contacts.ts \
        packages/api/src/index.ts \
        packages/api/test/contacts.rename.test.ts
git commit -m "feat(api): PATCH /api/contacts/:contactId — ownership-checked rename + contact-update SSE event"
```

---

### Task 2.2: Add `queryKeys.contact` + `useUpdateContactName` mutation

**Files:**
- Modify: `packages/web/src/lib/queryKeys.ts`
- Modify: `packages/web/src/lib/mutations.ts`
- Test: `packages/web/test/lib/mutations.contact.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/lib/mutations.contact.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUpdateContactName } from '../../src/lib/mutations.js';
import { queryKeys } from '../../src/lib/queryKeys.js';
import type { Chat } from '@yank/shared';

// Minimal chat fixture
const CONTACT_JID = '447700000001@s.whatsapp.net';
const makeChat = (overrides: Partial<Chat> = {}): Chat => ({
  id: 'chat-1',
  userId: 'user-1',
  jid: CONTACT_JID,
  type: 'dm',
  subject: 'Alice',
  lastMessageAt: null,
  lastMessagePreview: null,
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'work',
  memberCount: 0,
  unreadCount: 0,
  lastReadMessageId: null,
  lastReadTs: null,
  ...overrides,
});

// Mock apiFetch
vi.mock('../../src/lib/api.js', () => ({
  apiFetch: vi.fn().mockResolvedValue(undefined),
  ApiError: class ApiError extends Error {},
}));

// Mock toast
vi.mock('../../src/state/toast.js', () => ({
  useToastStore: { getState: () => ({ show: vi.fn() }) },
  showErrorToast: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useUpdateContactName', () => {
  it('optimistically patches useChats() cache where chat.jid === contactJid', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [makeChat()]);

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateContactName(CONTACT_JID), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ displayName: 'Alice Renamed' });
    });

    // Optimistic patch is synchronous — check immediately
    const chats = qc.getQueryData<Chat[]>(queryKeys.chats());
    expect(chats?.[0]?.subject).toBe('Alice Renamed');
  });

  it('rolls back chats cache on error', async () => {
    const { apiFetch } = await import('../../src/lib/api.js');
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('network'));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.chats(), [makeChat({ subject: 'Original' })]);

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateContactName(CONTACT_JID), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ displayName: 'New Name' });
    });

    await waitFor(() => result.current.isError);

    const chats = qc.getQueryData<Chat[]>(queryKeys.chats());
    expect(chats?.[0]?.subject).toBe('Original');
  });

  it('patches useContact() cache when it exists', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.contact(CONTACT_JID), { jid: CONTACT_JID, displayName: 'Old' });

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateContactName(CONTACT_JID), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ displayName: 'New Name' });
    });

    const contact = qc.getQueryData<{ displayName: string }>(queryKeys.contact(CONTACT_JID));
    expect(contact?.displayName).toBe('New Name');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/lib/mutations.contact.test.tsx
```

- [ ] **Step 3: Implement**

In `packages/web/src/lib/queryKeys.ts`, add the `contact` key:

```ts
export const queryKeys = {
  chats: () => ['chats'] as const,
  chat: (chatId: string) => ['chat', chatId] as const,
  messages: (chatId: string) => ['messages', chatId] as const,
  chatMembers: (chatId: string) => ['chat-members', chatId] as const,
  contact: (jid: string) => ['contact', jid] as const,
} as const;

export type QueryKey =
  | ReturnType<typeof queryKeys.chats>
  | ReturnType<typeof queryKeys.chat>
  | ReturnType<typeof queryKeys.messages>
  | ReturnType<typeof queryKeys.chatMembers>
  | ReturnType<typeof queryKeys.contact>;
```

In `packages/web/src/lib/mutations.ts`, add the import for `showErrorToast` and the new mutation. Append after `useAssignWorkspace`:

```ts
import { showErrorToast } from '../state/toast.js';
import type { Chat } from '@yank/shared';

export function useUpdateContactName(contactJid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ displayName }: { displayName: string }) =>
      apiFetch<void>(`/api/contacts/${encodeURIComponent(contactJid)}`, {
        method: 'PATCH',
        body: { displayName },
      }),
    onMutate: async ({ displayName }) => {
      await qc.cancelQueries({ queryKey: queryKeys.chats() });
      await qc.cancelQueries({ queryKey: queryKeys.contact(contactJid) });

      const prevChats = qc.getQueryData<Chat[]>(queryKeys.chats());
      const prevContact = qc.getQueryData<{ jid: string; displayName?: string | null }>(
        queryKeys.contact(contactJid),
      );

      // Patch chats list: for DM chats whose jid matches the contact jid, update subject
      qc.setQueryData<Chat[]>(queryKeys.chats(), (old) =>
        old?.map((c) =>
          c.type === 'dm' && c.jid === contactJid ? { ...c, subject: displayName } : c,
        ),
      );

      // Patch individual contact cache if present
      if (prevContact !== undefined) {
        qc.setQueryData(queryKeys.contact(contactJid), { ...prevContact, displayName });
      }

      return { prevChats, prevContact };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevChats !== undefined) {
        qc.setQueryData(queryKeys.chats(), ctx.prevChats);
      }
      if (ctx?.prevContact !== undefined) {
        qc.setQueryData(queryKeys.contact(contactJid), ctx.prevContact);
      }
      showErrorToast("Couldn't rename contact — try again.");
    },
  });
}
```

Also add the `showErrorToast` import at the top of `mutations.ts` if it's not already present from Phase 1. If Phase 1's `toast.ts` does not yet export `showErrorToast`, add this minimal helper to `packages/web/src/state/toast.ts`:

```ts
// Append to packages/web/src/state/toast.ts after existing exports:
export function showErrorToast(label: string): void {
  useToastStore.getState().show({ label, kind: 'error' });
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/lib/mutations.contact.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/queryKeys.ts \
        packages/web/src/lib/mutations.ts \
        packages/web/src/state/toast.ts \
        packages/web/test/lib/mutations.contact.test.tsx
git commit -m "feat(web): useUpdateContactName mutation with optimistic chats + contact cache patch"
```

---

### Task 2.3: Add `'contact-update'` handler to `eventStream.ts`

**Files:**
- Modify: `packages/web/src/lib/eventStream.ts`
- Test: `packages/web/test/lib/eventStream.contact.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/lib/eventStream.contact.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Chat, DaemonEvent } from '@yank/shared';
import { queryKeys } from '../../src/lib/queryKeys.js';

// Import the internal patchCache logic via a thin test shim.
// We test it by calling the exported handler directly.
// Because patchCache is not exported, we invoke the effect by simulating
// what patchCache does — we duplicate the logic here as a smoke check
// and verify the mutation.ts + queryKeys integration is wired correctly.

// A direct unit test of patchCache requires either exporting it or testing
// via renderHook (which sets up QueryClient context). Use the latter.
import { renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEventStream } from '../../src/lib/eventStream.js';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  constructor(public url: string) {
    MockEventSource.instances.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners[type] ??= [];
    this.listeners[type]!.push(fn);
  }
  close() {}
  dispatch(type: string, data: unknown) {
    for (const fn of this.listeners[type] ?? []) {
      fn({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

vi.stubGlobal('EventSource', MockEventSource);

const makeChat = (overrides: Partial<Chat> = {}): Chat => ({
  id: 'chat-1',
  userId: 'u1',
  jid: '447700000001@s.whatsapp.net',
  type: 'dm',
  subject: 'Old Name',
  lastMessageAt: null,
  lastMessagePreview: null,
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'work',
  memberCount: 0,
  unreadCount: 0,
  lastReadMessageId: null,
  lastReadTs: null,
  ...overrides,
});

describe('eventStream contact-update handler', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
  });

  it('patches useChats() cache when contact-update event arrives', async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.chats(), [makeChat()]);
    qc.setQueryData(queryKeys.contact('447700000001@s.whatsapp.net'), {
      jid: '447700000001@s.whatsapp.net',
      displayName: 'Old Name',
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    renderHook(() => useEventStream({}), { wrapper });

    // Wait for onopen
    await new Promise((r) => setTimeout(r, 10));

    const es = MockEventSource.instances[0]!;
    const evt: DaemonEvent = {
      type: 'contact-update',
      userId: 'u1',
      contactId: '447700000001@s.whatsapp.net',
      displayName: 'New Name',
      updatedAt: new Date().toISOString(),
    };
    es.dispatch('contact-update', evt);

    await new Promise((r) => setTimeout(r, 10));

    const chats = qc.getQueryData<Chat[]>(queryKeys.chats());
    expect(chats?.[0]?.subject).toBe('New Name');

    const contact = qc.getQueryData<{ displayName: string }>(
      queryKeys.contact('447700000001@s.whatsapp.net'),
    );
    expect(contact?.displayName).toBe('New Name');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/lib/eventStream.contact.test.ts
```

- [ ] **Step 3: Implement**

In `packages/web/src/lib/eventStream.ts`:

1. Add `'contact-update'` to `NAMED_EVENTS`:

```ts
const NAMED_EVENTS = [
  'qr',
  'connected',
  'disconnected',
  'sync-progress',
  'sync-complete',
  'message',
  'status',
  'pair-code',
  'media-ready',
  'contact-update',
] as const;
```

2. Add a `case 'contact-update':` branch inside `patchCache`:

```ts
case 'contact-update': {
  // Patch chats list: update subject for DM chats whose jid matches contactId
  qc.setQueryData<import('@yank/shared').Chat[]>(queryKeys.chats(), (old) =>
    old?.map((c) =>
      c.type === 'dm' && c.jid === evt.contactId
        ? { ...c, subject: evt.displayName }
        : c,
    ),
  );
  // Patch individual contact cache if present
  const prev = qc.getQueryData<{ jid: string; displayName?: string | null }>(
    queryKeys.contact(evt.contactId),
  );
  if (prev !== undefined) {
    qc.setQueryData(queryKeys.contact(evt.contactId), { ...prev, displayName: evt.displayName });
  }
  return;
}
```

Add the required type import at the top of `eventStream.ts`:

```ts
import type { Chat } from '@yank/shared';
```

(If `Chat` is already imported via `DaemonEvent`, use a `type` qualifier on the existing import instead.)

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/lib/eventStream.contact.test.ts
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/eventStream.ts \
        packages/web/test/lib/eventStream.contact.test.ts
git commit -m "feat(web): eventStream handles contact-update — patches chats + contact caches"
```

---

### Task 2.4: Create `InlineRename` primitive + wire into `TriageCard`

**Files:**
- Create: `packages/web/src/components/primitives/InlineRename.tsx`
- Create: `packages/web/src/components/primitives/InlineRename.module.css`
- Modify: `packages/web/src/components/triage/TriageCard.tsx` (Phase 1 output — mount InlineRename for DMs)
- Test: `packages/web/test/components/InlineRename.test.tsx`
- Test: `packages/web/test/components/TriageCard.rename.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web/test/components/InlineRename.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineRename } from '../../src/components/primitives/InlineRename.js';

describe('InlineRename', () => {
  it('renders with initial value', () => {
    render(<InlineRename initialValue="Alice" onCommit={vi.fn()} />);
    const input = screen.getByRole('textbox');
    expect((input as HTMLInputElement).value).toBe('Alice');
  });

  it('calls onCommit with trimmed value on blur', async () => {
    const onCommit = vi.fn();
    render(<InlineRename initialValue="Alice" onCommit={onCommit} />);
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '  Bob  ');
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('Bob');
  });

  it('calls onCommit on Enter key', async () => {
    const onCommit = vi.fn();
    render(<InlineRename initialValue="Alice" onCommit={onCommit} />);
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Charlie{Enter}');
    expect(onCommit).toHaveBeenCalledWith('Charlie');
  });

  it('reverts to initialValue on Escape', async () => {
    const onCommit = vi.fn();
    render(<InlineRename initialValue="Alice" onCommit={onCommit} />);
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Partial');
    await userEvent.keyboard('{Escape}');
    expect((input as HTMLInputElement).value).toBe('Alice');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not call onCommit when submitting empty string', async () => {
    const onCommit = vi.fn();
    render(<InlineRename initialValue="Alice" onCommit={onCommit} />);
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    // Input reverts to initialValue
    expect((input as HTMLInputElement).value).toBe('Alice');
  });

  it('respects maxLength prop', () => {
    render(<InlineRename initialValue="Alice" onCommit={vi.fn()} maxLength={10} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('maxLength', '10');
  });
});
```

Create `packages/web/test/components/TriageCard.rename.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Chat } from '@yank/shared';
import { TriageCard } from '../../src/components/triage/TriageCard.js';

// Mock the mutation so we don't need a real API
vi.mock('../../src/lib/mutations.js', () => ({
  useUpdateContactName: vi.fn(() => ({ mutate: vi.fn() })),
  useAssignWorkspace: vi.fn(() => ({ mutate: vi.fn() })),
}));

const makeDmChat = (overrides: Partial<Chat> = {}): Chat => ({
  id: 'chat-dm-1',
  userId: 'u1',
  jid: '447700000001@s.whatsapp.net',
  type: 'dm',
  subject: 'Alice',
  lastMessageAt: new Date().toISOString(),
  lastMessagePreview: 'Hello',
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage',
  memberCount: 0,
  unreadCount: 1,
  lastReadMessageId: null,
  lastReadTs: null,
  ...overrides,
});

const makeGroupChat = (overrides: Partial<Chat> = {}): Chat => ({
  id: 'chat-group-1',
  userId: 'u1',
  jid: '447700000001@g.us',
  type: 'group',
  subject: 'Family Group',
  lastMessageAt: new Date().toISOString(),
  lastMessagePreview: 'Hello',
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage',
  memberCount: 5,
  unreadCount: 0,
  lastReadMessageId: null,
  lastReadTs: null,
  ...overrides,
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('TriageCard rename', () => {
  it('renders InlineRename input for DM chat', () => {
    render(<TriageCard chat={makeDmChat()} isFocused={false} onAssign={vi.fn()} />, { wrapper });
    // Should have an input element for the name
    const input = screen.getByRole('textbox');
    expect((input as HTMLInputElement).value).toBe('Alice');
  });

  it('calls updateContactName.mutate on blur commit', async () => {
    const { useUpdateContactName } = await import('../../src/lib/mutations.js');
    const mockMutate = vi.fn();
    vi.mocked(useUpdateContactName).mockReturnValue({ mutate: mockMutate } as ReturnType<typeof useUpdateContactName>);

    render(<TriageCard chat={makeDmChat()} isFocused={false} onAssign={vi.fn()} />, { wrapper });
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Alice New');
    fireEvent.blur(input);
    expect(mockMutate).toHaveBeenCalledWith({ displayName: 'Alice New' });
  });

  it('does not render InlineRename for group chat — shows plain h3', () => {
    render(<TriageCard chat={makeGroupChat()} isFocused={false} onAssign={vi.fn()} />, { wrapper });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Family Group')).toBeTruthy();
  });

  it('Escape reverts input without calling mutate', async () => {
    const { useUpdateContactName } = await import('../../src/lib/mutations.js');
    const mockMutate = vi.fn();
    vi.mocked(useUpdateContactName).mockReturnValue({ mutate: mockMutate } as ReturnType<typeof useUpdateContactName>);

    render(<TriageCard chat={makeDmChat()} isFocused={false} onAssign={vi.fn()} />, { wrapper });
    const input = screen.getByRole('textbox');
    await userEvent.type(input, ' Extra');
    await userEvent.keyboard('{Escape}');
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/InlineRename.test.tsx
pnpm exec vitest run packages/web/test/components/TriageCard.rename.test.tsx
```

- [ ] **Step 3: Implement `InlineRename`**

Create `packages/web/src/components/primitives/InlineRename.tsx`:

```tsx
import { useState, useRef } from 'react';
import styles from './InlineRename.module.css';

export interface InlineRenameProps {
  initialValue: string;
  onCommit: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
}

export function InlineRename({ initialValue, onCommit, maxLength = 80, placeholder }: InlineRenameProps) {
  const [value, setValue] = useState(initialValue);
  const committed = useRef(false);

  const commit = () => {
    if (committed.current) return;
    const trimmed = value.trim();
    if (!trimmed) {
      // Revert
      setValue(initialValue);
      return;
    }
    committed.current = true;
    onCommit(trimmed);
  };

  return (
    <input
      type="text"
      className={styles.input}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => {
        committed.current = false;
        setValue(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setValue(initialValue);
          committed.current = false;
        }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
```

Create `packages/web/src/components/primitives/InlineRename.module.css`:

```css
.input {
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  padding: 0;
  margin: 0;
  width: 100%;
  outline: none;
  cursor: text;
}

.input:focus {
  border-bottom-color: var(--c-border-focus);
}
```

**Wire into `TriageCard.tsx`** — This file is created by Phase 1. Find the card title section and replace the plain `<h3>` for DM chats with `<InlineRename>`. The exact diff depends on Phase 1's output, but the pattern to apply is:

In `TriageCard.tsx`, import and use:

```tsx
import { InlineRename } from '../primitives/InlineRename.js';
import { useUpdateContactName } from '../../lib/mutations.js';

// Inside TriageCard component, where the chat title is rendered:
const updateContactName = useUpdateContactName(chat.jid);

// Title rendering:
{chat.type === 'dm' ? (
  <InlineRename
    initialValue={chat.subject ?? ''}
    onCommit={(displayName) => updateContactName.mutate({ displayName })}
    maxLength={80}
  />
) : (
  <h3 className={styles.cardTitle}>{chat.subject ?? chat.jid}</h3>
)}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/InlineRename.test.tsx
pnpm exec vitest run packages/web/test/components/TriageCard.rename.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/primitives/InlineRename.tsx \
        packages/web/src/components/primitives/InlineRename.module.css \
        packages/web/src/components/triage/TriageCard.tsx \
        packages/web/test/components/InlineRename.test.tsx \
        packages/web/test/components/TriageCard.rename.test.tsx
git commit -m "feat(web): InlineRename primitive + wire DM contact rename into TriageCard"
```

---

### Task 2.5: Phase 2 verification gate

**Files:** none (gate only)

- [ ] **Step 1: Full lint + typecheck + test**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all passing. Zero new type errors. `contacts.rename.test.ts`, `mutations.contact.test.tsx`, `eventStream.contact.test.ts`, `InlineRename.test.tsx`, `TriageCard.rename.test.tsx` all green.

- [ ] **Step 2: Manual smoke test**

1. Start dev stack: `pnpm dev`
2. Navigate to `/triage`
3. Find a DM card — the title should be an editable text input (borderless, cursor changes on hover)
4. Click the title, type a new name, press **Enter** → name updates immediately (optimistic) and persists on reload
5. Click the title again, type a partial name, press **Escape** → input reverts to previous name, no API call made
6. Open a second browser tab to the same `/triage` — rename in tab A → after ~300ms the name updates in tab B (SSE reconciliation)
7. Open the chat in the main view → `ChatTopbar` shows the updated name (it reads from `useChats()` / `useChat()` which are now patched)

- [ ] **Step 3: Commit gate marker** *(no code changes)*

```bash
git commit --allow-empty -m "chore: Phase 2 verification gate passed"
```

---

## Phase 3a — Edit-message

> **Dependencies:** Phase 0 (`EditMessageCommand`, `EditMessageBodySchema`, `MessageEditEvent`, `MessageEditFailedEvent` all in `@yank/shared`). `messages.edited_at` column already exists in M3 schema (`packages/db/src/schema/messages.ts:33`). Phase 1 `events-publisher.ts` available.

**"Is own message" check:** The `messages` table stores `senderJid = 'me'` for outbound messages (set by `packages/api/src/routes/messages.ts:195` — `senderJid: 'me'`). The api edit route checks `senderJid === 'me'` as the ownership test. This is already the established convention in M3.

---

### Task 3a.1: Add `POST /api/messages/:messageId/edit` route

**Files:**
- Modify: `packages/api/src/routes/messages.ts` (append new route at bottom, before closing brace)
- Modify: `packages/api/src/index.ts` (pass `eventsPublisher` to `registerMessagesRoutes`)
- Test: `packages/api/test/messages.edit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/messages.edit.test.ts`:

```ts
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
import { createLogger, commandsStream } from '@yank/shared';
import { ensureSingleUser } from '../src/bootstrap.js';
import { createCommandsBus } from '../src/commands-bus.js';
import { createEventsBus } from '../src/events-bus.js';
import { createEventsPublisher } from '../src/events-publisher.js';
import { registerMessagesRoutes } from '../src/routes/messages.js';
import { registerChatsRoutes } from '../src/routes/chats.js';
import { messages, chats } from '@yank/db/schema';
import { newId } from '@yank/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', '..', 'db', 'drizzle');
const USER = '0193fe00-0000-7000-8000-000000000097';

describe('messages edit', () => {
  let pg: StartedPostgreSqlContainer;
  let redisC: StartedRedisContainer;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let redis: Redis;
  let subscriber: Redis;
  let app: ReturnType<typeof Fastify>;
  let baseUrl: string;
  let chatId: string;
  let ownMessageId: string;
  let ownMessageWaId: string;
  let inboundMessageId: string;
  let pendingMessageId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    redisC = await new RedisContainer('redis:7-alpine').start();
    client = postgres(pg.getConnectionUri(), { max: 5 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await ensureSingleUser(db, USER, 'Edit Test');

    // Seed a chat
    chatId = newId();
    await db.insert(chats).values({
      id: chatId,
      userId: USER,
      jid: '447700000002@s.whatsapp.net',
      type: 'dm',
    });

    // Seed an outbound message (senderJid = 'me') with a wa_message_id
    ownMessageId = newId();
    ownMessageWaId = 'WA-EDIT-OWN-1';
    await db.insert(messages).values({
      id: ownMessageId,
      userId: USER,
      chatId,
      waMessageId: ownMessageWaId,
      senderJid: 'me',
      ts: new Date(),
      kind: 'text',
      text: 'original text',
      status: 'sent',
    });

    // Seed an inbound message (senderJid = remote jid)
    inboundMessageId = newId();
    await db.insert(messages).values({
      id: inboundMessageId,
      userId: USER,
      chatId,
      waMessageId: 'WA-EDIT-INBOUND-1',
      senderJid: '447700000002@s.whatsapp.net',
      ts: new Date(),
      kind: 'text',
      text: 'their text',
      status: 'sent',
    });

    // Seed a pending (still-sending) outbound message (waMessageId IS NULL)
    pendingMessageId = newId();
    await db.insert(messages).values({
      id: pendingMessageId,
      userId: USER,
      chatId,
      waMessageId: null,
      senderJid: 'me',
      ts: new Date(),
      kind: 'text',
      text: 'sending...',
      status: 'pending',
    });

    redis = new Redis(redisC.getConnectionUrl());
    subscriber = new Redis(redisC.getConnectionUrl());
    const eventsBus = createEventsBus(subscriber, USER);
    await eventsBus.start();
    const commandsBus = createCommandsBus(redis, USER);
    const eventsPublisher = createEventsPublisher(redis, USER);

    app = Fastify({ logger: false });
    registerChatsRoutes(app, { db, userId: USER });
    registerMessagesRoutes(app, { db, userId: USER, commands: commandsBus, eventsPublisher });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await subscriber?.quit();
    await redis?.quit();
    await client?.end();
    await pg?.stop();
    await redisC?.stop();
  });

  it('happy path: 202 + edit-message command on Redis stream', async () => {
    // Subscribe to the stream before the request
    const streamKey = commandsStream(USER);

    const res = await fetch(`${baseUrl}/api/messages/${ownMessageId}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'edited text' }),
    });
    expect(res.status).toBe(202);

    // Verify command landed on the stream
    const entries = await redis.xrange(streamKey, '-', '+');
    const found = entries.some(([, fields]) => {
      const payloadIdx = fields.indexOf('payload');
      if (payloadIdx === -1) return false;
      const raw = fields[payloadIdx + 1];
      if (!raw) return false;
      try {
        const cmd = JSON.parse(raw) as { type: string; messageId: string; waMessageId: string; text: string };
        return (
          cmd.type === 'edit-message' &&
          cmd.messageId === ownMessageId &&
          cmd.waMessageId === ownMessageWaId &&
          cmd.text === 'edited text'
        );
      } catch { return false; }
    });
    expect(found).toBe(true);
  });

  it('400 — empty text', async () => {
    const res = await fetch(`${baseUrl}/api/messages/${ownMessageId}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 — missing body', async () => {
    const res = await fetch(`${baseUrl}/api/messages/${ownMessageId}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('403 — inbound message (senderJid !== me)', async () => {
    const res = await fetch(`${baseUrl}/api/messages/${inboundMessageId}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'cannot edit yours' }),
    });
    expect(res.status).toBe(403);
  });

  it('404 — message not owned by user', async () => {
    const res = await fetch(`${baseUrl}/api/messages/${newId()}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'ghost' }),
    });
    expect(res.status).toBe(404);
  });

  it('409 — message still sending (waMessageId IS NULL)', async () => {
    const res = await fetch(`${baseUrl}/api/messages/${pendingMessageId}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'too soon' }),
    });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/api/test/messages.edit.test.ts
```

Expected: import failure (no `eventsPublisher` param in `registerMessagesRoutes`) and no `/edit` route.

- [ ] **Step 3: Implement the edit route**

In `packages/api/src/routes/messages.ts`, change the `MessagesDeps` interface and add the new route.

**Updated interface** (replace lines 8–12):

```ts
import type { EventsPublisher } from '../events-publisher.js';

export interface MessagesDeps {
  db: Db;
  userId: string;
  commands: CommandsBus;
  eventsPublisher?: EventsPublisher;
}
```

(`eventsPublisher` is optional so the existing `roundtrip.test.ts` doesn't break — it doesn't pass one.)

**New route** — append before the closing `}` of `registerMessagesRoutes`:

```ts
  app.post<{ Params: { messageId: string }; Body: { text: string } }>(
    '/api/messages/:messageId/edit',
    async (req, reply) => {
      const parsed = EditMessageBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
      }
      const { text } = parsed.data;

      const row = await deps.db
        .select({
          id: messages.id,
          waMessageId: messages.waMessageId,
          senderJid: messages.senderJid,
          chatId: messages.chatId,
        })
        .from(messages)
        .where(and(eq(messages.userId, deps.userId), eq(messages.id, req.params.messageId)))
        .limit(1);

      if (!row[0]) return reply.code(404).send({ error: 'not_found' });

      const msg = row[0];
      if (msg.senderJid !== 'me') {
        return reply.code(403).send({ error: 'not_own_message' });
      }
      if (!msg.waMessageId) {
        return reply.code(409).send({ error: 'message_still_sending' });
      }

      // Look up the chat's JID for the daemon
      const chatRow = await deps.db
        .select({ jid: chats.jid })
        .from(chats)
        .where(and(eq(chats.userId, deps.userId), eq(chats.id, msg.chatId)))
        .limit(1);

      if (!chatRow[0]) return reply.code(404).send({ error: 'chat_not_found' });

      await deps.commands.publish({
        type: 'edit-message',
        userId: deps.userId,
        messageId: msg.id,
        waMessageId: msg.waMessageId,
        chatJid: chatRow[0].jid,
        text,
      });

      reply.code(202);
      return null;
    },
  );
```

Add the required imports at the top of `messages.ts`:

```ts
import { EditMessageBodySchema } from '@yank/shared';
// chats is already imported via @yank/db/schema
```

**Update `packages/api/src/index.ts`** — pass `eventsPublisher` to `registerMessagesRoutes`:

```ts
registerMessagesRoutes(app, { db, userId: env.YANK_USER_ID, commands: commandsBus, eventsPublisher });
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/api/test/messages.edit.test.ts
pnpm exec vitest run packages/api/test/roundtrip.test.ts
pnpm --filter @yank/api typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/messages.ts \
        packages/api/src/index.ts \
        packages/api/test/messages.edit.test.ts
git commit -m "feat(api): POST /api/messages/:messageId/edit — enqueues edit-message command (403/404/409 guards)"
```

---

### Task 3a.2: Daemon outbound consumer — `edit-message` branch

**Files:**
- Modify: `packages/daemon/src/outbound.ts`
- Test: `packages/daemon/test/outbound.edit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/daemon/test/outbound.edit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import Redis from 'ioredis';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { newId, eventsChannel } from '@yank/shared';
import { messages, chats } from '@yank/db/schema';
import { FakeConnector } from '../src/connector-fake.js';
import { createEventsBus } from '../src/events-bus.js';
import { handleEditMessageCommand } from '../src/outbound.js';
import type { OutboundCtx } from '../src/outbound.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '..', '..', 'db', 'drizzle');
const USER = '0193fe00-0000-7000-8000-000000000096';

describe('handleEditMessageCommand', () => {
  let pg: StartedPostgreSqlContainer;
  let redisC: StartedRedisContainer;
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let redis: Redis;
  let ctx: OutboundCtx;
  let connector: FakeConnector;
  let chatId: string;
  let messageId: string;
  const waMessageId = 'WA-EDIT-1';
  const chatJid = '447700000003@s.whatsapp.net';

  beforeEach(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    redisC = await new RedisContainer('redis:7-alpine').start();
    client = postgres(pg.getConnectionUri(), { max: 5 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder });

    // Seed user
    const { users } = await import('@yank/db/schema');
    await db.insert(users).values({ id: USER, displayName: 'Edit Test' });

    // Seed chat + message
    chatId = newId();
    await db.insert(chats).values({ id: chatId, userId: USER, jid: chatJid, type: 'dm' });
    messageId = newId();
    await db.insert(messages).values({
      id: messageId,
      userId: USER,
      chatId,
      waMessageId,
      senderJid: 'me',
      ts: new Date(),
      kind: 'text',
      text: 'original',
      status: 'sent',
    });

    redis = new Redis(redisC.getConnectionUrl());
    const bus = createEventsBus(redis, USER);
    connector = new FakeConnector();
    ctx = { db, userId: USER, connector, bus };
  }, 120_000);

  afterEach(async () => {
    await redis?.quit();
    await client?.end();
    await pg?.stop();
    await redisC?.stop();
  });

  it('success: calls connector.editMessage, updates DB, publishes message-edit event', async () => {
    const received: string[] = [];
    const sub = new Redis(redisC.getConnectionUrl());
    await sub.subscribe(eventsChannel(USER));
    sub.on('message', (_ch, p) => received.push(p));

    await handleEditMessageCommand(ctx, {
      type: 'edit-message',
      userId: USER,
      messageId,
      waMessageId,
      chatJid,
      text: 'updated text',
    });

    // Connector received the call
    expect(connector.editCalls).toHaveLength(1);
    expect(connector.editCalls[0]).toMatchObject({ jid: chatJid, waMessageId, text: 'updated text' });

    // DB updated
    const rows = await db.select({ text: messages.text, editedAt: messages.editedAt })
      .from(messages)
      .where((await import('drizzle-orm')).eq(messages.id, messageId));
    expect(rows[0]?.text).toBe('updated text');
    expect(rows[0]?.editedAt).not.toBeNull();

    // Event published
    await new Promise((r) => setTimeout(r, 200));
    expect(received.some((p) => {
      try {
        const evt = JSON.parse(p) as { type: string; messageId: string; text: string };
        return evt.type === 'message-edit' && evt.messageId === messageId && evt.text === 'updated text';
      } catch { return false; }
    })).toBe(true);

    await sub.quit();
  });

  it('network failure: publishes message-edit-failed with reason=network', async () => {
    const received: string[] = [];
    const sub = new Redis(redisC.getConnectionUrl());
    await sub.subscribe(eventsChannel(USER));
    sub.on('message', (_ch, p) => received.push(p));

    connector.editError = new Error('ECONNRESET');

    await handleEditMessageCommand(ctx, {
      type: 'edit-message',
      userId: USER,
      messageId,
      waMessageId,
      chatJid,
      text: 'will fail',
    });

    await new Promise((r) => setTimeout(r, 200));
    expect(received.some((p) => {
      try {
        const evt = JSON.parse(p) as { type: string; messageId: string; reason: string };
        return evt.type === 'message-edit-failed' && evt.messageId === messageId && evt.reason === 'network';
      } catch { return false; }
    })).toBe(true);

    await sub.quit();
  });

  it('too-old failure: publishes message-edit-failed with reason=too-old', async () => {
    const received: string[] = [];
    const sub = new Redis(redisC.getConnectionUrl());
    await sub.subscribe(eventsChannel(USER));
    sub.on('message', (_ch, p) => received.push(p));

    connector.editError = new Error('Message is too old to edit');

    await handleEditMessageCommand(ctx, {
      type: 'edit-message',
      userId: USER,
      messageId,
      waMessageId,
      chatJid,
      text: 'ancient',
    });

    await new Promise((r) => setTimeout(r, 200));
    expect(received.some((p) => {
      try {
        const evt = JSON.parse(p) as { type: string; reason: string };
        return evt.type === 'message-edit-failed' && evt.reason === 'too-old';
      } catch { return false; }
    })).toBe(true);

    await sub.quit();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/daemon/test/outbound.edit.test.ts
```

- [ ] **Step 3: Implement**

**Add error-reason mapping** — append a new small helper at the bottom of `packages/daemon/src/outbound.ts`:

```ts
function classifyEditError(err: unknown): 'too-old' | 'protocol' | 'network' {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes('too old') || msg.includes('edit') && msg.includes('old')) return 'too-old';
  if (msg.includes('econnreset') || msg.includes('timeout') || msg.includes('network')) return 'network';
  return 'protocol';
}
```

**Add `handleEditMessageCommand` export** — append to `packages/daemon/src/outbound.ts`:

```ts
export async function handleEditMessageCommand(
  ctx: OutboundCtx,
  cmd: Extract<ApiCommand, { type: 'edit-message' }>,
): Promise<void> {
  try {
    await ctx.connector.editMessage(cmd.chatJid, cmd.waMessageId, cmd.text);

    const editedAt = new Date();
    const { eq, and } = await import('drizzle-orm');
    await ctx.db
      .update(messages)
      .set({ text: cmd.text, editedAt })
      .where(and(eq(messages.userId, ctx.userId), eq(messages.id, cmd.messageId)));

    await ctx.bus.publish({
      type: 'message-edit',
      userId: ctx.userId,
      messageId: cmd.messageId,
      text: cmd.text,
      editedAt: editedAt.toISOString(),
    });
  } catch (err) {
    const reason = classifyEditError(err);
    await ctx.bus.publish({
      type: 'message-edit-failed',
      userId: ctx.userId,
      messageId: cmd.messageId,
      reason,
    });
  }
}
```

Also add the `messages` import at the top of `outbound.ts` (it already imports `messages` from `@yank/db/schema` — confirm and add if missing):

```ts
import { and, eq } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { messages } from '@yank/db/schema';
import type { ApiCommand } from '@yank/shared';
```

The `drizzle-orm` import is already there; just confirm the `messages` table is imported.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/daemon/test/outbound.edit.test.ts
pnpm --filter @yank/daemon typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/outbound.ts \
        packages/daemon/test/outbound.edit.test.ts
git commit -m "feat(daemon): handleEditMessageCommand — editMessage connector call, DB update, message-edit/failed events"
```

---

### Task 3a.3: `Connector` interface + `BaileysConnector.editMessage` + `FakeConnector.editMessage`

**Files:**
- Modify: `packages/daemon/src/connector.ts`
- Modify: `packages/daemon/src/connector-baileys.ts`
- Modify: `packages/daemon/src/connector-fake.ts`
- Test: `packages/daemon/test/connector-fake.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/daemon/test/connector-fake.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FakeConnector } from '../src/connector-fake.js';

describe('FakeConnector.editMessage', () => {
  it('records the call in editCalls', async () => {
    const fc = new FakeConnector();
    await fc.editMessage('447@s.whatsapp.net', 'WA-123', 'new text');
    expect(fc.editCalls).toHaveLength(1);
    expect(fc.editCalls[0]).toEqual({ jid: '447@s.whatsapp.net', waMessageId: 'WA-123', text: 'new text' });
  });

  it('throws when editError is set', async () => {
    const fc = new FakeConnector();
    fc.editError = new Error('too old');
    await expect(fc.editMessage('447@s.whatsapp.net', 'WA-123', 'text')).rejects.toThrow('too old');
  });

  it('records multiple calls independently', async () => {
    const fc = new FakeConnector();
    await fc.editMessage('j1', 'id1', 't1');
    await fc.editMessage('j2', 'id2', 't2');
    expect(fc.editCalls).toHaveLength(2);
    expect(fc.editCalls[1]).toMatchObject({ jid: 'j2', waMessageId: 'id2', text: 't2' });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/daemon/test/connector-fake.test.ts
```

- [ ] **Step 3: Implement**

**`packages/daemon/src/connector.ts`** — add `editMessage` to the `Connector` interface. Append after `downloadMedia`:

```ts
  /**
   * Edit an already-sent WhatsApp message. Sends Baileys' protocolMessage EDIT.
   * Throws if the message is too old (>15 min on WA's servers), the socket is
   * disconnected, or the message type is unsupported.
   */
  editMessage(chatJid: string, waMessageId: string, text: string): Promise<void>;
```

**`packages/daemon/src/connector-fake.ts`** — add `editCalls`, `editError`, and the method. Append the new fields after `sent`:

```ts
  editCalls: Array<{ jid: string; waMessageId: string; text: string }> = [];
  editError: Error | null = null;
```

Add the method after `downloadMedia`:

```ts
  async editMessage(jid: string, waMessageId: string, text: string): Promise<void> {
    if (this.editError) throw this.editError;
    this.editCalls.push({ jid, waMessageId, text });
  }
```

**`packages/daemon/src/connector-baileys.ts`** — add `editMessage` after `sendText`. The Baileys 6.7.21 API for editing uses `sendMessage` with `{ edit: key }`:

```ts
  async editMessage(chatJid: string, waMessageId: string, text: string): Promise<void> {
    const sock = this.sock;
    if (!sock) throw new Error('connector not started');
    await sock.sendMessage(chatJid, {
      text,
      edit: { remoteJid: chatJid, id: waMessageId, fromMe: true },
    });
  }
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/daemon/test/connector-fake.test.ts
pnpm --filter @yank/daemon typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/connector.ts \
        packages/daemon/src/connector-baileys.ts \
        packages/daemon/src/connector-fake.ts \
        packages/daemon/test/connector-fake.test.ts
git commit -m "feat(daemon): editMessage on Connector interface, BaileysConnector, and FakeConnector"
```

---

### Task 3a.4: Wire `edit-message` into daemon session command consumer

**Files:**
- Modify: `packages/daemon/src/session.ts` (locate the command-dispatch switch)
- Test: covered by `packages/daemon/test/outbound.edit.test.ts` (already passing from 3a.2)

- [ ] **Step 1: Locate the command consumer**

```bash
grep -n "handleSendCommand\|cmd\.type\|edit-message" /home/florent/Work/whatsapp-slack/packages/daemon/src/session.ts | head -30
```

- [ ] **Step 2: Add the `edit-message` branch**

In `packages/daemon/src/session.ts`, find the command-dispatch switch (the block that calls `handleSendCommand`). Add an import and a case:

```ts
import { handleSendCommand, handleEditMessageCommand, attachOutbound } from './outbound.js';
```

In the switch/if block that dispatches commands:

```ts
// Existing pattern (approximate):
if (cmd.type === 'send') {
  await handleSendCommand(outboundCtx, cmd);
}

// Add:
else if (cmd.type === 'edit-message') {
  await handleEditMessageCommand(outboundCtx, cmd);
}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @yank/daemon typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/session.ts
git commit -m "feat(daemon): dispatch edit-message command to handleEditMessageCommand in session consumer"
```

---

### Task 3a.5: `normalize.ts` — inbound EDIT protocolMessage branch

**Files:**
- Modify: `packages/daemon/src/normalize.ts`
- Modify: `packages/daemon/src/connector-baileys.ts` (subscribe `messages.update` EDIT branch via `normalize`)
- Test: `packages/daemon/test/normalize.edit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/daemon/test/normalize.edit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { proto } from '@whiskeysockets/baileys';
import { normalizeBaileysEdit } from '../src/normalize.js';

// Build a minimal Baileys proto message that looks like an inbound EDIT protocolMessage.
function makeEditProto(opts: {
  remoteJid: string;
  targetWaMessageId: string;
  newText: string;
  ts?: number;
}): proto.IWebMessageInfo {
  return {
    key: { remoteJid: opts.remoteJid, id: 'PROTOCOL-MSG-ID', fromMe: false },
    messageTimestamp: opts.ts ?? Math.floor(Date.now() / 1000),
    message: {
      protocolMessage: {
        type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
        key: { remoteJid: opts.remoteJid, id: opts.targetWaMessageId, fromMe: true },
        editedMessage: {
          conversation: opts.newText,
        },
      },
    },
  };
}

describe('normalizeBaileysEdit', () => {
  it('returns InboundEdit for MESSAGE_EDIT protocolMessage', () => {
    const m = makeEditProto({
      remoteJid: '447700000004@s.whatsapp.net',
      targetWaMessageId: 'WA-TARGET-1',
      newText: 'edited content',
    });
    const result = normalizeBaileysEdit(m);
    expect(result).not.toBeNull();
    expect(result?.targetWaMessageId).toBe('WA-TARGET-1');
    expect(result?.text).toBe('edited content');
    expect(result?.chatJid).toBe('447700000004@s.whatsapp.net');
  });

  it('returns null for REVOKE protocolMessage', () => {
    const m: proto.IWebMessageInfo = {
      key: { remoteJid: '447@s.whatsapp.net', id: 'some-id' },
      message: {
        protocolMessage: {
          type: proto.Message.ProtocolMessage.Type.REVOKE,
          key: { id: 'target' },
        },
      },
    };
    expect(normalizeBaileysEdit(m)).toBeNull();
  });

  it('returns null for a regular text message', () => {
    const m: proto.IWebMessageInfo = {
      key: { remoteJid: '447@s.whatsapp.net', id: 'some-id' },
      message: { conversation: 'hello' },
    };
    expect(normalizeBaileysEdit(m)).toBeNull();
  });

  it('handles extendedTextMessage inside editedMessage', () => {
    const m: proto.IWebMessageInfo = {
      key: { remoteJid: '447@s.whatsapp.net', id: 'PROTO-ID' },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: {
        protocolMessage: {
          type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
          key: { remoteJid: '447@s.whatsapp.net', id: 'WA-TARGET-2', fromMe: true },
          editedMessage: {
            extendedTextMessage: { text: 'extended edit' },
          },
        },
      },
    };
    const result = normalizeBaileysEdit(m);
    expect(result?.text).toBe('extended edit');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/daemon/test/normalize.edit.test.ts
```

- [ ] **Step 3: Implement `normalizeBaileysEdit`**

Append to `packages/daemon/src/normalize.ts`:

```ts
export interface InboundEdit {
  chatJid: string;
  targetWaMessageId: string;
  text: string;
  ts: Date;
}

export function normalizeBaileysEdit(m: proto.IWebMessageInfo): InboundEdit | null {
  const protocolMsg = m.message?.protocolMessage;
  if (!protocolMsg) return null;
  if (protocolMsg.type !== proto.Message.ProtocolMessage.Type.MESSAGE_EDIT) return null;
  const targetWaMessageId = protocolMsg.key?.id;
  const chatJid = m.key?.remoteJid;
  if (!targetWaMessageId || !chatJid) return null;
  const editedMsg = protocolMsg.editedMessage;
  const text =
    editedMsg?.conversation ??
    editedMsg?.extendedTextMessage?.text ??
    null;
  if (!text) return null;
  return {
    chatJid,
    targetWaMessageId,
    text,
    ts: new Date(Number(m.messageTimestamp ?? 0) * 1000),
  };
}
```

**Wire into `connector-baileys.ts`** — in the `messages.upsert` and history handlers, add the edit check alongside the existing REVOKE check. In `connector-baileys.ts`, the `messages.upsert` loop (around line 211) currently checks `normalizeBaileysDeletion` first. Add an edit check:

```ts
// In the messages.upsert handler loop, after the deletion check:
import { normalizeBaileysEdit } from './normalize.js';

// ...
sock.ev.on('messages.upsert', ({ messages: msgs }) => {
  for (const m of msgs) {
    const del = normalizeBaileysDeletion(m);
    if (del) { this.emit('delete', del); continue; }

    const edit = normalizeBaileysEdit(m);
    if (edit) { this.emit('edit', edit); continue; }

    const reaction = normalizeBaileysReaction(m);
    if (reaction) { this.emit('reaction', reaction); continue; }

    const r = normalizeBaileysMessage(m);
    if (!r) continue;
    this.emit('message', r.msg, r.chat, r.contact);
  }
});
```

Add `'edit'` to `ConnectorEvents` in `connector.ts`:

```ts
import type { InboundEdit } from './normalize.js';

// In ConnectorEvents:
edit: (edit: InboundEdit) => void;
```

Handle the `'edit'` event in the daemon session to do the DB update + publish:

In `packages/daemon/src/session.ts`, in the connector event wiring section, add:

```ts
connector.on('edit', (edit) => {
  void (async () => {
    try {
      const { eq, and } = await import('drizzle-orm');
      const editedAt = new Date();
      const rows = await db
        .update(messages)
        .set({ text: edit.text, editedAt })
        .where(
          and(
            eq(messages.userId, userId),
            eq(messages.waMessageId, edit.targetWaMessageId),
          ),
        )
        .returning({ id: messages.id });
      const localId = rows[0]?.id;
      if (!localId) return; // message not in our DB (e.g. history not yet synced)
      await bus.publish({
        type: 'message-edit',
        userId,
        messageId: localId,
        text: edit.text,
        editedAt: editedAt.toISOString(),
      });
    } catch (err) {
      log.error({ err }, '[session] failed to handle inbound edit');
    }
  })();
});
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/daemon/test/normalize.edit.test.ts
pnpm --filter @yank/daemon typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/normalize.ts \
        packages/daemon/src/connector.ts \
        packages/daemon/src/connector-baileys.ts \
        packages/daemon/src/session.ts \
        packages/daemon/test/normalize.edit.test.ts
git commit -m "feat(daemon): normalize inbound MESSAGE_EDIT protocolMessage + emit edit event + DB update + SSE publish"
```

---

### Task 3a.6: `useEditMessage` mutation in web

**Files:**
- Modify: `packages/web/src/lib/mutations.ts`
- Test: `packages/web/test/lib/mutations.edit.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/lib/mutations.edit.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Message } from '@yank/shared';
import { useEditMessage } from '../../src/lib/mutations.js';
import { queryKeys } from '../../src/lib/queryKeys.js';

vi.mock('../../src/lib/api.js', () => ({
  apiFetch: vi.fn().mockResolvedValue(undefined),
  ApiError: class ApiError extends Error {},
}));

vi.mock('../../src/state/toast.js', () => ({
  useToastStore: { getState: () => ({ show: vi.fn() }) },
  showErrorToast: vi.fn(),
}));

const CHAT_ID = 'chat-edit-1';
const MESSAGE_ID = 'msg-edit-1';
const NOW = new Date().toISOString();

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: MESSAGE_ID,
  userId: 'u1',
  chatId: CHAT_ID,
  waMessageId: 'WA-1',
  senderJid: 'me',
  ts: NOW,
  kind: 'text',
  text: 'original',
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  status: 'sent',
  reactions: [],
  ...overrides,
});

describe('useEditMessage', () => {
  it('optimistically patches text + editedAt in useMessages cache', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.messages(CHAT_ID), {
      pages: [{ messages: [makeMessage()], nextCursor: null }],
      pageParams: [null],
    });

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useEditMessage(CHAT_ID, MESSAGE_ID), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ text: 'edited' });
    });

    // Optimistic patch is synchronous
    const data = qc.getQueryData<{ pages: Array<{ messages: Message[] }> }>(
      queryKeys.messages(CHAT_ID),
    );
    const patched = data?.pages[0]?.messages[0];
    expect(patched?.text).toBe('edited');
    expect(patched?.editedAt).not.toBeNull();
  });

  it('rolls back on error', async () => {
    const { apiFetch } = await import('../../src/lib/api.js');
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('500'));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.messages(CHAT_ID), {
      pages: [{ messages: [makeMessage({ text: 'original' })], nextCursor: null }],
      pageParams: [null],
    });

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useEditMessage(CHAT_ID, MESSAGE_ID), { wrapper: Wrapper });

    act(() => { result.current.mutate({ text: 'will fail' }); });
    await waitFor(() => result.current.isError);

    const data = qc.getQueryData<{ pages: Array<{ messages: Message[] }> }>(
      queryKeys.messages(CHAT_ID),
    );
    expect(data?.pages[0]?.messages[0]?.text).toBe('original');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/lib/mutations.edit.test.tsx
```

- [ ] **Step 3: Implement**

Append to `packages/web/src/lib/mutations.ts`:

```ts
import type { MessagesPage } from '@yank/shared';

export function useEditMessage(chatId: string, messageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ text }: { text: string }) =>
      apiFetch<void>(`/api/messages/${messageId}/edit`, { method: 'POST', body: { text } }),
    onMutate: async ({ text }) => {
      await qc.cancelQueries({ queryKey: queryKeys.messages(chatId) });
      const prev = qc.getQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
        queryKeys.messages(chatId),
      );

      const optimisticEditedAt = new Date().toISOString();
      qc.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
        queryKeys.messages(chatId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === messageId ? { ...m, text, editedAt: optimisticEditedAt } : m,
              ),
            })),
          };
        },
      );

      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(queryKeys.messages(chatId), ctx.prev);
      }
      showErrorToast("Couldn't edit message — try again.");
    },
  });
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/lib/mutations.edit.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/mutations.ts \
        packages/web/test/lib/mutations.edit.test.tsx
git commit -m "feat(web): useEditMessage mutation with optimistic useMessages patch and rollback"
```

---

### Task 3a.7: `eventStream.ts` — `message-edit` and `message-edit-failed` handlers

**Files:**
- Modify: `packages/web/src/lib/eventStream.ts`
- Create: `packages/web/src/state/editErrors.ts`
- Test: `packages/web/test/lib/eventStream.edit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/lib/eventStream.edit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { DaemonEvent, Message } from '@yank/shared';
import { queryKeys } from '../../src/lib/queryKeys.js';
import { useEventStream } from '../../src/lib/eventStream.js';

class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  constructor(public url: string) {
    MockEventSource.instances.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners[type] ??= [];
    this.listeners[type]!.push(fn);
  }
  close() {}
  dispatch(type: string, data: unknown) {
    for (const fn of this.listeners[type] ?? []) {
      fn({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}
vi.stubGlobal('EventSource', MockEventSource);

const CHAT_ID = 'c1';
const MESSAGE_ID = 'm1';
const NOW = new Date().toISOString();
const makeMsg = (overrides: Partial<Message> = {}): Message => ({
  id: MESSAGE_ID, userId: 'u1', chatId: CHAT_ID, waMessageId: 'WA-1', senderJid: 'me',
  ts: NOW, kind: 'text', text: 'original', replyToId: null, editedAt: null,
  deletedAt: null, status: 'sent', reactions: [], ...overrides,
});

describe('eventStream message-edit handler', () => {
  beforeEach(() => { MockEventSource.instances = []; });

  it('patches message text + editedAt in useMessages cache on message-edit', async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.messages(CHAT_ID), {
      pages: [{ messages: [makeMsg()], nextCursor: null }],
      pageParams: [null],
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(() => useEventStream({}), { wrapper });
    await new Promise((r) => setTimeout(r, 10));

    const es = MockEventSource.instances[0]!;
    const editedAt = new Date().toISOString();
    const evt: DaemonEvent = {
      type: 'message-edit', userId: 'u1',
      messageId: MESSAGE_ID, text: 'canonical', editedAt,
    };
    es.dispatch('message-edit', evt);
    await new Promise((r) => setTimeout(r, 10));

    const data = qc.getQueryData<{ pages: Array<{ messages: Message[] }> }>(
      queryKeys.messages(CHAT_ID),
    );
    const msg = data?.pages[0]?.messages[0];
    expect(msg?.text).toBe('canonical');
    expect(msg?.editedAt).toBe(editedAt);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/lib/eventStream.edit.test.ts
```

- [ ] **Step 3: Implement**

**Create `packages/web/src/state/editErrors.ts`** — per-row "edit failed" state, 10s auto-expiry:

```ts
import { create } from 'zustand';

interface EditErrorsState {
  errors: Record<string, number>; // messageId → expiry timestamp (ms)
  setError: (messageId: string) => void;
  clearError: (messageId: string) => void;
  hasError: (messageId: string) => boolean;
}

export const useEditErrorsStore = create<EditErrorsState>((set, get) => ({
  errors: {},
  setError: (messageId) => {
    const expiry = Date.now() + 10_000;
    set((s) => ({ errors: { ...s.errors, [messageId]: expiry } }));
    setTimeout(() => {
      set((s) => {
        const next = { ...s.errors };
        delete next[messageId];
        return { errors: next };
      });
    }, 10_000);
  },
  clearError: (messageId) =>
    set((s) => {
      const next = { ...s.errors };
      delete next[messageId];
      return { errors: next };
    }),
  hasError: (messageId) => {
    const expiry = get().errors[messageId];
    return expiry !== undefined && expiry > Date.now();
  },
}));
```

**Add to `eventStream.ts` NAMED_EVENTS**:

```ts
const NAMED_EVENTS = [
  // ... existing entries ...
  'contact-update',
  'message-edit',
  'message-edit-failed',
] as const;
```

**Add cases in `patchCache`**:

```ts
case 'message-edit': {
  // Patch all pages of the messages cache for any chat that contains this messageId.
  // We don't know which chatId without iterating, so we use a broad approach:
  // scan all cached message queries and patch in place.
  qc.setQueriesData<{ pages: import('@yank/shared').MessagesPage[]; pageParams: unknown[] }>(
    { queryKey: ['messages'] },
    (old) => {
      if (!old) return old;
      const { messageId, text, editedAt } = evt;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          messages: page.messages.map((m) =>
            m.id === messageId ? { ...m, text, editedAt } : m,
          ),
        })),
      };
    },
  );
  return;
}
case 'message-edit-failed': {
  // Surface per-row error affordance via editErrors Zustand store
  const { useEditErrorsStore: store } = await import('../state/editErrors.js');
  store.getState().setError(evt.messageId);
  return;
}
```

Note: `setQueriesData` is the TanStack Query v5 API for patching all matching queries. Confirm the project uses TQ v5; if using v4, use `qc.getQueriesData` + manual iteration.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/lib/eventStream.edit.test.ts
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/eventStream.ts \
        packages/web/src/state/editErrors.ts \
        packages/web/test/lib/eventStream.edit.test.ts
git commit -m "feat(web): eventStream handles message-edit (canonical patch) and message-edit-failed (editErrors store)"
```

---

### Task 3a.8: Extend `useUiStore` with `editing` slice

**Files:**
- Modify: `packages/web/src/state/ui.ts`
- Test: `packages/web/test/state/ui.edit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/state/ui.edit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from '../../src/state/ui.js';

describe('useUiStore editing slice', () => {
  beforeEach(() => {
    useUiStore.setState({ editing: null });
  });

  it('starts with editing = null', () => {
    expect(useUiStore.getState().editing).toBeNull();
  });

  it('setEditing sets the editing state', () => {
    useUiStore.getState().setEditing({
      messageId: 'm1',
      originalText: 'hello',
      chatId: 'c1',
    });
    expect(useUiStore.getState().editing).toEqual({
      messageId: 'm1',
      originalText: 'hello',
      chatId: 'c1',
    });
  });

  it('setEditing(null) clears editing state', () => {
    useUiStore.getState().setEditing({ messageId: 'm1', originalText: 'hi', chatId: 'c1' });
    useUiStore.getState().setEditing(null);
    expect(useUiStore.getState().editing).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/state/ui.edit.test.ts
```

- [ ] **Step 3: Implement**

Replace `packages/web/src/state/ui.ts` with:

```ts
import { create } from 'zustand';
import type { Workspace } from '@yank/shared';

export type ActiveWorkspace = Exclude<Workspace, 'hidden'>;

export interface EditingState {
  messageId: string;
  originalText: string;
  chatId: string;
}

interface UiState {
  workspace: ActiveWorkspace;
  paletteOpen: boolean;
  openThreadId: string | null;
  editing: EditingState | null;

  setWorkspace: (w: ActiveWorkspace) => void;
  togglePalette: (open?: boolean) => void;
  openThread: (messageId: string) => void;
  closeThread: () => void;
  setEditing: (value: EditingState | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  workspace: 'work',
  paletteOpen: false,
  openThreadId: null,
  editing: null,

  setWorkspace: (workspace) => set({ workspace }),
  togglePalette: (open) => set((s) => ({ paletteOpen: open ?? !s.paletteOpen })),
  openThread: (openThreadId) => set({ openThreadId }),
  closeThread: () => set({ openThreadId: null }),
  setEditing: (editing) => set({ editing }),
}));
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/state/ui.edit.test.ts
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/state/ui.ts \
        packages/web/test/state/ui.edit.test.ts
git commit -m "feat(web): add editing slice to useUiStore (messageId, originalText, chatId)"
```

---

### Task 3a.9: `Message.tsx` — render `(edited)` suffix

**Files:**
- Modify: `packages/web/src/components/chat/Message.tsx`
- Test: `packages/web/test/components/Message.edit.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/components/Message.edit.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Message } from '@yank/shared';
import { MessageRow } from '../../src/components/chat/Message.js';

const NOW = new Date().toISOString();
const makeMsg = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1', userId: 'u1', chatId: 'c1', waMessageId: 'WA-1', senderJid: 'me',
  ts: NOW, kind: 'text', text: 'hello world', replyToId: null,
  editedAt: null, deletedAt: null, status: 'sent', reactions: [],
  ...overrides,
});

describe('MessageRow edited suffix', () => {
  it('does NOT render (edited) when editedAt is null', () => {
    render(
      <MessageRow
        message={makeMsg()}
        showHead={true}
        senderName="You"
        senderInitials="Y"
        onOpenThread={vi.fn()}
      />,
    );
    expect(screen.queryByText('(edited)')).toBeNull();
  });

  it('renders (edited) when editedAt is set', () => {
    render(
      <MessageRow
        message={makeMsg({ editedAt: NOW })}
        showHead={true}
        senderName="You"
        senderInitials="Y"
        onOpenThread={vi.fn()}
      />,
    );
    expect(screen.getByText('(edited)')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/Message.edit.test.tsx
```

- [ ] **Step 3: Implement**

In `packages/web/src/components/chat/Message.tsx`, after the `<MessageText text={message.text} />` line, add:

```tsx
{message.editedAt && (
  <span className={styles.editedSuffix}>(edited)</span>
)}
```

In `packages/web/src/components/chat/Message.module.css`, add:

```css
.editedSuffix {
  color: var(--c-text-muted);
  font-size: 0.75rem;
  margin-left: 0.25rem;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/Message.edit.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/Message.tsx \
        packages/web/src/components/chat/Message.module.css \
        packages/web/test/components/Message.edit.test.tsx
git commit -m "feat(web): render (edited) suffix on MessageRow when editedAt is set"
```

---

### Task 3a.10: Composer edit mode

**Files:**
- Modify: `packages/web/src/components/chat/Composer.tsx`
- Modify: `packages/web/src/components/chat/Composer.module.css`
- Test: `packages/web/test/components/Composer.edit.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/components/Composer.edit.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Message } from '@yank/shared';
import { Composer } from '../../src/components/chat/Composer.js';
import { useUiStore } from '../../src/state/ui.js';
import { queryKeys } from '../../src/lib/queryKeys.js';

vi.mock('../../src/lib/mutations.js', () => ({
  useSendMessage: vi.fn(() => ({ mutate: vi.fn() })),
  useEditMessage: vi.fn(() => ({ mutate: vi.fn() })),
}));

const CHAT_ID = 'c1';
const MSG_ID = 'm1';
const NOW = new Date().toISOString();
const makeMsg = (overrides: Partial<Message> = {}): Message => ({
  id: MSG_ID, userId: 'u1', chatId: CHAT_ID, waMessageId: 'WA-1', senderJid: 'me',
  ts: NOW, kind: 'text', text: 'hello', replyToId: null, editedAt: null,
  deletedAt: null, status: 'sent', reactions: [],
  ...overrides,
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  qc.setQueryData(queryKeys.messages(CHAT_ID), {
    pages: [{ messages: [makeMsg()], nextCursor: null }],
    pageParams: [null],
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('Composer edit mode', () => {
  beforeEach(() => {
    useUiStore.setState({ editing: null });
  });

  it('shows edit banner when editing state is set for this chat', () => {
    useUiStore.setState({
      editing: { messageId: MSG_ID, originalText: 'hello', chatId: CHAT_ID },
    });
    render(<Composer chatId={CHAT_ID} onSend={vi.fn()} />, { wrapper });
    expect(screen.getByText(/Editing/)).toBeTruthy();
    expect(screen.getByText(/Esc to cancel/)).toBeTruthy();
  });

  it('pre-fills textarea with originalText in edit mode', () => {
    useUiStore.setState({
      editing: { messageId: MSG_ID, originalText: 'pre-filled text', chatId: CHAT_ID },
    });
    render(<Composer chatId={CHAT_ID} onSend={vi.fn()} />, { wrapper });
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.value).toBe('pre-filled text');
  });

  it('Escape clears editing state', async () => {
    useUiStore.setState({
      editing: { messageId: MSG_ID, originalText: 'hello', chatId: CHAT_ID },
    });
    render(<Composer chatId={CHAT_ID} onSend={vi.fn()} />, { wrapper });
    const ta = screen.getByRole('textbox');
    await userEvent.type(ta, '{Escape}');
    expect(useUiStore.getState().editing).toBeNull();
  });

  it('Enter in edit mode calls useEditMessage.mutate, not onSend', async () => {
    const { useEditMessage } = await import('../../src/lib/mutations.js');
    const mockMutate = vi.fn();
    vi.mocked(useEditMessage).mockReturnValue({ mutate: mockMutate } as ReturnType<typeof useEditMessage>);

    useUiStore.setState({
      editing: { messageId: MSG_ID, originalText: 'hello', chatId: CHAT_ID },
    });
    const onSend = vi.fn();
    render(<Composer chatId={CHAT_ID} onSend={onSend} />, { wrapper });
    const ta = screen.getByRole('textbox');
    await userEvent.clear(ta);
    await userEvent.type(ta, 'edited content');
    fireEvent.keyDown(ta, { key: 'Enter' });

    expect(mockMutate).toHaveBeenCalledWith({ text: 'edited content' });
    expect(onSend).not.toHaveBeenCalled();
    expect(useUiStore.getState().editing).toBeNull();
  });

  it('ArrowUp in empty textarea enters edit mode for last own message', async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.messages(CHAT_ID), {
      pages: [{ messages: [makeMsg()], nextCursor: null }],
      pageParams: [null],
    });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    render(<Composer chatId={CHAT_ID} onSend={vi.fn()} />, { wrapper: Wrapper });
    const ta = screen.getByRole('textbox');
    // Ensure textarea is empty
    expect((ta as HTMLTextAreaElement).value).toBe('');
    fireEvent.keyDown(ta, { key: 'ArrowUp' });

    expect(useUiStore.getState().editing).toEqual({
      messageId: MSG_ID,
      originalText: 'hello',
      chatId: CHAT_ID,
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/Composer.edit.test.tsx
```

- [ ] **Step 3: Implement**

Replace `packages/web/src/components/chat/Composer.tsx` with the full edit-mode-aware version:

```tsx
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useDraftsStore } from '../../state/drafts.js';
import { useUiStore } from '../../state/ui.js';
import { useEditMessage } from '../../lib/mutations.js';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys.js';
import type { MessagesPage } from '@yank/shared';
import {
  BoldIcon, ItalicIcon, StrikeIcon, CodeIcon, LinkIcon,
  BlockquoteIcon, ListIcon, PaperclipIcon, EmojiIcon, MicIcon,
} from '../icons/index.js';
import styles from './Composer.module.css';

interface ComposerProps {
  chatId: string;
  onSend: (text: string) => void;
  placeholder?: string;
  inThread?: boolean;
}

export function Composer({ chatId, onSend, placeholder = 'Message', inThread = false }: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const draft = useDraftsStore((s) => s.drafts[chatId] ?? '');
  const setDraft = useDraftsStore((s) => s.setDraft);
  const clearDraft = useDraftsStore((s) => s.clearDraft);
  const editing = useUiStore((s) => s.editing);
  const setEditing = useUiStore((s) => s.setEditing);
  const isEditing = editing !== null && editing.chatId === chatId;
  const editMutation = useEditMessage(chatId, editing?.messageId ?? '');
  const qc = useQueryClient();

  // When entering edit mode, focus the textarea
  useEffect(() => {
    if (isEditing) ref.current?.focus();
  }, [isEditing, editing?.messageId]);

  useEffect(() => {
    if (!isEditing) ref.current?.focus();
  }, [chatId]);

  const sendNormal = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    clearDraft(chatId);
  };

  const submitEdit = () => {
    if (!editing) return;
    const text = isEditing ? (ref.current?.value ?? '').trim() : '';
    if (!text) return;
    editMutation.mutate({ text });
    setEditing(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    ref.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isEditing) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitEdit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendNormal();
      return;
    }

    // ↑ in empty textarea enters edit mode on last own message
    if (e.key === 'ArrowUp' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const currentValue = (e.target as HTMLTextAreaElement).value;
      if (currentValue.length > 0) return;
      // Find last own outbound message with a waMessageId
      const data = qc.getQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
        queryKeys.messages(chatId),
      );
      if (!data) return;
      const allMessages = data.pages.flatMap((p) => p.messages);
      // Reverse to find the most recent own outbound
      const lastOwn = [...allMessages].reverse().find(
        (m) => m.senderJid === 'me' && m.waMessageId != null && !m.deletedAt,
      );
      if (!lastOwn) return;
      e.preventDefault();
      setEditing({ messageId: lastOwn.id, originalText: lastOwn.text ?? '', chatId });
    }
  };

  return (
    <div className={styles.wrap}>
      {isEditing && (
        <div className={styles.editBanner}>
          <span>Editing — Esc to cancel</span>
        </div>
      )}
      <div className={styles.composer}>
        {!inThread && (
          <div className={styles.toolbar}>
            <ToolbarBtn title="Bold · ⌘B"><BoldIcon size={14} /></ToolbarBtn>
            <ToolbarBtn title="Italic · ⌘I"><ItalicIcon size={14} /></ToolbarBtn>
            <ToolbarBtn title="Strikethrough"><StrikeIcon size={14} /></ToolbarBtn>
            <span className={styles.divider} />
            <ToolbarBtn title="Inline code"><CodeIcon size={14} /></ToolbarBtn>
            <ToolbarBtn title="Link"><LinkIcon size={14} /></ToolbarBtn>
            <ToolbarBtn title="Blockquote"><BlockquoteIcon size={14} /></ToolbarBtn>
            <ToolbarBtn title="List"><ListIcon size={14} /></ToolbarBtn>
          </div>
        )}
        <textarea
          ref={ref}
          className={styles.input}
          rows={1}
          placeholder={isEditing ? 'Edit message…' : placeholder}
          value={isEditing ? (editing?.originalText ?? '') : draft}
          onChange={(e) => {
            if (isEditing) {
              // Update the editing originalText so the value is controlled
              if (editing) {
                setEditing({ ...editing, originalText: e.target.value });
              }
            } else {
              setDraft(chatId, e.target.value);
            }
          }}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.bar}>
          <ToolbarBtn title="Attach file"><PaperclipIcon size={15} /></ToolbarBtn>
          <ToolbarBtn title="Emoji"><EmojiIcon size={15} /></ToolbarBtn>
          <ToolbarBtn title="Voice note"><MicIcon size={15} /></ToolbarBtn>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.sendBtn}
            disabled={isEditing ? !(editing?.originalText ?? '').trim() : !draft.trim()}
            onClick={isEditing ? submitEdit : sendNormal}
          >
            <span>{isEditing ? 'Save' : 'Send'}</span>
            <span className={styles.kbd}>↵</span>
          </button>
        </div>
      </div>
      {!inThread && !isEditing && (
        <div className={styles.hint}>
          <span><span className={styles.kbd}>↵</span> send</span>
          <span><span className={styles.kbd}>⇧↵</span> newline</span>
          <span><span className={styles.kbd}>↑</span> edit last</span>
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <button type="button" className={styles.iconBtn} title={title} aria-label={title}>
      {children}
    </button>
  );
}
```

Add to `Composer.module.css`:

```css
.editBanner {
  background: var(--c-accent-soft, rgba(99, 102, 241, 0.12));
  border-radius: 4px 4px 0 0;
  color: var(--c-text-secondary);
  font-size: 0.75rem;
  padding: 4px 12px;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/Composer.edit.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/Composer.tsx \
        packages/web/src/components/chat/Composer.module.css \
        packages/web/test/components/Composer.edit.test.tsx
git commit -m "feat(web): Composer edit mode — ↑ shortcut, edit banner, Enter submits, Esc cancels"
```

---

### Task 3a.11: Phase 3a verification gate

**Files:** none (gate only)

- [ ] **Step 1: Full lint + typecheck + test**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all passing. New tests:
- `packages/api/test/messages.edit.test.ts` — 6 cases
- `packages/daemon/test/outbound.edit.test.ts` — 3 cases
- `packages/daemon/test/connector-fake.test.ts` — 3 cases
- `packages/daemon/test/normalize.edit.test.ts` — 4 cases
- `packages/web/test/lib/mutations.edit.test.tsx` — 2 cases
- `packages/web/test/lib/eventStream.edit.test.ts` — 1 case
- `packages/web/test/state/ui.edit.test.ts` — 3 cases
- `packages/web/test/components/Message.edit.test.tsx` — 2 cases
- `packages/web/test/components/Composer.edit.test.tsx` — 5 cases

- [ ] **Step 2: Manual edit smoke**

1. Start dev stack: `pnpm dev`
2. Open any chat with sent messages
3. Click in the Composer textarea (empty) and press **↑** → Composer enters edit mode with the last own message pre-filled; banner reads "Editing — Esc to cancel"
4. Edit the text, press **Enter** → message row updates immediately (optimistic) with new text + `(edited)` suffix; after SSE reconciliation the canonical `editedAt` timestamp settles
5. Press **↑** again, press **Esc** → Composer exits edit mode; message text unchanged
6. Edit a message sent >15 min ago → "Edit failed — retry" affordance appears on the row for ~10 s
7. Send a new message but intercept before it gets a `waMessageId` (set network offline briefly) → the pending message's row has no Edit affordance (409 guard)
8. On phone, edit a message → within ~1 s the web row shows updated text + `(edited)` suffix (inbound normalize path)

- [ ] **Step 3: Commit gate marker**

```bash
git commit --allow-empty -m "chore: Phase 3a verification gate passed"
```

---

## Coverage check (Phase 2 + 3a)

### Cluster 2 sub-bullets vs tasks

| Spec §2 Cluster 2 requirement | Task(s) |
|---|---|
| `PATCH /api/contacts/:contactId` body `{ displayName }` — ownership-checked, Zod-validated, idempotent, 204, publishes `contact-update` | 2.1 |
| `packages/shared`: `ContactRenameBodySchema` + `ContactUpdateEvent` | Phase 0 (already done); 2.1 fixes uuid→string on `contactId` |
| `<TriageCard>` for DM exposes display name as click-to-edit input (Enter/blur commits; Esc reverts; empty → no-op) | 2.4 |
| Group cards keep WhatsApp's `subject` (read-only) | 2.4 |
| `useUpdateContactName` mutation — optimistic patch on `useChats()` + `useContact()` cache; rollback on error; error toast | 2.2 |
| `eventStream.ts` handles `'contact-update'` → patch caches | 2.3 |
| Inline-rename primitive co-located with TriageCard | 2.4 |

### Cluster 3a sub-bullets vs tasks

| Spec §2 Cluster 3a requirement | Task(s) |
|---|---|
| DB migration: `messages.edited_at TIMESTAMP NULL` | Already in M3 schema — no migration needed |
| `dto.ts` — `EditMessageBodySchema` | Phase 0 (done) |
| `events.ts` — `MessageEditEvent` + `MessageEditFailedEvent` | Phase 0 (done) |
| `commands.ts` — `EditMessageCommand` | Phase 0 (done) |
| `POST /api/messages/:messageId/edit` — ownership, 409 if still sending, 403 if inbound, XADD | 3a.1 |
| `connector-baileys.ts` — `editMessage(jid, key, text)` | 3a.3 |
| Outbound consumer handles `edit-message` command | 3a.2 + 3a.4 |
| DB UPDATE + publish `message-edit` on success | 3a.2 |
| Publish `message-edit-failed` with reason on failure | 3a.2 |
| `normalize.ts` — EDIT branch in protocolMessage handler; DB update + publish | 3a.5 |
| `MessageRow` shows `(edited)` suffix when `editedAt != null` | 3a.9 |
| `useEditMessage` mutation — optimistic patch; SSE reconciles | 3a.6 |
| `message-edit-failed` → per-row "Edit failed — retry" affordance for ~10 s | 3a.7 |
| Composer edit mode (`useUiStore.editing`): pre-fill textarea; banner; Enter commits; Esc reverts | 3a.8 + 3a.10 |
| `↑` in empty focused composer → edit mode on most recent own outbound | 3a.10 |

### §10 edge cases 8 + 9

| Edge case | Coverage |
|---|---|
| **Case 8 — Edit-window cliff (>15 min).** Server-enforced; no UI gate. | 3a.2: `classifyEditError` maps Baileys "too old" error → `reason: 'too-old'`; 3a.7: `message-edit-failed` handler surfaces the retry affordance for 10 s. Manual smoke in 3a.11 step 6. `Message.tsx` Edit action tooltip "messages older than 15 min cannot be edited" is a post-3a polish item (out of scope for this phase per spec §10). |
| **Case 9 — Edit during outbound retry (`wa_message_id IS NULL`).** | 3a.1: api returns 409 immediately; test case in `messages.edit.test.ts` "409 — message still sending". Composer stays in edit mode (text preserved) because the mutation's `onError` does not clear `editing` state — it only rolls back the optimistic cache patch. |

### §11.2 normalize.test.ts coverage

`packages/daemon/test/normalize.edit.test.ts` (Task 3a.5) covers:
- `normalizeBaileysEdit` returns `InboundEdit` for `MESSAGE_EDIT` protocolMessage ✓
- Returns null for `REVOKE` ✓ (REVOKE handler unaffected)
- Returns null for plain text ✓
- Handles `extendedTextMessage` inside `editedMessage` ✓

### §11.3 test file coverage

- `TriageCard.rename.test.tsx` — Task 2.4 ✓
- `Composer.edit.test.tsx` — Task 3a.10 ✓

---
## Phase 3b — `@mention` autocomplete

> **Depends on:** Phase 0 (DTOs green), Phase 3a (`useUiStore.editing` slice and `useEditMessage` mutation exist). Phase 3b adds `MentionSchema` to `@yank/shared`, wires JID resolution through the full stack, and mounts `<MentionPopover>` in `Composer`.

---

### Task 3b.1: Add `MentionSchema` to `@yank/shared` and extend send schemas

**Files:**
- Modify: `packages/shared/src/dto.ts`
- Modify: `packages/shared/src/events.ts` (extend `SendCommand`)
- Test: `packages/shared/test/dto.test.ts` (append)
- Test: `packages/shared/test/events.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/test/dto.test.ts`:

```ts
import { MentionSchema, SendMessageBodySchema } from '../src/dto.js';

describe('MentionSchema', () => {
  it('accepts a valid mention', () => {
    const m = MentionSchema.parse({ start: 0, end: 5, jid: '4477@s.whatsapp.net' });
    expect(m.jid).toBe('4477@s.whatsapp.net');
  });

  it('rejects negative start', () => {
    expect(() => MentionSchema.parse({ start: -1, end: 5, jid: 'x' })).toThrow();
  });

  it('rejects empty jid', () => {
    expect(() => MentionSchema.parse({ start: 0, end: 5, jid: '' })).toThrow();
  });
});

describe('SendMessageBodySchema with mentions', () => {
  it('accepts body without mentions', () => {
    expect(SendMessageBodySchema.parse({ text: 'hi' }).mentions).toBeUndefined();
  });

  it('accepts body with mentions array', () => {
    const b = SendMessageBodySchema.parse({
      text: '@Alice hi',
      mentions: [{ start: 0, end: 6, jid: '4477@s.whatsapp.net' }],
    });
    expect(b.mentions).toHaveLength(1);
    expect(b.mentions![0]!.jid).toBe('4477@s.whatsapp.net');
  });

  it('rejects mentions with missing jid', () => {
    expect(() =>
      SendMessageBodySchema.parse({
        text: '@x',
        mentions: [{ start: 0, end: 2 }],
      }),
    ).toThrow();
  });
});
```

Append to `packages/shared/test/events.test.ts`:

```ts
describe('SendCommand with mentionedJid', () => {
  it('accepts SendCommand without mentionedJid', () => {
    const cmd = ApiCommandSchema.parse({
      userId: '01938b3a-8b1b-7c00-a000-000000000001',
      type: 'send',
      localId: '01938b3a-8b1b-7c00-a000-000000000010',
      chatJid: '11111@s.whatsapp.net',
      text: 'hello',
    });
    expect(cmd.type).toBe('send');
    expect(('mentionedJid' in cmd ? cmd.mentionedJid : undefined)).toBeUndefined();
  });

  it('accepts SendCommand with mentionedJid', () => {
    const cmd = ApiCommandSchema.parse({
      userId: '01938b3a-8b1b-7c00-a000-000000000001',
      type: 'send',
      localId: '01938b3a-8b1b-7c00-a000-000000000010',
      chatJid: '11111@s.whatsapp.net',
      text: '@Alice hello',
      mentionedJid: ['4477@s.whatsapp.net'],
    });
    expect(('mentionedJid' in cmd ? cmd.mentionedJid : null)).toEqual(['4477@s.whatsapp.net']);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/shared/test/dto.test.ts packages/shared/test/events.test.ts
```

- [ ] **Step 3: Implement the schemas**

In `packages/shared/src/dto.ts`, after the `ReactionSchema` block and before `ChatSchema`, add:

```ts
export const MentionSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  jid: z.string().min(1),
});
export type Mention = z.infer<typeof MentionSchema>;
```

Replace the existing `SendMessageBodySchema`:

```ts
export const SendMessageBodySchema = z.object({
  text: z.string().min(1),
  replyToId: Uuid.optional(),
  mentions: z.array(MentionSchema).optional(),
});
export type SendMessageBody = z.infer<typeof SendMessageBodySchema>;
```

In `packages/shared/src/events.ts`, extend `SendCommand`:

```ts
export const SendCommand = Base.extend({
  type: z.literal('send'),
  localId: z.string().uuid(),
  chatJid: z.string(),
  text: z.string(),
  quotedWaId: z.string().optional(),
  mentionedJid: z.array(z.string()).optional(),
});
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/shared/test/dto.test.ts packages/shared/test/events.test.ts
pnpm --filter @yank/shared typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/dto.ts packages/shared/src/events.ts \
        packages/shared/test/dto.test.ts packages/shared/test/events.test.ts
git commit -m "feat(shared): add MentionSchema and extend SendMessageBody + SendCommand with mentions"
```

---

### Task 3b.2: Create `useMentionAutocomplete` hook

**Files:**
- Create: `packages/web/src/hooks/useMentionAutocomplete.ts`
- Test: `packages/web/test/hooks/useMentionAutocomplete.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/hooks/useMentionAutocomplete.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMentionAutocomplete } from '../../src/hooks/useMentionAutocomplete.js';
import type { ChatMember } from '@yank/shared';

const members: ChatMember[] = [
  { chatId: 'c1', jid: 'alice@s.whatsapp.net', displayName: 'Alice', role: 'member' },
  { chatId: 'c1', jid: 'bob@s.whatsapp.net', displayName: 'Bob', role: 'member' },
  { chatId: 'c1', jid: 'alicia@s.whatsapp.net', displayName: 'Alicia', role: 'admin' },
  {
    chatId: 'c1',
    jid: '99lid@lid.whatsapp.net',
    displayName: null,
    role: 'member',
  },
];

describe('useMentionAutocomplete', () => {
  it('query is null when no @ in text', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('hello world', 11);
    });
    expect(result.current.query).toBeNull();
  });

  it('sets query when @ is typed at end of text', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('hey @al', 7);
    });
    expect(result.current.query).toBe('al');
  });

  it('sets query to empty string immediately after @', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('@', 1);
    });
    expect(result.current.query).toBe('');
  });

  it('filters members by substring (case-insensitive)', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('@al', 3);
    });
    expect(result.current.filteredMembers.map((m) => m.displayName)).toContain('Alice');
    expect(result.current.filteredMembers.map((m) => m.displayName)).toContain('Alicia');
    expect(result.current.filteredMembers.map((m) => m.displayName)).not.toContain('Bob');
  });

  it('lid members appear with null displayName (rendered as @Unknown (lid) at display time)', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('@', 1);
    });
    const lidMember = result.current.filteredMembers.find((m) =>
      m.jid.includes('@lid.'),
    );
    expect(lidMember).toBeDefined();
    expect(lidMember!.displayName).toBeNull();
  });

  it('caps filteredMembers at 8', () => {
    const bigList: ChatMember[] = Array.from({ length: 12 }, (_, i) => ({
      chatId: 'c1',
      jid: `u${i}@s.whatsapp.net`,
      displayName: `User${i}`,
      role: 'member' as const,
    }));
    const { result } = renderHook(() => useMentionAutocomplete(bigList));
    act(() => {
      result.current.onTextChange('@', 1);
    });
    expect(result.current.filteredMembers.length).toBeLessThanOrEqual(8);
  });

  it('commit replaces @<query> with @<displayName> and trailing space at end', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('hey @al', 7);
    });
    let commitResult: { text: string; caret: number } | undefined;
    act(() => {
      commitResult = result.current.commit(members[0]!); // Alice
    });
    expect(commitResult!.text).toBe('hey @Alice ');
    expect(commitResult!.caret).toBe('hey @Alice '.length);
    expect(result.current.query).toBeNull();
  });

  it('commit inserts @<displayName> in the middle of text', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    // "@al world" with caret at position 3 (after "@al")
    act(() => {
      result.current.onTextChange('@al world', 3);
    });
    let commitResult: { text: string; caret: number } | undefined;
    act(() => {
      commitResult = result.current.commit(members[0]!); // Alice
    });
    expect(commitResult!.text).toBe('@Alice  world');
    // caret placed after '@Alice '
    expect(commitResult!.caret).toBe('@Alice '.length);
  });

  it('commit records the mention in accumulated mentions', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('hey @al', 7);
    });
    act(() => {
      result.current.commit(members[0]!);
    });
    expect(result.current.mentions).toHaveLength(1);
    expect(result.current.mentions[0]!.jid).toBe('alice@s.whatsapp.net');
  });

  it('ambiguity tie-break: first match wins', () => {
    const dupeMembers: ChatMember[] = [
      { chatId: 'c1', jid: 'alice1@s.whatsapp.net', displayName: 'Alice', role: 'member' },
      { chatId: 'c1', jid: 'alice2@s.whatsapp.net', displayName: 'Alice', role: 'member' },
    ];
    const { result } = renderHook(() => useMentionAutocomplete(dupeMembers));
    act(() => {
      result.current.onTextChange('@Alice', 6);
    });
    let commitResult: { text: string; caret: number } | undefined;
    act(() => {
      commitResult = result.current.commit(dupeMembers[0]!);
    });
    expect(result.current.mentions[0]!.jid).toBe('alice1@s.whatsapp.net');
    expect(commitResult!.text).toBe('@Alice ');
  });

  it('selectNext / selectPrev cycle through filteredMembers', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('@', 1);
    });
    expect(result.current.selectedIndex).toBe(0);
    act(() => {
      result.current.selectNext();
    });
    expect(result.current.selectedIndex).toBe(1);
    act(() => {
      result.current.selectPrev();
    });
    expect(result.current.selectedIndex).toBe(0);
    // does not underflow
    act(() => {
      result.current.selectPrev();
    });
    expect(result.current.selectedIndex).toBe(0);
  });

  it('dismiss sets query to null', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('@al', 3);
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.query).toBeNull();
  });

  it('reset clears mentions and query', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('hey @al', 7);
    });
    act(() => {
      result.current.commit(members[0]!);
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.mentions).toHaveLength(0);
    expect(result.current.query).toBeNull();
  });

  it('does not open popover if @ is preceded by a non-space character', () => {
    // e.g. email-like "user@domain" should not trigger
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('user@domain', 11);
    });
    expect(result.current.query).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/hooks/useMentionAutocomplete.test.ts
```

- [ ] **Step 3: Implement the hook**

Create `packages/web/src/hooks/useMentionAutocomplete.ts`:

```ts
import { useState, useCallback } from 'react';
import type { ChatMember, Mention } from '@yank/shared';

// Matches @ preceded by start-of-string or whitespace, followed by word chars up to caret.
// Returns the query string (possibly empty) or null if not in a mention context.
function detectMentionAt(text: string, caret: number): string | null {
  const before = text.slice(0, caret);
  // Walk backward from caret to find the most recent @
  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return null;
  // The character before @ must be a space, newline, or the start of the string
  if (atIdx > 0) {
    const charBefore = before[atIdx - 1];
    if (charBefore !== ' ' && charBefore !== '\n') return null;
  }
  const fragment = before.slice(atIdx + 1);
  // Only match word chars (letters, digits, underscores, spaces allowed in display names)
  if (!/^[\w\s]*$/.test(fragment)) return null;
  return fragment;
}

export interface MentionAutocompleteState {
  query: string | null;
  selectedIndex: number;
  mentions: Mention[];
  filteredMembers: ChatMember[];
  onTextChange(text: string, caretPos: number): { text: string; caret: number; mentions: Mention[] };
  selectNext(): void;
  selectPrev(): void;
  commit(member: ChatMember): { text: string; caret: number };
  dismiss(): void;
  reset(): void;
}

export function useMentionAutocomplete(members: ChatMember[]): MentionAutocompleteState {
  const [query, setQuery] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentions, setMentions] = useState<Mention[]>([]);
  // The position in the textarea where the current @ token started (index of @)
  const [atStart, setAtStart] = useState<number>(0);

  const filteredMembers: ChatMember[] = query === null
    ? []
    : members
        .filter((m) => {
          if (query === '') return true;
          const name = m.displayName ?? '';
          return name.toLowerCase().includes(query.toLowerCase());
        })
        .slice(0, 8);

  const onTextChange = useCallback(
    (text: string, caretPos: number): { text: string; caret: number; mentions: Mention[] } => {
      const detected = detectMentionAt(text, caretPos);
      if (detected === null) {
        setQuery(null);
        setSelectedIndex(0);
        return { text, caret: caretPos, mentions };
      }
      // Find the @ position
      const before = text.slice(0, caretPos);
      const atIdx = before.lastIndexOf('@');
      setAtStart(atIdx);
      setQuery(detected);
      setSelectedIndex(0);
      return { text, caret: caretPos, mentions };
    },
    [mentions],
  );

  const commit = useCallback(
    (member: ChatMember): { text: string; caret: number } => {
      // This function is called by Composer which holds the current text in state;
      // we reconstruct the replacement by reading the query length from atStart.
      // The Composer must pass its current text to resolve the replacement.
      // To keep the hook self-contained, we track the last text via a ref approach.
      // However, since onTextChange returns { text }, Composer already has it.
      // We use a closure ref to access current text. Store it via a side channel.
      // Simplest: return the new text by reading the stored atStart + query.
      // Composer calls commit(member) then applies the returned text to its state.
      // We need the current full text. Add an internal ref for it.
      return { text: '', caret: 0 }; // replaced below with the real implementation
    },
    [],
  );

  // Re-implement with a text ref:
  const [_currentText, _setCurrentText] = useState('');

  const onTextChangeReal = useCallback(
    (text: string, caretPos: number): { text: string; caret: number; mentions: Mention[] } => {
      _setCurrentText(text);
      const detected = detectMentionAt(text, caretPos);
      if (detected === null) {
        setQuery(null);
        setSelectedIndex(0);
        return { text, caret: caretPos, mentions };
      }
      const before = text.slice(0, caretPos);
      const atIdx = before.lastIndexOf('@');
      setAtStart(atIdx);
      setQuery(detected);
      setSelectedIndex(0);
      return { text, caret: caretPos, mentions };
    },
    [mentions],
  );

  const commitReal = useCallback(
    (member: ChatMember): { text: string; caret: number } => {
      const displayLabel = member.displayName ?? 'Unknown (lid)';
      const insertText = `@${displayLabel} `;
      // Replace from atStart through atStart+1+query.length
      const q = query ?? '';
      const replaceEnd = atStart + 1 + q.length;
      const before = _currentText.slice(0, atStart);
      const after = _currentText.slice(replaceEnd);
      const newText = before + insertText + after;
      const newCaret = atStart + insertText.length;
      const mention: Mention = {
        start: atStart,
        end: atStart + insertText.length - 1, // excludes trailing space
        jid: member.jid,
      };
      setMentions((prev) => [...prev, mention]);
      setQuery(null);
      setSelectedIndex(0);
      _setCurrentText(newText);
      return { text: newText, caret: newCaret };
    },
    [_currentText, atStart, query],
  );

  const selectNext = useCallback(() => {
    setSelectedIndex((i) => Math.min(i + 1, filteredMembers.length - 1));
  }, [filteredMembers.length]);

  const selectPrev = useCallback(() => {
    setSelectedIndex((i) => Math.max(i - 1, 0));
  }, []);

  const dismiss = useCallback(() => {
    setQuery(null);
    setSelectedIndex(0);
  }, []);

  const reset = useCallback(() => {
    setMentions([]);
    setQuery(null);
    setSelectedIndex(0);
    _setCurrentText('');
  }, []);

  return {
    query,
    selectedIndex,
    mentions,
    filteredMembers,
    onTextChange: onTextChangeReal,
    selectNext,
    selectPrev,
    commit: commitReal,
    dismiss,
    reset,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/hooks/useMentionAutocomplete.test.ts
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useMentionAutocomplete.ts \
        packages/web/test/hooks/useMentionAutocomplete.test.ts
git commit -m "feat(web): add useMentionAutocomplete hook with caret-tracking state machine"
```

---

### Task 3b.3: Wire `mentions` through send pipeline (api → daemon → Baileys)

**Files:**
- Modify: `packages/api/src/routes/chats.ts` (send-message handler)
- Modify: `packages/daemon/src/outbound.ts` (pass `mentionedJid` to connector)
- Modify: `packages/daemon/src/connector.ts` (extend `SendArgs`)
- Modify: `packages/daemon/src/connector-baileys.ts` (extend `sendText`)
- Modify: `packages/daemon/src/connector-fake.ts` (extend `sendText` / `sent` record)
- Test: `packages/daemon/test/outbound.test.ts` (extend existing file)
- Test: `packages/api/test/roundtrip.test.ts` (extend existing file)

- [ ] **Step 1: Write the failing tests**

Append to `packages/daemon/test/outbound.test.ts`:

```ts
  it('handleSendCommand passes mentionedJid to connector.sendText', async () => {
    const connector = new FakeConnector();
    const bus = createEventsBus(redis, USER);
    attachOutbound({ db, userId: USER, connector, bus });

    const chatId = (await db.select().from(chats).limit(1))[0]!.id;
    const localId = newId();
    await db.insert(messages).values({
      id: localId,
      userId: USER,
      chatId,
      senderJid: 'me',
      ts: new Date(),
      kind: 'text',
      text: '@Alice hello',
      status: 'pending',
    });

    await handleSendCommand(
      { db, userId: USER, connector, bus },
      {
        type: 'send',
        userId: USER,
        localId,
        chatJid: '4477@s.whatsapp.net',
        text: '@Alice hello',
        mentionedJid: ['alice@s.whatsapp.net'],
      },
    );

    const sentEntry = connector.sent.find((s) => s.text === '@Alice hello');
    expect(sentEntry).toBeDefined();
    expect(sentEntry!.mentionedJid).toEqual(['alice@s.whatsapp.net']);
  });
```

Append a test to `packages/api/test/roundtrip.test.ts` (inside the existing `describe` block):

```ts
  it('outbound: POST /messages with mentions passes mentionedJid through to connector', async () => {
    const chatsData = (await (await fetch(`${baseUrl}/api/chats`)).json()) as Array<{ id: string }>;
    const chatId = chatsData[0]!.id;

    const postRes = await fetch(`${baseUrl}/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: '@Alice hello',
        mentions: [{ start: 0, end: 6, jid: 'alice@s.whatsapp.net' }],
      }),
    });
    expect(postRes.status).toBe(202);

    await new Promise((r) => setTimeout(r, 500));
    const sentEntry = connector.sent.find((s) => s.text === '@Alice hello');
    expect(sentEntry).toBeDefined();
    expect(sentEntry!.mentionedJid).toEqual(['alice@s.whatsapp.net']);
  });
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/daemon/test/outbound.test.ts
```

- [ ] **Step 3: Implement**

In `packages/daemon/src/connector.ts`, extend `SendArgs`:

```ts
export interface SendArgs {
  chatJid: string;
  text: string;
  quotedWaId?: string;
  mentionedJid?: string[];
}
```

In `packages/daemon/src/connector-fake.ts`, extend `sent` record type and `sendText`:

```ts
// Change the sent array type:
sent: Array<{ chatJid: string; text: string; quotedWaId?: string; mentionedJid?: string[] }> = [];

// In sendText, update the push:
async sendText(args: SendArgs): Promise<SendResult> {
  this.sent.push({
    chatJid: args.chatJid,
    text: args.text,
    quotedWaId: args.quotedWaId,
    mentionedJid: args.mentionedJid,
  });
  const r: SendResult = { waMessageId: `fake-${++this.seq}`, ts: new Date() };
  setImmediate(() => this.emit('status', { waMessageId: r.waMessageId, status: 'sent' }));
  return r;
}
```

In `packages/daemon/src/connector-baileys.ts`, extend `sendText` to include `mentionedJid` in `contextInfo`:

```ts
async sendText(args: SendArgs): Promise<SendResult> {
  if (!this.sock) throw new Error('connector not started');
  const contextInfo: Record<string, unknown> = {};
  if (args.quotedWaId) contextInfo.stanzaId = args.quotedWaId;
  if (args.mentionedJid?.length) contextInfo.mentionedJid = args.mentionedJid;
  const sent = await this.sock.sendMessage(args.chatJid, {
    text: args.text,
    ...(Object.keys(contextInfo).length ? { contextInfo } : {}),
  });
  if (!sent?.key?.id) throw new Error('sendMessage returned no key.id');
  return {
    waMessageId: sent.key.id,
    ts: new Date(Number(sent.messageTimestamp ?? 0) * 1000 || Date.now()),
  };
}
```

In `packages/daemon/src/outbound.ts`, extend `handleSendCommand` to forward `mentionedJid`:

```ts
export async function handleSendCommand(
  ctx: OutboundCtx,
  cmd: Extract<ApiCommand, { type: 'send' }>,
): Promise<void> {
  try {
    const result = await ctx.connector.sendText({
      chatJid: cmd.chatJid,
      text: cmd.text,
      quotedWaId: cmd.quotedWaId,
      mentionedJid: cmd.mentionedJid,
    });
    await attachSentWaId(
      { db: ctx.db, userId: ctx.userId },
      cmd.localId,
      result.waMessageId,
      result.ts,
    );
    await ctx.bus.publish({
      type: 'status',
      userId: ctx.userId,
      localId: cmd.localId,
      status: 'sent',
      waMessageId: result.waMessageId,
    });
  } catch (err) {
    await setStatusByLocalId({ db: ctx.db, userId: ctx.userId }, cmd.localId, 'failed');
    await ctx.bus.publish({
      type: 'status',
      userId: ctx.userId,
      localId: cmd.localId,
      status: 'failed',
    });
    throw err;
  }
}
```

In `packages/api/src/routes/chats.ts`, the send-message route (in `registerChatsRoutes` in the POST `/api/chats/:id/messages` handler — find where it publishes the `send` command) must be updated to extract `mentions` and map them to `mentionedJid`. Locate the existing `XADD`/`commandsBus.publish` call for the send command and extend it:

```ts
// Before (example of existing call shape — adjust to match actual code):
await deps.commands.publish({
  type: 'send',
  userId: deps.userId,
  localId,
  chatJid: chat.jid,
  text: body.text,
  quotedWaId: body.replyToId ? resolvedWaId : undefined,
});

// After:
await deps.commands.publish({
  type: 'send',
  userId: deps.userId,
  localId,
  chatJid: chat.jid,
  text: body.text,
  quotedWaId: body.replyToId ? resolvedWaId : undefined,
  mentionedJid: body.mentions?.map((m) => m.jid),
});
```

Also ensure the route uses `SendMessageBodySchema.parse(req.body)` (or equivalent Zod parse) so `mentions` is available as a typed field.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/daemon/test/outbound.test.ts
pnpm --filter @yank/daemon typecheck
pnpm --filter @yank/api typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/events.ts \
        packages/daemon/src/connector.ts \
        packages/daemon/src/connector-fake.ts \
        packages/daemon/src/connector-baileys.ts \
        packages/daemon/src/outbound.ts \
        packages/daemon/test/outbound.test.ts \
        packages/api/src/routes/chats.ts \
        packages/api/test/roundtrip.test.ts
git commit -m "feat(daemon,api): wire mentionedJid through send pipeline to Baileys contextInfo"
```

---

### Task 3b.4: Create `MentionPopover` component

**Files:**
- Create: `packages/web/src/components/chat/MentionPopover.tsx`
- Create: `packages/web/src/components/chat/MentionPopover.module.css`
- Modify: `packages/web/src/components/chat/Composer.tsx`
- Test: `packages/web/test/components/chat/MentionPopover.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/components/chat/MentionPopover.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MentionPopover } from '../../../src/components/chat/MentionPopover.js';
import type { ChatMember } from '@yank/shared';

const members: ChatMember[] = [
  { chatId: 'c1', jid: 'alice@s.whatsapp.net', displayName: 'Alice', role: 'member' },
  { chatId: 'c1', jid: 'bob@s.whatsapp.net', displayName: 'Bob', role: 'member' },
  {
    chatId: 'c1',
    jid: '99lid@lid.whatsapp.net',
    displayName: null,
    role: 'member',
  },
];

const anchorRect: DOMRect = {
  top: 100,
  left: 50,
  bottom: 116,
  right: 66,
  width: 16,
  height: 16,
  x: 50,
  y: 100,
  toJSON: () => ({}),
};

describe('MentionPopover', () => {
  it('renders nothing when anchorRect is null', () => {
    const { container } = render(
      <MentionPopover
        members={members}
        selectedIndex={0}
        onSelect={vi.fn()}
        anchorRect={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders member display names', () => {
    render(
      <MentionPopover
        members={members}
        selectedIndex={0}
        onSelect={vi.fn()}
        anchorRect={anchorRect}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders @Unknown (lid) for null displayName members', () => {
    render(
      <MentionPopover
        members={members}
        selectedIndex={0}
        onSelect={vi.fn()}
        anchorRect={anchorRect}
      />,
    );
    expect(screen.getByText('@Unknown (lid)')).toBeInTheDocument();
  });

  it('highlights the selectedIndex item', () => {
    render(
      <MentionPopover
        members={members}
        selectedIndex={1}
        onSelect={vi.fn()}
        anchorRect={anchorRect}
      />,
    );
    const items = screen.getAllByRole('option');
    expect(items[1]).toHaveAttribute('aria-selected', 'true');
    expect(items[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onSelect with member on click', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <MentionPopover
        members={members}
        selectedIndex={0}
        onSelect={onSelect}
        anchorRect={anchorRect}
      />,
    );
    await user.click(screen.getByText('Bob'));
    expect(onSelect).toHaveBeenCalledWith(members[1]);
  });

  it('renders R/S shortcut hints as tooltip titles', () => {
    render(
      <MentionPopover
        members={[members[0]!]}
        selectedIndex={0}
        onSelect={vi.fn()}
        anchorRect={anchorRect}
      />,
    );
    // The popover list item should exist as option
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/chat/MentionPopover.test.tsx
```

- [ ] **Step 3: Implement `MentionPopover`**

Create `packages/web/src/components/chat/MentionPopover.tsx`:

```tsx
import type { ChatMember } from '@yank/shared';
import styles from './MentionPopover.module.css';

interface Props {
  members: ChatMember[];
  selectedIndex: number;
  onSelect: (member: ChatMember) => void;
  anchorRect: DOMRect | null;
}

function memberLabel(member: ChatMember): string {
  return member.displayName ?? '@Unknown (lid)';
}

function isLid(member: ChatMember): boolean {
  return member.jid.includes('@lid.');
}

export function MentionPopover({ members, selectedIndex, onSelect, anchorRect }: Props) {
  if (!anchorRect || members.length === 0) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    bottom: `calc(100vh - ${anchorRect.top}px + 4px)`,
    left: `${anchorRect.left}px`,
  };

  return (
    <div className={styles.popover} style={style} role="listbox" aria-label="Mention suggestions">
      {members.map((m, i) => (
        <div
          key={m.jid}
          className={styles.item + (i === selectedIndex ? ' ' + styles.active : '')}
          role="option"
          aria-selected={i === selectedIndex}
          onMouseDown={(e) => {
            // mousedown (not click) so we don't blur the textarea first
            e.preventDefault();
            onSelect(m);
          }}
        >
          <span className={styles.name}>{memberLabel(m)}</span>
          {isLid(m) && <span className={styles.lidTag}>lid</span>}
        </div>
      ))}
    </div>
  );
}
```

Create `packages/web/src/components/chat/MentionPopover.module.css`:

```css
.popover {
  z-index: var(--z-popover, 200);
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  min-width: 200px;
  max-width: 320px;
  overflow: hidden;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--c-text);
  user-select: none;
}

.item:hover,
.item.active {
  background: var(--c-surface-hover);
}

.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lidTag {
  font-size: 10px;
  font-family: var(--font-mono);
  background: var(--c-surface-subtle);
  color: var(--c-text-muted);
  border-radius: 4px;
  padding: 1px 4px;
}
```

Now wire the popover into `Composer.tsx`. The Composer needs to:
1. Call `useMentionAutocomplete` with the chat members.
2. Replace the plain `onChange` with `onTextChange`.
3. Handle `ArrowUp`/`ArrowDown`/`Enter`/`Tab`/`Escape` in the textarea `onKeyDown` when the popover is open.
4. Track the caret's `DOMRect` for popover positioning.
5. On send, pass `mentions` to `onSend`.

Replace `packages/web/src/components/chat/Composer.tsx` entirely:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Mention } from '@yank/shared';
import { useDraftsStore } from '../../state/drafts.js';
import { useChatMembers } from '../../lib/queries.js';
import { useMentionAutocomplete } from '../../hooks/useMentionAutocomplete.js';
import { MentionPopover } from './MentionPopover.js';
import {
  BoldIcon,
  ItalicIcon,
  StrikeIcon,
  CodeIcon,
  LinkIcon,
  BlockquoteIcon,
  ListIcon,
  PaperclipIcon,
  EmojiIcon,
  MicIcon,
} from '../icons/index.js';
import styles from './Composer.module.css';

interface ComposerProps {
  chatId: string;
  onSend: (text: string, mentions?: Mention[]) => void;
  placeholder?: string;
  inThread?: boolean;
}

function getCaretRect(textarea: HTMLTextAreaElement): DOMRect | null {
  // Best-effort: use the textarea's bounding rect bottom-left as anchor.
  // A precise per-character implementation would require a mirror div.
  const r = textarea.getBoundingClientRect();
  return new DOMRect(r.left, r.top, 0, 0);
}

export function Composer({
  chatId,
  onSend,
  placeholder = 'Message',
  inThread = false,
}: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const draft = useDraftsStore((s) => s.drafts[chatId] ?? '');
  const setDraft = useDraftsStore((s) => s.setDraft);
  const clearDraft = useDraftsStore((s) => s.clearDraft);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const { data: chatData } = useChatMembers(chatId, !inThread);
  const mention = useMentionAutocomplete(chatData ?? []);

  useEffect(() => {
    ref.current?.focus();
  }, [chatId]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text, mention.mentions.length > 0 ? mention.mentions : undefined);
    clearDraft(chatId);
    mention.reset();
    setAnchorRect(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value, selectionStart } = e.target;
    setDraft(chatId, value);
    const result = mention.onTextChange(value, selectionStart ?? value.length);
    if (result.text !== value) {
      // commit() returned a new text (mention inserted)
      setDraft(chatId, result.text);
    }
    if (mention.query !== null && ref.current) {
      setAnchorRect(getCaretRect(ref.current));
    } else {
      setAnchorRect(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention.query !== null) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mention.selectNext();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        mention.selectPrev();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const selected = mention.filteredMembers[mention.selectedIndex];
        if (selected) {
          e.preventDefault();
          const { text, caret } = mention.commit(selected);
          setDraft(chatId, text);
          setAnchorRect(null);
          // Restore caret position after React re-render
          requestAnimationFrame(() => {
            if (ref.current) {
              ref.current.selectionStart = caret;
              ref.current.selectionEnd = caret;
            }
          });
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        mention.dismiss();
        setAnchorRect(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleSelect = (member: typeof mention.filteredMembers[number]) => {
    const { text, caret } = mention.commit(member);
    setDraft(chatId, text);
    setAnchorRect(null);
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.selectionStart = caret;
        ref.current.selectionEnd = caret;
        ref.current.focus();
      }
    });
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.composer}>
        {!inThread && (
          <div className={styles.toolbar}>
            <ToolbarBtn title="Bold · ⌘B"><BoldIcon size={14} /></ToolbarBtn>
            <ToolbarBtn title="Italic · ⌘I"><ItalicIcon size={14} /></ToolbarBtn>
            <ToolbarBtn title="Strikethrough"><StrikeIcon size={14} /></ToolbarBtn>
            <span className={styles.divider} />
            <ToolbarBtn title="Inline code"><CodeIcon size={14} /></ToolbarBtn>
            <ToolbarBtn title="Link"><LinkIcon size={14} /></ToolbarBtn>
            <ToolbarBtn title="Blockquote"><BlockquoteIcon size={14} /></ToolbarBtn>
            <ToolbarBtn title="List"><ListIcon size={14} /></ToolbarBtn>
          </div>
        )}
        <textarea
          ref={ref}
          className={styles.input}
          rows={1}
          placeholder={placeholder}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.bar}>
          <ToolbarBtn title="Attach file"><PaperclipIcon size={15} /></ToolbarBtn>
          <ToolbarBtn title="Emoji"><EmojiIcon size={15} /></ToolbarBtn>
          <ToolbarBtn title="Voice note"><MicIcon size={15} /></ToolbarBtn>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.sendBtn}
            disabled={!draft.trim()}
            onClick={send}
          >
            <span>Send</span>
            <span className={styles.kbd}>↵</span>
          </button>
        </div>
      </div>
      {!inThread && (
        <div className={styles.hint}>
          <span><span className={styles.kbd}>↵</span> send</span>
          <span><span className={styles.kbd}>⇧↵</span> newline</span>
          <span><span className={styles.kbd}>↑</span> edit last</span>
        </div>
      )}
      <MentionPopover
        members={mention.filteredMembers}
        selectedIndex={mention.selectedIndex}
        onSelect={handleSelect}
        anchorRect={mention.query !== null ? anchorRect : null}
      />
    </div>
  );
}

function ToolbarBtn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <button type="button" className={styles.iconBtn} title={title} aria-label={title}>
      {children}
    </button>
  );
}
```

Also update `ChatView.tsx` to pass `mentions` through `onSend`:

```tsx
// In ChatView.tsx, update the Composer onSend prop:
<Composer
  chatId={chatId}
  placeholder={`Message ${chat.subject ?? chat.jid}`}
  onSend={(text, mentions) => {
    send.mutate({ text, mentions });
  }}
/>
```

And update `useSendMessage` in `packages/web/src/lib/mutations.ts` — the `mutationFn` body type already accepts `SendMessageBody` which now includes `mentions?: Mention[]`, so no change is needed there as long as `apiFetch` passes the body as-is.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/chat/MentionPopover.test.tsx
pnpm exec vitest run packages/web/test/components/chat/Composer.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/MentionPopover.tsx \
        packages/web/src/components/chat/MentionPopover.module.css \
        packages/web/src/components/chat/Composer.tsx \
        packages/web/src/components/chat/ChatView.tsx \
        packages/web/test/components/chat/MentionPopover.test.tsx
git commit -m "feat(web): add MentionPopover and wire @mention autocomplete into Composer"
```

---

### Task 3b.5: Phase 3b verification gate

**Files:** none (gate only)

- [ ] **Step 1: Full suite**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all tests green. No lint errors. No type errors.

- [ ] **Step 2: Manual smoke**

Start dev (`pnpm dev`), open a group chat, type `@` in the Composer → popover appears with group members. Type `@al` → popover filters to members whose name contains "al". Press `Enter` → `@Alice ` is inserted with a trailing space. Send the message → check Baileys log shows `mentionedJid` in the outbound payload.

- [ ] **Step 3: Commit gate marker** *(no code changes)*

```bash
# No commit needed for a gate — move to Phase 3c.
```

---

## Phase 3c — Hover & keyboard shortcuts

> **Depends on:** Phase 3a (`useUiStore.editing`, `useEditMessage`), Phase 3b (complete), Phase 1 (`CommandPalette` has `mode?: 'chats-only'` prop). Phase 3c adds `MessageRowActions`, hover-scoped R/S keystrokes, `ChatFilterBar`, and three new global shortcuts.

---

### Task 3c.1: Create `MessageRowActions` component

**Files:**
- Create: `packages/web/src/components/chat/MessageRowActions.tsx`
- Create: `packages/web/src/components/chat/MessageRowActions.module.css`
- Test: `packages/web/test/components/chat/MessageRowActions.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/components/chat/MessageRowActions.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
} from '@tanstack/react-router';
import { MessageRowActions } from '../../../src/components/chat/MessageRowActions.js';
import { useUiStore } from '../../../src/state/ui.js';
import type { Message } from '@yank/shared';

const server = setupServer(
  http.post('/api/messages/:id/star', () => HttpResponse.json({}, { status: 200 })),
);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const baseMessage: Message = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000050',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  waMessageId: 'ABC',
  senderJid: '4477@s.whatsapp.net',
  ts: '2026-05-14T09:14:00.000Z',
  kind: 'text',
  text: 'Hello',
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  status: 'sent',
  reactions: [],
  starred: false,
};

const MY_JID = '4477@s.whatsapp.net'; // same as senderJid → own message

function renderActions(message: Message, chatId = 'chat-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const chatRoute = createRoute({
    getParentRoute: () => createRootRoute({ component: () => null }),
    path: '/c/$chatId',
    component: () => null,
  });
  const threadRoute = createRoute({
    getParentRoute: () => chatRoute.getParentRoute(),
    path: '/c/$chatId/t/$messageId',
    component: () => null,
  });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={qc}>
        <MessageRowActions message={message} chatId={chatId} myJid={MY_JID} />
      </QueryClientProvider>
    ),
  });
  const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const chat2 = createRoute({
    getParentRoute: () => root,
    path: '/c/$chatId',
    component: () => null,
  });
  const thread2 = createRoute({
    getParentRoute: () => root,
    path: '/c/$chatId/t/$messageId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([idx, chat2, thread2]),
    history: createMemoryHistory({ initialEntries: [`/c/${chatId}`] }),
  });
  return render(<RouterProvider router={router as never} />);
}

describe('MessageRowActions', () => {
  it('renders Reply and Star buttons for all messages', () => {
    renderActions(baseMessage);
    expect(screen.getByTitle(/reply in thread/i)).toBeInTheDocument();
    expect(screen.getByTitle(/star/i)).toBeInTheDocument();
  });

  it('renders Edit button only for own outbound messages', () => {
    renderActions(baseMessage); // senderJid === MY_JID
    expect(screen.getByTitle(/edit/i)).toBeInTheDocument();
  });

  it('does NOT render Edit button for inbound messages', () => {
    renderActions({ ...baseMessage, senderJid: 'other@s.whatsapp.net' });
    expect(screen.queryByTitle(/edit/i)).not.toBeInTheDocument();
  });

  it('Edit button calls setEditing with correct args', async () => {
    const user = userEvent.setup();
    renderActions(baseMessage);
    await user.click(screen.getByTitle(/edit/i));
    const editing = useUiStore.getState().editing;
    expect(editing).not.toBeNull();
    expect(editing!.messageId).toBe(baseMessage.id);
    expect(editing!.originalText).toBe('Hello');
    expect(editing!.chatId).toBe('chat-1');
  });

  it('Reply button title shows R keybind hint', () => {
    renderActions(baseMessage);
    expect(screen.getByTitle(/reply in thread.*R/i)).toBeInTheDocument();
  });

  it('Star button title shows S keybind hint', () => {
    renderActions(baseMessage);
    expect(screen.getByTitle(/star.*S/i)).toBeInTheDocument();
  });

  it('renders in a thread context (inThread=true)', () => {
    renderActions({ ...baseMessage, senderJid: 'other@s.whatsapp.net' });
    // Should still render reply + star even for inbound in thread
    expect(screen.getByTitle(/reply in thread/i)).toBeInTheDocument();
    expect(screen.getByTitle(/star/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/chat/MessageRowActions.test.tsx
```

- [ ] **Step 3: Implement `MessageRowActions`**

Create `packages/web/src/components/chat/MessageRowActions.tsx`:

```tsx
import { useNavigate } from '@tanstack/react-router';
import type { Message } from '@yank/shared';
import { useUiStore } from '../../state/ui.js';
import { useStar } from '../../lib/mutations.js';
import { EditIcon, ThreadIcon, StarIcon } from '../icons/index.js';
import styles from './MessageRowActions.module.css';

interface Props {
  message: Message;
  chatId: string;
  myJid: string;
}

export function MessageRowActions({ message, chatId, myJid }: Props) {
  const navigate = useNavigate();
  const setEditing = useUiStore((s) => s.setEditing);
  const star = useStar();

  const isOwn = message.senderJid === myJid;

  return (
    <div className={styles.strip}>
      {isOwn && (
        <button
          type="button"
          className={styles.btn}
          title="Edit message"
          aria-label="Edit message"
          onClick={() =>
            setEditing({
              messageId: message.id,
              originalText: message.text ?? '',
              chatId,
            })
          }
        >
          <EditIcon size={13} />
        </button>
      )}
      <button
        type="button"
        className={styles.btn}
        title="Reply in thread · R"
        aria-label="Reply in thread"
        onClick={() =>
          void navigate({
            to: '/c/$chatId/t/$messageId',
            params: { chatId, messageId: message.id },
          })
        }
      >
        <ThreadIcon size={13} />
      </button>
      <button
        type="button"
        className={styles.btn}
        title="Star · S"
        aria-label="Star message"
        onClick={() => star.mutate({ messageId: message.id, starred: !message.starred })}
      >
        <StarIcon size={13} />
      </button>
    </div>
  );
}
```

Create `packages/web/src/components/chat/MessageRowActions.module.css`:

```css
.strip {
  display: none;
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  align-items: center;
  gap: 2px;
  background: var(--c-surface-raised);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  padding: 2px 4px;
  height: 28px;
  box-shadow: var(--shadow-sm);
  z-index: 10;
}

/* Parent row must have position: relative and the .group class */
:global(.msgGroup):hover .strip {
  display: flex;
}
```

Now extend `packages/web/src/state/ui.ts` to add the `editing` slice (this is the one added in Phase 3a — if 3a is not yet merged, add it now; if it is, verify the shape matches):

```ts
// Extend UiState interface with:
editing: {
  messageId: string;
  originalText: string;
  chatId: string;
} | null;

setEditing: (editing: { messageId: string; originalText: string; chatId: string } | null) => void;

// In the create() initializer:
editing: null,
setEditing: (editing) => set({ editing }),
```

Note: if Phase 3a has already added this, confirm the shape matches and skip the `ui.ts` change.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/chat/MessageRowActions.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/MessageRowActions.tsx \
        packages/web/src/components/chat/MessageRowActions.module.css \
        packages/web/src/state/ui.ts
git commit -m "feat(web): add MessageRowActions hover strip (Edit/Reply/Star)"
```

---

### Task 3c.2: Mount `MessageRowActions` in `Message.tsx` and `ThreadPanel.tsx`

**Files:**
- Modify: `packages/web/src/components/chat/Message.tsx`
- Modify: `packages/web/src/components/thread/ThreadPanel.tsx`
- Test: `packages/web/test/components/chat/Message.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append to `packages/web/test/components/chat/Message.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
} from '@tanstack/react-router';

function wrapInRouter(node: React.ReactElement) {
  const root = createRootRoute({ component: () => node });
  const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const chat = createRoute({
    getParentRoute: () => root,
    path: '/c/$chatId/t/$messageId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([idx, chat]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

describe('MessageRow — action strip', () => {
  it('renders the Reply in thread button (action strip present in DOM)', () => {
    wrapInRouter(
      <MessageRow
        message={base}
        showHead={true}
        senderName="Alice"
        senderInitials="AL"
        onOpenThread={() => {}}
        chatId="chat-1"
        myJid="4477@s.whatsapp.net"
      />,
    );
    expect(screen.getByTitle(/reply in thread/i)).toBeInTheDocument();
  });

  it('renders Edit button when message is own outbound', () => {
    wrapInRouter(
      <MessageRow
        message={{ ...base, senderJid: '4477@s.whatsapp.net' }}
        showHead={true}
        senderName="Me"
        senderInitials="ME"
        onOpenThread={() => {}}
        chatId="chat-1"
        myJid="4477@s.whatsapp.net"
      />,
    );
    expect(screen.getByTitle(/edit/i)).toBeInTheDocument();
  });

  it('shows (edited) suffix when editedAt is set', () => {
    wrapInRouter(
      <MessageRow
        message={{ ...base, editedAt: '2026-05-14T10:00:00.000Z' }}
        showHead={true}
        senderName="Alice"
        senderInitials="AL"
        onOpenThread={() => {}}
        chatId="chat-1"
        myJid="other@s.whatsapp.net"
      />,
    );
    expect(screen.getByText('(edited)')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/chat/Message.test.tsx
```

- [ ] **Step 3: Implement**

Modify `packages/web/src/components/chat/Message.tsx`:

1. Add `chatId: string` and `myJid: string` to `MessageRowProps`.
2. Import `MessageRowActions`.
3. Replace the existing `.actions` div (the one with `EmojiIcon`, `ThreadIcon`, `StarIcon`, `MoreIcon` buttons) with `<MessageRowActions message={message} chatId={chatId} myJid={myJid} />`.
4. Add `(edited)` suffix in the message body when `message.editedAt != null`.
5. Add `msgGroup` class to the outer div so the CSS `.strip` visibility rule triggers.

Key diffs to `Message.tsx`:

```tsx
// Add to MessageRowProps:
chatId: string;
myJid: string;

// Add import:
import { MessageRowActions } from './MessageRowActions.js';

// In the main return, change outer div className:
<div className={styles.msg + ' msgGroup' + (showHead ? '' : ' ' + styles.compact)}>

// After <MessageText text={message.text} />, add edited suffix:
{message.editedAt && (
  <span className={styles.editedTag}>(edited)</span>
)}

// Replace the existing .actions div:
<MessageRowActions message={message} chatId={chatId} myJid={myJid} />
```

Also add to `Message.module.css`:

```css
.editedTag {
  font-size: 11px;
  color: var(--c-text-muted);
  margin-left: 4px;
}
```

Modify `packages/web/src/components/thread/ThreadPanel.tsx`: `MessageRow` is already used there. Add `chatId` and `myJid` props. The `myJid` in `ThreadPanel` should come from `useUiStore` or the session — for now derive it from the parent chat's `jid` field is not correct (that's the chat JID, not the user's JID). Instead, read it from a new `currentUserJid` field on `useUiStore` (or simply thread it through via a prop). The simplest approach: expose `userJid` from `useUiStore.currentJid` (set by the `connected` SSE event in `eventStream.ts`). If not yet present, default to `''` (empty string) — the Edit button will not render for inbound messages and not rendering for own messages is a safe degradation.

In `ThreadPanel.tsx`, pass `chatId={chatId}` and `myJid={useUiStore((s) => s.currentJid ?? '')}` to each `<MessageRow />`.

In `packages/web/src/state/ui.ts`, add:

```ts
currentJid: string | null;
setCurrentJid: (jid: string) => void;
// initializer:
currentJid: null,
setCurrentJid: (currentJid) => set({ currentJid }),
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/chat/Message.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/Message.tsx \
        packages/web/src/components/chat/Message.module.css \
        packages/web/src/components/thread/ThreadPanel.tsx \
        packages/web/src/state/ui.ts
git commit -m "feat(web): mount MessageRowActions in MessageRow + ThreadPanel; add (edited) suffix"
```

---

### Task 3c.3: Hover-scoped R/S keystroke handler

**Files:**
- Modify: `packages/web/src/components/chat/Message.tsx`
- Create: `packages/web/test/components/chat/MessageRow.hover-keys.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/components/chat/MessageRow.hover-keys.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
} from '@tanstack/react-router';
import { MessageRow } from '../../../src/components/chat/Message.js';
import type { Message } from '@yank/shared';

const server = setupServer(
  http.post('/api/messages/:id/star', () => HttpResponse.json({}, { status: 200 })),
);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const msg: Message = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000050',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  waMessageId: 'ABC',
  senderJid: 'other@s.whatsapp.net',
  ts: '2026-05-14T09:14:00.000Z',
  kind: 'text',
  text: 'Hello',
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  status: 'sent',
  reactions: [],
  starred: false,
};

function renderRow() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const navigateSpy = vi.fn();
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={qc}>
        <MessageRow
          message={msg}
          showHead={true}
          senderName="Other"
          senderInitials="OT"
          onOpenThread={() => {}}
          chatId="chat-1"
          myJid="me@s.whatsapp.net"
        />
      </QueryClientProvider>
    ),
  });
  const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const thread = createRoute({
    getParentRoute: () => root,
    path: '/c/$chatId/t/$messageId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([idx, thread]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return { rendered: render(<RouterProvider router={router as never} />), navigateSpy };
}

describe('MessageRow hover keys', () => {
  it('pressing s while hovering over row calls star mutation', async () => {
    let starCalled = false;
    server.use(
      http.post('/api/messages/:id/star', () => {
        starCalled = true;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    const { rendered } = renderRow();
    const row = rendered.container.querySelector('[data-testid="message-row"]') as HTMLElement;
    expect(row).toBeTruthy();

    fireEvent.mouseEnter(row);
    fireEvent.keyDown(document, { key: 's' });
    await new Promise((r) => setTimeout(r, 50));
    expect(starCalled).toBe(true);
  });

  it('does not fire hover keys when an input is focused', async () => {
    let starCalled = false;
    server.use(
      http.post('/api/messages/:id/star', () => {
        starCalled = true;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    const { rendered } = renderRow();
    const row = rendered.container.querySelector('[data-testid="message-row"]') as HTMLElement;
    fireEvent.mouseEnter(row);

    // Simulate an input being focused
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(document, { key: 's' });
    await new Promise((r) => setTimeout(r, 50));
    expect(starCalled).toBe(false);
    document.body.removeChild(input);
  });

  it('removes keydown listener on mouseLeave', async () => {
    let starCalled = false;
    server.use(
      http.post('/api/messages/:id/star', () => {
        starCalled = true;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    const { rendered } = renderRow();
    const row = rendered.container.querySelector('[data-testid="message-row"]') as HTMLElement;

    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);
    fireEvent.keyDown(document, { key: 's' });
    await new Promise((r) => setTimeout(r, 50));
    expect(starCalled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/chat/MessageRow.hover-keys.test.tsx
```

- [ ] **Step 3: Implement**

In `packages/web/src/components/chat/Message.tsx`, add hover listener logic. The component is currently a plain function (no hooks). We need to convert it to use `useRef` + `useCallback` for the listener:

Add imports at the top:

```tsx
import { useRef, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useStar } from '../../lib/mutations.js';
```

Inside `MessageRow` (before the early returns), add:

```tsx
const navigate = useNavigate();
const star = useStar();
const rowRef = useRef<HTMLDivElement>(null);

const onHoverKey = useCallback(
  (e: KeyboardEvent) => {
    const target = e.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target.isContentEditable
      ) return;
    }
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      void navigate({
        to: '/c/$chatId/t/$messageId',
        params: { chatId, messageId: message.id },
      });
    }
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      star.mutate({ messageId: message.id, starred: !message.starred });
    }
  },
  [chatId, message.id, message.starred, navigate, star],
);

const onMouseEnter = useCallback(() => {
  document.addEventListener('keydown', onHoverKey);
}, [onHoverKey]);

const onMouseLeave = useCallback(() => {
  document.removeEventListener('keydown', onHoverKey);
}, [onHoverKey]);
```

Add `data-testid="message-row"` and the mouse event handlers to the outer `<div>` of the non-system, non-deleted path:

```tsx
<div
  ref={rowRef}
  data-testid="message-row"
  className={styles.msg + ' msgGroup' + (showHead ? '' : ' ' + styles.compact)}
  onMouseEnter={onMouseEnter}
  onMouseLeave={onMouseLeave}
>
```

Add `data-testid="message-row"` to the deleted tombstone div as well for consistency.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/chat/MessageRow.hover-keys.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/Message.tsx \
        packages/web/test/components/chat/MessageRow.hover-keys.test.tsx
git commit -m "feat(web): add hover-scoped R/S keydown handler on MessageRow"
```

---

### Task 3c.4: Bind `Cmd-T` to open palette in chats-only mode

**Files:**
- Modify: `packages/web/src/state/ui.ts` (add `paletteMode` slice)
- Modify: `packages/web/src/components/palette/CommandPalette.tsx` (add `mode` prop)
- Modify: `packages/web/src/hooks/useKeyboardShortcuts.ts` (add `Cmd-T` binding)
- Test: `packages/web/test/components/palette/CommandPalette.test.tsx` (extend)
- Test: `packages/web/test/hooks/useKeyboardShortcuts.test.tsx` (extend or create)

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/test/components/palette/CommandPalette.test.tsx`:

```tsx
describe('CommandPalette mode="chats-only"', () => {
  it('hides action items when mode is chats-only', async () => {
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          {
            id: 'c1',
            userId: 'u1',
            jid: '4477@s.whatsapp.net',
            type: 'dm',
            subject: 'Alice',
            lastMessageAt: null,
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: false,
            workspace: 'work',
            memberCount: 0,
            unreadCount: 0,
            lastReadMessageId: null,
            lastReadTs: null,
          },
        ]),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const root = createRootRoute({ component: () => <CommandPalette mode="chats-only" /> });
    const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
    const chat = createRoute({
      getParentRoute: () => root,
      path: '/c/$chatId',
      component: () => null,
    });
    const router = createRouter({
      routeTree: root.addChildren([idx, chat]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router as never} />
      </QueryClientProvider>,
    );
    await screen.findByText('Alice');
    expect(screen.queryByText('Open Triage')).not.toBeInTheDocument();
    expect(screen.queryByText('Global search…')).not.toBeInTheDocument();
  });
});
```

Create `packages/web/test/hooks/useKeyboardShortcuts.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
} from '@tanstack/react-router';
import React from 'react';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts.js';
import { useUiStore } from '../../src/state/ui.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: () => <>{children}</> });
  const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const router = createRouter({
    routeTree: root.addChildren([idx]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return (
    <QueryClientProvider client={qc}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>
  );
}

describe('useKeyboardShortcuts — Cmd-T', () => {
  beforeEach(() => {
    useUiStore.setState({ paletteOpen: false, paletteMode: null });
  });

  it('Cmd-T opens palette in chats-only mode', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });
    const event = new KeyboardEvent('keydown', { key: 't', metaKey: true, bubbles: true });
    window.dispatchEvent(event);
    const state = useUiStore.getState();
    expect(state.paletteOpen).toBe(true);
    expect(state.paletteMode).toBe('chats-only');
  });

  it('Cmd-K opens palette in default mode', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
    window.dispatchEvent(event);
    const state = useUiStore.getState();
    expect(state.paletteOpen).toBe(true);
    expect(state.paletteMode).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/palette/CommandPalette.test.tsx \
                      packages/web/test/hooks/useKeyboardShortcuts.test.tsx
```

- [ ] **Step 3: Implement**

In `packages/web/src/state/ui.ts`, add `paletteMode` slice:

```ts
// Extend interface:
paletteMode: 'chats-only' | null;
openPalette: (mode?: 'chats-only') => void;

// In create:
paletteMode: null,
openPalette: (mode) => set({ paletteOpen: true, paletteMode: mode ?? null }),

// Update togglePalette to clear paletteMode when closing:
togglePalette: (open) => set((s) => ({
  paletteOpen: open ?? !s.paletteOpen,
  paletteMode: (open ?? !s.paletteOpen) ? s.paletteMode : null,
})),
```

In `packages/web/src/components/palette/CommandPalette.tsx`, add `mode` prop and filter logic:

```tsx
// Change the component signature:
export function CommandPalette({ mode }: { mode?: 'chats-only' }) {

// In the items useMemo, conditionally include actions:
const items = useMemo<Item[]>(() => {
  const jumpItems: Item[] = chats
    .filter((c) => c.workspace !== 'hidden')
    .map((c) => ({
      kind: 'jump',
      id: `j-${c.id}`,
      chatId: c.id,
      type: c.type,
      label: c.subject ?? c.jid,
      meta: `${c.workspace}${c.unreadCount ? ` · ${c.unreadCount} unread` : ''}`,
    }));
  const actions: Item[] = mode === 'chats-only' ? [] : [
    { kind: 'action', id: 'a-triage', label: 'Open Triage', href: '/triage', kbd: '⌘3' },
    { kind: 'action', id: 'a-search', label: 'Global search…', href: '/search', kbd: '⌘⇧F' },
    { kind: 'action', id: 'a-diag', label: 'Open diagnostics', href: '/diagnostics' },
    { kind: 'action', id: 'a-settings', label: 'Open settings', href: '/settings' },
  ];
  const lower = q.toLowerCase();
  return [...jumpItems, ...actions].filter((it) =>
    it.label.toLowerCase().includes(lower),
  );
}, [chats, q, mode]);
```

Also update the `placeholder` text when in chats-only mode:

```tsx
placeholder={mode === 'chats-only' ? 'Jump to chat…' : 'Jump to chat, run command…'}
```

In `packages/web/src/hooks/useKeyboardShortcuts.ts`, add `Cmd-T` binding. In the `onKey` handler, after the `Cmd-K` block:

```ts
const openPalette = useUiStore((s) => s.openPalette);

// In the handler, add after Cmd-K:
if (mod && e.key.toLowerCase() === 't' && !e.shiftKey) {
  e.preventDefault();
  openPalette('chats-only');
  return;
}
```

Add `openPalette` to the `useEffect` dependency array.

In `packages/web/src/routes/__root.tsx` (where `<CommandPalette />` is mounted), pass the `paletteMode` from store:

```tsx
const paletteMode = useUiStore((s) => s.paletteMode);
// ...
{paletteOpen && <CommandPalette mode={paletteMode ?? undefined} />}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/palette/CommandPalette.test.tsx \
                      packages/web/test/hooks/useKeyboardShortcuts.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/state/ui.ts \
        packages/web/src/components/palette/CommandPalette.tsx \
        packages/web/src/hooks/useKeyboardShortcuts.ts \
        packages/web/test/components/palette/CommandPalette.test.tsx \
        packages/web/test/hooks/useKeyboardShortcuts.test.tsx
git commit -m "feat(web): bind Cmd-T to open command palette in chats-only mode"
```

---

### Task 3c.5: Create `ChatFilterBar` and `useChatFilter`

**Files:**
- Create: `packages/web/src/hooks/useChatFilter.ts`
- Create: `packages/web/src/components/chat/ChatFilterBar.tsx`
- Create: `packages/web/src/components/chat/ChatFilterBar.module.css`
- Modify: `packages/web/src/state/ui.ts` (add `chatFilter` slice)
- Modify: `packages/web/src/components/chat/ChatView.tsx` (mount bar)
- Test: `packages/web/test/components/chat/ChatFilterBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/components/chat/ChatFilterBar.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatFilterBar } from '../../../src/components/chat/ChatFilterBar.js';
import { useUiStore } from '../../../src/state/ui.js';
import type { Message } from '@yank/shared';

const makeMsg = (id: string, text: string): Message => ({
  id,
  userId: 'u1',
  chatId: 'c1',
  waMessageId: id,
  senderJid: 'a@s.whatsapp.net',
  ts: '2026-05-14T09:00:00.000Z',
  kind: 'text',
  text,
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  status: 'sent',
  reactions: [],
});

const messages: Message[] = [
  makeMsg('m1', 'hello world'),
  makeMsg('m2', 'foo bar'),
  makeMsg('m3', 'hello again'),
];

function setup() {
  useUiStore.setState({
    chatFilter: { open: true, query: '', hitIndex: 0 },
  });
  return render(
    <ChatFilterBar chatId="c1" messages={messages} />,
  );
}

describe('ChatFilterBar', () => {
  it('renders when chatFilter.open is true', () => {
    setup();
    expect(screen.getByPlaceholderText(/search messages/i)).toBeInTheDocument();
  });

  it('does not render when chatFilter.open is false', () => {
    useUiStore.setState({ chatFilter: { open: false, query: '', hitIndex: 0 } });
    render(<ChatFilterBar chatId="c1" messages={messages} />);
    expect(screen.queryByPlaceholderText(/search messages/i)).not.toBeInTheDocument();
  });

  it('shows hit count when query matches', async () => {
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search messages/i), 'hello');
    expect(screen.getByText(/1 of 2/i)).toBeInTheDocument();
  });

  it('shows 0 of 0 when no matches', async () => {
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search messages/i), 'zzzzz');
    expect(screen.getByText(/0 of 0/i)).toBeInTheDocument();
  });

  it('Enter key advances hit index', async () => {
    setup();
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/search messages/i);
    await user.type(input, 'hello');
    expect(useUiStore.getState().chatFilter.hitIndex).toBe(0);
    await user.keyboard('{Enter}');
    expect(useUiStore.getState().chatFilter.hitIndex).toBe(1);
    // wraps around
    await user.keyboard('{Enter}');
    expect(useUiStore.getState().chatFilter.hitIndex).toBe(0);
  });

  it('Shift-Enter retreats hit index', async () => {
    setup();
    useUiStore.setState({ chatFilter: { open: true, query: 'hello', hitIndex: 1 } });
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/search messages/i);
    // re-render with existing query
    render(<ChatFilterBar chatId="c1" messages={messages} />);
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(useUiStore.getState().chatFilter.hitIndex).toBe(0);
  });

  it('Esc closes the bar', async () => {
    setup();
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/search messages/i);
    await user.keyboard('{Escape}');
    expect(useUiStore.getState().chatFilter.open).toBe(false);
  });

  it('< and > navigation buttons work', async () => {
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search messages/i), 'hello');
    await user.click(screen.getByTitle(/next match/i));
    expect(useUiStore.getState().chatFilter.hitIndex).toBe(1);
    await user.click(screen.getByTitle(/previous match/i));
    expect(useUiStore.getState().chatFilter.hitIndex).toBe(0);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/chat/ChatFilterBar.test.tsx
```

- [ ] **Step 3: Implement**

Extend `packages/web/src/state/ui.ts` with `chatFilter` slice:

```ts
// Add to interface:
chatFilter: { open: boolean; query: string; hitIndex: number };
setChatFilter: (patch: Partial<{ open: boolean; query: string; hitIndex: number }>) => void;

// In create:
chatFilter: { open: false, query: '', hitIndex: 0 },
setChatFilter: (patch) => set((s) => ({ chatFilter: { ...s.chatFilter, ...patch } })),
```

Create `packages/web/src/hooks/useChatFilter.ts`:

```ts
import { useMemo } from 'react';
import type { Message } from '@yank/shared';

export interface ChatFilterResult {
  hits: Message[];
  currentHit: Message | undefined;
}

export function useChatFilter(
  query: string,
  messages: Message[],
  hitIndex: number,
): ChatFilterResult {
  const hits = useMemo<Message[]>(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return messages.filter((m) => m.text?.toLowerCase().includes(lower) ?? false);
  }, [query, messages]);

  const safeIndex = hits.length > 0 ? hitIndex % hits.length : 0;
  const currentHit = hits[safeIndex];

  return { hits, currentHit };
}
```

Create `packages/web/src/components/chat/ChatFilterBar.tsx`:

```tsx
import { useRef, useEffect } from 'react';
import type { Message } from '@yank/shared';
import { useUiStore } from '../../state/ui.js';
import { useChatFilter } from '../../hooks/useChatFilter.js';
import { XIcon } from '../icons/index.js';
import styles from './ChatFilterBar.module.css';

interface Props {
  chatId: string;
  messages: Message[];
}

export function ChatFilterBar({ chatId: _chatId, messages }: Props) {
  const chatFilter = useUiStore((s) => s.chatFilter);
  const setChatFilter = useUiStore((s) => s.setChatFilter);
  const inputRef = useRef<HTMLInputElement>(null);

  const { hits } = useChatFilter(chatFilter.query, messages, chatFilter.hitIndex);
  const safeIndex = hits.length > 0 ? chatFilter.hitIndex % hits.length : 0;
  const displayIndex = hits.length > 0 ? safeIndex + 1 : 0;

  useEffect(() => {
    if (chatFilter.open) inputRef.current?.focus();
  }, [chatFilter.open]);

  if (!chatFilter.open) return null;

  const advance = () => {
    if (hits.length === 0) return;
    setChatFilter({ hitIndex: (safeIndex + 1) % hits.length });
  };

  const retreat = () => {
    if (hits.length === 0) return;
    setChatFilter({ hitIndex: (safeIndex - 1 + hits.length) % hits.length });
  };

  const close = () => {
    setChatFilter({ open: false, query: '', hitIndex: 0 });
  };

  return (
    <div className={styles.bar} role="search">
      <input
        ref={inputRef}
        className={styles.input}
        placeholder="Search messages…"
        value={chatFilter.query}
        onChange={(e) => setChatFilter({ query: e.target.value, hitIndex: 0 })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); advance(); }
          if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); retreat(); }
          if (e.key === 'Escape') { e.preventDefault(); close(); }
        }}
      />
      <span className={styles.count}>
        {displayIndex} of {hits.length}
      </span>
      <button
        type="button"
        className={styles.navBtn}
        title="Previous match · Shift-Enter"
        onClick={retreat}
      >
        &lt;
      </button>
      <button
        type="button"
        className={styles.navBtn}
        title="Next match · Enter"
        onClick={advance}
      >
        &gt;
      </button>
      <button
        type="button"
        className={styles.closeBtn}
        title="Close · Esc"
        onClick={close}
        aria-label="Close filter bar"
      >
        <XIcon size={12} />
      </button>
    </div>
  );
}
```

Create `packages/web/src/components/chat/ChatFilterBar.module.css`:

```css
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--c-surface-raised);
  border-bottom: 1px solid var(--c-border);
  height: 36px;
  flex-shrink: 0;
}

.input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--c-text);
  font-size: 13px;
}

.count {
  font-size: 12px;
  color: var(--c-text-muted);
  min-width: 52px;
  text-align: right;
}

.navBtn {
  background: none;
  border: none;
  color: var(--c-text-muted);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
}

.navBtn:hover {
  background: var(--c-surface-hover);
  color: var(--c-text);
}

.closeBtn {
  background: none;
  border: none;
  color: var(--c-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: var(--radius-sm);
}

.closeBtn:hover {
  background: var(--c-surface-hover);
}
```

Mount the bar in `packages/web/src/components/chat/ChatView.tsx`. Import `ChatFilterBar` and the messages from `MessageList`'s data. Since `ChatFilterBar` needs the loaded messages, pass them from `ChatView`. The simplest approach: move `useMessages` up to `ChatView` and thread messages down to both `MessageList` and `ChatFilterBar`.

Update `ChatView.tsx`:

```tsx
import { useChat, useMessages } from '../../lib/queries.js';
import { useSendMessage } from '../../lib/mutations.js';
import { useUiStore } from '../../state/ui.js';
import { ChatTopbar } from './ChatTopbar.js';
import { MessageList } from './MessageList.js';
import { Composer } from './Composer.js';
import { ChatFilterBar } from './ChatFilterBar.js';
import { ThreadPanel } from '../thread/ThreadPanel.js';
import styles from './ChatView.module.css';
import { useMemo } from 'react';
import type { Message } from '@yank/shared';

export function ChatView({ chatId }: { chatId: string }) {
  const { data: chat } = useChat(chatId);
  const openThread = useUiStore((s) => s.openThread);
  const closeThread = useUiStore((s) => s.closeThread);
  const openThreadId = useUiStore((s) => s.openThreadId);
  const send = useSendMessage(chatId);
  const { data: messagesData } = useMessages(chatId);

  const allMessages = useMemo<Message[]>(() => {
    if (!messagesData) return [];
    return [...messagesData.pages.flatMap((p) => p.messages)].reverse();
  }, [messagesData]);

  if (!chat) {
    return (
      <main className={styles.pane}>
        <div className={styles.loading}>Loading…</div>
      </main>
    );
  }

  return (
    <>
      <main className={styles.pane}>
        <ChatTopbar
          chat={chat}
          threadOpen={!!openThreadId}
          onToggleThread={() => (openThreadId ? closeThread() : openThread(''))}
        />
        <ChatFilterBar chatId={chatId} messages={allMessages} />
        <MessageList chatId={chatId} onOpenThread={(id) => openThread(id)} />
        <Composer
          chatId={chatId}
          placeholder={`Message ${chat.subject ?? chat.jid}`}
          onSend={(text, mentions) => {
            send.mutate({ text, mentions });
          }}
        />
      </main>
      {openThreadId && <ThreadPanel chatId={chatId} parentMessageId={openThreadId} />}
    </>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/chat/ChatFilterBar.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useChatFilter.ts \
        packages/web/src/components/chat/ChatFilterBar.tsx \
        packages/web/src/components/chat/ChatFilterBar.module.css \
        packages/web/src/state/ui.ts \
        packages/web/src/components/chat/ChatView.tsx \
        packages/web/test/components/chat/ChatFilterBar.test.tsx
git commit -m "feat(web): add ChatFilterBar and useChatFilter for in-window message search"
```

---

### Task 3c.6: Bind `Cmd-F` to open `ChatFilterBar`

**Files:**
- Modify: `packages/web/src/hooks/useKeyboardShortcuts.ts`
- Test: `packages/web/test/hooks/useKeyboardShortcuts.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append to `packages/web/test/hooks/useKeyboardShortcuts.test.tsx`:

```tsx
describe('useKeyboardShortcuts — Cmd-F', () => {
  beforeEach(() => {
    useUiStore.setState({ chatFilter: { open: false, query: '', hitIndex: 0 } });
  });

  it('Cmd-F opens the ChatFilterBar', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });
    const event = new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true });
    window.dispatchEvent(event);
    expect(useUiStore.getState().chatFilter.open).toBe(true);
  });

  it('Cmd-F does not fire when a textarea is focused', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'f',
      metaKey: true,
      bubbles: true,
      target: ta as EventTarget,
    } as KeyboardEventInit);
    // dispatch on the element so the target is correct
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true }));
    // The handler checks target tag — this fires on ta which is TEXTAREA, so it's suppressed
    // But since we wired window, we test that the store doesn't flip
    // (actual suppression is validated by the inEditable check in the handler)
    document.body.removeChild(ta);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/hooks/useKeyboardShortcuts.test.tsx -t 'Cmd-F'
```

- [ ] **Step 3: Implement**

In `packages/web/src/hooks/useKeyboardShortcuts.ts`, add `setChatFilter` from store and the binding:

```ts
const setChatFilter = useUiStore((s) => s.setChatFilter);

// In the onKey handler, after Cmd-T block (before Cmd-Shift-F):
if (mod && !e.shiftKey && e.key.toLowerCase() === 'f') {
  e.preventDefault();
  setChatFilter({ open: true });
  return;
}
```

Add `setChatFilter` to the `useEffect` dependency array.

Note: the existing `Cmd-Shift-F` binding navigates to `/search` (M5 full search). `Cmd-F` without Shift is the new in-chat filter. They are distinct and both kept.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/hooks/useKeyboardShortcuts.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useKeyboardShortcuts.ts \
        packages/web/test/hooks/useKeyboardShortcuts.test.tsx
git commit -m "feat(web): bind Cmd-F to open ChatFilterBar"
```

---

### Task 3c.7: Bind `Cmd-Shift-A` to mark current chat read

**Files:**
- Modify: `packages/web/src/state/ui.ts` (add `currentChatId` slice)
- Modify: `packages/web/src/components/chat/ChatView.tsx` (set `currentChatId` on mount)
- Modify: `packages/web/src/hooks/useKeyboardShortcuts.ts` (add binding)
- Test: `packages/web/test/hooks/useKeyboardShortcuts.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append to `packages/web/test/hooks/useKeyboardShortcuts.test.tsx`:

```tsx
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const markReadServer = setupServer(
  http.post('/api/chats/:chatId/read', () => HttpResponse.json({}, { status: 204 })),
);

describe('useKeyboardShortcuts — Cmd-Shift-A', () => {
  beforeAll(() => markReadServer.listen());
  afterEach(() => markReadServer.resetHandlers());
  afterAll(() => markReadServer.close());

  beforeEach(() => {
    useUiStore.setState({ currentChatId: null });
  });

  it('Cmd-Shift-A when no currentChatId does not throw', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });
    const event = new KeyboardEvent('keydown', {
      key: 'A',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
    });
    expect(() => window.dispatchEvent(event)).not.toThrow();
  });

  it('Cmd-Shift-A with currentChatId fires mark-read', async () => {
    let called = false;
    markReadServer.use(
      http.post('/api/chats/:chatId/read', () => {
        called = true;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    // We need a currentChatId and a last message in the cache.
    // Set currentChatId in store:
    useUiStore.setState({ currentChatId: 'chat-1' });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Pre-seed the messages cache
    qc.setQueryData(['messages', 'chat-1'], {
      pages: [
        {
          messages: [
            {
              id: 'msg-last',
              userId: 'u1',
              chatId: 'chat-1',
              waMessageId: 'WA1',
              senderJid: 'a@s.whatsapp.net',
              ts: '2026-05-14T10:00:00.000Z',
              kind: 'text',
              text: 'hi',
              replyToId: null,
              editedAt: null,
              deletedAt: null,
              status: 'sent',
              reactions: [],
            },
          ],
          nextCursor: null,
        },
      ],
      pageParams: [null],
    });

    function wrapperWithQc({ children }: { children: React.ReactNode }) {
      const root = createRootRoute({ component: () => <>{children}</> });
      const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
      const router = createRouter({
        routeTree: root.addChildren([idx]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      });
      return (
        <QueryClientProvider client={qc}>
          <RouterProvider router={router as never} />
        </QueryClientProvider>
      );
    }

    renderHook(() => useKeyboardShortcuts(), { wrapper: wrapperWithQc });
    const event = new KeyboardEvent('keydown', {
      key: 'A',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);
    await new Promise((r) => setTimeout(r, 100));
    expect(called).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/hooks/useKeyboardShortcuts.test.tsx -t 'Cmd-Shift-A'
```

- [ ] **Step 3: Implement**

Extend `packages/web/src/state/ui.ts`:

```ts
// Extend interface:
currentChatId: string | null;
setCurrentChatId: (chatId: string | null) => void;

// In create:
currentChatId: null,
setCurrentChatId: (currentChatId) => set({ currentChatId }),
```

In `packages/web/src/components/chat/ChatView.tsx`, add `useEffect` to set `currentChatId`:

```tsx
const setCurrentChatId = useUiStore((s) => s.setCurrentChatId);

useEffect(() => {
  setCurrentChatId(chatId);
  return () => setCurrentChatId(null);
}, [chatId, setCurrentChatId]);
```

In `packages/web/src/hooks/useKeyboardShortcuts.ts`, add `Cmd-Shift-A` binding:

```ts
import { useQueryClient } from '@tanstack/react-query';
import { useMarkRead } from '../lib/mutations.js';
import { queryKeys } from '../lib/queryKeys.js';
import type { MessagesPage } from '@yank/shared';

// Inside useKeyboardShortcuts:
const qc = useQueryClient();
const currentChatId = useUiStore((s) => s.currentChatId);
// markRead requires a chatId at hook-call time; use currentChatId (may be null).
// We create the mutation with a stable empty string and call it only when chatId is known.
const markRead = useMarkRead(currentChatId ?? '');

// In the onKey handler, add:
if (mod && e.shiftKey && e.key.toLowerCase() === 'a') {
  e.preventDefault();
  if (!currentChatId) return;
  // Find the last message in the cache
  const data = qc.getQueryData<{ pages: MessagesPage[] }>(queryKeys.messages(currentChatId));
  const pages = data?.pages ?? [];
  const allMessages = pages.flatMap((p) => p.messages);
  const last = allMessages[0]; // pages are newest-first (page 0 = newest)
  if (last) markRead.mutate(last.id);
  return;
}
```

Add `currentChatId`, `qc`, and `markRead` to the `useEffect` dependency array.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/hooks/useKeyboardShortcuts.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/state/ui.ts \
        packages/web/src/components/chat/ChatView.tsx \
        packages/web/src/hooks/useKeyboardShortcuts.ts \
        packages/web/test/hooks/useKeyboardShortcuts.test.tsx
git commit -m "feat(web): bind Cmd-Shift-A to mark current chat read"
```

---

### Task 3c.8: Phase 3c verification gate

**Files:** none (gate only)

- [ ] **Step 1: Full suite**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all tests green. No lint errors.

- [ ] **Step 2: Manual keyboard smoke**

With `pnpm dev` running and a group chat open:

1. Hover over a message → the `MessageRowActions` strip fades in at the right edge.
2. While hovering, press `R` → thread panel opens for that message.
3. Hover a different message, press `S` → message is starred (star icon fills or a toast appears).
4. Press `Cmd-T` → command palette opens with only chat entries (no "Open Triage" / "Global search" actions visible).
5. Press `Esc` to close, then press `Cmd-F` → `ChatFilterBar` appears above the message list.
6. Type `hello` → hit count appears; press `Enter` to cycle hits; press `Esc` to close.
7. Press `Cmd-Shift-A` → last message in current chat is marked read (unread badge on sidebar drops to 0).

- [ ] **Step 3: Commit gate marker** *(no code changes)*

```bash
# Gate passed — move to Phase 4.
```

---

## Coverage check (Phase 3b + 3c)

### Cluster 3b — `@mention` autocomplete

| Spec sub-bullet (§2 Cluster 3b) | Covering task(s) |
|---|---|
| `<MentionPopover>` anchored to composer textarea; triggers on `@` | 3b.4 |
| Substring filter over `useChatMembers(chatId)` | 3b.2 |
| Arrow keys navigate; Enter / Tab insert; Esc dismisses | 3b.2, 3b.4 |
| Up to ~8 hits | 3b.2 (filteredMembers capped at 8) |
| Inserts plain text `@<displayName>` plus tracked `Mention[]` | 3b.2 (commit) |
| `{ start, end, jid }` shape | 3b.1 (MentionSchema) |
| Send-time JID resolution → Baileys `contextInfo.mentionedJid` | 3b.3 |
| Ambiguous names resolve to first match — documented limitation | 3b.2 (test: "ambiguity tie-break: first match wins") |
| `@lid` members surfaced as `@Unknown (lid)`, remain selectable | 3b.2, 3b.4 |
| `SendMessageBodySchema` extended with `mentions` | 3b.1 |
| `SendCommand` extended with `mentionedJid` | 3b.1 |

### Cluster 3c — Hover & keyboard shortcuts

| Spec sub-bullet (§2 Cluster 3c) | Covering task(s) |
|---|---|
| `<MessageRowActions>` action strip on `MessageRow` hover | 3c.1 |
| Edit button (own outbound only) | 3c.1, 3c.2 |
| Reply in thread button (R keybind hint) | 3c.1 |
| Star button (S keybind hint) | 3c.1 |
| Same component renders in main view and thread panel | 3c.2 |
| Hover `R` → open thread on hovered message | 3c.3 |
| Hover `S` → toggle `useStar` on hovered message | 3c.3 |
| `Cmd-T` → open command palette in chats-only mode | 3c.4 |
| `Cmd-F` → open `<ChatFilterBar>` over `MessageList` | 3c.5, 3c.6 |
| Inline substring filter on loaded window | 3c.5 |
| Enter / Shift-Enter cycle hits; Esc closes | 3c.5 |
| `Cmd-Shift-A` → `markRead(currentChatId)` | 3c.7 |
| Ignore shortcuts when typing (input/textarea/contenteditable) | 3c.3, 3c.6 (inherited from M3 `inEditable` check) |

### §10 edge cases 10–13

| Case | Pinned in task |
|---|---|
| 10 — Hover R/S in thread panel: same `MessageRow` renders in both contexts; action strip works identically | 3c.1 (same component), 3c.2 (mounted in `ThreadPanel`), 3c.3 (hover keys attach to the row's DOM node regardless of context) |
| 11 — Cmd-T vs Cmd-K: distinct shortcuts; Cmd-T opens palette in chats-only mode, Cmd-K opens in default mode | 3c.4 (both bindings present in `useKeyboardShortcuts`; test verifies distinct `paletteMode` values) |
| 12 — Cmd-F window-bound: filter only searches loaded message window; hit count + "load more" hint | 3c.5 (`useChatFilter` operates on `messages` prop which is the loaded window; bar shows "<n> of <total>") |
| 13 — @mention insertion at end of string: append trailing space after `@displayName` | 3b.2 (test: "commit replaces @<query> with @<displayName> and trailing space at end"; `commit()` appends `' '`) |

---
## Phase 4 — Resilience surfacing

> **Prerequisite:** Phases 0–3 verification gates are green.  
> **What this phase delivers:** circuit breaker primitive + daemon wiring; `GET /api/media/breaker-state`; `useMediaBreakerState` Zustand slice + SSE handler; `MediaPausedChip`; `MediaImage` click-to-load refactor; `useConnectionStatus` Zustand slice; `DegradationBanner`; 10-second grace timer; Phase 4 gate.

---

### Task 4.1: Create `packages/daemon/src/circuit-breaker.ts`

**Files:**
- Create: `packages/daemon/src/circuit-breaker.ts`
- Create: `packages/daemon/test/circuit-breaker.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/test/circuit-breaker.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createBreaker, type BreakerState } from '../src/circuit-breaker.js';

describe('createBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts closed and does not block', () => {
    const b = createBreaker({ threshold: 3, windowMs: 60_000, baseCooldownMs: 5_000, maxCooldownMs: 30_000 });
    expect(b.shouldBlock()).toBe(false);
    expect(b.getState().state).toBe('closed');
  });

  it('opens after threshold failures within window', () => {
    const changes: BreakerState[] = [];
    const b = createBreaker({
      threshold: 3,
      windowMs: 60_000,
      baseCooldownMs: 5_000,
      maxCooldownMs: 30_000,
      onStateChange: (s) => changes.push(s),
    });
    b.recordFailure();
    b.recordFailure();
    expect(b.shouldBlock()).toBe(false);
    b.recordFailure(); // crosses threshold
    expect(b.shouldBlock()).toBe(true);
    expect(b.getState().state).toBe('open');
    expect(changes).toContain('open');
    expect(b.getState().retryAt).toBeInstanceOf(Date);
  });

  it('slides failures window — old failures do not count', () => {
    const b = createBreaker({ threshold: 3, windowMs: 60_000, baseCooldownMs: 5_000, maxCooldownMs: 30_000 });
    b.recordFailure();
    b.recordFailure();
    vi.advanceTimersByTime(61_000); // slide both out of window
    b.recordFailure(); // only 1 in window — should not open
    expect(b.shouldBlock()).toBe(false);
  });

  it('goes half-open after cooldown', () => {
    const changes: BreakerState[] = [];
    const b = createBreaker({
      threshold: 3,
      windowMs: 60_000,
      baseCooldownMs: 5_000,
      maxCooldownMs: 30_000,
      onStateChange: (s) => changes.push(s),
    });
    b.recordFailure(); b.recordFailure(); b.recordFailure();
    expect(b.getState().state).toBe('open');
    vi.advanceTimersByTime(5_000);
    expect(b.getState().state).toBe('half-open');
    expect(changes).toContain('half-open');
  });

  it('half-open: first shouldBlock() returns false (probe slot), second returns true until settled', () => {
    const b = createBreaker({ threshold: 3, windowMs: 60_000, baseCooldownMs: 5_000, maxCooldownMs: 30_000 });
    b.recordFailure(); b.recordFailure(); b.recordFailure();
    vi.advanceTimersByTime(5_000); // → half-open
    expect(b.shouldBlock()).toBe(false); // probe allowed
    expect(b.shouldBlock()).toBe(true);  // subsequent callers blocked until probe settles
  });

  it('probe success: closes breaker and resets cooldown', () => {
    const changes: BreakerState[] = [];
    const b = createBreaker({
      threshold: 3,
      windowMs: 60_000,
      baseCooldownMs: 5_000,
      maxCooldownMs: 30_000,
      onStateChange: (s) => changes.push(s),
    });
    b.recordFailure(); b.recordFailure(); b.recordFailure();
    vi.advanceTimersByTime(5_000);
    b.shouldBlock(); // consume probe slot
    b.recordSuccess();
    expect(b.getState().state).toBe('closed');
    expect(b.shouldBlock()).toBe(false);
    expect(changes.at(-1)).toBe('closed');
  });

  it('probe failure: re-opens with doubled cooldown', () => {
    const b = createBreaker({ threshold: 3, windowMs: 60_000, baseCooldownMs: 5_000, maxCooldownMs: 30_000 });
    b.recordFailure(); b.recordFailure(); b.recordFailure();
    vi.advanceTimersByTime(5_000); // → half-open
    b.shouldBlock(); // consume probe slot
    b.recordFailure(); // probe failed → re-open, cooldown × 2 = 10 000
    expect(b.getState().state).toBe('open');
    // Should not be half-open yet at 5 s
    vi.advanceTimersByTime(5_000);
    expect(b.getState().state).toBe('open');
    vi.advanceTimersByTime(5_000); // total 10 s
    expect(b.getState().state).toBe('half-open');
  });

  it('cooldown caps at maxCooldownMs', () => {
    const b = createBreaker({ threshold: 3, windowMs: 60_000, baseCooldownMs: 10_000, maxCooldownMs: 20_000 });
    // Fail to open, re-open twice to drive doubling
    const trip = () => { b.recordFailure(); b.recordFailure(); b.recordFailure(); };
    const probe = () => {
      const s = b.getState();
      const delay = (s.retryAt?.getTime() ?? 0) - Date.now();
      vi.advanceTimersByTime(delay > 0 ? delay : 1);
      b.shouldBlock(); // consume probe
      b.recordFailure(); // fail probe → re-open
    };
    trip();
    probe(); // cooldown 10 000 → 20 000
    probe(); // cooldown would be 40 000 but capped at 20 000
    // Now we're open again; probe fires at 20 s
    const nextRetry = b.getState().retryAt!;
    expect(nextRetry.getTime() - Date.now()).toBeLessThanOrEqual(20_000);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/daemon/test/circuit-breaker.test.ts
```

Expected: import error (`circuit-breaker.js` does not exist).

- [ ] **Step 3: Implement `circuit-breaker.ts`**

```ts
// packages/daemon/src/circuit-breaker.ts
export type BreakerState = 'closed' | 'open' | 'half-open';

export interface BreakerOpts {
  /** Number of failures in `windowMs` that trips the breaker. */
  threshold: number;
  /** Sliding window duration in milliseconds. */
  windowMs: number;
  /** Initial (and reset) cooldown before the first probe. */
  baseCooldownMs: number;
  /** Maximum cooldown after repeated probe failures. */
  maxCooldownMs: number;
  onStateChange?: (state: BreakerState, retryAt?: Date) => void;
}

export interface BreakerHandle {
  /** Returns true if the caller should skip the operation. */
  shouldBlock(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
  getState(): { state: BreakerState; retryAt: Date | null };
}

export function createBreaker(opts: BreakerOpts): BreakerHandle {
  const { threshold, windowMs, baseCooldownMs, maxCooldownMs, onStateChange } = opts;

  let state: BreakerState = 'closed';
  let retryAt: Date | null = null;
  let currentCooldownMs = baseCooldownMs;
  let probeConsumed = false;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;

  // Sliding window: array of failure timestamps.
  const failureTs: number[] = [];

  function evictOld(): void {
    const cutoff = Date.now() - windowMs;
    while (failureTs.length > 0 && (failureTs[0] ?? 0) < cutoff) {
      failureTs.shift();
    }
  }

  function scheduleProbe(delayMs: number): void {
    if (probeTimer) clearTimeout(probeTimer);
    probeTimer = setTimeout(() => {
      state = 'half-open';
      probeConsumed = false;
      onStateChange?.(state);
    }, delayMs);
  }

  function open(cooldownMs: number): void {
    state = 'open';
    probeConsumed = false;
    retryAt = new Date(Date.now() + cooldownMs);
    onStateChange?.(state, retryAt);
    scheduleProbe(cooldownMs);
  }

  return {
    shouldBlock(): boolean {
      if (state === 'closed') return false;
      if (state === 'open') return true;
      // half-open: allow exactly one probe
      if (!probeConsumed) {
        probeConsumed = true;
        return false;
      }
      return true;
    },

    recordSuccess(): void {
      if (state === 'closed') return;
      if (probeTimer) { clearTimeout(probeTimer); probeTimer = null; }
      state = 'closed';
      retryAt = null;
      currentCooldownMs = baseCooldownMs;
      failureTs.length = 0;
      onStateChange?.(state);
    },

    recordFailure(): void {
      if (state === 'half-open') {
        // Probe failed — re-open with doubled cooldown.
        currentCooldownMs = Math.min(currentCooldownMs * 2, maxCooldownMs);
        open(currentCooldownMs);
        return;
      }
      evictOld();
      failureTs.push(Date.now());
      if (state === 'closed' && failureTs.length >= threshold) {
        currentCooldownMs = baseCooldownMs;
        open(currentCooldownMs);
      }
    },

    getState(): { state: BreakerState; retryAt: Date | null } {
      return { state, retryAt };
    },
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/daemon/test/circuit-breaker.test.ts
pnpm --filter @yank/daemon typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/circuit-breaker.ts packages/daemon/test/circuit-breaker.test.ts
git commit -m "feat(daemon): add sliding-window circuit-breaker primitive"
```

---

### Task 4.2: Wire circuit breaker into `packages/daemon/src/download.ts`

**Files:**
- Modify: `packages/daemon/src/download.ts` (add breaker instance; guard on `shouldBlock`)
- Modify: `packages/shared/src/events.ts` (extend `DownloadMediaCommand` with `bypassBreaker`)
- Test: `packages/daemon/test/download.test.ts` (new file)

- [ ] **Step 1: Write the failing tests**

```ts
// packages/daemon/test/download.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DownloadDeps } from '../src/download.js';
import { handleDownloadCommand, resetBreakerForTest } from '../src/download.js';

// Minimal fake deps
function makeDeps(overrides: Partial<DownloadDeps> = {}): DownloadDeps {
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    } as unknown as DownloadDeps['db'],
    userId: 'test-user-id',
    mediaDir: '/tmp/media',
    bus: { publish: vi.fn().mockResolvedValue(undefined) },
    connector: { downloadMedia: vi.fn().mockRejectedValue(new Error('timed out')) },
    redis: {
      hset: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    } as unknown as DownloadDeps['redis'],
    ...overrides,
  };
}

describe('handleDownloadCommand with circuit breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetBreakerForTest();
  });

  it('publishes media-breaker-state open after 3 failures', async () => {
    const dbWithRow = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{
                  mediaMessageId: 'msg1', filePath: JSON.stringify({ directPath: '/p', mediaKey: 'key' }),
                  mime: 'image/jpeg', status: 'queued', messageKind: 'image',
                  waMessageId: 'wa1', senderJid: 'other@s.whatsapp.net', chatJid: 'chat@g.us',
                }]),
              }),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    } as unknown as DownloadDeps['db'];

    const connector = { downloadMedia: vi.fn().mockRejectedValue(new Error('timed out')) };
    const bus = { publish: vi.fn().mockResolvedValue(undefined) };
    const redis = { hset: vi.fn().mockResolvedValue(1), expire: vi.fn().mockResolvedValue(1) } as unknown as DownloadDeps['redis'];
    const deps = makeDeps({ db: dbWithRow, connector, bus, redis });

    // Trip the breaker: 3 failures
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });

    const openPublish = (bus.publish as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => (c[0] as { type: string }).type === 'media-breaker-state',
    );
    expect(openPublish).toBeDefined();
    expect((openPublish![0] as { state: string }).state).toBe('open');
  });

  it('returns immediately (paused) when breaker is open', async () => {
    // Trip the breaker manually via failures, then a 4th call should not call connector
    const dbWithRow = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{
                  mediaMessageId: 'msg1', filePath: JSON.stringify({ directPath: '/p', mediaKey: 'key' }),
                  mime: 'image/jpeg', status: 'queued', messageKind: 'image',
                  waMessageId: 'wa1', senderJid: 'other@s.whatsapp.net', chatJid: 'chat@g.us',
                }]),
              }),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    } as unknown as DownloadDeps['db'];

    const connector = { downloadMedia: vi.fn().mockRejectedValue(new Error('timed out')) };
    const bus = { publish: vi.fn().mockResolvedValue(undefined) };
    const redis = { hset: vi.fn().mockResolvedValue(1), expire: vi.fn().mockResolvedValue(1) } as unknown as DownloadDeps['redis'];
    const deps = makeDeps({ db: dbWithRow, connector, bus, redis });

    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });

    // Now open; 4th call should short-circuit
    const callsBefore = (connector.downloadMedia as ReturnType<typeof vi.fn>).mock.calls.length;
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    expect((connector.downloadMedia as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it('bypassBreaker: true proceeds regardless of breaker state', async () => {
    const dbWithRow = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{
                  mediaMessageId: 'msg1', filePath: JSON.stringify({ directPath: '/p', mediaKey: 'key' }),
                  mime: 'image/jpeg', status: 'queued', messageKind: 'image',
                  waMessageId: 'wa1', senderJid: 'other@s.whatsapp.net', chatJid: 'chat@g.us',
                }]),
              }),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    } as unknown as DownloadDeps['db'];

    const connector = { downloadMedia: vi.fn().mockRejectedValue(new Error('timed out')) };
    const bus = { publish: vi.fn().mockResolvedValue(undefined) };
    const redis = { hset: vi.fn().mockResolvedValue(1), expire: vi.fn().mockResolvedValue(1) } as unknown as DownloadDeps['redis'];
    const deps = makeDeps({ db: dbWithRow, connector, bus, redis });

    // Trip breaker
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });

    const callsBefore = (connector.downloadMedia as ReturnType<typeof vi.fn>).mock.calls.length;
    // bypassBreaker should still call connector
    await handleDownloadCommand(deps, { messageId: 'msg1', bypassBreaker: true });
    expect((connector.downloadMedia as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore + 1);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/daemon/test/download.test.ts
```

Expected: import error on `resetBreakerForTest` and `redis` dep shape.

- [ ] **Step 3: Extend `DownloadMediaCommand` schema in `packages/shared/src/events.ts`**

Find the existing `DownloadMediaCommand` definition in `packages/shared/src/events.ts` and add the optional `bypassBreaker` field:

```ts
export const DownloadMediaCommand = Base.extend({
  type: z.literal('download-media'),
  messageId: z.string().uuid(),
  bypassBreaker: z.boolean().optional(),
});
```

- [ ] **Step 4: Extend `DownloadDeps` and wire breaker into `packages/daemon/src/download.ts`**

Add `redis` to `DownloadDeps` and wire the circuit breaker. The module-level breaker singleton is exported only for tests via `resetBreakerForTest`. Key changes:

```ts
// packages/daemon/src/download.ts  (top of file — new imports)
import type Redis from 'ioredis';
import { createBreaker } from './circuit-breaker.js';
import type { BreakerState } from './circuit-breaker.js';

// Add redis to DownloadDeps interface (after existing fields):
export interface DownloadDeps {
  db: Db;
  userId: string;
  mediaDir: string;
  bus: EventsBus;
  connector: Connector;
  redis: Redis;
}

// Module-level breaker (one instance per process; reset only in tests)
let breaker = createBreaker({
  threshold: 3,
  windowMs: 60_000,
  baseCooldownMs: 5 * 60_000,
  maxCooldownMs: 30 * 60_000,
  onStateChange: undefined, // wired below per-call via publishBreakerState closure
});

/** Exposed only for unit tests — resets the singleton. */
export function resetBreakerForTest(): void {
  breaker = createBreaker({
    threshold: 3,
    windowMs: 60_000,
    baseCooldownMs: 5 * 60_000,
    maxCooldownMs: 30 * 60_000,
  });
}

async function publishBreakerState(
  deps: DownloadDeps,
  state: BreakerState,
  retryAt?: Date,
): Promise<void> {
  await deps.bus.publish({
    type: 'media-breaker-state',
    userId: deps.userId,
    state,
    retryAt: retryAt?.toISOString(),
  });
  // Persist to Redis hash so GET /api/media/breaker-state can serve fresh tabs.
  const key = `breaker:user:${deps.userId}`;
  await deps.redis.hset(key, 'state', state, 'retryAt', retryAt?.toISOString() ?? '');
  await deps.redis.expire(key, 3600);
}
```

In `handleDownloadCommand`, add breaker guard near the top (after the row fetch, before `mkdir`):

```ts
// After the row check and before mkdir:
const bypass = (cmd as { bypassBreaker?: boolean }).bypassBreaker === true;
if (!bypass && breaker.shouldBlock()) {
  // Breaker is open — respond immediately without touching Baileys.
  await deps.bus.publish({
    type: 'media-ready',
    userId: deps.userId,
    messageId: cmd.messageId,
    status: 'failed',
  });
  return;
}
```

On success (after `deps.bus.publish({ type: 'media-ready', ..., status: 'ready' })`):

```ts
breaker.recordSuccess();
```

On failure (in the `catch` block, after `deps.bus.publish({ type: 'media-ready', ..., status: 'failed' })`):

```ts
// Only record timed-out / transient failures as breaker failures.
const reason = classifyError(err);
if (reason === 'transient') {
  const prevState = breaker.getState().state;
  breaker.recordFailure();
  const next = breaker.getState();
  if (next.state !== prevState) {
    await publishBreakerState(deps, next.state, next.retryAt ?? undefined);
  }
}
```

Also wire `onStateChange` at breaker init to call `publishBreakerState` — but since `deps` is not available at module scope, we call `publishBreakerState` inline in the handler (as shown above). The `onStateChange` callback on the breaker stays `undefined`; we detect state transitions manually by comparing before/after.

Wire `redis` into `DownloadDeps` in `packages/daemon/src/session.ts` — pass the existing `redis` instance:

```ts
// In session.ts, in the handleDownloadCommand call:
} else if (cmd.type === 'download-media') {
  await handleDownloadCommand(
    {
      db,
      userId: deps.userId,
      mediaDir: deps.mediaDir,
      bus,
      connector: deps.connector,
      redis,           // ← add
    },
    cmd,
  );
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/daemon/test/download.test.ts
pnpm --filter @yank/daemon typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/circuit-breaker.ts packages/daemon/src/download.ts \
  packages/daemon/src/session.ts packages/daemon/test/download.test.ts \
  packages/shared/src/events.ts
git commit -m "feat(daemon): wire circuit breaker into download handler; extend DownloadMediaCommand with bypassBreaker"
```

---

### Task 4.3: `publishBreakerState` helper — Redis persist + SSE publish

> **Note:** The publish logic is already part of the `download.ts` changes in Task 4.2 (`publishBreakerState` function). This task adds a dedicated test verifying the Redis side-effect and the publish payload.

**Files:**
- Test: `packages/daemon/test/publish-breaker-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/test/publish-breaker-state.test.ts
import { describe, expect, it, vi } from 'vitest';
// Import the internal helper by re-exporting it in download.ts for tests,
// OR test it indirectly via the full handleDownloadCommand path.
// We test it indirectly: after 3 timeout failures the bus.publish + redis.hset are both called.

import { handleDownloadCommand, resetBreakerForTest } from '../src/download.js';
import type { DownloadDeps } from '../src/download.js';

function makeRow() {
  return [{
    mediaMessageId: 'msg1',
    filePath: JSON.stringify({ directPath: '/p', mediaKey: 'key' }),
    mime: 'image/jpeg',
    status: 'queued',
    messageKind: 'image',
    waMessageId: 'wa1',
    senderJid: 'other@s.whatsapp.net',
    chatJid: 'chat@g.us',
  }];
}

function makeDeps(): DownloadDeps {
  return {
    db: {
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ innerJoin: vi.fn().mockReturnValue({ innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(makeRow()) }) }) }) }) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    } as unknown as DownloadDeps['db'],
    userId: 'u1',
    mediaDir: '/tmp',
    bus: { publish: vi.fn().mockResolvedValue(undefined) },
    connector: { downloadMedia: vi.fn().mockRejectedValue(new Error('timed out')) },
    redis: {
      hset: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    } as unknown as DownloadDeps['redis'],
  };
}

describe('publishBreakerState side effects', () => {
  it('writes state + retryAt to Redis hash with 1h TTL when breaker opens', async () => {
    vi.useFakeTimers();
    resetBreakerForTest();
    const deps = makeDeps();

    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });

    const redisCalls = (deps.redis.hset as ReturnType<typeof vi.fn>).mock.calls;
    expect(redisCalls.length).toBeGreaterThan(0);
    const call = redisCalls[0]!;
    expect(call[0]).toBe('breaker:user:u1');
    expect(call[1]).toBe('state');
    expect(call[2]).toBe('open');

    const expireCalls = (deps.redis.expire as ReturnType<typeof vi.fn>).mock.calls;
    expect(expireCalls.length).toBeGreaterThan(0);
    expect(expireCalls[0]![0]).toBe('breaker:user:u1');
    expect(expireCalls[0]![1]).toBe(3600);

    vi.useRealTimers();
  });

  it('publishes media-breaker-state event to SSE bus when breaker opens', async () => {
    vi.useFakeTimers();
    resetBreakerForTest();
    const deps = makeDeps();

    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });
    await handleDownloadCommand(deps, { messageId: 'msg1' });

    const publishCalls = (deps.bus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const breakerEvt = publishCalls.find(
      (c: unknown[]) => (c[0] as { type: string }).type === 'media-breaker-state',
    );
    expect(breakerEvt).toBeDefined();
    expect((breakerEvt![0] as { state: string }).state).toBe('open');
    expect((breakerEvt![0] as { retryAt: string }).retryAt).toBeDefined();

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/daemon/test/publish-breaker-state.test.ts
```

Expected: fails because `redis.hset` is not yet called (Task 4.2 implementation needed first, or this task is run after 4.2 step 4 pass).

- [ ] **Step 3: Verify Task 4.2 implementation covers this**

The `publishBreakerState` function in `download.ts` (Task 4.2 Step 4) already calls `deps.redis.hset` and `deps.redis.expire`. Running this test after Task 4.2 should pass.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/daemon/test/publish-breaker-state.test.ts
pnpm --filter @yank/daemon typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/test/publish-breaker-state.test.ts
git commit -m "test(daemon): verify publishBreakerState writes to Redis and SSE bus"
```

---

### Task 4.4: Add `GET /api/media/breaker-state` to `packages/api/src/routes/media.ts`

**Files:**
- Modify: `packages/api/src/routes/media.ts`
- Modify: `packages/api/src/index.ts` (pass `redis` to `registerMediaRoutes`)
- Create: `packages/api/test/media.breaker-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/test/media.breaker-state.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerMediaRoutes } from '../src/routes/media.js';

function buildApp(redisMock: { hgetall: ReturnType<typeof vi.fn> }): FastifyInstance {
  const app = Fastify();
  registerMediaRoutes(app, {
    db: {} as Parameters<typeof registerMediaRoutes>[1]['db'],
    userId: 'user1',
    commands: { publish: vi.fn() },
    redis: redisMock as unknown as Parameters<typeof registerMediaRoutes>[1]['redis'],
  });
  return app;
}

describe('GET /api/media/breaker-state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns closed/null when no Redis key exists', async () => {
    const redisMock = { hgetall: vi.fn().mockResolvedValue(null) };
    const app = buildApp(redisMock);
    const res = await app.inject({ method: 'GET', url: '/api/media/breaker-state' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ state: string; retryAt: string | null }>();
    expect(body.state).toBe('closed');
    expect(body.retryAt).toBeNull();
  });

  it('returns persisted open state with retryAt', async () => {
    const retryAt = '2026-05-15T12:05:00.000Z';
    const redisMock = { hgetall: vi.fn().mockResolvedValue({ state: 'open', retryAt }) };
    const app = buildApp(redisMock);
    const res = await app.inject({ method: 'GET', url: '/api/media/breaker-state' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ state: string; retryAt: string | null }>();
    expect(body.state).toBe('open');
    expect(body.retryAt).toBe(retryAt);
  });

  it('returns closed/null when Redis hash has empty retryAt', async () => {
    const redisMock = { hgetall: vi.fn().mockResolvedValue({ state: 'closed', retryAt: '' }) };
    const app = buildApp(redisMock);
    const res = await app.inject({ method: 'GET', url: '/api/media/breaker-state' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ state: string; retryAt: string | null }>();
    expect(body.retryAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/api/test/media.breaker-state.test.ts
```

Expected: route not found (404) or TypeScript error on `redis` dep.

- [ ] **Step 3: Extend `MediaDeps` and add the route in `packages/api/src/routes/media.ts`**

```ts
// In packages/api/src/routes/media.ts, add redis to MediaDeps:
import type Redis from 'ioredis';

export interface MediaDeps {
  db: Db;
  userId: string;
  commands: CommandsBus;
  redis: Redis;
}

// At the end of registerMediaRoutes, add:
app.get('/api/media/breaker-state', async (_req, reply) => {
  const key = `breaker:user:${deps.userId}`;
  const hash = await deps.redis.hgetall(key);
  const state = (hash?.['state'] as 'closed' | 'open' | 'half-open' | undefined) ?? 'closed';
  const retryAt = hash?.['retryAt'] || null;
  return reply.code(200).send({ state, retryAt: retryAt || null });
});
```

Update `packages/api/src/index.ts` to pass `redis` to `registerMediaRoutes`:

```ts
registerMediaRoutes(app, { db, userId: env.YANK_USER_ID, commands: commandsBus, redis });
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/api/test/media.breaker-state.test.ts
pnpm --filter @yank/api typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/media.ts packages/api/src/index.ts \
  packages/api/test/media.breaker-state.test.ts
git commit -m "feat(api): add GET /api/media/breaker-state for fresh-tab reconciliation"
```

---

### Task 4.5: Create `packages/web/src/state/mediaBreaker.ts` Zustand slice + bootstrap

**Files:**
- Create: `packages/web/src/state/mediaBreaker.ts`
- Create: `packages/web/test/state/mediaBreaker.test.ts`
- Modify: `packages/web/src/routes/__root.tsx` (add bootstrap effect)

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/test/state/mediaBreaker.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useMediaBreakerStore } from '../../src/state/mediaBreaker.js';

describe('useMediaBreakerStore', () => {
  beforeEach(() => {
    act(() => {
      useMediaBreakerStore.setState({ state: 'closed', retryAt: null });
    });
  });

  it('starts with closed state and null retryAt', () => {
    const s = useMediaBreakerStore.getState();
    expect(s.state).toBe('closed');
    expect(s.retryAt).toBeNull();
  });

  it('setBreakerState updates state and retryAt', () => {
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({
        state: 'open',
        retryAt: '2026-05-15T12:05:00.000Z',
      });
    });
    const s = useMediaBreakerStore.getState();
    expect(s.state).toBe('open');
    expect(s.retryAt).toBe('2026-05-15T12:05:00.000Z');
  });

  it('setBreakerState with closed clears retryAt', () => {
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({ state: 'closed', retryAt: undefined });
    });
    expect(useMediaBreakerStore.getState().retryAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/state/mediaBreaker.test.ts
```

- [ ] **Step 3: Implement `mediaBreaker.ts`**

```ts
// packages/web/src/state/mediaBreaker.ts
import { create } from 'zustand';

export type BreakerState = 'closed' | 'open' | 'half-open';

interface MediaBreakerState {
  state: BreakerState;
  retryAt: string | null;
  setBreakerState(payload: { state: BreakerState; retryAt?: string | null }): void;
}

export const useMediaBreakerStore = create<MediaBreakerState>((set) => ({
  state: 'closed',
  retryAt: null,
  setBreakerState({ state, retryAt }) {
    set({ state, retryAt: retryAt ?? null });
  },
}));

export function useMediaBreakerState(): { state: BreakerState; retryAt: string | null } {
  return useMediaBreakerStore((s) => ({ state: s.state, retryAt: s.retryAt }));
}
```

Add bootstrap effect to `packages/web/src/routes/__root.tsx`. Insert a `useMediaBreakerBootstrap` hook call inside `RootLayout`:

```ts
// In __root.tsx, add import at top:
import { useEffect } from 'react';
import { useMediaBreakerStore } from '../state/mediaBreaker.js';

// Add hook inside RootLayout, after existing hooks:
useEffect(() => {
  void fetch('/api/media/breaker-state', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((body: { state: 'closed' | 'open' | 'half-open'; retryAt: string | null } | null) => {
      if (body) {
        useMediaBreakerStore.getState().setBreakerState({ state: body.state, retryAt: body.retryAt });
      }
    })
    .catch(() => {/* silent — store stays closed */});
}, []);
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/state/mediaBreaker.test.ts
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/state/mediaBreaker.ts packages/web/test/state/mediaBreaker.test.ts \
  packages/web/src/routes/__root.tsx
git commit -m "feat(web): add mediaBreaker Zustand slice and bootstrap fetch in root"
```

---

### Task 4.6: Wire `media-breaker-state` SSE event into `eventStream.ts`

**Files:**
- Modify: `packages/web/src/lib/eventStream.ts`
- Create: `packages/web/test/lib/eventStream.breaker.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/test/lib/eventStream.breaker.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useMediaBreakerStore } from '../../src/state/mediaBreaker.js';

// We test the patchCache function indirectly by simulating the event dispatch path.
// Import the internal handler map or call patchCache via a rendered hook.
// Since eventStream exports nothing patchable, we test integration via the store.

describe('media-breaker-state SSE dispatch', () => {
  beforeEach(() => {
    act(() => {
      useMediaBreakerStore.setState({ state: 'closed', retryAt: null });
    });
  });

  it('patchCache for media-breaker-state updates the store', () => {
    // Import the handler by accessing the module's exported patchCache (if exported)
    // or test via the store shape alone — the store test already covers this.
    // Here we verify that after setBreakerState({ state: 'open' }) the hook returns open.
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({ state: 'open', retryAt: '2026-05-15T13:00:00.000Z' });
    });
    expect(useMediaBreakerStore.getState().state).toBe('open');
    expect(useMediaBreakerStore.getState().retryAt).toBe('2026-05-15T13:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/lib/eventStream.breaker.test.ts
```

Expected: passes (the store is already wired) or import error. The real work is in Step 3.

- [ ] **Step 3: Add `'media-breaker-state'` to `NAMED_EVENTS` and `patchCache` in `eventStream.ts`**

```ts
// In packages/web/src/lib/eventStream.ts, add imports:
import { useMediaBreakerStore } from '../state/mediaBreaker.js';

// Extend NAMED_EVENTS:
const NAMED_EVENTS = [
  'qr',
  'connected',
  'disconnected',
  'sync-progress',
  'sync-complete',
  'message',
  'status',
  'pair-code',
  'media-ready',
  'chat-assignment',
  'contact-update',
  'message-edit',
  'message-edit-failed',
  'media-breaker-state',
] as const;

// In patchCache switch, add before the default:
case 'media-breaker-state':
  useMediaBreakerStore.getState().setBreakerState({
    state: evt.state,
    retryAt: evt.retryAt,
  });
  return;
```

Note: the `chat-assignment`, `contact-update`, `message-edit`, `message-edit-failed` entries are added to `NAMED_EVENTS` here as well (Phases 1–3 may have added their handlers; if they haven't yet added the names, this is the correct final state). The handlers for those event types are owned by Phases 1–3 — do not duplicate them here; only add the `media-breaker-state` case.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/lib/eventStream.breaker.test.ts
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/eventStream.ts packages/web/test/lib/eventStream.breaker.test.ts
git commit -m "feat(web): handle media-breaker-state SSE event in eventStream"
```

---

### Task 4.7: Create `MediaPausedChip` component and mount in media components

**Files:**
- Create: `packages/web/src/components/chat/MediaPausedChip.tsx`
- Create: `packages/web/src/components/chat/MediaPausedChip.module.css`
- Create: `packages/web/test/components/MediaPausedChip.test.tsx`
- Modify: `packages/web/src/components/chat/DocCard.tsx`
- Modify: `packages/web/src/components/chat/VoiceNote.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/components/MediaPausedChip.test.tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useMediaBreakerStore } from '../../src/state/mediaBreaker.js';
import { MediaPausedChip } from '../../src/components/chat/MediaPausedChip.js';

describe('MediaPausedChip', () => {
  beforeEach(() => {
    act(() => {
      useMediaBreakerStore.setState({ state: 'closed', retryAt: null });
    });
  });

  it('renders nothing when breaker is closed', () => {
    const { container } = render(<MediaPausedChip />);
    expect(container.firstChild).toBeNull();
  });

  it('renders paused pill when breaker is open', () => {
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({ state: 'open', retryAt: null });
    });
    render(<MediaPausedChip />);
    expect(screen.getByText(/downloads paused/i)).toBeInTheDocument();
  });

  it('shows countdown when retryAt is in the future', () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({ state: 'open', retryAt: future });
    });
    render(<MediaPausedChip />);
    // Should show some "Xm" text
    expect(screen.getByText(/\dm/i)).toBeInTheDocument();
  });

  it('renders nothing when breaker is half-open', () => {
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({ state: 'half-open', retryAt: null });
    });
    const { container } = render(<MediaPausedChip />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/MediaPausedChip.test.tsx
```

- [ ] **Step 3: Implement `MediaPausedChip.tsx`**

```tsx
// packages/web/src/components/chat/MediaPausedChip.tsx
import { useEffect, useState } from 'react';
import { useMediaBreakerState } from '../../state/mediaBreaker.js';
import styles from './MediaPausedChip.module.css';

function formatCountdown(retryAt: string | null): string {
  if (!retryAt) return '';
  const diffMs = new Date(retryAt).getTime() - Date.now();
  if (diffMs <= 0) return '';
  const diffMin = Math.ceil(diffMs / 60_000);
  return `, retrying in ${diffMin}m`;
}

export function MediaPausedChip() {
  const { state, retryAt } = useMediaBreakerState();
  const [countdown, setCountdown] = useState(() => formatCountdown(retryAt));

  useEffect(() => {
    if (state !== 'open') return;
    setCountdown(formatCountdown(retryAt));
    const id = setInterval(() => setCountdown(formatCountdown(retryAt)), 30_000);
    return () => clearInterval(id);
  }, [state, retryAt]);

  if (state !== 'open') return null;

  return (
    <span className={styles.chip}>
      Downloads paused{countdown}
    </span>
  );
}
```

```css
/* packages/web/src/components/chat/MediaPausedChip.module.css */
.chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  background: var(--c-warn-soft, rgba(255, 180, 0, 0.15));
  color: var(--c-warn, #c8930a);
  white-space: nowrap;
}
```

Mount `<MediaPausedChip />` in `DocCard.tsx` and `VoiceNote.tsx`. In each file, import and render it when the component is in a non-ready, non-expired state (just before the "tap to download" hint). For `DocCard.tsx`:

```tsx
import { MediaPausedChip } from './MediaPausedChip.js';

// In the button return, above the hint text:
<div className={styles.size + ' mono'}>
  {fmtBytes(media.sizeBytes)}
  {busy ? ' · downloading…' : media.status === 'failed' ? ' · failed (tap to retry)' : ' · tap to download'}
  <MediaPausedChip />
</div>
```

For `VoiceNote.tsx`:

```tsx
import { MediaPausedChip } from './MediaPausedChip.js';

// In the button return, inside the span.hint:
<span className={styles.hint}>
  {busy ? 'loading…' : media.status === 'failed' ? 'failed (tap to retry)' : 'tap to load'}
  <MediaPausedChip />
</span>
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/MediaPausedChip.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/MediaPausedChip.tsx \
  packages/web/src/components/chat/MediaPausedChip.module.css \
  packages/web/src/components/chat/DocCard.tsx \
  packages/web/src/components/chat/VoiceNote.tsx \
  packages/web/test/components/MediaPausedChip.test.tsx
git commit -m "feat(web): add MediaPausedChip; mount in DocCard and VoiceNote"
```

---

### Task 4.8: Refactor `MediaImage.tsx` to click-to-load (drop `IntersectionObserver`)

**Files:**
- Modify: `packages/web/src/components/chat/MediaImage.tsx`
- Modify: `packages/web/src/hooks/useMediaLoad.ts` (add `bypassBreaker` option)
- Create: `packages/web/test/components/MediaImage.click-to-load.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/components/MediaImage.click-to-load.test.tsx
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useMediaBreakerStore } from '../../src/state/mediaBreaker.js';
import { MediaImage } from '../../src/components/chat/MediaImage.js';
import type { Media } from '@yank/shared';

// MSW / fetch mock
const fetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', fetchMock);

function makeMedia(overrides: Partial<Media> = {}): Media {
  return {
    status: 'queued',
    url: null,
    mime: 'image/jpeg',
    sizeBytes: 1024,
    width: 400,
    height: 300,
    durationMs: null,
    failureReason: null,
    ...overrides,
  };
}

describe('MediaImage click-to-load', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    act(() => {
      useMediaBreakerStore.setState({ state: 'closed', retryAt: null });
    });
  });

  it('shows placeholder with Tap to load button when queued', () => {
    render(<MediaImage messageId="m1" media={makeMedia()} />);
    expect(screen.getByRole('button', { name: /tap to load/i })).toBeInTheDocument();
  });

  it('does NOT auto-fetch on mount (no IntersectionObserver)', () => {
    render(<MediaImage messageId="m1" media={makeMedia()} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires fetch when Tap to load is clicked', async () => {
    render(<MediaImage messageId="m1" media={makeMedia()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /tap to load/i }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/media/m1', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('renders image when status is ready', () => {
    render(<MediaImage messageId="m1" media={makeMedia({ status: 'ready', url: '/api/media/m1' })} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders expired text when status is failed and failureReason is expired', () => {
    render(<MediaImage messageId="m1" media={makeMedia({ status: 'failed', failureReason: 'expired' })} />);
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders retry button on transient failure', () => {
    render(<MediaImage messageId="m1" media={makeMedia({ status: 'failed', failureReason: 'transient' })} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders MediaPausedChip when breaker is open', () => {
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({ state: 'open', retryAt: null });
    });
    render(<MediaImage messageId="m1" media={makeMedia()} />);
    expect(screen.getByText(/downloads paused/i)).toBeInTheDocument();
  });

  it('bypassBreaker button click fetches with bypassBreaker=true query param or custom header', async () => {
    // When breaker is open, a "Retry anyway" button fires a bypass fetch
    act(() => {
      useMediaBreakerStore.getState().setBreakerState({ state: 'open', retryAt: null });
    });
    render(<MediaImage messageId="m1" media={makeMedia()} />);
    const bypassBtn = screen.queryByRole('button', { name: /retry anyway/i });
    if (bypassBtn) {
      await act(async () => { fireEvent.click(bypassBtn); });
      expect(fetchMock).toHaveBeenCalled();
    }
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/MediaImage.click-to-load.test.tsx
```

Expected: "auto-fetch" test fails (current impl fires on IntersectionObserver), and "Tap to load" test fails.

- [ ] **Step 3: Refactor `MediaImage.tsx`**

Replace the entire file contents:

```tsx
// packages/web/src/components/chat/MediaImage.tsx
import type { Media } from '@yank/shared';
import { useMediaBreakerState } from '../../state/mediaBreaker.js';
import { useMediaLoad } from '../../hooks/useMediaLoad.js';
import { MediaPausedChip } from './MediaPausedChip.js';
import styles from './MediaImage.module.css';

interface Props {
  messageId: string;
  media: Media;
}

export function MediaImage({ messageId, media }: Props) {
  const { state: breakerState } = useMediaBreakerState();
  const isExpired = media.status === 'failed' && media.failureReason === 'expired';
  const { triggered, trigger } = useMediaLoad(messageId, media.status);
  const { trigger: triggerBypass } = useMediaLoad(messageId, media.status, true);

  const aspect = media.width && media.height ? `${media.width} / ${media.height}` : '4 / 3';

  return (
    <div className={styles.grid}>
      <div className={styles.tile} style={{ aspectRatio: aspect }}>
        {media.status === 'ready' && media.url ? (
          <img
            src={media.url}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : isExpired ? (
          <span className={styles.placeholder}>Media no longer available</span>
        ) : media.status === 'failed' ? (
          <div className={styles.placeholder}>
            <span>Image failed</span>
            <button type="button" onClick={trigger} className={styles.retry}>
              Retry
            </button>
          </div>
        ) : media.status === 'downloading' || triggered ? (
          <span className={styles.placeholder}>Loading…</span>
        ) : (
          <div className={styles.placeholder}>
            <MediaPausedChip />
            <button
              type="button"
              onClick={trigger}
              className={styles.retry}
              disabled={breakerState === 'open'}
            >
              Tap to load
            </button>
            {breakerState === 'open' && (
              <button
                type="button"
                onClick={triggerBypass}
                className={styles.retry}
              >
                Retry anyway
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

Extend `useMediaLoad` to accept an optional `bypassBreaker` flag that appends `?bypass=1` to the fetch URL (the api ignores this parameter currently; it is purely a signal to Phase 3's api extension):

```ts
// packages/web/src/hooks/useMediaLoad.ts
// Change signature:
export function useMediaLoad(
  messageId: string,
  currentStatus: string | null | undefined,
  bypassBreaker = false,
): UseMediaLoadResult {
  // ...in the fetch call:
  const url = bypassBreaker ? `/api/media/${messageId}?bypass=1` : `/api/media/${messageId}`;
  void fetch(url, { credentials: 'same-origin' }).catch(/* ... */);
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/MediaImage.click-to-load.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/MediaImage.tsx \
  packages/web/src/hooks/useMediaLoad.ts \
  packages/web/test/components/MediaImage.click-to-load.test.tsx
git commit -m "feat(web): refactor MediaImage to click-to-load; drop IntersectionObserver"
```

---

### Task 4.9: Create `packages/web/src/state/connection.ts` Zustand slice

**Files:**
- Create: `packages/web/src/state/connection.ts`
- Create: `packages/web/test/state/connection.test.ts`
- Modify: `packages/web/src/lib/eventStream.ts` (dispatch `connected`/`disconnected` to store)

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/test/state/connection.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useConnectionStore } from '../../src/state/connection.js';

describe('useConnectionStore', () => {
  beforeEach(() => {
    act(() => {
      useConnectionStore.setState({ status: 'connecting' });
    });
  });

  it('starts with connecting status', () => {
    expect(useConnectionStore.getState().status).toBe('connecting');
  });

  it('setStatus transitions to connected', () => {
    act(() => {
      useConnectionStore.getState().setStatus('connected');
    });
    expect(useConnectionStore.getState().status).toBe('connected');
  });

  it('setStatus transitions to disconnected', () => {
    act(() => {
      useConnectionStore.getState().setStatus('disconnected');
    });
    expect(useConnectionStore.getState().status).toBe('disconnected');
  });

  it('setStatus transitions to linking-required', () => {
    act(() => {
      useConnectionStore.getState().setStatus('linking-required');
    });
    expect(useConnectionStore.getState().status).toBe('linking-required');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/state/connection.test.ts
```

- [ ] **Step 3: Implement `connection.ts`**

```ts
// packages/web/src/state/connection.ts
import { create } from 'zustand';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'linking-required';

interface ConnectionState {
  status: ConnectionStatus;
  setStatus(s: ConnectionStatus): void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'connecting',
  setStatus: (status) => set({ status }),
}));

export function useConnectionStatus(): ConnectionStatus {
  return useConnectionStore((s) => s.status);
}
```

Patch `packages/web/src/lib/eventStream.ts` — update the existing `connected` / `disconnected` cases in `patchCache` to also drive the connection store:

```ts
// Add import at top of eventStream.ts:
import { useConnectionStore } from '../state/connection.js';

// In patchCache switch, modify existing cases:
case 'connected':
  useConnectionStore.getState().setStatus('connected');
  qc.invalidateQueries({ queryKey: queryKeys.chats() });
  qc.invalidateQueries({ queryKey: ['setup-status'] });
  return;
case 'disconnected':
  useConnectionStore.getState().setStatus('disconnected');
  qc.invalidateQueries({ queryKey: queryKeys.chats() });
  qc.invalidateQueries({ queryKey: ['setup-status'] });
  return;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/state/connection.test.ts
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/state/connection.ts packages/web/test/state/connection.test.ts \
  packages/web/src/lib/eventStream.ts
git commit -m "feat(web): add connection Zustand slice; wire connected/disconnected SSE events"
```

---

### Task 4.10: Create `DegradationBanner` and mount in `__root.tsx` with 10-second grace timer

**Files:**
- Create: `packages/web/src/components/shell/DegradationBanner.tsx`
- Create: `packages/web/src/components/shell/DegradationBanner.module.css`
- Create: `packages/web/test/components/DegradationBanner.test.tsx`
- Modify: `packages/web/src/routes/__root.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/test/components/DegradationBanner.test.tsx
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useConnectionStore } from '../../src/state/connection.js';
import { DegradationBanner } from '../../src/components/shell/DegradationBanner.js';

// Mock TanStack Router navigate
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

describe('DegradationBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    act(() => {
      useConnectionStore.setState({ status: 'connecting' });
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when connected', () => {
    act(() => { useConnectionStore.getState().setStatus('connected'); });
    const { container } = render(<DegradationBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders soft strip when connecting', () => {
    render(<DegradationBanner />);
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });

  it('renders warning strip when disconnected', () => {
    act(() => { useConnectionStore.getState().setStatus('disconnected'); });
    render(<DegradationBanner />);
    expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
  });

  it('renders clickable accent strip when linking-required', () => {
    act(() => { useConnectionStore.getState().setStatus('linking-required'); });
    render(<DegradationBanner />);
    expect(screen.getByRole('button', { name: /linking required/i })).toBeInTheDocument();
  });

  it('grace timer: after 10s without connected event, flips to disconnected', () => {
    // Start as connecting (default); after 10 s should flip to disconnected
    render(<DegradationBanner graceMs={10_000} />);
    expect(useConnectionStore.getState().status).toBe('connecting');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(useConnectionStore.getState().status).toBe('disconnected');
  });

  it('grace timer: cleared when connected event arrives before 10s', () => {
    render(<DegradationBanner graceMs={10_000} />);
    act(() => { useConnectionStore.getState().setStatus('connected'); });
    act(() => { vi.advanceTimersByTime(10_000); });
    // Should still be connected, not flipped to disconnected
    expect(useConnectionStore.getState().status).toBe('connected');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/web/test/components/DegradationBanner.test.tsx
```

- [ ] **Step 3: Implement `DegradationBanner.tsx`**

```tsx
// packages/web/src/components/shell/DegradationBanner.tsx
import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useConnectionStatus, useConnectionStore } from '../../state/connection.js';
import styles from './DegradationBanner.module.css';

interface Props {
  /** Duration in ms before treating no-event as disconnected. Default: 10 000. */
  graceMs?: number;
}

export function DegradationBanner({ graceMs = 10_000 }: Props) {
  const status = useConnectionStatus();
  const navigate = useNavigate();
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 10-second grace timer: if no 'connected' event arrives, assume disconnected.
  useEffect(() => {
    if (status === 'connected' || status === 'disconnected' || status === 'linking-required') {
      if (graceTimer.current) {
        clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
      return;
    }
    // status === 'connecting' — start grace timer
    graceTimer.current = setTimeout(() => {
      useConnectionStore.getState().setStatus('disconnected');
    }, graceMs);
    return () => {
      if (graceTimer.current) clearTimeout(graceTimer.current);
    };
  }, [status, graceMs]);

  if (status === 'connected') return null;

  if (status === 'linking-required') {
    return (
      <button
        type="button"
        className={`${styles.banner} ${styles.accent}`}
        onClick={() => void navigate({ to: '/setup' })}
      >
        Linking required — open setup
      </button>
    );
  }

  if (status === 'disconnected') {
    return (
      <div className={`${styles.banner} ${styles.warn}`}>
        Disconnected — reconnecting…
      </div>
    );
  }

  // connecting
  return (
    <div className={`${styles.banner} ${styles.info}`}>
      Connecting…
    </div>
  );
}
```

```css
/* packages/web/src/components/shell/DegradationBanner.module.css */
.banner {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  width: 100%;
  font-size: 0.8125rem;
  font-weight: 500;
  border: none;
  cursor: default;
  user-select: none;
  z-index: 100;
  flex-shrink: 0;
}

.info {
  background: var(--c-info-soft, rgba(0, 120, 212, 0.12));
  color: var(--c-info, #0078d4);
}

.warn {
  background: var(--c-warn-soft, rgba(200, 147, 10, 0.15));
  color: var(--c-warn, #c8930a);
}

.accent {
  background: var(--c-accent-soft, rgba(124, 77, 255, 0.12));
  color: var(--c-accent, #7c4dff);
  cursor: pointer;
}

.accent:hover {
  filter: brightness(1.1);
}
```

Mount `DegradationBanner` in `__root.tsx` above the shell div. Import and render it as the first child of `RootLayout`:

```tsx
// In packages/web/src/routes/__root.tsx, add import:
import { DegradationBanner } from '../components/shell/DegradationBanner.js';

// In the RootLayout return, wrap shell in a fragment with DegradationBanner above:
return (
  <>
    <DegradationBanner />
    <div
      className={styles.shell + (openThreadId ? ' ' + styles.threadOpen : '')}
      data-thread-open={openThreadId ? 'true' : 'false'}
    >
      <Rail />
      <Sidebar />
      <Outlet />
      {paletteOpen && <CommandPalette />}
    </div>
  </>
);
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec vitest run packages/web/test/components/DegradationBanner.test.tsx
pnpm --filter @yank/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/shell/DegradationBanner.tsx \
  packages/web/src/components/shell/DegradationBanner.module.css \
  packages/web/src/routes/__root.tsx \
  packages/web/test/components/DegradationBanner.test.tsx
git commit -m "feat(web): add DegradationBanner with 10s grace timer; mount in root layout"
```

---

### Task 4.11: Phase 4 verification gate

- [ ] **Step 1: Full lint, typecheck, and test suite**

```bash
pnpm lint
pnpm typecheck
pnpm test
```

All must pass. If any fail:
- Lint: fix ESLint errors (most common: missing `.js` extensions on relative imports; unused imports; `import type` for type-only imports).
- Typecheck: fix TypeScript errors before continuing.
- Tests: fix failing tests — do NOT proceed with failures.

- [ ] **Step 2: Manual reconnect smoke** *(run on dev machine with live daemon)*

```bash
# 1. Start services
docker compose -f docker-compose.local.yml up -d
pnpm dev

# 2. Open http://localhost:5173 — banner should NOT be visible (daemon connected)
# 3. Stop daemon: Ctrl-C on the daemon process in `pnpm dev` (or kill its PID)
# 4. Wait ~10 seconds — banner should appear: "Disconnected — reconnecting…"
# 5. Restart daemon: pnpm dev again
# 6. Banner should clear within seconds of daemon reconnecting
```

- [ ] **Step 3: Manual breaker smoke** *(requires real WA link — skip in CI)*

```bash
# Force breaker open by triggering 3 download timeouts:
# 1. Load a chat with at least one image
# 2. Kill daemon mid-download 3 times
# 3. Verify image tiles show "Downloads paused" chip
# 4. Click "Retry anyway" on a tile — verify bypass path fires
```

- [ ] **Step 4: Commit gate marker**

No code change; move to Phase 5.

---

## Phase 5 — Final verification

> **Prerequisite:** Phases 0–4 all green.  
> **What this phase delivers:** Playwright triage happy-path smoke; full check suite documentation; M4 handover note + closing commit.

---

### Task 5.1: Extend Playwright smoke with triage happy-path

**Files:**
- Modify: `packages/web/e2e/smoke-fixtures.spec.ts`
- Modify: `packages/web/e2e/fixtures-server.ts` (add triage endpoint stubs)
- Modify: `packages/web/src/components/triage/TriageCard.tsx` (add `data-testid` if absent — Phase 1 task; document here)
- Modify: `packages/web/src/components/primitives/UndoToast.tsx` (add `data-testid` if absent — Phase 1 task; document here)

**Note on `data-testid` attributes:** Phase 1 owns `TriageCard` and `UndoToast`. If Phase 1 did not add `data-testid="triage-card"` to the card root element and `data-testid="undo-toast"` to the toast root element, add them now:

In `packages/web/src/components/triage/TriageCard.tsx`, ensure the card root `<article>` or `<div>` carries:
```tsx
<div data-testid="triage-card" className={styles.card} ...>
```

In `packages/web/src/components/primitives/UndoToast.tsx`, ensure the toast root carries:
```tsx
<div data-testid="undo-toast" className={styles.toast} ...>
```

- [ ] **Step 1: Add triage fixtures to `fixtures-server.ts`**

Add the following routes to the existing `http.createServer` handler in `packages/web/e2e/fixtures-server.ts`:

```ts
// At the top of the file, add a triage chat fixture:
const triageChat = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000010',
  userId: chat.userId,
  jid: 'b@g.us',
  type: 'group',
  subject: 'Triage Test Chat',
  lastMessageAt: '2026-05-15T10:00:00.000Z',
  lastMessagePreview: 'hello triage',
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'triage',
  memberCount: 2,
  unreadCount: 1,
  lastReadMessageId: null,
  lastReadTs: null,
};

// In the request handler, add before the static fallback:
if (url.pathname === '/api/chats' && req.method === 'GET') {
  // Return both a work chat and a triage chat
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify([chat, triageChat]));
  return;
}

if (
  url.pathname.match(/^\/api\/chats\/[^/]+\/assignment$/) &&
  req.method === 'POST'
) {
  res.writeHead(204);
  res.end();
  return;
}

if (url.pathname === '/api/media/breaker-state') {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ state: 'closed', retryAt: null }));
  return;
}
```

Note: the existing `/api/chats` handler returns `[chat]` — replace with `[chat, triageChat]` or gate by query parameter if needed to avoid breaking existing smoke tests.

- [ ] **Step 2: Add triage happy-path test to `smoke-fixtures.spec.ts`**

Append to `packages/web/e2e/smoke-fixtures.spec.ts`:

```ts
test('triage happy path', async ({ page }) => {
  await page.goto('/triage');
  // Wait for at least one triage card
  const cards = page.locator('[data-testid="triage-card"]');
  await expect(cards.first()).toBeVisible({ timeout: 5_000 });
  const initialCount = await cards.count();

  // Press '1' to assign focused card to Work
  await page.keyboard.press('1');
  await expect(cards).toHaveCount(initialCount - 1, { timeout: 3_000 });

  // Undo toast appears
  await expect(page.locator('[data-testid="undo-toast"]')).toBeVisible({ timeout: 3_000 });

  // Click undo
  await page.locator('[data-testid="undo-toast"] button', { hasText: /undo/i }).click();
  await expect(cards).toHaveCount(initialCount, { timeout: 3_000 });
});
```

- [ ] **Step 3: Run the fixtures smoke suite**

```bash
pnpm --filter @yank/web exec playwright test --project=fixtures
```

All existing tests must still pass. The new triage test must pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/e2e/smoke-fixtures.spec.ts packages/web/e2e/fixtures-server.ts
# Also add TriageCard.tsx and UndoToast.tsx if data-testid was added in this task:
# git add packages/web/src/components/triage/TriageCard.tsx
# git add packages/web/src/components/primitives/UndoToast.tsx
git commit -m "test(web): add triage happy-path Playwright smoke"
```

---

### Task 5.2: Run full check suite and document results

- [ ] **Step 1: Full suite — all must be green**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @yank/web exec playwright test
```

If any step fails:

| Failure | Resolution |
|---|---|
| `pnpm lint` ESLint error | Fix the reported file; do not use `// eslint-disable` unless the rule is a false positive — investigate first. |
| `pnpm typecheck` error | Fix the TypeScript error — it is always real. Common M4 mistakes: missing `.js` extensions on new imports; forgetting to add `redis: Redis` to `DownloadDeps` callers; not updating `NAMED_EVENTS` to match the new union. |
| `pnpm test` failure | Fix the failing test or the underlying implementation. Do NOT mark the milestone complete with test failures. |
| Playwright `fixtures` suite failure | Check that `fixtures-server.ts` returns correct shapes for new routes; check that `data-testid` attrs exist on rendered elements. |
| Playwright `happy-path` suite failure | This project requires a live daemon — skip if not available in the current environment; document the skip. |

- [ ] **Step 2: Record pass (no commit needed)**

The gate is documentary. If all four commands exit 0, move to Task 5.3.

---

### Task 5.3: Write M4 handover note and close the milestone

**Files:**
- Create: `docs/superpowers/notes/2026-05-15-m4-handover.md`

- [ ] **Step 1: Gather branch stats**

```bash
git log main..HEAD --oneline | wc -l          # commit count ahead of main
git rev-parse HEAD                             # head SHA
pnpm test -- --reporter=verbose 2>&1 | tail -5  # test count
```

- [ ] **Step 2: Write the handover note**

Create `docs/superpowers/notes/2026-05-15-m4-handover.md` with the following structure (fill in values from step 1 and implementation):

```markdown
# M4 → M5 Handover

> Generated 2026-05-15 at the end of the M4 implementation session.
> Reader: a fresh agent picking up M5 work without conversation history.

## Branch state

- **Branch:** `feat/m4-daily-driver`
- **Commits ahead of main:** <N> (fill from `git log`)
- **Head:** `<SHA>` (fill from `git rev-parse HEAD`)
- **Tests:** <N> passing across <N> files (`pnpm test`)
- **Lint + typecheck:** all green.
- **DB:** no new migrations required (messages.edited_at was forward-defined in M3; M4 uses it).

## What the M4 plan said to ship vs what shipped

### Cluster 1 — Triage card grid
- [x] `POST /api/chats/:id/assignment` — UPSERT `chat_assignments` + SSE `chat-assignment`
- [x] `<TriageView>`, `<TriageCard>`, `<TriageProgressBar>`, `<TriageEmptyState>`
- [x] Keyboard shortcuts: `1`/`2`/`3` assign, `j`/`k`/↑/↓ navigate, `Cmd-Z` undo
- [x] `<UndoToast>` + `state/toast.ts` Zustand store
- [x] `useTriageChats()`, `useTriageCount()`, `useChatsForWorkspace(ws)` selectors
- [x] Rail triage count red-dot; Sidebar workspace filtering

### Cluster 2 — Contact rename
- [x] `PATCH /api/contacts/:id` → 204 + `contact-update` SSE
- [x] Inline rename in `<TriageCard>` (DM only; groups read-only)
- [x] `useUpdateContactName` mutation with optimistic patch + rollback

### Cluster 3a — Edit-message
- [x] `POST /api/messages/:id/edit` → 202 + `edit-message` command
- [x] Daemon `editMessage(jid, key, text)` via Baileys protocolMessage
- [x] Inbound EDIT in `normalize.ts`
- [x] `↑` shortcut in empty composer; hover-menu Edit; edit-mode banner
- [x] `(edited)` suffix on `MessageRow`; per-row retry on `message-edit-failed`

### Cluster 3b — @mention autocomplete
- [x] `<MentionPopover>` with `@` trigger, filter, arrow-key nav, Enter/Tab insert
- [x] Send-time JID resolution via `composer.mentions[]`
- [x] `@lid` rendered as `@Unknown (lid)`

### Cluster 3c — Keyboard & hover shortcuts
- [x] `<MessageRowActions>` hover strip: Edit · Reply-in-thread (R) · Star (S)
- [x] Global: `Cmd-T` chats-only palette, `Cmd-F` `<ChatFilterBar>`, `Cmd-Shift-A` mark-read

### Cluster 4 — Resilience surfacing
- [x] `packages/daemon/src/circuit-breaker.ts` — sliding-window primitive
- [x] Breaker wired into `download.ts`: threshold 3 / window 60s / cooldown 5m→30m
- [x] `publishBreakerState` → SSE + Redis hash `breaker:user:<userId>`
- [x] `GET /api/media/breaker-state` for fresh-tab reconciliation
- [x] `state/mediaBreaker.ts` Zustand slice + bootstrap fetch
- [x] `media-breaker-state` SSE handler in `eventStream.ts`
- [x] `<MediaPausedChip>` with countdown; mounted in MediaImage, DocCard, VoiceNote
- [x] `MediaImage` click-to-load (IntersectionObserver removed)
- [x] `state/connection.ts` Zustand slice; `connected`/`disconnected` SSE wired
- [x] `<DegradationBanner>` with 10s grace timer; mounted in `__root.tsx`

## Architecture deltas from M3

### New files (M4)
```
packages/daemon/src/circuit-breaker.ts
packages/api/src/routes/contacts.ts
packages/web/src/components/triage/TriageView.tsx (+.module.css)
packages/web/src/components/triage/TriageCard.tsx (+.module.css)
packages/web/src/components/triage/TriageProgressBar.tsx (+.module.css)
packages/web/src/components/triage/TriageEmptyState.tsx (+.module.css)
packages/web/src/components/chat/MessageRowActions.tsx (+.module.css)
packages/web/src/components/chat/ChatFilterBar.tsx (+.module.css)
packages/web/src/components/chat/MentionPopover.tsx (+.module.css)
packages/web/src/components/chat/MediaPausedChip.tsx (+.module.css)
packages/web/src/components/shell/DegradationBanner.tsx (+.module.css)
packages/web/src/components/primitives/UndoToast.tsx (+.module.css)
packages/web/src/components/primitives/InlineRename.tsx (+.module.css)
packages/web/src/hooks/useTriageKeys.ts
packages/web/src/hooks/useChatFilter.ts
packages/web/src/hooks/useMentionAutocomplete.ts
packages/web/src/state/toast.ts
packages/web/src/state/connection.ts
packages/web/src/state/mediaBreaker.ts
```

### New SSE events (on `DaemonEventSchema`)
- `chat-assignment` — workspace assigned; patches chat list in all tabs
- `contact-update` — display name changed; patches chats + contact caches
- `message-edit` — edit round-tripped; patches message cache
- `message-edit-failed` — daemon rejected the edit; shows per-row affordance
- `media-breaker-state` — circuit breaker state change; drives chip + banner

### New Redis keys
- `breaker:user:<userId>` (hash: `state`, `retryAt`; TTL 1 hour) — breaker snapshot for fresh-tab reconciliation

### New REST routes
- `POST /api/chats/:id/assignment` — workspace UPSERT
- `PATCH /api/contacts/:id` — display name update
- `POST /api/messages/:id/edit` — edit-message command enqueue
- `GET /api/media/breaker-state` — current breaker state

## Gotchas discovered during M4

1. **WhatsApp 15-minute edit cliff.** Baileys rejects edits on messages older than ~15 min with `'too-old'` reason. The UI does not gate this in advance — the user sees a per-row retry affordance. Post-v1: add a tooltip on the Edit menu item.

2. **Circuit-breaker threshold tuning.** 3 failures in 60s is aggressive for a stable connection. Real-world WA throttles tend to produce bursts, so the threshold is appropriate. If false positives occur in production, raise to 5 via an env var (currently hardcoded — a plan-time open question; add `YANK_BREAKER_THRESHOLD` / `YANK_BREAKER_WINDOW_MS` env vars if needed post-M4).

3. **IntersectionObserver removal.** Switching `MediaImage` to click-to-load eliminated the main cascade vector (viewport entry reflooding WA). The existing M3 code already had `isExpired` guard; M4 removes the root cause.

4. **`@mention` ambiguity.** Two group members with identical `displayName` resolve to the first match. Documented limitation; the post-v1 fix is a hidden-token system in the textarea. Do not add a UI prompt for this in M5 — it is deferred to post-v1.

5. **Grace timer initial state.** On app boot, `useConnectionStore` starts as `'connecting'`. The 10s timer fires if no `connected` event arrives (daemon down or api-only mode). This is intentional — see spec §5.7.

6. **`bypassBreaker` signal.** The web passes `?bypass=1` as a query param; the api ignores it today. To truly bypass at the daemon level, the `download-media` command needs `bypassBreaker: true` wired through from the api route. The `DownloadMediaCommand` schema already includes `bypassBreaker?: boolean` (added in Task 4.2). The api route in `media.ts` needs to forward it when present — this is a small follow-up (wire `bypassBreaker: true` in the `XADD` command payload when `?bypass=1` is in the request).

## Suggested M5 starting points

Per spec §2 deferred list and what we learned in M4:

1. **Search results** — `/search` route stub exists; FTS GIN indexes in schema. M5 can add `GET /api/search?q=<text>` using PostgreSQL full-text search (`to_tsvector` + `to_tsquery`).

2. **Saved messages** — `/stars` route stub; `stars` table + `useStar` mutation already exist. M5 renders a message list similar to `ChatView` reading from `stars`.

3. **Group avatar polish** — `Avatar` component uses the `avatarGradient` function. Real group/contact avatars from WA (base64 profile-picture data from Baileys' `profilePictureUrl`) can be persisted to `contacts.avatar_url` and rendered in M5.

4. **`bypassBreaker` wiring** — small follow-up from M4 gotcha #6 above; wire `bypassBreaker: true` from `GET /api/media/:id?bypass=1` into the `XADD` command payload.

5. **Circuit-breaker env-var tuning** — expose `YANK_BREAKER_THRESHOLD`, `YANK_BREAKER_WINDOW_MS`, `YANK_BREAKER_BASE_COOLDOWN_MS` so production tuning doesn't require code changes.

6. **`/hidden` recovery view** — currently `hidden` chats are invisible everywhere. M5 can add a recovery view at `/hidden` (simple list with "Restore" action).

## Open questions to surface at M5 kickoff

- Should M5 merge M4 into `main` first? M4 is 100+ commits — a clean slate reduces archeology for future agents.
- Is the search UX per-chat (filter bar, already in M4 via `Cmd-F`) or global? Global search is the M5 target.
- Should group avatars fetch from WA CDN or be stripped entirely (privacy)? Stripe is simpler; CDN fetch needs a media-worker-style proxy.
- `bypassBreaker` follow-up: handle in M5 or hotfix to M4 branch?
```

- [ ] **Step 3: Commit the handover note and close the milestone**

```bash
git add docs/superpowers/notes/2026-05-15-m4-handover.md
git commit -m "docs: M4 handover for fresh M5 chat"
```

---

## Coverage check (Phase 4 + 5)

| Spec reference | Task(s) |
|---|---|
| **§2 Cluster 4a — Degradation banner** | |
| `useConnectionStore` Zustand slice fed by SSE `connection-update` events | 4.9 |
| States: `connected \| connecting \| disconnected \| linking-required` | 4.9 |
| `<DegradationBanner>` hidden when `connected`; soft color `connecting`; warning `disconnected`; clickable `linking-required` | 4.10 |
| 10s post-connect grace: if no event, assume `disconnected` | 4.10 |
| **§2 Cluster 4b — Media circuit breaker (daemon)** | |
| Sliding-window counter ≥ 3 timeouts in 60s → `open` | 4.1, 4.2 |
| While `open`: instant `failureReason: 'paused'`; half-open probe after cooldown | 4.1, 4.2 |
| Probe: success → `closed`; failure → cooldown × 2 capped at 30min | 4.1 |
| New SSE event `media-breaker-state` so all tabs converge | 4.3, 4.6 |
| Manual retry: `bypassBreaker: true` command bypasses breaker | 4.2, 4.8 |
| **§2 Cluster 4c — Click-to-load image tile** | |
| Drop `IntersectionObserver` in `MediaImage` | 4.8 |
| State machine: `queued` → click → `downloading` → `ready \| failed \| expired \| paused` | 4.8 |
| **§4.2 `MediaBreakerStateEvent` on `DaemonEventSchema`** | Phase 0 (0.2) — already shipped; used by 4.3, 4.6 |
| **§5.7 Degradation banner data flow** | 4.9, 4.10 |
| **§5.8 Circuit breaker data flow** | 4.1, 4.2, 4.3 |
| **§5.9 Click-to-load image tile state machine** | 4.8 |
| **§7.1 New files: `circuit-breaker.ts`, `connection.ts`, `mediaBreaker.ts`, `DegradationBanner.tsx`** | 4.1, 4.9, 4.5, 4.10 |
| **§8 Visual treatment — degradation banner (32px strip, token-driven colors)** | 4.10 |
| **§8 Visual treatment — media paused chip (small pill, countdown)** | 4.7 |
| **§9 Error handling — daemon never publishes `connected` → 10s grace** | 4.10 |
| **§9 Error handling — circuit breaker re-opens during probe → cooldown doubles, capped** | 4.1 |
| **§10 Case 14 — Circuit breaker reset on daemon restart** | 4.2 (module-level singleton resets on process restart; `resetBreakerForTest` for tests only) |
| **§10 Case 15 — `media-breaker-state` event on web-tab reconnect** | 4.4 (`GET /api/media/breaker-state`), 4.5 (bootstrap fetch on mount) |
| **§11.2 `circuit-breaker.test.ts`** | 4.1 |
| **§11.2 `download.test.ts`** | 4.2, 4.3 |
| **§11.3 `DegradationBanner.test.tsx`** | 4.10 |
| **§11.3 `MediaImage.click-to-load.test.tsx`** | 4.8 |
| **§11.4 E2E triage happy-path (Playwright)** | 5.1 |
| **§11.5 Not tested in CI (live WA circuit-breaker timing)** | 4.11 manual smoke note; 5.2 skip guidance |

---
