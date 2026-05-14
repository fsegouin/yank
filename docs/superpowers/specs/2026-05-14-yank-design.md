# Yank — v1 design

> *"Pulls the slack out of WhatsApp."*

- **Project name:** Yank — a play on "the opposite of slack" (you yank the slack out of a rope).
- **Date:** 2026-05-14
- **Status:** Design approved; implementation plan to follow
- **Owner:** Florent
- **One-line:** A self-hosted, Tailscale-only, Slack-style PWA over WhatsApp for a single user (multi-user-shaped for phase 2).

Naming applies throughout: repo (`yank`), npm workspace root (`yank`), Docker images (`yank-daemon`, `yank-api`, `yank-web`, `yank-media-worker`), Tailscale hostname (`https://yank.<tailnet>.ts.net`), PWA `manifest.name` (`Yank`), `short_name` (`Yank`).

## 1. Goal

Replace the daily-use WhatsApp Web/Desktop experience for work with a denser, search-first, channel-and-thread-organised PWA, while keeping the user's existing personal phone number and chats. The same WhatsApp account drives both work and personal traffic; the UI separates them.

## 2. Non-goals (v1)

- Multi-tenant SaaS or any non-self-hosted deployment.
- Public-internet exposure.
- Full message history before link date (best-effort backfill only — protocol-limited).
- Replacing the WhatsApp mobile app for personal use.
- Polls voting, Status/Stories, Calls UI, Newsletters, full multi-user UI.

## 3. Constraints

- WhatsApp's Cloud API / Business API does not provide personal-account chat access. The only viable path is the multi-device protocol implemented by **Baileys** (TypeScript) or **whatsmeow** (Go).
- Multi-device protocol streams messages forward from link time. Pre-link history is best-effort (Baileys' history-sync, typically partial, ~weeks to months).
- Use of unofficial client libraries is against WhatsApp ToS. Risk of account ban exists. Behaviour must match a normal Desktop client (no bulk messaging, no read-suppression, no unusual access patterns).
- Hosting: home NAS, Docker Compose, single-volume persistence. Network: Tailscale-only.
- PWA-first: installable on Linux, macOS, Windows, iOS, Android. Service workers require secure context — provided by Tailscale Serve TLS on a `*.ts.net` MagicDNS hostname.

## 4. Architectural invariants

These three rules are load-bearing and must not be relaxed during implementation:

1. **The daemon only communicates via Redis.** No inbound HTTP, ever. Commands in via Redis Streams; events out via Redis pub/sub. This keeps the WhatsApp-connector behind any firewall and makes a future api/web migration to Vercel a config-only change.
2. **Multi-user-shaped schema from day one.** Every table carries `user_id`. v1 has exactly one row in `users`; phase 2 adds auth and provisioning without a schema migration.
3. **Library boundary.** Baileys-specific code lives only in the `daemon` container. Everything downstream (api, web) consumes a normalised event/message shape that we own. If we ever swap to whatsmeow, only the daemon changes.

## 5. Technology choices

| Concern | Choice | Rationale |
|---|---|---|
| WhatsApp library | **Baileys** (WhiskeySockets fork) | Keeps stack in one language; large community; broad feature coverage. whatsmeow is a credible alternative if protocol breakages bite, swappable per invariant 3. |
| Daemon runtime | Node 22 LTS | Same language as the rest of the stack. |
| API runtime | Node 22 LTS, Fastify | Lightweight, Fluid-Compute-compatible later. |
| Web | **Vite + React + TypeScript + `vite-plugin-pwa`** | PWA tooling far cleaner in Vite than Next.js App Router today. No SEO/SSR needs (Tailscale-only). |
| Routing / data | TanStack Router + TanStack Query | Idiomatic SPA stack; SSE integrates cleanly with Query. |
| UI state | Zustand | Transient state (active chat, drafts, thread-open). |
| Realtime to browser | **SSE (Server-Sent Events)** | Works on Fluid Compute / Vercel without special config; one-way is all we need. |
| Storage | Postgres 16 (`pg_trgm`, `tsvector`) | Full-text + fuzzy search; managed-Neon-compatible. |
| Pub/sub & job queue | Redis 7 (Streams for commands, pub/sub for events) | Decouples daemon; Upstash-compatible. |
| Reverse proxy / TLS | **Tailscale Serve** on the NAS host | Free `*.ts.net` cert, no DNS, no Let's Encrypt, no public exposure. |
| Container orchestration | Docker Compose | Right tool for a single-host NAS. |
| CI / tooling | Vitest, Playwright, Testcontainers, Pino, Renovate (lib pins) | Standard. |

## 6. System topology

```
                                       Tailnet only
                                            ↓
                              ┌──────────────────────┐
                              │  web (nginx:alpine)  │
                              │  serves Vite PWA     │
                              │  :443 via Tailscale  │
                              └──────────┬───────────┘
                                         │ proxy /api, /events (SSE)
                                         ↓
       ┌─────────────────────────────────┴───────────────┐
       │              api (Fastify, Node 22)              │
       │  REST  +  SSE fan-out  +  Web Push dispatch      │
       └──┬──────────────────────────────┬────────────────┘
          │ SQL                          │ pub/sub & streams
          ↓                              ↓
   ┌────────────┐                  ┌────────────┐
   │ postgres   │                  │   redis    │
   └─────┬──────┘                  └─────┬──────┘
         │ SQL                           │ events ↑  /  commands ↓
         ↓                               ↓
   ┌───────────────────────────────────────────────┐
   │           daemon (Node 22 + Baileys)          │
   │     Map<userId, BaileysSession>               │
   │     ↕ WebSocket to WhatsApp                   │
   └───────────────────────────────────────────────┘
                       │
                       ↓ MMS CDN downloads
                ┌────────────────┐
                │  media-worker  │
                └────────────────┘
```

### Containers

| Container | Image | Responsibility | Volume |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | All durable state; FTS indexes | `postgres-data` |
| `redis` | `redis:7-alpine` | `commands:user:<id>` streams; `events:user:<id>` pub/sub | (ephemeral) |
| `daemon` | custom Node 22 | Baileys sessions, message persistence, command consumer | `baileys-auth` (encrypted dataset) |
| `api` | custom Node 22 | REST, SSE, Web Push, command producer | (none) |
| `web` | `nginx:alpine` | Built Vite PWA + manifest + service worker | (image-baked) |
| `media-worker` | custom Node 22 | Async media download + thumbnailing | `media` |
| `migrate` | shares `api` image | DB migrations at startup; exits | (none) |

### Networking

- Single internal bridge network `app-net`.
- Only `web` is bound to a host port; the host port is exposed by `tailscale serve` on the NAS, never on `0.0.0.0`.
- `daemon` is unreachable from outside `app-net`. The api never makes direct HTTP calls to the daemon (invariant 1).

## 7. Data model

Postgres 16 schema, condensed. Full DDL in implementation plan.

### Identity & access

```
users(id PK, display_name, created_at, settings_json)
whatsapp_sessions(user_id PK FK, jid, phone_number, status, last_connected_at)
push_subscriptions(id PK, user_id FK, endpoint, keys_json, ua, created_at)
```

Baileys auth credentials live **on disk** at `/baileys-auth/<user_id>/` (encrypted volume), not in Postgres. File-shaped data, frequent small writes, and Baileys' file adapter is the canonical tested path.

### Chats, contacts, membership

```
contacts(user_id, jid, display_name, push_name, business_name, avatar_path, last_seen_at,
         PRIMARY KEY (user_id, jid))

chats(id PK, user_id FK, jid,
      type ENUM('dm','group','community','newsletter'),
      subject, last_message_at, last_message_preview,
      archived BOOL, muted_until, pinned BOOL,
      UNIQUE (user_id, jid))

chat_assignments(chat_id PK FK,
                 workspace ENUM('work','personal','triage','hidden'),
                 assigned_at)

group_members(chat_id, jid, role ENUM('member','admin','superadmin'), joined_at,
              PRIMARY KEY (chat_id, jid))
```

New chats default to `workspace = 'triage'`.

### Messages & threads

```
messages(id PK, user_id FK, chat_id FK, wa_message_id,
         sender_jid, ts,
         kind ENUM('text','image','video','audio','document','sticker','poll','system','call'),
         text, reply_to_id FK NULLABLE,
         edited_at NULLABLE, deleted_at NULLABLE,
         status ENUM('pending','sent','delivered','read','failed'),
         UNIQUE (user_id, wa_message_id))

message_media(message_id PK FK, mime, size_bytes, width, height, duration_ms,
              file_path, thumbnail_path,
              status ENUM('queued','downloading','ready','failed'))

reactions(message_id FK, reactor_jid, emoji, ts,
          PRIMARY KEY (message_id, reactor_jid))
```

A "thread" is the set of messages where `reply_to_id` equals a given parent. WhatsApp's reply quote is a single-level relation, which is sufficient for the side-panel rendering — replies to a parent collapse into the parent's thread regardless of whether each reply itself references the same parent or another reply within the thread.

### State

```
read_state(user_id, chat_id, last_read_message_id, last_read_ts,
           PRIMARY KEY (user_id, chat_id))

stars(user_id, message_id, starred_at,
      PRIMARY KEY (user_id, message_id))

directory_entries(id PK, user_id_owner FK, chat_id FK,
                  visibility ENUM('public','link-only','private'),
                  invite_link, description)
```

`directory_entries` is empty in v1; phase 2 channel-directory UI reads from it.

### Search

`messages.text_tsv` generated `tsvector` column with `english` config; GIN index. `pg_trgm` GIN index on `messages.text` for fuzzy/substring. The api combines `ts_rank` and `similarity` for ranking.

### Critical indexes

- `messages (user_id, chat_id, ts DESC)` — paginated chat view
- `chats (user_id, last_message_at DESC)` — sidebar sort
- `messages (user_id, status) WHERE status = 'pending'` — partial; recovery
- `messages (user_id, reply_to_id)` — thread panel

## 8. Flows

### 8.1 Inbound (WhatsApp → browser)

```
WhatsApp WS  →  daemon (Baileys event)
                  • dedup: messages.wa_message_id
                  • upsert contact, upsert chat
                  • INSERT messages
                  • if media: INSERT message_media(status='queued') + enqueue job
                  • UPDATE chats(last_message_at, last_message_preview)
                  • PUBLISH events:user:<u> {type:'message', chat_id, message_id}

api  ←  Redis subscribe events:user:<u>
       → fan-out via SSE to every open /events stream for that user

browser SSE handler:
   • if chat is active: append + auto-scroll
   • else: increment unread; reorder sidebar
   • if tab unfocused: in-page Notification
   • if tab closed and Web Push subscribed: api also sends Web Push
```

Two notification paths in parallel: in-page `Notification.show` while the PWA is open; Web Push when it isn't. The api distinguishes based on whether any SSE stream is active for the user.

### 8.2 Outbound (browser → WhatsApp)

```
browser  POST /api/chats/:id/messages  {text, reply_to_id?}
   ↓
api
   • validate; generate UUIDv7 local id
   • INSERT messages(status='pending', wa_message_id=NULL)
   • PUBLISH commands:user:<u> {type:'send', local_id, chat_jid, text, quoted_wa_id?}
   • return 202 with the pending row (optimistic UI)

daemon (subscribed to commands:user:<u> via Redis Stream)
   • baileys.sendMessage(...)
   • UPDATE messages SET wa_message_id, status='sent', ts
   • PUBLISH events:user:<u> {type:'status', local_id, status:'sent', wa_message_id}
   • XACK on the stream

   (later, async)
   • Delivery/read receipts arrive on the Baileys event stream
   • UPDATE status; PUBLISH events:user:<u>
```

Reactions, typing, presence, mark-as-read all follow the same shape. The api never calls the daemon directly.

Failure handling: Redis Streams (not pub/sub) for `commands:*` so commands survive daemon restart. After N retry attempts, daemon writes `status='failed'`; browser shows a retry affordance.

### 8.3 Linking & history sync (first run)

```
browser /setup  →  POST /api/setup/link
api PUBLISH commands:user:<u> {type:'pair'}

daemon
   • start Baileys session
   • emit qr/pairing code
   • PUBLISH events:user:<u> {type:'qr', data}

api streams QR via SSE to browser  →  user scans on phone  →  Baileys 'open'

daemon
   • PUBLISH events:user:<u> {type:'connected', jid, phone}
   • kick off Baileys history sync (best-effort)
   • batch inserts; periodically PUBLISH events:user:<u> {type:'sync-progress', ...}
   • PUBLISH events:user:<u> {type:'sync-complete'}

browser
   • dismisses QR
   • shows: "Welcome. N chats imported, M messages synced. K chats in Triage."
   • routes to /triage
```

Triage is the explicit first-run experience. Every imported chat starts in `workspace='triage'`; the user clears it in a keyboard-first card view.

## 9. Frontend information architecture

### Routes

| Route | View |
|---|---|
| `/setup` | QR / pairing code, sync progress |
| `/` | Last-active chat in current workspace |
| `/c/:chatId` | Active chat |
| `/c/:chatId/t/:messageId` | Active chat + thread side-panel |
| `/triage` | Triage inbox (card grid) |
| `/search?q=...` | FTS results, workspace-scoped by default |
| `/saved` | Starred messages |
| `/directory` | Phase-2 placeholder |
| `/settings/*` | Identity, workspaces, notifications, push, session, diagnostics |

### 4-column shell

1. **Workspace rail** (56px): Work, Personal, Triage (red dot for unassigned), Saved, Directory, Settings.
2. **Sidebar** (collapsible ~240px): pinned chats, DMs (last-activity sort), groups. Search box at top.
3. **Main pane**: top bar; virtualised, cursor-paginated message list; composer.
4. **Thread panel** (~360px, toggleable): parent + replies + mini-composer; `Esc` closes.

### Composer

Plain text + paste-to-attach images + drag-and-drop files + emoji picker + mention autocomplete (`@` against `group_members`) + reply-by-quote (`R` on hover) + edit-last-sent (`↑` in empty composer).

### Triage flow

Card grid (not a sidebar list). Each card: avatar, name, 3 recent messages, `Work` / `Personal` / `Hide` buttons + keyboard `1` / `2` / `3`. Designed to clear in one pass.

### Command palette (`Cmd-K`)

Jump-to + actions. Fuzzy-matched, Linear/Raycast-style.

### Search

Workspace-scoped by default; "search all" toggle. Filters: `from:`, `in:`, `has:image`, `has:file`, `before:`, `after:`.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Cmd-K` | Command palette |
| `Cmd-T` | Quick switcher (chats only) |
| `Cmd-F` | Search current chat |
| `Cmd-Shift-F` | Global search |
| `Cmd-1/2/3` | Switch workspace |
| `Cmd-Shift-A` | Mark current chat as read |
| `Esc` | Close thread panel / search / palette |
| `↑` (empty composer) | Edit last sent |
| `R` (over message) | Reply in thread |
| `S` | Star/unstar |

### State management

- TanStack Query for server state; SSE events invalidate / patch caches surgically.
- Zustand for transient UI state (active chat, draft text, thread panel open).
- Cursor pagination on `messages.ts`.

## 10. Resilience & observability

### Resilience

- **Daemon ↔ WhatsApp:** Baileys handles reconnects; we wrap each session with our own exponential backoff (1s, 2s, 4s, ..., capped at 60s) and expose `status` via `events:` so the UI shows a degradation banner.
- **Daemon restart:** Baileys auth state on disk survives. Pending `commands:` stream entries are re-consumed because we XACK only after the send completes.
- **Postgres / Redis outage:** api returns 503; daemon buffers events to a bounded in-memory queue and drops oldest after 5 minutes with a log warning. Better lossy than OOM.
- **Phone-app race:** WhatsApp's multi-device protocol fans events to all linked devices. Reads on phone propagate as receipts; no conflict, just eventual consistency.

### Observability

- **Logs:** pino structured JSON; `userId` and `traceId` on every line.
- **Healthchecks:** `/healthz` on api (DB + Redis ping); `/healthz` on daemon (per-session status). Docker `healthcheck:` blocks for each container.
- **Metrics (v1.5, not v1):** Prometheus endpoint — message rate, send latency p50/p95, reconnect count.
- **`/settings/diagnostics` (v1):** in-app page showing session status, last reconnect, message counts, queue depths. Saves shelling into containers.

## 11. Testing strategy

- **Unit (Vitest):** message normaliser (Baileys → DB row), reply-thread resolver, search query builder, workspace filter logic.
- **Integration (Vitest + Testcontainers):** Postgres + Redis spun up; daemon + api in-process; scripted Baileys events through a stubbed socket. Cover inbound, outbound, dedup, command retry, sync progress.
- **E2E (Playwright):** one happy-path smoke. Loads the PWA, feeds a canned `events:` stream, asserts chat list, thread panel, search.
- **Not tested in CI:** live WhatsApp connectivity (brittle, ToS-fragile). Manual smoke on the real link is the safety net.

## 12. v1 scope

### In

DMs and group chats; text, image, voice note, document, sticker rendering; send, reply, edit-last, delete-for-me, react, typing, presence, read receipts; Slack-style threads in side panel; Work / Personal / Triage workspaces with manual tagging; FTS + fuzzy search; Saved messages; Web Push + in-page notifications; PWA install; dark mode; command palette + keyboard shortcuts; in-app diagnostics.

### Out (schema/foundation may exist; no UI in v1)

Multi-user auth (single hard-coded user); Channel Directory UI / Communities listing; polls voting; Status / Stories; calls UI; Newsletters / Channels; per-message E2EE at rest (encrypted volume is the boundary); light-mode polish; mobile-specific UI polish beyond responsive; backfill from `.txt` chat exports.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Account ban for unofficial-client use | Match Desktop-client behaviour; respect Baileys rate limits; no bulk send, no read-suppression. Risk is real but well-precedented in Baileys' user base. |
| Baileys breakage after a WhatsApp protocol change | Pin via Renovate; swap to whatsmeow possible (invariant 3 keeps blast radius to the daemon). |
| NAS downtime → missed messages | WhatsApp re-delivers from cooldown buffer on reconnect (typically hours). Sustained multi-day downtime risks loss — same loss profile as not opening WhatsApp Web. |
| Sensitive data exfiltration via NAS exposure | Tailscale-only, `0.0.0.0:443` never bound, baileys-auth on encrypted dataset, no port forwarding. Documented in runbook. |
| Credential leak to browser | api uses HTTP-only cookie session; WhatsApp credentials never cross the daemon process boundary. |

## 14. Cloud migration path (informational, not v1 work)

Because of invariants 1 and 3, moving the stateless tier to Vercel is a configuration change rather than a rewrite:

1. Provision **Neon Postgres** + **Upstash Redis** via Vercel Marketplace.
2. `pg_dump | pg_restore` from NAS Postgres to Neon (one-time).
3. Deploy `api` (Fastify on Fluid Compute) + `web` (Vite static on Vercel CDN).
4. Update the NAS daemon's `.env` to point at the new Neon / Upstash URLs.
5. Daemon keeps running on the NAS (no need to move it; nothing inbound).

`media-worker` is a candidate for Vercel Workflow; `MediaStore` interface (filesystem now, Vercel Blob later) keeps that swap small.

## 15. Open questions for implementation plan

- **Pairing code vs QR.** Baileys supports both; pairing code is a slightly nicer first-run UX on a desktop browser. Default to pairing code; offer QR as fallback.
- **`web` packaging.** Bake the Vite build into the `nginx:alpine` image at build time, or mount it as a volume from a `migrate`-shaped one-shot? Build-time bake is simpler; revisit if hot-reload becomes painful.
- **Tailscale on host vs sidecar.** Host-level Tailscale is simpler on all major NAS OSes (Synology / QNAP / Unraid / TrueNAS package available). Sidecar pattern is the alternative if the NAS OS doesn't support host Tailscale.
- **Encrypted volume mechanism.** Depends on NAS OS — ZFS native encryption (TrueNAS), Btrfs (Synology with DSM 7+), LUKS (manual). To be confirmed when we pick the host.
