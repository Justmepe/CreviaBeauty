// CreviaBeauty — luxury hero b-roll scenes.
// Uses the animation engine globals from animations.jsx (Stage, Sprite, useTime, etc.).
//
// ─────────────────────────────────────────────────────────────────────────────
//  HOW TO ADD YOUR OWN PRODUCT PHOTOS
//  Every category below has a `products` list — ONE product shows per second.
//  Set each product's `img` to a URL or copied-in project file, e.g.
//        { name: 'Velvet Oud', price: 3200, was: 4800, img: 'images/oud.jpg' }
//  Leave img '' to keep the labeled placeholder. Tall/portrait shots on a clean
//  background look best (card is ~560 × 540). Prices are in KES.
//
//  Headlines + value lines are written in the "$100M Offers" (Alex Hormozi)
//  style: dream outcome, speed, low effort, and risk reversal. Edit freely.
// ─────────────────────────────────────────────────────────────────────────────

const Sprite  = (props) => React.createElement(window.Sprite, props);
const useTime = () => window.useTime();
const useSprite = () => window.useSprite();
const clamp   = (...a) => window.clamp(...a);
const Easing  = new Proxy({}, { get: (_, k) => window.Easing[k] });

// ── type + palette ───────────────────────────────────────────────────────
const DISPLAY = "'Cormorant Garamond', Georgia, serif";
const SANS    = "'Inter', system-ui, sans-serif";
const MONO    = "'JetBrains Mono', ui-monospace, monospace";

const INK   = '#f4eee2';
const MUT   = 'rgba(244,238,226,0.52)';
const FAINT = 'rgba(244,238,226,0.10)';

const GOLD      = 'oklch(81% 0.105 84)';
const GOLD_SOFT = 'oklch(81% 0.105 84 / 0.30)';
const GOLD_DUST = 'oklch(81% 0.105 84 / 0.14)';

const KES = (n) => 'KES ' + Number(n).toLocaleString('en-KE');

// Live data bridge: the mount (crevia-hero.js) keeps window.CreviaHeroData as
// { [categoryName]: [{ name, price, was, img }, ...] }, refreshed from the
// products API (newest uploaded first). Returns null when a category has no
// live products yet, so the curated placeholders below stay as a fallback.
const liveProducts = (name) => {
  const d = (typeof window !== 'undefined') && window.CreviaHeroData;
  const list = d && d[name];
  return (Array.isArray(list) && list.length) ? list : null;
};

// ── categories — each holds 10s, one product per second ────────────────────
const CATEGORIES = [
  { n: '01', name: 'Perfumes',
    headline: 'Smell unforgettable — pay like it’s nothing.',
    tag: 'Batch-code verified authentic',
    stack: ['Designer & luxury houses', 'Women’s, Men’s & Unisex', 'Refund if it’s ever a fake'],
    products: [
      { name: 'Velvet Oud',    price: 3200, was: 4800, img: '' },
      { name: 'Noir Intense',  price: 3600, was: 5200, img: '' },
      { name: 'Rose Élixir',   price: 2900, was: 4400, img: '' },
      { name: 'Amber Nuit',    price: 4100, was: 5900, img: '' },
    ] },
  { n: '02', name: 'Skincare',
    headline: 'The glow that makes people ask what you’re doing.',
    tag: 'Visible results in 14 days',
    stack: ['Dermatologist-loved formulas', 'For women & men', 'Free delivery in Nairobi'],
    products: [
      { name: 'Vitamin C Serum',        price: 1900, was: 2800, img: '' },
      { name: 'Hyaluronic Moisturizer', price: 1700, was: 2500, img: '' },
      { name: 'Retinol Night Cream',    price: 2400, was: 3400, img: '' },
      { name: 'SPF 50 Daily Fluid',     price: 1600, was: 2300, img: '' },
    ] },
  { n: '03', name: 'Hair',
    headline: 'Red-carpet hair, salon-soft strands.',
    tag: 'HD lace wigs & pro care',
    stack: ['Human hair & premium synthetic', 'Wigs + treatments & oils', 'Refund if it’s not as shown'],
    products: [
      { name: 'HD Lace Frontal 20"', price: 8500, was: 12000, img: '' },
      { name: 'Body Wave 24"',       price: 9500, was: 13500, img: '' },
      { name: 'Argan Hair Oil',      price: 1400, was:  2100, img: '' },
      { name: 'Deep Repair Mask',    price: 1600, was:  2300, img: '' },
    ] },
];

// ── timing ─────────────────────────────────────────────────────────────────
const INTRO   = 3.4;   // brand intro window
const SEG     = 45;    // seconds each category holds (slower, calmer pacing)
const OVERLAP = 0.6;   // crossfade overlap between categories
const N = CATEGORIES.length;
const catStart = (i) => INTRO - 0.2 + i * SEG;
const catEnd   = (i) => catStart(i) + SEG + OVERLAP;
const DURATION = +(catEnd(N - 1) + 1.0).toFixed(1); // 94.8 — keep Stage duration in sync

function activeIndex(t) {
  if (t < catStart(0) || t > catEnd(N - 1)) return -1;
  return clamp(Math.floor((t - (INTRO - 0.2)) / SEG), 0, N - 1);
}

// ── reveal wrapper: in on enter, out on exit, driven by parent Sprite ──────
function Reveal({ children, delay = 0, dy = 26, inDur = 0.7, outDur = 0.55, style }) {
  const { localTime, duration } = useSprite();
  const outStart = duration - outDur;
  let o = 1, ty = 0;
  const t = localTime - delay;
  if (t < inDur) { const e = Easing.easeOutCubic(clamp(t / inDur, 0, 1)); o = e; ty = (1 - e) * dy; }
  if (localTime > outStart) { const e = Easing.easeInCubic(clamp((localTime - outStart) / outDur, 0, 1)); o = Math.min(o, 1 - e); ty -= e * 16; }
  return <div style={{ opacity: clamp(o, 0, 1), transform: `translateY(${ty}px)`, willChange: 'transform,opacity', ...style }}>{children}</div>;
}

// ── persistent background ──────────────────────────────────────────────────
function Backdrop() {
  const t = useTime();
  const glow = 0.5 + 0.5 * Math.sin(t * 0.5);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0c0908' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 64% 42%, #181210 0%, #0c0908 55%, #070504 100%)' }} />
      <div style={{
        position: 'absolute', right: '6%', top: '50%', width: 900, height: 900,
        transform: 'translateY(-50%)',
        background: `radial-gradient(circle, oklch(81% 0.105 84 / ${0.10 + glow * 0.06}) 0%, transparent 62%)`,
        filter: 'blur(8px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.5,
        background: 'repeating-linear-gradient(90deg, transparent 0 119px, rgba(244,238,226,0.018) 119px 120px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.05, mixBlendMode: 'overlay',
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }} />
      <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 320px 80px rgba(0,0,0,0.6)' }} />
    </div>
  );
}

// ── drifting gold dust ──────────────────────────────────────────────────────
function Dust() {
  const t = useTime();
  const motes = React.useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    x: (i * 97) % 1920, baseY: (i * 233) % 900, r: 1 + (i % 3),
    sp: 6 + (i % 5) * 3, ph: (i * 1.7) % (Math.PI * 2), drift: 18 + (i % 4) * 10,
  })), []);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {motes.map((m, i) => {
        const y = ((m.baseY - t * m.sp) % 960 + 960) % 960 - 30;
        const x = m.x + Math.sin(t * 0.4 + m.ph) * m.drift;
        const tw = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.1 + m.ph));
        return <div key={i} style={{
          position: 'absolute', left: x, top: y, width: m.r * 2, height: m.r * 2,
          borderRadius: '50%', background: GOLD, opacity: tw * 0.5,
          boxShadow: `0 0 ${m.r * 4}px ${GOLD_DUST}`,
        }} />;
      })}
    </div>
  );
}

// ── persistent chrome ───────────────────────────────────────────────────────
function TopChrome() {
  return (
    <div style={{ position: 'absolute', top: 60, left: 130, right: 130, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 38, fontWeight: 600, color: INK, letterSpacing: '0.01em' }}>Crevia</span>
        <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 500, letterSpacing: '0.42em', color: GOLD, textTransform: 'uppercase' }}>Beauty</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 12.5, letterSpacing: '0.28em', color: MUT, textTransform: 'uppercase' }}>Nairobi · Kenya</div>
    </div>
  );
}
function TopRule() {
  return <div style={{ position: 'absolute', top: 118, left: 130, right: 130, height: 1, background: FAINT }} />;
}

// always-on risk-reversal strip (the offer, reinforced)
function GuaranteeStrip() {
  const items = ['100% Authentic — or your money back', 'Free delivery in Nairobi', 'Best prices, guaranteed'];
  return (
    <div style={{ position: 'absolute', bottom: 52, left: 130, right: 130, display: 'flex', alignItems: 'center', gap: 40, borderTop: `1px solid ${FAINT}`, paddingTop: 22 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: GOLD, fontSize: 13 }}>✓</span>
          <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 500, letterSpacing: '0.04em', color: 'rgba(244,238,226,0.66)' }}>{it}</span>
        </div>
      ))}
    </div>
  );
}

// ── category index rail ─────────────────────────────────────────────────────
function IndexRail() {
  const t = useTime();
  const act = activeIndex(t);
  return (
    <div style={{ position: 'absolute', right: 130, top: '47%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 15, alignItems: 'flex-end' }}>
      {CATEGORIES.map((c, i) => {
        const on = i === act;
        return (
          <div key={c.n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', color: on ? GOLD : 'rgba(244,238,226,0.24)' }}>{c.n}</span>
            <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: on ? 600 : 400, letterSpacing: '0.04em', color: on ? INK : 'rgba(244,238,226,0.26)', textTransform: 'uppercase' }}>{c.name}</span>
            <span style={{ width: on ? 26 : 10, height: 1, background: on ? GOLD : FAINT, transition: 'width 400ms, background 400ms' }} />
          </div>
        );
      })}
    </div>
  );
}

// ── brand intro / the grand-slam offer statement ───────────────────────────
function Intro() {
  return (
    <Sprite start={0} end={INTRO + 0.4}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 200px' }}>
        <Reveal delay={0.15} dy={20} inDur={0.9} outDur={0.6}>
          <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.5em', color: GOLD, textTransform: 'uppercase', marginBottom: 26 }}>Premium Beauty · Kenya</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 120, fontWeight: 500, color: INK, lineHeight: 1.02, letterSpacing: '0.005em' }}>
            Beauty so good,<br />saying no feels <span style={{ fontStyle: 'italic', color: GOLD }}>silly.</span>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 19, fontWeight: 400, color: MUT, letterSpacing: '0.05em', marginTop: 30 }}>
            100% Authentic &nbsp;·&nbsp; Free Nairobi delivery &nbsp;·&nbsp; Refund if it’s ever a fake
          </div>
        </Reveal>
      </div>
    </Sprite>
  );
}

// ── product card that flips through a category's products ──────────────────

// Cross-fades through a product's images (cover + gallery) so a product with
// several photos shows them all. Driven by the engine's own timeline clock
// (not a setInterval) so it stays frame-synced and smooth, with no extra
// re-renders fighting the animation loop.
function RotatingImg({ imgs, t, hold }) {
  const list = (imgs || []).filter(Boolean);
  if (list.length <= 1) {
    return list.length
      ? <img src={list[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      : null;
  }
  const H = (typeof hold === 'number' && hold > 0.8) ? hold : 3.6; // seconds each image holds
  const tt = typeof t === 'number' ? t : 0;          // time since THIS product appeared
  const idx = Math.floor(tt / H) % list.length;      // starts on the cover, no pop
  const fade = Math.min(1.1, H * 0.4);
  return (
    <>
      {list.map((src, i) => (
        <img key={i} src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: i === idx ? 1 : 0, transition: `opacity ${fade}s ease-in-out`, willChange: 'opacity' }} />
      ))}
    </>
  );
}

// Varied entrance per product so the hero is not a single predictable zoom.
// e: 0 (just appeared) -> 1 (settled). drift: 0 -> 1 across the whole slot.
// Slides keep a >1 base scale so the translate never exposes a gap.
function entranceTransform(kind, e, drift) {
  const s = 1 - e;                      // 1 at entry, 0 once settled
  const z = 1.03 + 0.035 * drift;       // settled scale with a slow ambient drift
  switch (((kind % 6) + 6) % 6) {
    case 0: return `scale(${z + 0.10 * s})`;                                   // strong push-in
    case 1: return `translateX(${-48 * s}px) scale(${1.10 + 0.035 * drift})`;  // slide from left
    case 2: return `translateX(${48 * s}px) scale(${1.10 + 0.035 * drift})`;   // slide from right
    case 3: return `translateY(${44 * s}px) scale(${1.10 + 0.035 * drift})`;   // rise up
    case 4: return `scale(${z + 0.04 * s})`;                                   // gentle zoom
    default: return `scale(${z})`;                                             // pure fade + drift
  }
}

function ProductLayer({ p, tag, t, hold }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {((p.imgs && p.imgs.length) || p.img) ? (
        <RotatingImg imgs={(p.imgs && p.imgs.length) ? p.imgs : [p.img]} t={t} hold={hold} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'repeating-linear-gradient(135deg, #1a1410 0 14px, #15100d 14px 28px)' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', border: `1px solid ${GOLD_SOFT}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: GOLD }} />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.22em', color: 'rgba(244,238,226,0.4)', textTransform: 'uppercase' }}>Drop product photo</div>
        </div>
      )}
      {/* info overlay */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '70px 28px 26px', background: 'linear-gradient(to top, rgba(7,5,4,0.92) 0%, rgba(7,5,4,0.55) 55%, transparent 100%)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '5px 11px', border: `1px solid ${GOLD_SOFT}`, borderRadius: 2 }}>
          <span style={{ color: GOLD, fontSize: 11 }}>✓</span>
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: 'rgba(244,238,226,0.78)', textTransform: 'uppercase' }}>{tag}</span>
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 38, fontWeight: 600, color: INK, lineHeight: 1.05 }}>{p.name}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 8 }}>
          <span style={{ fontFamily: SANS, fontSize: 24, fontWeight: 700, color: GOLD, letterSpacing: '0.01em' }}>{KES(p.price)}</span>
          {p.was && Number(p.was) > Number(p.price) && (
            <span style={{ fontFamily: SANS, fontSize: 16, fontWeight: 400, color: 'rgba(244,238,226,0.42)', textDecoration: 'line-through' }}>{KES(p.was)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductCard({ cat }) {
  const { localTime, duration } = useSprite();
  const inDur = 0.7, outDur = 0.6, outStart = duration - outDur;
  let catO = 1, ty = 0;
  if (localTime < inDur) { const e = Easing.easeOutCubic(clamp(localTime / inDur, 0, 1)); catO = e; ty = (1 - e) * 18; }
  else if (localTime > outStart) { const e = Easing.easeInCubic(clamp((localTime - outStart) / outDur, 0, 1)); catO = 1 - e; ty = -e * 12; }

  // Allocate the segment PER IMAGE so a product's time scales with how many
  // photos it has (a 3-image product stays ~3x longer than a 1-image one).
  const products = cat.products;
  const weights = products.map(function (pp) { return clamp((pp.imgs && pp.imgs.length) || 1, 1, 4); });
  const totalW = weights.reduce(function (a, b) { return a + b; }, 0) || 1;
  const unit = SEG / totalW;                         // seconds each image is on screen
  let acc = 0; const starts = weights.map(function (w) { const s0 = acc; acc += w * unit; return s0; });
  let idx = 0; for (let i = 0; i < products.length; i++) { if (localTime >= starts[i]) idx = i; }
  const SLOT = weights[idx] * unit;                  // this product's total time
  const slotT = localTime - starts[idx];             // time since THIS product appeared
  const phase = Easing.easeInOutCubic(clamp(slotT / 0.9, 0, 1)); // smooth fade-in, no quick pop
  const cur = products[idx];
  const prev = idx > 0 ? products[idx - 1] : null;
  const slotProg = clamp(slotT / SLOT, 0, 1);
  const kind = (parseInt(cat.n, 10) + idx) % 6;     // rotate the entrance style

  return (
    <div style={{ position: 'absolute', left: 980, top: 168, width: 560, height: 540, opacity: clamp(catO, 0, 1), transform: `translateY(${ty}px)`, willChange: 'transform,opacity' }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 4, overflow: 'hidden', border: `1px solid ${GOLD_SOFT}`, boxShadow: '0 40px 90px rgba(0,0,0,0.55), 0 0 60px oklch(81% 0.105 84 / 0.10)' }}>
        {prev && <ProductLayer p={prev} tag={cat.tag} t={0} />}
        <div style={{ position: 'absolute', inset: 0, opacity: phase, transform: entranceTransform(kind, phase, slotProg), transformOrigin: 'center' }}>
          <ProductLayer p={cur} tag={cat.tag} t={slotT} hold={unit} />
        </div>
      </div>
      {/* product progress ticks */}
      <div style={{ position: 'absolute', left: 0, bottom: -22, display: 'flex', gap: 7 }}>
        {cat.products.map((_, i) => (
          <div key={i} style={{ width: i === idx ? 22 : 9, height: 3, borderRadius: 2, background: i === idx ? GOLD : 'rgba(244,238,226,0.18)', transition: 'width 250ms, background 250ms' }} />
        ))}
      </div>
      <Corner pos={{ left: -6, top: -6 }} d="M0 18 V0 H18" />
      <Corner pos={{ right: -6, top: -6 }} d="M0 0 H18 V18" />
    </div>
  );
}
function Corner({ pos, d }) {
  return (
    <svg width="26" height="26" viewBox="0 0 18 18" style={{ position: 'absolute', ...pos }}>
      <path d={d} fill="none" stroke={GOLD} strokeWidth="1" opacity="0.7" />
    </svg>
  );
}

// ── one category scene (10s): message column + product rotator ─────────────
function CategoryScene({ cat, i }) {
  return (
    <Sprite start={catStart(i)} end={catEnd(i)}>
      <div style={{ position: 'absolute', left: 130, top: 118, bottom: 130, width: 720, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Reveal delay={0.05} dy={20}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
            <span style={{ fontFamily: MONO, fontSize: 14, letterSpacing: '0.22em', color: GOLD }}>{cat.n}</span>
            <span style={{ width: 44, height: 1, background: GOLD_SOFT }} />
            <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.22em', color: MUT, textTransform: 'uppercase' }}>{cat.name}</span>
          </div>
        </Reveal>
        <Reveal delay={0.16} dy={28}>
          <div style={{ fontFamily: DISPLAY, fontSize: 72, fontWeight: 500, color: INK, lineHeight: 1.07, letterSpacing: '0.004em', textWrap: 'balance', maxWidth: 640 }}>{cat.headline}</div>
        </Reveal>
        <Reveal delay={0.3} dy={16}>
          <div style={{ width: 64, height: 1, background: GOLD, margin: '42px 0 24px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {cat.stack.map((s, k) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <span style={{ color: GOLD, fontSize: 14 }}>✓</span>
                <span style={{ fontFamily: SANS, fontSize: 19, fontWeight: 400, color: 'rgba(244,238,226,0.72)', letterSpacing: '0.01em' }}>{s}</span>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={0.44} dy={14}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginTop: 38, padding: '15px 28px', background: GOLD, borderRadius: 2, alignSelf: 'flex-start' }}>
            <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', color: '#1a1208', textTransform: 'uppercase' }}>Shop {cat.name}</span>
            <span style={{ color: '#1a1208', fontSize: 15 }}>→</span>
          </div>
        </Reveal>
      </div>
      <ProductCard cat={{ ...cat, products: liveProducts(cat.name) || cat.products }} />
    </Sprite>
  );
}

function CreviaScenes() {
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: SANS }}>
      <Backdrop />
      <Dust />
      <Intro />
      {CATEGORIES.map((c, i) => <CategoryScene key={c.n} cat={c} i={i} />)}
      <TopChrome />
      <TopRule />
      <IndexRail />
      <GuaranteeStrip />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PORTRAIT (9:16) VARIANT — for phones. Same engine, same live-product data,
//  same per-category timeline; the layout is re-composed for a 900×1600 canvas
//  (image card on top, copy stacked beneath) instead of the wide desktop scene.
// ═══════════════════════════════════════════════════════════════════════════

const MW = 900, MH = 1600; // mobile canvas

// drifting gold dust sized for the portrait canvas
function DustPortrait() {
  const t = useTime();
  const motes = React.useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    x: (i * 137) % MW, baseY: (i * 223) % MH, r: 1 + (i % 3),
    sp: 6 + (i % 5) * 3, ph: (i * 1.7) % (Math.PI * 2), drift: 14 + (i % 4) * 8,
  })), []);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {motes.map((m, i) => {
        const y = ((m.baseY - t * m.sp) % (MH + 60) + (MH + 60)) % (MH + 60) - 30;
        const x = m.x + Math.sin(t * 0.4 + m.ph) * m.drift;
        const tw = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.1 + m.ph));
        return <div key={i} style={{
          position: 'absolute', left: x, top: y, width: m.r * 2, height: m.r * 2,
          borderRadius: '50%', background: GOLD, opacity: tw * 0.5,
          boxShadow: `0 0 ${m.r * 4}px ${GOLD_DUST}`,
        }} />;
      })}
    </div>
  );
}

function MobileTopChrome() {
  return (
    <div style={{ position: 'absolute', top: 54, left: 60, right: 60, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 42, fontWeight: 600, color: INK }}>Crevia</span>
        <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 500, letterSpacing: '0.42em', color: GOLD, textTransform: 'uppercase' }}>Beauty</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 12.5, letterSpacing: '0.22em', color: MUT, textTransform: 'uppercase' }}>Nairobi</div>
    </div>
  );
}

function MobileGuarantee() {
  const items = ['100% Authentic', 'Free Nairobi delivery', 'Best prices'];
  return (
    <div style={{ position: 'absolute', bottom: 58, left: 60, right: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${FAINT}`, paddingTop: 22 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ color: GOLD, fontSize: 14 }}>✓</span>
          <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 500, color: 'rgba(244,238,226,0.66)' }}>{it}</span>
        </div>
      ))}
    </div>
  );
}

function MobileIntro() {
  return (
    <Sprite start={0} end={INTRO + 0.4}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 70px' }}>
        <Reveal delay={0.15} dy={20} inDur={0.9} outDur={0.6}>
          <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: '0.5em', color: GOLD, textTransform: 'uppercase', marginBottom: 26 }}>Premium Beauty · Kenya</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 88, fontWeight: 500, color: INK, lineHeight: 1.04 }}>
            Beauty so good,<br />saying no feels <span style={{ fontStyle: 'italic', color: GOLD }}>silly.</span>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 21, color: MUT, marginTop: 28 }}>
            100% Authentic &nbsp;·&nbsp; Free Nairobi delivery
          </div>
        </Reveal>
      </div>
    </Sprite>
  );
}

function MobileProductCard({ cat }) {
  const { localTime, duration } = useSprite();
  const inDur = 0.7, outDur = 0.6, outStart = duration - outDur;
  let catO = 1, ty = 0;
  if (localTime < inDur) { const e = Easing.easeOutCubic(clamp(localTime / inDur, 0, 1)); catO = e; ty = (1 - e) * 18; }
  else if (localTime > outStart) { const e = Easing.easeInCubic(clamp((localTime - outStart) / outDur, 0, 1)); catO = 1 - e; ty = -e * 12; }

  const products = cat.products;
  const weights = products.map(function (pp) { return clamp((pp.imgs && pp.imgs.length) || 1, 1, 4); });
  const totalW = weights.reduce(function (a, b) { return a + b; }, 0) || 1;
  const unit = SEG / totalW;
  let acc = 0; const starts = weights.map(function (w) { const s0 = acc; acc += w * unit; return s0; });
  let idx = 0; for (let i = 0; i < products.length; i++) { if (localTime >= starts[i]) idx = i; }
  const SLOT = weights[idx] * unit;
  const slotT = localTime - starts[idx];
  const phase = Easing.easeInOutCubic(clamp(slotT / 0.9, 0, 1));
  const cur = products[idx];
  const prev = idx > 0 ? products[idx - 1] : null;
  const slotProg = clamp(slotT / SLOT, 0, 1);
  const kind = (parseInt(cat.n, 10) + idx) % 6;

  return (
    <div style={{ position: 'absolute', left: 60, top: 150, width: 780, height: 760, opacity: clamp(catO, 0, 1), transform: `translateY(${ty}px)`, willChange: 'transform,opacity' }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 6, overflow: 'hidden', border: `1px solid ${GOLD_SOFT}`, boxShadow: '0 40px 90px rgba(0,0,0,0.55), 0 0 60px oklch(81% 0.105 84 / 0.10)' }}>
        {prev && <ProductLayer p={prev} tag={cat.tag} t={0} />}
        <div style={{ position: 'absolute', inset: 0, opacity: phase, transform: entranceTransform(kind, phase, slotProg), transformOrigin: 'center' }}>
          <ProductLayer p={cur} tag={cat.tag} t={slotT} hold={unit} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, bottom: -26, display: 'flex', gap: 8 }}>
        {cat.products.map((_, i) => (
          <div key={i} style={{ width: i === idx ? 26 : 10, height: 4, borderRadius: 2, background: i === idx ? GOLD : 'rgba(244,238,226,0.18)', transition: 'width 250ms, background 250ms' }} />
        ))}
      </div>
    </div>
  );
}

function MobileCategoryScene({ cat, i }) {
  return (
    <Sprite start={catStart(i)} end={catEnd(i)}>
      <MobileProductCard cat={{ ...cat, products: liveProducts(cat.name) || cat.products }} />
      <div style={{ position: 'absolute', left: 60, top: 1000, width: 780 }}>
        <Reveal delay={0.05} dy={18}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <span style={{ fontFamily: MONO, fontSize: 15, letterSpacing: '0.22em', color: GOLD }}>{cat.n}</span>
            <span style={{ width: 40, height: 1, background: GOLD_SOFT }} />
            <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.22em', color: MUT, textTransform: 'uppercase' }}>{cat.name}</span>
          </div>
        </Reveal>
        <Reveal delay={0.16} dy={24}>
          <div style={{ fontFamily: DISPLAY, fontSize: 60, fontWeight: 500, color: INK, lineHeight: 1.06, letterSpacing: '0.004em', textWrap: 'balance' }}>{cat.headline}</div>
        </Reveal>
        <Reveal delay={0.3} dy={14}>
          <div style={{ width: 64, height: 1, background: GOLD, margin: '30px 0 20px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cat.stack.map((s, k) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: GOLD, fontSize: 16 }}>✓</span>
                <span style={{ fontFamily: SANS, fontSize: 22, fontWeight: 400, color: 'rgba(244,238,226,0.72)' }}>{s}</span>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={0.44} dy={12}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginTop: 30, padding: '18px 34px', background: GOLD, borderRadius: 3 }}>
            <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, letterSpacing: '0.18em', color: '#1a1208', textTransform: 'uppercase' }}>Shop {cat.name}</span>
            <span style={{ color: '#1a1208', fontSize: 17 }}>→</span>
          </div>
        </Reveal>
      </div>
    </Sprite>
  );
}

function CreviaScenesMobile() {
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: SANS }}>
      <Backdrop />
      <DustPortrait />
      <MobileIntro />
      {CATEGORIES.map((c, i) => <MobileCategoryScene key={c.n} cat={c} i={i} />)}
      <MobileTopChrome />
      <MobileGuarantee />
    </div>
  );
}

if (typeof module !== 'undefined' && module.exports) module.exports = { CreviaScenes, CreviaScenesMobile, DURATION };
window.CreviaScenes = CreviaScenes;
window.CreviaScenesMobile = CreviaScenesMobile;
window.CREVIA_DURATION = DURATION;
