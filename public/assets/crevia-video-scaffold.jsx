// crevia-scenes.jsx — cinematic fragrance story film for CreviaBeauty.
// Midnight-navy / champagne-gold palette, Playfair display type, procedural
// backgrounds (no external assets). Mounts on the animations.jsx engine.
// Keep EVERYTHING below unchanged except the SCENES array and the Stage
// `duration`. Replace the example scenes with the perfume's real story.

const { Stage, Sprite, useSprite, useTime, useTimeline, Easing, clamp } = window;

// ── Crevia palette (canonical, do not drift) ──────────────────────────────
const C = {
  ink:    '#0b0c18',   // near-black navy
  navy:   '#15173a',   // midnight navy (primary)
  navy2:  '#1e2047',
  champ:  '#d4af6a',   // champagne gold (accent)
  champL: '#e6c98a',
  cream:  '#f5f1e6',   // near-white
  ivory:  '#f3ede2',   // ivory (gift register)
  dust:   '#9aa0b5',   // muted blue-grey
  rose:   '#b76e79',   // optional VIP accent
  charcoal:'#1a1a1a',
};

const FONT = "'Playfair Display', Georgia, serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const W = 1920, H = 1080, PADX = 140;

const sHead = { fontFamily: FONT, fontWeight: 500, fontSize: 78, color: C.cream, lineHeight: 1.1, letterSpacing: '-0.01em', whiteSpace: 'pre-line', textShadow: '0 2px 30px rgba(0,0,0,0.55)' };
const sCap  = { fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 400, fontSize: 27, color: 'rgba(245,241,230,0.9)', lineHeight: 1.5, whiteSpace: 'pre-line', textShadow: '0 1px 18px rgba(0,0,0,0.6)' };
const sKick = { fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 600, fontSize: 18, color: C.champ, letterSpacing: '0.4em', textTransform: 'uppercase' };

// ── Fade wrapper (lives inside a <Sprite>) ────────────────────────────────
function useFade(inDur = 0.7, outDur = 0.6, rise = 20) {
  const { localTime, duration } = useSprite();
  const exitStart = Math.max(0, duration - outDur);
  let o = 1, ty = 0;
  if (localTime < inDur) { const t = Easing.easeOutCubic(clamp(localTime / inDur, 0, 1)); o = t; ty = (1 - t) * rise; }
  else if (localTime > exitStart) { const t = Easing.easeInCubic(clamp((localTime - exitStart) / outDur, 0, 1)); o = 1 - t; ty = -t * 10; }
  return { opacity: o, ty };
}
function Fade({ inDur, outDur, rise, x, y, w, style, children }) {
  const { opacity, ty } = useFade(inDur, outDur, rise);
  return <div style={{ position: 'absolute', left: x, top: y, width: w, opacity, transform: `translateY(${ty}px)`, willChange: 'transform, opacity', ...style }}>{children}</div>;
}
// T — timed, positioned text block.
function T({ start, end, x = PADX, y, w, inDur, outDur, rise, style, children }) {
  return <Sprite start={start} end={end}><Fade x={x} y={y} w={w} inDur={inDur} outDur={outDur} rise={rise} style={style}>{children}</Fade></Sprite>;
}
// Kicker — champagne rule + tracked label
function Kicker({ children }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}><div style={{ width: 50, height: 1, background: C.champ }} /><span style={sKick}>{children}</span></div>;
}
// The ✦ brand sparkle
function Sparkle({ size = 26, color = C.champ }) {
  return <span style={{ fontSize: size, color, textShadow: `0 0 ${size}px ${color}88` }}>✦</span>;
}

// ── Procedural backgrounds ────────────────────────────────────────────────
function Glow({ x, y, r, color, blend }) {
  return <div style={{ position: 'absolute', inset: 0, mixBlendMode: blend, background: `radial-gradient(circle at ${x}% ${y}%, ${color} 0%, transparent ${r}%)` }} />;
}
function Grain() {
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.06, mixBlendMode: 'overlay', backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 0.5px, transparent 0.6px)', backgroundSize: '3px 3px' }} />;
}
// Abstract champagne-capped navy flacon — the recurring hero motif.
function Bottle({ cx = 50, scale = 1, y = 0, opacity = 1 }) {
  const w = 300 * scale, bodyH = 470 * scale, capH = 90 * scale, capW = 150 * scale, neckH = 24 * scale, neckW = 92 * scale;
  return (
    <div style={{ position: 'absolute', left: `${cx}%`, top: `${52 + y}%`, transform: 'translate(-50%,-50%)', opacity, filter: 'drop-shadow(0 36px 50px rgba(0,0,0,0.55))' }}>
      <div style={{ width: capW, height: capH, margin: '0 auto', borderRadius: 4, background: 'linear-gradient(100deg,#b8923f,#e6c98a 46%,#b8923f)' }} />
      <div style={{ width: neckW, height: neckH, margin: '0 auto', background: 'linear-gradient(100deg,#0a0b16,#1e2047,#0a0b16)' }} />
      <div style={{ position: 'relative', width: w, height: bodyH, borderRadius: 14, overflow: 'hidden', background: 'linear-gradient(104deg,#0a0b16 0%,#1e2047 38%,#10122e 62%,#070812 100%)', boxShadow: 'inset 0 0 0 1px rgba(212,175,106,0.12)' }}>
        <div style={{ position: 'absolute', left: '20%', top: 0, width: '7%', height: '100%', background: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.02))' }} />
        <div style={{ position: 'absolute', right: 0, top: '8%', width: '3%', height: '84%', background: 'linear-gradient(180deg, transparent, rgba(212,175,106,0.6), transparent)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: '42%', height: '15%', borderTop: '1px solid rgba(212,175,106,0.25)', borderBottom: '1px solid rgba(212,175,106,0.25)' }} />
      </div>
    </div>
  );
}

// Mood backgrounds — pass one of: glass, ivory, charcoal, champagne, counter, quiet.
function Mood({ mood, p }) {
  const d = (a, b) => a + (b - a) * p;
  switch (mood) {
    case 'glass': return (<React.Fragment>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg,#15173a 0%,#0b0c18 60%,#070812 100%)' }} />
      <Glow x={72} y={d(18, 26)} r={d(46, 52)} color="rgba(212,175,106,0.26)" /><Glow x={28} y={84} r={50} color="rgba(40,50,110,0.3)" />
      <Bottle cx={50} scale={d(1.0, 1.07)} y={d(2, -2)} /></React.Fragment>);
    case 'ivory': return (<React.Fragment>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 110% at 40% 38%, #f3ede2 0%, #e6dcc6 60%, #d8cbb0 100%)' }} />
      <Glow x={d(30, 36)} y={32} r={50} color="rgba(212,175,106,0.25)" /></React.Fragment>);
    case 'charcoal': return (<React.Fragment>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 110% at 50% 44%, #1a1a1a 0%, #0c0c0e 70%)' }} />
      <Glow x={d(60, 66)} y={30} r={48} color="rgba(212,175,106,0.22)" /><Glow x={26} y={80} r={44} color="rgba(183,110,121,0.14)" /></React.Fragment>);
    case 'champagne': return (<React.Fragment>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(150deg,#2a2238 0%,#15173a 52%,#0b0c18 100%)' }} />
      <Glow x={d(48, 52)} y={d(40, 36)} r={d(34, 40)} color="rgba(230,201,138,0.4)" />
      <Bottle cx={50} scale={d(1.05, 1.12)} y={d(2, 0)} /></React.Fragment>);
    case 'counter': { const dots = [[18, 30, 16], [34, 62, 10], [52, 22, 20], [68, 58, 13], [82, 38, 17], [60, 82, 12]];
      return (<React.Fragment>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 110% at 60% 40%, #1a1c3a 0%, #090a14 70%)' }} />
        {dots.map((dd, i) => { const [x, y, r] = dd; const dx = (i % 2 ? 1 : -1) * (p * 2);
          return <div key={i} style={{ position: 'absolute', left: `${x + dx}%`, top: `${y}%`, width: r * 8, height: r * 8, marginLeft: -r * 4, marginTop: -r * 4, borderRadius: '50%', background: `radial-gradient(circle, rgba(212,175,106,${0.1 + r / 220}) 0%, transparent 70%)` }} />; })}
      </React.Fragment>); }
    case 'quiet': return (<React.Fragment>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(90% 80% at 50% 50%, #14152e 0%, #060710 72%)' }} />
      <Glow x={50} y={d(46, 42)} r={d(34, 40)} color="rgba(212,175,106,0.2)" />
      <Bottle cx={50} scale={d(0.92, 0.98)} y={4} opacity={0.85} /></React.Fragment>);
    default: return null;
  }
}
function Photo({ mood = 'glass', src, focus = 'bottom' }) {
  const { localTime, duration, progress } = useSprite();
  let o = 1; const fi = 0.9, fo = 0.8;
  if (localTime < fi) o = clamp(localTime / fi, 0, 1);
  else if (localTime > duration - fo) o = clamp((duration - localTime) / fo, 0, 1);
  const grad = focus === 'bottom'
    ? 'linear-gradient(180deg, rgba(8,9,18,0.5) 0%, rgba(8,9,18,0.02) 24%, rgba(8,9,18,0.14) 52%, rgba(8,9,18,0.82) 100%)'
    : focus === 'center'
    ? 'radial-gradient(120% 95% at 50% 50%, rgba(8,9,18,0.04) 0%, rgba(8,9,18,0.78) 100%)'
    : 'linear-gradient(90deg, rgba(8,9,18,0.85) 0%, rgba(8,9,18,0.3) 44%, rgba(8,9,18,0.08) 72%, rgba(8,9,18,0.6) 100%)';
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, overflow: 'hidden', background: C.ink }}>
      {src ? <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.06 + 0.12 * progress})` }} /> : <Mood mood={mood} p={progress} />}
      <div style={{ position: 'absolute', inset: 0, background: grad }} /><Grain />
    </div>
  );
}
function Chapter({ start, end, num, label }) {
  return (
    <T start={start} end={end} x={PADX} y={118} inDur={0.8} outDur={0.6} rise={0}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, fontFamily: MONO, color: C.dust }}>
        <span style={{ fontSize: 15, letterSpacing: '0.1em', color: C.champ }}>{num}</span>
        <span style={{ width: 28, height: 1, background: C.dust, alignSelf: 'center', opacity: 0.6 }} />
        <span style={{ fontSize: 13, letterSpacing: '0.28em', textTransform: 'uppercase' }}>{label}</span>
      </div>
    </T>
  );
}
function Bg({ start, end, ...p }) { return <Sprite start={start} end={end}><Photo {...p} /></Sprite>; }
const kY = 614, hY = 672, cY = 902; // common Y positions for kicker / headline / caption

// ── Per-scene images ──────────────────────────────────────────────────────
// AI-generated images, ONE per scene, in scene order. Paste the uploaded URLs
// here (or leave '' to use the procedural background for that scene). Each <Bg>
// reads its slot via src={IMG[n]}, so the film upgrades from procedural to real
// imagery as you fill these in — no other change needed.
const IMG = [
  '', // 01
  '', // 02
];

// ── SCENES ════════════════════════════════════════════════════════════════
// Replace this whole array with the perfume's story (one block per chapter).
// Each scene: <Bg ... mood="..." src={IMG[i]} />, a <Chapter>, a <Kicker>, one
// or two <div style={sHead}> headlines, and a <div style={sCap}> caption.
const SCENES = [];

function SceneExample() {
  return (
    <React.Fragment>
      <Bg start={0} end={24} mood="glass" src={IMG[0]} focus="bottom" />
      <Chapter start={0.5} end={23.6} num="01" label="The Bottle" />
      <T start={1.2} end={12} y={kY}><Kicker>Example Fragrance</Kicker></T>
      <T start={2.6} end={12} y={hY} w={1180}><div style={sHead}>{"A headline that\nreframes the scent."}</div></T>
      <T start={13} end={23.6} y={hY + 6} w={1100}><div style={sHead}>{"The second beat\nof this chapter."}</div></T>
      <T start={13.4} end={23.6} y={cY + 70} w={840}><div style={sCap}>One supporting line of context, in plain language.</div></T>
    </React.Fragment>
  );
}
SCENES.push(<SceneExample key="s1" />);
// ── END SCENES ══════════════════════════════════════════════════════════

// ── Sign-off card: CREVIA BEAUTY wordmark + tagline ───────────────────────
function SignOff({ start, end }) {
  return (
    <React.Fragment>
      <Sprite start={start} end={end}>{({ localTime, duration }) => {
        const o = clamp(Math.min(localTime / 0.9, (duration - localTime) / 0.6), 0, 1);
        return <div style={{ position: 'absolute', inset: 0, opacity: o, background: `radial-gradient(120% 110% at 50% 42%, ${C.navy2} 0%, ${C.ink} 70%)` }} />;
      }}</Sprite>
      <T start={start + 0.6} end={end - 0.4} x={760} y={392} w={400} inDur={0.7} style={{ textAlign: 'center' }}><Sparkle size={34} /></T>
      <T start={start + 0.9} end={end - 0.4} x={560} y={452} w={800} inDur={0.8} style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 56, letterSpacing: '0.22em', color: C.champ, textTransform: 'uppercase' }}>CREVIA BEAUTY</div>
      </T>
      <T start={start + 1.4} end={end - 0.4} x={560} y={560} w={800} inDur={0.8} style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 22, letterSpacing: '0.34em', color: C.cream, textTransform: 'uppercase' }}>Discover Your Signature Scent</div>
      </T>
      <T start={start + 1.8} end={end - 0.4} x={560} y={650} w={800} inDur={0.8} style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: '0.18em', color: C.dust }}>@creviabeauty · creviabeauty.com</div>
      </T>
    </React.Fragment>
  );
}

// Always-on atmosphere (vignette + top champagne wash).
function Atmosphere() {
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(135% 125% at 50% 46%, rgba(0,0,0,0) 54%, rgba(0,0,0,0.5) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(212,175,106,0.05) 0%, rgba(0,0,0,0) 18%)', mixBlendMode: 'soft-light' }} />
    </React.Fragment>
  );
}

function CreviaVideo() {
  return (
    <Stage width={W} height={H} duration={300} background={C.ink} persistKey="crevia">
      {SCENES}
      <Atmosphere />
    </Stage>
  );
}

Object.assign(window, { CreviaVideo });
