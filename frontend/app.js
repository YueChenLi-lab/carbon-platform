/* =============================================================
   碳循景 Carbon Circularity Platform — Frontend App
   Plain React (in-browser Babel) + a tiny hand-rolled hash router.
   No build step: this file is transpiled by babel-standalone at
   load time, so it can be opened straight from Flask's static route.
   ============================================================= */
const { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } = React;

const API = ""; // same-origin; Flask serves both API and frontend

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.error || msg; } catch (e) {}
    throw new Error(msg);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

/* ---------------------------------------------------------------
   Tiny hash router
--------------------------------------------------------------- */
function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash.replace(/^#/, "") || "/";
}

function navigate(path) {
  window.location.hash = path;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function matchRoute(pattern, path) {
  const pNames = [];
  const regex = new RegExp(
    "^" + pattern.replace(/:[^/]+/g, (m) => { pNames.push(m.slice(1)); return "([^/]+)"; }) + "$"
  );
  const m = path.match(regex);
  if (!m) return null;
  const params = {};
  pNames.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
  return params;
}

/* ---------------------------------------------------------------
   Toast context
--------------------------------------------------------------- */
const ToastCtx = createContext(null);
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 items-end">
        {toasts.map((t) => (
          <div key={t.id}
            className={"toast-enter card px-4 py-3 flex items-center gap-2 shadow-lg " +
              (t.type === "error" ? "border-red-300" : "")}
            style={{ minWidth: 220 }}>
            <span className="dot" style={{ background: t.type === "error" ? "#c0503f" : "#6FA827" }}></span>
            <span className="text-sm text-[var(--ink)]">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
function useToast() { return useContext(ToastCtx); }

/* ---------------------------------------------------------------
   Count-up number
--------------------------------------------------------------- */
function CountUp({ value, decimals = 0, duration = 1400, suffix = "", prefix = "" }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const from = 0, to = Number(value) || 0;
          function tick(now) {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setDisplay(from + (to - from) * eased);
            if (p < 1) requestAnimationFrame(tick);
            else setDisplay(to);
          }
          requestAnimationFrame(tick);
        }
      });
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);
  return (
    <span ref={ref} className="countup">
      {prefix}{display.toLocaleString("zh-CN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}

/* ---------------------------------------------------------------
   Reveal on scroll wrapper
--------------------------------------------------------------- */
function Reveal({ children, className = "", delay = 0 }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setInView(true); });
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={"reveal " + (inView ? "in " : "") + className}
      style={{ transitionDelay: delay + "ms" }}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------
   Loading / Empty states
--------------------------------------------------------------- */
function Loading({ label = "加载中" }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-[var(--graphite-2)]">
      <div className="w-8 h-8 rounded-full border-2 border-[var(--line-2)] border-t-[var(--ink)] animate-spin"></div>
      <div className="font-mono text-xs tracking-widest uppercase">{label}...</div>
    </div>
  );
}
function SkeletonGrid({ n = 6 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="skeleton w-full aspect-[4/3] mb-4"></div>
          <div className="skeleton h-4 w-2/3 mb-2"></div>
          <div className="skeleton h-3 w-1/3"></div>
        </div>
      ))}
    </div>
  );
}
function EmptyState({ title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3 card">
      <div className="w-12 h-12 rounded-full bg-[var(--paper)] hairline flex items-center justify-center text-xl">◌</div>
      <div className="font-display text-lg">{title}</div>
      {hint && <div className="text-sm text-[var(--graphite-2)] max-w-sm">{hint}</div>}
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------
   Modal
--------------------------------------------------------------- */
function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="modal-backdrop absolute inset-0 bg-[rgba(20,42,32,0.45)] backdrop-blur-sm" onClick={onClose}></div>
      <div className={"modal-panel relative card p-6 w-full " + (wide ? "max-w-2xl" : "max-w-md") + " max-h-[88vh] overflow-y-auto"}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hairline flex items-center justify-center hover:bg-[var(--paper)]">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Swatch — deterministic placeholder art for a product/photo slot
--------------------------------------------------------------- */
const SWATCH_PALETTES = [
  ["#C9C2AC", "#8E9384"], ["#B7C2AE", "#6F7B63"], ["#D6C6A8", "#9C8B63"],
  ["#AEB9AE", "#5C6B57"], ["#CBB89A", "#7C6A4E"], ["#B3BCAE", "#465143"],
];
function Swatch({ seed = 0, className = "" }) {
  const pal = SWATCH_PALETTES[seed % SWATCH_PALETTES.length];
  return (
    <div className={"swatch w-full h-full " + className}
      style={{ background: `linear-gradient(135deg, ${pal[0]}, ${pal[1]})` }}>
    </div>
  );
}

function Img({ src, alt, seed = 0, className = "" }) {
  if (src) return <img src={src} alt={alt} className={className} />;
  return <Swatch seed={seed} className={className} />;
}

/* ---------------------------------------------------------------
   Nav
--------------------------------------------------------------- */
const NAV_ITEMS = [
  { label: "首页", path: "/" },
  { label: "循环地图", path: "/map" },
  { label: "低碳产品", path: "/products" },
  { label: "碳计算", path: "/calculator" },
  { label: "碳身份证", path: "/carbon-id" },
  { label: "我的碳账户", path: "/account" },
  { label: "企业 ESG", path: "/esg" },
  { label: "Agent 助手", path: "/agent" },
];
function NavBar({ route }) {
  const [open, setOpen] = useState(false);
  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] glass hairline-b">
      <div className="max-w-7xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
        <a href="#/" className="flex items-center gap-2 shrink-0">
          <span className="w-8 h-8 rounded-full bg-[var(--ink)] flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--accent)" }}></span>
          </span>
          <span className="font-display text-lg tracking-wide">碳循景</span>
        </a>
        <div className="hidden lg:flex items-center gap-7">
          {NAV_ITEMS.map((it) => (
            <a key={it.path} href={"#" + it.path}
              className={"nav-link " + (route === it.path || (it.path !== "/" && route.startsWith(it.path)) ? "active" : "")}>
              {it.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <a href="#/account" className="btn btn-primary btn-sm hidden sm:inline-flex">个人账户</a>
          <button className="lg:hidden w-9 h-9 rounded-full hairline flex items-center justify-center" onClick={() => setOpen(!open)}>
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>
      {open && (
        <div className="lg:hidden hairline-t bg-[var(--paper-2)] px-5 py-3 flex flex-col gap-3">
          {NAV_ITEMS.map((it) => (
            <a key={it.path} href={"#" + it.path} onClick={() => setOpen(false)}
              className={"nav-link " + (route === it.path ? "active" : "")}>{it.label}</a>
          ))}
          <a href="#/account" onClick={() => setOpen(false)} className="btn btn-primary btn-sm w-fit">个人账户</a>
        </div>
      )}
    </nav>
  );
}

function Footer() {
  return (
    <footer className="hairline-t mt-24 py-12 bg-[var(--paper-2)]">
      <div className="max-w-7xl mx-auto px-5 md:px-8 flex flex-col md:flex-row justify-between gap-8">
        <div>
          <div className="font-display text-lg mb-2">碳循景</div>
          <p className="text-sm text-[var(--graphite-2)] max-w-sm leading-relaxed">
            建筑固废循环利用数字化平台 — 让每一次循环利用都被记录、量化与看见。
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-sm">
          <div className="flex flex-col gap-2">
            <div className="font-mono text-xs text-[var(--graphite-2)] uppercase tracking-widest mb-1">平台</div>
            <a href="#/map" className="nav-link">循环地图</a>
            <a href="#/products" className="nav-link">低碳产品</a>
            <a href="#/calculator" className="nav-link">碳计算器</a>
          </div>
          <div className="flex flex-col gap-2">
            <div className="font-mono text-xs text-[var(--graphite-2)] uppercase tracking-widest mb-1">账户</div>
            <a href="#/account" className="nav-link">我的碳账户</a>
            <a href="#/carbon-id" className="nav-link">碳身份证</a>
          </div>
          <div className="flex flex-col gap-2">
            <div className="font-mono text-xs text-[var(--graphite-2)] uppercase tracking-widest mb-1">企业</div>
            <a href="#/esg" className="nav-link">ESG 数据</a>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-5 md:px-8 mt-10 pt-6 hairline-t text-xs text-[var(--graphite-2)] font-mono">
        © 2026 碳循景 Carbon Circularity Platform · Demo Build
      </div>
    </footer>
  );
}

/* ---------------------------------------------------------------
   Home page
--------------------------------------------------------------- */
const FLOW_STEPS = [
  { key: "demolish", label: "建筑拆除", short: "01", desc: "项目现场产生废弃混凝土、砖块、砂浆等建筑固废，是整个循环体系的起点。" },
  { key: "collect", label: "固废收集", short: "02", desc: "固废按类别分拣装运，运往指定的资源化处理场地，建立可追溯的批次编号。" },
  { key: "sort", label: "分拣处理", short: "03", desc: "人工与机械结合，剔除钢筋、木材等杂质，为破碎筛分做准备。" },
  { key: "aggregate", label: "再生骨料", short: "04", desc: "经过破碎、筛分等处理后重新进入产品生产环节，按粒径分级检测。" },
  { key: "product", label: "低碳产品", short: "05", desc: "再生骨料结合工艺配方，制成兼具功能与美学的城市低碳产品。" },
  { key: "carbon", label: "碳减排核算", short: "06", desc: "通过替代天然骨料、减少传统材料使用等方式形成可量化的减排效益。" },
  { key: "credit", label: "碳积分 / ESG", short: "07", desc: "个人获得绿色积分与碳身份证，企业获得可披露的 ESG 环境数据。" },
];

function ProcessFlow() {
  const [active, setActive] = useState(3);
  return (
    <div>
      <div className="flow-rail relative flex justify-between mb-8 overflow-x-auto pb-2">
        <div className="flow-line"></div>
        {FLOW_STEPS.map((s, i) => (
          <div key={s.key} className={"flow-node flex flex-col items-center gap-3 px-2 min-w-[84px] " + (active === i ? "active" : "")}
            onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
            <div className="flow-dot">{s.short}</div>
            <div className="text-xs text-center text-[var(--graphite)] font-medium leading-tight">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="card p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="font-mono text-3xl text-[var(--line-2)] leading-none">{FLOW_STEPS[active].short}</div>
          <div>
            <div className="font-display text-xl mb-2">{FLOW_STEPS[active].label}</div>
            <p className="text-[var(--graphite)] leading-relaxed max-w-2xl">{FLOW_STEPS[active].desc}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroArt() {
  // Abstract signature graphic: fractured blocks re-assembling into a grid,
  // built from the brand's own material vocabulary (aggregate + city grid).
  return (
    <svg viewBox="0 0 480 480" className="w-full h-auto max-w-md mx-auto" aria-hidden="true">
      <defs>
        <linearGradient id="blockGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1D3B2C" />
          <stop offset="100%" stopColor="#142A20" />
        </linearGradient>
      </defs>
      {/* scattered fragments (left/top) */}
      <g opacity="0.9">
        <rect x="18" y="40" width="46" height="46" rx="4" fill="#CFC9B6" transform="rotate(-12 41 63)"/>
        <rect x="70" y="10" width="30" height="30" rx="4" fill="#DFDACB" transform="rotate(18 85 25)"/>
        <rect x="10" y="110" width="34" height="34" rx="4" fill="#B7C2AE" transform="rotate(8 27 127)"/>
        <circle cx="120" cy="70" r="8" fill="#B7FF3D"/>
      </g>
      {/* re-forming grid (right/bottom) */}
      <g>
        {Array.from({length:4}).map((_,r)=>Array.from({length:4}).map((_,c)=>(
          <rect key={r+'-'+c} x={220 + c*58} y={220 + r*58} width="48" height="48" rx="6"
            fill={(r+c)%3===0 ? "#B7FF3D" : "url(#blockGrad)"}
            opacity={0.35 + ((r+c)%4)*0.16}
          />
        )))}
      </g>
      {/* connecting arc */}
      <path d="M100,140 C 160,220 200,220 240,240" stroke="#6FA827" strokeWidth="2" fill="none" strokeDasharray="2 8" strokeLinecap="round"/>
      <text x="18" y="330" fontFamily="JetBrains Mono, monospace" fontSize="12" fill="#6B716C" letterSpacing="2">FROM DEMOLITION</text>
      <text x="220" y="460" fontFamily="JetBrains Mono, monospace" fontSize="12" fill="#6B716C" letterSpacing="2">TO CIRCULARITY</text>
    </svg>
  );
}

function StatCard({ label, value, decimals, suffix, unitLabel }) {
  return (
    <div className="card p-6">
      <div className="stat-num text-3xl md:text-4xl text-[var(--ink)]">
        <CountUp value={value} decimals={decimals} />{suffix}
      </div>
      <div className="mt-2 text-sm text-[var(--graphite-2)]">{label}</div>
      {unitLabel && <div className="text-xs text-[var(--graphite-2)] font-mono mt-0.5">{unitLabel}</div>}
    </div>
  );
}

function HomePage() {
  const [stats, setStats] = useState(null);
  useEffect(() => { apiFetch("/api/stats").then(setStats).catch(() => {}); }, []);
  return (
    <div>
      {/* Hero */}
      <section className="grain relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28 bg-[var(--ink)] text-[var(--paper)]">
        <div className="max-w-7xl mx-auto px-5 md:px-8 grid md:grid-cols-2 gap-12 items-center relative z-10">
          <div>
            <div className="divider-eyebrow text-[#9FB89E] mb-6">建筑固废循环利用数字化平台</div>
            <h1 className="font-display text-4xl md:text-6xl leading-[1.15] mb-6">
              让建筑垃圾<br/>重新成为城市的一部分
            </h1>
            <p className="text-[#C7D2C4] text-base md:text-lg leading-relaxed max-w-lg mb-8">
              从建筑固废到再生材料，从废弃物到低碳产品，让每一次循环利用都被记录、量化与看见。
            </p>
            <div className="flex flex-wrap gap-4">
              <a href="#/map" className="btn btn-accent">探索循环地图</a>
              <a href="#/products" className="btn" style={{ background: "transparent", color: "var(--paper)", border: "1px solid rgba(246,244,236,0.35)" }}>查看低碳产品</a>
            </div>
          </div>
          <HeroArt />
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 -mt-10 relative z-20">
        <Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="累计处理建筑固废" unitLabel="kg" value={stats ? stats.waste_processed : 12856} />
            <StatCard label="累计再生材料" unitLabel="kg" value={stats ? stats.recycled_material : 8421} />
            <StatCard label="累计减排" unitLabel="kgCO₂e" value={stats ? stats.carbon_reduction : 5326} />
            <StatCard label="参与低碳项目" unitLabel="个" value={stats ? stats.low_carbon_projects : 128} />
          </div>
        </Reveal>
      </section>

      {/* Process flow */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 py-24">
        <Reveal>
          <div className="divider-eyebrow mb-3">CIRCULARITY PIPELINE</div>
          <h2 className="font-display text-3xl md:text-4xl mb-3">建筑垃圾 → 低碳产品</h2>
          <p className="text-[var(--graphite-2)] mb-10 max-w-xl">悬停或点击任意节点，查看该环节的具体流程说明。</p>
          <ProcessFlow />
        </Reveal>
      </section>

      {/* Why */}
      <section className="bg-[var(--paper-2)] hairline-t hairline-b py-24">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <Reveal>
            <div className="divider-eyebrow mb-3">WHY 碳循景</div>
            <h2 className="font-display text-3xl md:text-4xl mb-10">我们为什么做这件事</h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { t: "建筑固废资源化利用", d: "让废弃物重新进入生产循环，减少填埋与自然资源开采。" },
              { t: "碳减排量化", d: "让每一次材料循环都能够被计算，形成可信、可追溯的碳数据。" },
              { t: "碳普惠场景", d: "让个人和企业都能够参与低碳行动，共同建立城市级碳数据基础设施。" },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 80}>
                <div className="card p-8 h-full">
                  <div className="font-mono text-xs text-[var(--graphite-2)] mb-4">0{i + 1}</div>
                  <div className="font-display text-xl mb-3">{c.t}</div>
                  <p className="text-[var(--graphite)] text-sm leading-relaxed">{c.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Narrative closing band */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 py-24">
        <Reveal>
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="divider-eyebrow mb-3">NOT A DECORATION</div>
              <h2 className="font-display text-2xl md:text-3xl leading-relaxed mb-5">
                我们不是简单地把建筑垃圾做成盆景，<br/>而是在建立一套<br/>
                <span style={{ background: "linear-gradient(transparent 60%, var(--accent) 60%)" }}>建筑固废循环利用的数字化碳数据基础设施</span>。
              </h2>
              <div className="flex gap-3">
                <a href="#/esg" className="btn btn-primary">查看企业 ESG</a>
                <a href="#/carbon-id" className="btn btn-ghost">查看碳身份证</a>
              </div>
            </div>
            <div className="card p-6 font-mono text-xs leading-7 text-[var(--graphite)]">
              <div>建筑拆除 → 产生建筑固废</div>
              <div className="pl-4 text-[var(--graphite-2)]">↓ 进入循环体系</div>
              <div>再生骨料 → 生产低碳产品</div>
              <div className="pl-4 text-[var(--graphite-2)]">↓ 每件产品拥有 Carbon ID</div>
              <div>计算碳减排 → 个人获得碳积分</div>
              <div className="pl-4 text-[var(--graphite-2)]">↓ 企业获得 ESG 环境数据</div>
              <div style={{ color: "var(--accent-deep)" }}>未来接入上海碳普惠体系</div>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------
   Map page — stylised Shanghai map (no external map API, per demo scope)
--------------------------------------------------------------- */
// Bounding box roughly covering Shanghai's districts used in seed data
const MAP_BOUNDS = { latMin: 30.85, latMax: 31.32, lngMin: 121.30, lngMax: 122.00 };
function project(lat, lng) {
  const x = ((lng - MAP_BOUNDS.lngMin) / (MAP_BOUNDS.lngMax - MAP_BOUNDS.lngMin)) * 100;
  const y = 100 - ((lat - MAP_BOUNDS.latMin) / (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin)) * 100;
  return { x: Math.min(96, Math.max(4, x)), y: Math.min(94, Math.max(6, y)) };
}

function NewProjectForm({ onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", district: "", address: "", description: "", lat: "31.20", lng: "121.50", status: "进行中", waste_amount: "", recycled_amount: "", recycled_material: "", carbon_reduction: "" });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function onFile(e) {
    const f = e.target.files[0];
    setFile(f);
    if (f) setPreview(URL.createObjectURL(f));
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append("image", file);
      const created = await apiFetch("/api/map/projects", { method: "POST", body: fd });
      toast("项目已上传，已在地图上标出");
      onCreated(created);
    } catch (err) {
      toast("上传失败：" + err.message, "error");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        项目名称
        <input required className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="例如：虹口区 XX 更新项目" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        所属区域
        <input className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.district} onChange={(e) => set("district", e.target.value)} placeholder="例如：虹口区" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        项目状态
        <select className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.status} onChange={(e) => set("status", e.target.value)}>
          <option>进行中</option><option>已完成</option><option>规划中</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        项目地址
        <input className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.address} onChange={(e) => set("address", e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        纬度 (lat)
        <input required type="number" step="0.0001" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.lat} onChange={(e) => set("lat", e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        经度 (lng)
        <input required type="number" step="0.0001" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.lng} onChange={(e) => set("lng", e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        建筑固废产生 (t)
        <input type="number" step="0.1" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.waste_amount} onChange={(e) => set("waste_amount", e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        已循环利用 (t)
        <input type="number" step="0.1" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.recycled_amount} onChange={(e) => set("recycled_amount", e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        再生材料 (t)
        <input type="number" step="0.1" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.recycled_material} onChange={(e) => set("recycled_material", e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        预计减排 (tCO₂e)
        <input type="number" step="0.1" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.carbon_reduction} onChange={(e) => set("carbon_reduction", e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        项目描述
        <textarea rows="2" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.description} onChange={(e) => set("description", e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        项目图片
        <input type="file" accept="image/*" onChange={onFile} className="text-sm" />
        {preview && <img src={preview} alt="预览" className="mt-2 h-32 w-full object-cover rounded-lg hairline" />}
      </label>
      <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
        <button disabled={busy} className="btn btn-primary" type="submit">{busy ? "上传中…" : "提交项目"}</button>
      </div>
    </form>
  );
}

function MapPage() {
  const [projects, setProjects] = useState(null);
  const [active, setActive] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    apiFetch("/api/map/projects").then((data) => {
      setProjects(data);
      if (data.length) setActive(data[0]);
    }).catch(() => setProjects([]));
  }, []);
  useEffect(load, [load]);

  const districts = useMemo(() => {
    if (!projects) return [];
    const seen = {};
    projects.forEach((p) => { seen[p.district] = (seen[p.district] || 0) + 1; });
    return Object.entries(seen);
  }, [projects]);

  return (
    <div className="pt-28 pb-24 max-w-7xl mx-auto px-5 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="divider-eyebrow mb-3">CIRCULARITY MAP · SHANGHAI</div>
          <h1 className="font-display text-3xl md:text-4xl mb-2">上海 · 固废循环地图</h1>
          <p className="text-[var(--graphite-2)]">追踪建筑固废从产生、处理到再生利用的全过程。</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(true)}>+ 管理端 · 添加项目</button>
      </div>

      {projects === null ? <Loading label="加载地图数据" /> : (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* map canvas */}
          <div className="lg:col-span-3 card p-3 md:p-5">
            <div className="relative w-full aspect-square rounded-xl overflow-hidden hairline"
              style={{ background: "linear-gradient(135deg, #EFECDF 0%, #E6E2D1 100%)" }}>
              {/* faux grid lines to read as a data map */}
              <svg className="absolute inset-0 w-full h-full opacity-40">
                {Array.from({ length: 9 }).map((_, i) => (
                  <line key={"h"+i} x1="0" x2="100%" y1={`${(i+1)*10}%`} y2={`${(i+1)*10}%`} stroke="#CFC9B6" strokeWidth="1" />
                ))}
                {Array.from({ length: 9 }).map((_, i) => (
                  <line key={"v"+i} y1="0" y2="100%" x1={`${(i+1)*10}%`} x2={`${(i+1)*10}%`} stroke="#CFC9B6" strokeWidth="1" />
                ))}
              </svg>
              <div className="absolute top-3 left-4 font-mono text-[10px] tracking-widest text-[var(--graphite-2)] uppercase">Shanghai · 31.23N 121.47E</div>

              {projects.map((p) => {
                const pos = project(p.lat, p.lng);
                const isActive = active && active.id === p.id;
                return (
                  <div key={p.id} className="absolute" style={{ left: pos.x + "%", top: pos.y + "%", transform: "translate(-50%,-100%)" }}>
                    <div className={"map-pin " + (isActive ? "active" : "")} onClick={() => setActive(p)}>
                      <svg width="26" height="34" viewBox="0 0 26 34">
                        <path d="M13 0C5.8 0 0 5.7 0 12.8 0 22 13 34 13 34S26 22 26 12.8C26 5.7 20.2 0 13 0Z"
                          fill={isActive ? "#142A20" : "#FCFBF6"} stroke="#142A20" strokeWidth="1.4" />
                        <circle cx="13" cy="13" r="5" fill={isActive ? "#B7FF3D" : "#6FA827"} />
                      </svg>
                    </div>
                    {isActive && (
                      <div className="absolute left-1/2 -translate-x-1/2 -top-1 -translate-y-full whitespace-nowrap font-mono text-[10px] bg-[var(--ink)] text-[var(--paper)] px-2 py-1 rounded-md mb-1">
                        {p.district}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {districts.map(([d, n]) => (
                <span key={d} className="pill"><span className="dot"></span>{d} · {n}</span>
              ))}
            </div>
          </div>

          {/* detail panel */}
          <div className="lg:col-span-2">
            {active ? (
              <div className="card p-6 sticky top-24">
                <Img src={active.image_url} seed={active.id} className="w-full aspect-[4/3] object-cover rounded-lg mb-5" alt={active.name} />
                <span className="pill mb-3">{active.status}</span>
                <h3 className="font-display text-xl mb-1">{active.name}</h3>
                <p className="text-xs text-[var(--graphite-2)] mb-4 font-mono">{active.address}</p>
                <p className="text-sm text-[var(--graphite)] leading-relaxed mb-6">{active.description}</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["建筑固废产生", active.waste_amount, "t"],
                    ["已循环利用", active.recycled_amount, "t"],
                    ["再生材料", active.recycled_material, "t"],
                    ["预计减排", active.carbon_reduction, "tCO₂e"],
                  ].map(([l, v, u]) => (
                    <div key={l} className="hairline rounded-lg p-3 bg-[var(--paper)]">
                      <div className="stat-num text-lg">{v}<span className="text-xs text-[var(--graphite-2)] ml-1">{u}</span></div>
                      <div className="text-xs text-[var(--graphite-2)] mt-1">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <EmptyState title="暂无项目数据" hint="点击右上角管理端添加第一个循环利用项目。" />}
          </div>
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="添加循环利用项目" wide>
        <NewProjectForm onCreated={(p) => { setShowForm(false); load(); }} />
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------------
   Products page
--------------------------------------------------------------- */
function NewProductForm({ onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", subtitle: "", description: "", story: "", price: "", waste_used: "", recycled_aggregate: "", natural_replaced: "", recycled_ratio: "", carbon_reduction: "", source_project: "" });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append("image", file);
      const created = await apiFetch("/api/products", { method: "POST", body: fd });
      toast("产品已上传");
      onCreated(created);
    } catch (err) { toast("上传失败：" + err.message, "error"); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">产品名称
        <input required className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">产品副标题
        <input className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm">价格 (¥)
        <input type="number" step="1" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.price} onChange={(e) => set("price", e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm">再生材料比例 (%)
        <input type="number" step="0.1" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.recycled_ratio} onChange={(e) => set("recycled_ratio", e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm">建筑固废用量 (kg)
        <input type="number" step="0.01" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.waste_used} onChange={(e) => set("waste_used", e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm">再生骨料 (kg)
        <input type="number" step="0.01" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.recycled_aggregate} onChange={(e) => set("recycled_aggregate", e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm">天然材料替代 (kg)
        <input type="number" step="0.01" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.natural_replaced} onChange={(e) => set("natural_replaced", e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm">碳减排 (kgCO₂e)
        <input type="number" step="0.01" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.carbon_reduction} onChange={(e) => set("carbon_reduction", e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">来源项目
        <input className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.source_project} onChange={(e) => set("source_project", e.target.value)} placeholder="例如：杨浦区厂房更新项目" /></label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">产品简介
        <textarea rows="2" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">产品故事
        <textarea rows="3" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.story} onChange={(e) => set("story", e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">产品图片
        <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files[0]; setFile(f); if (f) setPreview(URL.createObjectURL(f)); }} className="text-sm" />
        {preview && <img src={preview} className="mt-2 h-32 w-full object-cover rounded-lg hairline" alt="预览" />}
      </label>
      <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
        <button disabled={busy} className="btn btn-primary" type="submit">{busy ? "上传中…" : "创建产品"}</button>
      </div>
    </form>
  );
}

function ProductCard({ p }) {
  return (
    <a href={"#/products/" + p.id} className="card overflow-hidden flex flex-col group">
      <div className="aspect-[4/3] overflow-hidden">
        <Img src={p.image_url} seed={p.id} alt={p.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
      </div>
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div>
          <div className="font-mono text-[10px] text-[var(--graphite-2)] tracking-widest uppercase mb-1">城市再生</div>
          <div className="font-display text-lg leading-snug">{p.name}</div>
          <div className="text-sm text-[var(--graphite-2)]">{p.subtitle}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-auto pt-2">
          <div className="hairline-t pt-2">
            <div className="stat-num text-base">{p.recycled_ratio}%</div>
            <div className="text-xs text-[var(--graphite-2)]">再生材料</div>
          </div>
          <div className="hairline-t pt-2">
            <div className="stat-num text-base">{p.carbon_reduction}</div>
            <div className="text-xs text-[var(--graphite-2)]">kgCO₂e 减排</div>
          </div>
        </div>
        <div className="flex items-center justify-between pt-2">
          <span className="font-mono text-[var(--ink)] font-semibold">¥{p.price}</span>
          <span className="text-sm underline decoration-[var(--line-2)] underline-offset-4 group-hover:decoration-[var(--ink)]">查看详情 →</span>
        </div>
      </div>
    </a>
  );
}

function ProductsPage() {
  const [products, setProducts] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(() => { apiFetch("/api/products").then(setProducts).catch(() => setProducts([])); }, []);
  useEffect(load, [load]);

  return (
    <div className="pt-28 pb-24 max-w-7xl mx-auto px-5 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div>
          <div className="divider-eyebrow mb-3">LOW-CARBON PRODUCTS</div>
          <h1 className="font-display text-3xl md:text-4xl mb-2">低碳产品</h1>
          <p className="text-[var(--graphite-2)]">每一件产品，都是建筑材料循环的一次重新开始。</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(true)}>+ 添加产品</button>
      </div>

      {products === null ? <SkeletonGrid /> : products.length === 0 ? (
        <EmptyState title="暂无产品" hint="点击右上角添加第一件低碳产品。" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((p, i) => (
            <Reveal key={p.id} delay={(i % 3) * 60}><ProductCard p={p} /></Reveal>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="创建低碳产品" wide>
        <NewProductForm onCreated={() => { setShowForm(false); load(); }} />
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------------
   Product detail page (view + inline edit)
--------------------------------------------------------------- */
function ProductDetailPage({ id }) {
  const [product, setProduct] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    setProduct(null);
    apiFetch("/api/products/" + id).then((p) => { setProduct(p); setDraft(p); }).catch(() => setProduct(false));
  }, [id]);
  useEffect(load, [load]);

  async function save() {
    setSaving(true);
    try {
      const updated = await apiFetch("/api/products/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      setProduct(updated); setDraft(updated); setEditing(false);
      toast("产品信息已保存");
    } catch (err) { toast("保存失败：" + err.message, "error"); }
    finally { setSaving(false); }
  }

  async function claim() {
    try {
      await apiFetch("/api/account/claim", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: product.id, product_name: product.name, carbon_reduction: product.carbon_reduction }),
      });
      toast("已加入低碳账户 · +" + Math.round(product.carbon_reduction * 100) + " Green Points");
    } catch (err) { toast("操作失败：" + err.message, "error"); }
  }

  if (product === false) return <div className="pt-32 max-w-3xl mx-auto px-5"><EmptyState title="未找到该产品" hint="它可能已被移除，返回产品列表看看其他选择。" action={<a href="#/products" className="btn btn-primary btn-sm">返回产品列表</a>} /></div>;
  if (product === null) return <div className="pt-32"><Loading label="加载产品详情" /></div>;

  const p = editing ? draft : product;
  const field = (k, cast = (x) => x) => ({
    value: draft[k] ?? "",
    onChange: (e) => setDraft((d) => ({ ...d, [k]: cast(e.target.value) })),
  });

  return (
    <div className="pt-28 pb-24 max-w-6xl mx-auto px-5 md:px-8">
      <a href="#/products" className="text-sm text-[var(--graphite-2)] hover:text-[var(--ink)]">← 返回低碳产品</a>
      <div className="grid md:grid-cols-2 gap-10 mt-6">
        <div>
          <Img src={product.image_url} seed={product.id} alt={product.name} className="w-full aspect-square object-cover rounded-2xl hairline" />
        </div>
        <div>
          <div className="font-mono text-xs text-[var(--graphite-2)] tracking-widest uppercase mb-2">城市再生</div>
          {editing ? (
            <input className="hairline rounded-lg px-3 py-2 bg-[var(--paper)] font-display text-2xl w-full mb-2" {...field("name")} />
          ) : <h1 className="font-display text-3xl mb-2">{p.name}</h1>}
          {editing ? (
            <input className="hairline rounded-lg px-3 py-2 bg-[var(--paper)] text-sm w-full mb-4" {...field("subtitle")} />
          ) : <p className="text-[var(--graphite-2)] mb-4">{p.subtitle}</p>}

          <div className="flex items-center gap-3 mb-6">
            {editing ? (
              <input type="number" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)] w-28 font-mono" {...field("price", Number)} />
            ) : <span className="font-mono text-2xl font-semibold">¥{p.price}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              ["recycled_ratio", "再生材料", "%"],
              ["waste_used", "使用建筑固废", "kg"],
              ["carbon_reduction", "预计减排", "kgCO₂e"],
              ["recycled_aggregate", "再生骨料", "kg"],
            ].map(([k, l, u]) => (
              <div key={k} className="hairline rounded-lg p-3 bg-[var(--paper-2)]">
                {editing ? (
                  <input type="number" step="0.01" className="hairline rounded px-2 py-1 w-full font-mono text-sm bg-[var(--paper)]" {...field(k, Number)} />
                ) : <div className="stat-num text-lg">{p[k]}{u === "%" ? "%" : ""}</div>}
                <div className="text-xs text-[var(--graphite-2)] mt-1">{l}{u !== "%" ? " · " + u : ""}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            {!editing && <button onClick={claim} className="btn btn-accent">加入低碳账户</button>}
            {!editing && <a href={"#/carbon-id/" + product.carbon_id} className="btn btn-ghost">查看碳身份证</a>}
            {editing ? (
              <>
                <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? "保存中…" : "保存"}</button>
                <button onClick={() => { setDraft(product); setEditing(false); }} className="btn btn-ghost">取消</button>
              </>
            ) : <button onClick={() => setEditing(true)} className="btn btn-ghost">编辑产品信息</button>}
          </div>
        </div>
      </div>

      {/* Story */}
      <div className="mt-16 grid md:grid-cols-3 gap-10">
        <div className="md:col-span-2">
          <div className="divider-eyebrow mb-3">产品故事</div>
          {editing ? (
            <textarea rows="6" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)] w-full" {...field("story")} />
          ) : <p className="text-[var(--graphite)] leading-loose whitespace-pre-line">{p.story}</p>}
          <div className="divider-eyebrow mt-8 mb-3">产品简介</div>
          {editing ? (
            <textarea rows="3" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)] w-full" {...field("description")} />
          ) : <p className="text-[var(--graphite)] leading-relaxed">{p.description}</p>}
        </div>

        {/* Carbon data */}
        <div>
          <div className="divider-eyebrow mb-3">产品碳数据</div>
          <div className="flex flex-col gap-3">
            {[
              ["建筑固废利用", p.waste_used, "kg"],
              ["再生骨料", p.recycled_aggregate, "kg"],
              ["天然材料替代", p.natural_replaced, "kg"],
              ["碳减排", p.carbon_reduction, "kgCO₂e"],
            ].map(([l, v, u]) => (
              <div key={l} className="card p-4 flex items-center justify-between">
                <span className="text-sm text-[var(--graphite)]">{l}</span>
                <span className="stat-num">{v} <span className="text-xs text-[var(--graphite-2)]">{u}</span></span>
              </div>
            ))}
          </div>
          <div className="mt-4 pill w-fit">来源项目 · {p.source_project}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Calculator page
--------------------------------------------------------------- */
const WASTE_TYPES = ["废弃混凝土", "废弃砖块", "废弃砂浆", "混合建筑固废"];
const PRODUCT_TYPES = ["再生骨料微景观", "再生砖摆件", "再生花器", "模块化砖块", "桌面微地形"];

function DonutChart({ data, colors, id }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || typeof Chart === "undefined") return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: data.map((d) => d.label),
        datasets: [{ data: data.map((d) => Math.max(0.001, d.value)), backgroundColor: colors, borderColor: "#FCFBF6", borderWidth: 3 }],
      },
      options: {
        cutout: "68%",
        plugins: { legend: { display: false } },
        animation: { animateRotate: true, duration: 900 },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [JSON.stringify(data)]);
  return <canvas ref={canvasRef} id={id}></canvas>;
}

function LineChart({ labels, values, id }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || typeof Chart === "undefined") return;
    if (chartRef.current) chartRef.current.destroy();
    const ctx = canvasRef.current.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 220);
    grad.addColorStop(0, "rgba(183,255,61,0.35)");
    grad.addColorStop(1, "rgba(183,255,61,0.02)");
    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: values, borderColor: "#142A20", backgroundColor: grad, fill: true, tension: 0.35,
          pointBackgroundColor: "#142A20", pointRadius: 4, borderWidth: 2,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: "#E1DDCF" }, ticks: { font: { family: "JetBrains Mono" } } },
          x: { grid: { display: false }, ticks: { font: { family: "JetBrains Mono" } } },
        },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [JSON.stringify(values)]);
  return <canvas ref={canvasRef} id={id}></canvas>;
}

function CalculatorPage() {
  const [form, setForm] = useState({ productType: PRODUCT_TYPES[0], weight: 2.5, ratio: 70, wasteType: WASTE_TYPES[0], distance: 18 });
  const [result, setResult] = useState(null);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function compute(e) {
    e.preventDefault();
    const weight = Number(form.weight) || 0;
    const ratio = Number(form.ratio) || 0;
    const distance = Number(form.distance) || 0;
    const wasteUsed = +(weight * (ratio / 100)).toFixed(2);
    const natural = +(wasteUsed * 0.35).toFixed(2);
    const traditional = +(wasteUsed * 0.18).toFixed(2);
    const carbonation = +(wasteUsed * 0.09).toFixed(2);
    const transport = +(distance * 0.01).toFixed(2);
    const total = +(natural + traditional + carbonation - transport).toFixed(2);
    setResult({ wasteUsed, natural, traditional, carbonation, transport, total: Math.max(0, total) });
  }

  return (
    <div className="pt-28 pb-24 max-w-6xl mx-auto px-5 md:px-8">
      <div className="mb-10">
        <div className="divider-eyebrow mb-3">CARBON CALCULATOR</div>
        <h1 className="font-display text-3xl md:text-4xl mb-2">计算你的低碳行动</h1>
        <p className="text-[var(--graphite-2)]">输入产品与材料信息，估算本次循环利用产生的碳减排效益。</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-8">
        <form onSubmit={compute} className="lg:col-span-2 card p-6 flex flex-col gap-4 h-fit">
          <label className="flex flex-col gap-1 text-sm">产品类型
            <select className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.productType} onChange={(e) => set("productType", e.target.value)}>
              {PRODUCT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">产品重量 (kg)
            <input type="number" step="0.1" min="0" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)] font-mono" value={form.weight} onChange={(e) => set("weight", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">再生材料比例 (%)
            <input type="range" min="0" max="100" value={form.ratio} onChange={(e) => set("ratio", e.target.value)} className="accent-[var(--ink)]" />
            <div className="font-mono text-sm text-right">{form.ratio}%</div>
          </label>
          <label className="flex flex-col gap-1 text-sm">建筑固废类型
            <select className="hairline rounded-lg px-3 py-2 bg-[var(--paper)]" value={form.wasteType} onChange={(e) => set("wasteType", e.target.value)}>
              {WASTE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">运输距离 (km)
            <input type="number" step="1" min="0" className="hairline rounded-lg px-3 py-2 bg-[var(--paper)] font-mono" value={form.distance} onChange={(e) => set("distance", e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary mt-2">开始计算</button>
        </form>

        <div className="lg:col-span-3">
          {!result ? (
            <EmptyState title="等待计算" hint="填写左侧参数并点击「开始计算」，查看本次循环利用的碳减排估算结果。" />
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="card p-6 flex flex-col gap-3">
                {[
                  ["本次建筑固废利用", result.wasteUsed, "kg"],
                  ["替代天然骨料", result.natural, "kgCO₂e"],
                  ["传统材料替代", result.traditional, "kgCO₂e"],
                  ["运输环节", result.transport, "kgCO₂e"],
                  ["材料碳化", result.carbonation, "kgCO₂e"],
                ].map(([l, v, u]) => (
                  <div key={l} className="flex items-center justify-between hairline-b pb-3">
                    <span className="text-sm text-[var(--graphite)]">{l}</span>
                    <span className="stat-num">{v} <span className="text-xs text-[var(--graphite-2)]">{u}</span></span>
                  </div>
                ))}
                <div className="mt-3 rounded-xl p-5" style={{ background: "var(--ink)", color: "var(--paper)" }}>
                  <div className="text-xs opacity-70 mb-1">综合减排</div>
                  <div className="stat-num text-4xl" style={{ color: "var(--accent)" }}>{result.total}</div>
                  <div className="text-xs opacity-70 mt-1">kgCO₂e</div>
                </div>
              </div>
              <div className="card p-6 flex flex-col">
                <div className="text-sm text-[var(--graphite-2)] mb-3">减排构成</div>
                <div className="relative flex-1 min-h-[220px]">
                  <DonutChart id="calcDonut"
                    data={[
                      { label: "天然骨料替代", value: result.natural },
                      { label: "传统材料替代", value: result.traditional },
                      { label: "运输", value: result.transport },
                      { label: "碳化", value: result.carbonation },
                    ]}
                    colors={["#B7FF3D", "#6FA827", "#C98A3E", "#1D3B2C"]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                  {[["天然骨料替代", "#B7FF3D"], ["传统材料替代", "#6FA827"], ["运输", "#C98A3E"], ["碳化", "#1D3B2C"]].map(([l, c]) => (
                    <div key={l} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }}></span>{l}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-[var(--graphite-2)] mt-4 font-mono">* Demo 阶段计算模型基于简化系数，仅用于产品演示，不作为正式碳核算依据。</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Carbon ID page
--------------------------------------------------------------- */
function CarbonIdPage({ cid }) {
  const [product, setProduct] = useState(null);
  useEffect(() => {
    setProduct(null);
    const loadDemo = () => apiFetch("/api/products/1").then(setProduct).catch(() => setProduct(false));
    if (!cid || cid === "demo") { loadDemo(); return; }
    apiFetch("/api/carbon/" + encodeURIComponent(cid)).then(setProduct).catch(loadDemo);
  }, [cid]);

  if (product === false) return <div className="pt-32 max-w-3xl mx-auto px-5"><EmptyState title="未找到该碳身份证" /></div>;
  if (product === null) return <div className="pt-32"><Loading label="加载碳身份证" /></div>;

  const carbonation = +(product.carbon_reduction * 0.15).toFixed(2);
  const lifecycle = +(product.carbon_reduction - carbonation).toFixed(2);
  const qrData = encodeURIComponent(window.location.origin + window.location.pathname + "#/carbon-id/" + product.carbon_id);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&color=142A20&bgcolor=FCFBF6&data=${qrData}`;
  const timeline = product.timeline && product.timeline.length ? product.timeline : [];

  return (
    <div className="pt-28 pb-24 max-w-5xl mx-auto px-5 md:px-8">
      <div className="mb-10">
        <div className="divider-eyebrow mb-3">PRODUCT CARBON ID</div>
        <h1 className="font-display text-3xl md:text-4xl mb-2">产品碳身份证</h1>
        <p className="text-[var(--graphite-2)]">每一件低碳产品，都拥有一份可追溯的碳数据。</p>
      </div>

      <div className="card p-0 overflow-hidden mb-10">
        <div className="grain p-8 md:p-10" style={{ background: "var(--ink)", color: "var(--paper)" }}>
          <div className="flex flex-wrap justify-between items-start gap-6">
            <div>
              <div className="font-mono text-xs tracking-widest opacity-60 mb-2">CARBON ID</div>
              <div className="font-mono text-2xl md:text-3xl" style={{ color: "var(--accent)" }}>{product.carbon_id}</div>
              <div className="mt-4 font-display text-xl">{product.name} · {product.subtitle}</div>
              <div className="text-sm opacity-70 mt-1">建筑固废来源：{product.source_project}</div>
            </div>
            <img src={qrUrl} alt="Carbon ID QR" width="120" height="120" className="rounded-lg bg-[var(--paper-2)] p-1" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-[var(--line)]">
          {[
            ["使用再生骨料", product.recycled_aggregate, "kg"],
            ["再生材料占比", product.recycled_ratio, "%"],
            ["生命周期减排", lifecycle, "kgCO₂e"],
            ["材料碳化固定", carbonation, "kgCO₂"],
            ["综合减排", product.carbon_reduction, "kgCO₂e"],
          ].map(([l, v, u]) => (
            <div key={l} className="bg-[var(--paper-2)] p-4 md:p-5">
              <div className="stat-num text-lg md:text-xl">{v}<span className="text-xs text-[var(--graphite-2)] ml-1">{u}</span></div>
              <div className="text-xs text-[var(--graphite-2)] mt-1">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="divider-eyebrow mb-6">材料溯源时间轴</div>
      <div className="card p-6 md:p-8">
        <div className="flex flex-col gap-6">
          {timeline.map((t, i) => (
            <div key={i} className="tl-item">
              <div className="font-mono text-xs text-[var(--graphite-2)]">{t.date}</div>
              <div className="font-display text-base mt-0.5">{t.title}</div>
              <div className="text-sm text-[var(--graphite)] mt-1">{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <a href={"#/products/" + product.id} className="btn btn-ghost">查看产品详情</a>
        <a href="#/account" className="btn btn-primary">加入我的碳账户</a>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Account page
--------------------------------------------------------------- */
function AccountPage() {
  const [account, setAccount] = useState(null);
  useEffect(() => { apiFetch("/api/account").then(setAccount).catch(() => setAccount(false)); }, []);

  if (account === false) return <div className="pt-32"><EmptyState title="账户数据加载失败" /></div>;
  if (account === null) return <div className="pt-32"><Loading label="加载碳账户" /></div>;

  return (
    <div className="pt-28 pb-24 max-w-5xl mx-auto px-5 md:px-8">
      <div className="mb-10">
        <div className="divider-eyebrow mb-3">MY CARBON ACCOUNT</div>
        <h1 className="font-display text-3xl md:text-4xl mb-2">我的碳账户</h1>
        <p className="text-[var(--graphite-2)]">记录你每一次参与建筑固废循环利用带来的减排贡献。</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-5 mb-12">
        <div className="card p-6" style={{ background: "var(--ink)", color: "var(--paper)" }}>
          <div className="stat-num text-4xl" style={{ color: "var(--accent)" }}><CountUp value={account.total_carbon_reduction} decimals={2} /></div>
          <div className="text-sm opacity-70 mt-2">累计减排 kgCO₂e</div>
        </div>
        <div className="card p-6">
          <div className="stat-num text-4xl"><CountUp value={account.green_points} /></div>
          <div className="text-sm text-[var(--graphite-2)] mt-2">绿色积分 Green Points</div>
        </div>
        <div className="card p-6">
          <div className="stat-num text-4xl"><CountUp value={account.waste_recycled} decimals={1} /></div>
          <div className="text-sm text-[var(--graphite-2)] mt-2">循环利用建筑固废 kg</div>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-10">
        <div className="md:col-span-3">
          <div className="divider-eyebrow mb-4">我的低碳记录</div>
          <div className="flex flex-col gap-3">
            {account.ledger.map((r, i) => (
              <div key={i} className="card p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.product_name}</div>
                </div>
                <div className="text-right">
                  <div className="stat-num text-sm" style={{ color: "var(--accent-deep)" }}>+{r.carbon_reduction} kgCO₂e</div>
                  <div className="text-xs text-[var(--graphite-2)]">+{r.green_points} Green Points</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="divider-eyebrow mb-4">我的碳证书</div>
          <div id="print-area" className="card p-8 relative overflow-hidden" style={{ background: "var(--paper-2)" }}>
            <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full" style={{ background: "var(--accent)", opacity: 0.25 }}></div>
            <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--graphite-2)] mb-4">CERTIFICATE</div>
            <div className="font-display text-xl mb-6 leading-snug">建筑固废循环<br/>减排证书</div>
            <div className="hairline-t hairline-b py-4 flex flex-col gap-2 text-sm mb-4">
              <div className="flex justify-between"><span className="text-[var(--graphite-2)]">用户</span><span>{account.user}</span></div>
              <div className="flex justify-between"><span className="text-[var(--graphite-2)]">年度</span><span>2026</span></div>
            </div>
            <div className="mb-4">
              <div className="stat-num text-3xl">{account.total_carbon_reduction} <span className="text-sm">kgCO₂e</span></div>
              <div className="text-xs text-[var(--graphite-2)]">累计减排</div>
            </div>
            <div className="mb-6">
              <div className="stat-num text-xl">{account.waste_recycled} kg</div>
              <div className="text-xs text-[var(--graphite-2)]">循环利用建筑固废</div>
            </div>
            <p className="text-xs text-[var(--graphite-2)] italic leading-relaxed mb-4">感谢你让废弃材料重新回到城市生活。</p>
            <div className="font-mono text-[10px] tracking-widest text-[var(--graphite-2)]">CARBON CIRCULARITY PLATFORM</div>
          </div>
          <button onClick={() => window.print()} className="btn btn-primary w-full mt-4">下载证书</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Enterprise ESG page
--------------------------------------------------------------- */
function EsgFlow() {
  const steps = ["建筑固废", "再生骨料", "再生材料", "低碳产品"];
  return (
    <div className="flex items-center justify-between">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-xl hairline bg-[var(--paper)] flex items-center justify-center font-mono text-xs text-center px-1">{s}</div>
          </div>
          {i < steps.length - 1 && <div className="flex-1 h-px bg-[repeating-linear-gradient(to_right,var(--line-2)_0_6px,transparent_6px_11px)] mx-2"></div>}
        </React.Fragment>
      ))}
    </div>
  );
}

function EsgPage() {
  const [esg, setEsg] = useState(null);
  const [reportReady, setReportReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const toast = useToast();
  useEffect(() => { apiFetch("/api/esg").then(setEsg).catch(() => setEsg(false)); }, []);

  function generateReport() {
    setGenerating(true);
    setTimeout(() => { setGenerating(false); setReportReady(true); toast("ESG 报告已生成"); }, 900);
  }

  if (esg === false) return <div className="pt-32"><EmptyState title="ESG 数据加载失败" /></div>;
  if (esg === null) return <div className="pt-32"><Loading label="加载企业 ESG 数据" /></div>;

  return (
    <div className="pt-28 pb-24 max-w-6xl mx-auto px-5 md:px-8">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-2">
        <div>
          <div className="divider-eyebrow mb-3">ENTERPRISE ESG</div>
          <h1 className="font-display text-2xl md:text-3xl mb-1">{esg.company}</h1>
          <p className="text-[var(--graphite-2)]">{esg.year} ESG 环境数据</p>
        </div>
        {esg.is_demo && <span className="pill" style={{ borderColor: "#C98A3E", color: "#8a5f26" }}>⚠ Demo 数据 / 模拟展示</span>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 my-10">
        <StatCard label="建筑固废循环利用" unitLabel="t" value={esg.waste_recycled} />
        <StatCard label="再生材料利用" unitLabel="t" value={esg.recycled_material} />
        <StatCard label="年度碳减排" unitLabel="tCO₂e" value={esg.carbon_reduction} />
        <StatCard label="低碳项目" unitLabel="个" value={esg.low_carbon_projects} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-16">
        <div className="card p-6 lg:col-span-2">
          <div className="divider-eyebrow mb-4">年度碳减排趋势</div>
          <div style={{ height: 240 }}>
            <LineChart id="esgLine" labels={esg.yearly_trend.map((d) => d.year)} values={esg.yearly_trend.map((d) => d.carbon_reduction)} />
          </div>
        </div>
        <div className="card p-6">
          <div className="divider-eyebrow mb-4">碳减排来源</div>
          <div style={{ height: 200 }}>
            <DonutChart id="esgDonut"
              data={esg.reduction_sources.map((s) => ({ label: s.name, value: s.value }))}
              colors={["#B7FF3D", "#6FA827", "#C98A3E", "#1D3B2C"]} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
            {esg.reduction_sources.map((s, i) => (
              <div key={s.name} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: ["#B7FF3D", "#6FA827", "#C98A3E", "#1D3B2C"][i] }}></span>{s.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-6 mb-16">
        <div className="divider-eyebrow mb-6">固废资源化流程</div>
        <EsgFlow />
      </div>

      <div className="divider-eyebrow mb-4">企业项目管理</div>
      <div className="card overflow-hidden mb-16">
        <table className="w-full text-sm">
          <thead className="bg-[var(--paper)] hairline-b">
            <tr className="text-left text-[var(--graphite-2)]">
              <th className="p-4 font-normal">项目名称</th>
              <th className="p-4 font-normal">状态</th>
              <th className="p-4 font-normal text-right">减排量</th>
            </tr>
          </thead>
          <tbody>
            {esg.projects.map((p, i) => (
              <tr key={i} className={"hover:bg-[var(--paper)] transition-colors " + (i !== esg.projects.length - 1 ? "hairline-b" : "")}>
                <td className="p-4">{p.name}</td>
                <td className="p-4">
                  <span className="pill" style={{
                    borderColor: p.status === "已完成" ? "#6FA827" : p.status === "进行中" ? "#C98A3E" : "#CFC9B6",
                  }}>{p.status}</span>
                </td>
                <td className="p-4 text-right stat-num">{p.carbon_reduction} tCO₂e</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div id="print-area" className="card p-8">
        <div className="divider-eyebrow mb-4">{esg.year} ESG 环境数据报告</div>
        <div className="grid sm:grid-cols-2 gap-6 mb-6">
          <div>
            <div className="font-display text-lg mb-3">环境绩效</div>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between hairline-b pb-2"><span className="text-[var(--graphite-2)]">建筑固废资源化</span><span className="stat-num">{esg.waste_recycled} t</span></div>
              <div className="flex justify-between hairline-b pb-2"><span className="text-[var(--graphite-2)]">再生材料使用</span><span className="stat-num">{esg.recycled_material} t</span></div>
              <div className="flex justify-between hairline-b pb-2"><span className="text-[var(--graphite-2)]">温室气体减排</span><span className="stat-num">{esg.carbon_reduction} tCO₂e</span></div>
              <div className="flex justify-between"><span className="text-[var(--graphite-2)]">循环经济项目</span><span className="stat-num">{esg.low_carbon_projects} 个</span></div>
            </div>
          </div>
          <div className="flex flex-col justify-center items-start gap-3">
            {reportReady ? (
              <div className="pill" style={{ borderColor: "#6FA827", color: "var(--accent-deep)" }}>✓ 报告已生成，可供下载</div>
            ) : <p className="text-sm text-[var(--graphite-2)]">点击生成报告，汇总本年度环境绩效数据用于对外披露参考。</p>}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={generateReport} disabled={generating} className="btn btn-primary">{generating ? "生成中…" : "生成 ESG 报告"}</button>
          <button onClick={() => window.print()} disabled={!reportReady} className="btn btn-ghost">下载 ESG 报告</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Agent 助手页面 — chat / project analysis / report / history
   Talks to /api/agent/* which Flask proxies to the Python
   LangGraph Agent Gateway (agent/api/main.py). Same apiFetch,
   same origin — the frontend doesn't know or care that a second
   backend process exists behind that route.
--------------------------------------------------------------- */
function useAgentSession() {
  const ref = useRef(null);
  if (!ref.current) {
    ref.current = "sess-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
  }
  return ref.current;
}

function MarkdownView({ markdown }) {
  const html = useMemo(() => {
    if (!markdown) return "";
    try {
      const raw = window.marked ? window.marked.parse(markdown) : markdown;
      return window.DOMPurify ? window.DOMPurify.sanitize(raw) : raw;
    } catch (e) {
      return markdown;
    }
  }, [markdown]);
  return (
    <div
      className="prose-report text-sm leading-relaxed [&_h1]:font-display [&_h1]:text-xl [&_h1]:mt-4 [&_h1]:mb-2
                  [&_h2]:font-display [&_h2]:text-lg [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mt-3
                  [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1 [&_p]:mb-2 [&_strong]:font-semibold [&_hr]:my-4 [&_hr]:border-[var(--line)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function AgentChatTab({ sessionId }) {
  const toast = useToast();
  const [messages, setMessages] = useState([
    { role: "assistant", content: "你好，我是碳循景 Agent 助手。可以问我建筑固废资源化方案、碳减排核算、供需匹配、ESG 或政策相关的问题。" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    try {
      const res = await apiFetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch (e) {
      toast(e.message || "Agent 服务暂不可用", "error");
      setMessages((m) => [...m, { role: "assistant", content: "抱歉，Agent 服务暂时不可用，请稍后再试。" }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1">
        {messages.map((m, i) => (
          <div key={i} className={"flex " + (m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={"max-w-[80%] px-4 py-2.5 rounded-2xl text-sm " +
              (m.role === "user" ? "bg-[var(--ink)] text-[var(--paper-2)]" : "bg-[var(--paper)] hairline")}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && <div className="text-xs text-[var(--graphite-2)] font-mono">Agent 思考中…</div>}
      </div>
      <div className="flex gap-2 hairline-t pt-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="例如：1200吨混凝土如何资源化利用？"
          className="flex-1 hairline rounded-full px-4 py-2.5 text-sm bg-[var(--paper-2)] focus:outline-none"
        />
        <button onClick={send} disabled={sending} className="btn btn-accent btn-sm">发送</button>
      </div>
    </div>
  );
}

function AgentProjectTab({ sessionId }) {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    apiFetch("/api/map/projects").then(setProjects).catch(() => {});
  }, []);

  async function analyze() {
    if (!projectId) { toast("请先选择一个项目", "error"); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await apiFetch("/api/agent/project-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, project_id: Number(projectId) }),
      });
      setResult(res);
    } catch (e) {
      toast(e.message || "分析失败", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
          className="flex-1 hairline rounded-full px-4 py-2.5 text-sm bg-[var(--paper-2)]">
          <option value="">选择一个循环地图项目…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.district}）</option>)}
        </select>
        <button onClick={analyze} disabled={loading} className="btn btn-primary btn-sm shrink-0">
          {loading ? "分析中…" : "生成项目分析"}
        </button>
      </div>
      {loading && <Loading label="Agent 正在综合分析" />}
      {result && <MarkdownView markdown={result.report_markdown} />}
    </div>
  );
}

function AgentReportTab({ sessionId }) {
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");

  async function generate() {
    if (!prompt.trim()) { toast("请先描述需要分析的场景", "error"); return; }
    setLoading(true);
    setReport("");
    try {
      const res = await apiFetch("/api/agent/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: prompt }),
      });
      setReport(res.report_markdown);
    } catch (e) {
      toast(e.message || "报告生成失败", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5 flex flex-col gap-4">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="描述需要生成综合报告的场景，例如：临港循环材料项目下一步能否申请补贴，碳减排和ESG表现如何？"
        className="hairline rounded-2xl px-4 py-3 text-sm bg-[var(--paper-2)] focus:outline-none resize-none"
      />
      <button onClick={generate} disabled={loading} className="btn btn-primary btn-sm w-fit">
        {loading ? "生成中…" : "生成综合报告"}
      </button>
      {loading && <Loading label="多智能体协同分析中" />}
      {report && (
        <div className="hairline-t pt-4">
          <MarkdownView markdown={report} />
          <button onClick={() => window.print()} className="btn btn-ghost btn-sm mt-4">下载报告</button>
        </div>
      )}
    </div>
  );
}

function AgentHistoryTab({ sessionId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/agent/history?session_id=${encodeURIComponent(sessionId)}`)
      .then((res) => setItems(res.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) return <Loading label="加载历史记录" />;
  if (!items.length) {
    return <EmptyState title="暂无历史记录" hint="本次会话还没有咨询或报告记录，去「聊天」或「项目分析」标签试试。" />;
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((it) => (
        <div key={it.id} className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="pill">{it.kind}</span>
            <span className="text-xs text-[var(--graphite-2)] font-mono">{it.created_at}</span>
          </div>
          <div className="text-sm text-[var(--graphite)] whitespace-pre-wrap line-clamp-6">{it.content}</div>
        </div>
      ))}
    </div>
  );
}

function AgentPage() {
  const sessionId = useAgentSession();
  const [tab, setTab] = useState("chat");
  const TABS = [
    { id: "chat", label: "聊天" },
    { id: "project", label: "项目分析" },
    { id: "report", label: "综合报告" },
    { id: "history", label: "历史记录" },
  ];
  return (
    <div className="pt-28 pb-24 max-w-4xl mx-auto px-5 md:px-8">
      <div className="divider-eyebrow mb-3">Multi-Agent · LangGraph · DeepSeek</div>
      <h1 className="font-display text-3xl md:text-4xl mb-2">Agent 助手</h1>
      <p className="text-[var(--graphite-2)] mb-8 max-w-2xl">
        由 Planner / Material / Carbon / Market / ESG / Policy / Report 多智能体协同回答，
        结合平台真实数据与政策知识库，为资源化利用与碳减排决策提供参考。
      </p>
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={"btn btn-sm " + (tab === t.id ? "btn-primary" : "btn-ghost")}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "chat" && <AgentChatTab sessionId={sessionId} />}
      {tab === "project" && <AgentProjectTab sessionId={sessionId} />}
      {tab === "report" && <AgentReportTab sessionId={sessionId} />}
      {tab === "history" && <AgentHistoryTab sessionId={sessionId} />}
    </div>
  );
}

/* ---------------------------------------------------------------
   App shell / route table
--------------------------------------------------------------- */
const ROUTES = [
  { pattern: "/", el: () => <HomePage /> },
  { pattern: "/map", el: () => <MapPage /> },
  { pattern: "/products", el: () => <ProductsPage /> },
  { pattern: "/products/:id", el: (p) => <ProductDetailPage id={p.id} /> },
  { pattern: "/calculator", el: () => <CalculatorPage /> },
  { pattern: "/carbon-id", el: () => <CarbonIdPage cid={null} /> },
  { pattern: "/carbon-id/:cid", el: (p) => <CarbonIdPage cid={p.cid} /> },
  { pattern: "/account", el: () => <AccountPage /> },
  { pattern: "/esg", el: () => <EsgPage /> },
  { pattern: "/agent", el: () => <AgentPage /> },
];

function App() {
  const route = useHashRoute();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [route]);

  let matched = null;
  let params = null;
  for (const r of ROUTES) {
    const m = matchRoute(r.pattern, route);
    if (m) { matched = r; params = m; break; }
  }

  return (
    <ToastProvider>
      <NavBar route={route} />
      <main>
        {matched ? matched.el(params) : (
          <div className="pt-40 pb-32 max-w-2xl mx-auto px-5 text-center">
            <div className="font-display text-3xl mb-3">页面未找到</div>
            <p className="text-[var(--graphite-2)] mb-6">该路径不存在，返回首页继续浏览平台。</p>
            <a href="#/" className="btn btn-primary">返回首页</a>
          </div>
        )}
      </main>
      <Footer />
    </ToastProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
