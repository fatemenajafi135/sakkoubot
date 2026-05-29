// app.jsx — root: routing, themes, chat-history state, persistence
//
// Two screens: 'home' (Selector) and 'chat' (Chat). The session that's visible
// in Chat is tracked here in App so the sidebar (rendered inside Chat) can list
// all sessions for the active bot. Histories are persisted to localStorage on
// every change.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "themeId": "light-honey"
}/*EDITMODE-END*/;

// ── Bot definitions ────────────────────────────────────────────────────────
const BOTS = {
  resume: {
    id: "resume",
    name: "سکوبات رزومه",
    sub: "دستیار جست‌وجو در رزومه‌ی اعضا",
    glyph: "📄",
    blurb: "هر سؤالی درباره‌ی سوابق، تخصص‌ها و پروژه‌های اعضای مرکز رشد دارید بپرسید. پاسخ‌ها از روی رزومه‌های ثبت‌شده در پایگاه دانش استخراج می‌شود.",
    examples: [
      "چه اعضایی در حوزه‌ی هوش مصنوعی فعالیت می‌کنند؟",
      "رزومه‌ی توسعه‌دهنده‌های بک‌اند با تجربه‌ی بیش از ۵ سال را نشان بده.",
      "کدام اعضای مرکز سابقه‌ی همکاری با شرکت‌های فناور دارند؟",
      "متخصصان حوزه‌ی طراحی محصول را معرفی کن."
    ]
  },
  rules: {
    id: "rules",
    name: "سکوبات قوانین",
    sub: "دستیار آیین‌نامه‌ی مرکز رشد گیلان",
    glyph: "⚖️",
    blurb: "پاسخ سؤال‌های خود را درباره‌ی شرایط پذیرش، مدت استقرار، تسهیلات و آیین‌نامه‌های داخلی مرکز رشد گیلان از این دستیار بپرسید.",
    examples: [
      "شرایط پذیرش در مرکز رشد گیلان چیست؟",
      "حداکثر مدت استقرار یک تیم در مرکز چقدر است؟",
      "تسهیلات مالی قابل ارائه به واحدهای فناور شامل چه مواردی می‌شود؟",
      "روند ارزیابی دوره‌ای واحدها چگونه انجام می‌شود؟"
    ]
  }
};

// ── Theme palettes ─────────────────────────────────────────────────────────
// Single color family (Honey / عسلی) paired with warm-gray neutrals so the
// background and accent share a slight yellow undertone. Each entry is a
// complete CSS-variable set; we apply by writing the vars directly onto :root.
const THEMES = [
  {
    id: "light-honey", name: "روشن عسلی", mode: "light", family: "honey",
    preview: { bg: "#f8f5ed", surface: "#f0ede3", accent: "#c9921a", text: "#181612" },
    vars: {
      "--bg": "#f8f5ed", "--surface": "#ffffff", "--surface-2": "#f0ede3", "--surface-3": "#e4e0d3",
      "--border": "rgba(24,22,18,0.08)", "--border-strong": "rgba(24,22,18,0.16)",
      "--text": "#181612", "--text-muted": "#6a6357", "--text-faint": "#a89e8c",
      "--accent": "#c9921a", "--accent-fg": "#ffffff",
      "--accent-soft": "rgba(201,146,26,0.12)", "--accent-on-soft": "#8a6210",
      "--user-bubble": "#181612", "--user-bubble-fg": "#f8f5ed"
    }
  },
  {
    id: "dark-honey", name: "تاریک عسلی", mode: "dark", family: "honey",
    preview: { bg: "#181612", surface: "#2a2620", accent: "#f1c044", text: "#f5f2ec" },
    vars: {
      "--bg": "#181612", "--surface": "#221f1a", "--surface-2": "#2a2620", "--surface-3": "#34302a",
      "--border": "rgba(245,232,200,0.08)", "--border-strong": "rgba(245,232,200,0.18)",
      "--text": "#f5f2ec", "--text-muted": "#a89888", "--text-faint": "#6a625a",
      "--accent": "#f1c044", "--accent-fg": "#181612",
      "--accent-soft": "rgba(241,192,68,0.14)", "--accent-on-soft": "#f5d56a",
      "--user-bubble": "#f5f2ec", "--user-bubble-fg": "#181612"
    }
  }
];

// ── History persistence ────────────────────────────────────────────────────
const HISTORY_KEY = "sakkubot.histories.v1";

function loadHistories() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return { resume: [], rules: [] };
    const parsed = JSON.parse(raw);
    return { resume: parsed.resume || [], rules: parsed.rules || [] };
  } catch {
    return { resume: [], rules: [] };
  }
}

function deriveTitle(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "گفتگوی تازه";
  const t = firstUser.text || "";
  return t.length > 48 ? t.slice(0, 48).trim() + "…" : t;
}

// ── Custom theme picker (rendered inside <TweaksPanel>) ────────────────────
// Two-col grid of swatch buttons. Each chip shows the theme's bg as the hero
// surface with the accent fill in the bottom-right corner, mirroring how the
// chrome actually looks. The label sits below in the panel's text color so
// it stays readable regardless of which theme is active.
function ThemePicker({ themes, value, onChange }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "8px",
      marginTop: "2px"
    }}>
      {themes.map((th) => {
        const active = th.id === value;
        return (
          <button
            key={th.id}
            type="button"
            onClick={() => onChange(th.id)}
            title={th.name}
            style={{
              appearance: "none",
              padding: "6px",
              border: 0,
              borderRadius: "10px",
              background: "transparent",
              boxShadow: active
                ? "0 0 0 1.5px rgba(0,0,0,.85)"
                : "0 0 0 .5px rgba(0,0,0,.14)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              cursor: "pointer",
              transition: "box-shadow .15s, transform .12s"
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.boxShadow = "0 0 0 .5px rgba(0,0,0,.3)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.boxShadow = "0 0 0 .5px rgba(0,0,0,.14)";
            }}
          >
            {/* Swatch — bg fills, accent dot at corner, mini-text shows contrast */}
            <div style={{
              position: "relative",
              height: "44px",
              borderRadius: "6px",
              background: th.preview.bg,
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              padding: "0 8px"
            }}>
              <div style={{
                width: "16px",
                height: "16px",
                borderRadius: "999px",
                background: th.preview.accent,
                boxShadow: "0 0 0 .5px rgba(0,0,0,.12)"
              }} />
              <div style={{ flex: 1 }} />
              <div style={{
                width: "22px",
                height: "8px",
                borderRadius: "2px",
                background: th.preview.text,
                opacity: 0.85
              }} />
              {/* Surface accent stripe at bottom */}
              <div style={{
                position: "absolute",
                left: 0, right: 0, bottom: 0,
                height: "10px",
                background: th.preview.surface
              }} />
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "4px",
              fontSize: "11px",
              fontWeight: 500,
              color: "rgba(41,38,27,.85)",
              textAlign: "right"
            }}>
              <span style={{
                width: "8px", height: "8px", borderRadius: "999px",
                background: th.mode === "dark" ? "#0a0a0a" : "#fff",
                boxShadow: "0 0 0 .5px rgba(0,0,0,.2)",
                flexShrink: 0
              }} />
              <span style={{ flex: 1, textAlign: "right" }}>{th.name}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState("home");
  const [activeBot, setActiveBot] = React.useState(null);
  const [activeSessionId, setActiveSessionId] = React.useState(null);
  // sessionVersion bumps when the user clicks "گفتگوی جدید" while already on a
  // null-session screen — used as part of the Chat key so React tears down
  // and remounts even though activeSessionId hasn't changed.
  const [sessionVersion, setSessionVersion] = React.useState(0);
  const [histories, setHistories] = React.useState(loadHistories);

  // The id under which the current chat is persisting. We don't create a session
  // until the user actually sends a message, so this lives in a ref so the very
  // first onMessages callback (during the same React tick that creates state)
  // sees the value we just wrote.
  const currentSessionIdRef = React.useRef(null);

  // Apply theme by writing CSS vars directly onto :root. data-mode is kept as
  // an attribute hook for the rare case a child wants to switch behavior on
  // "is this a dark theme" (e.g. inverted icon).
  React.useEffect(() => {
    const theme = THEMES.find((th) => th.id === t.themeId) || THEMES[0];
    const root = document.documentElement;
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.setAttribute("data-mode", theme.mode);
  }, [t.themeId]);

  // Persist histories on change.
  React.useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(histories));
    } catch {}
  }, [histories]);

  // ── Routing/session actions ────────────────────────────────────────────
  const openBot = (botId) => {
    setActiveBot(botId);
    setActiveSessionId(null);
    currentSessionIdRef.current = null;
    setSessionVersion((v) => v + 1);
    setScreen("chat");
  };

  const goHome = () => {
    setScreen("home");
    setActiveBot(null);
    setActiveSessionId(null);
    currentSessionIdRef.current = null;
  };

  const newSession = () => {
    setActiveSessionId(null);
    currentSessionIdRef.current = null;
    setSessionVersion((v) => v + 1);
  };

  const selectSession = (sessionId) => {
    setActiveSessionId(sessionId);
    currentSessionIdRef.current = sessionId;
    setSessionVersion((v) => v + 1);
  };

  const deleteSession = (botId, sessionId) => {
    setHistories((prev) => ({
      ...prev,
      [botId]: (prev[botId] || []).filter((s) => s.id !== sessionId)
    }));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      currentSessionIdRef.current = null;
      setSessionVersion((v) => v + 1);
    }
  };

  // Called by Chat whenever its messages list changes. Empty arrays are
  // ignored so just opening a fresh chat doesn't pollute history.
  // useCallback with [activeBot] keeps the reference stable during a session
  // so Chat's useEffect doesn't loop on every setHistories call.
  const onMessagesChange = React.useCallback((msgs) => {
    if (!activeBot || !msgs || msgs.length === 0) return;
    const botId = activeBot;
    const now = new Date().toISOString();
    if (!currentSessionIdRef.current) {
      const newId = String(Date.now());
      currentSessionIdRef.current = newId;
      const session = {
        id: newId,
        title: deriveTitle(msgs),
        messages: msgs,
        createdAt: now,
        updatedAt: now
      };
      setHistories((prev) => ({
        ...prev,
        [botId]: [session, ...(prev[botId] || [])]
      }));
      setActiveSessionId(newId);
    } else {
      const sid = currentSessionIdRef.current;
      setHistories((prev) => ({
        ...prev,
        [botId]: (prev[botId] || []).map((s) =>
          s.id === sid
            ? { ...s, messages: msgs, title: deriveTitle(msgs), updatedAt: now }
            : s
        )
      }));
    }
  }, [activeBot]);

  // ── Resolve initial messages for the Chat key ──────────────────────────
  const initialMessages = React.useMemo(() => {
    if (!activeBot || !activeSessionId) return [];
    const session = (histories[activeBot] || []).find((s) => s.id === activeSessionId);
    return session ? session.messages : [];
  // We intentionally only re-resolve when the visible session identity changes —
  // updates to histories[activeBot][i].messages should not yank the running
  // Chat back to its initial state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBot, activeSessionId, sessionVersion]);

  return (
    <>
      {screen === "home" && <Selector bots={BOTS} onPick={openBot} />}
      {screen === "chat" && activeBot && (
        <Chat
          key={`${activeBot}-${sessionVersion}`}
          bot={BOTS[activeBot]}
          initialMessages={initialMessages}
          onMessagesChange={onMessagesChange}
          sessions={histories[activeBot] || []}
          activeSessionId={activeSessionId}
          onBack={goHome}
          onNewSession={newSession}
          onSelectSession={selectSession}
          onDeleteSession={(sid) => deleteSession(activeBot, sid)}
        />
      )}

      <TweaksPanel title="تنظیمات نمایش">
        <TweakSection label="پوسته" />
        <ThemePicker
          themes={THEMES}
          value={t.themeId}
          onChange={(v) => setTweak("themeId", v)}
        />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
