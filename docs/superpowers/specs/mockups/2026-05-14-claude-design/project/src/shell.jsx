/* Workspace rail + sidebar (chat list) — confident shell */

const { CONTACTS, CHATS } = window.DATA;

/* Deterministic gradient picker so the same name always gets the same avatar */
function avG(seed) {
  if (!seed) return "av-g4";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return "av-g" + ((h % 8) + 1);
}
window.avG = avG;

function RailBtn({ workspace, active, count, onClick, title, glyph, mono }) {
  return (
    <button
      className={
        "rail-btn " +
        (active ? "active " : "") +
        (workspace ? "ws-" + workspace : "")
      }
      onClick={onClick} title={title}
    >
      {mono ? (
        <span style={{
          fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14,
          letterSpacing: "-0.04em"
        }}>{mono}</span>
      ) : glyph}
      {workspace && <span className={"ws-dot " + workspace} />}
      {count > 0 && <span className="badge">{count}</span>}
    </button>
  );
}

function Rail({ view, setView }) {
  return (
    <aside className="rail">
      <div className="rail-logo" title="Yank">yk</div>

      <RailBtn
        workspace="work" mono="W"
        active={view === "work"}
        title="Work · ⌘1"
        onClick={() => setView("work")}
      />
      <RailBtn
        workspace="personal" mono="P"
        active={view === "personal"}
        title="Personal · ⌘2"
        onClick={() => setView("personal")}
      />
      <RailBtn
        workspace="triage" mono="T"
        active={view === "triage"}
        count={4}
        title="Triage · ⌘3"
        onClick={() => setView("triage")}
      />

      <div className="rail-divider" />

      <RailBtn
        glyph={window.I.search(18)}
        active={view === "search"}
        title="Search · ⌘⇧F"
        onClick={() => setView("search")}
      />
      <RailBtn
        glyph={window.I.bookmark(18)}
        active={view === "saved"}
        title="Saved messages"
        onClick={() => setView("saved")}
      />
      <RailBtn
        glyph={window.I.directory(18)}
        active={view === "directory"}
        title="Directory (phase 2)"
        onClick={() => setView("directory")}
      />

      <div className="rail-spacer" />

      <RailBtn
        glyph={window.I.activity(18)}
        active={view === "diagnostics"}
        title="Diagnostics"
        onClick={() => setView("diagnostics")}
      />
      <RailBtn
        glyph={window.I.settings(18)}
        active={view === "settings"}
        title="Settings"
        onClick={() => setView("settings")}
      />

      <div className={"rail-avatar " + avG("You")} title="Tom · you">
        TM
        <span className="online" />
      </div>
    </aside>
  );
}

function ChatRow({ chat, active, onClick }) {
  const avatarClass = chat.type === "dm" ? avG(chat.title) : avG(chat.id);
  return (
    <button className={
      "chat-row " +
      (active ? "active " : "") +
      (chat.unread > 0 ? "unread " : "")
    } onClick={onClick}>
      <span className={"chat-icon " + (chat.type === "dm" ? "dm " : "") + avatarClass}>
        {chat.avatar}
        {chat.online && <span className="presence" />}
      </span>
      <span style={{ minWidth: 0 }}>
        <div className="chat-name">{chat.title}</div>
      </span>
      <span className="chat-meta">
        {chat.pinned && <span className="pin-glyph">{window.I.pin(11)}</span>}
        {chat.muted && <span className="mute-glyph">{window.I.muted(12)}</span>}
        {chat.mention && <span className="mention-chip">@</span>}
        {chat.unread > 0 && (
          <span className={"unread-badge" + (chat.muted ? " muted" : "")}>
            {chat.unread}
          </span>
        )}
      </span>
    </button>
  );
}

function Sidebar({ workspace, activeChat, setActiveChat, openPalette }) {
  const wsChats = CHATS.filter((c) => c.workspace === workspace);
  const pinned = wsChats.filter((c) => c.pinned);
  const dms = wsChats.filter((c) => !c.pinned && c.type === "dm");
  const groups = wsChats.filter((c) => !c.pinned && c.type !== "dm");

  const title = workspace === "work" ? "Work" : workspace === "personal" ? "Personal" : "";

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-title">
          <h2>{title}</h2>
          <span className="chev">{window.I.chevronDown(10)}</span>
          <div className="actions">
            <button className="icon-btn" title="New message">
              {window.I.plus(14)}
            </button>
            <button className="icon-btn" title="More">
              {window.I.more(14)}
            </button>
          </div>
        </div>
        <div className="searchbar" onClick={openPalette}>
          {window.I.search(13)}
          <input readOnly placeholder={`Jump to or search ${title.toLowerCase()}…`} />
          <span className="kbd">⌘K</span>
        </div>
      </div>

      <div className="sidebar-scroll">
        {pinned.length > 0 && (
          <>
            <div className="sidebar-section">
              <span className="chev-s">{window.I.chevronDown(9)}</span>
              Pinned
              <span className="count">{pinned.length}</span>
            </div>
            <div className="sidebar-list">
              {pinned.map((c) => (
                <ChatRow key={c.id} chat={c}
                  active={activeChat === c.id}
                  onClick={() => setActiveChat(c.id)} />
              ))}
            </div>
          </>
        )}

        {groups.length > 0 && (
          <>
            <div className="sidebar-section">
              <span className="chev-s">{window.I.chevronDown(9)}</span>
              Group chats
              <span className="count">{groups.length}</span>
              <button className="add" title="Add group">{window.I.plus(11)}</button>
            </div>
            <div className="sidebar-list">
              {groups.map((c) => (
                <ChatRow key={c.id} chat={c}
                  active={activeChat === c.id}
                  onClick={() => setActiveChat(c.id)} />
              ))}
            </div>
          </>
        )}

        {dms.length > 0 && (
          <>
            <div className="sidebar-section">
              <span className="chev-s">{window.I.chevronDown(9)}</span>
              Direct messages
              <span className="count">{dms.length}</span>
              <button className="add" title="New DM">{window.I.plus(11)}</button>
            </div>
            <div className="sidebar-list">
              {dms.map((c) => (
                <ChatRow key={c.id} chat={c}
                  active={activeChat === c.id}
                  onClick={() => setActiveChat(c.id)} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="sidebar-foot">
        <span className="phone-icon">
          {window.I.phone(14)}
          <span className="ping" />
        </span>
        <span>
          <div className="label">WhatsApp linked</div>
          <div className="meta">+44 7700 900001 · synced 2s ago</div>
        </span>
        <button className="mini-btn" title="Diagnostics">…</button>
      </div>
    </aside>
  );
}

window.Rail = Rail;
window.Sidebar = Sidebar;
window.ChatRow = ChatRow;
