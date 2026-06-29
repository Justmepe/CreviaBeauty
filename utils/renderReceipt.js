/**
 * Receipt Renderer
 *
 * Produces a self-contained, print-optimised HTML receipt for an order in the
 * Crevia Beauty brand system, matching the carousel generator:
 *   - Type: Cinzel wordmark, Pinyon Script tagline, Playfair Display headings,
 *           Montserrat / Inter body.
 *   - Three brand collections: Navy (primary), Ivory (gift), Black (VIP),
 *           champagne-gold accent.
 *
 * The page carries a theme switcher and a "Print / Save as PDF" button; both
 * hide themselves when printing, so an admin can save a clean PDF straight
 * from the browser.
 *
 * Pure function: takes already-fetched data, returns an HTML string.
 */

const fs = require('fs');
const path = require('path');

// Embed the (small, pre-trimmed) brand logos as data URIs so they render both
// in the browser and in the PDF (Puppeteer has no server origin to fetch from).
// Two variants: the dark logo for the light Ivory header, and an ivory+gold
// inverted logo for the dark Navy/Black headers. Both are embedded so the live
// theme switcher swaps them via CSS. Falls back to a text wordmark if missing.
function loadLogo(file) {
    try {
        const buf = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', file));
        return `data:image/png;base64,${buf.toString('base64')}`;
    } catch (e) {
        return null;
    }
}
const LOGO_DARK = loadLogo('logo-receipt.png');        // for Ivory (light) header
const LOGO_LIGHT = loadLogo('logo-receipt-light.png'); // for Navy/Black (dark) headers

const LOGO_MARKUP = (LOGO_DARK && LOGO_LIGHT)
    ? `<img class="logo logo-dark" src="${LOGO_DARK}" alt="Crevia Beauty">
       <img class="logo logo-light" src="${LOGO_LIGHT}" alt="Crevia Beauty">`
    : (LOGO_DARK || LOGO_LIGHT)
        ? `<img class="logo" src="${LOGO_DARK || LOGO_LIGHT}" alt="Crevia Beauty" style="display:block">`
        : `<div class="mark">Crevia Beauty</div>`;

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// Brand collections — exact palette shared with the carousel generator.
// Navy / Black are dark (light text); Ivory is light (dark text).
const THEMES = {
    navy: {
        bg: 'linear-gradient(165deg, #101227 0%, #15173a 60%, #222c57 100%)',
        heading: '#f5f3ee', body: '#c3c7d6', gold: '#d4af6a',
        sub: 'rgba(245,243,238,0.42)', frame: 'rgba(212,175,106,0.30)',
        panel: 'rgba(255,255,255,0.04)', onGold: '#101227'
    },
    ivory: {
        bg: 'linear-gradient(165deg, #f7f3ec 0%, #f3ede2 60%, #e7ddcd 100%)',
        heading: '#1c1e33', body: '#6a5f4c', gold: '#a9843a',
        sub: 'rgba(28,30,51,0.42)', frame: 'rgba(169,132,58,0.38)',
        panel: 'rgba(28,30,51,0.04)', onGold: '#fbf8f2'
    },
    black: {
        bg: 'linear-gradient(165deg, #0e0e0f 0%, #1a1a1a 60%, #242122 100%)',
        heading: '#f6f3ef', body: '#bbb2a8', gold: '#d4af6a',
        sub: 'rgba(246,243,239,0.40)', frame: 'rgba(212,175,106,0.30)',
        panel: 'rgba(255,255,255,0.04)', onGold: '#0e0e0f'
    }
};
const THEME_ORDER = ['navy', 'ivory', 'black'];
const THEME_LABELS = { navy: 'Navy', ivory: 'Ivory', black: 'Black' };

// Minimal HTML escaping for any value that originated from user input.
function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// "KES 40,999" — whole shillings, comma grouped, no decimals.
function money(amount) {
    const n = Math.round(Number(amount) || 0);
    return 'KES ' + n.toLocaleString('en-US');
}

// "29 June 2026" from a timestamp/Date (falls back to no date on bad input).
function formatDate(value) {
    const d = value ? new Date(value) : new Date();
    if (isNaN(d.getTime())) return '';
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const PAYMENT_LABELS = {
    cod: 'Cash on Delivery',
    mpesa: 'M-Pesa',
    bank: 'Bank Transfer'
};

// The customer-facing payment line, e.g. "M-Pesa : 0745853914".
function paymentLine(order, settings) {
    const label = PAYMENT_LABELS[order.payment_method] || order.payment_method || 'Cash on Delivery';
    // Guest/manual receipts show the reference the customer/admin typed
    // (e.g. an M-Pesa code). Website orders keep the store's pay-to number.
    const manual = order.source && order.source !== 'website';
    if (manual && order.payment_reference && order.payment_method !== 'cod') {
        return `${label} : ${esc(order.payment_reference)}`;
    }
    if (order.payment_method === 'mpesa') {
        let ref = '';
        switch (settings.mpesa_type) {
            case 'paybill':
                ref = [settings.mpesa_paybill_number, settings.mpesa_paybill_account]
                    .filter(Boolean).join(' / ');
                break;
            case 'till':
                ref = settings.mpesa_till_number || '';
                break;
            default:
                ref = settings.mpesa_phone || '';
        }
        return ref ? `${label} : ${esc(ref)}` : label;
    }
    if (order.payment_method === 'bank' && settings.bank_account_number) {
        return `${label} : ${esc(settings.bank_account_number)}`;
    }
    return label;
}

// Human status for the receipt header.
function statusLine(order) {
    if (order.payment_status === 'paid') return 'Paid';
    if (order.payment_method === 'cod') return 'Payment on Delivery';
    return 'Awaiting Payment';
}

// Build the CSS variable block for one theme, scoped by [data-theme="..."].
function themeVars(name) {
    const t = THEMES[name];
    return `[data-theme="${name}"]{
        --bg:${t.bg};--heading:${t.heading};--body:${t.body};--gold:${t.gold};
        --sub:${t.sub};--frame:${t.frame};--panel:${t.panel};--on-gold:${t.onGold};
    }`;
}

/**
 * @param {object} order    Order row joined with customer name/email.
 * @param {Array}  items    [{ name, quantity, price }, ...]
 * @param {object} settings payment_settings map (setting_key -> value).
 * @param {object} [opts]   { theme: 'navy'|'ivory'|'black' }
 * @returns {string} Complete HTML document.
 */
function renderReceiptPage(order, items = [], settings = {}, opts = {}) {
    const theme = THEMES[opts.theme] ? opts.theme : 'navy';

    const id = Number(order.id) || 0;
    const created = order.created_at;
    const year = (created ? new Date(created) : new Date()).getFullYear();

    // Numbers can be auto-derived from the order id (website orders) or supplied
    // verbatim (manual receipts for off-website sales).
    const receiptNo = opts.receiptNo || `CB-${year}-${String(id).padStart(6, '0')}`;
    const orderNo = opts.orderNo || `ORD-${String(id).padStart(5, '0')}`;
    const showOrderNo = opts.showOrderNo !== false;

    const subtotal = items.reduce(
        (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0),
        0
    );
    const pointsDiscount = Number(order.discount_from_points) || 0;
    const total = Number(order.total) || 0;
    // Explicit delivery (manual mode) wins; otherwise infer any positive
    // remainder, since orders have no dedicated delivery column.
    const delivery = opts.delivery != null
        ? Math.max(0, Math.round(Number(opts.delivery) || 0))
        : Math.max(0, Math.round(total - (subtotal - pointsDiscount)));

    const customerName = order.user_name || order.customer_name || 'Valued Customer';
    const customerPhone = order.phone || '';
    const customerWhatsapp = order.whatsapp || '';
    const deliveryLocation = order.delivery_location || order.shipping_address || '';
    const orderNotes = order.notes || '';

    const paymentDisplay = opts.paymentText ? esc(opts.paymentText) : paymentLine(order, settings);
    const statusDisplay = esc(opts.statusText || statusLine(order));

    // Before payment the document is an INVOICE; once paid it becomes a RECEIPT.
    const isPaid = opts.statusText
        ? opts.statusText === 'Paid'
        : order.payment_status === 'paid';
    const docType = isPaid ? 'Receipt' : 'Invoice';

    const itemRows = items.map(it => `
        <tr>
            <td class="qty">${Number(it.quantity) || 0} &times;</td>
            <td class="desc">${esc(it.name)}</td>
            <td class="amt">${money((Number(it.price) || 0) * (Number(it.quantity) || 0))}</td>
        </tr>
    `).join('');

    const themeButtons = THEME_ORDER.map(name =>
        `<button type="button" data-set="${name}" onclick="setTheme('${name}')">${THEME_LABELS[name]}</button>`
    ).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(receiptNo)} - Crevia Beauty ${docType}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,500&family=Pinyon+Script&family=Inter:wght@300;400;500;600;700&family=Cinzel:wght@600;700&family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
    ${themeVars('navy')}
    ${themeVars('ivory')}
    ${themeVars('black')}
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: Montserrat, Inter, Arial, sans-serif;
        background: #d9d9e0;
        color: var(--body);
        padding: 24px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .sheet {
        width: 80mm;
        max-width: 100%;
        margin: 0 auto;
        background: var(--bg);
        color: var(--body);
        box-shadow: 0 14px 48px rgba(16,18,39,0.30);
        overflow: hidden;
    }
    .head {
        text-align: center;
        padding: 30px 22px 22px;
        border-bottom: 1px solid var(--frame);
    }
    /* Theme-adaptive logo sits directly on the header gradient (no plate).
       The switcher toggles data-theme, so CSS picks the right variant live. */
    .head .logo { display: none; width: 172px; height: auto; margin: 0 auto; }
    [data-theme="ivory"] .head .logo-dark { display: block; }
    [data-theme="navy"] .head .logo-light,
    [data-theme="black"] .head .logo-light { display: block; }
    .head .mark {
        font-family: Cinzel, "Playfair Display", Georgia, serif;
        font-size: 22px;
        letter-spacing: 5px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--heading);
    }
    .head .tagline {
        font-family: "Pinyon Script", "Playfair Display", cursive;
        color: var(--gold);
        font-size: 21px;
        margin-top: 8px;
    }
    .head .contact {
        font-family: Inter, sans-serif;
        font-size: 10px;
        color: var(--sub);
        margin-top: 12px;
        letter-spacing: 0.5px;
        line-height: 1.6;
    }
    .head .contact span { display: block; }
    .body { padding: 20px 22px; }
    .doctype {
        display: flex; align-items: center; justify-content: center; gap: 10px;
        margin-bottom: 16px;
    }
    .doctype .doctype-label {
        font-family: Montserrat, sans-serif; font-size: 14px; font-weight: 700;
        letter-spacing: 5px; text-transform: uppercase; color: var(--heading);
    }
    .doctype .paid-stamp {
        font-family: Montserrat, sans-serif; font-size: 11px; font-weight: 700;
        letter-spacing: 2px; text-transform: uppercase; color: #1c7a3f;
        border: 2px solid #1c7a3f; border-radius: 5px; padding: 2px 8px;
        transform: rotate(-6deg);
    }
    .meta { border-bottom: 1px dashed var(--frame); padding-bottom: 14px; margin-bottom: 14px; }
    .stack { padding: 5px 0; }
    .stack .k { display: block; color: var(--sub); font-family: Inter, sans-serif; font-size: 12px; }
    .stack .v { display: block; color: var(--heading); font-weight: 600; font-size: 12.5px; margin-top: 2px; line-height: 1.4; white-space: pre-wrap; }
    .notes-block { margin-top: 14px; padding-bottom: 0; border-bottom: none; }
    .notes-block .stack .v { font-weight: 500; }
    .row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
    .row .k { color: var(--sub); font-family: Inter, sans-serif; }
    .row .v { font-weight: 600; text-align: right; color: var(--heading); }
    .section-title {
        font-family: Montserrat, sans-serif;
        font-size: 10px;
        letter-spacing: 2.5px;
        text-transform: uppercase;
        color: var(--gold);
        font-weight: 700;
        margin: 4px 0 8px;
    }
    .block { border-bottom: 1px dashed var(--frame); padding-bottom: 14px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    .items td { font-size: 12px; padding: 5px 0; vertical-align: top; color: var(--body); }
    .items .qty { color: var(--sub); white-space: nowrap; width: 30px; }
    .items .desc { padding: 5px 8px; color: var(--heading); }
    .items .amt { text-align: right; white-space: nowrap; font-weight: 600; color: var(--heading); }
    .totals .row { padding: 4px 0; }
    .grand {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--gold);
        color: var(--on-gold);
        padding: 13px 16px;
        margin-top: 12px;
        border-radius: 4px;
    }
    .grand .lbl { font-family: Montserrat, sans-serif; font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; font-weight: 700; }
    .grand .val { font-family: "Playfair Display", Georgia, serif; font-size: 19px; font-weight: 700; }
    .foot { text-align: center; padding: 6px 22px 28px; }
    .foot .thanks { font-family: "Playfair Display", Georgia, serif; font-style: italic; font-size: 13px; color: var(--heading); }
    .foot .ig { font-family: Inter, sans-serif; font-size: 10.5px; color: var(--sub); margin-top: 6px; letter-spacing: 0.5px; }

    .toolbar { max-width: 80mm; margin: 22px auto 0; text-align: center; }
    .toolbar .themes { font-family: Inter, sans-serif; font-size: 11px; color: #555; margin-bottom: 10px; letter-spacing: 1px; }
    .toolbar .themes button {
        font-family: Inter, sans-serif; font-size: 11px; letter-spacing: 1px;
        background: #fff; color: #333; border: 1px solid #c9c9d2;
        padding: 6px 14px; margin: 0 3px; border-radius: 20px; cursor: pointer;
    }
    .toolbar .themes button.active { background: #15173a; color: #f3ede2; border-color: #15173a; }
    .toolbar .print {
        font-family: Montserrat, sans-serif;
        background: #15173a; color: #f3ede2; border: 1px solid #d4af6a;
        padding: 11px 28px; font-size: 13px; letter-spacing: 1px;
        border-radius: 4px; cursor: pointer;
    }
    .toolbar .print:hover { background: #d4af6a; color: #15173a; }
    @media print {
        body { background: #fff; padding: 0; }
        .sheet { box-shadow: none; width: 80mm; }
        .toolbar { display: none; }
        @page { margin: 6mm; }
    }
</style>
</head>
<body data-theme="${theme}">
    <div class="sheet">
        <div class="head">
            ${LOGO_MARKUP}
            <div class="tagline">Discover Your Signature Scent</div>
            <div class="contact"><span>www.creviabeauty.com</span><span>support@creviabeauty.com</span></div>
        </div>
        <div class="body">
            <div class="doctype">
                <span class="doctype-label">${docType}</span>
                ${isPaid ? '<span class="paid-stamp">Paid</span>' : ''}
            </div>
            <div class="meta">
                <div class="row"><span class="k">Receipt No</span><span class="v">${esc(receiptNo)}</span></div>
                ${showOrderNo ? `<div class="row"><span class="k">Order No</span><span class="v">${esc(orderNo)}</span></div>` : ''}
                <div class="row"><span class="k">Date</span><span class="v">${esc(formatDate(created))}</span></div>
                <div class="row"><span class="k">Payment</span><span class="v">${paymentDisplay}</span></div>
                <div class="row"><span class="k">Status</span><span class="v">${statusDisplay}</span></div>
            </div>

            <div class="block">
                <div class="section-title">Customer</div>
                <div class="row"><span class="k">Name</span><span class="v">${esc(customerName)}</span></div>
                ${customerPhone ? `<div class="row"><span class="k">Phone</span><span class="v">${esc(customerPhone)}</span></div>` : ''}
                ${customerWhatsapp ? `<div class="row"><span class="k">WhatsApp</span><span class="v">${esc(customerWhatsapp)}</span></div>` : ''}
                ${deliveryLocation ? `<div class="stack"><span class="k">Delivery</span><span class="v">${esc(deliveryLocation)}</span></div>` : ''}
            </div>

            <div class="block">
                <div class="section-title">Items</div>
                <table class="items">
                    ${itemRows || '<tr><td colspan="3" style="color:var(--sub);font-size:12px;">No items</td></tr>'}
                </table>
            </div>

            <div class="totals">
                <div class="row"><span class="k">Subtotal</span><span class="v">${money(subtotal)}</span></div>
                ${pointsDiscount > 0 ? `<div class="row"><span class="k">Points Discount</span><span class="v">- ${money(pointsDiscount)}</span></div>` : ''}
                <div class="row"><span class="k">Delivery</span><span class="v">${delivery > 0 ? money(delivery) : 'KES 00'}</span></div>
                <div class="grand">
                    <span class="lbl">Total</span>
                    <span class="val">${money(total)}</span>
                </div>
            </div>

            ${orderNotes ? `
            <div class="block notes-block">
                <div class="section-title">Notes</div>
                <div class="stack"><span class="v">${esc(orderNotes)}</span></div>
            </div>` : ''}
        </div>
        <div class="foot">
            <div class="thanks">Thank you for choosing Crevia Beauty</div>
            <div class="ig">Instagram: @creviabeauty</div>
        </div>
    </div>
    <div class="toolbar">
        <div class="themes">Collection: ${themeButtons}</div>
        <button type="button" class="print" onclick="window.print()">Print / Save as PDF</button>
    </div>
    <script>
        function setTheme(name) {
            document.body.setAttribute('data-theme', name);
            document.querySelectorAll('.themes button').forEach(b =>
                b.classList.toggle('active', b.dataset.set === name));
        }
        setTheme(document.body.getAttribute('data-theme') || 'navy');
        // Auto-open the print dialog when the page is requested with ?print=1
        if (new URLSearchParams(location.search).get('print') === '1') {
            window.addEventListener('load', () => setTimeout(() => window.print(), 400));
        }
    </script>
</body>
</html>`;
}

module.exports = { renderReceiptPage };
