/**
 * Server-side renderer for /product/:id/:slug
 * The dedicated product page: full details, image zoom + lens, fragrance notes.
 * Server-rendered so Google + social sharing get real meta + content; the zoom
 * and gallery are wired by a small inline script.
 *
 * Layout (matches fragrancenet): a compact TOP row [ image | buy box ] with the
 * hover-zoom, then the long content (description, notes, details) FULL-WIDTH
 * below — so there's no giant empty gap beside a tall description.
 */

const { escapeHtml } = require('../middleware/sanitizer');

const BASE_URL = 'https://creviabeauty.com';

function slugify(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'product';
}

function money(n) {
    return 'KSh ' + Number(n || 0).toLocaleString('en-KE');
}

// Fractional star rating: a grey 5-star base with a gold overlay clipped to %.
function starHtml(avg) {
    const pct = Math.max(0, Math.min(100, (Number(avg) || 0) / 5 * 100));
    return `<span class="pd-stars"><span class="pd-stars-bg">★★★★★</span><span class="pd-stars-fill" style="width:${pct}%">★★★★★</span></span>`;
}

function reviewDate(d) {
    try { return new Date(d).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return ''; }
}

// Rich-text formatter (ported from the storefront's renderRichText so the page
// matches the modal): **bold**, *italic*, _italic_, "- "/"* " bullet lists,
// numbered lists, blank-line paragraphs.
// Some generated descriptions are a single blob with inline " - Item" bullets
// and no line breaks. If we see 2+ such markers, break them onto their own
// lines so the list renderer below picks them up.
function normalizeInlineBullets(raw) {
    if (/\r?\n/.test(raw)) return raw;                 // already has line breaks
    if ((raw.match(/ - (?=[A-Z0-9])/g) || []).length < 2) return raw;
    return raw.replace(/ - (?=[A-Z0-9])/g, '\n- ');
}

function renderDescription(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const esc = escapeHtml(normalizeInlineBullets(raw));
    const inline = (s) => s
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
        .replace(/_([^_\n]+)_/g, '<em>$1</em>');
    const lines = esc.split(/\r?\n/);
    let html = '', listType = null, para = [];
    const flushPara = () => { if (para.length) { html += '<p>' + para.join('<br>') + '</p>'; para = []; } };
    const closeList = () => { if (listType) { html += '</' + listType + '>'; listType = null; } };
    for (const line of lines) {
        const t = line.trim();
        const bullet = t.match(/^[-*]\s+(.*)/);
        const numbered = t.match(/^\d+[.)]\s+(.*)/);
        if (bullet) {
            flushPara();
            if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; }
            html += '<li>' + inline(bullet[1]) + '</li>';
        } else if (numbered) {
            flushPara();
            if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; }
            html += '<li>' + inline(numbered[1]) + '</li>';
        } else if (t === '') {
            flushPara(); closeList();
        } else {
            closeList();
            para.push(inline(t));
        }
    }
    flushPara(); closeList();
    return html;
}

function absUrl(u) {
    if (!u) return '';
    return u.startsWith('http') ? u : BASE_URL + u;
}

function renderProductPage(product) {
    const slug = slugify(product.name);
    const url = `${BASE_URL}/product/${product.id}/${slug}`;
    const title = escapeHtml(product.name);
    const metaDesc = escapeHtml((product.description || '').replace(/\s+/g, ' ').trim().slice(0, 160));
    const ogImage = absUrl(product.image_url) || `${BASE_URL}/images/og-image.jpg`;
    const brand = escapeHtml(product.brand || '');
    const category = escapeHtml(product.category || 'Beauty');

    const images = (Array.isArray(product.images) && product.images.length)
        ? product.images
        : [product.image_url].filter(Boolean);
    const cover = images[0] || '';

    const thumbs = images.length > 1 ? `
        <div class="pd-thumbs">
            ${images.map((u, i) => `
                <button type="button" class="pd-thumb${i === 0 ? ' active' : ''}" data-src="${escapeHtml(u)}">
                    <img src="${escapeHtml(u)}" alt="" loading="lazy">
                </button>`).join('')}
        </div>` : '';

    // Fragrance notes pyramid
    const byTier = { top: [], heart: [], base: [] };
    (product.notes || []).forEach(n => { if (byTier[n.tier]) byTier[n.tier].push(n); });
    const noteRow = (label, arr) => arr.length ? `
        <div class="pd-note-row">
            <span class="pd-note-label">${label} notes</span>
            <div class="pd-note-chips">
                ${arr.map(n => `
                    <span class="pd-note-chip" tabindex="0">
                        <span class="pd-note-thumb">${n.image_url
                            ? `<img src="${escapeHtml(n.image_url)}" alt="${escapeHtml(n.note_name)}" loading="lazy">`
                            : '<span class="pd-note-empty">✿</span>'}</span>
                        <span>${escapeHtml(n.note_name)}</span>
                    </span>`).join('')}
            </div>
        </div>` : '';
    const notesBlock = (product.notes && product.notes.length) ? `
        <section class="pd-block pd-notes">
            <h2>Fragrance notes</h2>
            ${noteRow('Top', byTier.top)}
            ${noteRow('Heart', byTier.heart)}
            ${noteRow('Base', byTier.base)}
        </section>` : '';

    // Badges + attribute chips
    const badges = [];
    if (product.is_authentic_verified) badges.push('<span class="pd-badge pd-badge-auth">✓ Verified Authentic</span>');
    if (product.is_local_brand) badges.push('<span class="pd-badge pd-badge-local">🇰🇪 Made in Kenya</span>');
    if (product.is_sample) badges.push('<span class="pd-badge pd-badge-sample">Trial Size</span>');
    if (product.size) badges.push(`<span class="pd-badge pd-badge-size">${escapeHtml(product.size)}</span>`);
    const chips = [];
    if (product.scent_family) chips.push(`Scent: ${escapeHtml(product.scent_family)}`);
    if (product.skin_type) chips.push(`Skin: ${escapeHtml(product.skin_type)}`);
    if (product.hair_texture) chips.push(`Hair: ${escapeHtml(product.hair_texture)}`);

    const ingredients = product.ingredients ? `
        <details class="pd-details-sec"><summary>Ingredients</summary><p>${escapeHtml(product.ingredients)}</p></details>` : '';
    const allergens = product.allergens ? `
        <details class="pd-details-sec"><summary>Allergens &amp; sensitivities</summary><p>${escapeHtml(product.allergens)}</p></details>` : '';

    const hasDiscount = product.discount > 0;
    const priceBlock = `
        <div class="pd-price">
            <span class="pd-price-now" data-kes="${Number(product.price) || 0}">${money(product.price)}</span>
            ${product.original_price && hasDiscount ? `<span class="pd-price-was">${money(product.original_price)}</span>` : ''}
            ${hasDiscount ? `<span class="pd-price-off">-${product.discount}%</span>` : ''}
        </div>`;

    const descHtml = renderDescription(product.description);

    // Reviews: star summary (near price) + list (bottom, jump target #reviews).
    const rs = product.reviewStats || { avg: 0, count: 0 };
    const ratingBlock = rs.count ? `
        <a class="pd-rating" href="#reviews">${starHtml(rs.avg)}
            <span class="pd-rating-meta">${rs.avg.toFixed(1)} · ${rs.count} review${rs.count === 1 ? '' : 's'}</span>
        </a>` : '';
    const reviewsBlock = rs.count ? `
        <section class="pd-block pd-reviews" id="reviews">
            <h2>Reviews (${rs.count})</h2>
            <div class="pd-reviews-summary">${starHtml(rs.avg)} <strong>${rs.avg.toFixed(1)}</strong> out of 5 · based on ${rs.count} review${rs.count === 1 ? '' : 's'}</div>
            ${(product.reviews || []).map(r => `
                <div class="pd-review">
                    <div class="pd-review-head">${starHtml(r.rating)} <strong>${escapeHtml(r.customer_name)}</strong> <span class="pd-review-date">${reviewDate(r.created_at)}</span></div>
                    ${r.review_text ? `<p>${escapeHtml(r.review_text)}</p>` : ''}
                </div>`).join('')}
        </section>` : '';

    const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        image: ogImage,
        description: (product.description || '').replace(/\s+/g, ' ').trim().slice(0, 300),
        brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
        category: product.category || undefined,
        offers: {
            '@type': 'Offer',
            url,
            priceCurrency: 'KES',
            price: Number(product.price || 0),
            availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
        }
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}${brand ? ' — ' + brand : ''} | CreviaBeauty Kenya</title>
<link rel="icon" type="image/png" href="/assets/favicon.png?v=2">
<meta name="description" content="${metaDesc}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${metaDesc}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:locale" content="en_KE">
<meta property="og:site_name" content="CreviaBeauty">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${metaDesc}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">
<script type="application/ld+json">${jsonLd}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
    :root { --navy:#1a1a2e; --gold:#c9a55a; --gold-ink:#a8853f; --ink:#2b2b35; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:'Inter',-apple-system,sans-serif; color:var(--ink); background:#fff; }
    a { color:inherit; }
    .navbar { position:sticky; top:0; z-index:100; background:var(--navy); box-shadow:0 2px 15px rgba(0,0,0,0.3); }
    .nav-content { max-width:1200px; margin:0 auto; padding:0.7rem 1.5rem; display:flex; align-items:center; justify-content:space-between; gap:1.25rem; }
    .logo { display:inline-flex; align-items:center; font-family:'Playfair Display',serif; font-size:1.5rem; font-weight:700; color:#fff; text-decoration:none; }
    .logo img { height:38px; width:38px; border-radius:50%; object-fit:cover; background:#fff; margin-right:10px; }
    .logo b { color:var(--gold); }
    .nav-links { display:flex; gap:1.1rem; list-style:none; margin:0; padding:0; }
    .nav-links a { color:rgba(255,255,255,0.9); text-decoration:none; font-size:0.9rem; font-weight:500; }
    .nav-links a:hover { color:var(--gold); }
    @media (max-width:640px){ .nav-links{ display:none; } }

    .pd-wrap { max-width:1200px; margin:0 auto; padding:1.4rem 1.5rem 3rem; }
    .pd-crumbs { font-size:0.82rem; color:#8a8a94; margin-bottom:1rem; }
    .pd-crumbs a { color:var(--gold-ink); text-decoration:none; }

    /* Top row: image + buy box, kept compact so nothing stretches into whitespace */
    .pd-top { position:relative; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:2.2rem; align-items:start; }
    @media (max-width:820px){ .pd-top { grid-template-columns:1fr; } }

    .pd-media { position:relative; }
    .pd-image-main { position:relative; background:#f8f9fa; border-radius:16px; overflow:hidden; display:flex; align-items:center; justify-content:center; padding:16px; cursor:zoom-in; }
    .pd-image-main img { width:100%; height:auto; max-height:62vh; object-fit:contain; display:block; }
    .pd-zoom-lens { position:absolute; display:none; border:1.5px solid rgba(120,80,30,0.55); background:rgba(201,162,75,0.18); pointer-events:none; z-index:5; }
    .pd-thumbs { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
    .pd-thumb { width:66px; height:66px; padding:0; border:2px solid transparent; border-radius:8px; overflow:hidden; cursor:pointer; background:#fff; }
    .pd-thumb.active { border-color:var(--gold); }
    .pd-thumb img { width:100%; height:100%; object-fit:cover; display:block; }

    /* Hover magnifier: floats to the RIGHT of the image, over the buy box (transient) */
    .pd-zoom-panel { position:absolute; background:#fff no-repeat; border:1px solid #ececef; border-radius:12px; box-shadow:0 14px 40px rgba(0,0,0,0.22); display:none; z-index:20; pointer-events:none; }

    .pd-cat { color:var(--gold-ink); font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; }
    .pd-title { font-family:'Playfair Display',serif; font-size:2rem; line-height:1.15; color:var(--navy); margin:0.4rem 0 0.8rem; }
    /* Star rating */
    .pd-stars { position:relative; display:inline-block; line-height:1; font-size:1.05rem; letter-spacing:2px; vertical-align:middle; }
    .pd-stars-bg { color:#dcdcdc; }
    .pd-stars-fill { position:absolute; left:0; top:0; overflow:hidden; white-space:nowrap; color:#f5a623; }
    .pd-rating { display:inline-flex; align-items:center; gap:0.5rem; text-decoration:none; margin:0 0 0.7rem; }
    .pd-rating-meta { font-size:0.85rem; color:#6b21a8; font-weight:600; text-decoration:underline; }
    .pd-rating:hover .pd-rating-meta { color:var(--navy); }
    .pd-reviews-summary { display:flex; align-items:center; gap:0.5rem; color:#555; font-size:0.95rem; margin-bottom:1rem; }
    .pd-review { border-top:1px solid #f1f1f1; padding:0.9rem 0; }
    .pd-review-head { display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; font-size:0.92rem; }
    .pd-review-date { color:#9ca3af; font-size:0.82rem; }
    .pd-review p { margin:0.5rem 0 0; color:#3a3a44; line-height:1.65; }
    .pd-badges { display:flex; flex-wrap:wrap; gap:0.4rem; margin-bottom:0.6rem; }
    .pd-badge { font-size:0.72rem; padding:0.25rem 0.6rem; border-radius:999px; font-weight:600; }
    .pd-badge-auth { background:#dcfce7; color:#166534; }
    .pd-badge-local { background:#fef3c7; color:#92400e; }
    .pd-badge-sample { background:#e0e7ff; color:#3730a3; }
    .pd-badge-size { background:#f3f4f6; color:#374151; }
    .pd-chips { display:flex; flex-wrap:wrap; gap:0.35rem; margin-bottom:0.8rem; }
    .pd-chip { font-size:0.72rem; background:#f3e8ff; color:#6b21a8; padding:0.2rem 0.5rem; border-radius:6px; }
    .pd-price { display:flex; align-items:baseline; gap:0.6rem; margin:0.9rem 0 0.4rem; }
    .pd-price-now { font-size:1.8rem; font-weight:700; color:var(--navy); }
    .pd-price-was { color:#9ca3af; text-decoration:line-through; }
    .pd-price-off { background:#e94560; color:#fff; font-size:0.75rem; font-weight:700; padding:0.15rem 0.5rem; border-radius:5px; }
    .pd-stock { font-size:0.9rem; font-weight:600; margin:0.4rem 0 1rem; }
    .pd-in { color:#16a34a; } .pd-out { color:#dc2626; }
    .pd-actions { display:flex; gap:0.8rem; margin:0.4rem 0 1rem; flex-wrap:wrap; }
    .pd-btn { border:none; border-radius:999px; padding:0.9rem 2rem; font-weight:700; cursor:pointer; font-size:0.95rem; }
    .pd-btn-cart { background:var(--gold); color:var(--navy); }
    .pd-btn-cart:hover { filter:brightness(1.06); }
    .pd-btn-out { background:transparent; border:1.5px solid var(--gold); color:var(--gold-ink); text-decoration:none; display:inline-flex; align-items:center; }
    .pd-ship { font-size:0.85rem; color:#555; border-top:1px solid #f0f0f0; padding-top:0.9rem; }

    /* Full-width content below the fold */
    .pd-below { max-width:840px; margin:2.4rem 0 0; }
    .pd-block { margin:1.6rem 0; }
    .pd-block h2, .pd-below h2 { font-family:'Playfair Display',serif; font-size:1.4rem; color:var(--navy); margin:0 0 0.9rem; }
    .pd-block h2::before, .pd-desc-wrap h2::before { content:''; display:block; width:44px; height:3px; border-radius:2px; background:var(--gold); margin-bottom:0.7rem; }
    .pd-desc { color:#3a3a44; line-height:1.8; font-size:1.02rem; }
    .pd-desc ul, .pd-desc ol { padding-left:1.2rem; margin:0.6rem 0; } .pd-desc li { margin:0.3rem 0; }
    .pd-desc strong { color:var(--navy); font-weight:700; }
    .pd-note-row { display:flex; align-items:center; gap:0.75rem; margin:0.6rem 0; }
    .pd-note-label { flex:0 0 90px; font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#666; }
    .pd-note-chips { display:flex; flex-wrap:wrap; gap:0.5rem; }
    .pd-note-chip { display:inline-flex; align-items:center; gap:0.4rem; background:#f7f7f8; border:1px solid #ececef; border-radius:999px; padding:0.2rem 0.8rem 0.2rem 0.2rem; cursor:pointer; }
    .pd-note-thumb { width:36px; height:36px; border-radius:50%; overflow:hidden; flex:0 0 auto; background:#efe7d8; display:flex; align-items:center; justify-content:center; transition:transform 0.22s, box-shadow 0.22s; }
    .pd-note-thumb img { width:100%; height:100%; object-fit:cover; }
    .pd-note-empty { color:var(--gold-ink); }
    .pd-note-chip:hover .pd-note-thumb, .pd-note-chip:focus-visible .pd-note-thumb, .pd-note-chip.zoomed .pd-note-thumb { transform:scale(2.4); box-shadow:0 6px 18px rgba(0,0,0,0.22); border:2px solid #fff; position:relative; z-index:6; }
    .pd-details-sec { margin:0.6rem 0; border-top:1px solid #f1f1f1; padding-top:0.6rem; }
    .pd-details-sec summary { font-weight:600; cursor:pointer; font-size:0.9rem; color:#444; }
    .pd-details-sec p { font-size:0.9rem; color:#555; line-height:1.6; }

    footer { background:var(--navy); color:rgba(255,255,255,0.85); margin-top:2.5rem; }
    .footer-inner { max-width:1200px; margin:0 auto; padding:2rem 1.5rem 1.2rem; }
    .footer-bottom { text-align:center; border-top:1px solid rgba(255,255,255,0.12); padding:1rem; font-size:0.85rem; color:rgba(255,255,255,0.6); }
</style>
</head>
<body>
<nav class="navbar">
    <div class="nav-content">
        <a href="/" class="logo"><img src="/assets/favicon.png?v=2" alt="CreviaBeauty">Crevia<b>Beauty</b></a>
        <ul class="nav-links">
            <li><a href="/">Home</a></li>
            <li><a href="/products">Shop All</a></li>
            <li><a href="/bundles">Bundles</a></li>
            <li><a href="/cart">Cart</a></li>
        </ul>
    </div>
</nav>

<div class="pd-wrap">
    <div class="pd-crumbs"><a href="/">Home</a> / <a href="/products?category=${encodeURIComponent(product.category || '')}">${category}</a> / ${title}</div>

    <div class="pd-top">
        <div class="pd-media">
            <div class="pd-image-main">
                <img id="pd-main-img" src="${escapeHtml(cover)}" alt="${title}">
                <div class="pd-zoom-lens"></div>
            </div>
            ${thumbs}
        </div>
        <div class="pd-buy">
            <div class="pd-cat">${category}${brand ? ' · ' + brand : ''}</div>
            <h1 class="pd-title">${title}</h1>
            ${ratingBlock}
            ${badges.length ? `<div class="pd-badges">${badges.join('')}</div>` : ''}
            ${chips.length ? `<div class="pd-chips">${chips.map(c => `<span class="pd-chip">${c}</span>`).join('')}</div>` : ''}
            ${priceBlock}
            <div class="pd-stock ${product.stock > 0 ? 'pd-in' : 'pd-out'}">${product.stock > 0 ? '✓ In Stock' : '✗ Out of Stock'}</div>
            <div class="pd-actions">
                <button class="pd-btn pd-btn-cart" onclick="addToCart(${product.id})">Add to Cart</button>
                <a class="pd-btn pd-btn-out" href="/products">Continue Shopping</a>
            </div>
            <div class="pd-ship">🚚 Free delivery in Nairobi · Countrywide shipping${product.is_authentic_verified ? ' · <a href="/authenticity" style="color:var(--gold-ink);font-weight:600;">Authenticity guarantee →</a>' : ''}</div>
        </div>
        <div class="pd-zoom-panel"></div>
    </div>

    <div class="pd-below">
        ${descHtml ? `<div class="pd-desc-wrap"><h2>Product Description</h2><div class="pd-desc">${descHtml}</div></div>` : ''}
        ${notesBlock}
        ${(ingredients || allergens) ? `<section class="pd-block">${ingredients}${allergens}</section>` : ''}
        ${reviewsBlock}
    </div>
</div>

<footer>
    <div class="footer-inner"><h3 style="font-family:'Playfair Display',serif;color:#fff;margin:0 0 0.4rem;">CreviaBeauty Kenya</h3><p style="margin:0;font-size:0.92rem;">Premium beauty in Kenya · Authenticity guaranteed · Free delivery in Nairobi.</p></div>
    <div class="footer-bottom">&copy; 2026 CreviaBeauty Kenya. All rights reserved.</div>
</footer>

<script src="/js/main.js?v=21"></script>
<script>
(function () {
    var mainImg = document.getElementById('pd-main-img');
    document.querySelectorAll('.pd-thumb').forEach(function (b) {
        b.addEventListener('click', function () {
            document.querySelectorAll('.pd-thumb').forEach(function (x) { x.classList.remove('active'); });
            b.classList.add('active');
            mainImg.src = b.getAttribute('data-src');
        });
    });
    document.querySelectorAll('.pd-note-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
            var open = chip.classList.contains('zoomed');
            document.querySelectorAll('.pd-note-chip.zoomed').forEach(function (c) { c.classList.remove('zoomed'); });
            if (!open) chip.classList.add('zoomed');
        });
    });

    // Hover-to-zoom: square lens on the photo, magnifier floats to the right.
    var wrap = document.querySelector('.pd-image-main');
    var img = document.getElementById('pd-main-img');
    var top = document.querySelector('.pd-top');
    var panel = document.querySelector('.pd-zoom-panel');
    var lens = document.querySelector('.pd-zoom-lens');
    if (wrap && img && top && panel && lens && window.matchMedia && window.matchMedia('(hover: hover) and (min-width: 821px)').matches) {
        var ZOOM = 2.6, lensSize = 0, dW = 0, dH = 0, dL = 0, dT = 0;
        function place() {
            var ir = img.getBoundingClientRect(), tr = top.getBoundingClientRect(), pad = 8;
            var nW = img.naturalWidth || ir.width, nH = img.naturalHeight || ir.height;
            var cs = Math.min(ir.width / nW, ir.height / nH);
            dW = nW * cs; dH = nH * cs; dL = ir.left + (ir.width - dW) / 2; dT = ir.top + (ir.height - dH) / 2;
            var size = Math.round(Math.min(dH, tr.width * 0.46, 480));
            lensSize = Math.round(size / ZOOM);
            panel.style.width = size + 'px'; panel.style.height = size + 'px';
            var left = (ir.right - tr.left) + 24;
            if (left + size > tr.width) left = Math.max(0, tr.width - size);
            panel.style.left = Math.round(left) + 'px';
            panel.style.top = Math.round(Math.max(pad, (dT - tr.top))) + 'px';
            panel.style.backgroundSize = Math.round(dW * ZOOM) + 'px ' + Math.round(dH * ZOOM) + 'px';
        }
        wrap.addEventListener('mouseenter', function () {
            panel.style.backgroundImage = 'url("' + (img.currentSrc || img.src) + '")';
            place();
            lens.style.width = lensSize + 'px'; lens.style.height = lensSize + 'px';
            panel.style.display = 'block'; lens.style.display = 'block';
        });
        wrap.addEventListener('mousemove', function (e) {
            var wr = wrap.getBoundingClientRect();
            var lx = Math.min(Math.max(e.clientX - dL - lensSize / 2, 0), Math.max(0, dW - lensSize));
            var ly = Math.min(Math.max(e.clientY - dT - lensSize / 2, 0), Math.max(0, dH - lensSize));
            lens.style.left = (dL - wr.left + lx) + 'px';
            lens.style.top = (dT - wr.top + ly) + 'px';
            panel.style.backgroundPosition = ((lx + lensSize / 2) / dW * 100) + '% ' + ((ly + lensSize / 2) / dH * 100) + '%';
        });
        wrap.addEventListener('mouseleave', function () {
            panel.style.display = 'none'; lens.style.display = 'none';
        });
    }
})();
</script>
</body>
</html>`;
}

module.exports = { renderProductPage, slugify };
