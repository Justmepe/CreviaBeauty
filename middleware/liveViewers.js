/**
 * Live Viewers — anonymous "X people viewing now" tracker + urgency blend.
 *
 * Strategy: simulation-driven now, real-driven later, with an automatic
 * crossover. Early on (little traffic) the displayed count leans on a
 * believable, deterministic *simulated* baseline so the store looks alive.
 * As genuine concurrent viewers grow, a confidence weight shifts the number
 * toward reality — no flag to flip, it converges on its own.
 *
 *   displayed = round( w * real + (1 - w) * simulated )
 *   w = min(1, real / CONFIDENCE_FLOOR)
 *
 * No login required: every browser sends an opaque viewer id (localStorage),
 * falling back to the session id. No DB writes — purely in-memory.
 */

// productId -> Map(viewerId -> lastSeenMs)
const viewers = new Map();

const WINDOW_MS = 30 * 1000;   // a viewer counts as "present" for 30s after a ping
const CONFIDENCE_FLOOR = 8;    // real concurrent viewers needed to fully trust reality
const DISPLAY_CAP = 9;         // young-store cap so we never show an unbelievable number
const MIN_SHOW = 2;            // hide the badge below this — "1 person" reads weak/dead
const LOW_STOCK_AT = 5;        // stock <= this surfaces "Only N left"

/** Register a heartbeat: this viewer is currently looking at this product. */
function touch(productId, viewerId, now = Date.now()) {
    let m = viewers.get(productId);
    if (!m) { m = new Map(); viewers.set(productId, m); }
    m.set(viewerId, now);
}

/** Count distinct viewers seen within the live window (prunes stale entries). */
function realCount(productId, now = Date.now()) {
    const m = viewers.get(productId);
    if (!m) return 0;
    for (const [id, ts] of m) {
        if (now - ts > WINDOW_MS) m.delete(id);
    }
    if (m.size === 0) viewers.delete(productId);
    return m ? m.size : 0;
}

// Deterministic [0,1) hash so a product shows a *stable* number within each
// time bucket (survives refresh, doesn't flicker). mulberry32 on a mixed seed.
function seeded(productId, bucket) {
    let t = (Math.imul(productId | 0, 2654435761) ^ Math.imul(bucket | 0, 40503)) >>> 0;
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

// Believable baseline for a product at this moment, scaled by time of day in
// Nairobi (EAT, UTC+3). Quiet overnight, busier in the evening. Re-seeds every
// 90s so it drifts gently rather than holding one frozen number.
function simulated(productId, now = Date.now()) {
    const bucket = Math.floor(now / 90000);
    const eatHour = (new Date(now).getUTCHours() + 3) % 24;

    let lo, hi;
    if (eatHour < 6)        { lo = 0; hi = 2; }   // 0–6  dead of night
    else if (eatHour < 11)  { lo = 1; hi = 4; }   // 6–11 morning
    else if (eatHour < 17)  { lo = 2; hi = 6; }   // 11–17 daytime
    else if (eatHour < 23)  { lo = 3; hi = 7; }   // 17–23 evening peak
    else                    { lo = 1; hi = 3; }   // 23–24 winding down

    return lo + Math.floor(seeded(productId, bucket) * (hi - lo + 1));
}

/**
 * Compute what to display for a product.
 * @param {number} productId
 * @param {number|null} stock  current inventory (for the low-stock nudge)
 * @returns {{ viewers:number, show:boolean, lowStock:number|null, inStock:boolean }}
 */
function activity(productId, stock, now = Date.now()) {
    const real = realCount(productId, now);
    const sim = simulated(productId, now);

    const w = Math.min(1, real / CONFIDENCE_FLOOR);
    let count = Math.round(w * real + (1 - w) * sim);
    count = Math.min(count, DISPLAY_CAP);

    const s = (stock === null || stock === undefined) ? null : Number(stock);
    return {
        viewers: count,
        show: count >= MIN_SHOW,
        lowStock: (s !== null && s > 0 && s <= LOW_STOCK_AT) ? s : null,
        inStock: s === null ? true : s > 0
    };
}

module.exports = { touch, realCount, simulated, activity };
