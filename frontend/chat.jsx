// chat.jsx — chat screen with history sidebar
//
// Structure:
//   ┌─ header ────────────────────────────────────────────┐
//   ├─ main (flex row, RTL) ──────────────────────────────┤
//   │  ┌─ sidebar (right) ─┐  ┌─ chat content (left) ─────┤
//   │  │  session list     │  │  scroll                   │
//   │  └───────────────────┘  │  composer                 │
//   └───────────────────────────────────────────────────────┘
//
// On mobile the sidebar collapses behind a toggle button in the header and
// slides in as an overlay drawer.
//
// Messages are persisted upstream via onMessagesChange — the parent App owns
// the full history map and decides when to create vs update a session.

const CHAT_CSS = `
.chat-page {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
  overflow: hidden;
}

/* ── Header ──────────────────────────────────────────────────────────── */
.chat-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  padding: 12px clamp(14px, 2.4vw, 24px);
  border-bottom: 1px solid var(--border);
  background: color-mix(in oklab, var(--bg) 88%, transparent);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  backdrop-filter: blur(12px) saturate(140%);
  position: relative;
  z-index: 30;
  flex-shrink: 0;
}
.chat-h-side { display: flex; align-items: center; gap: 8px; }
.chat-h-side.start { justify-self: start; }
.chat-h-side.end { justify-self: end; }

.chat-h-btn {
  appearance: none;
  height: 36px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  transition: background .15s, border-color .15s;
}
.chat-h-btn:hover { background: var(--surface); border-color: var(--border-strong); }
.chat-h-btn svg { width: 14px; height: 14px; }
.chat-h-btn.icon { width: 36px; padding: 0; justify-content: center; }

.chat-h-toggle { display: none; }
@media (max-width: 920px) {
  .chat-h-toggle { display: inline-flex; }
}
@media (max-width: 560px) {
  .chat-h-btn .lbl { display: none; }
  .chat-h-btn:not(.bot-id) { width: 36px; padding: 0; justify-content: center; }
}

.chat-h-bot {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.chat-h-glyph {
  width: 36px; height: 36px;
  border-radius: 10px;
  display: grid; place-items: center;
  background: var(--accent);
  color: var(--accent-fg);
  font-weight: 700;
  font-size: 16px;
  flex-shrink: 0;
}
.chat-h-name { font-weight: 600; font-size: 15px; line-height: 1.2; white-space: nowrap; }
.chat-h-sub {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 5px;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.chat-h-sub::before {
  content: "";
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
@media (max-width: 480px) {
  .chat-h-sub { display: none; }
  .chat-h-name { font-size: 14px; }
}

/* ── Main split: sidebar + content ───────────────────────────────────── */
.chat-main {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
}

.chat-sidebar {
  width: 280px;
  flex-shrink: 0;
  border-inline-end: 1px solid var(--border);
  background: var(--bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 20;
}
@media (max-width: 920px) {
  .chat-sidebar {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    width: min(320px, 86%);
    transform: translateX(100%); /* RTL: hidden by sliding to the right */
    transition: transform .25s cubic-bezier(.2,.7,.2,1);
    box-shadow: 0 0 0 1px var(--border), -8px 0 32px -8px rgba(0,0,0,0.25);
  }
  [dir="rtl"] .chat-sidebar { transform: translateX(100%); }
  .chat-sidebar.open { transform: translateX(0); }
}
.chat-sidebar-backdrop {
  display: none;
}
@media (max-width: 920px) {
  .chat-sidebar-backdrop.show {
    display: block;
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 15;
    animation: fade-in .2s;
  }
}
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

.chat-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  flex-shrink: 0;
}
.chat-sidebar-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-muted);
}
.chat-sidebar-count {
  font-size: 11px;
  color: var(--text-faint);
  background: var(--surface);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-weight: 600;
}

.chat-sidebar-new {
  margin: 0 14px 10px;
  appearance: none;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 10px;
  background: var(--accent);
  color: var(--accent-fg);
  border: 0;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  transition: transform .12s, opacity .15s;
  flex-shrink: 0;
}
.chat-sidebar-new:hover { transform: translateY(-1px); }
.chat-sidebar-new svg { width: 14px; height: 14px; }

.chat-sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.chat-sidebar-empty {
  padding: 32px 18px;
  text-align: center;
  color: var(--text-faint);
  font-size: 12.5px;
  line-height: 1.8;
}
.chat-sidebar-empty svg {
  width: 28px; height: 28px;
  margin-bottom: 10px;
  opacity: 0.5;
  display: inline-block;
}

.chat-session {
  appearance: none;
  position: relative;
  padding: 10px 12px;
  background: transparent;
  border: 0;
  border-radius: 8px;
  text-align: right;
  font-family: inherit;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 3px;
  transition: background .12s;
}
.chat-session:hover { background: var(--surface); }
.chat-session.active {
  background: var(--surface-2);
  box-shadow: inset 2px 0 0 var(--accent);
}
[dir="rtl"] .chat-session.active { box-shadow: inset -2px 0 0 var(--accent); }
.chat-session-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
  padding-inline-end: 22px;
}
.chat-session-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: 0.01em;
}
.chat-session-count {
  background: var(--surface-2);
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-weight: 500;
}
.chat-session.active .chat-session-count {
  background: var(--surface-3);
}
.chat-session-del {
  position: absolute;
  top: 8px;
  inset-inline-end: 8px;
  width: 22px; height: 22px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: var(--text-faint);
  display: grid; place-items: center;
  opacity: 0;
  transition: opacity .12s, background .12s, color .12s;
}
.chat-session:hover .chat-session-del,
.chat-session:focus-within .chat-session-del { opacity: 1; }
.chat-session-del:hover { background: var(--surface-3); color: var(--text); }
.chat-session-del svg { width: 11px; height: 11px; }

/* ── Chat content (right of sidebar in RTL flow → visually on the left) ── */
.chat-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
}
.chat-thread {
  max-width: 780px;
  margin: 0 auto;
  padding: clamp(16px, 4vw, 32px) clamp(16px, 3vw, 28px) 24px;
  display: flex;
  flex-direction: column;
  gap: var(--msg-gap);
}

/* ── Empty state ──────────────────────────────────────────────────── */
.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: clamp(40px, 8vh, 64px) 16px 24px;
  gap: 14px;
}
.chat-empty-glyph {
  width: 60px; height: 60px;
  border-radius: 16px;
  background: var(--accent);
  color: var(--accent-fg);
  display: grid; place-items: center;
  font-size: 28px;
  font-weight: 700;
  box-shadow: 0 0 0 8px var(--accent-soft);
  margin-bottom: 6px;
}
.chat-empty-title {
  font-family: 'Vazirmatn', sans-serif;
  font-size: 26px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.01em;
}
.chat-empty-sub {
  color: var(--text-muted);
  font-size: 15px;
  margin: 0;
  max-width: 460px;
  line-height: 1.75;
}
.chat-suggests {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  max-width: 640px;
  margin-top: 24px;
}
@media (max-width: 520px) {
  .chat-suggests { grid-template-columns: 1fr; }
}
.chat-suggest {
  appearance: none;
  text-align: right;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px 16px;
  color: var(--text);
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.7;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  transition: background .15s, border-color .15s, transform .12s;
}
.chat-suggest:hover {
  background: var(--surface-2);
  border-color: var(--border-strong);
  transform: translateY(-1px);
}
.chat-suggest-arrow {
  flex-shrink: 0;
  width: 18px; height: 18px;
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text-muted);
  display: grid; place-items: center;
  margin-top: 1px;
  transition: background .15s, color .15s;
}
.chat-suggest:hover .chat-suggest-arrow {
  background: var(--accent);
  color: var(--accent-fg);
}
.chat-suggest-arrow svg { width: 10px; height: 10px; }
[dir="rtl"] .chat-suggest-arrow svg { transform: scaleX(-1); }

/* ── Messages ─────────────────────────────────────────────────────── */
.msg {
  display: flex;
  flex-direction: column;
  max-width: 82%;
  gap: 4px;
}
.msg.user { align-self: flex-start; align-items: flex-end; }   /* RTL: right */
.msg.ai   { align-self: flex-end;   align-items: flex-start; } /* RTL: left  */

.msg-bubble {
  padding: var(--bubble-pad-y) var(--bubble-pad-x);
  border-radius: var(--bubble-radius);
  line-height: 1.75;
  word-break: break-word;
  font-size: var(--fs-body);
}
.msg.user .msg-bubble {
  background: var(--user-bubble);
  color: var(--user-bubble-fg);
  border-bottom-right-radius: 6px;
}
.msg.ai .msg-bubble {
  background: transparent;
  color: var(--text);
  padding-inline-start: 0;
  padding-inline-end: 0;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-meta);
  color: var(--text-faint);
  padding: 0 4px;
}
.msg-meta-author { color: var(--text-muted); font-weight: 500; }

/* Markdown bits */
.md p { margin: 0 0 10px; }
.md p:last-child { margin: 0; }
.md strong { font-weight: 700; color: var(--text); }
.md em { font-style: normal; color: var(--accent-on-soft); font-weight: 500; }
.msg.user .md em { color: inherit; opacity: 0.85; }
.md code {
  font-size: 0.92em;
  background: var(--surface-2);
  padding: 1.5px 7px;
  border-radius: 5px;
  border: 1px solid var(--border);
  font-weight: 500;
}
.msg.user .md code {
  background: rgba(255,255,255,0.15);
  border-color: transparent;
}
[data-mode="light"] .msg.user .md code {
  background: rgba(255,255,255,0.15);
}
.md ul { margin: 6px 0 10px; padding-inline-start: 20px; }
.md li { margin-bottom: 4px; }
.md li::marker { color: var(--accent-on-soft); }

/* Typing indicator */
.typing {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 0;
}
.typing span {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: typing-bounce 1.2s infinite ease-in-out;
}
.typing span:nth-child(2) { animation-delay: .15s; }
.typing span:nth-child(3) { animation-delay: .3s; }
@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

/* Streaming caret */
.caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--accent);
  margin-inline-start: 2px;
  vertical-align: -2px;
  animation: caret-blink 1s steps(2) infinite;
}
@keyframes caret-blink { 50% { opacity: 0; } }

/* ── Citations ───────────────────────────────────────────────────── */
.cites {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.cites-head {
  font-size: 11px;
  letter-spacing: 0.01em;
  color: var(--text-faint);
  margin-bottom: 2px;
  display: flex; align-items: center; gap: 6px;
  font-weight: 500;
}
.cites-head::before {
  content: "";
  width: 14px;
  height: 1px;
  background: var(--border-strong);
}
.cite {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  transition: background .15s, border-color .15s;
  cursor: pointer;
  text-align: right;
  font-family: inherit;
}
.cite:hover { background: var(--surface-2); border-color: var(--border-strong); }
.cite-num {
  flex-shrink: 0;
  width: 22px; height: 22px;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--accent-on-soft);
  display: grid; place-items: center;
  font-size: 12px;
  font-weight: 700;
}
.cite-body { flex: 1; min-width: 0; }
.cite-title { font-size: 13px; font-weight: 600; margin: 0 0 2px; color: var(--text); }
.cite-loc {
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}
.cite-score {
  font-size: 12px;
  color: var(--text-muted);
  align-self: center;
  flex-shrink: 0;
  font-weight: 500;
}

/* ── Composer ────────────────────────────────────────────────────── */
.composer-wrap {
  padding: 12px clamp(16px, 3vw, 28px) clamp(14px, 3vw, 20px);
  background: linear-gradient(to top, var(--bg) 70%, transparent);
  position: sticky;
  bottom: 0;
  flex-shrink: 0;
}
.composer {
  max-width: 780px;
  margin: 0 auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 8px;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  transition: border-color .15s, box-shadow .15s;
}
.composer:focus-within {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 4px var(--accent-soft);
}
.composer textarea {
  flex: 1;
  resize: none;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: var(--fs-body);
  line-height: 1.6;
  padding: 8px 10px;
  outline: none;
  max-height: 160px;
  min-height: 24px;
}
.composer textarea::placeholder { color: var(--text-faint); }
.composer-send {
  appearance: none;
  width: 38px; height: 38px;
  border: 0;
  border-radius: 12px;
  background: var(--accent);
  color: var(--accent-fg);
  display: grid; place-items: center;
  transition: opacity .15s, transform .12s;
  flex-shrink: 0;
}
.composer-send:disabled {
  background: var(--surface-3);
  color: var(--text-faint);
  cursor: not-allowed;
}
.composer-send:not(:disabled):hover { transform: scale(1.04); }
.composer-send svg { width: 16px; height: 16px; }
[dir="rtl"] .composer-send svg { transform: scaleX(-1); }

.composer-foot {
  max-width: 780px;
  margin: 6px auto 0;
  padding: 0 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: 0.01em;
}
.composer-foot kbd {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
}
@media (max-width: 560px) {
  .composer-foot { display: none; }
}
`;

// ── Backend API ──────────────────────────────────────────────────────────
const API_BASE = window.SAKKOUBOT_API_BASE || "http://localhost:8000";


// ── Markdown renderer ──────────────────────────────────────────────────
function renderInline(s, keyPrefix = "") {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let m, last = 0;
  const tokens = [];
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) tokens.push({ t: "txt", v: s.slice(last, m.index) });
    const tk = m[0];
    if (tk.startsWith("**")) tokens.push({ t: "b", v: tk.slice(2, -2) });
    else if (tk.startsWith("`")) tokens.push({ t: "c", v: tk.slice(1, -1) });
    else tokens.push({ t: "em", v: tk.slice(1, -1) });
    last = m.index + tk.length;
  }
  if (last < s.length) tokens.push({ t: "txt", v: s.slice(last) });
  tokens.forEach((tk, i) => {
    const k = `${keyPrefix}-${i}`;
    if (tk.t === "b") out.push(<strong key={k}>{tk.v}</strong>);
    else if (tk.t === "c") out.push(<code key={k}>{tk.v}</code>);
    else if (tk.t === "em") out.push(<em key={k}>{tk.v}</em>);
    else out.push(<React.Fragment key={k}>{tk.v}</React.Fragment>);
  });
  return out;
}

function Markdown({ text }) {
  const lines = text.split("\n");
  const blocks = [];
  let buf = [];
  const flushPara = () => {
    if (!buf.length) return;
    blocks.push({ type: "p", lines: buf });
    buf = [];
  };
  let listBuf = null;
  const flushList = () => {
    if (!listBuf) return;
    blocks.push({ type: "ul", items: listBuf });
    listBuf = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^-\s+/.test(line)) {
      flushPara();
      if (!listBuf) listBuf = [];
      listBuf.push(line.replace(/^-\s+/, ""));
    } else if (line === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      buf.push(line);
    }
  }
  flushPara();
  flushList();
  return (
    <div className="md">
      {blocks.map((b, i) =>
        b.type === "ul" ? (
          <ul key={i}>
            {b.items.map((it, j) => <li key={j}>{renderInline(it, `${i}-${j}`)}</li>)}
          </ul>
        ) : (
          <p key={i}>
            {b.lines.map((ln, j) => (
              <React.Fragment key={j}>
                {renderInline(ln, `${i}-${j}`)}
                {j < b.lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        )
      )}
    </div>
  );
}

// ── Time formatting (Persian numerals) ──────────────────────────────────
const FA_DIGITS = ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
const toFa = (s) => String(s).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
function formatTime(input) {
  const d = input instanceof Date ? input : new Date(input);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return toFa(`${hh}:${mm}`);
}
function relativeTime(iso) {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "همین حالا";
  if (mins < 60) return toFa(`${mins} دقیقه پیش`);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return toFa(`${hours} ساعت پیش`);
  const days = Math.floor(hours / 24);
  if (days < 7) return toFa(`${days} روز پیش`);
  const d = new Date(iso);
  return toFa(`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`);
}

// ── Streaming AI message ────────────────────────────────────────────────
// `live` toggles whether to animate. Loaded-from-history messages pass live=false
// and we render the full markdown + citations immediately.
function StreamingMessage({ response, live, onDone }) {
  const [phase, setPhase] = React.useState(live ? "thinking" : "done");
  const [shown, setShown] = React.useState(live ? "" : response.md);
  const doneCalledRef = React.useRef(false);

  React.useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setPhase("streaming");
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [live]);

  React.useEffect(() => {
    if (!live || phase !== "streaming") return;
    let i = 0;
    const full = response.md;
    let timer;
    const step = () => {
      i = Math.min(full.length, i + 2);
      setShown(full.slice(0, i));
      if (i < full.length) {
        const last = full[i - 1];
        const delay = (last === "." || last === "؟" || last === "!" || last === "\n") ? 80 : 14;
        timer = setTimeout(step, delay);
      } else {
        setPhase("done");
        if (!doneCalledRef.current) {
          doneCalledRef.current = true;
          onDone && onDone();
        }
      }
    };
    timer = setTimeout(step, 12);
    return () => clearTimeout(timer);
  }, [phase, response.md, onDone, live]);

  if (phase === "thinking") {
    return (
      <div className="msg-bubble">
        <div className="typing"><span></span><span></span><span></span></div>
      </div>
    );
  }
  return (
    <>
      <div className="msg-bubble">
        <Markdown text={shown} />
        {phase === "streaming" && <span className="caret" />}
      </div>
      {phase === "done" && response.cites?.length > 0 && (
        <Citations cites={response.cites} />
      )}
    </>
  );
}

function Citations({ cites }) {
  return (
    <div className="cites">
      <div className="cites-head">منابع · {toFa(cites.length)} سند</div>
      {cites.map((c, i) => (
        <button key={i} type="button" className="cite">
          <span className="cite-num">{toFa(i + 1)}</span>
          <div className="cite-body">
            <p className="cite-title">{c.title}</p>
            <span className="cite-loc">{c.loc}</span>
          </div>
          <span className="cite-score">~{c.score}</span>
        </button>
      ))}
    </div>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────────────
function Sidebar({ bot, sessions, activeSessionId, onSelect, onNewSession, onDelete, open, onClose }) {
  const count = sessions.length;
  return (
    <aside className={`chat-sidebar ${open ? "open" : ""}`} aria-label="گفتگوهای پیشین">
      <div className="chat-sidebar-head">
        <span className="chat-sidebar-title">گفتگوهای پیشین</span>
        <span className="chat-sidebar-count" title="تعداد گفتگوها">{toFa(count)}</span>
      </div>
      <button type="button" className="chat-sidebar-new" onClick={() => { onNewSession(); onClose && onClose(); }}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
        گفتگوی جدید
      </button>
      <div className="chat-sidebar-list">
        {count === 0 ? (
          <div className="chat-sidebar-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            <div>هنوز گفتگویی با<br/><b style={{color: "var(--text-muted)"}}>{bot.name}</b><br/>ندارید.</div>
          </div>
        ) : (
          sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chat-session ${s.id === activeSessionId ? "active" : ""}`}
              onClick={() => { onSelect(s.id); onClose && onClose(); }}
            >
              <span className="chat-session-title">{s.title || "گفتگوی بدون عنوان"}</span>
              <span className="chat-session-meta">
                <span>{relativeTime(s.updatedAt)}</span>
                <span>·</span>
                <span className="chat-session-count">{toFa(s.messages.length)}</span>
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label="حذف گفتگو"
                className="chat-session-del"
                onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation(); e.preventDefault(); onDelete(s.id);
                  }
                }}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

// ── Chat screen ─────────────────────────────────────────────────────────
function Chat({
  bot,
  initialMessages,
  onMessagesChange,
  sessions,
  activeSessionId,
  onBack,
  onNewSession,
  onSelectSession,
  onDeleteSession
}) {
  const [messages, setMessages] = React.useState(() => initialMessages || []);
  // Only AI messages whose id matches streamingId animate. Old messages
  // (loaded from history or already finished) render full immediately.
  const [streamingId, setStreamingId] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [activeBotId, setActiveBotId] = React.useState(null);
  const [activeBotError, setActiveBotError] = React.useState(null);
  const [draft, setDraft] = React.useState("");
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const scrollRef = React.useRef(null);
  const taRef = React.useRef(null);
  const initialMountRef = React.useRef(true);

  // Fetch the active bot UUID for this bot type on mount
  React.useEffect(() => {
    setActiveBotId(null);
    setActiveBotError(null);
    fetch(`${API_BASE}/bots/active/${bot.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("no_active_bot");
        return res.json();
      })
      .then((data) => setActiveBotId(data.id))
      .catch(() => setActiveBotError(
        `هیچ ربات فعالی برای نوع «${bot.name}» تنظیم نشده است. ابتدا یک ربات بسازید و آن را فعال کنید.`
      ));
  }, [bot.id]);

  // Pipe messages upstream — App owns persistence. Skip first run so we don't
  // immediately echo the initial seed back as a "change".
  React.useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    onMessagesChange(messages);
  }, [messages, onMessagesChange]);

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, []);

  React.useEffect(() => { scrollToBottom(); }, [messages.length, scrollToBottom]);
  React.useEffect(() => {
    if (!streamingId) return;
    const id = setInterval(scrollToBottom, 80);
    return () => clearInterval(id);
  }, [streamingId, scrollToBottom]);

  const send = async (text) => {
    const t = text.trim();
    if (!t || streamingId || loading || !activeBotId) return;

    const now = new Date();
    const userMsg = { id: Date.now(), role: "user", text: t, time: now.toISOString() };

    // Snapshot history BEFORE adding the new user message
    const history = messages.map((m) =>
      m.role === "user"
        ? { role: "user", content: m.text }
        : { role: "assistant", content: m.response?.md || "" }
    );

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";

    let md, cites;
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: t,
          bot_id: activeBotId,
          chat_history: history,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        md = data.answer;
        cites = (data.sources || []).map((s) => ({
          title: s.title,
          loc: s.loc || s.title,
          score: s.score != null ? String(s.score) : null,
        }));
      } else {
        md = `خطا در دریافت پاسخ (کد ${res.status}). لطفاً دوباره تلاش کنید.`;
        cites = [];
      }
    } catch {
      md = "در اتصال به سرور مشکلی پیش آمد. لطفاً مطمئن شوید سرور در حال اجراست.";
      cites = [];
    }

    const aiMsg = {
      id: Date.now() + 1,
      role: "ai",
      response: { md, cites },
      time: new Date().toISOString(),
    };
    setLoading(false);
    setMessages((prev) => [...prev, aiMsg]);
    setStreamingId(aiMsg.id);
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  const onInput = (e) => {
    setDraft(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(160, ta.scrollHeight) + "px";
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      <style>{CHAT_CSS}</style>
      <div className="chat-page" data-screen-label={`02 Chat — ${bot.name}`}>

        <header className="chat-header">
          <div className="chat-h-side start">
            <button type="button" className="chat-h-btn" onClick={onBack} aria-label="بازگشت به انتخاب دستیار">
              {/* Arrow points right — in RTL, "back" navigates to the right */}
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 8H3M9 4l4 4-4 4" />
              </svg>
              <span className="lbl">بازگشت</span>
            </button>
          </div>

          <div className="chat-h-bot bot-id">
            <div className="chat-h-glyph">{bot.glyph}</div>
            <div style={{minWidth: 0}}>
              <div className="chat-h-name">{bot.name}</div>
              <div className="chat-h-sub">{bot.sub}</div>
            </div>
          </div>

          {/* End slot: history toggle only (mobile). New-session lives in the sidebar. */}
          <div className="chat-h-side end">
            <button
              type="button"
              className="chat-h-btn chat-h-toggle"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="نمایش گفتگوهای پیشین"
              aria-expanded={sidebarOpen}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4h12M2 8h12M2 12h8" />
              </svg>
              <span className="lbl">تاریخچه</span>
            </button>
          </div>
        </header>

        <div className="chat-main">
          <Sidebar
            bot={bot}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={onSelectSession}
            onNewSession={onNewSession}
            onDelete={onDeleteSession}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
          <div
            className={`chat-sidebar-backdrop ${sidebarOpen ? "show" : ""}`}
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />

          <section className="chat-content">
            <div className="chat-scroll" ref={scrollRef}>
              {isEmpty ? (
                <div className="chat-empty">
                  <div className="chat-empty-glyph">{bot.glyph}</div>
                  <h2 className="chat-empty-title">{bot.name}</h2>
                  <p className="chat-empty-sub">{bot.blurb}</p>
                  <div className="chat-suggests">
                    {bot.examples.map((ex, i) => (
                      <button key={i} type="button" className="chat-suggest" onClick={() => send(ex)}>
                        <span className="chat-suggest-arrow">
                          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 6h8M7 3l3 3-3 3" />
                          </svg>
                        </span>
                        <span>{ex}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="chat-thread">
                  {messages.map((m) => (
                    <div key={m.id} className={`msg ${m.role}`}>
                      {m.role === "user" ? (
                        <>
                          <div className="msg-bubble">{m.text}</div>
                          <div className="msg-meta">
                            <span>{formatTime(m.time)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <StreamingMessage
                            response={m.response}
                            live={m.id === streamingId}
                            onDone={() => setStreamingId(null)}
                          />
                          <div className="msg-meta">
                            <span className="msg-meta-author">{bot.name}</span>
                            <span>·</span>
                            <span>{formatTime(m.time)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {loading && (
                    <div className="msg ai">
                      <div className="msg-bubble">
                        <div className="typing"><span></span><span></span><span></span></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="composer-wrap">
              <div className="composer">
                <textarea
                  ref={taRef}
                  value={draft}
                  onChange={onInput}
                  onKeyDown={onKey}
                  placeholder={`پیام خود را برای ${bot.name} بنویسید…`}
                  rows={1}
                  dir="rtl"
                />
                <button
                  type="button"
                  className="composer-send"
                  onClick={() => send(draft)}
                  disabled={!draft.trim() || !!streamingId || loading || !activeBotId}
                  aria-label="ارسال پیام"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </button>
              </div>
              <div className="composer-foot">
                {activeBotError
                  ? <span style={{color:"var(--accent)"}}>{activeBotError}</span>
                  : <><span>برای ارسال: <kbd>Enter</kbd> · خط جدید: <kbd>Shift + Enter</kbd></span>
                    <span>پاسخ‌ها از پایگاه دانش بازیابی می‌شوند</span></>
                }
              </div>
            </div>
          </section>
        </div>

      </div>
    </>
  );
}

window.Chat = Chat;
