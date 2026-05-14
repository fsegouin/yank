# Yank — M4 Triage Design

**Status:** design (pre-plan).
**Author / date:** 2026-05-14.
**Predecessor:** [`docs/superpowers/plans/2026-05-14-yank-m3-frontend.md`](../plans/2026-05-14-yank-m3-frontend.md) — assumed merged. M4 builds on M3's projected end state, not the current `main`.
**Authoritative shapes:** [`docs/superpowers/specs/2026-05-14-yank-design.md`](2026-05-14-yank-design.md) §7 (schema), §8.3 (first-run flow), §9 (frontend IA).

## 1. Goal

Replace the M3 `/triage` route stub with the keyboard-first card grid that clears unassigned chats, ship the missing `POST /api/chats/:chatId/assignment` endpoint, and make the rest of the shell respect the `workspace` and `hidden` state that triage produces (sidebar filtering, rail badge, multi-tab consistency).

**End state when M4 is complete:**

- `/triage` renders a card grid of every chat with `workspace='triage'`, sorted by `lastMessageAt DESC`. The user clears it via mouse (Work / Personal / Hide buttons) or keyboard (`1`, `2`, `3`).
- An assignment is optimistic; an `<UndoToast>` appears for ~5 s and reverts the move on click or `Cmd+Z`.
- A second browser tab open on `/triage` reflects assignments from the first tab automatically (SSE `chat-assignment` event).
- The shell's sidebar lists only chats whose workspace matches the rail-selected workspace, and `hidden` chats are excluded everywhere except the (deferred) recovery view.
- The Triage rail button shows a red dot whenever the triage count > 0, reactively.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass; the existing M3 Playwright smoke is extended with one triage happy-path spec.

## 2. Scope

### In M4

- **`packages/api`:** implement `POST /api/chats/:chatId/assignment` (UPSERT into `chat_assignments`, then publish `chat-assignment` on `events:user:<userId>`). Ownership check; Zod-validated body; idempotent.
- **`packages/shared`:**
  - `dto.ts` — export `AssignmentBodySchema` + `AssignmentBody` type, consumed by both the api handler and the web mutation.
  - `events.ts` — extend `DaemonEvent` union with `ChatAssignmentEvent` (discriminator `'chat-assignment'`).
- **`packages/web`:**
  - Replace the M3 `/triage` stub with `<TriageView />` (card grid, top-bar count + progress, focused-card border, empty state).
  - New `triage/` component family: `TriageView`, `TriageCard`, `TriageProgressBar`, `TriageEmptyState`.
  - Widen the M3 `useAssignWorkspace` mutation to accept the full `Workspace` union (so undo can re-triage); add optimistic patch + rollback + undo-toast trigger.
  - New `<UndoToast>` primitive backed by a single-slot Zustand store (`state/toast.ts`); mounted once at `__root`.
  - New `useTriageKeys` hook (route-scoped — `1`/`2`/`3` to assign focused, `j`/`k`/`↑`/`↓` to navigate, `Cmd+Z` for undo).
  - New cache selectors: `useChatsForWorkspace(ws)`, `useTriageChats()`, `useTriageCount()`. Pure transforms over the existing `useChats()` cache — no new query.
  - `eventStream.ts` — handle `'chat-assignment'`: patch the `useChats()` cache in place.
  - Sidebar: switch from `useChats()` to `useChatsForWorkspace(currentWorkspace)`. Hidden excluded everywhere except `/triage`.
  - Rail: Triage button reads `useTriageCount()`; renders the existing red-dot affordance when count > 0.
  - Command palette quick-switcher: drop `hidden` chats.

### Out (deferred)

| Item | Why deferred |
|---|---|
| Per-chat re-assignment menu in the chat topbar (move chat from Work back to Triage from any chat view) | Adds a new menu component + interaction surface; not on the M4 critical path. Triage covers the dominant first-run + new-chat flow. Rapid re-assignment within 5 s is still possible via `<UndoToast>`. |
| Bulk operations ("Hide all remaining", "Move all to Work") | Triage at expected scale (≤ ~50 first-run, ~1/day after) does not need bulk affordances. The mockup's top-bar Archive / Filter buttons are visual stubs only in M4. |
| Touch swipe gestures on `<TriageCard>` | PWA mobile-polish milestone. Cards are tap-friendly without swipe. |
| `/hidden` recovery view, `/settings/workspaces` workspace-management UI | Hidden = "mute and forget" by default; recovery is via the deferred settings surface. M4 mitigates the "I hid by mistake" case via the 5 s undo toast. |
| Search / filter inside `/triage` | Not needed at expected list size. |

### Cross-cutting non-goals

- M4 does not modify M3's `useKeyboardShortcuts` (global Cmd+K / Cmd+1/2/3 / Cmd+Shift+F). Cmd+1/2/3 already routes to the right workspace; M4 just makes the resulting view filter correctly.
- M4 does not touch `packages/daemon`. Workspace assignment is a UI-level decision, not a WhatsApp protocol event — invariant 3 keeps Baileys ignorant of it.

## 3. Architectural fit

M4 stays inside the three load-bearing invariants:

1. **Daemon ↔ Redis only** — untouched. The api publishes `chat-assignment` directly on `events:user:<u>`; daemon never sees it.
2. **Multi-user-shaped schema** — `chat_assignments` already keys on `chat_id`, which itself carries `user_id` via the `chats` row. Ownership check in the new route enforces tenancy.
3. **Library boundary** — Baileys-free. The daemon package is not opened in M4.

It also continues the M3 "single source of truth" pattern: the `useChats()` query is the only chat cache; every M4 view (triage list, sidebar, rail badge, palette) is a derived selector over it.

## 4. API contract

### REST

```
POST /api/chats/:chatId/assignment
Body: { workspace: 'work' | 'personal' | 'triage' | 'hidden' }
→ 204 No Content              on success (UPSERT applied)
→ 400 Bad Request             on Zod validation failure
→ 404 Not Found               if :chatId is not owned by the current user
```

Behavioural notes:

- **Idempotent:** repeating the same body is a no-op write at the data level (workspace unchanged) but advances `assigned_at`; still returns 204; still publishes the event.
- **`'triage'` is a valid value:** required for the undo path (M3 typed it as `Exclude<Workspace, 'triage'>` — M4 widens this).
- **Ownership check first:** the handler reads `chats` filtered by `(user_id, id)` before the UPSERT. A foreign chatId returns 404 *before* any write or event publish.

The body schema lives in `@yank/shared/src/dto.ts` alongside the other DTOs M3 added there (where `WorkspaceSchema` is already exported):

```ts
// packages/shared/src/dto.ts (extended)
export const AssignmentBodySchema = z.object({ workspace: WorkspaceSchema });
export type AssignmentBody = z.infer<typeof AssignmentBodySchema>;
```

### SSE

A new event variant added to `DaemonEvent` in `@yank/shared/src/events.ts`. Every existing variant extends a `Base` schema that carries `userId`; the new one follows the same shape. `WorkspaceSchema` lives in `@yank/shared/src/dto.ts` (added by M3) and is imported here:

```ts
// packages/shared/src/events.ts (extended)
import { WorkspaceSchema } from './dto.js';

export const ChatAssignmentEvent = Base.extend({
  type: z.literal('chat-assignment'),
  chatId: z.string().uuid(),
  workspace: WorkspaceSchema,
  assignedAt: z.string().datetime(),
});

export const DaemonEventSchema = z.discriminatedUnion('type', [
  // ...existing variants...
  ChatAssignmentEvent,
]);
```

Module-graph note: `dto.ts` does not currently import from `events.ts`, so the new import direction (`events.ts` → `dto.ts`) does not create a cycle. If a future change inverts the dependency, lift `WorkspaceSchema` into a third file (`schemas.ts`) and re-export from both.

The api publishes this event after a successful UPSERT:

```ts
await db.insert(chatAssignments).values({...}).onConflictDoUpdate({...});
await redis.publish(
  eventsChannel(userId),
  JSON.stringify({ type: 'chat-assignment', chatId, workspace, assignedAt }),
);
return reply.code(204).send();
```

Channel naming uses `eventsChannel()` from `@yank/shared` per invariant — never hand-formatted.

## 5. Data flow

### Source of truth

`useChats()` returns `Chat[]`; each `Chat` carries its `workspace` (already populated by M3's `GET /api/chats` join). Three pure selectors in `lib/queries.ts` read from this cache:

```ts
useChatsForWorkspace(ws)  // list filtered by workspace, hidden excluded
useTriageChats()          // workspace === 'triage', sorted by lastMessageAt DESC
useTriageCount()          // useTriageChats().length
```

No additional queries, no cache fan-out: all four views (triage list, sidebar, rail badge, palette) read from the same underlying `useChats()` cache and re-render on the same patch.

### Assignment write path

```
user clicks "Personal" / hits "2"
  ↓
useAssignWorkspace.mutate({ workspace: 'personal' })
  ├─ onMutate (optimistic):
  │    snapshot = qc.getQueryData(queryKeys.chats());
  │    previousWorkspace = snapshot?.find(c => c.id === chatId)?.workspace ?? 'triage';
  │    qc.setQueryData(queryKeys.chats(), (old) =>
  │      old?.map(c => c.id === chatId ? { ...c, workspace: 'personal' } : c)
  │    );
  │    if (!suppressUndo) showUndoToast({
  │      label: 'Moved to Personal',
  │      onUndo: () => mutate({ workspace: previousWorkspace, suppressUndo: true })
  │    });
  │    return { snapshot };  // for rollback
  ├─ onError: qc.setQueryData(queryKeys.chats(), context.snapshot); show error toast
  └─ onSettled: (no invalidate — SSE chat-assignment event reconciles)
```

The card disappears from `/triage` immediately because `useTriageChats()` excludes anything whose workspace ≠ `'triage'`. The same selector drives the empty-state transition.

### Undo path

`<UndoToast>` is a single-slot component bound to `useToastStore`:

```ts
{ label: string, onUndo: () => void, expiresAt: number } | null
```

- Auto-dismiss after 5 s (`setTimeout` cleared on user action, replacement, or unmount).
- `Cmd+Z` while the toast is visible invokes `onUndo`.
- A second assignment within the 5 s window **replaces** the toast (single-slot, latest-wins). Earlier assignments cannot be individually undone — same trade-off Slack and Linear make. Documented as expected behaviour.

The undo path calls `useAssignWorkspace.mutate({ workspace: previous, suppressUndo: true })` — same code path, just no second toast.

### SSE reconciliation

`useEventStream` adds one case:

```ts
case 'chat-assignment':
  qc.setQueryData(queryKeys.chats(), (old) =>
    old?.map(c => c.id === ev.chatId ? { ...c, workspace: ev.workspace } : c)
  );
  break;
```

In the **single-tab** common case, the optimistic write already wrote the same value — TanStack Query short-circuits identical writes, no flicker. In the **multi-tab** case, tab B receives the event and patches its own cache; the card vanishes from tab B's `/triage` automatically.

### Reactive arrival of new triage chats

When a brand-new contact messages the user, M2 already inserts a `chat_assignments` row with `workspace='triage'` and emits a `message` event. M3's cache patcher updates `useChats()`. The new chat appears in `useTriageChats()` immediately because the selector picks it up on next render. No new code in M4.

### Focus management

`TriageView` keeps `focusedIdx` as local `useState`. When the focused card is removed by an assignment, focus moves to `Math.min(focusedIdx, triageChats.length - 1)`. When the list empties, focus is dropped and the empty state takes over; tab order returns to the rail. New triage arrivals append to the end and do not shift the focus index.

## 6. File layout

### New (post-M3 → post-M4 diff)

```
packages/web/src/
  components/
    triage/                          ← NEW
      TriageView.tsx + .module.css
      TriageCard.tsx + .module.css
      TriageEmptyState.tsx + .module.css
      TriageProgressBar.tsx + .module.css
    primitives/
      UndoToast.tsx + .module.css    ← NEW
  hooks/
    useTriageKeys.ts                 ← NEW
  state/
    toast.ts                         ← NEW
```

### Modified

| File | Change |
|---|---|
| `packages/web/src/routes/triage.tsx` | Replace M3 stub with `<TriageView />` mount (~10 lines). |
| `packages/web/src/lib/queries.ts` | Add `useChatsForWorkspace`, `useTriageChats`, `useTriageCount` selectors. |
| `packages/web/src/lib/mutations.ts` | Widen `useAssignWorkspace` to full `Workspace`; add `onMutate` (snapshot + optimistic patch + show undo toast unless `suppressUndo`); `onError` rollback. |
| `packages/web/src/lib/eventStream.ts` | New case for `'chat-assignment'` → patch `useChats()` cache in place. |
| `packages/web/src/components/shell/Rail.tsx` | Read `useTriageCount()`; render red dot when > 0. |
| `packages/web/src/components/shell/Sidebar.tsx` | Switch chat source from `useChats()` to `useChatsForWorkspace(currentWorkspace)`. |
| `packages/web/src/components/palette/CommandPalette.tsx` | Quick-switcher excludes `hidden` chats. |
| `packages/web/src/routes/__root.tsx` | Mount `<UndoToast />` alongside the existing palette / scrim. |
| `packages/web/src/routes/index.tsx` | Confirm "redirect to last-active in current workspace" excludes hidden. |
| `packages/shared/src/dto.ts` | Export `AssignmentBodySchema` + `AssignmentBody`. |
| `packages/shared/src/events.ts` | Extend `DaemonEvent` union with `ChatAssignmentEvent`. |
| `packages/api/src/routes/chats.ts` | Add `POST /api/chats/:id/assignment` route. |

## 7. Visual treatment

Card grid per the design spec §9 "Triage flow" and the mockup at `docs/superpowers/specs/mockups/2026-05-14-claude-design/project/src/views.jsx` (`TriageView`, lines 41–149) and styles `triage-bar`, `triage-card`, `triage-actions`, `triage-btn` etc. (`docs/superpowers/specs/mockups/2026-05-14-claude-design/project/styles.css` lines 945–1011).

M4 ports those styles to CSS Modules under `components/triage/*.module.css`, drawing all colours from `tokens.css` (M3) — no magic hex literals. Card focus uses the existing `--c-triage` accent + `--c-triage-soft` halo from M3.

## 8. Error handling

| Failure | Behaviour |
|---|---|
| Network error on `POST /assignment` | `onError` rolls back optimistic patch from snapshot; replaces the (just-shown) undo toast with an error toast: *"Couldn't move chat — try again."* |
| `404` (chat no longer owned) | Same as network error; reachable only via a very stale tab. |
| `400` (invalid workspace) | Cannot happen via UI (TS + Zod prevent it); surfaces as the same error toast plus a logged warning. |
| SSE disconnects mid-assign | M3's `useEventStream` already refetches `useChats()` on reconnect → state reconciles automatically. No M4-specific handling. |
| API publishes event but Redis is down | `redis.publish` failure does not roll back the DB write (already committed). 204 honestly reports the persisted state; the other tab won't see the change until it refetches. Acceptable degradation; `/healthz` covers Redis. |

## 9. Edge cases (pinned for the implementer)

1. **Single-slot undo:** rapid `1` `2` `3` on three different cards → three optimistic writes, three POSTs, only the last toast is visible. Earlier assignments are not individually undoable. Expected; matches Slack/Linear.
2. **Self-assignment** (same workspace as current): server still UPSERTs (`assigned_at` advances) and still publishes the event. Client patches to the same value → no flicker.
3. **Workspace navigation mid-assign:** user assigns from `/triage` then `Cmd+1` to Work. `useTriageKeys` unmounts; `<UndoToast>` is mounted at `__root`, so undo still works from the new view.
4. **New triage chat arrives during pass:** appears at the bottom of `useTriageChats()` on next render; `focusedIdx` stays valid.
5. **Focus when triage clears:** focus is dropped; empty-state panel takes the visual focus; tab order returns to the rail.
6. **Hidden mid-conversation:** if a chat the user is currently viewing (`/c/:chatId`) is moved to `hidden` from another tab, the chat detail keeps rendering (route-driven), but the sidebar drops it. Acceptable; the next navigation closes the orphan view.

## 10. Testing

### API (Testcontainers, per M2 pattern)

`packages/api/test/chats.assignment.test.ts`:

- happy path → 204 + DB row UPSERTed + event arrives on `events:user:<u>`
- ownership → 404 for chat owned by a different user
- body validation → 400 for invalid workspace
- idempotency → repeat same body, same outcome
- undo sequence → POST `triage` after `personal` produces the expected event sequence

### Web component (Vitest + RTL + MSW, per M3 pattern)

- `TriageView.test.tsx` — renders all triage chats from fixture; `1`/`2`/`3` removes focused card and shows toast; `↑`/`↓` navigates focus; empty fixture → empty state; keyboard ignored when input focused
- `TriageCard.test.tsx` — renders structure (avatar, name, 3-line preview, 3 action buttons); clicking a button calls `onAssign` with the right workspace
- `UndoToast.test.tsx` — shows; auto-dismisses after 5 s (fake timers); Undo invokes callback; new toast replaces previous and clears prior timer
- `eventStream.test.ts` — `chat-assignment` event patches `useChats` cache in place
- `mutations.test.tsx` — optimistic patch + rollback on error; `suppressUndo` flag skips toast

### Shell (extend M3 tests)

- `Rail.test.tsx` — red dot when `useTriageCount() > 0`, gone otherwise
- `Sidebar.test.tsx` — filters by current workspace, excludes `hidden`

### E2E (Playwright)

One happy-path triage spec — navigate to `/triage`, hit `1`, assert the card disappears + count decrements + sidebar in Work workspace now contains it. Undo path included.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Multi-tab races between optimistic write and SSE event produce a brief flicker | TanStack Query's `setQueryData` is synchronous and short-circuits identical writes. The optimistic and SSE patches converge to the same value on the same key — no observable flicker in practice. Asserted in `eventStream.test.ts`. |
| Hidden chats are silently invisible — user accidentally hides a chat and can't recover | The 5 s undo toast covers the immediate-mistake case. Long-tail recovery is via the deferred `/settings/workspaces` view. The risk is documented as accepted scope. |
| The `useAssignWorkspace` widening (to allow `'triage'`) could be misused elsewhere as a "set to triage" affordance | Add a `suppressUndo` flag to the mutation so the only legitimate `triage`-bound caller is the undo path. Lint rule not necessary; review-time concern only. |
| `<UndoToast>` mounted at `__root` could conflict visually with the M3 command palette / scrim | Both are bottom-fixed in different positions; toast is bottom-center, palette is centered modal. Z-index ordering checked during component implementation. |

## 12. Open questions deferred to plan-writing time

- Exact CSS Module class names (mechanical; mirrors mockup).
- Whether `useTriageKeys` lives in `hooks/` or co-located with `TriageView` (cosmetic).
- Whether the api handler validates the body via `app.post` Zod schema-to-JSON-Schema bridge or via an inline `parse()` call (per M2's existing pattern in `chats.ts`).

These are implementation choices, not design choices — they belong in the plan, not here.
