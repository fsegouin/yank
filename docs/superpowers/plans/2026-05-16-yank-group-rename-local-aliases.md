# Yank — Local Group Rename + Local Nicknames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user assign a local-only group name and a local-only person nickname from the web UI, without round-tripping anything to WhatsApp. Group renames stay invisible to WA contacts; nicknames cover the "@lid sender we never received a name for" gap surfaced in M4.

**Architecture:** Two thin local-only paths. Group rename adds a `chats.local_subject` column; the chats resolver returns `local_subject ?? subject` so downstream code is unaware. Nicknames piggy-back on the existing `contacts` table — `PATCH /api/contacts/:jid` becomes an upsert so it can name jids that have never been observed as contacts (i.e. unknown group senders). No daemon changes; Baileys stays untouched. WA-side sync is explicitly out of scope.

**Tech Stack:** TypeScript strict ESM, drizzle-orm (Postgres migrations), Fastify (api), React + TanStack Query + Zustand (web), Vitest + RTL + MSW.

---

## How to use this plan

- Read CLAUDE.md invariants — daemon is Redis-only, multi-user-shaped schema, Baileys only in `packages/daemon`. None of those are touched here, but the plan must not violate them.
- Read M4's design spec (§Cluster 2) and `packages/api/src/routes/contacts.ts` before Phase 2 — the existing DM rename path is the template.
- ESM with `.js` extensions on relative imports. ESLint enforces.
- Tests live in `packages/<pkg>/test/**/*.test.{ts,tsx}` — co-located not picked up.
- Conventional Commits. One concern per commit.
- TDD: failing test, watch it fail, minimal code, watch it pass, commit.
- After each phase: `pnpm lint && pnpm typecheck && pnpm test` from repo root. All green before moving on.

## File map

**Phase 1 — group rename (local):**
- Modify: `packages/db/src/schema/chats.ts` — add `local_subject` column.
- Create: `packages/db/drizzle/0001_*.sql` — migration (via `pnpm --filter @yank/db drizzle:generate`).
- Modify: `packages/shared/src/dto.ts` — new `ChatLocalSubjectBodySchema`.
- Modify: `packages/shared/src/events.ts` — new `ChatLocalSubjectUpdateEvent` (and add it to the `DaemonEvent` union + `NAMED_EVENTS` in web).
- Create: `packages/api/src/routes/chat-local-subject.ts` — `PATCH /api/chats/:id/local-subject` handler.
- Modify: `packages/api/src/routes/chats.ts` — extend the `subject` resolver in both list and single endpoints to prefer `local_subject`.
- Modify: `packages/api/src/index.ts` — register the new route.
- Modify: `packages/web/src/lib/eventStream.ts` — handle the new event (invalidate chats query).
- Modify: `packages/web/src/lib/mutations.ts` — new `useUpdateChatLocalSubject(chatId)` hook.
- Modify: `packages/web/src/components/triage/TriageCard.tsx` — drop the `chat.type === 'dm'` gate; route groups to the new mutation.
- Tests under `packages/{shared,api,web}/test/**`.

**Phase 2 — local nicknames for unknown jids:**
- Modify: `packages/api/src/routes/contacts.ts` — turn the existing PATCH into an upsert (no 404 when contact row absent).
- Modify: `packages/api/test/contacts.rename.test.ts` — add cases for upsert behavior.
- Modify: `packages/web/src/components/chat/MessageRow.tsx` (or wherever the author name is rendered) — wire a click-to-rename affordance using the existing `useUpdateContactName` hook, gated on "no name resolved" (i.e. the fallback hit the jid).
- New test files for the UI affordance.

---

## Phase 1 — Local group rename

### Task 1.1: Schema migration — add `chats.local_subject`

**Files:**
- Modify: `packages/db/src/schema/chats.ts`
- Generate: `packages/db/drizzle/000N_*.sql`
- Test: `packages/db/test/migrations.test.ts` (verify column present after migrate)

- [ ] **Step 1: Write the failing test**

Append a case to `packages/db/test/migrations.test.ts`:

```ts
it('chats has local_subject text column (nullable)', async () => {
  const rows = await sql`
    SELECT column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_name = 'chats' AND column_name = 'local_subject'
  `;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ is_nullable: 'YES', data_type: 'text' });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run packages/db/test/migrations.test.ts -t "local_subject"
```

Expected: 0 rows returned.

- [ ] **Step 3: Add the column to the drizzle schema**

In `packages/db/src/schema/chats.ts`, inside the columns block:

```ts
subject: text('subject'),
localSubject: text('local_subject'),
```

- [ ] **Step 4: Generate the migration**

```bash
pnpm --filter @yank/db drizzle:generate
```

Expected: a new file `packages/db/drizzle/0001_*.sql` containing `ALTER TABLE "chats" ADD COLUMN "local_subject" text;`.

- [ ] **Step 5: Run the migration test — expect PASS**

```bash
pnpm exec vitest run packages/db/test/migrations.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/chats.ts packages/db/drizzle/ packages/db/test/migrations.test.ts
git commit -m "feat(db): add chats.local_subject column for local group rename"
```

### Task 1.2: Shared DTO + event

**Files:**
- Modify: `packages/shared/src/dto.ts`
- Modify: `packages/shared/src/events.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/dto.test.ts`, `packages/shared/test/events.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/test/dto.test.ts`:

```ts
it('ChatLocalSubjectBodySchema accepts trimmed 1..80', () => {
  expect(ChatLocalSubjectBodySchema.parse({ localSubject: 'Team' }).localSubject).toBe('Team');
  // null clears the override
  expect(ChatLocalSubjectBodySchema.parse({ localSubject: null }).localSubject).toBeNull();
  expect(() => ChatLocalSubjectBodySchema.parse({ localSubject: '' })).toThrow();
  expect(() => ChatLocalSubjectBodySchema.parse({ localSubject: 'a'.repeat(81) })).toThrow();
});
```

Append to `packages/shared/test/events.test.ts` (create if absent):

```ts
it('ChatLocalSubjectUpdateEvent round-trips', () => {
  const parsed = DaemonEventSchema.parse({
    type: 'chat-local-subject-update',
    userId: '00000000-0000-0000-0000-000000000001',
    chatId: '00000000-0000-0000-0000-000000000002',
    localSubject: 'Team',
    updatedAt: new Date().toISOString(),
  });
  expect(parsed.type).toBe('chat-local-subject-update');
});
```

- [ ] **Step 2: Run — expect FAIL** (`ReferenceError` on the new schemas).

```bash
pnpm exec vitest run packages/shared/test
```

- [ ] **Step 3: Implement**

Append to `packages/shared/src/dto.ts`:

```ts
export const ChatLocalSubjectBodySchema = z.object({
  localSubject: z.union([z.string().trim().min(1).max(80), z.null()]),
});
export type ChatLocalSubjectBody = z.infer<typeof ChatLocalSubjectBodySchema>;
```

Append to `packages/shared/src/events.ts`:

```ts
export const ChatLocalSubjectUpdateEvent = Base.extend({
  type: z.literal('chat-local-subject-update'),
  chatId: z.string().uuid(),
  localSubject: z.string().nullable(),
  updatedAt: z.string().datetime(),
});
```

Add it to the `DaemonEventSchema` discriminated union (same file, the `z.discriminatedUnion('type', [...])` call).

Re-export both from `packages/shared/src/index.ts`.

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm exec vitest run packages/shared/test
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add ChatLocalSubjectBody + ChatLocalSubjectUpdateEvent"
```

### Task 1.3: API — `PATCH /api/chats/:id/local-subject` + resolver

**Files:**
- Create: `packages/api/src/routes/chat-local-subject.ts`
- Modify: `packages/api/src/routes/chats.ts` (resolver: prefer `local_subject`)
- Modify: `packages/api/src/index.ts` (register the route)
- Test: `packages/api/test/chat-local-subject.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/chat-local-subject.test.ts`. Mirror the shape of `packages/api/test/contacts.rename.test.ts` — spin up the test app, insert a fixture chat row of type `group` with `subject = 'WA Subject'`, then:

```ts
it('PATCH /api/chats/:id/local-subject persists and surfaces in GET /api/chats', async () => {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/chats/${chatId}/local-subject`,
    payload: { localSubject: 'My Team' },
  });
  expect(res.statusCode).toBe(204);

  const list = await app.inject({ method: 'GET', url: '/api/chats' });
  const row = JSON.parse(list.body).find((c: { id: string }) => c.id === chatId);
  expect(row.subject).toBe('My Team');
});

it('PATCH with null clears the override (WA subject re-surfaces)', async () => {
  await app.inject({ method: 'PATCH', url: `/api/chats/${chatId}/local-subject`, payload: { localSubject: 'X' } });
  const res = await app.inject({ method: 'PATCH', url: `/api/chats/${chatId}/local-subject`, payload: { localSubject: null } });
  expect(res.statusCode).toBe(204);
  const list = await app.inject({ method: 'GET', url: '/api/chats' });
  const row = JSON.parse(list.body).find((c: { id: string }) => c.id === chatId);
  expect(row.subject).toBe('WA Subject');
});

it('publishes chat-local-subject-update SSE event', async () => {
  const received: unknown[] = [];
  await deps.eventsPublisher.subscribe(userId, (evt) => received.push(evt));
  await app.inject({ method: 'PATCH', url: `/api/chats/${chatId}/local-subject`, payload: { localSubject: 'Y' } });
  expect(received).toContainEqual(expect.objectContaining({ type: 'chat-local-subject-update', chatId, localSubject: 'Y' }));
});

it('404s for unknown chatId', async () => {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/chats/00000000-0000-0000-0000-0000000000ff/local-subject`,
    payload: { localSubject: 'X' },
  });
  expect(res.statusCode).toBe(404);
});

it('400s on empty string', async () => {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/chats/${chatId}/local-subject`,
    payload: { localSubject: '' },
  });
  expect(res.statusCode).toBe(400);
});
```

- [ ] **Step 2: Run — expect FAIL** (404s; route not registered).

```bash
pnpm exec vitest run packages/api/test/chat-local-subject.test.ts
```

- [ ] **Step 3: Implement the route**

Create `packages/api/src/routes/chat-local-subject.ts`. Template from `packages/api/src/routes/contacts.ts:1-59` — ownership-check by `userId + chatId`, drizzle UPDATE, publish event.

```ts
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@yank/db';
import { chats } from '@yank/db/schema';
import { ChatLocalSubjectBodySchema } from '@yank/shared';
import type { EventsPublisher } from '../events-publisher.js';

export interface ChatLocalSubjectDeps {
  db: Db;
  userId: string;
  eventsPublisher: EventsPublisher;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerChatLocalSubjectRoutes(app: FastifyInstance<any, any, any, any>, deps: ChatLocalSubjectDeps): void {
  app.patch<{ Params: { id: string } }>(
    '/api/chats/:id/local-subject',
    async (req, reply) => {
      const parsed = ChatLocalSubjectBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
      }
      const { localSubject } = parsed.data;
      const chatId = req.params.id;

      const existing = await deps.db
        .select({ id: chats.id })
        .from(chats)
        .where(and(eq(chats.userId, deps.userId), eq(chats.id, chatId)))
        .limit(1);
      if (!existing[0]) {
        return reply.code(404).send({ error: 'not_found' });
      }

      await deps.db
        .update(chats)
        .set({ localSubject })
        .where(and(eq(chats.userId, deps.userId), eq(chats.id, chatId)));

      await deps.eventsPublisher.publish({
        type: 'chat-local-subject-update',
        userId: deps.userId,
        chatId,
        localSubject,
        updatedAt: new Date().toISOString(),
      });

      reply.code(204);
      return null;
    },
  );
}
```

- [ ] **Step 4: Extend the chats resolver**

In `packages/api/src/routes/chats.ts`, select `local_subject` in both queries and update the `subject` fallback chain (currently `r.subject ?? (r.type === 'dm' ? r.contactDisplayName ?? r.contactPushName ?? r.contactBusinessName ?? null : null)`) to:

```ts
const subject =
  r.localSubject ??
  r.subject ??
  (r.type === 'dm'
    ? r.contactDisplayName ?? r.contactPushName ?? r.contactBusinessName ?? null
    : null);
```

Add `localSubject: chats.localSubject,` to the `select` shape in both `/api/chats` and `/api/chats/:id`.

- [ ] **Step 5: Register the route**

In `packages/api/src/index.ts`, register `registerChatLocalSubjectRoutes(app, { db, userId, eventsPublisher })` next to the other route registrations.

- [ ] **Step 6: Run — expect PASS**

```bash
pnpm exec vitest run packages/api/test
```

- [ ] **Step 7: Commit**

```bash
git add packages/api
git commit -m "feat(api): add PATCH /api/chats/:id/local-subject and resolver fallback"
```

### Task 1.4: Web — mutation hook + SSE handler

**Files:**
- Modify: `packages/web/src/lib/mutations.ts`
- Modify: `packages/web/src/lib/eventStream.ts`
- Test: `packages/web/test/lib/mutations.test.ts` (or co-located mutations test if it exists), `packages/web/test/lib/eventStream.test.ts`

- [ ] **Step 1: Write the failing tests**

For the mutation hook, mirror the shape of any existing `useUpdate*` test. Assert that calling `mutate({ chatId, localSubject: 'X' })` sends `PATCH /api/chats/${chatId}/local-subject` with body `{ localSubject: 'X' }` and on success invalidates `queryKeys.chats()`.

For the event-stream handler, assert that dispatching a `chat-local-subject-update` SSE event causes `qc.invalidateQueries({ queryKey: queryKeys.chats() })` to be called.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

Add to `packages/web/src/lib/mutations.ts`:

```ts
export function useUpdateChatLocalSubject(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (localSubject: string | null) => {
      const res = await fetch(`/api/chats/${chatId}/local-subject`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ localSubject }),
      });
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.chats() });
    },
  });
}
```

In `packages/web/src/lib/eventStream.ts`:

```ts
const NAMED_EVENTS = [
  // ...
  'media-breaker-state',
  'chat-local-subject-update',
] as const;
```

```ts
case 'chat-local-subject-update':
  qc.invalidateQueries({ queryKey: queryKeys.chats() });
  return;
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib
git commit -m "feat(web): add useUpdateChatLocalSubject + handle SSE event"
```

### Task 1.5: Web — drop DM-only gate in TriageCard

**Files:**
- Modify: `packages/web/src/components/triage/TriageCard.tsx`
- Modify: `packages/web/test/components/TriageCard.rename.test.tsx` (existing — flip the "groups read-only" assertion)

- [ ] **Step 1: Write the failing test**

In `packages/web/test/components/TriageCard.rename.test.tsx`, replace the existing "does not render InlineRename for group chat" case with:

```ts
it('renders InlineRename for group chat (local subject)', () => {
  render(<TriageCard chat={groupChat} />);
  // The trigger that opens InlineRename should be present
  expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument();
});

it('renaming a group calls useUpdateChatLocalSubject with the new value', async () => {
  // ... mock the hook, render, submit "My Team", assert mutation called
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

In `TriageCard.tsx`, replace the conditional render at line ~43–50:

```tsx
{chat.type === 'dm' ? (
  <InlineRename
    value={chat.subject ?? chat.jid}
    onSubmit={(v) => updateContact.mutate(v)}
  />
) : (
  <InlineRename
    value={chat.subject ?? chat.jid}
    onSubmit={(v) => updateChatLocalSubject.mutate(v)}
  />
)}
```

Wire the new hook: `const updateChatLocalSubject = useUpdateChatLocalSubject(chat.id);`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Manual smoke**

```bash
pnpm dev
```

Open a group chat in the triage view, rename it, refresh — name persists locally. Confirm it does NOT appear changed on your phone.

- [ ] **Step 6: Commit**

```bash
git add packages/web
git commit -m "feat(web): enable local group rename via InlineRename"
```

### Phase 1 verification gate

```bash
pnpm lint && pnpm typecheck && pnpm test
```

All green. Manual smoke completed.

---

## Phase 2 — Local nicknames for unknown jids

### Task 2.1: Upsert in PATCH /api/contacts/:jid

**Files:**
- Modify: `packages/api/src/routes/contacts.ts`
- Modify: `packages/api/test/contacts.rename.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/api/test/contacts.rename.test.ts`:

```ts
it('PATCH creates a contact row when none exists (upsert path)', async () => {
  const unknownJid = '999999999999@s.whatsapp.net';
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/contacts/${encodeURIComponent(unknownJid)}`,
    payload: { displayName: 'Bob from accounting' },
  });
  expect(res.statusCode).toBe(204);

  const rows = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.jid, unknownJid)));
  expect(rows).toHaveLength(1);
  expect(rows[0].displayName).toBe('Bob from accounting');
});

it('PATCH publishes contact-update for upserted contact', async () => {
  // assert event published as in the existing happy path
});
```

- [ ] **Step 2: Run — expect FAIL** (current handler 404s when row absent — `packages/api/src/routes/contacts.ts:35-37`).

- [ ] **Step 3: Implement upsert**

In `packages/api/src/routes/contacts.ts`, replace the existence check + update with an `INSERT ... ON CONFLICT (user_id, jid) DO UPDATE`:

```ts
await deps.db
  .insert(contacts)
  .values({ userId: deps.userId, jid: contactJid, displayName })
  .onConflictDoUpdate({
    target: [contacts.userId, contacts.jid],
    set: { displayName },
  });
```

Remove the 404 branch entirely (`packages/api/src/routes/contacts.ts:29-37`). The event publish stays the same.

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm exec vitest run packages/api/test/contacts.rename.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/api
git commit -m "feat(api): upsert contact on PATCH /api/contacts/:jid for unknown jids"
```

### Task 2.2: Web — click-to-rename affordance on unknown senders

**Files:**
- Modify: `packages/web/src/components/chat/MessageRow.tsx` (or wherever the author name is rendered — confirm with `grep -rn senderName packages/web/src`)
- Test: `packages/web/test/components/MessageRow.alias.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
it('shows a "Set nickname" affordance when the sender resolves to a raw jid', () => {
  render(<MessageRow message={{ ...m, senderName: null, senderJid: '999@s.whatsapp.net' }} nameByJid={new Map()} />);
  expect(screen.getByRole('button', { name: /set nickname/i })).toBeInTheDocument();
});

it('does not show the affordance when a name is already resolved', () => {
  render(<MessageRow message={{ ...m, senderName: 'Alice' }} nameByJid={new Map()} />);
  expect(screen.queryByRole('button', { name: /set nickname/i })).not.toBeInTheDocument();
});

it('submitting the inline rename calls useUpdateContactName for the sender jid', async () => {
  // mock the hook; render with unresolved sender; click affordance; type "Bob"; submit; assert mutation called with senderJid + "Bob"
});
```

- [ ] **Step 2: Run — expect FAIL** (component doesn't render the affordance yet).

- [ ] **Step 3: Implement**

Compute `displayName` once at the top of the row (matching the existing `senderName ?? nameByJid.get(senderJid) ?? senderJid` chain from `MessageList.tsx:133`). When the resolved value equals the raw jid, render an `<InlineRename>` (or a small "Set nickname" button that opens it) wired to `useUpdateContactName(m.senderJid)`. Use the existing InlineRename primitive — no new UI component.

Place the affordance next to the author name, only visible on hover (mirror the `MessageRow` hover patterns already in use — see commit `4264ab5` / `6ca5f9b` for hover-scoped controls).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Manual smoke**

```bash
pnpm dev
```

Open a group chat that contains a message from a sender whose name is unknown (the row shows a raw `@s.whatsapp.net` or `@lid`). Click the "Set nickname" affordance, type a name, submit. Confirm:
- The name updates immediately on that row.
- Other rows from the same sender pick up the same name after the next SSE invalidation (or on next refresh).
- The chat-list DM row, if one exists, also reflects the new name.

- [ ] **Step 6: Commit**

```bash
git add packages/web
git commit -m "feat(web): allow assigning a local nickname to unknown message senders"
```

### Phase 2 verification gate

```bash
pnpm lint && pnpm typecheck && pnpm test
```

All green. Manual smokes completed.

---

## Out of scope (deliberately)

- Pushing the local group subject back to WhatsApp via Baileys `groupUpdateSubject` (post-v1). The `local_subject` column is a clean foundation for this later; the daemon will read it on demand and emit a `RenameGroup` command.
- A separate "People" tab or contact management screen for editing nicknames out of band. The message-row affordance is enough for now.
- Conflict resolution if WA later sends a real `subject` change while a `local_subject` is set. v1: local wins, no UI indication. Note this in M5's handover.
- Sync of `local_subject` / nickname rows across users (we're single-user in v1; the schema is already keyed on `user_id` so multi-user just works later).

---

## Self-review

- **Spec coverage:** Two features requested, both have phases with end-to-end tasks (schema → DTO/event → API → web → manual smoke). ✓
- **Placeholders:** All code blocks contain real code. The MessageRow component target is identified by name with a fallback grep instruction since I haven't read that file yet — acceptable. ✓
- **Type consistency:** `localSubject` is `string | null` everywhere (DTO, event, drizzle column, mutation argument). `chatId` is uuid in API path + event. ✓
- **CLAUDE.md invariants:** No daemon changes; no new Baileys access from api/web; schema is multi-user-shaped (uses existing `user_id`). ✓

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-05-16-yank-group-rename-local-aliases.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks. Uses `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks in the current session with checkpoints. Uses `superpowers:executing-plans`.

Pick one when ready to start.
