/* Root app — routes between views, manages state, hosts Tweaks panel */

const { CHATS } = window.DATA;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "density": "comfortable",
  "accent": "auto",
  "showRail": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const [workspace, setWorkspace] = React.useState("work");
  const [view, setView] = React.useState("chat");
  const [activeChat, setActiveChat] = React.useState("c-brief");
  const [openThread, setOpenThread] = React.useState(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [setupOpen, setSetupOpen] = React.useState(false);
  const [showBanner, setShowBanner] = React.useState(true);

  /* Sync DOM data attributes */
  React.useEffect(() => {
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.density = t.density;
    /* "auto" → accent follows current workspace */
    const resolvedAccent = t.accent === "auto"
      ? (view === "triage" ? "triage" : workspace)
      : t.accent;
    document.documentElement.dataset.accent = resolvedAccent;
  }, [t.theme, t.density, t.accent, workspace, view]);

  /* Keyboard shortcuts */
  React.useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "k") { e.preventDefault(); setPaletteOpen(true); return; }
      if (mod && e.key === "1") { e.preventDefault(); setWorkspace("work"); setView("chat"); return; }
      if (mod && e.key === "2") { e.preventDefault(); setWorkspace("personal"); setView("chat"); setActiveChat("c-dani"); return; }
      if (mod && e.key === "3") { e.preventDefault(); setView("triage"); return; }
      if (mod && e.shiftKey && e.key === "F") { e.preventDefault(); setView("search"); return; }
      if (e.key === "Escape" && openThread) { setOpenThread(null); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openThread]);

  /* Map rail selection to view */
  function selectRail(v) {
    if (v === "work" || v === "personal") {
      setWorkspace(v);
      setView("chat");
      if (v === "personal" && activeChat === "c-brief") setActiveChat("c-dani");
      if (v === "work" && activeChat === "c-dani") setActiveChat("c-brief");
    } else {
      setView(v);
    }
  }

  /* Setup-screen overlay */
  if (setupOpen) {
    return <window.SetupView onComplete={() => { setSetupOpen(false); setView("triage"); }} />;
  }

  const railSelection =
    view === "chat" ? workspace :
    view;

  const showChrome =
    view !== "search" && view !== "saved" && view !== "diagnostics" && view !== "triage";

  // Main pane
  let mainPane;
  if (view === "chat") {
    mainPane = (
      <window.ChatView
        chatId={activeChat}
        onOpenThread={(id) => setOpenThread(id)}
        threadOpen={!!openThread}
        onToggleThread={() => setOpenThread((o) => o ? null : "m-4")}
      />
    );
  } else if (view === "triage") {
    mainPane = <window.TriageView onAssign={() => {}} />;
  } else if (view === "search") {
    mainPane = <window.SearchView />;
  } else if (view === "saved") {
    mainPane = <window.SavedView />;
  } else if (view === "diagnostics") {
    mainPane = <window.DiagnosticsView />;
  } else if (view === "directory") {
    mainPane = (
      <div className="pane">
        <div className="topbar"><div className="topbar-left"><h1>Directory</h1></div></div>
        <div className="big-screen">
          <div style={{ maxWidth: 480, padding: "60px 0", color: "var(--fg-2)" }}>
            <h2 style={{ fontSize: 16, color: "var(--fg-0)", margin: "0 0 6px" }}>Channel directory · phase 2</h2>
            <p style={{ lineHeight: 1.55, fontSize: 13 }}>
              Browse public groups and channels you've been invited to. Empty in v1 — schema lives in <code style={{
                fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--bg-1)", padding: "0 4px", borderRadius: 3
              }}>directory_entries</code>; UI ships with phase 2.
            </p>
          </div>
        </div>
      </div>
    );
  } else if (view === "settings") {
    mainPane = (
      <div className="pane">
        <div className="topbar"><div className="topbar-left"><h1>Settings</h1></div></div>
        <div className="big-screen">
          <div className="big-h"><h1>Identity & session</h1></div>
          <div className="diag-grid">
            <div className="diag-card">
              <div className="label">Linked WhatsApp number</div>
              <div className="value mono" style={{ fontSize: 15 }}>+44 7700 900001</div>
              <div className="delta">linked 14 May · device #2 of 4</div>
            </div>
            <div className="diag-card">
              <div className="label">Web Push</div>
              <div className="value"><span className="ok">●</span> enabled</div>
              <div className="delta">2 devices subscribed</div>
            </div>
            <div className="diag-card">
              <div className="label">Reachable via</div>
              <div className="value mono" style={{ fontSize: 13 }}>yank.tail3aef.ts.net</div>
              <div className="delta">tailnet only · no public exposure</div>
            </div>
            <div className="diag-card">
              <div className="label">Storage</div>
              <div className="value">384 MB <span className="delta">postgres</span> · 2.1 GB <span className="delta">media</span></div>
              <div className="delta">on encrypted ZFS dataset</div>
            </div>
          </div>
          <button onClick={() => setSetupOpen(true)}
            style={{
              marginTop: 18, padding: "6px 12px",
              border: "1px solid var(--border-1)", borderRadius: 4,
              fontSize: 12, color: "var(--fg-1)", whiteSpace: "nowrap"
            }}>Re-link device…</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={"shell" + (openThread && view === "chat" ? " thread-open" : "")}
        style={{
          gridTemplateColumns:
            (!t.showRail ? "0 " : "var(--rail-w) ") +
            "var(--sidebar-w) 1fr" +
            (openThread && view === "chat" ? " var(--thread-w)" : "")
        }}
      >
        {t.showRail && <window.Rail view={railSelection} setView={selectRail} />}
        <window.Sidebar
          workspace={workspace}
          activeChat={activeChat}
          setActiveChat={(id) => { setActiveChat(id); setView("chat"); }}
          openPalette={() => setPaletteOpen(true)}
        />
        {mainPane}
        {openThread && view === "chat" && (
          <window.ThreadPanel messageId={openThread} onClose={() => setOpenThread(null)} />
        )}
      </div>

      {paletteOpen && (
        <window.CommandPalette
          onClose={() => setPaletteOpen(false)}
          onAction={(id) => {
            if (id === "j-brief") { setWorkspace("work"); setActiveChat("c-brief"); setView("chat"); }
            else if (id === "j-studio") { setWorkspace("work"); setActiveChat("c-studio"); setView("chat"); }
            else if (id === "j-dani") { setWorkspace("personal"); setActiveChat("c-dani"); setView("chat"); }
            else if (id === "j-mum") { setWorkspace("personal"); setActiveChat("c-mum"); setView("chat"); }
            else if (id === "j-triage") setView("triage");
            else if (id === "a-search") setView("search");
            else if (id === "s-diag") setView("diagnostics");
            else if (id === "s-theme") setTweak("theme", t.theme === "light" ? "dark" : "light");
          }}
        />
      )}

      <YankTweaks t={t} setTweak={setTweak} openSetup={() => setSetupOpen(true)} />
    </>
  );
}

/* Tweaks panel */
function YankTweaks({ t, setTweak, openSetup }) {
  return (
    <window.TweaksPanel title="Tweaks">
      <window.TweakSection label="Appearance">
        <window.TweakRadio
          label="Theme"
          value={t.theme}
          onChange={(v) => setTweak("theme", v)}
          options={[
            { label: "Light", value: "light" },
            { label: "Dark", value: "dark" },
          ]}
        />
        <window.TweakRadio
          label="Density"
          value={t.density}
          onChange={(v) => setTweak("density", v)}
          options={[
            { label: "Compact", value: "compact" },
            { label: "Comfort", value: "comfortable" },
            { label: "Roomy", value: "roomy" },
          ]}
        />
        <window.TweakRadio
          label="Accent"
          value={t.accent}
          onChange={(v) => setTweak("accent", v)}
          options={[
            { label: "Auto", value: "auto" },
            { label: "Work", value: "work" },
            { label: "Pers.", value: "personal" },
            { label: "Triage", value: "triage" },
            { label: "Mono", value: "mono" },
          ]}
        />
        <window.TweakToggle
          label="Show workspace rail"
          value={t.showRail}
          onChange={(v) => setTweak("showRail", v)}
        />
      </window.TweakSection>
      <window.TweakSection label="Tour">
        <window.TweakButton label="Show first-run / linking" onClick={openSetup} />
      </window.TweakSection>
    </window.TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
