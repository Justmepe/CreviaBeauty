/**
 * Receipt Builder Page
 *
 * A brand-styled form for creating a receipt by hand. Two modes:
 *   - 'admin' : admin issues a receipt for an off-website sale. Can set status
 *               and brand collection. Posts to /api/receipts/manual.
 *   - 'guest' : a public link a customer fills in themselves. The submission is
 *               saved as an order, pings the admin, and returns the receipt.
 *               Posts to /api/receipts/guest.
 *
 * Both submit a normal urlencoded form, so the server response (the rendered
 * receipt) simply replaces the page, ready to print / save as PDF.
 *
 * Pure function: returns an HTML string.
 */

function renderReceiptBuilderPage(mode = 'guest') {
    const isAdmin = mode === 'admin';
    const action = isAdmin ? '/api/receipts/manual' : '/api/receipts/guest';
    const title = isAdmin ? 'New Receipt' : 'Request Your Receipt';
    const intro = isAdmin
        ? 'Issue a branded receipt for a sale. It is saved to Orders and a receipt is generated to print or save as PDF.'
        : 'Enter your order details below and we will generate your Crevia Beauty receipt instantly.';
    const submitLabel = isAdmin ? 'Generate Receipt' : 'Get My Receipt';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - Crevia Beauty</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Pinyon+Script&family=Inter:wght@300;400;500;600;700&family=Cinzel:wght@600;700&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
    :root {
        --navy:#15173a; --navy-deep:#101227; --gold:#d4af6a; --ivory:#f3ede2;
        --ink:#2a2a33; --muted:#8a8a99; --line:#e3e0e8;
    }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:Montserrat,Inter,Arial,sans-serif; background:#eceaf0; color:var(--ink); padding:24px 16px; }
    .wrap { max-width:560px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 14px 48px rgba(16,18,39,0.18); }
    .top { background:linear-gradient(160deg,var(--navy-deep),var(--navy) 60%,#222c57); color:var(--ivory); padding:30px 26px 24px; text-align:center; }
    .top .mark { font-family:Cinzel,"Playfair Display",serif; font-size:20px; letter-spacing:5px; font-weight:700; text-transform:uppercase; }
    .top .tagline { font-family:"Pinyon Script",cursive; color:var(--gold); font-size:20px; margin-top:6px; }
    .top h1 { font-family:"Playfair Display",Georgia,serif; font-size:22px; font-weight:700; margin-top:14px; color:#fff; }
    .top p { font-family:Inter,sans-serif; font-size:12.5px; color:rgba(243,237,226,0.7); margin-top:8px; line-height:1.5; }
    form { padding:24px 26px 28px; }
    .field { margin-bottom:16px; }
    label { display:block; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:var(--muted); font-weight:600; margin-bottom:6px; }
    input, select {
        width:100%; padding:11px 12px; font-size:14px; font-family:inherit; color:var(--ink);
        border:1px solid var(--line); border-radius:7px; background:#fbfbfd;
    }
    input:focus, select:focus { outline:none; border-color:var(--gold); background:#fff; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .section { font-family:Montserrat,sans-serif; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:var(--gold); font-weight:700; margin:22px 0 10px; }
    .items-head, .item-row { display:grid; grid-template-columns:1fr 56px 96px 32px; gap:8px; align-items:center; }
    .items-head { font-size:10px; letter-spacing:1px; text-transform:uppercase; color:var(--muted); margin-bottom:6px; }
    .item-row { margin-bottom:8px; }
    .item-row input { padding:9px 10px; }
    .item-row .del { border:1px solid var(--line); background:#fff; color:#c0392b; border-radius:6px; height:38px; cursor:pointer; font-size:16px; line-height:1; }
    .add { background:none; border:1px dashed var(--gold); color:#9a7327; padding:9px 14px; border-radius:7px; cursor:pointer; font-family:inherit; font-size:13px; margin-top:4px; }
    .totals { margin-top:18px; border-top:1px dashed var(--line); padding-top:14px; }
    .totals .row { display:flex; justify-content:space-between; font-size:13px; padding:3px 0; }
    .totals .grand { font-family:"Playfair Display",serif; font-weight:700; font-size:18px; color:var(--navy); }
    .submit { width:100%; margin-top:22px; background:var(--navy); color:var(--ivory); border:1px solid var(--gold); padding:14px; font-size:14px; letter-spacing:1px; font-family:Montserrat,sans-serif; border-radius:8px; cursor:pointer; }
    .submit:hover { background:var(--gold); color:var(--navy); }
    .hint { font-size:11px; color:var(--muted); margin-top:6px; }
</style>
</head>
<body>
    <div class="wrap">
        <div class="top">
            <div class="mark">Crevia Beauty</div>
            <div class="tagline">Discover Your Signature Scent</div>
            <h1>${title}</h1>
            <p>${intro}</p>
        </div>
        <form method="POST" action="${action}">
            <div class="grid2">
                <div class="field">
                    <label>Customer Name</label>
                    <input type="text" name="customerName" required maxlength="120" placeholder="Full name">
                </div>
                <div class="field">
                    <label>Phone</label>
                    <input type="text" name="phone" maxlength="40" placeholder="07xx xxx xxx">
                </div>
            </div>
            <div class="grid2">
                <div class="field">
                    <label>Payment Method</label>
                    <select name="paymentMethod">
                        <option value="cod">Cash on Delivery</option>
                        <option value="mpesa">M-Pesa</option>
                        <option value="bank">Bank Transfer</option>
                    </select>
                </div>
                <div class="field">
                    <label>Payment Reference <span style="text-transform:none;font-weight:400;">(optional)</span></label>
                    <input type="text" name="paymentRef" maxlength="60" placeholder="M-Pesa code / number">
                </div>
            </div>
            ${isAdmin ? `
            <div class="grid2">
                <div class="field">
                    <label>Status</label>
                    <select name="status">
                        <option value="cod">Payment on Delivery</option>
                        <option value="paid">Paid</option>
                        <option value="awaiting">Awaiting Payment</option>
                    </select>
                </div>
                <div class="field">
                    <label>Collection</label>
                    <select name="theme">
                        <option value="navy">Navy (default)</option>
                        <option value="ivory">Ivory (gift)</option>
                        <option value="black">Black (VIP)</option>
                    </select>
                </div>
            </div>` : ''}

            <div class="section">Items</div>
            <div class="items-head">
                <span>Description</span><span>Qty</span><span>Unit (KES)</span><span></span>
            </div>
            <div id="items"></div>
            <button type="button" class="add" onclick="addRow()">+ Add item</button>

            <div class="field" style="margin-top:18px;max-width:200px;">
                <label>Delivery Fee (KES)</label>
                <input type="number" name="delivery" min="0" step="1" value="0" oninput="recalc()">
            </div>

            <div class="totals">
                <div class="row"><span>Subtotal</span><span id="t-sub">KES 0</span></div>
                <div class="row"><span>Delivery</span><span id="t-del">KES 0</span></div>
                <div class="row grand"><span>Total</span><span id="t-grand">KES 0</span></div>
            </div>

            <button type="submit" class="submit">${submitLabel}</button>
            ${isAdmin ? '' : '<p class="hint">Your receipt opens on the next screen, ready to save or print.</p>'}
        </form>
    </div>
    <script>
        function fmt(n){ return 'KES ' + (Math.round(n)||0).toLocaleString('en-US'); }
        function rowTemplate(){
            return '<div class="item-row">' +
                '<input type="text" name="desc[]" placeholder="e.g. Chanel Coco Mademoiselle EDP 100ml" maxlength="120">' +
                '<input type="number" name="qty[]" min="1" step="1" value="1" oninput="recalc()">' +
                '<input type="number" name="price[]" min="0" step="1" placeholder="0" oninput="recalc()">' +
                '<button type="button" class="del" onclick="this.parentNode.remove();recalc()">&times;</button>' +
                '</div>';
        }
        function addRow(){ document.getElementById('items').insertAdjacentHTML('beforeend', rowTemplate()); }
        function recalc(){
            let sub = 0;
            document.querySelectorAll('#items .item-row').forEach(r => {
                const q = parseFloat(r.querySelector('[name="qty[]"]').value) || 0;
                const p = parseFloat(r.querySelector('[name="price[]"]').value) || 0;
                sub += q * p;
            });
            const del = parseFloat(document.querySelector('[name="delivery"]').value) || 0;
            document.getElementById('t-sub').textContent = fmt(sub);
            document.getElementById('t-del').textContent = fmt(del);
            document.getElementById('t-grand').textContent = fmt(sub + del);
        }
        addRow();
    </script>
</body>
</html>`;
}

module.exports = { renderReceiptBuilderPage };
