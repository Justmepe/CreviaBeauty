// Investment asset-classes B-roll scenes.
// Uses the animation engine globals set by animations.jsx (Stage, Sprite, etc.).

// Resolve engine globals lazily — they're guaranteed present by render time
// (animations.jsx evaluates when the outer Stage mounts), but NOT necessarily
// when this module first evaluates. Destructuring at module top would race.
const Sprite = (props) => React.createElement(window.Sprite, props);
const useTime = () => window.useTime();
const useSprite = () => window.useSprite();
const clamp = (...a) => window.clamp(...a);
const Easing = new Proxy({}, { get: (_, k) => window.Easing[k] });

const SERIF = "'Spectral', Georgia, serif";
const MONO  = "'JetBrains Mono', ui-monospace, monospace";
const SANS  = "'Inter', system-ui, sans-serif";

const INK   = '#eef3ea';
const MUT   = '#828d82';
const FAINT = 'rgba(255,255,255,0.06)';

const acc     = (h) => `oklch(78% 0.13 ${h})`;
const accDim  = (h) => `oklch(78% 0.13 ${h} / 0.32)`;
const accSoft = (h) => `oklch(78% 0.13 ${h} / 0.12)`;

const lerp = (a, b, t) => a + (b - a) * t;

// timing
const START = 3.6, SEG = 4.4, NA = 5;
const ASSET_END = START + NA * SEG; // 25.6

const ASSETS = [
  { n: '01', ticker: 'EQUITIES',      name: 'Stocks',         sub: 'Own a slice of public companies.',     risk: 4, horizon: 'Long',   xl: 'LIQUIDITY', xv: 'High',   h: 150, motif: 'candles', cap: 'PRICE / TIME' },
  { n: '02', ticker: 'FUNDS · ETF',   name: 'Index Funds',    sub: 'Hundreds of stocks in one basket.',     risk: 3, horizon: 'Long',   xl: 'LIQUIDITY', xv: 'High',   h: 168, motif: 'index',   cap: 'MANY → ONE' },
  { n: '03', ticker: 'FIXED INCOME',  name: 'Bonds',          sub: 'Lend capital, collect fixed interest.', risk: 2, horizon: 'Medium', xl: 'INCOME',    xv: 'Fixed',  h: 128, motif: 'bonds',   cap: 'COUPONS / TIME' },
  { n: '04', ticker: 'TREASURY',      name: 'Treasury Bills', sub: 'Short-term government IOUs.',            risk: 1, horizon: 'Short',  xl: 'BACKING',   xv: 'Gov’t',  h: 105, motif: 'tbill',   cap: 'DISCOUNT → PAR' },
  { n: '05', ticker: 'DIGITAL',       name: 'Crypto',         sub: 'Digital assets on open networks.',       risk: 5, horizon: 'Long',   xl: 'MARKET',    xv: '24 / 7', h: 192, motif: 'crypto',  cap: '24/7 VOLATILITY' },
];

// ── helpers ──────────────────────────────────────────────────────────────
function poly(fn, x0 = 0, x1 = 640, step = 12) {
  let s = '';
  for (let x = x0; x <= x1; x += step) s += `${x.toFixed(1)},${fn(x).toFixed(1)} `;
  return s.trim();
}

// reveal-on-enter, fade-on-exit, driven by the parent Sprite window
function Reveal({ children, delay = 0, dy = 22, style }) {
  const { localTime, duration } = useSprite();
  const inDur = 0.55, outDur = 0.45;
  const outStart = duration - outDur;
  let o = 1, ty = 0;
  const t = localTime - delay;
  if (t < inDur) { const e = Easing.easeOutCubic(clamp(t / inDur, 0, 1)); o = e; ty = (1 - e) * dy; }
  if (localTime > outStart) { const e = Easing.easeInCubic(clamp((localTime - outStart) / outDur, 0, 1)); o = Math.min(o, 1 - e); ty -= e * 14; }
  return <div style={{ opacity: clamp(o, 0, 1), transform: `translateY(${ty}px)`, willChange: 'transform,opacity', ...style }}>{children}</div>;
}

// draw progress of a motif (first ~45% of its window), held after
function useDraw() {
  const { progress } = useSprite();
  return clamp(progress / 0.42, 0, 1);
}

function RiskDots({ n, h }) {
  return (
    <div style={{ display: 'flex', gap: 7 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{
          width: 11, height: 11, borderRadius: 11,
          background: i < n ? acc(h) : 'transparent',
          border: i < n ? 'none' : `1.5px solid ${FAINT}`,
          boxShadow: i < n ? `0 0 10px ${accDim(h)}` : 'none',
        }} />
      ))}
    </div>
  );
}

// ── motifs ──────────────────────────────────────────────────────────────
function LineReveal({ pd, children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, width: `${pd * 100}%`, overflow: 'hidden' }}>
      <svg width="640" height="400" viewBox="0 0 640 400" style={{ display: 'block' }}>{children}</svg>
    </div>
  );
}

function CandlesMotif({ h }) {
  const pd = useDraw();
  const gt = useTime();
  const data = [
    { o: .22, c: .34 }, { o: .34, c: .29 }, { o: .29, c: .47 }, { o: .47, c: .41 },
    { o: .41, c: .58 }, { o: .58, c: .67 }, { o: .63, c: .55 }, { o: .55, c: .80 },
  ];
  const H = 360, base = 380, slot = 640 / data.length, bw = 30;
  const yOf = f => base - f * H;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {data.map((d, i) => {
        const up = d.c >= d.o;
        const top = yOf(Math.max(d.o, d.c)), bot = yOf(Math.min(d.o, d.c));
        const wtop = yOf(Math.max(d.o, d.c) + 0.06), wbot = yOf(Math.min(d.o, d.c) - 0.05);
        const x = i * slot + (slot - bw) / 2;
        let rv = Easing.easeOutCubic(clamp((pd - i * 0.085) / 0.2, 0, 1));
        if (i === data.length - 1 && rv >= 1) rv = 1 + 0.05 * Math.sin(gt * 3);
        const col = up ? acc(h) : 'rgba(190,120,120,0.75)';
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: 0, width: bw, height: base, transformOrigin: 'bottom', transform: `scaleY(${rv})` }}>
            <div style={{ position: 'absolute', left: bw / 2 - 0.75, top: wtop, width: 1.5, height: wbot - wtop, background: col, opacity: .55 }} />
            <div style={{ position: 'absolute', left: 0, top: top, width: bw, height: Math.max(3, bot - top), background: up ? col : 'transparent', border: `1.5px solid ${col}`, borderRadius: 3 }} />
          </div>
        );
      })}
      <LineReveal pd={pd}>
        <polyline points={data.map((d, i) => `${i * slot + slot / 2},${yOf(d.c)}`).join(' ')}
          fill="none" stroke={acc(h)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.5" />
      </LineReveal>
    </div>
  );
}

function IndexMotif({ h }) {
  const pd = useDraw();
  const gt = useTime();
  const faint = k => poly(x => 200 + (k - 2.5) * 22 + 22 * Math.sin(x * 0.018 + gt * 1.1 + k * 0.8));
  const avg = poly(x => 200 + 24 * Math.sin(x * 0.013 + gt * 0.7));
  const endY = 200 + 24 * Math.sin(640 * 0.013 + gt * 0.7);
  return (
    <LineReveal pd={pd}>
      {[0, 1, 2, 3, 4, 5].map(k => (
        <polyline key={k} points={faint(k)} fill="none" stroke={MUT} strokeWidth="1.4" opacity="0.18" />
      ))}
      <polyline points={avg} fill="none" stroke={acc(h)} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="640" cy={endY} r={5 + Math.sin(gt * 3) * 1.2} fill={acc(h)} />
    </LineReveal>
  );
}

function BondsMotif({ h }) {
  const pd = useDraw();
  const gt = useTime();
  const n = 7, baseY = 300, ph = 150;
  const xs = i => 46 + i * (560 / (n - 1));
  const payX = 46 + ((gt * 80) % 560);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg width="640" height="400" viewBox="0 0 640 400" style={{ position: 'absolute', inset: 0 }}>
        <line x1="20" y1={baseY} x2="620" y2={baseY} stroke={FAINT} strokeWidth="2" />
        <circle cx={payX} cy={baseY} r="6" fill={acc(h)} opacity="0.9" />
        <circle cx={payX} cy={baseY} r={6 + (gt * 40 % 18)} fill="none" stroke={acc(h)} strokeWidth="1.2" opacity={clamp(1 - (gt * 40 % 18) / 18, 0, 1) * 0.6} />
      </svg>
      {Array.from({ length: n }).map((_, i) => {
        const rv = Easing.easeOutCubic(clamp((pd - i * 0.1) / 0.2, 0, 1));
        return (
          <div key={i} style={{ position: 'absolute', left: xs(i) - 13, top: baseY - ph, width: 26, height: ph, transformOrigin: 'bottom', transform: `scaleY(${rv})`, opacity: rv }}>
            <div style={{ position: 'absolute', bottom: 0, width: 26, height: ph, background: accSoft(h), border: `1.5px solid ${acc(h)}`, borderRadius: '4px 4px 0 0' }} />
            <div style={{ position: 'absolute', top: -16, left: 7, width: 12, height: 12, borderRadius: 12, background: acc(h), boxShadow: `0 0 10px ${accDim(h)}` }} />
          </div>
        );
      })}
    </div>
  );
}

function TBillMotif({ h }) {
  const pd = useDraw();
  const gt = useTime();
  const x0 = 30, x1 = 610, w = x1 - x0, ty = 176, th = 58;
  const fillW = pd * w;
  const ticks = ['13W', '9W', '5W', '1W', 'PAR'];
  const shimmer = (gt * 220) % (w + 120) - 60;
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: MONO }}>
      <div style={{ position: 'absolute', left: x0, top: ty, width: w, height: th, borderRadius: th / 2, border: `1.5px solid ${accDim(h)}`, background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: fillW, background: `linear-gradient(90deg, ${accSoft(h)}, ${accDim(h)})`, borderRadius: th / 2 }} />
        <div style={{ position: 'absolute', top: 0, height: '100%', left: Math.min(shimmer, fillW - 40), width: 40, background: `linear-gradient(90deg, transparent, ${acc(h)}, transparent)`, opacity: shimmer < fillW ? 0.5 : 0, filter: 'blur(2px)' }} />
      </div>
      {/* head marker */}
      <div style={{ position: 'absolute', left: x0 + fillW - 8, top: ty - 14, width: 16, height: th + 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 3, height: th + 20, background: acc(h), borderRadius: 2, boxShadow: `0 0 12px ${accDim(h)}` }} />
      </div>
      {/* par value */}
      <div style={{ position: 'absolute', left: x1 - 150, top: 64, width: 150, textAlign: 'right', opacity: clamp((pd - 0.7) / 0.3, 0, 1) }}>
        <span style={{ fontFamily: SERIF, fontSize: 60, fontWeight: 600, color: acc(h), letterSpacing: '-0.02em' }}>$100</span>
        <div style={{ fontSize: 12, color: MUT, letterSpacing: '0.18em', marginTop: 2 }}>FACE VALUE</div>
      </div>
      {/* ticks */}
      <div style={{ position: 'absolute', left: x0, top: ty + th + 18, width: w, display: 'flex', justifyContent: 'space-between' }}>
        {ticks.map((t, i) => (
          <span key={i} style={{ fontSize: 13, letterSpacing: '0.12em', color: i === ticks.length - 1 ? acc(h) : MUT }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function CryptoMotif({ h }) {
  const pd = useDraw();
  const gt = useTime();
  const fn = x => 180 + 78 * Math.sin(x * 0.026 + gt * 1.5) + 30 * Math.sin(x * 0.068 + gt * 2.4);
  const endY = fn(640);
  const blocks = 4;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <LineReveal pd={pd}>
        <polyline points={poly(fn)} fill="none" stroke={acc(h)} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="640" cy={endY} r={6 + Math.sin(gt * 4) * 1.5} fill={acc(h)} />
      </LineReveal>
      <div style={{ position: 'absolute', left: 0, bottom: 26, width: '100%', display: 'flex', alignItems: 'center', gap: 0, justifyContent: 'center' }}>
        {Array.from({ length: blocks }).map((_, i) => {
          const rv = clamp((pd - 0.3 - i * 0.1) / 0.2, 0, 1);
          const glow = 0.5 + 0.5 * Math.sin(gt * 2.2 - i * 0.9);
          return (
            <React.Fragment key={i}>
              {i > 0 && <div style={{ width: 34, height: 2, background: accDim(h), opacity: rv }} />}
              <div style={{ width: 50, height: 50, borderRadius: 10, border: `1.5px solid ${acc(h)}`, background: accSoft(h), opacity: rv, transform: `scale(${0.6 + 0.4 * rv})`, boxShadow: `0 0 ${8 + glow * 14}px ${accDim(h)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: acc(h), opacity: 0.4 + glow * 0.5 }} />
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

const MOTIFS = { candles: CandlesMotif, index: IndexMotif, bonds: BondsMotif, tbill: TBillMotif, crypto: CryptoMotif };

// ── asset scene ─────────────────────────────────────────────────────────
function AssetScene(a) {
  const Motif = MOTIFS[a.motif];
  const big = a.name.length > 9 ? 80 : 104;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* left column */}
      <div style={{ position: 'absolute', left: 160, top: 0, height: '100%', width: 760, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 26 }}>
        <Reveal delay={0.05}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontFamily: MONO, fontSize: 15, color: MUT, letterSpacing: '0.1em' }}>{a.n} <span style={{ opacity: .5 }}>/ 05</span></span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: acc(a.h), letterSpacing: '0.22em', textTransform: 'uppercase', padding: '6px 13px', border: `1px solid ${accDim(a.h)}`, borderRadius: 999, background: accSoft(a.h) }}>{a.ticker}</span>
          </div>
        </Reveal>
        <Reveal delay={0.12}>
          <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: big, lineHeight: 1, color: INK, letterSpacing: '-0.025em' }}>{a.name}</div>
        </Reveal>
        <Reveal delay={0.2}>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, fontSize: 36, lineHeight: 1.25, color: '#b7c0b4' }}>{a.sub}</div>
        </Reveal>
        <Reveal delay={0.3} style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 56 }}>
            <Stat label="RISK"><RiskDots n={a.risk} h={a.h} /></Stat>
            <Stat label="HORIZON"><span style={{ fontFamily: MONO, fontSize: 19, color: INK }}>{a.horizon}</span></Stat>
            <Stat label={a.xl}><span style={{ fontFamily: MONO, fontSize: 19, color: INK }}>{a.xv}</span></Stat>
          </div>
        </Reveal>
      </div>

      {/* right panel */}
      <div style={{ position: 'absolute', right: 150, top: 0, height: '100%', display: 'flex', alignItems: 'center' }}>
        <Reveal delay={0.18} dy={28}>
          <div style={{ width: 700, height: 510, borderRadius: 18, border: `1px solid ${FAINT}`, background: 'linear-gradient(160deg, rgba(255,255,255,0.035), rgba(255,255,255,0.008))', boxShadow: '0 30px 80px rgba(0,0,0,0.45)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 22, left: 28, right: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.22em', color: MUT }}>{a.cap}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.18em', color: acc(a.h) }}>● LIVE</span>
            </div>
            <div style={{ position: 'absolute', left: 30, right: 30, top: 70, bottom: 30 }}>
              <Motif h={a.h} />
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

function Stat({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: MUT, letterSpacing: '0.2em' }}>{label}</span>
      {children}
    </div>
  );
}

// ── intro / outro ───────────────────────────────────────────────────────
function IntroScene() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
      <Reveal delay={0.05}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: MONO, fontSize: 15, letterSpacing: '0.32em', color: acc(150) }}>
          <div style={{ width: 30, height: 1, background: accDim(150) }} />
          CAPITAL · MADE LEGIBLE
          <div style={{ width: 30, height: 1, background: accDim(150) }} />
        </div>
      </Reveal>
      <Reveal delay={0.18}>
        <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 100, lineHeight: 1.04, color: INK, letterSpacing: '-0.03em', textAlign: 'center', whiteSpace: 'nowrap' }}>
          Where your money <span style={{ fontStyle: 'italic', fontWeight: 500, color: acc(150) }}>can live.</span>
        </div>
      </Reveal>
      <Reveal delay={0.32}>
        <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: '0.06em', color: MUT }}>Five core asset classes · one capital map</div>
      </Reveal>
    </div>
  );
}

function OutroScene() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
      <Reveal delay={0.05}>
        <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: '0.3em', color: acc(150) }}>FIVE WAYS TO ALLOCATE</div>
      </Reveal>
      <div style={{ width: 760, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ASSETS.map((a, i) => (
          <Reveal key={i} delay={0.18 + i * 0.1} dy={16}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '15px 4px', borderBottom: `1px solid ${FAINT}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 22 }}>
                <span style={{ fontFamily: MONO, fontSize: 15, color: acc(a.h) }}>{a.n}</span>
                <span style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 600, color: INK, letterSpacing: '-0.02em' }}>{a.name}</span>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 13, color: MUT, letterSpacing: '0.16em' }}>{a.ticker}</span>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal delay={0.8}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.34em', color: INK }}>CREVIACOCKPIT</div>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 20, color: MUT }}>Capital intelligence for people who think before they allocate.</div>
        </div>
      </Reveal>
    </div>
  );
}

// ── chrome ──────────────────────────────────────────────────────────────
function Chrome() {
  const t = useTime();
  const inAssets = t >= START - 0.2 && t <= ASSET_END + 0.2;
  const activeRaw = (t - START) / SEG;
  const active = Math.floor(activeRaw);
  const segFill = clamp(activeRaw - active, 0, 1);
  const pulse = 0.55 + 0.45 * Math.sin(t * 3.4);
  const barOpacity = clamp(Math.min((t - 3.3) / 0.4, (ASSET_END + 0.2 - t) / 0.4), 0, 1);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* top bar */}
      <div style={{ position: 'absolute', top: 56, left: 160, right: 150, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: MONO }}>
        <span style={{ fontSize: 14, letterSpacing: '0.34em', color: INK, opacity: 0.92 }}>CREVIACOCKPIT</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, letterSpacing: '0.2em', color: MUT }}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: acc(150), opacity: pulse, boxShadow: `0 0 10px ${accDim(150)}` }} />
          ASSET CLASSES · B-ROLL
        </span>
      </div>

      {/* bottom progress */}
      <div style={{ position: 'absolute', bottom: 58, left: 160, right: 150, display: 'flex', gap: 18, opacity: barOpacity }}>
        {ASSETS.map((a, i) => {
          const isActive = i === active;
          const past = i < active;
          const fill = past ? 1 : isActive ? segFill : 0;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em' }}>
                <span style={{ color: isActive ? INK : MUT }}>{a.n}</span>
                <span style={{ color: isActive ? acc(a.h) : MUT, opacity: isActive || past ? 1 : 0.5, textTransform: 'uppercase' }}>{a.name}</span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: FAINT, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${fill * 100}%`, background: acc(a.h), borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── background ──────────────────────────────────────────────────────────
function Background() {
  const t = useTime();
  const drift = (t * 8) % 64;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: '-64px 0', backgroundImage: `repeating-linear-gradient(0deg, ${FAINT} 0 1px, transparent 1px 64px)`, transform: `translateY(${drift}px)`, opacity: 0.5 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% 36%, rgba(40,70,52,0.22), transparent 60%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(130% 120% at 50% 100%, transparent 50%, rgba(0,0,0,0.6))' }} />
    </div>
  );
}

// ── root ────────────────────────────────────────────────────────────────
function InvestScenes() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0b0e0c', fontFamily: SANS }}>
      <Background />
      <Sprite start={0} end={START + 0.05}><IntroScene /></Sprite>
      {ASSETS.map((a, i) => (
        <Sprite key={i} start={START + i * SEG} end={START + (i + 1) * SEG}>
          <AssetScene {...a} />
        </Sprite>
      ))}
      <Sprite start={ASSET_END - 0.05} end={30}><OutroScene /></Sprite>
      <Chrome />
    </div>
  );
}

module.exports = { InvestScenes };
