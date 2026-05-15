# Yank — M4 Daily-Driver Foundation Design

**Status:** design (pre-plan).
**Author / date:** 2026-05-15.
**Predecessor:** M3 (merged to `main` at `c57c98c`; handover at [`docs/superpowers/notes/2026-05-15-m3-handover.md`](../notes/2026-05-15-m3-handover.md)).
**Supersedes:** the prior `docs/superpowers/specs/2026-05-14-yank-m4-triage-design.md` on branch `docs/m4-triage-spec` — its Triage cluster is reused mostly verbatim; M4 broadens scope to three additional clusters.
**Authoritative shapes:** [`docs/superpowers/specs/2026-05-14-yank-design.md`](2026-05-14-yank-design.md) §7 (schema), §8 (flows), §9 (frontend IA), §10 (resilience).

## 1. Goal

Make Yank feel like a daily driver. M3 shipped the chat shell and end-to-end messaging, but left three sharp edges:

1. **The spec's flagship Triage interaction** (card grid, `1`/`2`/`3` assignment) is still a route stub. Every chat lands in Triage and the user reclassifies one at a time via the `ChatTopbar` workspace pill.
2. **The composer + keyboard polish promised in the spec keyboard table** (`@mention` autocomplete, edit-last via `↑`, hover-`R`/`S`, `Cmd-T` / `Cmd-F` / `Cmd-Shift-A`) is missing.
3. **WhatsApp anti-abuse and CDN-expiry realities** discovered while exercising M3 end-to-end have no UI affordances. A disconnected daemon is silent; expired media re-floods on every scroll until manually killed.

**End state when M4 is complete:**

- `/triage` renders a card grid of every chat with `workspace='triage'`, sorted by `lastMessageAt DESC`. Cleared via mouse (Work / Personal / Hide) or keyboard (`1` / `2` / `3`). Optimistic assignment with a 5 s `<UndoToast>` (Click or `Cmd-Z`). Multi-tab SSE reconciliation.
- DM triage cards have an inline-editable display-name input. `PATCH /api/contacts/:id` broadcasts to all tabs.
- Composer supports `@mention` autocomplete (popover fed by `useChatMembers`), edit-last via `↑`, and full edit-message support via a hover-menu **Edit** action. Edits round-trip through Baileys' protocolMessage EDIT in both directions.
- `MessageRow` exposes hover shortcuts: `R` reply-in-thread, `S` star, plus the hover-menu **Edit** (own outbound only). The action strip appears in both the main view and the thread panel.
- Global shortcuts gain `Cmd-T` (quick-switcher, chats-only mode of the existing palette), `Cmd-F` (search-current-chat — inline filter bar), `Cmd-Shift-A` (mark-current-read).
- A top-of-shell **degradation banner** renders whenever the daemon is in `connecting` / `disconnected` / `linking-required` state, driven by SSE events that already flow.
- A **media-download circuit breaker** in the daemon clamps repeated `updateMediaMessage` failures with exponential backoff; the UI surfaces the paused state via a chip on affected tiles. Image tiles **flip to click-to-load** for parity with video / audio / doc.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass. Playwright smoke is extended with one triage happy-path. One drizzle migration: `messages.edited_at`.

## 2. Scope

### In M4

Four clusters, all shipped in one milestone.

**Cluster 1 — Triage** *(per prior `2026-05-14-yank-m4-triage-design.md`; preserved with minor cross-references)*

- `packages/api`: `POST /api/chats/:chatId/assignment` — UPSERT `chat_assignments` + publish `chat-assignment` on `events:user:<userId>`. Ownership check; Zod-validated body; idempotent.
- `packages/shared`:
  - `dto.ts` — export `AssignmentBodySchema` + `AssignmentBody`.
  - `events.ts` — extend `DaemonEventSchema` with `ChatAssignmentEvent`.
- `packages/web`:
  - Replace `/triage` stub with `<TriageView />` (card grid, top-bar count + progress, focused-card border, empty state).
  - `triage/` component family: `TriageView`, `TriageCard`, `TriageProgressBar`, `TriageEmptyState`.
  - Widen `useAssignWorkspace` to the full `Workspace` union (undo path needs `'triage'`); add optimistic patch + rollback + undo-toast trigger; `suppressUndo` flag for the undo-of-undo case.
  - New `<UndoToast>` primitive backed by single-slot `state/toast.ts` Zustand store; mounted at `__root`.
  - `useTriageKeys` hook (route-scoped — `1`/`2`/`3` assign focused; `j`/`k`/`↑`/`↓` navigate; `Cmd-Z` undo).
  - Pure selectors over `useChats()`: `useChatsForWorkspace(ws)`, `useTriageChats()`, `useTriageCount()`.
  - `eventStream.ts` handles `'chat-assignment'` → patch `useChats()` cache in place.
  - `Sidebar` switches from `useChats()` to `useChatsForWorkspace(currentWorkspace)`. `Hidden` excluded everywhere except the deferred recovery view.
  - `Rail` Triage button reads `useTriageCount()`; red-dot when > 0.
  - Command-palette quick-switcher drops `hidden` chats.

**Cluster 2 — Contact rename**

- `packages/api`: `PATCH /api/contacts/:contactId` body `{ displayName }` — ownership-checked, Zod-validated, idempotent. Returns 204; publishes `contact-update`.
- `packages/shared`: `ContactRenameBodySchema` + `ContactUpdateEvent` (added to `DaemonEventSchema`).
- `packages/web`:
  - `<TriageCard>` for `chat.isGroup === false` exposes the display name as a click-to-edit text input (Enter or blur commits; Esc reverts; empty submit → no-op). Group cards keep WhatsApp's `subject` (read-only).
  - `useUpdateContactName` mutation — optimistic patch on `useChats()` (carries joined name) and `useContact(contactId)` cache; rollback on error; error toast.
  - `eventStream.ts` handles `'contact-update'` → patch caches.
  - Inline-rename primitive co-located with `TriageCard` (no shared component yet — `ChatTopbar` click-to-rename is out of M4; cards alone close the M3 sparse-name pain).

**Cluster 3 — Composer & keyboard polish**

**3a. Edit-message (full)**

- DB migration (`packages/db`): add `messages.edited_at TIMESTAMP NULL`. No backfill (NULL = "never edited"). Drizzle migration generated + applied.
- `packages/shared`:
  - `dto.ts` — `EditMessageBodySchema` (`{ text: string min(1) }`).
  - `events.ts` — `MessageEditEvent` and `MessageEditFailedEvent` added to `DaemonEventSchema`.
  - `commands.ts` (or wherever command schemas live) — `EditMessageCommand` (`{ type: 'edit-message', messageId, waMessageId, chatJid, text }`).
- `packages/api`:
  - `POST /api/messages/:messageId/edit` — ownership-check; read the row, refuse if `wa_message_id IS NULL` (still sending) with 409; refuse if `is_outgoing === false` with 403; else `XADD` an `edit-message` command on `commands:user:<userId>` and 202.
- `packages/daemon`:
  - `connector-baileys.ts` — `editMessage(jid, key, text)` builds Baileys' edit protocolMessage (`sock.sendMessage(jid, { text, edit: key })`).
  - Outbound consumer (in `index.ts` or equivalent) handles the new command alongside `send-message`.
  - On Baileys success: DB `UPDATE messages SET text = $1, edited_at = NOW() WHERE id = $2`; publish `message-edit` event with new text + `editedAt`.
  - On Baileys failure: publish `message-edit-failed` with `{ messageId, reason }` (`'too-old' | 'protocol' | 'network'`).
  - `normalize.ts` — extend `messages.update` / protocolMessage handling to recognise inbound EDIT alongside the existing REVOKE handler: update DB row + publish `message-edit`.
- `packages/web`:
  - `MessageRow` shows `(edited)` suffix when `editedAt != null`.
  - New `useEditMessage` mutation; optimistic patch on `useMessages()` cache (text + `editedAt`); SSE reconciles to canonical state. On `message-edit-failed`, render a small "Edit failed — retry" affordance on the row for ~10 s.
  - Composer enters **edit mode** when `useUiStore.editing` is set: textarea value swaps to message text; small banner "Editing — Esc to cancel"; `Enter` commits, `Esc` reverts. `Shift-Enter` newline as in normal send.
  - `↑` in empty focused composer enters edit-mode on the most recent own outbound in current chat.

**3b. `@mention` autocomplete**

- `<MentionPopover>` anchored to the composer textarea. Triggers on `@`; substring filter over `useChatMembers(chatId)`; arrow keys navigate; `Enter` / `Tab` insert; `Esc` dismisses. Up to ~8 hits.
- Inserts plain text `@<displayName>` plus a tracked `Mention[]` in composer state (`{ start, end, jid }`).
- Send-time JID resolution: composer's send handler turns the `Mention[]` into Baileys `contextInfo.mentionedJid`. Ambiguous names (same `displayName` twice in a group) resolve to the first match — documented limitation, acceptable for v1.
- `@lid` members are surfaced as `@Unknown (lid)` and remain selectable.

**3c. Hover & keyboard shortcuts**

- `<MessageRowActions>` action strip on `MessageRow` hover. Renders **Edit** (own only) · **Reply in thread** (`R` keybind hint) · **Star** (`S` keybind hint). Same component renders in main view and thread panel.
- Global key handler additions:
  - Hover `R` → open thread on hovered message.
  - Hover `S` → toggle `useStar` on hovered message.
  - `Cmd-T` → open command palette in **chats-only** mode (prop on the existing palette; not a duplicate component).
  - `Cmd-F` → open `<ChatFilterBar>` over `MessageList` (inline substring filter on loaded window; Enter / Shift-Enter cycle hits; Esc closes).
  - `Cmd-Shift-A` → `markRead(currentChatId)`.
- "Ignore shortcuts when typing" check already in M3's `useKeyboardShortcuts`; extended to also ignore when the inline rename input is focused.

**Cluster 4 — Resilience surfacing**

**4a. Degradation banner**

- New `useConnectionStore` Zustand slice fed by SSE `connection-update` events (already published per M3).
- States: `connected` | `connecting` | `disconnected` | `linking-required`.
- `<DegradationBanner>` at the top of `__root.tsx`; hidden when `connected`; soft color for `connecting`; warning color for `disconnected`; clickable in `linking-required` (navigates to `/setup`).
- 10 s post-connect grace: if no event arrives, assume `disconnected` (avoids stale-cache lies).

**4b. Media circuit breaker (daemon)**

- Sliding-window counter in `packages/daemon/src/download.ts`: ≥ 3 timeouts within 60 s → state `open`.
- While `open`: new `media-download` commands respond instantly with `failureReason: 'paused'`; a half-open probe is scheduled after the cooldown (default 5 min).
- Probe outcomes: success → `closed`; failure → re-open with `cooldown × 2`, capped at 30 min.
- New SSE event `media-breaker-state` (`{ state, retryAt? }`) so all tabs converge.
- Manual retry path: a user click on a paused media tile sends a one-shot download command with `bypassBreaker: true`. Surfaces "Retry" affordance in UI.

**4c. Click-to-load image tile**

- Drop the `IntersectionObserver` auto-fetch in `MediaImage`. Replace with a tap target. State machine: `queued` → click → `downloading` → `ready` | `failed` | `expired` | `paused`. Same UX shape as `MediaDoc` / `MediaVoiceNote`.

### Out of M4 (deferred)

| Item | Deferred to | Reason |
|---|---|---|
| Per-chat re-assignment menu in `ChatTopbar` (move chat to Triage from any chat view) | post-v1 | `Cmd-K` quick-switcher + 5 s undo toast cover the dominant case. |
| Bulk Triage operations ("Hide all remaining") | post-v1 | At expected scale (≤ ~50 first-run, ~1 / day) bulk affordances aren't needed. |
| Touch-swipe gestures on `<TriageCard>` | M6 mobile polish | Cards remain tap-friendly. |
| `/hidden` recovery view, `/settings/workspaces` | post-v1 | `Hidden` is "mute + forget"; 5 s undo mitigates accidental hides. |
| Search results + filter chips | M5 | Stub route exists; FTS GIN indexes already in schema. |
| Saved messages view | M5 | Stub route + `stars` table + `useStar` mutation already exist. |
| Edit history (preserve original text) | post-v1 | M4 overwrites `text` in place — same trade-off M3 made for REVOKE. |
| PWA install, service worker, Web Push, in-page `Notification.show()` | M6 | Notifications milestone. |
| Paste-to-attach + drag-and-drop file upload in composer | M6 | Needs media upload endpoint. |
| Media playback (voice notes, video, sticker rendering, image lightbox) | M6 | media-worker milestone. |
| `ChatTopbar` click-to-rename | post-v1 | Triage-card inline rename closes the M3 sparse-name pain alone. |

### Cross-cutting non-goals

- M4 does not modify the existing `useKeyboardShortcuts` table beyond additions. The M3 set (`Cmd-K`, `Cmd-1/2/3`, `Cmd-Shift-F`, `Esc`) is preserved.
- No multi-user work (single hard-coded user per design spec §12).
- No light-theme polish (dark is the production target).

## 3. Architectural fit

M4 stays inside the three load-bearing invariants from [`CLAUDE.md`](../../../CLAUDE.md) and the design spec §4.

**Invariant 1 — Daemon ↔ Redis only.**
- Triage assignment, contact rename, hover `R`/`S`, keyboard shortcuts, degradation banner — all UI-level state, never touch the daemon.
- Edit-message **does** touch the daemon, but through the existing transport: api `XADD`s an `edit-message` command on `commands:user:<userId>`; daemon `XREAD`s it like every other outbound. New command type, same channel; no new transport.
- Inbound EDIT (phone → server): handled in `normalize.ts` on top of the existing `messages.update` / protocolMessage path, alongside the M3 REVOKE handler.
- Channel names continue to come from `eventsChannel()` / `commandsStream()` in `@yank/shared` — no hand-formatting.

**Invariant 2 — Multi-user-shaped schema.**
- One new column: `messages.edited_at TIMESTAMP NULL`. Row already carries `user_id`. No new tables.
- `chat_assignments` is unchanged (M3 schema).

**Invariant 3 — Library boundary (Baileys only in daemon).**
- Edit send: `connector-baileys.ts` builds the protocolMessage via `sock.sendMessage(jid, { text, edit: key })` (Baileys 6.7.21+).
- Edit inbound: `normalize.ts` extends the existing `messages.update` switch.
- api and web never touch Baileys types — they consume the normalised `EditMessageCommand` shape and the `MessageEditEvent` shape from `@yank/shared`.

**Single source of truth pattern preserved.**
The M3 cache structure (`useChats()` for chat list, `useMessages()` for a chat's messages, `useChatMembers()` for group membership, `useContact()` for individual contact metadata) is the only state. Every M4 view is a derived selector or a patched cache, not a new query.

## 4. API contracts

### 4.1 REST

```
POST /api/chats/:chatId/assignment
Body: { workspace: 'work' | 'personal' | 'triage' | 'hidden' }
→ 204 No Content                 (UPSERT applied; SSE chat-assignment published)
→ 400 Bad Request                (Zod validation failure)
→ 404 Not Found                  (chat not owned by current user)
```

```
PATCH /api/contacts/:contactId
Body: { displayName: string min(1) max(80) }
→ 204 No Content                 (UPDATE applied; SSE contact-update published)
→ 400 Bad Request
→ 404 Not Found
```

```
POST /api/messages/:messageId/edit
Body: { text: string min(1) max(65000) }
→ 202 Accepted                   (edit-message command enqueued; SSE message-edit on completion)
→ 400 Bad Request                (validation; or message is older than 15 min — server-side check optional, see §10)
→ 403 Forbidden                  (message is inbound — cannot edit foreign messages)
→ 404 Not Found
→ 409 Conflict                   (wa_message_id IS NULL — message still sending)
```

Idempotency: `POST /assignment` is idempotent (same body = no-op write at the row level but advances `assigned_at`). `PATCH /contacts` is idempotent. `POST /messages/:id/edit` is **not** idempotent at the command-stream level; duplicate submissions are deduplicated by Baileys' message-id, but the daemon publishes one `message-edit` per accepted edit.

Body schemas are exported from `@yank/shared/src/dto.ts` and consumed by both api and web (so a client/server drift on the shape is a TypeScript error, not a runtime error).

### 4.2 SSE events (new variants on `DaemonEventSchema`)

All extend the existing `Base` schema (which carries `userId`).

```ts
ChatAssignmentEvent      { type: 'chat-assignment',    chatId, workspace, assignedAt }
ContactUpdateEvent       { type: 'contact-update',     contactId, displayName, updatedAt }
MessageEditEvent         { type: 'message-edit',       messageId, text, editedAt }
MessageEditFailedEvent   { type: 'message-edit-failed', messageId, reason }    // 'too-old' | 'protocol' | 'network'
MediaBreakerStateEvent   { type: 'media-breaker-state', state, retryAt? }      // 'open' | 'closed' | 'half-open'
```

`reason` literal union and `state` literal union are exported from `@yank/shared` so handlers exhaust the switch.

Channel names use `eventsChannel(userId)`.

### 4.3 Commands (new variant on `DaemonCommandSchema`)

```ts
EditMessageCommand       { type: 'edit-message', messageId, waMessageId, chatJid, text }
```

`messageId` is the local UUID; `waMessageId` is the WhatsApp message id; `chatJid` is the chat's JID. The api fills all three from the row before publishing — daemon does no extra lookup.

## 5. Data flow

### 5.1 Triage assignment

(Unchanged from prior spec; reproduced for completeness.)

```
user clicks "Personal" / hits "2"
  ↓
useAssignWorkspace.mutate({ chatId, workspace: 'personal' })
  ├─ onMutate (optimistic):
  │    snapshot = qc.getQueryData(queryKeys.chats());
  │    previousWorkspace = snapshot?.find(c => c.id === chatId)?.workspace ?? 'triage';
  │    qc.setQueryData(queryKeys.chats(), old =>
  │      old?.map(c => c.id === chatId ? { ...c, workspace: 'personal' } : c)
  │    );
  │    if (!suppressUndo) showUndoToast({
  │      label: 'Moved to Personal',
  │      onUndo: () => mutate({ chatId, workspace: previousWorkspace, suppressUndo: true })
  │    });
  │    return { snapshot };
  ├─ onError: qc.setQueryData(queryKeys.chats(), context.snapshot); show error toast
  └─ onSettled: no invalidate — SSE `chat-assignment` reconciles
```

Single-tab common case: optimistic write + SSE patch converge to identical value → no flicker. Multi-tab: tab B receives the event and patches its own cache; the card vanishes from tab B's `/triage` automatically.

### 5.2 Contact rename

```
user types new name on TriageCard input → blurs / Enter
  ↓
useUpdateContactName.mutate({ contactId, displayName })
  ├─ onMutate:
  │    chatsSnapshot = qc.getQueryData(queryKeys.chats());
  │    contactSnapshot = qc.getQueryData(queryKeys.contact(contactId));
  │    patch both caches with the new displayName.
  └─ onError: rollback both caches; error toast.
  ↓
PATCH /api/contacts/:contactId  { displayName }
  ↓
api: ownership-check; UPDATE contacts SET display_name = $1, updated_at = NOW();
  ↓
api: publish ContactUpdateEvent on events:user:<userId>
  ↓
all tabs (incl. originator) handle 'contact-update' → patch chats + contact caches.
```

### 5.3 Edit-message — write path (browser → phone)

```
user opens edit (↑ shortcut or hover-menu Edit) → composer enters edit mode
  ↓ submit
useEditMessage.mutate({ messageId, text })
  ├─ onMutate (optimistic):
  │    snapshot = qc.getQueryData(queryKeys.messages(chatId));
  │    patch: row.text = newText, row.editedAt = new Date().toISOString();
  └─ onError: rollback; "Edit failed — retry" affordance for 10 s.
  ↓
POST /api/messages/:id/edit  { text }
  ↓
api: ownership; read row (wa_message_id, chat_jid, is_outgoing); validate.
  ↓
api: XADD commands:user:<userId> { type: 'edit-message', messageId, waMessageId, chatJid, text }
  ↓ 202
daemon: XREAD pulls the command → connector.editMessage(jid, key, text)
  ↓ Baileys protocolMessage EDIT
WhatsApp acknowledges → daemon UPDATE messages SET text, edited_at = NOW(); XACK.
  ↓
daemon: publish MessageEditEvent on events:user:<userId>.
  ↓
all tabs handle 'message-edit' → patch useMessages() cache to canonical state.
```

The optimistic patch already wrote the same text + a slightly earlier `editedAt`. TanStack's `setQueryData` short-circuits identical-value writes; the `editedAt` may shift by tens of ms (no observable flicker).

### 5.4 Edit-message — read path (phone → browser)

User edits a message on the phone. WhatsApp delivers a protocolMessage EDIT on `messages.update`:

```
Baileys messages.update event
  ↓ daemon connector
normalize.ts: detect EDIT protocolMessage (Baileys' message-edit semantics)
  ↓
UPDATE messages SET text = $newText, edited_at = NOW() WHERE wa_message_id = $key;
  ↓
publish MessageEditEvent  → same handler as 5.3.
```

No new client code — the SSE handler from 5.3 is the only consumer.

### 5.5 `@mention` autocomplete & send-time JID resolution

Composer maintains `mentions: Mention[]` where `Mention = { start, end, jid }`.

```
user types '@'
  ↓
<MentionPopover> opens, anchored to caret; filter = '' (all members).
  ↓
user types more → filter substring; arrow keys move selection; Enter / Tab inserts.
  ↓
insertion: replace '@<query>' with '@<displayName>' in textarea;
           push { start, end: start + len, jid } to composer.mentions.
  ↓ user sends
sendMessage payload: { text, mentions: composer.mentions.map(m => m.jid) }
  ↓ api → daemon → Baileys contextInfo.mentionedJid = [...jids]
```

Ambiguity (same display name in a group twice) tie-breaks by first match. Documented limitation; no UI prompt — the post-v1 fix is a hidden-token system in the textarea.

`@lid` members render as `@Unknown (lid)` in the popover; their `jid` is the `@lid` jid, passed through unchanged.

### 5.6 Hover & keyboard shortcuts

- Hover `R` / `S` are handled by a `MessageRowActions` event listener bound at `MessageRow` while the row is hovered. Listeners detach on `mouseleave`.
- Hover `R` opens the existing `ThreadPanel` route (`navigate({ to: '/c/$chatId/t/$messageId' })`).
- Hover `S` calls the existing `useStar` mutation.
- `Cmd-T` opens `<CommandPalette mode="chats-only" />` — single prop branch in the existing palette to filter out command rows. No new component.
- `Cmd-F` opens `<ChatFilterBar />` over `MessageList`; the bar reads the message list's loaded window (no FTS request) and tracks current hit index. `Enter` / `Shift-Enter` cycle; `Esc` closes.
- `Cmd-Shift-A` calls `markRead(currentChatId)` (existing mutation).

Global handler ignores keystrokes when an input / textarea / `[contenteditable]` is focused — already implemented in M3.

### 5.7 Degradation banner

```
daemon connection-update event (already published in M3)
  ↓ web eventStream.ts
useConnectionStore.setState({ status })
  ↓
<DegradationBanner /> in __root.tsx renders when status !== 'connected'.
```

Initial state on first SSE stream open: `connecting`. If no `connection-update` event arrives within 10 s of the stream becoming readable, flip to `disconnected` — protects against the daemon-down case where the api's SSE endpoint is still up but the daemon has no state to report.

### 5.8 Media circuit breaker

```
download.ts maintains:
  recentFailures: number    // count within sliding 60 s window
  state: 'closed' | 'open' | 'half-open'
  retryAt: Date | null
  currentCooldownMs: number // doubles on each re-open, capped at 30 min

on each updateMediaMessage timeout:
  if state === 'closed' and recentFailures+1 >= 3:
    state = 'open'; currentCooldownMs = 5 min; retryAt = now + cooldown
    publish MediaBreakerStateEvent({ state: 'open', retryAt })
    schedule setTimeout(probe, currentCooldownMs)

probe:
  state = 'half-open'
  attempt one queued (or synthesised) download; bypass count.
  on success: state = 'closed'; recentFailures = 0; currentCooldownMs = 5 min; publish event.
  on failure: currentCooldownMs = min(currentCooldownMs * 2, 30 min);
              state = 'open'; retryAt = now + currentCooldownMs;
              publish event; schedule probe again.

handling new media-download commands:
  if state === 'open': respond immediately failureReason='paused'; do NOT call Baileys.
  if state === 'closed' or 'half-open': proceed normally.
  if command carries bypassBreaker === true (user manual retry): proceed regardless.
```

Web side: `<MediaImage>`, `<MediaDoc>`, `<MediaVoiceNote>` subscribe to `useMediaBreakerState()`. When `open`, render an inline chip on `queued` / `paused` tiles: "Downloads paused, retrying in Xm". The `retryAt` is a server-canonical timestamp; tabs compute the countdown locally.

### 5.9 Click-to-load image tile

- `<MediaImage>` becomes the same shape as `<MediaDoc>`: a placeholder showing filename / dimensions / size with a "Tap to load" button.
- On click → sends a `media-download` command via the existing endpoint.
- State transitions: `queued` → `downloading` (spinner) → `ready` (shows image) | `failed` (retry button) | `expired` (no retry, "Media no longer available") | `paused` (breaker chip).
- The IntersectionObserver in `MediaImage` is removed entirely.

## 6. Schema changes

One drizzle migration. Generated via `pnpm --filter @yank/db drizzle:generate`, applied via `pnpm --filter @yank/db drizzle:migrate`.

```ts
// packages/db/src/schema/messages.ts (extended)
editedAt: timestamp('edited_at', { withTimezone: true }),
```

NULL means "never edited". No backfill. No index needed (not queried by `edited_at`).

## 7. File layout

### 7.1 New files

```
packages/db/drizzle/
  XXXX_add_messages_edited_at.sql

packages/api/src/routes/
  contacts.ts                          ← NEW (PATCH /api/contacts/:id)

packages/daemon/src/
  circuit-breaker.ts                   ← NEW (sliding-window state machine; breaker primitive)

packages/web/src/
  components/
    triage/                            ← NEW
      TriageView.tsx + .module.css
      TriageCard.tsx + .module.css
      TriageEmptyState.tsx + .module.css
      TriageProgressBar.tsx + .module.css
    chat/
      MessageRowActions.tsx + .module.css   ← NEW (hover action strip)
      ChatFilterBar.tsx + .module.css       ← NEW (Cmd-F bar)
      MentionPopover.tsx + .module.css      ← NEW
    shell/
      DegradationBanner.tsx + .module.css   ← NEW
    primitives/
      UndoToast.tsx + .module.css           ← NEW (per prior spec)
      InlineRename.tsx + .module.css        ← NEW (used by TriageCard; could later mount on ChatTopbar)
  hooks/
    useTriageKeys.ts                        ← NEW
    useChatFilter.ts                        ← NEW
    useMentionAutocomplete.ts               ← NEW
  state/
    toast.ts                                ← NEW (per prior spec)
    connection.ts                           ← NEW (degradation banner)
    mediaBreaker.ts                         ← NEW
```

### 7.2 Modified files

| File | Change |
|---|---|
| `packages/shared/src/dto.ts` | `AssignmentBodySchema`, `ContactRenameBodySchema`, `EditMessageBodySchema`. |
| `packages/shared/src/events.ts` | Extend `DaemonEventSchema` with 5 new variants. |
| `packages/shared/src/commands.ts` (or equivalent) | Extend command union with `EditMessageCommand`. |
| `packages/db/src/schema/messages.ts` | Add `editedAt` column. |
| `packages/api/src/routes/chats.ts` | Add `POST /:id/assignment` (per prior spec); wire ownership + SSE publish. |
| `packages/api/src/routes/contacts.ts` | New file. `PATCH /:id`. |
| `packages/api/src/routes/messages.ts` | Add `POST /:id/edit` — enqueues `edit-message` command. |
| `packages/daemon/src/connector-baileys.ts` | `editMessage(jid, key, text)`; subscribe to `messages.update` EDIT branch via `normalize.ts`. |
| `packages/daemon/src/index.ts` (or stream consumer) | Handle `edit-message` command alongside `send-message`. |
| `packages/daemon/src/normalize.ts` | EDIT branch in protocolMessage handler. |
| `packages/daemon/src/download.ts` | Wrap downloads in circuit breaker; emit `media-breaker-state` events. |
| `packages/web/src/routes/__root.tsx` | Mount `<UndoToast />` and `<DegradationBanner />`. |
| `packages/web/src/routes/triage.tsx` | Replace stub with `<TriageView />` mount. |
| `packages/web/src/lib/queries.ts` | `useChatsForWorkspace`, `useTriageChats`, `useTriageCount` selectors. |
| `packages/web/src/lib/mutations.ts` | Widen `useAssignWorkspace`; add `useUpdateContactName`, `useEditMessage`. |
| `packages/web/src/lib/eventStream.ts` | Handlers for `chat-assignment`, `contact-update`, `message-edit`, `message-edit-failed`, `media-breaker-state`. |
| `packages/web/src/components/shell/Rail.tsx` | Read `useTriageCount()`; red-dot when > 0. |
| `packages/web/src/components/shell/Sidebar.tsx` | Switch to `useChatsForWorkspace(currentWorkspace)`. |
| `packages/web/src/components/palette/CommandPalette.tsx` | `mode` prop (chats-only); exclude hidden chats. |
| `packages/web/src/components/chat/MessageRow.tsx` | Render `(edited)` suffix; mount `<MessageRowActions />`; pass `messageId` to action strip. |
| `packages/web/src/components/chat/Composer.tsx` | Edit-mode banner; `↑`-empty enters edit; `@` triggers `<MentionPopover />`; track `mentions`. |
| `packages/web/src/components/chat/ChatView.tsx` | Mount `<ChatFilterBar />` (Cmd-F). |
| `packages/web/src/components/chat/MediaImage.tsx` | Drop IntersectionObserver; click-to-load. |
| `packages/web/src/components/chat/Media*.tsx` | Subscribe to `useMediaBreakerState()`; render paused chip when breaker open. |
| `packages/web/src/hooks/useKeyboardShortcuts.ts` | Add `Cmd-T`, `Cmd-F`, `Cmd-Shift-A`. |

## 8. Visual treatment

- **Triage card grid** per design spec §9 "Triage flow" and the mockup in `docs/superpowers/specs/mockups/2026-05-14-claude-design/project/src/views.jsx` (`TriageView`, lines 41–149) with styles `triage-bar`, `triage-card`, `triage-actions`, `triage-btn` (`docs/superpowers/specs/mockups/2026-05-14-claude-design/project/styles.css` lines 945–1011). Ported to CSS Modules under `components/triage/*.module.css`, drawing all colours from `tokens.css` — no magic hex.
- **Inline rename** uses the M3 input primitive's visual language; appears as a borderless text field that gains a 1 px underline on focus.
- **Hover action strip** is a 28 px-tall floating bar at the row's right edge; fades in (~100 ms) on row hover; iconography from M3's 35-icon registry.
- **Edit-mode banner** in composer is a soft-coloured strip above the textarea, "Editing — Esc to cancel" with a small "View original" disabled stub (kept for post-v1 history support).
- **Degradation banner** is a 32 px-tall strip with token-driven background per state: `--c-warn-soft` for `disconnected`, `--c-info-soft` for `connecting`, `--c-accent-soft` (clickable) for `linking-required`.
- **Media paused chip** is a small pill rendered on `queued` / `paused` tiles, soft-coloured, countdown text.

## 9. Error handling

| Failure | Behaviour |
|---|---|
| Network error on Triage assignment | Roll back optimistic patch from snapshot; replace undo toast with error toast: "Couldn't move chat — try again." |
| 404 on Triage assignment | Same as network error; reachable only via a very stale tab. |
| Network error on contact rename | Roll back patches on `useChats()` + `useContact()`; error toast. |
| Empty-string rename submit | Treat as no-op (revert input to current name); no API call. |
| Edit-message — api → daemon command write fails | 5xx; surface as error toast; composer stays in edit mode for retry. |
| Edit-message — daemon → Baileys send fails | Daemon publishes `message-edit-failed` with `reason`; web shows per-row "Edit failed — retry" affordance for ~10 s. |
| Edit on `@lid` / older-than-15-min / unsupported message | Baileys rejects → daemon publishes `message-edit-failed` with `reason: 'too-old'` or `'protocol'`; toast surfaces the reason. |
| Edit while still sending (`wa_message_id IS NULL`) | api returns 409 immediately; toast: "Message is still sending — edit when delivered." Composer stays in edit mode (text preserved). |
| `@mention` autocomplete on group with `@lid` members | Show as `@Unknown (lid)`; selectable; passes the lid jid through. |
| SSE disconnects mid-operation | M3's reconnect logic + initial-data refetch reconciles. No M4-specific handling for any of these flows. |
| Redis publish failure after a successful DB write | DB write is committed; api returns 204/202 honestly. Other tabs miss the event until their next refetch. Acceptable degradation; `/healthz` covers Redis. |
| Daemon never publishes `connected` after restart | 10 s grace timer flips the banner to `disconnected`. Reconnects when first event arrives. |
| Media circuit breaker re-opens during probe | Cooldown doubles, capped at 30 min. User can always manually retry via tile click (`bypassBreaker: true`). |

## 10. Edge cases pinned for the plan

1. **Single-slot undo.** Rapid `1` `2` `3` on three cards → three optimistic writes, three POSTs, only the latest toast visible. Earlier assignments are not individually undoable. Matches Slack / Linear.
2. **Self-assignment** (same workspace as current): server still UPSERTs and publishes the event; client patches to identical value → no flicker.
3. **Triage card name edit + assignment in same gesture.** While the inline name input is focused, `1`/`2`/`3` shortcuts are suppressed (extends M3's "ignore shortcuts when typing" check). User must blur to assign.
4. **Workspace navigation mid-assign.** User assigns from `/triage` then `Cmd-1` to Work. `useTriageKeys` unmounts; `<UndoToast>` is mounted at `__root` → undo still works from the new view.
5. **New triage chat arrives during pass.** Appears at the bottom of `useTriageChats()` on next render; `focusedIdx` stays valid.
6. **Focus when triage clears.** Focus is dropped; empty-state panel takes the visual focus; tab order returns to the rail.
7. **Hidden mid-conversation.** If a chat the user is viewing is moved to `hidden` from another tab, the chat detail keeps rendering (route-driven); sidebar drops it. Next navigation closes the orphan view.
8. **Edit-window cliff (WhatsApp's 15-min edit limit).** Server-enforced; clients can't preview cleanly. M4 doesn't gate the UI — user attempts and surfaces the rejection. A small tooltip on the Edit menu item notes "messages older than 15 min cannot be edited."
9. **Edit during outbound retry.** A row with `wa_message_id IS NULL` is mid-send. api returns 409; composer stays in edit mode.
10. **Hover `R`/`S` in the thread panel.** Same `MessageRow` renders in both contexts; the action strip works identically. No extra logic.
11. **`Cmd-T` vs `Cmd-K`.** Distinct shortcuts. `Cmd-T` opens the palette in **chats-only** mode (single prop on the existing palette).
12. **`Cmd-F` window-bound.** Filter only searches the currently-loaded message window. Full-chat / cross-chat search is M5. The bar shows hit count + "load more" hint when at the window edge.
13. **`@mention` insertion at end of string.** When inserting via Enter/Tab and the caret is at end, append a space after `@displayName` to make further typing feel natural.
14. **Circuit breaker reset on daemon restart.** Breaker state lives in-process. On daemon restart, state resets to `closed`. Acceptable; restarts are rare and the breaker re-trips quickly if WA is still throttling.
15. **`media-breaker-state` event on web-tab reconnect.** Daemon should publish current breaker state on `connection-update`-like events so new tabs / reconnects get the canonical state. Pin as a plan-time decision: either piggyback on `connection-update` or expose `GET /api/media/breaker-state`. The latter is cleaner.

## 11. Testing

### 11.1 `packages/api` (Vitest + Testcontainers, per M2 pattern)

- `chats.assignment.test.ts` — happy path → 204 + DB row UPSERTed + event arrives on `events:user:<u>`; ownership 404; validation 400; idempotent repeat; undo sequence (`triage` after `personal`).
- `contacts.rename.test.ts` — happy path → 204 + DB update + `contact-update` event; ownership 404; validation 400.
- `messages.edit.test.ts` — happy path → 202 + command on stream; ownership 404; not-own 403; still-sending 409; validation 400.

### 11.2 `packages/daemon` (Vitest, faked Baileys connector)

- `circuit-breaker.test.ts` — sliding-window state machine: opens after threshold; half-open probe; re-open with exponential backoff capped at 30 min; reset on success.
- `download.test.ts` — paused-state response when breaker open; bypass via `bypassBreaker`; `media-breaker-state` events published on state changes.
- `normalize.test.ts` — protocolMessage EDIT branch sets `text` + `edited_at` + publishes `message-edit`.

### 11.3 `packages/web` (Vitest + RTL + MSW, per M3 pattern)

- Triage suite (per prior spec): `TriageView`, `TriageCard`, `UndoToast`, `eventStream` `chat-assignment`, `mutations` optimistic + rollback.
- `TriageCard.rename.test.tsx` — click name → input → blur commits → mutation fired; Esc reverts; empty submit is no-op; groups have no edit affordance.
- `Composer.edit.test.tsx` — `↑` in empty composer loads last own outbound; hover-menu Edit loads target message; Esc exits edit mode; Enter submits via `useEditMessage`; failure shows retry affordance.
- `MentionPopover.test.tsx` — `@` triggers; arrow keys + Enter insert; `Esc` dismisses; ambiguity tie-break documented; `@lid` rendering.
- `MessageRowActions.test.tsx` — hover shows strip; click Edit / R / S triggers the right action; works in thread panel.
- `Rail.test.tsx` (extension) — red dot when `useTriageCount() > 0`.
- `Sidebar.test.tsx` (extension) — filters by current workspace; excludes `hidden`.
- `DegradationBanner.test.tsx` — renders on `disconnected`; hides on `connected`; clickable on `linking-required`; 10 s grace timer.
- `MediaImage.click-to-load.test.tsx` — placeholder until click; click fires download; renders breaker chip when paused.
- `ChatFilterBar.test.tsx` — `Cmd-F` opens; type filters; Enter cycles; Esc closes.
- `eventStream.test.ts` (extension) — handlers for all 5 new event types.

### 11.4 E2E (Playwright)

Extend M3's existing smoke with a triage happy-path: navigate to `/triage`, hit `1`, assert card disappears + count decrements + sidebar (in Work) gains the chat. Undo path included.

### 11.5 Not tested in CI

Live WhatsApp edit roundtrips, real circuit-breaker timing against WA's edge. Same posture as M2 / M3 — manual smoke on the real link is the safety net.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Multi-tab races between optimistic write and SSE event produce a brief flicker | Tan­Stack `setQueryData` is synchronous and short-circuits identical writes. Asserted in `eventStream.test.ts`. |
| Hidden chats are silently invisible — user accidentally hides and can't recover | 5 s undo toast for the immediate case. Long-tail recovery is via the deferred `/settings/workspaces`. Documented as accepted scope. |
| `useAssignWorkspace` widening (to allow `'triage'`) is misused as a "set to triage" affordance | `suppressUndo` flag isolates the legitimate undo-only caller; review-time concern. |
| Edit-message hover-menu conflicts with M3's existing row hover styling | Visual review at component implementation time; tokens-driven styles share the same palette. |
| `@mention` JID resolution is wrong for duplicate display names | Documented limitation; first-match policy; users with strict needs use unique names. Post-v1 fix is a hidden-token system. |
| Edit-message protocolMessage support varies by Baileys version | Pinned at 6.7.21 (current); upgrade with care. The `connector-baileys.test.ts` exercises the edit path against a fake socket. |
| Circuit breaker is too eager and pauses legitimate downloads | Threshold (3 in 60 s) and base cooldown (5 min) are conservative; user can always manually retry. Tunable via env vars (plan to expose). |
| Degradation banner false-positives during transient SSE blips | 10 s grace timer + the api's `/healthz` probe provide ground truth on the next page navigation. |
| `Cmd-F` only searches the loaded window — confusing UX | Bar shows hit count + "load more" hint when at the window edge. Cross-window search is M5. |

## 13. Open questions deferred to plan-writing time

- Whether `<UndoToast>` and `<DegradationBanner>` share a positioning primitive (both are top/bottom fixed). Cosmetic.
- Whether `circuit-breaker.ts` is a standalone primitive in `packages/daemon/src/` or co-located with `download.ts`. The breaker may later wrap `editMessage` retries too.
- Exact CSS Module class names (mechanical; mirror mockup where applicable).
- Whether `useTriageKeys` lives in `hooks/` or co-located with `TriageView` (cosmetic).
- Whether the api validates bodies via Fastify's Zod-to-JSON-Schema bridge or via inline `parse()` calls (per M2's existing pattern in `chats.ts`). Pick whichever is already dominant.
- Whether `bypassBreaker` is a body field on the download command or a separate command type. Body field is simpler.
- Whether to expose `GET /api/media/breaker-state` for fresh-tab reconciliation, or piggyback on `connection-update`. The endpoint is cleaner.

These are implementation choices, not design choices — they belong in the plan, not here.
