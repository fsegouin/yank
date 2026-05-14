/* Chat view — topbar, message list, composer */

const { CONTACTS, MESSAGES_BRIEF, CHATS } = window.DATA;

function Avatar({ who, size = 36, square = false }) {
  const c = CONTACTS[who] || { initials: "??" };
  const gradient = window.avG(c.name || who);
  return (
    <div
      className={"msg-avatar " + gradient}
      style={{
        width: size, height: size,
        borderRadius: square ? 50 : 8,
        fontSize: size <= 22 ? 9.5 : size <= 30 ? 11 : 12.5,
      }}
    >
      {c.initials}
    </div>
  );
}

function MessageText({ text }) {
  if (!text) return null;
  /* Tokenise: **bold**, @mention, urls, `code` */
  const parts = [];
  const re = /(@\w+)|(\*\*[^*]+\*\*)|(`[^`]+`)|(https?:\/\/[^\s]+)/g;
  let last = 0; let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<span className="mention" key={parts.length}>{m[1]}</span>);
    else if (m[2]) parts.push(<strong key={parts.length}>{m[2].slice(2, -2)}</strong>);
    else if (m[3]) parts.push(<code key={parts.length}>{m[3].slice(1, -1)}</code>);
    else if (m[4]) parts.push(<a key={parts.length} href="#">{m[4]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <div className="msg-text">{parts}</div>;
}

function Reactions({ reactions }) {
  if (!reactions?.length) return null;
  return (
    <div className="reactions">
      {reactions.map((r, i) => (
        <button className={"reaction" + (r.mine ? " mine" : "")} key={i}>
          <span>{r.e}</span>
          <span className="count">{r.n}</span>
        </button>
      ))}
      <button className="reaction" title="Add reaction" style={{ color: "var(--fg-3)" }}>
        {window.I.emoji(11)}
      </button>
    </div>
  );
}

function MediaImage({ media }) {
  return (
    <div className="media-grid">
      <div className="media-tile" style={{ aspectRatio: media.aspect || "4/3" }}>
        <span className="tag mono">{media.label || "image.png"}</span>
        <span>drop image</span>
      </div>
    </div>
  );
}

function Voice({ voice }) {
  const bars = Array.from({ length: 40 });
  return (
    <div className="voice">
      <button className="play">{window.I.play(10)}</button>
      <div className="wave">
        {bars.map((_, i) => {
          const h = 5 + Math.abs(Math.sin(i * 1.3)) * 14;
          return <span key={i} className={i < voice.played ? "played" : ""}
            style={{ height: h }} />;
        })}
      </div>
      <span className="dur">{voice.dur}</span>
    </div>
  );
}

function Doc({ doc }) {
  return (
    <div className="doc">
      <div className="ext">{doc.ext || "DOC"}</div>
      <div>
        <div className="name">{doc.name}</div>
        <div className="size mono">{doc.size}</div>
      </div>
    </div>
  );
}

function StatusGlyph({ status }) {
  if (!status) return null;
  if (status === "pending") return <span className="msg-status pending" title="Queued">{window.I.clock(11)}</span>;
  if (status === "sent")    return <span className="msg-status" title="Sent">{window.I.check(12)}</span>;
  if (status === "delivered") return <span className="msg-status" title="Delivered">{window.I.doubleCheck(13)}</span>;
  if (status === "read")    return <span className="msg-status read" title="Read">{window.I.doubleCheck(13)}</span>;
  if (status === "failed")  return <span className="msg-status failed" title="Failed">!</span>;
}

function ThreadLink({ m, onClick }) {
  return (
    <button className="thread-link" onClick={onClick}>
      <span className="avs">
        {m.threadPeople.map((p) => {
          const c = CONTACTS[p];
          return <span className={"av-s " + window.avG(c?.name || p)} key={p}>{c?.initials}</span>;
        })}
      </span>
      <span>{m.threadCount} replies</span>
      <span className="meta">· last reply {m.threadLast} ago</span>
    </button>
  );
}

function Message({ m, onOpenThread, inThread = false }) {
  if (m.system) {
    return <div className="msg-system"><span className="pill">{m.system}</span></div>;
  }
  const c = CONTACTS[m.sender] || { name: m.sender };
  const showHead = m.showHead;
  return (
    <div className={"msg" + (showHead ? "" : " compact")}>
      <div className="msg-avatar-slot">
        {showHead
          ? <Avatar who={m.sender} size={36} />
          : <div className="msg-hover-time">{m.ts}</div>}
      </div>
      <div className="msg-body">
        {showHead && (
          <div className="msg-head">
            <span className="msg-author">
              {m.sender === "you" ? "You" : c.name}
            </span>
            {m.role && <span className="msg-role">{m.role}</span>}
            <span className="msg-time mono">{m.ts}</span>
            <StatusGlyph status={m.status} />
          </div>
        )}
        {m.quote && (
          <div className="quote">
            <span className="quote-author">{m.quote.author}</span>
            <span>{m.quote.text}</span>
          </div>
        )}
        <MessageText text={m.text} />
        {m.media && <MediaImage media={m.media} />}
        {m.voice && <Voice voice={m.voice} />}
        {m.doc && <Doc doc={m.doc} />}
        <Reactions reactions={m.reactions} />
        {!inThread && m.threadCount > 0 && (
          <ThreadLink m={m} onClick={() => onOpenThread(m.id)} />
        )}
      </div>

      <div className="msg-actions">
        <button className="icon-btn" title="Add reaction">{window.I.emoji(14)}</button>
        <button className="icon-btn" title="Reply in thread" onClick={() => onOpenThread(m.id)}>{window.I.thread(14)}</button>
        <button className="icon-btn" title="Star">{window.I.star(13)}</button>
        <button className="icon-btn" title="More">{window.I.more(14)}</button>
      </div>
    </div>
  );
}

function Composer({ inThread = false, draft, setDraft, onSend, placeholder }) {
  const ref = React.useRef(null);
  React.useEffect(() => { ref.current?.focus(); }, []);
  const ph = placeholder ?? (inThread ? "Reply…" : "Message this chat");
  return (
    <div className="composer-wrap">
      <div className="composer">
        {!inThread && (
          <div className="composer-toolbar">
            <button className="icon-btn" title="Bold · ⌘B">{window.I.bold(14)}</button>
            <button className="icon-btn" title="Italic · ⌘I">{window.I.italic(14)}</button>
            <button className="icon-btn" title="Strikethrough">{window.I.strike(14)}</button>
            <span className="divider" />
            <button className="icon-btn" title="Inline code · ⌘E">{window.I.code(14)}</button>
            <button className="icon-btn" title="Link · ⌘K">{window.I.link(14)}</button>
            <button className="icon-btn" title="Blockquote">{window.I.blockquote(14)}</button>
            <button className="icon-btn" title="List">{window.I.list(14)}</button>
          </div>
        )}
        <textarea
          ref={ref}
          className="composer-input"
          rows={1}
          placeholder={ph}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
          }}
        />
        <div className="composer-bar">
          <button className="icon-btn" title="Attach file">{window.I.paperclip(15)}</button>
          <button className="icon-btn" title="Emoji">{window.I.emoji(15)}</button>
          <button className="icon-btn" title="Mention someone">@</button>
          <button className="icon-btn" title="Voice note">{window.I.mic(15)}</button>
          <span className="spacer" />
          <span className="hint">Shift+↵ newline</span>
          <button className="send-btn" disabled={!draft.trim()} onClick={onSend}>
            <span>Send</span>
            <span className="kbd">↵</span>
          </button>
        </div>
      </div>
      {!inThread && (
        <div className="composer-hint-bottom">
          <span><span className="kbd">↵</span> send</span>
          <span><span className="kbd">⇧↵</span> newline</span>
          <span><span className="kbd">T</span> reply in thread</span>
          <span><span className="kbd">↑</span> edit last</span>
          <span><span className="kbd">/</span> commands</span>
        </div>
      )}
    </div>
  );
}

function ChatTopbar({ chat, onToggleThread, threadOpen }) {
  const iconClass = chat.type === "dm" ? "dm " : "";
  const wsColor =
    chat.workspace === "work" ? "var(--c-work)" :
    chat.workspace === "personal" ? "var(--c-personal)" : "var(--c-triage)";
  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className={"chat-icon " + iconClass + window.avG(chat.id)} style={{
          width: 36, height: 36, fontSize: 13.5,
        }}>
          {chat.avatar}
          {chat.online && <span className="presence" />}
        </span>
        <div style={{ minWidth: 0 }}>
          <h1>{chat.title}</h1>
          <div className="topbar-sub">
            {chat.online && <span className="live" />}
            <span>{chat.online ? "active now" : "last seen 2h ago"}</span>
            <span className="sep">·</span>
            <span>{chat.members ? `${chat.members} members` : "Direct message"}</span>
            <span className="sep">·</span>
            <span className="mono">+44 7700 900112</span>
          </div>
        </div>
      </div>
      <div className="topbar-actions">
        <span className="ws-pill">
          <span className="dot" style={{ background: wsColor }} />
          {chat.workspace}
        </span>
        <button className="icon-btn" title="Pinned items">{window.I.pin(14)}</button>
        <button className="icon-btn" title="Search this chat · ⌘F">{window.I.search(15)}</button>
        <button className="icon-btn"
          title={threadOpen ? "Close thread" : "Threads in this chat"}
          onClick={onToggleThread}
          style={threadOpen ? { background: "var(--bg-2)", color: "var(--fg-0)" } : {}}>
          {window.I.thread(15)}
        </button>
        <button className="icon-btn" title="Details · ⌘.">{window.I.more(15)}</button>
      </div>
    </div>
  );
}

function ChatView({ chatId, onOpenThread, threadOpen, onToggleThread }) {
  const chat = CHATS.find((c) => c.id === chatId) || CHATS[0];
  const [draft, setDraft] = React.useState("");
  const listRef = React.useRef(null);
  React.useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [chatId]);

  const messages = chatId === "c-brief" ? MESSAGES_BRIEF : MESSAGES_BRIEF;
  const placeholder = `Message ${chat.title}`;

  return (
    <main className="pane" data-screen-label={"chat: " + chat.title}>
      <ChatTopbar chat={chat} onToggleThread={onToggleThread} threadOpen={threadOpen} />

      <div className="messages" ref={listRef}>
        {messages.map((m, i) => {
          if (m.day) {
            return <div className="day-divider" key={"d" + i}>
              <span className="pill">{m.day}</span>
            </div>;
          }
          return <Message m={m} key={m.id} onOpenThread={onOpenThread} />;
        })}
      </div>

      <div className="typing">
        <span>Marina is typing</span>{" "}
        <span className="dots"><span /><span /><span /></span>
      </div>

      <Composer
        draft={draft} setDraft={setDraft}
        onSend={() => setDraft("")}
        placeholder={placeholder}
      />
    </main>
  );
}

window.ChatView = ChatView;
window.Message = Message;
window.Composer = Composer;
