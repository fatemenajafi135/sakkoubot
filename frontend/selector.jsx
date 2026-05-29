// selector.jsx — bot picker landing page
// Hero is the brand itself: huge "سکوبات" with the role tagline below.
// Two large bot cards side-by-side (stack on mobile). Each card hover-lifts.

const SELECTOR_CSS = `
.sel-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: var(--pad-page);
  position: relative;
  z-index: 1;
}

.sel-topbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-bottom: clamp(20px, 4vh, 40px);
  min-height: 32px;
}
.sel-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}
.sel-meta .dot {
  display: inline-block;
  width: 7px; height: 7px;
  background: var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 0 4px var(--accent-soft);
}

/* ── Hero — the brand IS the headline ─────────────────────────────── */
.sel-hero {
  max-width: 820px;
  margin: 0 auto clamp(40px, 7vh, 72px);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.sel-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
.sel-eyebrow b {
  color: var(--text);
  font-weight: 600;
}
.sel-title {
  font-family: 'Vazirmatn', sans-serif;
  font-size: clamp(72px, 14vw, 168px);
  font-weight: 800;
  line-height: 0.95;
  letter-spacing: -0.04em;
  margin: 0;
  color: var(--text);
}
.sel-title-accent {
  color: var(--accent-on-soft);
}
.sel-sub {
  font-family: 'Vazirmatn', sans-serif;
  font-size: clamp(18px, 2.4vw, 26px);
  font-weight: 500;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
  letter-spacing: -0.01em;
}

/* ── Cards ─────────────────────────────────────────────────────────── */
.sel-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  max-width: 980px;
  width: 100%;
  margin: 0 auto;
}
@media (max-width: 720px) {
  .sel-cards { grid-template-columns: 1fr; }
}

.sel-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 28px;
  border-radius: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  text-align: right;
  color: inherit;
  cursor: pointer;
  transition: transform .25s cubic-bezier(.2,.7,.2,1), border-color .2s, box-shadow .25s;
  overflow: hidden;
  isolation: isolate;
  font-family: inherit;
}
.sel-card::before {
  content: "";
  position: absolute; inset: 0;
  background: radial-gradient(circle at 100% 0%, var(--accent-soft) 0%, transparent 40%);
  opacity: 0;
  transition: opacity .3s;
  z-index: -1;
}
.sel-card:hover {
  transform: translateY(-3px);
  border-color: var(--border-strong);
  box-shadow: 0 8px 24px -8px rgba(0,0,0,0.25);
}
.sel-card:hover::before { opacity: 1; }
.sel-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.sel-card-head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.sel-glyph {
  width: 56px; height: 56px;
  flex-shrink: 0;
  border-radius: 14px;
  display: grid; place-items: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
  transition: background .25s, color .25s, border-color .25s;
}
.sel-card:hover .sel-glyph {
  background: var(--accent);
  color: var(--accent-fg);
  border-color: var(--accent);
}
.sel-card-meta { flex: 1; min-width: 0; }
.sel-card-name {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
  margin: 0 0 4px;
}
.sel-card-sub {
  color: var(--text-muted);
  font-size: 14px;
  margin: 0;
}

.sel-card-blurb {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.85;
  margin: 0;
}

.sel-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 18px;
  border-top: 1px dashed var(--border);
}
.sel-card-stats {
  display: flex;
  gap: 18px;
  font-size: 12px;
  color: var(--text-faint);
}
.sel-card-stats b {
  color: var(--text);
  font-weight: 700;
  font-size: 14px;
  margin-inline-end: 2px;
}
.sel-card-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  color: var(--text);
}
.sel-card-cta svg {
  width: 14px; height: 14px;
  transition: transform .2s;
}
[dir="rtl"] .sel-card-cta svg { transform: scaleX(-1); }
[dir="rtl"] .sel-card:hover .sel-card-cta svg { transform: scaleX(-1) translateX(4px); }

.sel-footer {
  margin-top: auto;
  padding-top: clamp(24px, 4vh, 48px);
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
  letter-spacing: 0.02em;
}
.sel-footer b {
  color: var(--text-muted);
  font-weight: 600;
}
`;

const API_BASE = "http://localhost:8000";

function toPersianDigits(n) {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

function Selector({ bots, onPick }) {
  const [docCounts, setDocCounts] = React.useState({ resume: null, rules: null });

  React.useEffect(() => {
    ["resume", "rules"].forEach((type) => {
      fetch(`${API_BASE}/bots/active/${type}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data && data.document_count != null) {
            setDocCounts((prev) => ({ ...prev, [type]: data.document_count }));
          }
        })
        .catch(() => {});
    });
  }, []);

  const STAT_LABEL = { resume: "رزومه", rules: "سند" };

  const statValue = (type) =>
    docCounts[type] == null ? "—" : toPersianDigits(docCounts[type]);

  return (
    <>
      <style>{SELECTOR_CSS}</style>
      <div className="sel-page" data-screen-label="01 Bot Selector">

        <header className="sel-topbar">
          <div className="sel-meta">
            <span className="dot"></span>
            <span>پارک علمی و فناوری گیلان</span>
          </div>
        </header>

        <section className="sel-hero">
          <div className="sel-eyebrow">
            <b>SakkouBot</b>
            <span>·</span>
            <span>دستیار هوشمند</span>
          </div>
          <h1 className="sel-title">
            <span>سکو</span><span className="sel-title-accent">بات</span>
          </h1>
          <p className="sel-sub">دستیاری برای مرکز رشد، پارک علمی و فناوری گیلان و فضای کار اشتراکی سکو</p>
        </section>

        <div className="sel-cards" role="list">
          {Object.values(bots).map((b) => (
            <button
              key={b.id}
              type="button"
              className="sel-card"
              role="listitem"
              onClick={() => onPick(b.id)}
              aria-label={`گفتگو با ${b.name}`}
            >
              <div className="sel-card-head">
                <div className="sel-glyph">{b.glyph}</div>
                <div className="sel-card-meta">
                  <h2 className="sel-card-name">{b.name}</h2>
                  <p className="sel-card-sub">{b.sub}</p>
                </div>
              </div>

              <p className="sel-card-blurb">{b.blurb}</p>

              <div className="sel-card-foot">
                <div className="sel-card-stats">
                  <span>
                    <b>{statValue(b.id)}</b>{STAT_LABEL[b.id]}
                  </span>
                </div>
                <span className="sel-card-cta">
                  شروع گفتگو
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </span>
              </div>
            </button>
          ))}
        </div>

        <footer className="sel-footer">
          Powered by <b>Sakkou</b>'s members
        </footer>
      </div>
    </>
  );
}

window.Selector = Selector;
