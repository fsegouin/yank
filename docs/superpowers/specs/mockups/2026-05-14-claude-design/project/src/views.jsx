/* Thread side panel + Triage view + Search view + Saved + Setup + Diagnostics + Command palette */

const { MESSAGES_BRIEF, THREAD_M4, TRIAGE_CHATS, SEARCH_RESULTS, SAVED, CONTACTS } = window.DATA;

/* ----- Thread panel ----- */
function ThreadPanel({ messageId, onClose }) {
  const parent = MESSAGES_BRIEF.find((m) => m.id === messageId);
  if (!parent) return null;
  const [draft, setDraft] = React.useState("");
  return (
    <aside className="thread-panel">
      <div className="thread-head">
        <div>
          <h3>Thread</h3>
          <div className="sub">in AKQA × Brock&Co — Q3 Brief</div>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close · Esc">
          {window.I.x(14)}
        </button>
      </div>
      <div className="thread-body">
        <div className="thread-parent">
          <window.Message m={{ ...parent, showHead: true, threadCount: 0 }} inThread={true} onOpenThread={()=>{}} />
        </div>
        <div className="thread-replies-label">
          <span>{THREAD_M4.length} replies</span>
        </div>
        {THREAD_M4.map((m) => (
          <window.Message key={m.id} m={m} inThread={true} onOpenThread={()=>{}} />
        ))}
      </div>
      <window.Composer
        inThread
        draft={draft} setDraft={setDraft}
        onSend={() => setDraft("")}
      />
    </aside>
  );
}

/* ----- Triage ----- */
function TriageView({ onAssign }) {
  const [chats, setChats] = React.useState(TRIAGE_CHATS);
  const [focusedIdx, setFocusedIdx] = React.useState(0);
  const total = TRIAGE_CHATS.length;
  const done = total - chats.length;

  function assign(idx, ws) {
    setChats((cs) => cs.filter((_, i) => i !== idx));
    setFocusedIdx((f) => Math.min(f, Math.max(0, chats.length - 2)));
    if (onAssign) onAssign(ws);
  }

  React.useEffect(() => {
    function onKey(e) {
      if (chats.length === 0) return;
      if (e.key === "1") assign(focusedIdx, "work");
      if (e.key === "2") assign(focusedIdx, "personal");
      if (e.key === "3") assign(focusedIdx, "hidden");
      if (e.key === "j" || e.key === "ArrowDown") setFocusedIdx((i) => Math.min(i + 1, chats.length - 1));
      if (e.key === "k" || e.key === "ArrowUp") setFocusedIdx((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedIdx, chats]);

  return (
    <div className="pane">
      <div className="topbar">
        <div className="topbar-left">
          <span className="chat-icon" style={{
            width: 28, height: 28, fontSize: 12,
            background: "var(--c-triage-soft)", color: "var(--c-triage)"
          }}>{window.I.inbox(14)}</span>
          <div>
            <h1>Triage</h1>
            <div className="topbar-sub">
              <span>{chats.length} unassigned chats</span>
              <span className="sep">·</span>
              <span>Decide where each one lives. Use <span className="kbd">1</span> <span className="kbd">2</span> <span className="kbd">3</span>.</span>
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" title="Filter">{window.I.filter(14)}</button>
          <button className="icon-btn" title="Archive all">{window.I.archive(14)}</button>
        </div>
      </div>

      <div className="big-screen">
        <div className="triage-bar">
          <span>{done}/{total} cleared</span>
          <div className="triage-progress">
            <div className="fill" style={{ width: `${(done/total)*100}%` }} />
          </div>
          <span className="mono" style={{ color: "var(--fg-3)" }}>↑ ↓ navigate · 1 work · 2 personal · 3 hide</span>
        </div>

        {chats.length === 0 && (
          <div style={{
            padding: "60px 0", textAlign: "center", color: "var(--fg-2)"
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 16, color: "var(--fg-0)", fontWeight: 500, marginBottom: 4 }}>Triage clear</div>
            <div>All new chats have a home. New ones will appear here.</div>
          </div>
        )}

        {chats.map((t, i) => (
          <div className={"triage-card" + (i === focusedIdx ? " focused" : "")}
            key={t.id} onClick={() => setFocusedIdx(i)}>
            <div className={"avatar " + window.avG(t.title)}>{t.avatar}</div>
            <div>
              <div>
                <span className="who">{t.title}</span>
                <span className="who-meta mono">· {t.lastTs}</span>
              </div>
              <div className="triage-preview">
                {t.preview.map((p, j) => (
                  <div className="line" key={j}>
                    <span className="ts mono">{p.ts}</span>
                    <span>{p.txt}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="triage-actions">
              <button className="triage-btn work" onClick={(e) => { e.stopPropagation(); assign(i, "work"); }}>
                <span className="dot" style={{ background: "var(--c-work)" }} />
                Work
                <span className="kbd">1</span>
              </button>
              <button className="triage-btn personal" onClick={(e) => { e.stopPropagation(); assign(i, "personal"); }}>
                <span className="dot" style={{ background: "var(--c-personal)" }} />
                Personal
                <span className="kbd">2</span>
              </button>
              <button className="triage-btn hide" onClick={(e) => { e.stopPropagation(); assign(i, "hidden"); }}>
                <span className="dot" style={{ background: "var(--fg-3)" }} />
                Hide
                <span className="kbd">3</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----- Search ----- */
function SearchView() {
  const [q, setQ] = React.useState("review");
  const [filters, setFilters] = React.useState({ workspace: "work", has: null, from: null });
  const ref = React.useRef(null);
  React.useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="pane">
      <div className="topbar">
        <div className="topbar-left" style={{ flex: 1 }}>
          <span style={{ color: "var(--fg-2)" }}>{window.I.search(16)}</span>
          <input
            ref={ref}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages, people, files…"
            style={{ flex: 1, fontSize: 15 }}
          />
          <span className="kbd">⌘⇧F</span>
        </div>
      </div>

      <div className="big-screen">
        <div className="big-h">
          <h1>Search</h1>
          <span className="meta">"{q}" · {SEARCH_RESULTS.length} matches · ranked by ts_rank + trigram similarity</span>
        </div>

        <div className="search-filter-row">
          <span style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
            Scope
          </span>
          <button className={"filter-chip " + (filters.workspace === "work" ? "active" : "")}
            onClick={() => setFilters({ ...filters, workspace: "work" })}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", background: "var(--c-work)"
            }} />
            in:work
          </button>
          <button className={"filter-chip " + (filters.workspace === "personal" ? "active" : "")}
            onClick={() => setFilters({ ...filters, workspace: "personal" })}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-personal)" }} />
            in:personal
          </button>
          <button className={"filter-chip " + (filters.workspace === "all" ? "active" : "")}
            onClick={() => setFilters({ ...filters, workspace: "all" })}>
            in:all
          </button>

          <span style={{ width: 1, height: 16, background: "var(--border-1)", margin: "0 4px" }} />

          <button className={"filter-chip " + (filters.has === "image" ? "active" : "")}
            onClick={() => setFilters({ ...filters, has: filters.has === "image" ? null : "image" })}>
            <span className="mono">has:image</span>
          </button>
          <button className={"filter-chip " + (filters.has === "file" ? "active" : "")}
            onClick={() => setFilters({ ...filters, has: filters.has === "file" ? null : "file" })}>
            <span className="mono">has:file</span>
          </button>
          <button className="filter-chip">
            <span className="mono">from:</span>any
          </button>
          <button className="filter-chip">
            <span className="mono">after:</span>2026-05-01
          </button>
        </div>

        {SEARCH_RESULTS.map((r, i) => (
          <div className="search-result" key={i}>
            <div className={"avatar " + window.avG(CONTACTS[r.sender]?.name || r.sender)}>{CONTACTS[r.sender]?.initials || "??"}</div>
            <div style={{ minWidth: 0 }}>
              <div className="top">
                <span className="who">{CONTACTS[r.sender]?.name || r.sender}</span>
                <span className="in">in {r.chat}</span>
                <span className="when mono">{r.when}</span>
              </div>
              <div className="snippet" dangerouslySetInnerHTML={{ __html: r.snippet }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----- Saved ----- */
function SavedView() {
  return (
    <div className="pane">
      <div className="topbar">
        <div className="topbar-left">
          <span className="chat-icon" style={{
            width: 28, height: 28, fontSize: 12,
            background: "oklch(95% 0.04 90)", color: "var(--c-saved)"
          }}>{window.I.bookmark(14)}</span>
          <div>
            <h1>Saved messages</h1>
            <div className="topbar-sub">
              <span>{SAVED.length} starred items</span>
              <span className="sep">·</span>
              <span>Cross-workspace · only visible to you</span>
            </div>
          </div>
        </div>
      </div>
      <div className="big-screen">
        {SAVED.map((s, i) => (
          <div className="saved-card" key={i}>
            <div>
              <div className="top">
                <span className="who">{CONTACTS[s.sender]?.name || s.sender}</span>
                <span className="where mono">{s.where}</span>
              </div>
              <div className="msg-text" style={{
                fontFamily: s.code ? "var(--font-mono)" : undefined,
                fontSize: s.code ? 12 : undefined,
                background: s.code ? "var(--bg-1)" : undefined,
                padding: s.code ? "8px 10px" : undefined,
                borderRadius: s.code ? 4 : undefined,
                border: s.code ? "1px solid var(--border-0)" : undefined,
                marginTop: 4,
              }}>{s.text}</div>
            </div>
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "flex-end", gap: 8
            }}>
              <span className="when mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{s.when}</span>
              <button className="icon-btn" style={{ color: "var(--c-saved)" }}>{window.I.starFill(13)}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----- Setup ----- */
function SetupView({ onComplete }) {
  const [stage, setStage] = React.useState("pair"); /* pair → linking → syncing → done */
  const [progress, setProgress] = React.useState({ chats: 0, messages: 0, contacts: 0 });

  React.useEffect(() => {
    if (stage !== "syncing") return;
    let i = 0;
    const it = setInterval(() => {
      i++;
      setProgress({
        chats: Math.min(i * 7, 142),
        messages: Math.min(i * 580, 18432),
        contacts: Math.min(i * 11, 273),
      });
      if (i > 30) {
        clearInterval(it);
        setStage("done");
      }
    }, 80);
    return () => clearInterval(it);
  }, [stage]);

  return (
    <div className="setup">
      <div className="setup-card">
        <div className="logo">yk</div>
        <h1>Link your WhatsApp</h1>
        <p className="lede">
          Open WhatsApp → <span className="mono" style={{
            background: "var(--bg-1)", padding: "1px 6px", borderRadius: 3, fontSize: 12
          }}>Settings → Linked Devices → Link a device</span> → Link with phone number,
          then enter this code on your phone.
        </p>

        <div className="pair-code">
          <span className="chunk">FX3</span>
          <span className="chunk">M9A</span>
          <span className="chunk">K2P</span>
        </div>

        <div style={{ display: "flex", gap: 14, justifyContent: "center", fontSize: 12, color: "var(--fg-2)" }}>
          <button onClick={() => setStage("syncing")}
            style={{ color: "var(--accent)", textDecoration: "underline" }}>
            Use QR code instead
          </button>
          <span>·</span>
          <span>Code expires in <span className="mono">2:43</span></span>
        </div>

        <div className="setup-progress">
          <div className="progress-row done">
            <span className="check">{window.I.check(10)}</span>
            <span>Daemon online</span>
            <span className="meta">nas-pi · 0.6s</span>
          </div>
          <div className={"progress-row " + (stage !== "pair" ? "done" : "active")}>
            <span className="check">{stage !== "pair" ? window.I.check(10) : "•"}</span>
            <span>{stage === "pair" ? "Waiting for phone…" : "Linked to phone"}</span>
            <span className="meta mono">+44 7700 900001</span>
          </div>
          <div className={"progress-row " + (stage === "syncing" ? "active" : stage === "done" ? "done" : "")}>
            <span className="check">{stage === "done" ? window.I.check(10) : stage === "syncing" ? "↓" : ""}</span>
            <span>Syncing history (best-effort)</span>
            <span className="meta mono">
              {progress.chats} chats · {progress.messages.toLocaleString()} msgs
            </span>
          </div>
          <div className={"progress-row " + (stage === "done" ? "done" : "")}>
            <span className="check">{stage === "done" ? window.I.check(10) : ""}</span>
            <span>{stage === "done" ? "4 chats in Triage" : "Triage pending"}</span>
            <span className="meta mono">workspace=triage</span>
          </div>
        </div>

        {stage === "pair" && (
          <button
            onClick={() => setStage("syncing")}
            style={{
              marginTop: 22, padding: "8px 14px",
              background: "var(--accent)", color: "var(--fg-inverse)",
              borderRadius: 4, fontWeight: 600, fontSize: 12.5
            }}
          >Simulate pairing →</button>
        )}
        {stage === "done" && (
          <button
            onClick={onComplete}
            style={{
              marginTop: 22, padding: "8px 14px",
              background: "var(--accent)", color: "var(--fg-inverse)",
              borderRadius: 4, fontWeight: 600, fontSize: 12.5
            }}
          >Open Triage →</button>
        )}
      </div>
    </div>
  );
}

/* ----- Diagnostics ----- */
function DiagnosticsView() {
  return (
    <div className="pane">
      <div className="topbar">
        <div className="topbar-left">
          <span className="chat-icon" style={{
            width: 28, height: 28, fontSize: 12,
            background: "var(--bg-2)", color: "var(--fg-1)"
          }}>{window.I.activity(14)}</span>
          <div>
            <h1>Diagnostics</h1>
            <div className="topbar-sub">
              <span>Saves shelling into containers. Live values from the daemon.</span>
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" title="Reload">{window.I.activity(14)}</button>
        </div>
      </div>

      <div className="big-screen">
        <div className="big-h">
          <h1>Session</h1>
          <span className="meta">healthz · daemon · postgres · redis</span>
        </div>

        <div className="diag-grid">
          <div className="diag-card">
            <div className="label">WA session</div>
            <div className="value"><span className="ok">●</span> open</div>
            <div className="delta">last reconnect 6h ago · backoff 1s</div>
          </div>
          <div className="diag-card">
            <div className="label">Send latency (p50 / p95)</div>
            <div className="value">142<span className="delta">ms</span> / 380<span className="delta">ms</span></div>
            <div className="delta">last 1,000 sends</div>
          </div>
          <div className="diag-card">
            <div className="label">Inbound msg rate (5m)</div>
            <div className="value">0.42<span className="delta">/s</span></div>
            <div className="delta">peak 3.1/s · 11:20</div>
          </div>
          <div className="diag-card">
            <div className="label">Redis queue depth</div>
            <div className="value">commands 0 / events 2</div>
            <div className="delta">XACK lag &lt; 20ms</div>
          </div>
          <div className="diag-card">
            <div className="label">Postgres</div>
            <div className="value">142,802 rows · 384MB</div>
            <div className="delta">FTS index healthy · last vacuum 4h</div>
          </div>
          <div className="diag-card">
            <div className="label">Media worker</div>
            <div className="value">queue 3 / failed 0</div>
            <div className="delta">ready 18,402 · 2.1 GB on disk</div>
          </div>
        </div>

        <div className="big-h" style={{ marginTop: 28 }}>
          <h1 style={{ fontSize: 16 }}>Event log</h1>
          <span className="meta">last 12 lines · pino · userId=u_1</span>
        </div>
        <div className="log">
          <div><span className="ts">14:02:11</span> <span className="lvl-info">[evt]</span> message chat=c-brief wa=ABCxyz status=delivered</div>
          <div><span className="ts">14:02:09</span> <span className="lvl-info">[evt]</span> message chat=c-brief wa=ABCxyy kind=document size=4413210</div>
          <div><span className="ts">14:01:46</span> <span className="lvl-ok">[ok]</span> media-worker download wa=ABCxyy 312ms</div>
          <div><span className="ts">14:01:38</span> <span className="lvl-info">[cmd]</span> send local=01HVZ chat=c-brief len=147</div>
          <div><span className="ts">14:01:39</span> <span className="lvl-ok">[ok]</span> baileys.sendMessage 211ms → wa=ABCxyx status=sent</div>
          <div><span className="ts">13:48:02</span> <span className="lvl-warn">[warn]</span> presence flap chat=c-studio · debounced</div>
          <div><span className="ts">13:31:18</span> <span className="lvl-info">[evt]</span> read-receipt chat=c-brief by=client@…</div>
          <div><span className="ts">13:22:05</span> <span className="lvl-info">[evt]</span> message chat=t-unknown1 (workspace=triage)</div>
          <div><span className="ts">12:14:00</span> <span className="lvl-info">[sys]</span> group-add chat=c-brief jid=yuki@…</div>
          <div><span className="ts">08:11:42</span> <span className="lvl-ok">[ok]</span> baileys.connect open · jid=4477…00001:1</div>
          <div><span className="ts">08:11:31</span> <span className="lvl-info">[boot]</span> daemon up · session restored from /baileys-auth/u_1</div>
          <div><span className="ts">08:11:30</span> <span className="lvl-info">[boot]</span> redis streams commands:user:u_1 → consumer group daemon-1</div>
        </div>
      </div>
    </div>
  );
}

/* ----- Command palette ----- */
const PALETTE_ITEMS = [
  { section: "Jump to" },
  { id: "j-brief", icon: window.I.hash(13), label: "AKQA × Brock&Co — Q3 Brief", meta: "work · 4 unread" },
  { id: "j-studio", icon: window.I.hash(13), label: "Studio · engineering", meta: "work · 1 unread" },
  { id: "j-dani", icon: window.I.at(13), label: "Dani ♥", meta: "personal · 2 unread" },
  { id: "j-mum", icon: window.I.at(13), label: "Mum", meta: "personal" },
  { id: "j-triage", icon: window.I.inbox(13), label: "Triage", meta: "4 unassigned", kbd: "⌘3" },
  { section: "Actions" },
  { id: "a-mark", icon: window.I.check(13), label: "Mark current chat as read", kbd: "⌘⇧A" },
  { id: "a-star", icon: window.I.star(13), label: "Star current message" },
  { id: "a-search", icon: window.I.search(13), label: "Global search…", kbd: "⌘⇧F" },
  { id: "a-ws", icon: window.I.grid(13), label: "Move current chat to workspace…" },
  { id: "a-mute", icon: window.I.archive(13), label: "Mute current chat for…" },
  { section: "Settings" },
  { id: "s-theme", icon: window.I.settings(13), label: "Toggle dark mode" },
  { id: "s-diag", icon: window.I.activity(13), label: "Open diagnostics" },
];

function CommandPalette({ onClose, onAction }) {
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(1);
  const ref = React.useRef(null);
  React.useEffect(() => { ref.current?.focus(); }, []);

  const items = PALETTE_ITEMS.filter((i) => {
    if (i.section) return true;
    if (!q) return true;
    return i.label.toLowerCase().includes(q.toLowerCase());
  });

  // First non-section index
  const indexable = items.map((i, idx) => i.section ? -1 : idx).filter((i) => i >= 0);
  const activeIdx = indexable[active] ?? indexable[0];

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, indexable.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); onAction?.(items[activeIdx]?.id); onClose(); }
  }

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette">
        <input
          ref={ref}
          className="palette-input"
          placeholder="Jump to chat, run command…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={onKey}
        />
        <div className="palette-list">
          {items.map((it, i) => it.section ? (
            <div className="palette-section" key={"s" + i}>{it.section}</div>
          ) : (
            <div
              className={"palette-item" + (i === activeIdx ? " active" : "")}
              key={it.id}
              onMouseEnter={() => setActive(indexable.indexOf(i))}
              onClick={() => { onAction?.(it.id); onClose(); }}
            >
              <span className="icon">{it.icon}</span>
              <span>{it.label}</span>
              <span className="meta">{it.meta}</span>
              {it.kbd && <span className="kbd">{it.kbd}</span>}
            </div>
          ))}
        </div>
        <div className="palette-foot">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> navigate</span>
          <span><span className="kbd">↵</span> open</span>
          <span><span className="kbd">esc</span> close</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", color: "var(--fg-3)" }}>
            {items.filter((i) => !i.section).length} results
          </span>
        </div>
      </div>
    </div>
  );
}

window.ThreadPanel = ThreadPanel;
window.TriageView = TriageView;
window.SearchView = SearchView;
window.SavedView = SavedView;
window.SetupView = SetupView;
window.DiagnosticsView = DiagnosticsView;
window.CommandPalette = CommandPalette;
