# Yank — M3 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `@yank/web` package — currently the M1 "hello world" stub — into the production React PWA shell: 4-column layout, chat view with composer, thread side-panel, command palette, and setup flow, wired to the api over REST + SSE.

**Architecture:** TanStack Router (file-based routes) + TanStack Query (server state) + Zustand (transient UI state) + a custom `useEventStream` hook (SSE consumer that patches Query caches). CSS Modules for component styles with a global `tokens.css` carrying design tokens (CSS custom properties, theme/density/accent data-attributes, deterministic avatar gradients). Visual style ported from the Claude Design mockup at `docs/superpowers/specs/mockups/2026-05-14-claude-design/` — dense, dark-default, three matched-chroma workspace accents (Work=slate, Personal=amber, Triage=coral).

**Tech Stack:** React 19, TypeScript 5.6 strict, Vite 6, TanStack Router 1.x, TanStack Query 5.x, Zustand 5.x, Zod 3.x (DTO validation), `@fontsource/inter` + `@fontsource/jetbrains-mono`, Vitest + `@testing-library/react` + `jsdom` + MSW (component & integration tests), Playwright (one smoke test).

**Baseline (verified at revision time, 2026-05-14):**

- M1 is merged to `main` — workspace scaffolding, `@yank/shared`, `@yank/db`, api shell, web shell (Vite + React + nginx Dockerfile), docker-compose, CI.
- M2 is merged to `main` — daemon + Baileys connector + FakeConnector for tests, inbound/outbound message pipeline, full api REST + SSE routes, plus a **thin frontend slice** with TanStack Router (programmatic), TanStack Query, Zustand, a hand-rolled `api` client, an SSE hook, basic components, and a Playwright smoke. See §"M2 baseline & migration deltas" below for the exact inventory.
- DTO shapes are **not** in `@yank/shared/src/dto.ts` yet — M2 declared local types in `packages/web/src/api.ts`. Task C1 adds them to shared and migrates the api + web to consume them.

M3 turns the M2 vertical slice into the rich PWA shell. Many tasks **replace** thin M2 implementations with richer ones; a smaller number are additive (palette, thread panel, design tokens, route stubs). Group M (Migrations) at the front captures the structural cleanups that have to happen before the additive work begins.

**End state when M3 is complete:**

- `pnpm --filter @yank/web dev` runs the PWA shell against a local api.
- Opening `/` shows the 4-column shell with the rail, sidebar (populated by `GET /api/chats`), and the last-active chat in the main pane.
- Clicking a chat in the sidebar navigates to `/c/:chatId` and loads its messages.
- Typing in the composer and pressing Enter calls `POST /api/chats/:chatId/messages`, optimistically inserts a pending row, and updates to `sent`/`delivered`/`read` as SSE `status` events arrive.
- New inbound messages arrive via SSE without page refresh.
- Cmd-K opens the command palette; Cmd+1/2/3 switch workspace; Cmd+Shift+F opens search; Esc closes thread/palette.
- `/setup` shows the pair code from SSE `qr`/`pair-code` events and a syncing progress bar driven by `sync-progress` events.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.
- `pnpm --filter @yank/web build` produces a `dist/` that the existing M1 nginx Dockerfile serves correctly.

---

## API contract (consumed by M3, owned by M2)

These shapes are what M3 codes against. M2 is the authoritative implementer. The plan adds them to `@yank/shared/src/dto.ts` as Zod schemas + inferred types so frontend and api share one source.

### REST

| Method + path | Response | Notes |
|---|---|---|
| `GET /api/chats` | `Chat[]` | All chats for the current user, sorted by `lastMessageAt DESC`. Includes assignment (`workspace`). |
| `GET /api/chats/:chatId` | `Chat` | Single chat with member count. 404 if not found. |
| `GET /api/chats/:chatId/messages?before=<uuid>&limit=50` | `{ messages: Message[]; nextCursor: string \| null }` | Cursor pagination on `ts DESC`. `before` is a message id (UUIDv7 — sortable). |
| `GET /api/chats/:chatId/members` | `ChatMember[]` | For group chats only. Used for @mention autocomplete in a later milestone; route stubbed in M3. |
| `POST /api/chats/:chatId/messages` body `{ text: string; replyToId?: string }` | `Message` (status=`pending`) | Returns the inserted pending row; the api publishes the `send` command on `commands:user:<id>`. |
| `POST /api/chats/:chatId/read` body `{ messageId: string }` | `204 No Content` | Marks the chat read up through `messageId`. |
| `POST /api/messages/:messageId/reactions` body `{ emoji: string \| null }` | `204 No Content` | `null` removes the user's reaction. |
| `POST /api/messages/:messageId/star` body `{ starred: boolean }` | `204 No Content` | Toggles star (writes to `stars`). |
| `POST /api/chats/:chatId/assignment` body `{ workspace: 'work' \| 'personal' \| 'hidden' }` | `204 No Content` | Used in M4 Triage; stubbed in M3. |
| `POST /api/setup/link` body `{ method: 'qr' \| 'code' }` | `202 Accepted` | Publishes `pair` command on the stream. |

### SSE

`GET /events` — `text/event-stream`. Each `data:` frame is JSON conforming to `DaemonEvent` from `@yank/shared`. `event:` field carries the type for `EventSource.addEventListener` convenience; default `message` event still receives all types for clients that don't subscribe by name.

Heartbeat: api emits `: ping\n\n` every 25 s so proxies don't time out.

Reconnect: client reconnects on close with exponential backoff (1 s, 2 s, 4 s, capped 30 s) and includes `Last-Event-ID` if api supports replay (M2 detail; if not supported, client refetches affected queries on reconnect).

**M2 SSE realities to bake into M3 from day one:**

- The SSE endpoint is **`/api/events`**, not `/events`. The Vite dev proxy already covers it.
- The api emits each event with `event:` set to the discriminator (e.g. `event: message`), so the client uses `addEventListener('message' | 'qr' | 'status' | …)` rather than `onmessage`. Migration of the SSE hook keeps this pattern.

---

## M2 baseline & migration deltas

Inventory of what's in `packages/web/` right now and how M3 reshapes it. Each entry is one of **KEEP** (use as-is), **EXTEND** (build on top), **REPLACE** (rewrite during this milestone), **NEW** (didn't exist).

| File / concept | M2 state | M3 disposition |
|---|---|---|
| `packages/web/package.json` deps | React 19, react-dom, @tanstack/react-router 1.81, @tanstack/react-query 5.59, zustand 5, vite 6, @playwright/test 1.48, @types/react(-dom), @vitejs/plugin-react, typescript | **EXTEND.** Add `@fontsource/inter`, `@fontsource/jetbrains-mono`, `zod`, `@yank/shared` (workspace), `@tanstack/router-vite-plugin`, `@tanstack/router-devtools`, `@testing-library/{react,dom,jest-dom,user-event}`, `jsdom`, `msw`, `vitest` |
| `packages/web/vite.config.ts` | `/api` proxy already wired | **EXTEND.** Add `TanStackRouterVite` plugin |
| `packages/web/src/main.tsx` | QueryClient inline, programmatic router via `RouterProvider` | **REPLACE.** Use `createQueryClient()`, import `routeTree.gen.ts`, import font + style modules |
| `packages/web/src/router.tsx` | Programmatic `createRootRoute` + `createRoute` for `/`, `/c/$chatId`, `/setup` | **REPLACE.** Re-derive `router` from `routeTree.gen.ts` produced by the Vite plugin |
| `packages/web/src/api.ts` | Hand-rolled `fetch`-based `api` object with local `Chat`/`Message`/`SetupStatus` types | **REPLACE.** Move types to `@yank/shared/src/dto.ts` (Zod schemas); add `lib/api.ts` (`apiFetch`); add `lib/queries.ts` + `lib/mutations.ts`. Delete `packages/web/src/api.ts` once callers migrated |
| `packages/web/src/sse.ts` | `useYankEvents(onEvent?)` subscribed to named SSE events (`qr`, `message`, `status`, …), patches caches | **REPLACE.** Refactor to `lib/eventStream.ts` `useEventStream({ url?, onEvent? })` keeping the named-event subscription pattern, adding exponential-backoff reconnect, abort cleanup, Zod validation via `DaemonEventSchema` |
| `packages/web/src/store.ts` | `useUi` (`activeChat`, `drafts`, set/clear, not persisted) | **REPLACE.** Split into `state/ui.ts` (`useUiStore` — workspace, paletteOpen, openThreadId) and `state/drafts.ts` (`useDraftsStore` — persisted to localStorage). `activeChat` becomes route-derived (TanStack Router `useParams`) — drop the field |
| `packages/web/src/routes/home.tsx` | `Home` (redirects to first chat) + `ChatRoute` | **REPLACE.** Become `routes/index.tsx` (redirect to last-active chat in current workspace) and `routes/c/$chatId.tsx` (use file-based routing). Old file deleted |
| `packages/web/src/routes/setup.tsx` | Full Setup view with pair code stub, sync progress, "Open Yank →" CTA | **REPLACE.** Reuse the same logic but render against M3 design tokens; route file converts to file-based; chunked pair-code display |
| `packages/web/src/components/shell.tsx` | Minimal 2-button rail | **REPLACE.** Become `components/shell/Rail.tsx` (full workspace rail) |
| `packages/web/src/components/chat-list.tsx` | Flat list of chat links | **REPLACE.** Become `components/shell/Sidebar.tsx` (pinned/groups/DMs sections, palette-search header, phone status foot) |
| `packages/web/src/components/chat-view.tsx` | Topbar with title, message list, basic composer | **REPLACE.** Compose new `ChatTopbar` + `MessageList` + `Composer` + optional `ThreadPanel` |
| `packages/web/src/components/composer.tsx` | textarea + send button | **REPLACE.** Rich composer with toolbar, draft persistence, hint strip |
| `packages/web/src/components/message-row.tsx` | Sender JID + ts + status glyph + body | **REPLACE.** Full message renderer with avatar, MessageText token parser, quote, reactions, status, thread link, hover actions |
| `packages/web/src/styles.css` | Single global stylesheet, hex greys, no workspace tints, no density/accent vars | **REPLACE.** Split into `styles/tokens.css` + `styles/reset.css` + `styles/globals.css`; per-component CSS Modules replace the global classes |
| `packages/web/e2e/happy-path.spec.ts` | Three Playwright specs (setup, home, composer optimistic flip) | **EXTEND.** Keep the existing specs; add command-palette + shell smoke |
| Thread panel | — | **NEW** |
| Command palette | — | **NEW** |
| `/triage`, `/search`, `/saved`, `/settings`, `/diagnostics`, `/directory` routes | — | **NEW** (stubs) |
| Avatar gradients, theme/density/accent data-attrs, MessageText parser, useChatMembers, mark-read/react/star mutations | — | **NEW** |

**Implementer instruction:** when a task's `Files:` block lists a path as *Create* and the file already exists per the table above, treat it as **rewrite** (delete + write). When it's listed as *Modify*, edit in place.

---

## File structure introduced in M3

```
packages/web/
├── package.json                       (updated: new deps + test scripts)
├── tsconfig.json                      (updated: includes tests/)
├── vite.config.ts                     (updated: proxy /api + /events to api)
├── vitest.config.ts                   (new: jsdom env, setupFiles)
├── index.html                         (updated: data-theme attr, font preconnect)
├── playwright.config.ts               (new)
├── src/
│   ├── main.tsx                       (rewritten: router + query client + providers)
│   ├── styles/
│   │   ├── tokens.css                 (CSS variables — theme, density, accent, workspace colors, avatar gradients)
│   │   ├── reset.css                  (html/body/button/input resets)
│   │   └── globals.css                (font-face, .mono, .kbd, .scrim, scrollbars)
│   ├── lib/
│   │   ├── api.ts                     (fetch wrapper)
│   │   ├── queryClient.ts             (TanStack QueryClient factory)
│   │   ├── queryKeys.ts               (typed query key helpers)
│   │   ├── queries.ts                 (useChats, useChat, useMessages, useChatMembers)
│   │   ├── mutations.ts               (useSendMessage, useMarkRead, useReact, useStar, useAssignWorkspace)
│   │   ├── eventStream.ts             (useEventStream — SSE hook with reconnect + cache patcher)
│   │   └── theme.ts                   (applyTheme, applyDensity, applyAccent helpers + useTheme)
│   ├── state/
│   │   ├── ui.ts                      (Zustand store: workspace, openThreadId, paletteOpen)
│   │   └── drafts.ts                  (Zustand persisted store: drafts per chatId)
│   ├── routes/
│   │   ├── __root.tsx                 (root layout with Rail + Sidebar + Outlet + ThreadPanel slot)
│   │   ├── index.tsx                  ("/" → redirect to last active chat in current workspace)
│   │   ├── setup.tsx                  ("/setup")
│   │   ├── c/$chatId.tsx              ("/c/:chatId")
│   │   ├── c/$chatId.t.$messageId.tsx ("/c/:chatId/t/:messageId")
│   │   ├── triage.tsx                 (stub, "card grid lands in M4")
│   │   ├── search.tsx                 (stub)
│   │   ├── saved.tsx                  (stub)
│   │   ├── settings.tsx               (stub)
│   │   ├── diagnostics.tsx            (stub)
│   │   └── directory.tsx              (stub)
│   ├── components/
│   │   ├── shell/
│   │   │   ├── Rail.tsx + Rail.module.css
│   │   │   ├── RailButton.tsx + RailButton.module.css
│   │   │   ├── Sidebar.tsx + Sidebar.module.css
│   │   │   ├── ChatRow.tsx + ChatRow.module.css
│   │   │   └── PhoneStatusFoot.tsx + PhoneStatusFoot.module.css
│   │   ├── chat/
│   │   │   ├── ChatView.tsx + ChatView.module.css
│   │   │   ├── ChatTopbar.tsx + ChatTopbar.module.css
│   │   │   ├── MessageList.tsx + MessageList.module.css
│   │   │   ├── Message.tsx + Message.module.css
│   │   │   ├── MessageText.tsx        (token parser)
│   │   │   ├── Reactions.tsx + Reactions.module.css
│   │   │   ├── Quote.tsx + Quote.module.css
│   │   │   ├── MediaImage.tsx + MediaImage.module.css
│   │   │   ├── DocCard.tsx + DocCard.module.css
│   │   │   ├── VoiceNote.tsx + VoiceNote.module.css
│   │   │   ├── StatusGlyph.tsx + StatusGlyph.module.css
│   │   │   ├── ThreadLink.tsx + ThreadLink.module.css
│   │   │   └── Composer.tsx + Composer.module.css
│   │   ├── thread/
│   │   │   └── ThreadPanel.tsx + ThreadPanel.module.css
│   │   ├── palette/
│   │   │   └── CommandPalette.tsx + CommandPalette.module.css
│   │   ├── setup/
│   │   │   └── SetupView.tsx + SetupView.module.css
│   │   ├── primitives/
│   │   │   ├── Avatar.tsx + Avatar.module.css
│   │   │   ├── IconButton.tsx + IconButton.module.css
│   │   │   ├── Kbd.tsx + Kbd.module.css
│   │   │   └── Scrim.tsx + Scrim.module.css
│   │   └── icons/
│   │       ├── index.tsx              (icon registry — ported from mockup)
│   │       └── types.ts               (IconProps)
│   ├── hooks/
│   │   ├── useKeyboardShortcuts.ts    (global Cmd+K, Cmd+1/2/3, Cmd+Shift+F, Esc)
│   │   ├── useActiveWorkspace.ts      (derive current workspace from route + store)
│   │   └── useAutoScroll.ts           (message-list scroll-to-bottom)
│   ├── utils/
│   │   ├── avatarGradient.ts          (deterministic seed → gradient class)
│   │   ├── format.ts                  (formatRelativeTs, formatJid)
│   │   └── tokens.ts                  (parseMessageText)
│   └── test/
│       ├── setup.ts                   (RTL + jsdom + matchMedia polyfill)
│       └── msw/
│           ├── server.ts              (msw setupServer)
│           ├── handlers.ts            (mock REST handlers)
│           └── fixtures.ts            (canned chats/messages/events)
└── test/                              (test files; mirrors src/ layout)
    ├── components/
    │   ├── shell/
    │   │   ├── Rail.test.tsx
    │   │   ├── Sidebar.test.tsx
    │   │   └── ChatRow.test.tsx
    │   ├── chat/
    │   │   ├── MessageText.test.tsx
    │   │   ├── Message.test.tsx
    │   │   └── Composer.test.tsx
    │   └── palette/
    │       └── CommandPalette.test.tsx
    ├── lib/
    │   ├── api.test.ts
    │   ├── eventStream.test.ts
    │   └── queries.test.tsx
    ├── state/
    │   └── drafts.test.ts
    ├── utils/
    │   ├── avatarGradient.test.ts
    │   └── tokens.test.ts
    └── e2e/
        └── smoke.spec.ts              (Playwright)
```

(Files in `packages/shared/` touched: `src/dto.ts` new + re-export from `src/index.ts`. Files in `packages/api/` are NOT touched in M3.)

## Conventions (apply to every task)

- **Branch:** all M3 work goes on `feat/m3-frontend` off `main`, with each task as a separate commit. Open PR after Group D wraps for early review; rebase/keep pushing.
- **Commits:** Conventional Commits — most tasks land as `feat(web): …` or `test(web): …`. CSS-only tweaks → `style(web): …`. Refactors → `refactor(web): …`.
- **Imports:** relative paths inside `packages/web/src` use the `.js` extension (ESM + `verbatimModuleSyntax`). Cross-package as `@yank/shared`. `tsconfig` `paths` are NOT used — keep imports portable.
- **Type imports:** `import type { … } from '…'` or inline `import { type Foo, bar } from '…'` (ESLint enforces).
- **CSS Modules:** every component has a sibling `*.module.css`. Class names in CSS are lower-camelCase (e.g. `.chatRow`, `.unreadBadge`) so they map cleanly to TS access without bracket lookup.
- **Tokens:** any color/spacing/font-size used by more than one component MUST come from a CSS variable in `tokens.css`. No magic hex literals outside `tokens.css`.
- **Tests:** UI tests live in `packages/web/test/**/*.test.tsx` (jsdom env via `packages/web/vitest.config.ts`). Hook/lib tests in `packages/web/test/**/*.test.ts`. Each component test renders the component with required props/providers via `renderWithProviders(node)` from `test/setup.ts`.
- **Strict no-implicit-any in tests too:** `vitest.config.ts` runs against the same `tsconfig.json` that includes `test/`.

---

## Group M — Migrations (clear the path before adding the rich UI)

These four tasks land first. After Group M the working tree has: no `packages/web/src/api.ts`, no `packages/web/src/sse.ts`, no `packages/web/src/store.ts`, no `packages/web/src/styles.css`, no `packages/web/src/components/{shell,chat-list,chat-view,composer,message-row}.tsx`, and no `packages/web/src/routes/home.tsx`. Some routes/components may temporarily render placeholder JSX so the dev server still runs between Group M and Group E.

### Task M1: Branch off main; verify M2 baseline still works

**Files:** none (verification step)

- [ ] **Step 1: Create the M3 branch**

```bash
git checkout -b feat/m3-frontend
```

- [ ] **Step 2: Sanity-check the build**

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @yank/web build
```

Expected: every step passes. If anything fails, fix on `main` first (the failure is M1/M2 debt, not M3 work).

- [ ] **Step 3: No commit**

This is a verification gate, not a change.

---

### Task M2: Migrate to TanStack Router file-based routing

**Files:**
- Modify: `packages/web/package.json` (add `@tanstack/router-vite-plugin`)
- Modify: `packages/web/vite.config.ts` (register the plugin)
- Modify: `packages/web/src/router.tsx` (consume generated tree)
- Modify: `packages/web/.gitignore` or root `.gitignore` (ignore `routeTree.gen.ts`)
- Create: `packages/web/src/routes/__root.tsx` (temporary minimal root — full version in Task E2)
- Move/rename: `packages/web/src/routes/home.tsx` → split into `packages/web/src/routes/index.tsx` (placeholder) + `packages/web/src/routes/c/$chatId.tsx` (placeholder)
- Keep: `packages/web/src/routes/setup.tsx` (file-based path already correct, content unchanged for now)

- [ ] **Step 1: Add the plugin dep**

Edit `packages/web/package.json` `devDependencies`:

```json
"@tanstack/router-vite-plugin": "~1.81.0",
"@tanstack/router-devtools": "~1.81.0",
```

Run `pnpm install`.

- [ ] **Step 2: Register the plugin in `vite.config.ts`**

```ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL ?? 'http://localhost:3001';
  return {
    plugins: [TanStackRouterVite({ routesDirectory: 'src/routes' }), react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': { target: apiUrl, changeOrigin: true },
      },
    },
    preview: { host: '0.0.0.0', port: 5173 },
    build: { sourcemap: true, target: 'es2022' },
  };
});
```

(`/api/events` SSE goes through the `/api` proxy already — no separate rule.)

- [ ] **Step 3: Add `routeTree.gen.ts` to .gitignore**

```bash
echo 'packages/web/src/routeTree.gen.ts' >> .gitignore
```

- [ ] **Step 4: Create a placeholder root layout**

```tsx
// packages/web/src/routes/__root.tsx
import { Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: () => <Outlet />,
});
```

(Group E2 replaces this with the 4-column shell.)

- [ ] **Step 5: Split `home.tsx`**

Create `packages/web/src/routes/index.tsx` (intentionally dumb — Group E6 replaces it with the real redirect logic):

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => <main style={{ padding: 24 }}>Loading…</main>,
});
```

Create `packages/web/src/routes/c/$chatId.tsx` (Group F9 replaces it with the real `ChatView` wiring; keeping the M2 `ChatView` import alive for now so the page still renders during migration):

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { ChatView } from '../../components/chat-view.js';

export const Route = createFileRoute('/c/$chatId')({
  component: () => {
    const { chatId } = Route.useParams();
    return <ChatView chatId={chatId} />;
  },
});
```

Convert `packages/web/src/routes/setup.tsx` to use `createFileRoute`:

```tsx
// at the top of setup.tsx
import { createFileRoute } from '@tanstack/react-router';
// at the bottom, after the Setup component:
export const Route = createFileRoute('/setup')({ component: Setup });
```

Delete `packages/web/src/routes/home.tsx`.

- [ ] **Step 6: Rewrite `router.tsx`**

```tsx
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.js';

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 7: Run the dev server to generate `routeTree.gen.ts`**

```bash
pnpm --filter @yank/web dev
```

Wait until the plugin prints "✔ Generated route tree". Stop with Ctrl-C.

- [ ] **Step 8: Smoke-check**

```bash
pnpm --filter @yank/web build
pnpm --filter @yank/web typecheck
```

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add packages/web/package.json packages/web/vite.config.ts packages/web/src/router.tsx packages/web/src/routes packages/web/src/main.tsx .gitignore pnpm-lock.yaml
git rm packages/web/src/routes/home.tsx
git commit -m "refactor(web): migrate to TanStack Router file-based routing"
```

---

### Task M3: Split UI store into ui + drafts (and persist drafts)

**Files:**
- Create: `packages/web/src/state/ui.ts`
- Create: `packages/web/src/state/drafts.ts`
- Modify: callers of `useUi` → swap to the new stores
- Delete: `packages/web/src/store.ts`

- [ ] **Step 1: Implement `state/ui.ts`**

Same content as Group D1 below — `useUiStore` with `workspace`, `paletteOpen`, `openThreadId`, plus actions.

- [ ] **Step 2: Implement `state/drafts.ts`**

Same content as Group D2 below — `useDraftsStore` with localStorage persistence.

- [ ] **Step 3: Migrate `chat-view.tsx` callers**

Replace:

```tsx
import { useUi } from '../store.js';
const draft = useUi((s) => s.drafts[chatId] ?? '');
const setDraft = useUi((s) => s.setDraft);
const clearDraft = useUi((s) => s.clearDraft);
```

with:

```tsx
import { useDraftsStore } from '../state/drafts.js';
const draft = useDraftsStore((s) => s.drafts[chatId] ?? '');
const setDraft = useDraftsStore((s) => s.setDraft);
const clearDraft = useDraftsStore((s) => s.clearDraft);
```

The `activeChat` reads (none should remain — `home.tsx` is gone) are derived from `useParams` in TanStack Router instead.

- [ ] **Step 4: Delete `store.ts`**

```bash
git rm packages/web/src/store.ts
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter @yank/web typecheck
pnpm --filter @yank/web build
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src
git commit -m "refactor(web): split useUi into ui store and persisted drafts store"
```

(Component tests for the drafts store land in Group D2 once the test scaffolding from Group A exists.)

---

### Task M4: Replace `styles.css` with `styles/tokens.css` + reset + globals

**Files:**
- Create: `packages/web/src/styles/tokens.css`
- Create: `packages/web/src/styles/reset.css`
- Create: `packages/web/src/styles/globals.css`
- Modify: `packages/web/src/main.tsx` (swap imports)
- Modify: `packages/web/index.html` (data-theme attributes)
- Delete: `packages/web/src/styles.css`

Same body as Tasks B1, B2, B3 below. Land them here as the migration step so the rest of M3 has tokens to work against. Cross-reference: the bodies of B1/B2/B3 are the source of truth for the file contents; Group B becomes a no-op verification.

- [ ] **Step 1: Create the three files per B1, B2, B3**

(Bodies omitted here for DRY — copy verbatim from Group B.)

- [ ] **Step 2: Update `main.tsx` style imports**

Replace `import './styles.css';` with:

```tsx
import './styles/tokens.css';
import './styles/reset.css';
import './styles/globals.css';
```

- [ ] **Step 3: Update `index.html`**

Per Task B3 — set `data-theme="dark" data-density="comfortable" data-accent="work"` on `<html>`.

- [ ] **Step 4: Delete the old stylesheet**

```bash
git rm packages/web/src/styles.css
```

The existing components reference class names that no longer have rules (e.g. `.rail`, `.sidebar`, `.chat-row`, `.pane`, `.topbar`, `.messages`, `.composer`, `.setup`). The dev server will render unstyled until Group B–G land. This is expected — Group M doesn't try to keep visuals working, just keeps the type-check / build / route-tree healthy.

- [ ] **Step 5: Verify**

```bash
pnpm --filter @yank/web typecheck
pnpm --filter @yank/web build
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/styles packages/web/src/main.tsx packages/web/index.html
git commit -m "refactor(web): split styles into tokens + reset + globals"
```

After Group M, Tasks B1–B3 become verification-only ("the file already exists from Task M4 — confirm it matches the spec body and skip"). Tasks B4–B6 (avatar gradient, theme appliers, icon registry) still run normally.

---

## Group A — Frontend toolchain & dependencies

### Task A1: Add runtime dependencies to `@yank/web`

**Files:**
- Modify: `packages/web/package.json`

**M2 baseline:** React 19, react-dom, @tanstack/react-router 1.81, @tanstack/react-query 5.59, zustand 5, vite 6, @playwright/test 1.48, @types/react(-dom), @vitejs/plugin-react, typescript. Task M2 added `@tanstack/router-vite-plugin` and `@tanstack/router-devtools`. This task **adds** what's still missing.

- [ ] **Step 1: Add the missing deps**

Edit `packages/web/package.json`. The end state for `dependencies` and `devDependencies`:

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
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@fontsource/inter": "~5.1.0",
    "@fontsource/jetbrains-mono": "~5.1.0",
    "@tanstack/react-query": "~5.59.0",
    "@tanstack/react-router": "~1.81.0",
    "@yank/shared": "workspace:*",
    "react": "~19.0.0",
    "react-dom": "~19.0.0",
    "zod": "~3.23.0",
    "zustand": "~5.0.0"
  },
  "devDependencies": {
    "@playwright/test": "~1.48.0",
    "@tanstack/router-devtools": "~1.81.0",
    "@tanstack/router-vite-plugin": "~1.81.0",
    "@testing-library/dom": "~10.4.0",
    "@testing-library/jest-dom": "~6.6.0",
    "@testing-library/react": "~16.1.0",
    "@testing-library/user-event": "~14.5.0",
    "@types/react": "~19.0.0",
    "@types/react-dom": "~19.0.0",
    "@vitejs/plugin-react": "~4.3.0",
    "jsdom": "~25.0.0",
    "msw": "~2.6.0",
    "typescript": "*",
    "vite": "~6.0.0",
    "vitest": "*"
  }
}
```

(Pin TanStack to 1.81/5.59 to match what M2 already installed — bumping versions is out of scope for M3.)

- [ ] **Step 2: Install**

Run:
```bash
pnpm install
```

Expected: success, lockfile updated.

- [ ] **Step 3: Verify install picked up zod from `@yank/shared` (shared dep)**

Run:
```bash
pnpm --filter @yank/web list zod
```

Expected: shows `zod ~3.23.0` resolved.

- [ ] **Step 4: Commit**

```bash
git add packages/web/package.json pnpm-lock.yaml
git commit -m "build(web): add TanStack + RTL + MSW + Playwright deps"
```

---

### Task A2: Wire Vite dev proxy to api + add path alias

**Files:**
- Modify: `packages/web/vite.config.ts`

- [ ] **Step 1: Replace `vite.config.ts` contents**

```ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL ?? 'http://localhost:3001';

  return {
    plugins: [TanStackRouterVite({ routesDirectory: 'src/routes' }), react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': { target: apiUrl, changeOrigin: true },
        '/events': { target: apiUrl, changeOrigin: true, ws: false },
      },
    },
    preview: { host: '0.0.0.0', port: 5173 },
    build: { sourcemap: true, target: 'es2022' },
  };
});
```

- [ ] **Step 2: Smoke-check Vite picks the plugin up**

Run:
```bash
pnpm --filter @yank/web exec vite --version
```

Expected: prints Vite version (no crash).

- [ ] **Step 3: Commit**

```bash
git add packages/web/vite.config.ts
git commit -m "build(web): proxy /api and /events to api in dev"
```

---

### Task A3: Add `packages/web/vitest.config.ts` (jsdom env, setup, include .tsx)

**Files:**
- Create: `packages/web/vitest.config.ts`

- [ ] **Step 1: Create the config**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
```

The `classNameStrategy: 'non-scoped'` keeps CSS Module class names readable in jsdom so `getByRole(...).className` matches expectations in component tests.

- [ ] **Step 2: Commit**

```bash
git add packages/web/vitest.config.ts
git commit -m "test(web): add Vitest config with jsdom env"
```

---

### Task A4: Test setup file (RTL, jest-dom, matchMedia polyfill)

**Files:**
- Create: `packages/web/src/test/setup.ts`

- [ ] **Step 1: Create the file**

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement matchMedia; theme code reads it.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom doesn't implement EventSource; tests inject their own mock.
if (!('EventSource' in globalThis)) {
  class FakeEventSource {
    url: string;
    readyState = 0;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    onopen: ((e: Event) => void) | null = null;
    constructor(url: string) {
      this.url = url;
    }
    close() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return false;
    }
  }
  (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource;
}
```

- [ ] **Step 2: Verify Vitest picks up the setup**

Run:
```bash
pnpm --filter @yank/web test
```

Expected: "No test files found" (we haven't written tests yet) — but Vitest must not crash on the setup file. Exit code 0 because we set `--passWithNoTests` at the root. (We don't pass it here intentionally; if Vitest exits non-zero with "no tests" that's fine for this step — what matters is no setup-time error.)

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/test/setup.ts
git commit -m "test(web): add RTL + jsdom test setup"
```

---

### Task A5: Update `tsconfig.json` to include tests + add path-less imports

**Files:**
- Modify: `packages/web/tsconfig.json`

- [ ] **Step 1: Replace contents**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "useDefineForClassFields": true,
    "moduleResolution": "Bundler",
    "noEmit": true,
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src/**/*", "test/**/*"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Note: we add `"vite/client"` (for `import.meta.env` typing) and `"vitest/globals"` (we keep `globals: false`, but adding the types is harmless and keeps editor tooling happy if anyone uses globals later).

- [ ] **Step 2: Add `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

Create at `packages/web/src/vite-env.d.ts`.

- [ ] **Step 3: Verify typecheck**

Run:
```bash
pnpm --filter @yank/web typecheck
```

Expected: passes (the file is still effectively empty; no errors).

- [ ] **Step 4: Commit**

```bash
git add packages/web/tsconfig.json packages/web/src/vite-env.d.ts
git commit -m "build(web): include test dir + vite-env types in tsconfig"
```

---

## Group B — Design system & theme

> **Group M owns B1–B3.** Task M4 already creates `tokens.css`, `reset.css`, and `globals.css`, deletes the old `styles.css`, and rewires `main.tsx` + `index.html`. If the implementer is dispatched onto B1/B2/B3 after M4, they should verify the existing files match the bodies below and mark the task done without a new commit. Tasks B4 (avatar gradient), B5 (theme appliers), and B6 (icon registry) are still required.

### Task B1: Port design tokens to `src/styles/tokens.css`

**Files:**
- Create: `packages/web/src/styles/tokens.css`

- [ ] **Step 1: Create the file**

Lift the design-token portion of the mockup (`docs/superpowers/specs/mockups/2026-05-14-claude-design/project/styles.css` lines 1–168). Component styles do NOT go here — only tokens, theme overrides, density overrides, accent overrides, and avatar gradient classes.

```css
:root {
  /* Type */
  --font-ui: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  /* Density (overridden by [data-density]) */
  --row-h: 32px;
  --msg-gap: 18px;
  --pane-pad: 16px;
  --fs-body: 14px;
  --fs-meta: 11.5px;
  --fs-sidebar: 13.5px;
  --fs-tiny: 11px;

  /* Workspace identity (saturated for dark) */
  --c-work: oklch(72% 0.13 250);
  --c-work-soft: oklch(28% 0.08 250);
  --c-personal: oklch(78% 0.13 60);
  --c-personal-soft: oklch(28% 0.08 60);
  --c-triage: oklch(72% 0.18 22);
  --c-triage-soft: oklch(28% 0.10 22);

  --c-saved: oklch(78% 0.14 90);
  --c-online: oklch(72% 0.18 150);
  --c-warn: oklch(78% 0.16 80);

  /* Avatar gradient palette (deterministic, used everywhere) */
  --g-1: linear-gradient(135deg, #f59e0b, #ef4444);
  --g-2: linear-gradient(135deg, #8b5cf6, #ec4899);
  --g-3: linear-gradient(135deg, #10b981, #06b6d4);
  --g-4: linear-gradient(135deg, #6366f1, #06b6d4);
  --g-5: linear-gradient(135deg, #f97316, #eab308);
  --g-6: linear-gradient(135deg, #2563eb, #7c3aed);
  --g-7: linear-gradient(135deg, #0ea5e9, #22c55e);
  --g-8: linear-gradient(135deg, #db2777, #f97316);

  /* Accent (sent/active) — defaults to work cool */
  --accent: var(--c-work);
  --accent-soft: var(--c-work-soft);

  --radius-1: 4px;
  --radius-2: 6px;
  --radius-3: 10px;

  --rail-w: 64px;
  --sidebar-w: 268px;
  --thread-w: 400px;
}

:root,
[data-theme='dark'] {
  --bg-0: oklch(15.5% 0.006 250);
  --bg-1: oklch(18.5% 0.007 250);
  --bg-2: oklch(22% 0.008 250);
  --bg-3: oklch(26% 0.009 250);
  --bg-rail: oklch(12% 0.005 250);
  --bg-hover: oklch(22% 0.008 250);
  --bg-active: oklch(26% 0.01 250);
  --bg-inverse: oklch(96% 0.003 250);

  --fg-0: oklch(96% 0.003 250);
  --fg-1: oklch(80% 0.005 250);
  --fg-2: oklch(60% 0.007 250);
  --fg-3: oklch(44% 0.008 250);
  --fg-inverse: oklch(18% 0.005 250);

  --border-0: oklch(24% 0.008 250);
  --border-1: oklch(30% 0.01 250);
  --border-strong: oklch(40% 0.012 250);

  --shadow-1: 0 1px 0 oklch(0% 0 0 / 0.3), 0 1px 2px oklch(0% 0 0 / 0.25);
  --shadow-2: 0 4px 12px oklch(0% 0 0 / 0.35), 0 1px 3px oklch(0% 0 0 / 0.25);
  --shadow-3: 0 16px 40px oklch(0% 0 0 / 0.55), 0 4px 12px oklch(0% 0 0 / 0.4);
}

[data-theme='light'] {
  --bg-0: oklch(99% 0.003 250);
  --bg-1: oklch(97.2% 0.004 250);
  --bg-2: oklch(94.5% 0.005 250);
  --bg-3: oklch(91% 0.006 250);
  --bg-rail: oklch(94% 0.005 250);
  --bg-hover: oklch(95% 0.006 250);
  --bg-active: oklch(92.5% 0.008 250);
  --bg-inverse: oklch(18% 0.005 250);

  --fg-0: oklch(18% 0.005 250);
  --fg-1: oklch(36% 0.008 250);
  --fg-2: oklch(52% 0.008 250);
  --fg-3: oklch(66% 0.008 250);
  --fg-inverse: oklch(98% 0.002 250);

  --border-0: oklch(92% 0.006 250);
  --border-1: oklch(88% 0.008 250);
  --border-strong: oklch(78% 0.01 250);

  --c-work: oklch(50% 0.13 250);
  --c-work-soft: oklch(94% 0.04 250);
  --c-personal: oklch(58% 0.14 60);
  --c-personal-soft: oklch(94% 0.05 60);
  --c-triage: oklch(55% 0.18 22);
  --c-triage-soft: oklch(94% 0.05 22);

  --shadow-1: 0 1px 0 oklch(0% 0 0 / 0.04), 0 1px 2px oklch(0% 0 0 / 0.04);
  --shadow-2: 0 4px 12px oklch(0% 0 0 / 0.06), 0 1px 3px oklch(0% 0 0 / 0.05);
  --shadow-3: 0 16px 40px oklch(0% 0 0 / 0.18), 0 4px 12px oklch(0% 0 0 / 0.10);
}

[data-density='compact'] {
  --row-h: 28px;
  --msg-gap: 12px;
  --pane-pad: 12px;
  --fs-body: 13px;
  --fs-sidebar: 12.5px;
  --fs-meta: 11px;
}
[data-density='roomy'] {
  --row-h: 36px;
  --msg-gap: 22px;
  --pane-pad: 20px;
  --fs-body: 15px;
  --fs-sidebar: 14px;
  --fs-meta: 12px;
}

[data-accent='personal'] { --accent: var(--c-personal); --accent-soft: var(--c-personal-soft); }
[data-accent='triage']   { --accent: var(--c-triage);   --accent-soft: var(--c-triage-soft); }
[data-accent='mono']     { --accent: var(--fg-0);       --accent-soft: var(--bg-3); }

.av-g1 { background: var(--g-1); color: white; }
.av-g2 { background: var(--g-2); color: white; }
.av-g3 { background: var(--g-3); color: white; }
.av-g4 { background: var(--g-4); color: white; }
.av-g5 { background: var(--g-5); color: white; }
.av-g6 { background: var(--g-6); color: white; }
.av-g7 { background: var(--g-7); color: white; }
.av-g8 { background: var(--g-8); color: white; }
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/styles/tokens.css
git commit -m "style(web): port design tokens (theme/density/accent) from mockup"
```

---

### Task B2: Global reset + body/scrollbar styles

**Files:**
- Create: `packages/web/src/styles/reset.css`
- Create: `packages/web/src/styles/globals.css`

- [ ] **Step 1: Create reset.css**

```css
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: var(--font-ui);
  font-size: var(--fs-body);
  color: var(--fg-0);
  background: var(--bg-0);
  -webkit-font-smoothing: antialiased;
  font-feature-settings: 'cv11', 'ss01', 'ss03';
  overflow: hidden;
}
button {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}
input, textarea {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  background: transparent;
  border: 0;
  outline: 0;
}
```

- [ ] **Step 2: Create globals.css**

```css
.mono {
  font-family: var(--font-mono);
  font-feature-settings: 'zero', 'ss01';
}

.scrim {
  position: fixed;
  inset: 0;
  background: oklch(0% 0 0 / 0.5);
  z-index: 1000;
  display: grid;
  place-items: start center;
  padding-top: 12vh;
}

/* Custom scrollbars (webkit only — degrades gracefully on Firefox) */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--border-0);
  border-radius: 6px;
  border: 2px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover { background-color: var(--border-1); background-clip: content-box; }
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/styles/reset.css packages/web/src/styles/globals.css
git commit -m "style(web): add reset + global typography/scrollbar styles"
```

---

### Task B3: Update `index.html` with theme/density attrs + font preconnect

**Files:**
- Modify: `packages/web/index.html`

- [ ] **Step 1: Replace contents**

```html
<!doctype html>
<html lang="en" data-theme="dark" data-density="comfortable" data-accent="work">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark light" />
    <title>Yank</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

We're not loading Google Fonts from CDN — `@fontsource/*` ships the woff2 files locally; main.tsx will `import` them so Vite bundles them.

- [ ] **Step 2: Commit**

```bash
git add packages/web/index.html
git commit -m "build(web): set theme data-attrs on root html, drop placeholder body"
```

---

### Task B4: `avatarGradient` helper + tests

**Files:**
- Create: `packages/web/src/utils/avatarGradient.ts`
- Create: `packages/web/test/utils/avatarGradient.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/web/test/utils/avatarGradient.test.ts
import { describe, expect, it } from 'vitest';
import { avatarGradient } from '../../src/utils/avatarGradient.js';

describe('avatarGradient', () => {
  it('returns a class in the av-g1..av-g8 range', () => {
    const cls = avatarGradient('alice');
    expect(cls).toMatch(/^av-g[1-8]$/);
  });

  it('is deterministic for the same seed', () => {
    expect(avatarGradient('bob')).toBe(avatarGradient('bob'));
  });

  it('falls back to av-g4 for empty seed', () => {
    expect(avatarGradient('')).toBe('av-g4');
  });

  it('distributes seeds across the 8 buckets', () => {
    const buckets = new Set<string>();
    for (let i = 0; i < 64; i++) buckets.add(avatarGradient(`name-${i}`));
    expect(buckets.size).toBeGreaterThanOrEqual(6);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web test test/utils/avatarGradient.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/web/src/utils/avatarGradient.ts
const FALLBACK = 'av-g4';

export function avatarGradient(seed: string): string {
  if (!seed) return FALLBACK;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `av-g${(h % 8) + 1}`;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @yank/web test test/utils/avatarGradient.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/utils/avatarGradient.ts packages/web/test/utils/avatarGradient.test.ts
git commit -m "feat(web): add deterministic avatarGradient helper"
```

---

### Task B5: Theme helpers (apply theme/density/accent to <html>)

**Files:**
- Create: `packages/web/src/lib/theme.ts`

- [ ] **Step 1: Create the file**

```ts
export type Theme = 'dark' | 'light';
export type Density = 'compact' | 'comfortable' | 'roomy';
export type Accent = 'auto' | 'work' | 'personal' | 'triage' | 'mono';
export type Workspace = 'work' | 'personal' | 'triage';

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function applyDensity(density: Density): void {
  document.documentElement.dataset.density = density;
}

/**
 * Resolve and apply the accent. When `accent === 'auto'` the accent follows the
 * current workspace (work/personal/triage). Pass the current workspace in to
 * compute the resolved value — accent has no concept of route/view, only of
 * which workspace tint to use.
 */
export function applyAccent(accent: Accent, workspace: Workspace): void {
  const resolved = accent === 'auto' ? workspace : accent;
  document.documentElement.dataset.accent = resolved;
}
```

No test for this task — it's a 3-line side-effect wrapper around `dataset`. Theme behaviour is exercised by integration tests in Group K.

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/lib/theme.ts
git commit -m "feat(web): add theme/density/accent appliers"
```

---

### Task B6: Icon registry (port `icons.jsx` → `components/icons/index.tsx`)

**Files:**
- Create: `packages/web/src/components/icons/types.ts`
- Create: `packages/web/src/components/icons/index.tsx`

- [ ] **Step 1: Create types**

```ts
// packages/web/src/components/icons/types.ts
import type { ReactElement } from 'react';

export interface IconProps {
  size?: number;
}

export type IconFn = (props?: IconProps) => ReactElement;
```

- [ ] **Step 2: Port icons**

The mockup file `docs/superpowers/specs/mockups/2026-05-14-claude-design/project/src/icons.jsx` defines a `const I = { search, hash, at, bookmark, grid, inbox, settings, activity, plus, pin, muted, chevronDown, bold, italic, strike, code, link, blockquote, list, paperclip, emoji, mic, phone, more, x, thread, star, starFill, check, doubleCheck, clock, play, filter, archive, directory }` object. Port each entry to a named export using `IconProps`. Example:

```tsx
// packages/web/src/components/icons/index.tsx
import type { IconProps, IconFn } from './types.js';

export const SearchIcon: IconFn = ({ size = 14 } = {}) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </svg>
);

export const HashIcon: IconFn = ({ size = 14 } = {}) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    <path d="M5.5 2.5 4 13.5M11.5 2.5 10 13.5M2.5 5.5h11M2.5 10.5h11" />
  </svg>
);

// … port the remaining 30+ icons from the mockup verbatim, renaming to
// `<Name>Icon` and adding `aria-hidden="true"` to each <svg>.
export type { IconProps } from './types.js';
```

The full list of named exports to create (one per mockup icon): `SearchIcon`, `HashIcon`, `AtIcon`, `BookmarkIcon`, `GridIcon`, `InboxIcon`, `SettingsIcon`, `ActivityIcon`, `PlusIcon`, `PinIcon`, `MutedIcon`, `ChevronDownIcon`, `BoldIcon`, `ItalicIcon`, `StrikeIcon`, `CodeIcon`, `LinkIcon`, `BlockquoteIcon`, `ListIcon`, `PaperclipIcon`, `EmojiIcon`, `MicIcon`, `PhoneIcon`, `MoreIcon`, `XIcon`, `ThreadIcon`, `StarIcon`, `StarFillIcon`, `CheckIcon`, `DoubleCheckIcon`, `ClockIcon`, `PlayIcon`, `FilterIcon`, `ArchiveIcon`, `DirectoryIcon`.

Where the mockup omits an `aria-*` attribute, add `aria-hidden="true"` since icons are decorative — buttons that contain only an icon must carry a `title` or visually-hidden label (enforced in component code, not here).

- [ ] **Step 3: Smoke-test the renderer**

Run:
```bash
pnpm --filter @yank/web typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/icons
git commit -m "feat(web): port monoline icon set from mockup"
```

---

## Group C — DTOs, API client, server-state layer

### Task C1: DTO schemas in `@yank/shared/src/dto.ts`

**Files:**
- Create: `packages/shared/src/dto.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/test/dto.test.ts`

**Important:** if M2 has already created this file, this task becomes a verification — re-check the schemas match what M3 needs and add anything missing (don't blindly overwrite). For the rest of this task, assume the file is new.

- [ ] **Step 1: Write failing test**

```ts
// packages/shared/test/dto.test.ts
import { describe, expect, it } from 'vitest';
import { ChatSchema, MessageSchema, MessagesPageSchema, ChatMemberSchema } from '../src/dto.js';

describe('DTO schemas', () => {
  it('parses a valid Chat', () => {
    const parsed = ChatSchema.parse({
      id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
      userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
      jid: '4477@s.whatsapp.net',
      type: 'group',
      subject: 'Q3 Brief',
      lastMessageAt: '2026-05-14T13:02:00.000Z',
      lastMessagePreview: 'Pushed v3',
      archived: false,
      mutedUntil: null,
      pinned: true,
      workspace: 'work',
      memberCount: 7,
      unreadCount: 4,
    });
    expect(parsed.type).toBe('group');
  });

  it('rejects an invalid workspace', () => {
    expect(() =>
      ChatSchema.parse({
        id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
        userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
        jid: 'x',
        type: 'dm',
        subject: null,
        lastMessageAt: null,
        lastMessagePreview: null,
        archived: false,
        mutedUntil: null,
        pinned: false,
        workspace: 'nope',
        memberCount: 0,
        unreadCount: 0,
      }),
    ).toThrow();
  });

  it('parses a MessagesPage with nullable cursor', () => {
    const parsed = MessagesPageSchema.parse({ messages: [], nextCursor: null });
    expect(parsed.nextCursor).toBeNull();
  });

  it('parses a ChatMember', () => {
    const m = ChatMemberSchema.parse({
      chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
      jid: '4477@s.whatsapp.net',
      displayName: 'Ash R.',
      role: 'member',
    });
    expect(m.role).toBe('member');
  });

  it('parses a Message with a quoted reply', () => {
    MessageSchema.parse({
      id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000050',
      userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
      chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
      waMessageId: 'ABCxyz',
      senderJid: '4477@s.whatsapp.net',
      ts: '2026-05-14T13:31:00.000Z',
      kind: 'text',
      text: 'Looks good',
      replyToId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000049',
      editedAt: null,
      deletedAt: null,
      status: 'sent',
      reactions: [{ emoji: '👀', count: 2, mine: false }],
    });
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm exec vitest run packages/shared/test/dto.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the schemas**

```ts
// packages/shared/src/dto.ts
import { z } from 'zod';

const Uuid = z.string().uuid();
const Iso = z.string().datetime();

export const WorkspaceSchema = z.enum(['work', 'personal', 'triage', 'hidden']);
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const ChatKindSchema = z.enum(['dm', 'group', 'community', 'newsletter']);
export const MessageKindSchema = z.enum([
  'text', 'image', 'video', 'audio', 'document', 'sticker', 'poll', 'system', 'call',
]);
export const MessageStatusSchema = z.enum(['pending', 'sent', 'delivered', 'read', 'failed']);

export const ReactionSchema = z.object({
  emoji: z.string(),
  count: z.number().int().nonnegative(),
  mine: z.boolean(),
});
export type Reaction = z.infer<typeof ReactionSchema>;

export const ChatSchema = z.object({
  id: Uuid,
  userId: Uuid,
  jid: z.string(),
  type: ChatKindSchema,
  subject: z.string().nullable(),
  lastMessageAt: Iso.nullable(),
  lastMessagePreview: z.string().nullable(),
  archived: z.boolean(),
  mutedUntil: Iso.nullable(),
  pinned: z.boolean(),
  workspace: WorkspaceSchema,
  memberCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});
export type Chat = z.infer<typeof ChatSchema>;

export const MediaSchema = z.object({
  mime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  url: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  status: z.enum(['queued', 'downloading', 'ready', 'failed']),
});
export type Media = z.infer<typeof MediaSchema>;

export const MessageSchema = z.object({
  id: Uuid,
  userId: Uuid,
  chatId: Uuid,
  waMessageId: z.string().nullable(),
  senderJid: z.string(),
  ts: Iso,
  kind: MessageKindSchema,
  text: z.string().nullable(),
  replyToId: Uuid.nullable(),
  editedAt: Iso.nullable(),
  deletedAt: Iso.nullable(),
  status: MessageStatusSchema,
  reactions: z.array(ReactionSchema).default([]),
  media: MediaSchema.optional(),
  threadCount: z.number().int().nonnegative().optional(),
  starred: z.boolean().optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const MessagesPageSchema = z.object({
  messages: z.array(MessageSchema),
  nextCursor: Uuid.nullable(),
});
export type MessagesPage = z.infer<typeof MessagesPageSchema>;

export const ChatMemberSchema = z.object({
  chatId: Uuid,
  jid: z.string(),
  displayName: z.string().nullable(),
  role: z.enum(['member', 'admin', 'superadmin']),
});
export type ChatMember = z.infer<typeof ChatMemberSchema>;

export const SendMessageBodySchema = z.object({
  text: z.string().min(1),
  replyToId: Uuid.optional(),
});
export type SendMessageBody = z.infer<typeof SendMessageBodySchema>;
```

- [ ] **Step 4: Re-export from `src/index.ts`**

Append to `packages/shared/src/index.ts`:

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
  type Chat,
  type Message,
  type MessagesPage,
  type ChatMember,
  type Reaction,
  type Media,
  type SendMessageBody,
  type Workspace,
} from './dto.js';
```

- [ ] **Step 5: Run, verify pass**

```bash
pnpm exec vitest run packages/shared/test/dto.test.ts
pnpm typecheck
```

Expected: tests pass; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/dto.ts packages/shared/src/index.ts packages/shared/test/dto.test.ts
git commit -m "feat(shared): add REST DTO Zod schemas for chats/messages"
```

---

### Task C2: API fetch wrapper

**Files:**
- Create: `packages/web/src/lib/api.ts`
- Create: `packages/web/test/lib/api.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/web/test/lib/api.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from '../../src/lib/api.js';

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON for 2xx', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const result = await apiFetch<{ ok: boolean }>('/api/test');
    expect(result).toEqual({ ok: true });
  });

  it('returns undefined for 204', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await apiFetch('/api/test', { method: 'POST' });
    expect(result).toBeUndefined();
  });

  it('throws ApiError with status on 4xx', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'nope' }), { status: 404, headers: { 'Content-Type': 'application/json' } }),
    );
    await expect(apiFetch('/api/test')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    });
  });

  it('serialises body as JSON and sets Content-Type', async () => {
    const mock = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', mock);
    await apiFetch('/api/x', { method: 'POST', body: { a: 1 } });
    const [, init] = mock.mock.calls[0]!;
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('verifies ApiError exposes the parsed body when JSON', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'BAD' }), { status: 400, headers: { 'Content-Type': 'application/json' } }),
    );
    try {
      await apiFetch('/api/x');
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).body).toEqual({ code: 'BAD' });
    }
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web test test/lib/api.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/web/src/lib/api.ts
export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    headers,
    body,
    signal: opts.signal,
    credentials: 'same-origin',
  });
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('Content-Type') ?? '';
  const parsed: unknown = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string'
        ? parsed.error
        : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, parsed);
  }
  return parsed as T;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @yank/web test test/lib/api.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/api.ts packages/web/test/lib/api.test.ts
git commit -m "feat(web): add apiFetch wrapper with ApiError type"
```

---

### Task C3: TanStack QueryClient factory + query key helpers

**Files:**
- Create: `packages/web/src/lib/queryClient.ts`
- Create: `packages/web/src/lib/queryKeys.ts`

- [ ] **Step 1: Create `queryClient.ts`**

```ts
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api.js';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          // Don't retry 4xx — only network/5xx, up to 2 times.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
```

- [ ] **Step 2: Create `queryKeys.ts`**

```ts
export const queryKeys = {
  chats: () => ['chats'] as const,
  chat: (chatId: string) => ['chat', chatId] as const,
  messages: (chatId: string) => ['messages', chatId] as const,
  chatMembers: (chatId: string) => ['chat-members', chatId] as const,
} as const;

export type QueryKey =
  | ReturnType<typeof queryKeys.chats>
  | ReturnType<typeof queryKeys.chat>
  | ReturnType<typeof queryKeys.messages>
  | ReturnType<typeof queryKeys.chatMembers>;
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/queryClient.ts packages/web/src/lib/queryKeys.ts
git commit -m "feat(web): add QueryClient factory and typed queryKeys"
```

---

### Task C4: Read queries (`useChats`, `useChat`, `useMessages`, `useChatMembers`)

**Files:**
- Create: `packages/web/src/lib/queries.ts`
- Create: `packages/web/test/lib/queries.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/web/test/lib/queries.test.tsx
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useChats, useMessages } from '../../src/lib/queries.js';
import type { ReactNode } from 'react';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useChats', () => {
  it('fetches and parses chats', async () => {
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          {
            id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
            userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
            jid: 'x@g.us',
            type: 'group',
            subject: 'Brief',
            lastMessageAt: '2026-05-14T13:02:00.000Z',
            lastMessagePreview: null,
            archived: false,
            mutedUntil: null,
            pinned: true,
            workspace: 'work',
            memberCount: 7,
            unreadCount: 4,
          },
        ]),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useChats(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]?.subject).toBe('Brief');
  });

  it('rejects bad shapes via Zod', async () => {
    server.use(http.get('/api/chats', () => HttpResponse.json([{ id: 'not-a-uuid' }])));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useChats(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useMessages', () => {
  it('fetches a page of messages', async () => {
    server.use(
      http.get('/api/chats/:chatId/messages', () =>
        HttpResponse.json({ messages: [], nextCursor: null }),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useMessages('b1ee0d52-2c8e-7e7a-a4cf-000000000001'), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.nextCursor).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web test test/lib/queries.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/web/src/lib/queries.ts
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ChatSchema,
  ChatMemberSchema,
  MessagesPageSchema,
  type Chat,
  type ChatMember,
  type MessagesPage,
} from '@yank/shared';
import { z } from 'zod';
import { apiFetch } from './api.js';
import { queryKeys } from './queryKeys.js';

const ChatListSchema = z.array(ChatSchema);
const ChatMemberListSchema = z.array(ChatMemberSchema);

export function useChats() {
  return useQuery({
    queryKey: queryKeys.chats(),
    queryFn: async (): Promise<Chat[]> => {
      const raw = await apiFetch<unknown>('/api/chats');
      return ChatListSchema.parse(raw);
    },
  });
}

export function useChat(chatId: string) {
  return useQuery({
    queryKey: queryKeys.chat(chatId),
    queryFn: async (): Promise<Chat> => {
      const raw = await apiFetch<unknown>(`/api/chats/${chatId}`);
      return ChatSchema.parse(raw);
    },
  });
}

export function useMessages(chatId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.messages(chatId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<MessagesPage> => {
      const qs = pageParam ? `?before=${pageParam}&limit=50` : '?limit=50';
      const raw = await apiFetch<unknown>(`/api/chats/${chatId}/messages${qs}`);
      return MessagesPageSchema.parse(raw);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useChatMembers(chatId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.chatMembers(chatId),
    enabled,
    queryFn: async (): Promise<ChatMember[]> => {
      const raw = await apiFetch<unknown>(`/api/chats/${chatId}/members`);
      return ChatMemberListSchema.parse(raw);
    },
  });
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @yank/web test test/lib/queries.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/queries.ts packages/web/test/lib/queries.test.tsx
git commit -m "feat(web): add chats/messages/members read queries"
```

---

### Task C5: Write mutations (send, mark-read, react, star, assign)

**Files:**
- Create: `packages/web/src/lib/mutations.ts`

- [ ] **Step 1: Implement**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSchema, type Message, type SendMessageBody, type Workspace } from '@yank/shared';
import { apiFetch } from './api.js';
import { queryKeys } from './queryKeys.js';

export function useSendMessage(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SendMessageBody): Promise<Message> => {
      const raw = await apiFetch<unknown>(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        body,
      });
      return MessageSchema.parse(raw);
    },
    onSuccess: () => {
      // Server-state cache is patched by the SSE handler when the daemon emits
      // status/message events; we just kick a refetch of the chats list so
      // last_message_preview updates immediately.
      qc.invalidateQueries({ queryKey: queryKeys.chats() });
    },
  });
}

export function useMarkRead(chatId: string) {
  return useMutation({
    mutationFn: (messageId: string) =>
      apiFetch<void>(`/api/chats/${chatId}/read`, { method: 'POST', body: { messageId } }),
  });
}

export function useReact() {
  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string | null }) =>
      apiFetch<void>(`/api/messages/${messageId}/reactions`, { method: 'POST', body: { emoji } }),
  });
}

export function useStar() {
  return useMutation({
    mutationFn: ({ messageId, starred }: { messageId: string; starred: boolean }) =>
      apiFetch<void>(`/api/messages/${messageId}/star`, { method: 'POST', body: { starred } }),
  });
}

export function useAssignWorkspace(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspace: Exclude<Workspace, 'triage'>) =>
      apiFetch<void>(`/api/chats/${chatId}/assignment`, { method: 'POST', body: { workspace } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.chats() }),
  });
}
```

(Mutation tests are deferred — they're exercised via component tests for Composer and Triage later.)

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @yank/web typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/mutations.ts
git commit -m "feat(web): add send/mark-read/react/star/assign mutations"
```

---

### Task C6: SSE hook `useEventStream` with reconnect + cache patching

**Files:**
- Create: `packages/web/src/lib/eventStream.ts`
- Create: `packages/web/test/lib/eventStream.test.ts`
- Delete: `packages/web/src/sse.ts` (M2's `useYankEvents`)
- Modify: callers of `useYankEvents` → swap to `useEventStream`

**M2 baseline:** `packages/web/src/sse.ts` exports `useYankEvents(onEvent?)`. It opens `EventSource('/api/events')` and subscribes to **named events** via `addEventListener('qr' | 'connected' | 'disconnected' | 'sync-progress' | 'sync-complete' | 'message' | 'status', dispatch)`. It patches caches for `message` (invalidate messages + chats), `status` (`setQueriesData` to flip the optimistic row), `connected`/`disconnected` (invalidate `setup-status`). It does NOT reconnect on error and does NOT validate against a Zod schema.

The new `useEventStream` keeps the **endpoint** (`/api/events`), the **named-event subscription pattern**, and the **status cache surgery**, but adds reconnect with exponential backoff and Zod validation. The optimistic-`setQueriesData` for `status` events is preserved because invalidation alone would lose the in-flight composer state.

- [ ] **Step 1: Write failing test**

```ts
// packages/web/test/lib/eventStream.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEventStream } from '../../src/lib/eventStream.js';
import type { ReactNode } from 'react';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readyState = 0;
  url: string;
  onerror: ((e: Event) => void) | null = null;
  onopen: ((e: Event) => void) | null = null;
  closed = false;
  listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  close() { this.closed = true; }
  /** Emit a named event (e.g. 'message', 'status'). */
  emit(type: string, data: unknown) {
    const ev = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
  fail() { this.onerror?.(new Event('error')); }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function wrap(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useEventStream', () => {
  it('opens an EventSource on mount and closes on unmount', () => {
    const qc = new QueryClient();
    const { unmount } = renderHook(() => useEventStream(), { wrapper: wrap(qc) });
    expect(FakeEventSource.instances).toHaveLength(1);
    unmount();
    expect(FakeEventSource.instances[0]?.closed).toBe(true);
  });

  it('invalidates messages on a named `message` event', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useEventStream(), { wrapper: wrap(qc) });
    act(() => {
      FakeEventSource.instances[0]?.emit('message', {
        type: 'message',
        userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
        chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
        messageId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000050',
      });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['messages', 'b1ee0d52-2c8e-7e7a-a4cf-000000000001'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['chats'] });
  });

  it('opens the stream at /api/events by default', () => {
    const qc = new QueryClient();
    renderHook(() => useEventStream(), { wrapper: wrap(qc) });
    expect(FakeEventSource.instances[0]?.url).toBe('/api/events');
  });

  it('reconnects with backoff on error', () => {
    const qc = new QueryClient();
    renderHook(() => useEventStream(), { wrapper: wrap(qc) });
    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => { FakeEventSource.instances[0]?.fail(); });
    // Initial backoff is 1000ms
    act(() => { vi.advanceTimersByTime(1000); });
    expect(FakeEventSource.instances).toHaveLength(2);
    act(() => { FakeEventSource.instances[1]?.fail(); });
    // Next backoff is 2000ms (cumulative jitter ignored — exact value)
    act(() => { vi.advanceTimersByTime(2000); });
    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it('ignores malformed JSON without crashing', () => {
    const qc = new QueryClient();
    renderHook(() => useEventStream(), { wrapper: wrap(qc) });
    expect(() => {
      act(() => {
        const fn = FakeEventSource.instances[0]?.listeners.get('message')?.[0];
        fn?.(new MessageEvent('message', { data: 'not-json' }));
      });
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web test test/lib/eventStream.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/web/src/lib/eventStream.ts
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DaemonEventSchema, type DaemonEvent } from '@yank/shared';
import type { Message } from '@yank/shared';
import { queryKeys } from './queryKeys.js';

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const NAMED_EVENTS = [
  'qr', 'connected', 'disconnected', 'sync-progress', 'sync-complete', 'message', 'status',
] as const;

export interface UseEventStreamOptions {
  url?: string;
  onEvent?: (evt: DaemonEvent) => void;
}

export function useEventStream(opts: UseEventStreamOptions = {}): void {
  const qc = useQueryClient();
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;
  const url = opts.url ?? '/api/events';

  useEffect(() => {
    let backoff = BACKOFF_INITIAL_MS;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const dispatch = (raw: MessageEvent) => {
      let parsed: DaemonEvent;
      try {
        parsed = DaemonEventSchema.parse(JSON.parse(raw.data as string));
      } catch {
        return;
      }
      patchCache(parsed);
      onEventRef.current?.(parsed);
    };

    const open = () => {
      if (cancelled) return;
      es = new EventSource(url);
      es.onopen = () => { backoff = BACKOFF_INITIAL_MS; };
      for (const name of NAMED_EVENTS) {
        es.addEventListener(name, dispatch as EventListener);
      }
      es.onerror = () => {
        es?.close();
        es = null;
        if (cancelled) return;
        retryTimer = setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
      };
    };

    const patchCache = (evt: DaemonEvent) => {
      switch (evt.type) {
        case 'message':
          qc.invalidateQueries({ queryKey: queryKeys.messages(evt.chatId) });
          qc.invalidateQueries({ queryKey: queryKeys.chats() });
          return;
        case 'status':
          // Patch the optimistic row in any cached messages list by localId.
          // Done with setQueriesData so the composer's in-flight UI doesn't
          // flash empty during a refetch (the M2 behaviour we keep).
          qc.setQueriesData<Message[]>({ queryKey: ['messages'] }, (prev) =>
            prev?.map((m) =>
              m.id === evt.localId
                ? { ...m, status: evt.status, waMessageId: evt.waMessageId ?? m.waMessageId }
                : m,
            ),
          );
          qc.invalidateQueries({ queryKey: queryKeys.chats() });
          return;
        case 'connected':
        case 'disconnected':
        case 'sync-complete':
          qc.invalidateQueries({ queryKey: queryKeys.chats() });
          qc.invalidateQueries({ queryKey: ['setup-status'] });
          return;
        // qr / sync-progress are consumed via onEvent by the setup screen.
        default:
          return;
      }
    };

    open();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [qc, url]);
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @yank/web test test/lib/eventStream.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Migrate the M2 callers**

Find every `import { useYankEvents }` and replace with `import { useEventStream }`. In `routes/setup.tsx` (and any other caller) swap `useYankEvents((e) => …)` for `useEventStream({ onEvent: (e) => … })`. Then delete `packages/web/src/sse.ts`.

- [ ] **Step 6: Commit**

```bash
git rm packages/web/src/sse.ts
git add packages/web/src/lib/eventStream.ts packages/web/test/lib/eventStream.test.ts packages/web/src/routes/setup.tsx
git commit -m "feat(web): replace useYankEvents with useEventStream (named events + reconnect + Zod)"
```

---

## Group D — UI state (Zustand)

### Task D1: `useUiStore` — workspace, thread, palette

**Files:**
- Create: `packages/web/src/state/ui.ts`

- [ ] **Step 1: Implement**

```ts
import { create } from 'zustand';
import type { Workspace } from '@yank/shared';

// Workspace selection in the UI is one of work/personal/triage (not 'hidden').
export type ActiveWorkspace = Exclude<Workspace, 'hidden'>;

interface UiState {
  workspace: ActiveWorkspace;
  paletteOpen: boolean;
  openThreadId: string | null;

  setWorkspace: (w: ActiveWorkspace) => void;
  togglePalette: (open?: boolean) => void;
  openThread: (messageId: string) => void;
  closeThread: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  workspace: 'work',
  paletteOpen: false,
  openThreadId: null,

  setWorkspace: (workspace) => set({ workspace }),
  togglePalette: (open) => set((s) => ({ paletteOpen: open ?? !s.paletteOpen })),
  openThread: (openThreadId) => set({ openThreadId }),
  closeThread: () => set({ openThreadId: null }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/state/ui.ts
git commit -m "feat(web): add Zustand UI store (workspace, palette, thread)"
```

---

### Task D2: `useDraftsStore` — persisted per-chat composer drafts

**Files:**
- Create: `packages/web/src/state/drafts.ts`
- Create: `packages/web/test/state/drafts.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/web/test/state/drafts.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useDraftsStore } from '../../src/state/drafts.js';

describe('useDraftsStore', () => {
  beforeEach(() => {
    useDraftsStore.setState({ drafts: {} });
    localStorage.clear();
  });

  it('stores a draft per chatId', () => {
    useDraftsStore.getState().setDraft('chat-a', 'hello');
    useDraftsStore.getState().setDraft('chat-b', 'world');
    expect(useDraftsStore.getState().drafts).toEqual({ 'chat-a': 'hello', 'chat-b': 'world' });
  });

  it('clears a single draft', () => {
    useDraftsStore.getState().setDraft('chat-a', 'hello');
    useDraftsStore.getState().clearDraft('chat-a');
    expect(useDraftsStore.getState().drafts['chat-a']).toBeUndefined();
  });

  it('persists drafts to localStorage', () => {
    useDraftsStore.getState().setDraft('chat-a', 'persisted');
    const raw = localStorage.getItem('yank:drafts');
    expect(raw).toBeTruthy();
    expect(raw).toContain('persisted');
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web test test/state/drafts.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/web/src/state/drafts.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface DraftsState {
  drafts: Record<string, string>;
  setDraft: (chatId: string, text: string) => void;
  clearDraft: (chatId: string) => void;
}

export const useDraftsStore = create<DraftsState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (chatId, text) =>
        set((s) => ({ drafts: { ...s.drafts, [chatId]: text } })),
      clearDraft: (chatId) =>
        set((s) => {
          const next = { ...s.drafts };
          delete next[chatId];
          return { drafts: next };
        }),
    }),
    {
      name: 'yank:drafts',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @yank/web test test/state/drafts.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/state/drafts.ts packages/web/test/state/drafts.test.ts
git commit -m "feat(web): add persisted per-chat draft store"
```

---

### Task D3: `useActiveWorkspace` hook (route → workspace + auto-accent)

**Files:**
- Create: `packages/web/src/hooks/useActiveWorkspace.ts`

- [ ] **Step 1: Implement**

```ts
import { useEffect } from 'react';
import { useUiStore } from '../state/ui.js';
import { applyAccent, type Accent } from '../lib/theme.js';

/**
 * Subscribes to workspace changes and (re)applies the accent attribute on
 * the document root. Components that just need to read the workspace value
 * should call `useUiStore((s) => s.workspace)` directly.
 *
 * `accent` is a pinned override; pass `'auto'` for workspace-tracking.
 */
export function useActiveWorkspace(accent: Accent = 'auto'): void {
  const workspace = useUiStore((s) => s.workspace);
  useEffect(() => {
    applyAccent(accent, workspace);
  }, [accent, workspace]);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/hooks/useActiveWorkspace.ts
git commit -m "feat(web): add useActiveWorkspace hook (auto-accent)"
```

---

### Task D4: Global keyboard shortcut hook

**Files:**
- Create: `packages/web/src/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 1: Implement**

```ts
import { useEffect } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useUiStore } from '../state/ui.js';

/**
 * Wires Cmd+K, Cmd+1/2/3, Cmd+Shift+F, Esc. Mount once at the root.
 * The Esc handler runs only when something is open (palette or thread);
 * otherwise it lets the event through to a route-local handler.
 */
export function useKeyboardShortcuts(): void {
  const navigate = useNavigate();
  const router = useRouter();
  const togglePalette = useUiStore((s) => s.togglePalette);
  const setWorkspace = useUiStore((s) => s.setWorkspace);
  const openThreadId = useUiStore((s) => s.openThreadId);
  const closeThread = useUiStore((s) => s.closeThread);
  const paletteOpen = useUiStore((s) => s.paletteOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      const tag = target instanceof HTMLElement ? target.tagName : '';
      const inEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (target instanceof HTMLElement && target.isContentEditable);

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'k' && !e.shiftKey) {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (mod && !e.shiftKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault();
        const ws = e.key === '1' ? 'work' : e.key === '2' ? 'personal' : 'triage';
        setWorkspace(ws);
        if (ws === 'triage') {
          void navigate({ to: '/triage' });
        } else {
          void navigate({ to: '/' });
        }
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        void navigate({ to: '/search' });
        return;
      }
      if (e.key === 'Escape' && !inEditable) {
        if (paletteOpen) {
          togglePalette(false);
          return;
        }
        if (openThreadId) {
          closeThread();
          // Drop the thread segment by navigating up one level.
          const match = router.state.matches.at(-1);
          if (match?.routeId?.includes('/t/')) {
            void navigate({ to: '..', params: true as never });
          }
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    navigate,
    router,
    togglePalette,
    setWorkspace,
    paletteOpen,
    openThreadId,
    closeThread,
  ]);
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @yank/web typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/hooks/useKeyboardShortcuts.ts
git commit -m "feat(web): add global keyboard shortcuts hook"
```

---

## Group E — App shell & routing

### Task E1: Rewrite `main.tsx` (router + QueryClient + global styles + SSE bootstrap)

**Files:**
- Modify: `packages/web/src/main.tsx`
- Create: `packages/web/src/router.tsx`

- [ ] **Step 1: Create `router.tsx`**

```tsx
// packages/web/src/router.tsx
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.js';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

`routeTree.gen.js` is emitted by the TanStack Router Vite plugin once Group E's route files exist. The first time you run `pnpm --filter @yank/web dev` after E2 it'll create the file under `src/routeTree.gen.ts`. Add `src/routeTree.gen.ts` to `.gitignore`:

```bash
echo 'packages/web/src/routeTree.gen.ts' >> .gitignore
```

- [ ] **Step 2: Rewrite `main.tsx`**

```tsx
// packages/web/src/main.tsx
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';

import './styles/tokens.css';
import './styles/reset.css';
import './styles/globals.css';

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { createQueryClient } from './lib/queryClient.js';
import { router } from './router.js';

const queryClient = createQueryClient();
const root = document.getElementById('root');
if (!root) throw new Error('No #root element');

ReactDOM.createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/main.tsx packages/web/src/router.tsx .gitignore
git commit -m "feat(web): bootstrap router + QueryClient in main.tsx"
```

---

### Task E2: Root layout route `__root.tsx` (4-column shell)

**Files:**
- Create: `packages/web/src/routes/__root.tsx`

- [ ] **Step 1: Implement**

```tsx
// packages/web/src/routes/__root.tsx
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { useEventStream } from '../lib/eventStream.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace.js';
import { useUiStore } from '../state/ui.js';
import { Rail } from '../components/shell/Rail.js';
import { Sidebar } from '../components/shell/Sidebar.js';
import { CommandPalette } from '../components/palette/CommandPalette.js';
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
    </div>
  );
}
```

- [ ] **Step 2: Create `__root.module.css`**

```css
.shell {
  display: grid;
  grid-template-columns: var(--rail-w) var(--sidebar-w) 1fr;
  height: 100vh;
  background: var(--bg-0);
  color: var(--fg-0);
}
.threadOpen {
  grid-template-columns: var(--rail-w) var(--sidebar-w) 1fr var(--thread-w);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/__root.tsx packages/web/src/routes/__root.module.css
git commit -m "feat(web): add root route with 4-column shell layout"
```

---

### Task E3: Workspace `Rail` component

**Files:**
- Create: `packages/web/src/components/shell/Rail.tsx`
- Create: `packages/web/src/components/shell/Rail.module.css`
- Create: `packages/web/src/components/shell/RailButton.tsx`
- Create: `packages/web/src/components/shell/RailButton.module.css`
- Create: `packages/web/test/components/shell/Rail.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/web/test/components/shell/Rail.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory, createRouter, createRootRoute, createRoute, RouterProvider } from '@tanstack/react-router';
import { Rail } from '../../../src/components/shell/Rail.js';
import { useUiStore } from '../../../src/state/ui.js';

function renderRail(initial = '/') {
  const rootRoute = createRootRoute({ component: () => <Rail /> });
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null });
  const triageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/triage', component: () => null });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, triageRoute]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('Rail', () => {
  it('renders the three workspace buttons', () => {
    renderRail();
    expect(screen.getByRole('button', { name: /work/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /personal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /triage/i })).toBeInTheDocument();
  });

  it('clicking Personal updates the workspace in the store', async () => {
    const user = userEvent.setup();
    renderRail();
    await user.click(screen.getByRole('button', { name: /personal/i }));
    expect(useUiStore.getState().workspace).toBe('personal');
  });

  it('shows Work as active by default', () => {
    useUiStore.setState({ workspace: 'work' });
    renderRail();
    const btn = screen.getByRole('button', { name: /work/i });
    expect(btn).toHaveAttribute('aria-current', 'true');
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web test test/components/shell/Rail.test.tsx
```

Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `RailButton`**

```tsx
// packages/web/src/components/shell/RailButton.tsx
import type { ReactNode } from 'react';
import styles from './RailButton.module.css';

interface RailButtonProps {
  active?: boolean;
  workspace?: 'work' | 'personal' | 'triage';
  count?: number;
  mono?: string;
  glyph?: ReactNode;
  title: string;
  onClick: () => void;
}

export function RailButton({ active, workspace, count, mono, glyph, title, onClick }: RailButtonProps) {
  return (
    <button
      type="button"
      className={
        styles.btn +
        (active ? ' ' + styles.active : '') +
        (workspace ? ' ' + styles[`ws_${workspace}`] : '')
      }
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-current={active ? 'true' : undefined}
    >
      {mono ? <span className={styles.mono}>{mono}</span> : glyph}
      {workspace && <span className={styles.wsDot + ' ' + styles[`wsDot_${workspace}`]} />}
      {count !== undefined && count > 0 && <span className={styles.badge}>{count}</span>}
    </button>
  );
}
```

- [ ] **Step 4: Implement `RailButton.module.css`**

Port the relevant rules from `mockups/.../styles.css` `.rail-btn`, `.rail-btn.active`, `.rail-btn .ws-dot`, `.rail-btn .badge` — class names translated to lowerCamelCase (`btn`, `active`, `wsDot`, `wsDot_work`, `wsDot_personal`, `wsDot_triage`, `mono`, `badge`). Refer to mockup file lines ~204–250 for source styles.

- [ ] **Step 5: Implement `Rail.tsx`**

```tsx
// packages/web/src/components/shell/Rail.tsx
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useUiStore } from '../../state/ui.js';
import { useChats } from '../../lib/queries.js';
import { RailButton } from './RailButton.js';
import { SearchIcon, BookmarkIcon, DirectoryIcon, ActivityIcon, SettingsIcon } from '../icons/index.js';
import { avatarGradient } from '../../utils/avatarGradient.js';
import styles from './Rail.module.css';

const RAIL_VIEWS = ['search', 'saved', 'directory', 'diagnostics', 'settings'] as const;
type RailView = (typeof RAIL_VIEWS)[number];

export function Rail() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const workspace = useUiStore((s) => s.workspace);
  const setWorkspace = useUiStore((s) => s.setWorkspace);
  const { data: chats = [] } = useChats();
  const triageCount = chats.filter((c) => c.workspace === 'triage').length;

  const railView: 'work' | 'personal' | 'triage' | RailView =
    path === '/triage' ? 'triage'
    : path === '/search' ? 'search'
    : path === '/saved' ? 'saved'
    : path === '/directory' ? 'directory'
    : path === '/diagnostics' ? 'diagnostics'
    : path === '/settings' ? 'settings'
    : workspace;

  return (
    <aside className={styles.rail}>
      <div className={styles.logo} title="Yank">yk</div>

      <RailButton workspace="work" mono="W" active={railView === 'work'} title="Work · ⌘1"
        onClick={() => { setWorkspace('work'); void navigate({ to: '/' }); }} />
      <RailButton workspace="personal" mono="P" active={railView === 'personal'} title="Personal · ⌘2"
        onClick={() => { setWorkspace('personal'); void navigate({ to: '/' }); }} />
      <RailButton workspace="triage" mono="T" count={triageCount} active={railView === 'triage'} title="Triage · ⌘3"
        onClick={() => { setWorkspace('triage'); void navigate({ to: '/triage' }); }} />

      <div className={styles.divider} />

      <RailButton glyph={<SearchIcon size={18} />} active={railView === 'search'} title="Search · ⌘⇧F"
        onClick={() => void navigate({ to: '/search' })} />
      <RailButton glyph={<BookmarkIcon size={18} />} active={railView === 'saved'} title="Saved messages"
        onClick={() => void navigate({ to: '/saved' })} />
      <RailButton glyph={<DirectoryIcon size={18} />} active={railView === 'directory'} title="Directory (phase 2)"
        onClick={() => void navigate({ to: '/directory' })} />

      <div className={styles.spacer} />

      <RailButton glyph={<ActivityIcon size={18} />} active={railView === 'diagnostics'} title="Diagnostics"
        onClick={() => void navigate({ to: '/diagnostics' })} />
      <RailButton glyph={<SettingsIcon size={18} />} active={railView === 'settings'} title="Settings"
        onClick={() => void navigate({ to: '/settings' })} />

      <div className={`${styles.avatar} ${avatarGradient('You')}`} title="You">
        TM<span className={styles.online} />
      </div>
    </aside>
  );
}
```

- [ ] **Step 6: `Rail.module.css`**

Port the `.rail`, `.rail-logo`, `.rail-divider`, `.rail-spacer`, `.rail-avatar`, `.rail-avatar .online` rules from `mockups/.../styles.css` (lines ~182–280). Map class names to lowerCamelCase (`rail`, `logo`, `divider`, `spacer`, `avatar`, `online`).

- [ ] **Step 7: Run, verify pass**

```bash
pnpm --filter @yank/web test test/components/shell/Rail.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/components/shell/Rail.tsx packages/web/src/components/shell/Rail.module.css packages/web/src/components/shell/RailButton.tsx packages/web/src/components/shell/RailButton.module.css packages/web/test/components/shell/Rail.test.tsx
git commit -m "feat(web): add workspace Rail with active state + triage count"
```

---

### Task E4: `ChatRow` primitive

**Files:**
- Create: `packages/web/src/components/shell/ChatRow.tsx`
- Create: `packages/web/src/components/shell/ChatRow.module.css`
- Create: `packages/web/test/components/shell/ChatRow.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/web/test/components/shell/ChatRow.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatRow } from '../../../src/components/shell/ChatRow.js';
import type { Chat } from '@yank/shared';

const baseChat: Chat = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  jid: 'x@g.us',
  type: 'group',
  subject: 'Brief',
  lastMessageAt: '2026-05-14T13:02:00.000Z',
  lastMessagePreview: null,
  archived: false,
  mutedUntil: null,
  pinned: false,
  workspace: 'work',
  memberCount: 7,
  unreadCount: 0,
};

describe('ChatRow', () => {
  it('renders the chat subject', () => {
    render(<ChatRow chat={baseChat} active={false} onClick={() => {}} />);
    expect(screen.getByText('Brief')).toBeInTheDocument();
  });

  it('shows the unread badge when unread > 0', () => {
    render(<ChatRow chat={{ ...baseChat, unreadCount: 4 }} active={false} onClick={() => {}} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('hides the unread badge when unread is 0', () => {
    render(<ChatRow chat={baseChat} active={false} onClick={() => {}} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('calls onClick when the row is activated', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<ChatRow chat={baseChat} active={false} onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('marks the row as current when active=true', () => {
    render(<ChatRow chat={baseChat} active={true} onClick={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-current', 'true');
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web test test/components/shell/ChatRow.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ChatRow.tsx`**

```tsx
// packages/web/src/components/shell/ChatRow.tsx
import type { Chat } from '@yank/shared';
import { avatarGradient } from '../../utils/avatarGradient.js';
import { PinIcon, MutedIcon } from '../icons/index.js';
import styles from './ChatRow.module.css';

interface ChatRowProps {
  chat: Chat;
  active: boolean;
  onClick: () => void;
}

export function ChatRow({ chat, active, onClick }: ChatRowProps) {
  const title = chat.subject ?? chat.jid;
  const seed = chat.type === 'dm' ? title : chat.id;
  const muted = chat.mutedUntil !== null && new Date(chat.mutedUntil) > new Date();
  return (
    <button
      type="button"
      className={
        styles.row +
        (active ? ' ' + styles.active : '') +
        (chat.unreadCount > 0 ? ' ' + styles.unread : '')
      }
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
    >
      <span className={`${styles.icon} ${chat.type === 'dm' ? styles.iconDm : ''} ${avatarGradient(seed)}`}>
        {title.slice(0, 2).toUpperCase()}
      </span>
      <span className={styles.titleSlot}>
        <span className={styles.title}>{title}</span>
      </span>
      <span className={styles.meta}>
        {chat.pinned && <span className={styles.pin}><PinIcon size={11} /></span>}
        {muted && <span className={styles.mute}><MutedIcon size={12} /></span>}
        {chat.unreadCount > 0 && (
          <span className={styles.badge + (muted ? ' ' + styles.badgeMuted : '')}>
            {chat.unreadCount}
          </span>
        )}
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Implement `ChatRow.module.css`**

Port from mockup styles.css `.chat-row`, `.chat-row.active`, `.chat-row.unread`, `.chat-icon`, `.chat-icon.dm`, `.chat-name`, `.chat-meta`, `.pin-glyph`, `.mute-glyph`, `.unread-badge`, `.unread-badge.muted` (mockup lines ~340–430). Translate `.chat-row` → `.row`, `.chat-icon` → `.icon`, `.chat-icon.dm` → `.iconDm`, `.chat-name` → `.title`, `.chat-meta` → `.meta`, `.pin-glyph` → `.pin`, `.mute-glyph` → `.mute`, `.unread-badge` → `.badge`, `.unread-badge.muted` → `.badgeMuted`, and add `.unread` + `.active` + `.titleSlot`.

- [ ] **Step 5: Run, verify pass**

```bash
pnpm --filter @yank/web test test/components/shell/ChatRow.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/shell/ChatRow.tsx packages/web/src/components/shell/ChatRow.module.css packages/web/test/components/shell/ChatRow.test.tsx
git commit -m "feat(web): add ChatRow component"
```

---

### Task E5: `Sidebar` (filtered by workspace, sections, search-as-palette)

**Files:**
- Create: `packages/web/src/components/shell/Sidebar.tsx`
- Create: `packages/web/src/components/shell/Sidebar.module.css`
- Create: `packages/web/src/components/shell/PhoneStatusFoot.tsx`
- Create: `packages/web/src/components/shell/PhoneStatusFoot.module.css`
- Create: `packages/web/test/components/shell/Sidebar.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/web/test/components/shell/Sidebar.test.tsx
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, createRootRoute, createRoute, RouterProvider } from '@tanstack/react-router';
import { Sidebar } from '../../../src/components/shell/Sidebar.js';
import { useUiStore } from '../../../src/state/ui.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderSidebar(initial = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: () => <Sidebar /> });
  const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const chat = createRoute({ getParentRoute: () => root, path: '/c/$chatId', component: () => null });
  const router = createRouter({
    routeTree: root.addChildren([idx, chat]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('Sidebar', () => {
  it('shows only chats matching the active workspace', async () => {
    useUiStore.setState({ workspace: 'work' });
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          { id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001', userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099', jid: 'a@g.us', type: 'group', subject: 'Work A', lastMessageAt: null, lastMessagePreview: null, archived: false, mutedUntil: null, pinned: false, workspace: 'work', memberCount: 3, unreadCount: 0 },
          { id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002', userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099', jid: 'b@g.us', type: 'group', subject: 'Personal B', lastMessageAt: null, lastMessagePreview: null, archived: false, mutedUntil: null, pinned: false, workspace: 'personal', memberCount: 3, unreadCount: 0 },
        ]),
      ),
    );
    renderSidebar();
    await waitFor(() => screen.getByText('Work A'));
    expect(screen.queryByText('Personal B')).not.toBeInTheDocument();
  });

  it('renders Pinned, Group chats, Direct messages sections when populated', async () => {
    useUiStore.setState({ workspace: 'work' });
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          { id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001', userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099', jid: 'a@g.us', type: 'group', subject: 'Pinned A', lastMessageAt: null, lastMessagePreview: null, archived: false, mutedUntil: null, pinned: true, workspace: 'work', memberCount: 3, unreadCount: 0 },
          { id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002', userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099', jid: 'b@g.us', type: 'group', subject: 'Group B', lastMessageAt: null, lastMessagePreview: null, archived: false, mutedUntil: null, pinned: false, workspace: 'work', memberCount: 3, unreadCount: 0 },
          { id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000003', userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099', jid: '4477@s.whatsapp.net', type: 'dm', subject: 'DM C', lastMessageAt: null, lastMessagePreview: null, archived: false, mutedUntil: null, pinned: false, workspace: 'work', memberCount: 0, unreadCount: 0 },
        ]),
      ),
    );
    renderSidebar();
    await waitFor(() => screen.getByText('Pinned A'));
    expect(screen.getByText(/pinned/i)).toBeInTheDocument();
    expect(screen.getByText(/group chats/i)).toBeInTheDocument();
    expect(screen.getByText(/direct messages/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web test test/components/shell/Sidebar.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `PhoneStatusFoot.tsx`**

```tsx
// packages/web/src/components/shell/PhoneStatusFoot.tsx
import { PhoneIcon } from '../icons/index.js';
import styles from './PhoneStatusFoot.module.css';

interface Props {
  phoneNumber: string | null;
  syncedAgo: string;
  connected: boolean;
}

export function PhoneStatusFoot({ phoneNumber, syncedAgo, connected }: Props) {
  return (
    <div className={styles.foot}>
      <span className={styles.iconWrap}>
        <PhoneIcon size={14} />
        {connected && <span className={styles.ping} />}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>
          {connected ? 'WhatsApp linked' : 'WhatsApp disconnected'}
        </span>
        <span className={styles.meta}>
          {phoneNumber ?? 'no device'} · synced {syncedAgo}
        </span>
      </span>
    </div>
  );
}
```

For M3 we hard-code `connected={true}`, `phoneNumber=null` (no `/api/session` endpoint defined yet), and `syncedAgo='—'`; M2 owns a future `/api/session` endpoint. Wire it through props so swapping the source is mechanical.

- [ ] **Step 4: `PhoneStatusFoot.module.css`**

Port `.sidebar-foot`, `.phone-icon`, `.ping`, `.label`, `.meta` rules from mockup styles.css.

- [ ] **Step 5: Implement `Sidebar.tsx`**

```tsx
// packages/web/src/components/shell/Sidebar.tsx
import { useMemo } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useChats } from '../../lib/queries.js';
import { useUiStore } from '../../state/ui.js';
import { ChatRow } from './ChatRow.js';
import { PhoneStatusFoot } from './PhoneStatusFoot.js';
import { SearchIcon, ChevronDownIcon, PlusIcon, MoreIcon } from '../icons/index.js';
import type { Chat } from '@yank/shared';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const workspace = useUiStore((s) => s.workspace);
  const togglePalette = useUiStore((s) => s.togglePalette);
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { chatId?: string };
  const activeChatId = params.chatId;
  const { data: chats = [] } = useChats();

  const { pinned, groups, dms } = useMemo(() => {
    const wsChats: Chat[] = chats.filter((c) => c.workspace === workspace);
    return {
      pinned: wsChats.filter((c) => c.pinned),
      groups: wsChats.filter((c) => !c.pinned && c.type !== 'dm'),
      dms: wsChats.filter((c) => !c.pinned && c.type === 'dm'),
    };
  }, [chats, workspace]);

  const title = workspace === 'work' ? 'Work' : workspace === 'personal' ? 'Personal' : 'Triage';

  return (
    <aside className={styles.sidebar}>
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{title}</h2>
          <span className={styles.chev}><ChevronDownIcon size={10} /></span>
          <div className={styles.actions}>
            <button type="button" className={styles.iconBtn} title="New message"><PlusIcon size={14} /></button>
            <button type="button" className={styles.iconBtn} title="More"><MoreIcon size={14} /></button>
          </div>
        </div>
        <button type="button" className={styles.search} onClick={() => togglePalette(true)}>
          <SearchIcon size={13} />
          <span className={styles.searchPlaceholder}>Jump to or search {title.toLowerCase()}…</span>
          <span className={styles.kbd}>⌘K</span>
        </button>
      </div>

      <div className={styles.scroll}>
        {pinned.length > 0 && (
          <Section label="Pinned" count={pinned.length}>
            {pinned.map((c) => (
              <ChatRow key={c.id} chat={c} active={c.id === activeChatId}
                onClick={() => void navigate({ to: '/c/$chatId', params: { chatId: c.id } })} />
            ))}
          </Section>
        )}
        {groups.length > 0 && (
          <Section label="Group chats" count={groups.length} addable>
            {groups.map((c) => (
              <ChatRow key={c.id} chat={c} active={c.id === activeChatId}
                onClick={() => void navigate({ to: '/c/$chatId', params: { chatId: c.id } })} />
            ))}
          </Section>
        )}
        {dms.length > 0 && (
          <Section label="Direct messages" count={dms.length} addable>
            {dms.map((c) => (
              <ChatRow key={c.id} chat={c} active={c.id === activeChatId}
                onClick={() => void navigate({ to: '/c/$chatId', params: { chatId: c.id } })} />
            ))}
          </Section>
        )}
      </div>

      <PhoneStatusFoot phoneNumber={null} syncedAgo="—" connected={true} />
    </aside>
  );
}

function Section({ label, count, addable, children }: { label: string; count: number; addable?: boolean; children: React.ReactNode }) {
  return (
    <>
      <div className={styles.section}>
        <span className={styles.sectionChev}><ChevronDownIcon size={9} /></span>
        {label}
        <span className={styles.sectionCount}>{count}</span>
        {addable && <button type="button" className={styles.sectionAdd} title={`Add to ${label}`}><PlusIcon size={11} /></button>}
      </div>
      <div className={styles.list}>{children}</div>
    </>
  );
}
```

- [ ] **Step 6: `Sidebar.module.css`**

Port the mockup's `.sidebar`, `.sidebar-head`, `.sidebar-title`, `.searchbar`, `.sidebar-scroll`, `.sidebar-section`, `.sidebar-list`, `.chev`, `.chev-s`, `.count`, `.add`, `.icon-btn`, `.actions` rules (mockup lines ~280–340). Map to lowerCamelCase as documented in the JSX above.

- [ ] **Step 7: Run, verify pass**

```bash
pnpm --filter @yank/web test test/components/shell/Sidebar.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/components/shell/Sidebar.tsx packages/web/src/components/shell/Sidebar.module.css packages/web/src/components/shell/PhoneStatusFoot.tsx packages/web/src/components/shell/PhoneStatusFoot.module.css packages/web/test/components/shell/Sidebar.test.tsx
git commit -m "feat(web): add Sidebar with pinned/groups/DMs sections + phone status"
```

---

### Task E6: Route stubs + index route

**Files:**
- Create: `packages/web/src/routes/index.tsx`
- Create: `packages/web/src/routes/triage.tsx`
- Create: `packages/web/src/routes/search.tsx`
- Create: `packages/web/src/routes/saved.tsx`
- Create: `packages/web/src/routes/settings.tsx`
- Create: `packages/web/src/routes/diagnostics.tsx`
- Create: `packages/web/src/routes/directory.tsx`

- [ ] **Step 1: `index.tsx` — redirect to the last active chat in current workspace**

```tsx
// packages/web/src/routes/index.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { ChatSchema } from '@yank/shared';
import { useUiStore } from '../state/ui.js';
import { apiFetch } from '../lib/api.js';

const ChatListSchema = z.array(ChatSchema);

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const workspace = useUiStore.getState().workspace;
    const raw = await apiFetch<unknown>('/api/chats');
    const chats = ChatListSchema.parse(raw);
    const active = chats
      .filter((c) => c.workspace === workspace)
      .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))[0];
    if (active) throw redirect({ to: '/c/$chatId', params: { chatId: active.id } });
    if (workspace === 'triage') throw redirect({ to: '/triage' });
  },
  component: EmptyState,
});

function EmptyState() {
  const workspace = useUiStore((s) => s.workspace);
  return (
    <main style={{ display: 'grid', placeItems: 'center', color: 'var(--fg-2)' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 16, color: 'var(--fg-0)' }}>No chats in {workspace}</h2>
        <p style={{ fontSize: 13 }}>New chats appear in Triage first.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Each stub route follows this template**

```tsx
// packages/web/src/routes/triage.tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/triage')({
  component: () => (
    <main style={{ padding: 24, color: 'var(--fg-1)' }}>
      <h1 style={{ fontSize: 16, color: 'var(--fg-0)' }}>Triage</h1>
      <p style={{ fontSize: 13 }}>Card grid lands in M4.</p>
    </main>
  ),
});
```

Repeat for `search.tsx`, `saved.tsx`, `settings.tsx`, `diagnostics.tsx`, `directory.tsx` — adjust the heading and copy line to match the route. Each is ~15 lines.

- [ ] **Step 3: Verify the router plugin emits `routeTree.gen.ts`**

Run:
```bash
pnpm --filter @yank/web dev
```

Open another terminal and verify the file exists:
```bash
ls packages/web/src/routeTree.gen.ts
```

Stop the dev server with `Ctrl-C`.

- [ ] **Step 4: Run typecheck**

```bash
pnpm --filter @yank/web typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/routes
git commit -m "feat(web): add index route + view stubs (triage/search/saved/etc.)"
```

---

## Group F — Chat view

### Task F1: `Avatar` primitive

**Files:**
- Create: `packages/web/src/components/primitives/Avatar.tsx`
- Create: `packages/web/src/components/primitives/Avatar.module.css`

- [ ] **Step 1: Implement**

```tsx
// packages/web/src/components/primitives/Avatar.tsx
import { avatarGradient } from '../../utils/avatarGradient.js';
import styles from './Avatar.module.css';

interface AvatarProps {
  seed: string;
  initials: string;
  size?: number;
  square?: boolean;
}

export function Avatar({ seed, initials, size = 36, square = false }: AvatarProps) {
  return (
    <div
      className={`${styles.avatar} ${avatarGradient(seed)}`}
      style={{
        width: size,
        height: size,
        borderRadius: square ? size / 4 : Math.min(size / 2, 50),
        fontSize: size <= 22 ? 9.5 : size <= 30 ? 11 : 12.5,
      }}
    >
      {initials}
    </div>
  );
}
```

- [ ] **Step 2: `Avatar.module.css`**

```css
.avatar {
  display: grid;
  place-items: center;
  color: white;
  font-weight: 600;
  letter-spacing: -0.02em;
  user-select: none;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/primitives/Avatar.tsx packages/web/src/components/primitives/Avatar.module.css
git commit -m "feat(web): add Avatar primitive"
```

---

### Task F2: `parseMessageText` token parser

**Files:**
- Create: `packages/web/src/utils/tokens.ts`
- Create: `packages/web/test/utils/tokens.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/web/test/utils/tokens.test.ts
import { describe, expect, it } from 'vitest';
import { parseMessageText } from '../../src/utils/tokens.js';

describe('parseMessageText', () => {
  it('returns a single text token for plain input', () => {
    expect(parseMessageText('hello world')).toEqual([{ kind: 'text', text: 'hello world' }]);
  });

  it('detects @mentions', () => {
    expect(parseMessageText('hi @ash')).toEqual([
      { kind: 'text', text: 'hi ' },
      { kind: 'mention', text: '@ash' },
    ]);
  });

  it('detects **bold**', () => {
    expect(parseMessageText('**important**')).toEqual([{ kind: 'bold', text: 'important' }]);
  });

  it('detects `code` spans', () => {
    expect(parseMessageText('try `pnpm i`')).toEqual([
      { kind: 'text', text: 'try ' },
      { kind: 'code', text: 'pnpm i' },
    ]);
  });

  it('detects URLs', () => {
    const tokens = parseMessageText('see https://example.com/x for more');
    expect(tokens).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'url', text: 'https://example.com/x' },
      { kind: 'text', text: ' for more' },
    ]);
  });

  it('handles multiple tokens in order', () => {
    expect(parseMessageText('@ash see **this** at https://x.io')).toEqual([
      { kind: 'mention', text: '@ash' },
      { kind: 'text', text: ' see ' },
      { kind: 'bold', text: 'this' },
      { kind: 'text', text: ' at ' },
      { kind: 'url', text: 'https://x.io' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseMessageText('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web test test/utils/tokens.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// packages/web/src/utils/tokens.ts
export type Token =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'url'; text: string };

const PATTERN = /(@\w+)|(\*\*[^*]+\*\*)|(`[^`]+`)|(https?:\/\/[^\s]+)/g;

export function parseMessageText(input: string): Token[] {
  if (!input) return [];
  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = PATTERN.exec(input)) !== null) {
    if (m.index > last) out.push({ kind: 'text', text: input.slice(last, m.index) });
    if (m[1]) out.push({ kind: 'mention', text: m[1] });
    else if (m[2]) out.push({ kind: 'bold', text: m[2].slice(2, -2) });
    else if (m[3]) out.push({ kind: 'code', text: m[3].slice(1, -1) });
    else if (m[4]) out.push({ kind: 'url', text: m[4] });
    last = PATTERN.lastIndex;
  }
  if (last < input.length) out.push({ kind: 'text', text: input.slice(last) });
  return out;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @yank/web test test/utils/tokens.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/utils/tokens.ts packages/web/test/utils/tokens.test.ts
git commit -m "feat(web): add parseMessageText token parser"
```

---

### Task F3: `MessageText` renderer

**Files:**
- Create: `packages/web/src/components/chat/MessageText.tsx`
- Create: `packages/web/test/components/chat/MessageText.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/web/test/components/chat/MessageText.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageText } from '../../../src/components/chat/MessageText.js';

describe('MessageText', () => {
  it('renders @mentions inside a .mention span', () => {
    render(<MessageText text="hi @ash" />);
    const mention = screen.getByText('@ash');
    expect(mention.tagName).toBe('SPAN');
    expect(mention.className).toContain('mention');
  });

  it('renders **bold** inside <strong>', () => {
    render(<MessageText text="**foo**" />);
    expect(screen.getByText('foo').tagName).toBe('STRONG');
  });

  it('renders `code` inside <code>', () => {
    render(<MessageText text="`x`" />);
    expect(screen.getByText('x').tagName).toBe('CODE');
  });

  it('renders URLs as anchor with href', () => {
    render(<MessageText text="see https://x.io now" />);
    const anchor = screen.getByText('https://x.io');
    expect(anchor.tagName).toBe('A');
    expect(anchor).toHaveAttribute('href', 'https://x.io');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    expect(anchor).toHaveAttribute('target', '_blank');
  });

  it('returns null for empty text', () => {
    const { container } = render(<MessageText text={null} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web test test/components/chat/MessageText.test.tsx
```

- [ ] **Step 3: Implement**

```tsx
// packages/web/src/components/chat/MessageText.tsx
import { parseMessageText } from '../../utils/tokens.js';

interface Props {
  text: string | null;
}

export function MessageText({ text }: Props) {
  if (!text) return null;
  const tokens = parseMessageText(text);
  return (
    <div className="msgText">
      {tokens.map((t, i) => {
        switch (t.kind) {
          case 'mention': return <span key={i} className="mention">{t.text}</span>;
          case 'bold': return <strong key={i}>{t.text}</strong>;
          case 'code': return <code key={i}>{t.text}</code>;
          case 'url':
            return (
              <a key={i} href={t.text} target="_blank" rel="noopener noreferrer">
                {t.text}
              </a>
            );
          case 'text': return <span key={i}>{t.text}</span>;
        }
      })}
    </div>
  );
}
```

The container class `msgText` and inline `.mention` class are not from a CSS Module — they're top-level rules in the parent `Message.module.css` (composed via the `:global(...)` selector to keep the parsed token markup simple). Add those rules in the `Message.module.css` step in task F4.

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @yank/web test test/components/chat/MessageText.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/MessageText.tsx packages/web/test/components/chat/MessageText.test.tsx
git commit -m "feat(web): add MessageText renderer"
```

---

### Task F4: `Message` component + supporting bits (Quote, Reactions, StatusGlyph, ThreadLink)

**Files:**
- Create: `packages/web/src/components/chat/Message.tsx`
- Create: `packages/web/src/components/chat/Message.module.css`
- Create: `packages/web/src/components/chat/Quote.tsx` + `.module.css`
- Create: `packages/web/src/components/chat/Reactions.tsx` + `.module.css`
- Create: `packages/web/src/components/chat/StatusGlyph.tsx` + `.module.css`
- Create: `packages/web/src/components/chat/ThreadLink.tsx` + `.module.css`
- Create: `packages/web/test/components/chat/Message.test.tsx`

- [ ] **Step 1: Implement `StatusGlyph.tsx`**

```tsx
import { ClockIcon, CheckIcon, DoubleCheckIcon } from '../icons/index.js';
import styles from './StatusGlyph.module.css';
import type { Message } from '@yank/shared';

interface Props { status: Message['status']; }

export function StatusGlyph({ status }: Props) {
  if (status === 'pending') return <span className={styles.glyph} title="Queued"><ClockIcon size={11} /></span>;
  if (status === 'sent') return <span className={styles.glyph} title="Sent"><CheckIcon size={12} /></span>;
  if (status === 'delivered') return <span className={styles.glyph} title="Delivered"><DoubleCheckIcon size={13} /></span>;
  if (status === 'read') return <span className={`${styles.glyph} ${styles.read}`} title="Read"><DoubleCheckIcon size={13} /></span>;
  if (status === 'failed') return <span className={`${styles.glyph} ${styles.failed}`} title="Failed">!</span>;
  return null;
}
```

`StatusGlyph.module.css`: port `.msg-status`, `.msg-status.read`, `.msg-status.failed` rules from mockup.

- [ ] **Step 2: Implement `Quote.tsx`**

```tsx
import styles from './Quote.module.css';
import type { Message } from '@yank/shared';

interface Props {
  reply: Pick<Message, 'id' | 'text'> & { senderName: string };
}

export function Quote({ reply }: Props) {
  return (
    <div className={styles.quote}>
      <span className={styles.author}>{reply.senderName}</span>
      <span className={styles.text}>{reply.text ?? ''}</span>
    </div>
  );
}
```

`Quote.module.css`: port `.quote`, `.quote-author` from mockup.

- [ ] **Step 3: Implement `Reactions.tsx`**

```tsx
import { EmojiIcon } from '../icons/index.js';
import styles from './Reactions.module.css';
import type { Reaction } from '@yank/shared';

interface Props {
  reactions: Reaction[];
  onAdd?: () => void;
}

export function Reactions({ reactions, onAdd }: Props) {
  if (reactions.length === 0) return null;
  return (
    <div className={styles.reactions}>
      {reactions.map((r) => (
        <button type="button" key={r.emoji} className={`${styles.reaction} ${r.mine ? styles.mine : ''}`}>
          <span>{r.emoji}</span>
          <span className={styles.count}>{r.count}</span>
        </button>
      ))}
      {onAdd && (
        <button type="button" className={`${styles.reaction} ${styles.add}`} onClick={onAdd} title="Add reaction">
          <EmojiIcon size={11} />
        </button>
      )}
    </div>
  );
}
```

`Reactions.module.css`: port `.reactions`, `.reaction`, `.reaction.mine`, `.reaction .count`.

- [ ] **Step 4: Implement `ThreadLink.tsx`**

```tsx
import styles from './ThreadLink.module.css';
import { Avatar } from '../primitives/Avatar.js';

interface Props {
  threadCount: number;
  threadPeople: { jid: string; initials: string }[];
  lastReplyRelative: string;
  onClick: () => void;
}

export function ThreadLink({ threadCount, threadPeople, lastReplyRelative, onClick }: Props) {
  return (
    <button type="button" className={styles.link} onClick={onClick}>
      <span className={styles.avs}>
        {threadPeople.slice(0, 3).map((p) => (
          <span key={p.jid} className={styles.avSlot}>
            <Avatar seed={p.jid} initials={p.initials} size={18} />
          </span>
        ))}
      </span>
      <span>{threadCount} replies</span>
      <span className={styles.meta}>· last reply {lastReplyRelative}</span>
    </button>
  );
}
```

`ThreadLink.module.css`: port `.thread-link`, `.thread-link .avs`, `.av-s`.

- [ ] **Step 5: Implement `Message.tsx`**

```tsx
// packages/web/src/components/chat/Message.tsx
import type { Message as MessageType } from '@yank/shared';
import { Avatar } from '../primitives/Avatar.js';
import { MessageText } from './MessageText.js';
import { Reactions } from './Reactions.js';
import { StatusGlyph } from './StatusGlyph.js';
import { Quote } from './Quote.js';
import { ThreadLink } from './ThreadLink.js';
import { EmojiIcon, ThreadIcon, StarIcon, MoreIcon } from '../icons/index.js';
import styles from './Message.module.css';

export interface MessageRowProps {
  message: MessageType;
  showHead: boolean;
  senderName: string;
  senderInitials: string;
  onOpenThread: () => void;
  onReact?: (emoji: string) => void;
  onStar?: () => void;
  inThread?: boolean;
  reply?: {
    id: string;
    text: string | null;
    senderName: string;
  };
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

export function MessageRow({
  message,
  showHead,
  senderName,
  senderInitials,
  onOpenThread,
  onReact,
  onStar,
  inThread = false,
  reply,
}: MessageRowProps) {
  if (message.kind === 'system') {
    return (
      <div className={styles.system}>
        <span className={styles.systemPill}>{message.text ?? ''}</span>
      </div>
    );
  }
  const ts = fmtTime(message.ts);
  return (
    <div className={styles.msg + (showHead ? '' : ' ' + styles.compact)}>
      <div className={styles.avatarSlot}>
        {showHead ? <Avatar seed={message.senderJid} initials={senderInitials} size={36} /> : <div className={styles.hoverTime}>{ts}</div>}
      </div>
      <div className={styles.body}>
        {showHead && (
          <div className={styles.head}>
            <span className={styles.author}>{senderName}</span>
            <span className={styles.time + ' mono'}>{ts}</span>
            <StatusGlyph status={message.status} />
          </div>
        )}
        {reply && <Quote reply={{ id: reply.id, text: reply.text, senderName: reply.senderName }} />}
        <MessageText text={message.text} />
        {message.reactions.length > 0 && <Reactions reactions={message.reactions} onAdd={() => onReact?.('👍')} />}
        {!inThread && message.threadCount !== undefined && message.threadCount > 0 && (
          <ThreadLink
            threadCount={message.threadCount}
            threadPeople={[]}
            lastReplyRelative="recent"
            onClick={onOpenThread}
          />
        )}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.actionBtn} title="Add reaction" onClick={() => onReact?.('👍')}><EmojiIcon size={14} /></button>
        <button type="button" className={styles.actionBtn} title="Reply in thread" onClick={onOpenThread}><ThreadIcon size={14} /></button>
        <button type="button" className={styles.actionBtn} title="Star" onClick={onStar}><StarIcon size={13} /></button>
        <button type="button" className={styles.actionBtn} title="More"><MoreIcon size={14} /></button>
      </div>
    </div>
  );
}
```

(Media rendering — image tile, doc card, voice note — lands in task F5. The current `Message.tsx` ignores `message.media`.)

- [ ] **Step 6: `Message.module.css`**

Port from the mockup styles.css: `.msg`, `.msg.compact`, `.msg-avatar-slot`, `.msg-hover-time`, `.msg-body`, `.msg-head`, `.msg-author`, `.msg-role`, `.msg-time`, `.msg-system`, `.msg-system .pill`, `.msg-actions`, `.icon-btn` (rules used inside actions). Also include a `:global(.msgText)` block for the parsed-message container and `:global(.mention)` for the mention pill, since MessageText emits non-CSS-Module class names.

```css
:global(.msgText) {
  margin-top: 1px;
  line-height: 1.45;
  font-size: var(--fs-body);
  color: var(--fg-0);
  white-space: pre-wrap;
  word-wrap: break-word;
}
:global(.mention) {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 0 4px;
  border-radius: 3px;
  font-weight: 500;
}
:global(.msgText) code {
  font-family: var(--font-mono);
  font-size: 12.5px;
  background: var(--bg-1);
  padding: 1px 4px;
  border-radius: 3px;
  border: 1px solid var(--border-0);
}
:global(.msgText) a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
```

- [ ] **Step 7: Write test for `Message` (covers head/compact, status, thread link)**

```tsx
// packages/web/test/components/chat/Message.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageRow } from '../../../src/components/chat/Message.js';
import type { Message } from '@yank/shared';

const base: Message = {
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
};

describe('MessageRow', () => {
  it('renders the sender name when showHead=true', () => {
    render(
      <MessageRow message={base} showHead={true} senderName="Ash R." senderInitials="AR"
        onOpenThread={() => {}} />,
    );
    expect(screen.getByText('Ash R.')).toBeInTheDocument();
  });

  it('omits the head when showHead=false', () => {
    render(
      <MessageRow message={base} showHead={false} senderName="Ash R." senderInitials="AR"
        onOpenThread={() => {}} />,
    );
    expect(screen.queryByText('Ash R.')).not.toBeInTheDocument();
  });

  it('renders a system pill for kind=system', () => {
    render(
      <MessageRow message={{ ...base, kind: 'system', text: 'Ash joined' }} showHead={false}
        senderName="" senderInitials="" onOpenThread={() => {}} />,
    );
    expect(screen.getByText('Ash joined')).toBeInTheDocument();
  });

  it('shows the thread chip when threadCount > 0 and inThread is false', async () => {
    const onOpenThread = vi.fn();
    const user = userEvent.setup();
    render(
      <MessageRow message={{ ...base, threadCount: 3 }} showHead={true} senderName="Ash" senderInitials="A"
        onOpenThread={onOpenThread} />,
    );
    const chip = screen.getByRole('button', { name: /3 replies/i });
    await user.click(chip);
    expect(onOpenThread).toHaveBeenCalledOnce();
  });

  it('hides the thread chip when inThread is true', () => {
    render(
      <MessageRow message={{ ...base, threadCount: 3 }} showHead={true} senderName="Ash" senderInitials="A"
        onOpenThread={() => {}} inThread={true} />,
    );
    expect(screen.queryByRole('button', { name: /replies/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run, verify pass**

```bash
pnpm --filter @yank/web test test/components/chat/Message.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/components/chat packages/web/test/components/chat/Message.test.tsx
git commit -m "feat(web): add Message component + Quote/Reactions/StatusGlyph/ThreadLink"
```

---

### Task F5: `MediaImage`, `DocCard`, `VoiceNote` placeholders

**Files:**
- Create: `packages/web/src/components/chat/MediaImage.tsx` + `.module.css`
- Create: `packages/web/src/components/chat/DocCard.tsx` + `.module.css`
- Create: `packages/web/src/components/chat/VoiceNote.tsx` + `.module.css`
- Modify: `packages/web/src/components/chat/Message.tsx`

For M3, full media rendering is deferred to M6 (media-worker delivers downloaded files). M3 renders:
- `MediaImage`: a placeholder tile with the mime/size/dimensions metadata (no thumbnail loading yet)
- `DocCard`: filename + size + extension chip
- `VoiceNote`: play button + static waveform + duration

- [ ] **Step 1: Implement `MediaImage.tsx`**

```tsx
import type { Media } from '@yank/shared';
import styles from './MediaImage.module.css';

export function MediaImage({ media }: { media: Media }) {
  const aspect = media.width && media.height ? `${media.width} / ${media.height}` : '4 / 3';
  return (
    <div className={styles.grid}>
      <div className={styles.tile} style={{ aspectRatio: aspect }}>
        {media.thumbnailUrl ? (
          <img src={media.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <span className={styles.placeholder}>image · {media.status}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `DocCard.tsx`**

```tsx
import type { Media } from '@yank/shared';
import styles from './DocCard.module.css';

function ext(mime: string): string {
  const m = /([a-z0-9]+)$/i.exec(mime);
  return (m?.[1] ?? 'FILE').toUpperCase().slice(0, 4);
}
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function DocCard({ media, name }: { media: Media; name: string }) {
  return (
    <div className={styles.doc}>
      <div className={styles.ext}>{ext(media.mime)}</div>
      <div>
        <div className={styles.name}>{name}</div>
        <div className={styles.size + ' mono'}>{fmtBytes(media.sizeBytes)}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement `VoiceNote.tsx`**

```tsx
import { PlayIcon } from '../icons/index.js';
import type { Media } from '@yank/shared';
import styles from './VoiceNote.module.css';

const BARS = 40;
function fmtDur(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceNote({ media }: { media: Media }) {
  return (
    <div className={styles.voice}>
      <button type="button" className={styles.play}><PlayIcon size={10} /></button>
      <div className={styles.wave} aria-hidden="true">
        {Array.from({ length: BARS }).map((_, i) => (
          <span key={i} style={{ height: 5 + Math.abs(Math.sin(i * 1.3)) * 14 }} />
        ))}
      </div>
      <span className={styles.dur + ' mono'}>{fmtDur(media.durationMs ?? 0)}</span>
    </div>
  );
}
```

The three `.module.css` files port the matching rules from mockup styles.css (`.media-grid` & `.media-tile`; `.doc`, `.doc .ext`, `.doc .name`, `.doc .size`; `.voice`, `.voice .play`, `.voice .wave`, `.voice .dur`).

- [ ] **Step 4: Wire into `Message.tsx`**

Edit `Message.tsx`. After the `<MessageText … />` line and before `<Reactions … />`, add:

```tsx
{message.media && message.kind === 'image' && <MediaImage media={message.media} />}
{message.media && message.kind === 'document' && (
  <DocCard media={message.media} name={message.text ?? 'file'} />
)}
{message.media && message.kind === 'audio' && <VoiceNote media={message.media} />}
```

Add the three imports at the top of `Message.tsx`.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @yank/web typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/chat/MediaImage.tsx packages/web/src/components/chat/MediaImage.module.css packages/web/src/components/chat/DocCard.tsx packages/web/src/components/chat/DocCard.module.css packages/web/src/components/chat/VoiceNote.tsx packages/web/src/components/chat/VoiceNote.module.css packages/web/src/components/chat/Message.tsx
git commit -m "feat(web): render image/doc/voice media placeholders"
```

---

### Task F6: `Composer` (textarea + Enter handling + draft persistence)

**Files:**
- Create: `packages/web/src/components/chat/Composer.tsx`
- Create: `packages/web/src/components/chat/Composer.module.css`
- Create: `packages/web/test/components/chat/Composer.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/web/test/components/chat/Composer.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Composer } from '../../../src/components/chat/Composer.js';
import { useDraftsStore } from '../../../src/state/drafts.js';

beforeEach(() => {
  localStorage.clear();
  useDraftsStore.setState({ drafts: {} });
});

describe('Composer', () => {
  it('calls onSend when Enter is pressed with content', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer chatId="c1" onSend={onSend} placeholder="Message" />);
    const ta = screen.getByPlaceholderText('Message');
    await user.type(ta, 'hi{Enter}');
    expect(onSend).toHaveBeenCalledWith('hi');
  });

  it('does NOT call onSend on Shift+Enter', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer chatId="c1" onSend={onSend} placeholder="Message" />);
    const ta = screen.getByPlaceholderText('Message');
    await user.type(ta, 'a{Shift>}{Enter}{/Shift}b');
    expect(onSend).not.toHaveBeenCalled();
    expect((ta as HTMLTextAreaElement).value).toContain('\n');
  });

  it('does not call onSend when content is whitespace-only', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer chatId="c1" onSend={onSend} placeholder="Message" />);
    await user.type(screen.getByPlaceholderText('Message'), '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('persists the draft to the drafts store', async () => {
    const user = userEvent.setup();
    render(<Composer chatId="c1" onSend={() => {}} placeholder="Message" />);
    await user.type(screen.getByPlaceholderText('Message'), 'draft');
    expect(useDraftsStore.getState().drafts['c1']).toBe('draft');
  });

  it('clears the draft after a successful send', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Composer chatId="c1" onSend={onSend} placeholder="Message" />);
    await user.type(screen.getByPlaceholderText('Message'), 'hi{Enter}');
    expect(useDraftsStore.getState().drafts['c1']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web test test/components/chat/Composer.test.tsx
```

- [ ] **Step 3: Implement**

```tsx
// packages/web/src/components/chat/Composer.tsx
import { useEffect, useRef } from 'react';
import { useDraftsStore } from '../../state/drafts.js';
import {
  BoldIcon, ItalicIcon, StrikeIcon, CodeIcon, LinkIcon, BlockquoteIcon, ListIcon,
  PaperclipIcon, EmojiIcon, MicIcon,
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

  useEffect(() => { ref.current?.focus(); }, [chatId]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    clearDraft(chatId);
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
          onChange={(e) => setDraft(chatId, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className={styles.bar}>
          <ToolbarBtn title="Attach file"><PaperclipIcon size={15} /></ToolbarBtn>
          <ToolbarBtn title="Emoji"><EmojiIcon size={15} /></ToolbarBtn>
          <ToolbarBtn title="Voice note"><MicIcon size={15} /></ToolbarBtn>
          <span className={styles.spacer} />
          <button type="button" className={styles.sendBtn} disabled={!draft.trim()} onClick={send}>
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
    </div>
  );
}

function ToolbarBtn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <button type="button" className={styles.iconBtn} title={title} aria-label={title}>
      {children}
    </button>
  );
}
```

- [ ] **Step 4: `Composer.module.css`**

Port from mockup styles.css `.composer-wrap`, `.composer`, `.composer-toolbar`, `.divider`, `.composer-input`, `.composer-bar`, `.send-btn`, `.composer-hint-bottom`, `.icon-btn`, `.kbd`, `.spacer` (lines ~600–740).

- [ ] **Step 5: Run, verify pass**

```bash
pnpm --filter @yank/web test test/components/chat/Composer.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/chat/Composer.tsx packages/web/src/components/chat/Composer.module.css packages/web/test/components/chat/Composer.test.tsx
git commit -m "feat(web): add Composer with draft persistence + Enter handling"
```

---

### Task F7: `ChatTopbar`

**Files:**
- Create: `packages/web/src/components/chat/ChatTopbar.tsx` + `.module.css`

- [ ] **Step 1: Implement**

```tsx
import type { Chat } from '@yank/shared';
import { Avatar } from '../primitives/Avatar.js';
import { PinIcon, SearchIcon, ThreadIcon, MoreIcon } from '../icons/index.js';
import styles from './ChatTopbar.module.css';

interface Props {
  chat: Chat;
  threadOpen: boolean;
  onToggleThread: () => void;
}

const WS_COLOR_VAR: Record<Chat['workspace'], string> = {
  work: 'var(--c-work)',
  personal: 'var(--c-personal)',
  triage: 'var(--c-triage)',
  hidden: 'var(--fg-3)',
};

export function ChatTopbar({ chat, threadOpen, onToggleThread }: Props) {
  const title = chat.subject ?? chat.jid;
  const isDm = chat.type === 'dm';
  return (
    <div className={styles.topbar}>
      <div className={styles.left}>
        <Avatar seed={chat.id} initials={title.slice(0, 2).toUpperCase()} size={36} square={!isDm} />
        <div className={styles.titleBox}>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.sub}>
            <span>{isDm ? 'Direct message' : `${chat.memberCount} members`}</span>
            <span className={styles.sep}>·</span>
            <span className="mono">{chat.jid}</span>
          </div>
        </div>
      </div>
      <div className={styles.actions}>
        <span className={styles.wsPill}>
          <span className={styles.wsDot} style={{ background: WS_COLOR_VAR[chat.workspace] }} />
          {chat.workspace}
        </span>
        <button type="button" className={styles.iconBtn} title="Pinned items"><PinIcon size={14} /></button>
        <button type="button" className={styles.iconBtn} title="Search this chat · ⌘F"><SearchIcon size={15} /></button>
        <button type="button"
          className={`${styles.iconBtn} ${threadOpen ? styles.iconBtnActive : ''}`}
          title={threadOpen ? 'Close thread' : 'Threads in this chat'}
          onClick={onToggleThread}>
          <ThreadIcon size={15} />
        </button>
        <button type="button" className={styles.iconBtn} title="Details"><MoreIcon size={15} /></button>
      </div>
    </div>
  );
}
```

`ChatTopbar.module.css`: port `.topbar`, `.topbar-left`, `.topbar-actions`, `.topbar-sub`, `.ws-pill`, `.ws-pill .dot`, `.sep` from mockup.

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/chat/ChatTopbar.tsx packages/web/src/components/chat/ChatTopbar.module.css
git commit -m "feat(web): add ChatTopbar with workspace pill"
```

---

### Task F8: `MessageList` (cursor pagination + scroll-to-bottom + day dividers)

**Files:**
- Create: `packages/web/src/components/chat/MessageList.tsx` + `.module.css`
- Create: `packages/web/src/hooks/useAutoScroll.ts`

- [ ] **Step 1: Implement `useAutoScroll`**

```ts
// packages/web/src/hooks/useAutoScroll.ts
import { useEffect, useRef } from 'react';

/** Returns a ref for the scroll container. On `trigger` change, scrolls to the bottom
 *  unless the user has scrolled away (>= 100 px above the bottom). */
export function useAutoScroll<T extends HTMLElement>(trigger: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 100) {
      el.scrollTop = el.scrollHeight;
    }
  }, [trigger]);
  return ref;
}
```

- [ ] **Step 2: Implement `MessageList.tsx`**

```tsx
import { useEffect, useMemo } from 'react';
import type { Message } from '@yank/shared';
import { MessageRow } from './Message.js';
import { useAutoScroll } from '../../hooks/useAutoScroll.js';
import { useMessages, useChat, useChatMembers } from '../../lib/queries.js';
import styles from './MessageList.module.css';

interface Props {
  chatId: string;
  onOpenThread: (messageId: string) => void;
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export function MessageList({ chatId, onOpenThread }: Props) {
  const { data, fetchNextPage, hasNextPage, isFetching } = useMessages(chatId);
  const { data: chat } = useChat(chatId);
  const { data: members } = useChatMembers(chatId, chat?.type !== 'dm');

  // Flatten and reverse pages so oldest-first appears at top.
  const messages = useMemo<Message[]>(() => {
    if (!data) return [];
    const all = data.pages.flatMap((p) => p.messages);
    return [...all].reverse();
  }, [data]);

  // jid → display name lookup. Empty for DMs (members is undefined when disabled).
  const nameByJid = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members ?? []) map.set(m.jid, m.displayName ?? m.jid);
    return map;
  }, [members]);

  const ref = useAutoScroll<HTMLDivElement>(messages.length);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop < 80 && hasNextPage && !isFetching) {
        void fetchNextPage();
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref, hasNextPage, isFetching, fetchNextPage]);

  return (
    <div className={styles.list} ref={ref}>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay = !prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString();
        const showHead =
          newDay ||
          !prev ||
          prev.senderJid !== m.senderJid ||
          new Date(m.ts).getTime() - new Date(prev.ts).getTime() > 4 * 60_000;
        const displayName = nameByJid.get(m.senderJid) ?? m.senderJid;
        return (
          <div key={m.id}>
            {newDay && (
              <div className={styles.divider}>
                <span className={styles.pill}>{fmtDay(m.ts)}</span>
              </div>
            )}
            <MessageRow
              message={m}
              showHead={showHead}
              senderName={displayName}
              senderInitials={displayName.slice(0, 2).toUpperCase()}
              onOpenThread={() => onOpenThread(m.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: `MessageList.module.css`**

```css
.list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--pane-pad) 0;
  display: flex;
  flex-direction: column;
  gap: var(--msg-gap);
}
.divider {
  display: flex;
  justify-content: center;
  margin: 12px 0 4px;
}
.pill {
  font-size: var(--fs-tiny);
  color: var(--fg-2);
  background: var(--bg-1);
  border: 1px solid var(--border-0);
  padding: 2px 10px;
  border-radius: 999px;
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/chat/MessageList.tsx packages/web/src/components/chat/MessageList.module.css packages/web/src/hooks/useAutoScroll.ts
git commit -m "feat(web): add MessageList with cursor pagination + day dividers"
```

---

### Task F9: `ChatView` route + send mutation wiring

**Files:**
- Create: `packages/web/src/routes/c/$chatId.tsx`
- Create: `packages/web/src/components/chat/ChatView.tsx` + `.module.css`

- [ ] **Step 1: Implement `ChatView.tsx`**

```tsx
// packages/web/src/components/chat/ChatView.tsx
import { useChat } from '../../lib/queries.js';
import { useSendMessage } from '../../lib/mutations.js';
import { useUiStore } from '../../state/ui.js';
import { ChatTopbar } from './ChatTopbar.js';
import { MessageList } from './MessageList.js';
import { Composer } from './Composer.js';
import { ThreadPanel } from '../thread/ThreadPanel.js';
import styles from './ChatView.module.css';

export function ChatView({ chatId }: { chatId: string }) {
  const { data: chat } = useChat(chatId);
  const openThread = useUiStore((s) => s.openThread);
  const closeThread = useUiStore((s) => s.closeThread);
  const openThreadId = useUiStore((s) => s.openThreadId);
  const send = useSendMessage(chatId);

  if (!chat) {
    return <main className={styles.pane}><div className={styles.loading}>Loading…</div></main>;
  }

  return (
    <>
      <main className={styles.pane}>
        <ChatTopbar
          chat={chat}
          threadOpen={!!openThreadId}
          onToggleThread={() => (openThreadId ? closeThread() : openThread(''))}
        />
        <MessageList chatId={chatId} onOpenThread={(id) => openThread(id)} />
        <Composer
          chatId={chatId}
          placeholder={`Message ${chat.subject ?? chat.jid}`}
          onSend={(text) => { void send.mutate({ text }); }}
        />
      </main>
      {openThreadId && <ThreadPanel chatId={chatId} parentMessageId={openThreadId} />}
    </>
  );
}
```

- [ ] **Step 2: `ChatView.module.css`**

```css
.pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg-0);
}
.loading {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--fg-2);
  font-size: var(--fs-meta);
}
```

- [ ] **Step 3: Create the route file**

```tsx
// packages/web/src/routes/c/$chatId.tsx
import { createFileRoute } from '@tanstack/react-router';
import { ChatView } from '../../components/chat/ChatView.js';

export const Route = createFileRoute('/c/$chatId')({
  component: () => {
    const { chatId } = Route.useParams();
    return <ChatView chatId={chatId} />;
  },
});
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @yank/web typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/ChatView.tsx packages/web/src/components/chat/ChatView.module.css packages/web/src/routes/c/$chatId.tsx
git commit -m "feat(web): wire ChatView with topbar, list, composer, send mutation"
```

---

## Group G — Thread panel

### Task G1: `ThreadPanel` component

**Files:**
- Create: `packages/web/src/components/thread/ThreadPanel.tsx` + `.module.css`
- Create: `packages/web/src/lib/queries.threads.ts`

The api exposes thread replies via `GET /api/chats/:chatId/messages?replyTo=<messageId>` (a M2 extension of the messages endpoint). Add a small helper for that.

- [ ] **Step 1: Implement the query**

```ts
// packages/web/src/lib/queries.threads.ts
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { MessageSchema, type Message } from '@yank/shared';
import { apiFetch } from './api.js';

const ListSchema = z.array(MessageSchema);

export function useThreadReplies(chatId: string, parentMessageId: string) {
  return useQuery({
    queryKey: ['thread', chatId, parentMessageId],
    enabled: Boolean(parentMessageId),
    queryFn: async (): Promise<Message[]> => {
      const raw = await apiFetch<unknown>(
        `/api/chats/${chatId}/messages?replyTo=${parentMessageId}&limit=200`,
      );
      return ListSchema.parse(raw);
    },
  });
}

export function useParentMessage(chatId: string, messageId: string) {
  return useQuery({
    queryKey: ['message', chatId, messageId],
    enabled: Boolean(messageId),
    queryFn: async (): Promise<Message> => {
      const raw = await apiFetch<unknown>(`/api/chats/${chatId}/messages/${messageId}`);
      return MessageSchema.parse(raw);
    },
  });
}
```

Add `GET /api/chats/:chatId/messages/:messageId` and the `?replyTo=` query to the API contract table at the top of the plan — M2 must implement these. (Self-review note: this is a contract drift. Either patch the contract list here, or constrain M3 to reading the parent and replies from existing endpoints. Pragmatic choice: declare them as required and update the contract table when this plan is reviewed.)

- [ ] **Step 2: Implement `ThreadPanel.tsx`**

```tsx
// packages/web/src/components/thread/ThreadPanel.tsx
import { useUiStore } from '../../state/ui.js';
import { useSendMessage } from '../../lib/mutations.js';
import { useThreadReplies, useParentMessage } from '../../lib/queries.threads.js';
import { MessageRow } from '../chat/Message.js';
import { Composer } from '../chat/Composer.js';
import { XIcon } from '../icons/index.js';
import styles from './ThreadPanel.module.css';

interface Props { chatId: string; parentMessageId: string; }

export function ThreadPanel({ chatId, parentMessageId }: Props) {
  const closeThread = useUiStore((s) => s.closeThread);
  const { data: parent } = useParentMessage(chatId, parentMessageId);
  const { data: replies = [] } = useThreadReplies(chatId, parentMessageId);
  const send = useSendMessage(chatId);

  return (
    <aside className={styles.panel}>
      <div className={styles.head}>
        <div>
          <h3 className={styles.title}>Thread</h3>
          <div className={styles.sub}>in chat</div>
        </div>
        <button type="button" className={styles.closeBtn} onClick={closeThread} title="Close · Esc" aria-label="Close thread">
          <XIcon size={14} />
        </button>
      </div>

      <div className={styles.body}>
        {parent && (
          <div className={styles.parent}>
            <MessageRow
              message={parent}
              showHead={true}
              senderName={parent.senderJid}
              senderInitials={parent.senderJid.slice(0, 2).toUpperCase()}
              onOpenThread={() => {}}
              inThread={true}
            />
          </div>
        )}
        <div className={styles.repliesLabel}>{replies.length} replies</div>
        {replies.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            showHead={true}
            senderName={m.senderJid}
            senderInitials={m.senderJid.slice(0, 2).toUpperCase()}
            onOpenThread={() => {}}
            inThread={true}
          />
        ))}
      </div>

      <Composer
        chatId={`${chatId}:thread:${parentMessageId}`}
        inThread
        placeholder="Reply…"
        onSend={(text) => { void send.mutate({ text, replyToId: parentMessageId }); }}
      />
    </aside>
  );
}
```

- [ ] **Step 3: `ThreadPanel.module.css`**

Port `.thread-panel`, `.thread-head`, `.thread-body`, `.thread-parent`, `.thread-replies-label` from mockup. The panel is `var(--thread-w)` wide, sits as the 4th column of the shell grid, has its own scroll.

- [ ] **Step 4: Add the deep-link route**

Create `packages/web/src/routes/c/$chatId.t.$messageId.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ChatView } from '../../components/chat/ChatView.js';
import { useUiStore } from '../../state/ui.js';

export const Route = createFileRoute('/c/$chatId/t/$messageId')({
  component: () => {
    const { chatId, messageId } = Route.useParams();
    const openThread = useUiStore((s) => s.openThread);
    useEffect(() => { openThread(messageId); }, [messageId, openThread]);
    return <ChatView chatId={chatId} />;
  },
});
```

- [ ] **Step 5: Patch the API contract section**

Add to the REST table at the top of this plan:

| Method + path | Response | Notes |
|---|---|---|
| `GET /api/chats/:chatId/messages/:messageId` | `Message` | Fetch a single message (parent for thread panel). |
| `GET /api/chats/:chatId/messages?replyTo=<uuid>&limit=200` | `Message[]` | Returns all messages whose `reply_to_id` matches. |

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/thread packages/web/src/lib/queries.threads.ts packages/web/src/routes/c
git commit -m "feat(web): add thread panel with parent + replies + mini-composer"
```

---

## Group H — Command palette & setup flow

### Task H1: `CommandPalette` component

**Files:**
- Create: `packages/web/src/components/palette/CommandPalette.tsx` + `.module.css`
- Create: `packages/web/test/components/palette/CommandPalette.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/web/test/components/palette/CommandPalette.test.tsx
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, createRootRoute, createRoute, RouterProvider } from '@tanstack/react-router';
import { CommandPalette } from '../../../src/components/palette/CommandPalette.js';
import { useUiStore } from '../../../src/state/ui.js';
import type { ReactNode } from 'react';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPalette() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: () => <CommandPalette /> });
  const idx = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const router = createRouter({
    routeTree: root.addChildren([idx]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('CommandPalette', () => {
  it('lists chats in the Jump to section', async () => {
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          { id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001', userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099', jid: 'a@g.us', type: 'group', subject: 'Q3 Brief', lastMessageAt: null, lastMessagePreview: null, archived: false, mutedUntil: null, pinned: false, workspace: 'work', memberCount: 3, unreadCount: 0 },
        ]),
      ),
    );
    useUiStore.setState({ paletteOpen: true });
    renderPalette();
    expect(await screen.findByText('Q3 Brief')).toBeInTheDocument();
  });

  it('Escape closes the palette', async () => {
    server.use(http.get('/api/chats', () => HttpResponse.json([])));
    useUiStore.setState({ paletteOpen: true });
    const user = userEvent.setup();
    renderPalette();
    await user.keyboard('{Escape}');
    expect(useUiStore.getState().paletteOpen).toBe(false);
  });

  it('filters by query string', async () => {
    server.use(
      http.get('/api/chats', () =>
        HttpResponse.json([
          { id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001', userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099', jid: 'a@g.us', type: 'group', subject: 'Brock&Co', lastMessageAt: null, lastMessagePreview: null, archived: false, mutedUntil: null, pinned: false, workspace: 'work', memberCount: 3, unreadCount: 0 },
          { id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000002', userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099', jid: 'b@g.us', type: 'group', subject: 'Studio', lastMessageAt: null, lastMessagePreview: null, archived: false, mutedUntil: null, pinned: false, workspace: 'work', memberCount: 3, unreadCount: 0 },
        ]),
      ),
    );
    useUiStore.setState({ paletteOpen: true });
    const user = userEvent.setup();
    renderPalette();
    await screen.findByText('Brock&Co');
    await user.type(screen.getByPlaceholderText(/jump to/i), 'stu');
    expect(screen.queryByText('Brock&Co')).not.toBeInTheDocument();
    expect(screen.getByText('Studio')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @yank/web test test/components/palette/CommandPalette.test.tsx
```

- [ ] **Step 3: Implement**

```tsx
// packages/web/src/components/palette/CommandPalette.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useUiStore } from '../../state/ui.js';
import { useChats } from '../../lib/queries.js';
import { HashIcon, AtIcon, SearchIcon, InboxIcon, ActivityIcon, SettingsIcon } from '../icons/index.js';
import styles from './CommandPalette.module.css';

type Item =
  | { kind: 'jump'; id: string; label: string; meta: string; chatId: string; type: 'dm' | 'group' | 'community' | 'newsletter' }
  | { kind: 'action'; id: string; label: string; href: '/triage' | '/search' | '/diagnostics' | '/settings'; kbd?: string };

export function CommandPalette() {
  const navigate = useNavigate();
  const togglePalette = useUiStore((s) => s.togglePalette);
  const { data: chats = [] } = useChats();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const items = useMemo<Item[]>(() => {
    const jumpItems: Item[] = chats.map((c) => ({
      kind: 'jump',
      id: `j-${c.id}`,
      chatId: c.id,
      type: c.type,
      label: c.subject ?? c.jid,
      meta: `${c.workspace}${c.unreadCount ? ` · ${c.unreadCount} unread` : ''}`,
    }));
    const actions: Item[] = [
      { kind: 'action', id: 'a-triage', label: 'Open Triage', href: '/triage', kbd: '⌘3' },
      { kind: 'action', id: 'a-search', label: 'Global search…', href: '/search', kbd: '⌘⇧F' },
      { kind: 'action', id: 'a-diag', label: 'Open diagnostics', href: '/diagnostics' },
      { kind: 'action', id: 'a-settings', label: 'Open settings', href: '/settings' },
    ];
    const lower = q.toLowerCase();
    const filtered = [...jumpItems, ...actions].filter((it) => it.label.toLowerCase().includes(lower));
    return filtered;
  }, [chats, q]);

  const run = (it: Item) => {
    if (it.kind === 'jump') {
      void navigate({ to: '/c/$chatId', params: { chatId: it.chatId } });
    } else {
      void navigate({ to: it.href });
    }
    togglePalette(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); togglePalette(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = items[active];
      if (target) run(target);
    }
  };

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) togglePalette(false); }}>
      <div className={styles.palette}>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Jump to chat, run command…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={onKey}
        />
        <div className={styles.list} role="listbox">
          {items.length === 0 && (
            <div className={styles.empty}>No matches</div>
          )}
          {items.map((it, i) => (
            <div
              key={it.id}
              className={styles.item + (i === active ? ' ' + styles.active : '')}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(it)}
              role="option"
              aria-selected={i === active}
            >
              <span className={styles.icon}>
                {it.kind === 'jump' && (it.type === 'dm' ? <AtIcon size={13} /> : <HashIcon size={13} />)}
                {it.kind === 'action' && it.id === 'a-triage' && <InboxIcon size={13} />}
                {it.kind === 'action' && it.id === 'a-search' && <SearchIcon size={13} />}
                {it.kind === 'action' && it.id === 'a-diag' && <ActivityIcon size={13} />}
                {it.kind === 'action' && it.id === 'a-settings' && <SettingsIcon size={13} />}
              </span>
              <span>{it.label}</span>
              {it.kind === 'jump' && <span className={styles.meta}>{it.meta}</span>}
              {it.kind === 'action' && it.kbd && <span className={styles.kbd}>{it.kbd}</span>}
            </div>
          ))}
        </div>
        <div className={styles.foot}>
          <span><span className={styles.kbd}>↑</span> <span className={styles.kbd}>↓</span> navigate</span>
          <span><span className={styles.kbd}>↵</span> open</span>
          <span><span className={styles.kbd}>esc</span> close</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `CommandPalette.module.css`**

Port mockup `.palette`, `.palette-input`, `.palette-list`, `.palette-section`, `.palette-item`, `.palette-item.active`, `.palette-foot`, `.kbd` rules.

- [ ] **Step 5: Run, verify pass**

```bash
pnpm --filter @yank/web test test/components/palette/CommandPalette.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/palette packages/web/test/components/palette
git commit -m "feat(web): add command palette with chat jump + actions"
```

---

### Task H2: `SetupView` route

**Files:**
- Create: `packages/web/src/routes/setup.tsx`
- Create: `packages/web/src/components/setup/SetupView.tsx` + `.module.css`

The setup flow consumes SSE events (`qr`, `connected`, `sync-progress`, `sync-complete`) and posts `POST /api/setup/link` to start the pairing.

- [ ] **Step 1: Add `pair-code` to the daemon event union (shared)**

The current `@yank/shared` events module only emits a `qr` event (raw QR string). The setup flow also wants pairing codes. Verify with M2: if pairing codes are delivered via the existing `qr` event with a `format: 'qr' | 'code'` discriminator, use that. Otherwise add a `pair-code` variant:

```ts
// packages/shared/src/events.ts (additive)
export const PairCodeEvent = Base.extend({
  type: z.literal('pair-code'),
  code: z.string(),
  expiresAt: z.string().datetime(),
});
// add PairCodeEvent to the discriminatedUnion
```

If you add it, also update the typed union and the `useEventStream` patcher.

If M2 has chosen the discriminator approach, skip the additive change here.

- [ ] **Step 2: Implement `SetupView.tsx`**

```tsx
// packages/web/src/components/setup/SetupView.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useEventStream } from '../../lib/eventStream.js';
import { apiFetch } from '../../lib/api.js';
import { CheckIcon } from '../icons/index.js';
import styles from './SetupView.module.css';

type Stage = 'pair' | 'syncing' | 'done';

interface Progress { chats: number; messages: number; }

export function SetupView() {
  const [stage, setStage] = useState<Stage>('pair');
  const [code, setCode] = useState<string>('');
  const [progress, setProgress] = useState<Progress>({ chats: 0, messages: 0 });
  const navigate = useNavigate();

  useEventStream({
    onEvent: (evt) => {
      if (evt.type === 'qr') setCode(evt.data);
      // If M2 added 'pair-code', also: if (evt.type === 'pair-code') setCode(evt.code);
      else if (evt.type === 'connected') setStage('syncing');
      else if (evt.type === 'sync-progress') setProgress({ chats: evt.synced, messages: evt.total ?? 0 });
      else if (evt.type === 'sync-complete') setStage('done');
    },
  });

  useEffect(() => {
    // Kick off pairing on mount (the daemon will start the Baileys flow and
    // emit qr/pair-code events into the SSE).
    void apiFetch<void>('/api/setup/link', { method: 'POST', body: { method: 'code' } });
  }, []);

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.logo}>yk</div>
        <h1 className={styles.heading}>Link your WhatsApp</h1>
        <p className={styles.lede}>
          Open WhatsApp → <span className="mono">Settings → Linked Devices → Link a device</span> →
          Link with phone number, then enter this code on your phone.
        </p>

        <div className={styles.code} aria-live="polite">
          {code
            ? code.match(/.{1,3}/g)?.map((chunk, i) => <span key={i} className={styles.chunk}>{chunk}</span>)
            : <span className={styles.chunk}>…</span>}
        </div>

        <div className={styles.progress}>
          <Step label="Daemon online" done={true} />
          <Step label={stage === 'pair' ? 'Waiting for phone…' : 'Linked to phone'} done={stage !== 'pair'} />
          <Step label="Syncing history" done={stage === 'done'} active={stage === 'syncing'}
            meta={`${progress.chats} chats · ${progress.messages.toLocaleString()} msgs`} />
          <Step label="Done" done={stage === 'done'} />
        </div>

        {stage === 'done' && (
          <button type="button" className={styles.cta} onClick={() => void navigate({ to: '/triage' })}>
            Open Triage →
          </button>
        )}
      </div>
    </div>
  );
}

function Step({ label, done, active, meta }: { label: string; done: boolean; active?: boolean; meta?: string }) {
  return (
    <div className={styles.row + (done ? ' ' + styles.done : '') + (active ? ' ' + styles.active : '')}>
      <span className={styles.check}>{done ? <CheckIcon size={10} /> : active ? '↓' : ''}</span>
      <span>{label}</span>
      {meta && <span className={styles.meta + ' mono'}>{meta}</span>}
    </div>
  );
}
```

- [ ] **Step 3: `SetupView.module.css`**

Port mockup `.setup`, `.setup-card`, `.logo`, `.lede`, `.pair-code`, `.chunk`, `.setup-progress`, `.progress-row`, `.progress-row.done`, `.progress-row.active`, `.check`, `.meta`.

- [ ] **Step 4: Add the route**

```tsx
// packages/web/src/routes/setup.tsx
import { createFileRoute } from '@tanstack/react-router';
import { SetupView } from '../components/setup/SetupView.js';

export const Route = createFileRoute('/setup')({
  component: SetupView,
});
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/setup packages/web/src/routes/setup.tsx packages/shared/src/events.ts
git commit -m "feat(web): add /setup view consuming SSE qr + sync events"
```

---

## Group I — Playwright smoke test

**M2 baseline:** `packages/web/playwright.config.ts` already exists. `packages/web/e2e/happy-path.spec.ts` has three specs: `setup screen renders and link button is interactive`, `home renders main pane`, `composer sends a message and surfaces a pending → sent status flip`. They run against a real api (skipping when no chats are seeded). M3 keeps those specs and adds shell/palette specs that don't require a live api.

### Task I1: Add shell + palette smoke against a Node fixture server

**Files:**
- Modify: `packages/web/playwright.config.ts` (add a second project for fixtures-backed smoke)
- Create: `packages/web/e2e/smoke-fixtures.spec.ts`
- Create: `packages/web/e2e/fixtures-server.ts`
- Keep: `packages/web/e2e/happy-path.spec.ts` (unchanged — still runs against a live api in dev)

The new smoke runs the built `dist/` against a tiny Node HTTP server that returns canned JSON for `/api/chats` and a one-shot `/api/events` stream. We don't depend on the daemon or api packages — this smoke stays pure-frontend so it can run in CI without spinning up backend services.

- [ ] **Step 1: Extend `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  projects: [
    {
      name: 'happy-path',
      testMatch: /happy-path\.spec\.ts/,
      use: { baseURL: 'http://localhost:5173', headless: true },
    },
    {
      name: 'fixtures',
      testMatch: /smoke-fixtures\.spec\.ts/,
      use: { baseURL: 'http://localhost:5174', headless: true },
      webServer: {
        command: 'node ./e2e/fixtures-server.ts',
        url: 'http://localhost:5174/',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
    },
  ],
});
```

- [ ] **Step 2: Create the fixture server**

```ts
// packages/web/e2e/fixtures-server.ts
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '../../dist');

const chat = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
  userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
  jid: 'a@g.us',
  type: 'group',
  subject: 'Q3 Brief',
  lastMessageAt: '2026-05-14T13:02:00.000Z',
  lastMessagePreview: 'Hello',
  archived: false,
  mutedUntil: null,
  pinned: true,
  workspace: 'work',
  memberCount: 7,
  unreadCount: 0,
};

const message = {
  id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000050',
  userId: chat.userId,
  chatId: chat.id,
  waMessageId: 'ABC',
  senderJid: '4477@s.whatsapp.net',
  ts: '2026-05-14T13:01:00.000Z',
  kind: 'text',
  text: 'Hello smoke',
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  status: 'sent',
  reactions: [],
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (url.pathname === '/api/chats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([chat]));
    return;
  }
  if (url.pathname.startsWith('/api/chats/') && url.pathname.endsWith('/messages') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages: [message], nextCursor: null }));
    return;
  }
  if (url.pathname.startsWith('/api/chats/') && url.pathname.endsWith('/messages') && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...message, id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000051', text: 'sent from test', status: 'pending' }));
    return;
  }
  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    return;
  }

  // Static file fallback to dist/
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const buf = await readFile(path.join(DIST, p));
    const ext = path.extname(p);
    const type = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(buf);
  } catch {
    // SPA fallback
    const buf = await readFile(path.join(DIST, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(buf);
  }
});

server.listen(5174, () => {
  console.log('fixtures server up on http://localhost:5174');
});
```

- [ ] **Step 3: Build the web bundle (needed by the fixture server)**

```bash
pnpm --filter @yank/web build
```

Expected: `packages/web/dist/index.html` exists.

- [ ] **Step 4: Create `smoke-fixtures.spec.ts`**

```ts
// packages/web/e2e/smoke-fixtures.spec.ts
import { test, expect } from '@playwright/test';

test('loads the shell and renders the sidebar chat', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Q3 Brief')).toBeVisible();
});

test('clicking a chat row loads its messages', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Q3 Brief').click();
  await expect(page.getByText('Hello smoke')).toBeVisible();
});

test('Cmd+K opens the command palette', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Meta+k');
  await expect(page.getByPlaceholder(/jump to chat/i)).toBeVisible();
});
```

- [ ] **Step 5: Install Playwright browsers (if not already)**

```bash
pnpm --filter @yank/web exec playwright install chromium
```

- [ ] **Step 6: Run the fixtures-backed smoke**

```bash
pnpm --filter @yank/web exec playwright test --project=fixtures
```

Expected: 3 tests pass. (The `happy-path` project still requires a live api running on :5173; run separately with `--project=happy-path` when the api is up.)

- [ ] **Step 7: Commit**

```bash
git add packages/web/playwright.config.ts packages/web/e2e
git commit -m "test(web): add fixtures-backed Playwright smoke for shell + palette"
```

---

## Group J — Build & integration

### Task J1: Verify production build still serves via the M1 nginx Dockerfile

**Files:** (no source changes — verification only)

- [ ] **Step 1: Build**

```bash
pnpm --filter @yank/web build
```

Expected: `dist/index.html` and `dist/assets/` exist; no warnings about missing entry chunks.

- [ ] **Step 2: Build the docker image (using the M1 D4 Dockerfile)**

```bash
docker build -f packages/web/Dockerfile -t yank-web:m3-smoke .
```

Expected: image builds cleanly.

- [ ] **Step 3: Run the image and probe**

```bash
docker run -d --rm --name yank-web-smoke -p 18080:8080 yank-web:m3-smoke
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:18080/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:18080/c/anything
curl -s http://localhost:18080/healthz
docker rm -f yank-web-smoke
```

Expected: first two curls return `200` (SPA fallback on `try_files`), third returns `ok`.

If `try_files` doesn't serve the SPA correctly for deep links, fix `packages/web/nginx.conf` so the `location /` block reads:

```
location / {
  try_files $uri $uri/ /index.html;
}
```

Commit the fix as `fix(web): SPA fallback for deep links in nginx`.

- [ ] **Step 4: No commit unless nginx needs the fix above**

---

### Task J2: Update root `vitest.config.ts` to include `.tsx`

**Files:**
- Modify: `vitest.config.ts` (root)

- [ ] **Step 1: Edit the include pattern**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
    },
  },
});
```

The root vitest config is the entry point for the workspace `pnpm test`. Per-package `vitest.config.ts` overrides take precedence when running `pnpm --filter <pkg> test` because vitest discovers the closest config. The root keeps Node env (used by shared/db/api tests) while `packages/web/vitest.config.ts` overrides to jsdom for web tests.

- [ ] **Step 2: Run the full suite from root**

```bash
pnpm test
```

Expected: every package's tests run; nothing fails because of the change.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "test: include .tsx test files in root vitest config"
```

---

### Task J3: Update root CI to install Playwright browsers (if CI runs e2e)

**Files:**
- Modify: `.github/workflows/ci.yml`

If the M1 CI is `pnpm install + lint + typecheck + test` only, decide whether M3 adds e2e to CI. Recommendation: **run unit/component tests in CI, run e2e locally only.** Playwright in CI doubles wall time and tends to flake on lifecycle (server-up timing). The smoke is still valuable as a developer-side regression net.

- [ ] **Step 1: (Optional) If you want e2e in CI, append a job**

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: lint-typecheck-test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @yank/web exec playwright install --with-deps chromium
      - run: pnpm --filter @yank/web build
      - run: pnpm --filter @yank/web test:e2e
```

If you skip this, just add a one-liner under "What's NOT in M3" pointing at this fact.

- [ ] **Step 2: Commit (if changed)**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run web e2e smoke on PR"
```

---

## Final smoke test

After every task in Groups A–J is complete, run from repo root:

- [ ] **Step 1: Clean install**

```bash
rm -rf node_modules packages/*/node_modules
pnpm install
```

Expected: success.

- [ ] **Step 2: Lint + typecheck + unit tests**

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all green.

- [ ] **Step 3: Build the web bundle**

```bash
pnpm --filter @yank/web build
```

Expected: `packages/web/dist/index.html` exists and the bundle gzipped is under ~600 kB.

- [ ] **Step 4: Manual smoke against a running api (only if M1+M2 are deployed)**

Bring up the local stack (M1 task E1):

```bash
docker compose -f docker-compose.local.yml up -d
```

Then run the api locally and start the web dev server:

```bash
pnpm --filter @yank/api dev &
pnpm --filter @yank/web dev
```

Open `http://localhost:5173/`. Check:

- The sidebar populates (real or seeded chats).
- Clicking a chat loads its messages.
- Typing in the composer and pressing Enter inserts an optimistic row.
- Cmd+K opens the palette; Cmd+1/2/3 switch workspace.
- Reloading the page with a thread route open (`/c/:chatId/t/:messageId`) reopens the thread side panel.

If any of those fail, the test suite missed something — file a follow-up task and patch the component before merging M3.

---

## What's NOT in M3 (deferred to later milestones)

- **Triage card grid** (M4) — placeholder route renders "lands in M4".
- **Search results view + filter chips** (M5) — placeholder route only.
- **Saved messages view** (M5) — placeholder route only.
- **Settings rich UI + linked-devices management** (M7) — placeholder route only.
- **Diagnostics rich UI + event log** (M7) — placeholder route only.
- **Media playback** — voice notes, video, sticker rendering, image lightbox (M6 when media-worker delivers files).
- **Paste-to-attach and drag-and-drop file upload in the composer** (M6 — needs media upload endpoint).
- **@mention autocomplete in the composer** (M4 — needs `useChatMembers` wired into a popover).
- **Edit-last shortcut (`↑` in empty composer)** (M4 — needs edit-message API + flow).
- **Hover shortcuts** — `R` reply-in-thread on message hover, `S` star (M4).
- **Cmd-T quick-switcher**, **Cmd-F search-current-chat**, **Cmd-Shift-A mark-read** (M4 — keyboard polish).
- **WhatsApp degradation banner** when daemon disconnects (M4 — UI for the `disconnected` SSE event already handled at the cache level).
- **PWA install, service worker, Web Push** (M6).
- **In-page `Notification.show()` for inbound messages while tab is unfocused** (M6, alongside Web Push).
- **Light-theme polish** — the dark theme is the production target for M3.
- **Tweaks panel** — dev-only artefact from the prototype; not shipped.
- **Playwright in CI** — local-only unless J3 step 1 is enabled.

The frontend architecture (router, query layer, SSE consumer, theme tokens, design-system primitives) is final after M3; later milestones add views, not infrastructure.

---

## Cross-references

- Spec: [`docs/superpowers/specs/2026-05-14-yank-design.md`](../specs/2026-05-14-yank-design.md) — see §4 (invariants), §8 (flows), §9 (frontend IA), §11 (testing).
- Mockup: [`docs/superpowers/specs/mockups/2026-05-14-claude-design/`](../specs/mockups/2026-05-14-claude-design/) — visual reference for every component.
- M1 plan: [`docs/superpowers/plans/2026-05-14-yank-m1-foundation.md`](./2026-05-14-yank-m1-foundation.md) — establishes packages, schema, container topology that M3 builds on.
- M2 plan: (TBD) — owns daemon, message ingestion, full api endpoints listed in the "API contract" section above.
