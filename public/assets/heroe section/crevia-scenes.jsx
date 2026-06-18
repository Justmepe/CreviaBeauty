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
    stack: ['Designer & luxury houses', '8–12 hour longevity', 'Refund if it’s ever a fake'],
    products: [
      { name: 'Velvet Oud',      price: 3200, was: 4800, img: '' },
      { name: 'Noir Intense',    price: 3600, was: 5200, img: '' },
      { name: 'Rose Élixir',     price: 2900, was: 4400, img: '' },
      { name: 'Amber Nuit',      price: 4100, was: 5900, img: '' },
      { name: 'Citrus Royale',   price: 2600, was: 3900, img: '' },
      { name: 'Santal Bloom',    price: 3400, was: 4900, img: '' },
      { name: 'Midnight Musk',   price: 3000, was: 4500, img: '' },
      { name: 'Golden Saffron',  price: 4500, was: 6500, img: '' },
      { name: 'White Jasmine',   price: 2800, was: 4200, img: '' },
      { name: 'Leather & Smoke', price: 3900, was: 5600, img: '' },
    ] },
  { n: '02', name: "Women's Skincare",
    headline: 'The glow that makes people ask what you’re doing.',
    tag: 'Visible results in 14 days',
    stack: ['Dermatologist-loved formulas', 'Built for Kenyan weather', 'Free delivery in Nairobi'],
    products: [
      { name: 'Vitamin C Serum',        price: 1900, was: 2800, img: '' },
      { name: 'Hyaluronic Moisturizer', price: 1700, was: 2500, img: '' },
      { name: 'Gentle Foam Cleanser',   price: 1200, was: 1800, img: '' },
      { name: 'Retinol Night Cream',    price: 2400, was: 3400, img: '' },
      { name: 'Niacinamide Toner',      price: 1400, was: 2100, img: '' },
      { name: 'SPF 50 Daily Fluid',     price: 1600, was: 2300, img: '' },
      { name: 'Glow Exfoliant',         price: 1500, was: 2200, img: '' },
      { name: 'Eye Renewal Gel',        price: 1800, was: 2600, img: '' },
      { name: 'Hydra Sheet Mask ×5',    price:  900, was: 1500, img: '' },
      { name: 'Ceramide Barrier Cream', price: 2100, was: 3000, img: '' },
    ] },
  { n: '03', name: "Men's Skincare",
    headline: 'Look five years younger without even trying.',
    tag: 'No grease, no fuss',
    stack: ['Simple 3-step routine', 'Fast-absorbing, matte finish', 'Refund if you don’t see it'],
    products: [
      { name: 'Charcoal Face Wash',    price: 1100, was: 1700, img: '' },
      { name: 'Oil-Control Moisturizer', price: 1500, was: 2200, img: '' },
      { name: 'Beard & Skin Oil',      price: 1300, was: 1900, img: '' },
      { name: 'Post-Shave Balm',       price: 1200, was: 1800, img: '' },
      { name: 'Energizing Eye Roll-On', price: 1400, was: 2000, img: '' },
      { name: 'SPF Daily Shield',      price: 1600, was: 2300, img: '' },
      { name: 'Exfoliating Scrub',     price: 1100, was: 1600, img: '' },
      { name: 'Matte Hydrator',        price: 1500, was: 2100, img: '' },
      { name: 'Anti-Fatigue Serum',    price: 1900, was: 2700, img: '' },
      { name: 'Clay Detox Mask',       price: 1300, was: 1900, img: '' },
    ] },
  { n: '04', name: 'Makeup',
    headline: 'Flawless in minutes. Photo-ready all day.',
    tag: '16-hour wear, shade-matched',
    stack: ['Full-coverage, never cakey', 'Cruelty-free & verified', 'Best prices, guaranteed'],
    products: [
      { name: 'Full-Coverage Foundation', price: 2200, was: 3200, img: '' },
      { name: 'Matte Liquid Lipstick',    price:  900, was: 1400, img: '' },
      { name: 'Pro Eyeshadow Palette',    price: 2600, was: 3800, img: '' },
      { name: 'Lengthening Mascara',      price: 1100, was: 1700, img: '' },
      { name: 'Radiant Concealer',        price: 1300, was: 1900, img: '' },
      { name: 'Soft Blush Trio',          price: 1500, was: 2200, img: '' },
      { name: 'Precision Brow Pencil',    price:  700, was: 1100, img: '' },
      { name: 'Setting Powder',           price: 1400, was: 2000, img: '' },
      { name: 'Liquid Highlighter',       price: 1200, was: 1800, img: '' },
      { name: 'Gel Eyeliner',             price:  800, was: 1300, img: '' },
    ] },
  { n: '05', name: 'Hair Care',
    headline: 'From dry & damaged to salon-soft.',
    tag: 'Results in 3 washes',
    stack: ['Sulphate-free formulas', 'For 4C, natural & relaxed', 'Free delivery in Nairobi'],
    products: [
      { name: 'Sulphate-Free Shampoo', price: 1300, was: 1900, img: '' },
      { name: 'Deep Repair Mask',      price: 1600, was: 2300, img: '' },
      { name: 'Argan Hair Oil',        price: 1400, was: 2100, img: '' },
      { name: 'Leave-In Conditioner',  price: 1200, was: 1800, img: '' },
      { name: 'Edge Control Gel',      price:  700, was: 1100, img: '' },
      { name: 'Scalp Growth Serum',    price: 2200, was: 3200, img: '' },
      { name: 'Curl Defining Cream',   price: 1500, was: 2200, img: '' },
      { name: 'Heat Protect Spray',    price: 1300, was: 1900, img: '' },
      { name: 'Protein Treatment',     price: 1700, was: 2500, img: '' },
      { name: 'Moisture Detangler',    price: 1100, was: 1600, img: '' },
    ] },
  { n: '06', name: 'Body Care',
    headline: 'Skin so soft, people will notice.',
    tag: '48-hour hydration',
    stack: ['Shea, cocoa & natural oils', 'A glow you can feel', 'Best prices, guaranteed'],
    products: [
      { name: 'Shea Body Butter',     price: 1200, was: 1800, img: '' },
      { name: 'Coffee Body Scrub',    price: 1100, was: 1700, img: '' },
      { name: 'Vitamin E Lotion',     price:  900, was: 1400, img: '' },
      { name: 'Cocoa Body Wash',      price:  800, was: 1300, img: '' },
      { name: 'Coconut Body Oil',     price: 1000, was: 1500, img: '' },
      { name: 'Brightening Bar Soap', price:  500, was:  900, img: '' },
      { name: 'Hand & Nail Cream',    price:  700, was: 1100, img: '' },
      { name: 'Foot Repair Balm',     price:  800, was: 1200, img: '' },
      { name: 'Cooling Body Mist',    price: 1100, was: 1600, img: '' },
      { name: 'Exfoliating Glove Set', price:  600, was: 1000, img: '' },
    ] },
  { n: '07', name: 'Fragrances',
    headline: 'Turn heads — on any budget.',
    tag: 'Layer it. Make it last.',
    stack: ['All-day colognes & mists', 'Gift-ready packaging', 'Verified authentic, always'],
    products: [
      { name: 'Vanilla Body Mist',     price:  900, was: 1400, img: '' },
      { name: 'Sport Cologne Spray',   price: 1800, was: 2600, img: '' },
      { name: 'Linen & Musk Mist',     price: 1000, was: 1500, img: '' },
      { name: 'Citrus Splash Cologne', price: 1700, was: 2400, img: '' },
      { name: 'Floral Body Veil',      price: 1100, was: 1600, img: '' },
      { name: 'Fresh Aqua Cologne',    price: 1900, was: 2700, img: '' },
      { name: 'Coconut Beach Mist',    price:  950, was: 1500, img: '' },
      { name: 'Spiced Wood Cologne',   price: 2000, was: 2900, img: '' },
      { name: 'Berry Bloom Mist',      price: 1000, was: 1500, img: '' },
      { name: 'Pocket Travel Spray',   price:  650, was: 1000, img: '' },
    ] },
  { n: '08', name: 'Beauty Tools',
    headline: 'Pro results — without the salon bill.',
    tag: 'Studio-grade, built to last',
    stack: ['Beginner-friendly kits', 'Save every single month', 'Free delivery in Nairobi'],
    products: [
      { name: 'Pro Brush Set (12)',  price: 2400, was: 3500, img: '' },
      { name: 'LED Vanity Mirror',   price: 3200, was: 4600, img: '' },
      { name: 'Jade Facial Roller',  price:  900, was: 1400, img: '' },
      { name: 'Blending Sponge Duo', price:  600, was: 1000, img: '' },
      { name: 'Lash Curler',         price:  500, was:  900, img: '' },
      { name: 'Electric Nail File',  price: 1800, was: 2600, img: '' },
      { name: 'Gua Sha Stone',       price:  800, was: 1300, img: '' },
      { name: 'Hair Straightener',   price: 3600, was: 5200, img: '' },
      { name: 'Tweezer Precision Set', price: 700, was: 1100, img: '' },
      { name: 'Makeup Organizer',    price: 2100, was: 3000, img: '' },
    ] },
  { n: '09', name: 'Wigs',
    headline: 'Red-carpet hair, straight out the box.',
    tag: 'Pre-plucked HD lace',
    stack: ['Human hair & premium synthetic', 'Slay in minutes, glueless options', 'Refund if it’s not as shown'],
    products: [
      { name: 'HD Lace Frontal 20"', price: 8500, was: 12000, img: '' },
      { name: 'Bob Wig — Natural',   price: 4200, was:  6000, img: '' },
      { name: 'Body Wave 24"',       price: 9500, was: 13500, img: '' },
      { name: 'Pixie Cut Wig',       price: 3200, was:  4800, img: '' },
      { name: 'Deep Wave 18"',       price: 7200, was: 10500, img: '' },
      { name: 'Straight Lace 26"',   price: 9800, was: 14000, img: '' },
      { name: 'Curly Bundle Wig',    price: 6800, was:  9800, img: '' },
      { name: 'Ombré Colored Wig',   price: 7600, was: 11000, img: '' },
      { name: 'Glueless U-Part',     price: 5400, was:  7800, img: '' },
      { name: 'Kinky Curly 22"',     price: 8200, was: 11800, img: '' },
    ] },
];

// ── timing ─────────────────────────────────────────────────────────────────
const INTRO   = 3.4;   // brand intro window
const SEG     = 30;    // seconds each category holds (10 products × 3s)
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

function ProductLayer({ p, tag }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {p.img ? (
        <img src={p.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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

  const count = cat.products.length;
  const SLOT = SEG / count; // spread the products evenly across the segment
  const idx = clamp(Math.floor(localTime / SLOT), 0, count - 1);
  const phase = clamp((localTime - idx * SLOT) / 0.28, 0, 1); // quick fade-in per product
  const cur = cat.products[idx];
  const prev = idx > 0 ? cat.products[idx - 1] : null;
  // subtle ken-burns within the slot
  const kb = 1.0 + 0.03 * clamp((localTime - idx * SLOT) / SLOT, 0, 1);

  return (
    <div style={{ position: 'absolute', left: 980, top: 168, width: 560, height: 540, opacity: clamp(catO, 0, 1), transform: `translateY(${ty}px)`, willChange: 'transform,opacity' }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 4, overflow: 'hidden', border: `1px solid ${GOLD_SOFT}`, boxShadow: '0 40px 90px rgba(0,0,0,0.55), 0 0 60px oklch(81% 0.105 84 / 0.10)' }}>
        {prev && <ProductLayer p={prev} tag={cat.tag} />}
        <div style={{ position: 'absolute', inset: 0, opacity: phase, transform: `scale(${kb})`, transformOrigin: 'center' }}>
          <ProductLayer p={cur} tag={cat.tag} />
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

  const count = cat.products.length;
  const SLOT = SEG / count;
  const idx = clamp(Math.floor(localTime / SLOT), 0, count - 1);
  const phase = clamp((localTime - idx * SLOT) / 0.28, 0, 1);
  const cur = cat.products[idx];
  const prev = idx > 0 ? cat.products[idx - 1] : null;
  const kb = 1.0 + 0.03 * clamp((localTime - idx * SLOT) / SLOT, 0, 1);

  return (
    <div style={{ position: 'absolute', left: 60, top: 150, width: 780, height: 760, opacity: clamp(catO, 0, 1), transform: `translateY(${ty}px)`, willChange: 'transform,opacity' }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 6, overflow: 'hidden', border: `1px solid ${GOLD_SOFT}`, boxShadow: '0 40px 90px rgba(0,0,0,0.55), 0 0 60px oklch(81% 0.105 84 / 0.10)' }}>
        {prev && <ProductLayer p={prev} tag={cat.tag} />}
        <div style={{ position: 'absolute', inset: 0, opacity: phase, transform: `scale(${kb})`, transformOrigin: 'center' }}>
          <ProductLayer p={cur} tag={cat.tag} />
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
