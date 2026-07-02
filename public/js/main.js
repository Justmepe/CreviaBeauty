// CreviaBeauty - Main JavaScript

// Utility function to escape HTML (XSS prevention)
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Render a safe markdown subset for product descriptions so they read as
// professional formatted copy instead of one block of text. Supports:
//   **bold**, *italic* / _italic_, "- "/"* " bullet lists, "1." numbered lists,
//   blank line = new paragraph, single newline = line break.
// Input is HTML-escaped FIRST and only a fixed set of safe tags is emitted,
// so this is XSS-safe even with untrusted text.
function renderRichText(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const esc = escapeHtml(raw);
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

// Extract a human-readable message from an API error response.
// The backend returns { success: false, error: { code, message, details? } } for typed errors,
// but some routes still return a plain { error: "string" } or { message: "string" } shape.
// First validation detail is preferred so users see the offending field instead of "Validation failed".
function getErrorMessage(data, fallback) {
    if (!data) return fallback || 'Something went wrong';
    const err = data.error;
    if (err && Array.isArray(err.details) && err.details[0]?.message) return err.details[0].message;
    if (err && typeof err === 'object' && err.message) return err.message;
    if (typeof err === 'string' && err) return err;
    if (typeof data.message === 'string' && data.message) return data.message;
    return fallback || 'Something went wrong';
}

// Update cart count on page load
document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    checkUserAuth();
    initMobileMenu();
});

// Initialize mobile menu
function initMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const navLinks = document.getElementById('nav-links');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!mobileMenuBtn.contains(e.target) && !navLinks.contains(e.target)) {
                navLinks.classList.remove('active');
            }
        });

        // Close menu when clicking a link (except dropdowns)
        navLinks.querySelectorAll('a').forEach(link => {
            if (!link.parentElement.classList.contains('nav-dropdown')) {
                link.addEventListener('click', () => {
                    navLinks.classList.remove('active');
                });
            }
        });
    }
}

// Check user authentication
async function checkUserAuth() {
    try {
        const response = await fetch('/api/user');
        const data = await response.json();

        if (data.loggedIn) {
            // Greet with the first name only so the navbar stays on one line
            const firstName = String(data.user.name || '').trim().split(/\s+/)[0] || 'there';
            let desktopLinks = `<span class="auth-greeting">Hi, ${escapeHtml(firstName)}</span>`;
            let mobileLinks = '';

            if (data.user.isAdmin) {
                desktopLinks += '<a href="/admin" class="btn btn-small" style="margin-right: 0.5rem;">Admin</a>';
                mobileLinks += '<a href="/admin" style="color: var(--gold) !important;">Admin Panel</a>';
            }

            if (data.user.isMarketer) {
                const statusBadge = data.user.marketerStatus === 'pending' ? ' (Pending)' : '';
                desktopLinks += `<a href="/marketer" class="btn btn-small" style="margin-right: 0.5rem; background: var(--gold); color: var(--primary);">Marketer${statusBadge}</a>`;
                mobileLinks += `<a href="/marketer" style="color: var(--gold) !important;">Marketer Dashboard${statusBadge}</a>`;
            }

            if (!data.user.isAdmin) {
                // Add unified customer dashboard link with points badge
                const pointsBadge = data.user.pointsBalance > 0 ? ` (${data.user.pointsBalance.toLocaleString()} pts)` : '';
                desktopLinks += `<a href="/customer" class="btn btn-small" style="margin-right: 0.5rem;">My Account${pointsBadge}</a>`;
                mobileLinks += `<a href="/customer" style="color: var(--gold) !important;">My Account${pointsBadge}</a>`;
            }

            desktopLinks += '<button onclick="logout()" class="btn btn-outline btn-small" style="border-color: var(--gold); color: var(--gold);">Logout</button>';
            mobileLinks += '<a href="#" onclick="logout(); return false;" style="color: #e94560 !important;">Logout</a>';

            // Update auth links (desktop)
            const authLinks = document.getElementById('auth-links');
            if (authLinks) {
                authLinks.innerHTML = desktopLinks;
            }

            // Update nav auth link (mobile)
            const navAuthLink = document.getElementById('nav-auth-link');
            if (navAuthLink) {
                navAuthLink.innerHTML = `
                    <a href="${data.user.isAdmin ? '/admin' : '/customer'}">${escapeHtml(data.user.name)}</a>
                    ${mobileLinks}
                `;
            }
        }
    } catch (error) {
        console.error('Auth check failed:', error);
    }
}

// Logout
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Logout failed:', error);
    }
}

// Update cart count
async function updateCartCount() {
    try {
        const response = await fetch('/api/cart');
        const data = await response.json();
        const countElements = document.querySelectorAll('#cart-count, .cart-count');
        countElements.forEach(el => {
            el.textContent = data.count || 0;
        });
    } catch (error) {
        console.error('Failed to update cart count:', error);
    }
}

// Format price
function formatPrice(price) {
    return `KSh ${Number(price).toLocaleString()}`;
}

// Create product card with enhanced discount display (XSS-safe)
// SEO-friendly URL for a product's dedicated page (must match server slugify).
function slugify(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'product';
}
function productUrl(product) {
    return `/product/${product.id}/${slugify(product.name)}`;
}

function createProductCard(product) {
    const hasDiscount = product.discount > 0;
    const discountBadge = hasDiscount
        ? `<div class="discount-badge">-${product.discount}% OFF</div>`
        : '';

    // Show NEW badge for products added in the last 7 days
    const createdDate = new Date(product.created_at);
    const now = new Date();
    const daysSinceCreated = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
    const isNew = daysSinceCreated < 7;
    const newBadge = isNew && !hasDiscount ? `<div class="new-badge">NEW</div>` : '';

    const originalPrice = product.original_price && hasDiscount
        ? `<span class="original-price">${formatPrice(product.original_price)}</span>`
        : '';

    // Default placeholder image
    const placeholderBg = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg,#f5f5f5 0%,#e0e0e0 100%);font-size:4rem;">
            ✨
        </div>
    `;

    // Escape user-generated content
    const safeName = escapeHtml(product.name);
    const safeCategory = escapeHtml(product.category || 'Beauty');
    const safeDescription = escapeHtml(truncateText(product.description || '', 80));
    const safeImageUrl = escapeHtml(product.image_url || '');

    const authPill = product.is_authentic_verified ? '<span class="card-pill card-pill-auth" title="Verified Authentic">✓ Authentic</span>' : '';
    const localPill = product.is_local_brand ? '<span class="card-pill card-pill-local" title="Made in Kenya">🇰🇪</span>' : '';
    const samplePill = product.is_sample ? '<span class="card-pill card-pill-sample">Trial</span>' : '';

    return `
        <div class="product-card fade-in" data-product-id="${product.id}">
            ${discountBadge}
            ${newBadge}
            <button class="wishlist-heart" data-product-id="${product.id}" onclick="event.stopPropagation(); toggleWishlist(${product.id}, this)" title="Save to wishlist">♡</button>
            <div class="product-image">
                ${product.image_url
                    ? `<img src="${safeImageUrl}" alt="${safeName}"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                       <div style="display:none;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg,#f5f5f5 0%,#e0e0e0 100%);font-size:4rem;">✨</div>`
                    : placeholderBg
                }
                <button class="quick-view" onclick="viewProduct(${product.id})">Quick View</button>
            </div>
            <div class="product-info">
                <div class="product-category">${safeCategory}${authPill}${localPill}${samplePill}</div>
                <a class="product-name" href="${productUrl(product)}">${safeName}</a>
                <div class="product-description">${safeDescription}</div>
                <div class="product-footer">
                    <div class="product-price ${hasDiscount ? 'discounted' : ''}">
                        <span data-kes="${Number(product.price) || 0}">${formatPrice(product.price)}</span>
                        ${originalPrice}
                    </div>
                    <button class="add-to-cart" onclick="addToCart(${product.id})">
                        Add to Cart
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Inject card-pill + heart styles once
(function injectCardPillStyles() {
    if (document.getElementById('card-pill-styles')) return;
    const s = document.createElement('style');
    s.id = 'card-pill-styles';
    s.textContent = `
        .card-pill { display:inline-block; font-size:0.62rem; padding:0.12rem 0.4rem; border-radius:999px; margin-left:0.35rem; font-weight:600; vertical-align:middle; }
        .card-pill-auth { background:#dcfce7; color:#166534; }
        .card-pill-local { background:#fef3c7; color:#92400e; }
        .card-pill-sample { background:#e0e7ff; color:#3730a3; }
        .product-card { position: relative; }
        a.product-name { text-decoration:none; color:inherit; display:block; cursor:pointer; transition:color 0.15s; }
        a.product-name:hover { color:#a8853f; }
        .product-card .wishlist-heart { position:absolute; top:10px; left:10px; width:36px; height:36px; border-radius:50%; border:none; background:rgba(255,255,255,0.92); cursor:pointer; font-size:1.15rem; color:#c7c7c7; box-shadow:0 2px 6px rgba(0,0,0,0.1); z-index:3; transition:all 0.15s; }
        .product-card .wishlist-heart:hover { transform:scale(1.08); color:#e11d48; }
        .product-card .wishlist-heart.active { color:#e11d48; }
    `;
    document.head.appendChild(s);
})();

// Truncate text with ellipsis
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
}

// View product (quick view modal) - XSS-safe
async function viewProduct(productId) {
    try {
        const response = await fetch(`/api/products/${productId}`);
        const product = await response.json();

        if (!product || product.error) {
            showAlert('Product not found', 'error');
            return;
        }

        // Escape user-generated content
        const safeName = escapeHtml(product.name);
        const safeCategory = escapeHtml(product.category || 'Beauty');
        const safeDescription = renderRichText(product.description || 'No description available.');
        const safeImageUrl = escapeHtml(product.image_url || '');
        const safeBrand = escapeHtml(product.brand || '');

        // Gallery: cover first, then any extra angle shots. Thumbnails only if >1.
        const galleryImages = (Array.isArray(product.images) && product.images.length)
            ? product.images
            : [product.image_url].filter(Boolean);
        const thumbsBlock = galleryImages.length > 1 ? `
            <div class="modal-thumbs">
                ${galleryImages.map((u, i) => `
                    <button type="button" class="modal-thumb${i === 0 ? ' active' : ''}" data-src="${escapeHtml(u)}" onclick="setModalImage(this)">
                        <img src="${escapeHtml(u)}" alt="" loading="lazy">
                    </button>`).join('')}
            </div>` : '';

        // Shade picker block (if product has variants)
        const variantsBlock = (product.variants && product.variants.length > 0) ? `
            <div class="modal-section">
                <div class="modal-section-title">Choose your shade</div>
                <div class="shade-picker" id="shade-picker-${product.id}">
                    ${product.variants.map((v, i) => `
                        <button type="button"
                                class="shade-swatch ${i === 0 ? 'selected' : ''}"
                                data-variant-id="${v.id}"
                                data-variant-name="${escapeHtml(v.variant_name)}"
                                onclick="selectShade(${product.id}, ${v.id}, this)"
                                title="${escapeHtml(v.variant_name)}${v.undertone ? ' · ' + escapeHtml(v.undertone) : ''}">
                            <span class="shade-dot" style="background:${escapeHtml(v.shade_hex || '#cccccc')}"></span>
                            <span class="shade-label">${escapeHtml(v.variant_name)}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="shade-selected-name" id="shade-selected-${product.id}">${escapeHtml(product.variants[0].variant_name)}</div>
            </div>
        ` : '';

        // Authenticity + sample + local-brand badge row
        const badges = [];
        if (product.is_authentic_verified) badges.push('<span class="badge badge-auth">✓ Verified Authentic</span>');
        if (product.is_local_brand)        badges.push('<span class="badge badge-local">🇰🇪 Made in Kenya</span>');
        if (product.is_sample)             badges.push('<span class="badge badge-sample">Trial Size</span>');
        if (product.size)                  badges.push(`<span class="badge badge-size">${escapeHtml(product.size)}</span>`);
        const badgesBlock = badges.length ? `<div class="modal-badges">${badges.join('')}</div>` : '';

        // Ingredients + allergens
        const ingredientsBlock = product.ingredients ? `
            <details class="modal-details-section">
                <summary>Ingredients</summary>
                <p>${escapeHtml(product.ingredients)}</p>
            </details>
        ` : '';
        const allergensBlock = product.allergens ? `
            <details class="modal-details-section">
                <summary>Allergens & sensitivities</summary>
                <p>${escapeHtml(product.allergens)}</p>
            </details>
        ` : '';

        // Wig attributes (only if any are present)
        const wigAttrs = [
            ['Texture',  product.wig_texture],
            ['Cap',      product.wig_cap_type],
            ['Origin',   product.wig_origin],
            ['Density',  product.wig_density ? product.wig_density + '%' : null]
        ].filter(([, v]) => !!v);
        const wigBlock = wigAttrs.length ? `
            <div class="modal-section">
                <div class="modal-section-title">Wig specs</div>
                <dl class="wig-specs">
                    ${wigAttrs.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join('')}
                </dl>
            </div>
        ` : '';

        // Fragrance notes pyramid (top / heart / base). Each note is a name plus a
        // little ingredient image that enlarges on hover/tap — like the reference site.
        const notesByTier = { top: [], heart: [], base: [] };
        (product.notes || []).forEach(n => { if (notesByTier[n.tier]) notesByTier[n.tier].push(n); });
        const noteRow = (label, arr) => arr.length ? `
            <div class="notes-row">
                <span class="notes-label">${label} notes</span>
                <div class="notes-chips">
                    ${arr.map(n => `
                        <span class="note-chip" tabindex="0">
                            <span class="note-thumb">${n.image_url
                                ? `<img src="${escapeHtml(n.image_url)}" alt="${escapeHtml(n.note_name)}" loading="lazy">`
                                : '<span class="note-thumb-empty">✿</span>'}</span>
                            <span class="note-name">${escapeHtml(n.note_name)}</span>
                        </span>`).join('')}
                </div>
            </div>` : '';
        const notesBlock = (product.notes && product.notes.length) ? `
            <div class="modal-section modal-notes">
                <div class="modal-section-title">Fragrance notes</div>
                ${noteRow('Top', notesByTier.top)}
                ${noteRow('Heart', notesByTier.heart)}
                ${noteRow('Base', notesByTier.base)}
            </div>` : '';

        // Scent / skin / hair filter chips
        const chips = [];
        if (product.scent_family) chips.push(`Scent: ${escapeHtml(product.scent_family)}`);
        if (product.skin_type)    chips.push(`Skin: ${escapeHtml(product.skin_type)}`);
        if (product.hair_texture) chips.push(`Hair: ${escapeHtml(product.hair_texture)}`);
        const chipsBlock = chips.length ? `<div class="modal-chips">${chips.map(c => `<span class="chip">${c}</span>`).join('')}</div>` : '';

        // Wishlist heart (if logged in we'll attempt; otherwise it'll prompt)
        const heartBtn = `<button class="modal-wishlist" onclick="toggleWishlist(${product.id}, this)" data-product-id="${product.id}" title="Save to wishlist">♡</button>`;

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'product-modal';
        modal.innerHTML = `
            <div class="product-modal-overlay" onclick="closeProductModal()"></div>
            <div class="product-modal-content">
                <button class="modal-close" onclick="closeProductModal()">&times;</button>
                <div class="modal-body">
                    <div class="modal-image">
                        <div class="modal-image-main">
                            <img id="modal-main-img" src="${safeImageUrl}" alt="${safeName}"
                                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23f5f5f5%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2255%22 text-anchor=%22middle%22 font-size=%2240%22>✨</text></svg>'">
                            ${product.discount > 0 ? `<div class="modal-discount">-${product.discount}% OFF</div>` : ''}
                            ${heartBtn}
                        </div>
                        ${thumbsBlock}
                    </div>
                    <div class="modal-details">
                        <div class="modal-category">${safeCategory}${safeBrand ? ' · ' + safeBrand : ''}</div>
                        <h2 class="modal-title"><a href="${productUrl(product)}">${safeName}</a></h2>
                        ${badgesBlock}
                        ${chipsBlock}
                        <div class="modal-description modal-teaser">${escapeHtml(truncateText((product.description || '').replace(/\s+/g, ' ').trim(), 170))}</div>
                        <div class="modal-price">
                            <span class="current-price" data-kes="${Number(product.price) || 0}">${formatPrice(product.price)}</span>
                            ${product.original_price ? `<span class="old-price">${formatPrice(product.original_price)}</span>` : ''}
                        </div>
                        <div class="modal-urgency" id="modal-urgency">
                            ${product.stock > 0 ? '<span class="in-stock">✓ In Stock</span>' : '<span class="out-stock">✗ Out of Stock</span>'}
                        </div>
                        ${variantsBlock}
                        <div class="modal-actions">
                            <button class="btn" onclick="addToCart(${product.id}); closeProductModal();">Add to Cart</button>
                            <a class="btn btn-outline" href="${productUrl(product)}">View full details →</a>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        // Live "X viewing now" + low-stock urgency (heartbeat while modal open).
        startUrgency(product.id);

        // Remember which product is open, so the image share-nudge can deep-link to it.
        window._currentProductId = product.id;
        window._currentProductName = product.name;

        // Cursor-follow zoom on the main image (desktop hover only). Moving the
        // mouse pans the magnified view; leaving resets it smoothly.
        const zoomWrap = modal.querySelector('.modal-image-main');
        const zoomImg = modal.querySelector('#modal-main-img');
        const zoomColEl = modal.querySelector('.modal-zoom-col');
        const panel = modal.querySelector('.modal-zoom-panel');
        const hint = modal.querySelector('.modal-zoom-hint');
        // Hover-to-zoom (wide desktop only): the magnified view renders in its own
        // dedicated middle column, so the photo AND the details both stay visible.
        // The panel is a CONTAINED, aspect-correct box (capped size) — the whole
        // photo is not stretched to fill the column; you get a clean magnified crop.
        if (zoomWrap && zoomImg && zoomColEl && panel && window.matchMedia && window.matchMedia('(hover: hover) and (min-width: 1025px)').matches) {
            const ZOOM = 2.6;   // magnification vs the displayed photo
            let side = 0, lensSize = 0;
            // Displayed (object-fit:contain) photo box — the ACTUAL visible image
            // inside the element, so the zoom keeps the real aspect (no stretch).
            let dispW = 0, dispH = 0, dispLeft = 0, dispTop = 0;
            // The lens: a square drawn over the photo showing which region is
            // magnified in the side panel (follows the cursor, like the reference).
            const lens = document.createElement('div');
            lens.className = 'modal-zoom-lens';
            zoomWrap.appendChild(lens);
            const place = () => {
                const ir = zoomImg.getBoundingClientRect();
                const zr = zoomColEl.getBoundingClientRect();
                const pad = 20;
                // Resolve the real displayed photo rect from its natural aspect.
                const natW = zoomImg.naturalWidth || ir.width;
                const natH = zoomImg.naturalHeight || ir.height;
                const cscale = Math.min(ir.width / natW, ir.height / natH);
                dispW = natW * cscale;
                dispH = natH * cscale;
                dispLeft = ir.left + (ir.width - dispW) / 2;
                dispTop = ir.top + (ir.height - dispH) / 2;
                // Square viewport (Instagram-style 1:1), as large as the column allows.
                side = Math.round(Math.min(zr.width - pad * 2, zr.height - pad * 2, 520));
                lensSize = Math.round(side / ZOOM); // region of the photo shown in the panel
                panel.style.width = side + 'px';
                panel.style.height = side + 'px';
                panel.style.left = Math.round((zr.width - side) / 2) + 'px';
                const imgCenterY = (ir.top + ir.height / 2) - zr.top;
                panel.style.top = Math.round(Math.max(pad, imgCenterY - side / 2)) + 'px';
                // Background sized to the DISPLAYED photo (its true aspect) so the
                // magnified crop is never stretched/elongated.
                panel.style.backgroundSize = `${Math.round(dispW * ZOOM)}px ${Math.round(dispH * ZOOM)}px`;
            };
            zoomWrap.addEventListener('mouseenter', () => {
                panel.style.backgroundImage = `url("${zoomImg.currentSrc || zoomImg.src}")`;
                place();
                lens.style.width = lensSize + 'px';
                lens.style.height = lensSize + 'px';
                panel.style.display = 'block';
                lens.style.display = 'block';
                if (hint) hint.style.visibility = 'hidden';
            });
            zoomWrap.addEventListener('mousemove', (e) => {
                const wr = zoomWrap.getBoundingClientRect();
                // Lens clamped inside the DISPLAYED photo; panel pans to match.
                const lx = Math.min(Math.max(e.clientX - dispLeft - lensSize / 2, 0), Math.max(0, dispW - lensSize));
                const ly = Math.min(Math.max(e.clientY - dispTop - lensSize / 2, 0), Math.max(0, dispH - lensSize));
                lens.style.left = (dispLeft - wr.left + lx) + 'px';
                lens.style.top = (dispTop - wr.top + ly) + 'px';
                const cx = (lx + lensSize / 2) / dispW;
                const cy = (ly + lensSize / 2) / dispH;
                panel.style.backgroundPosition = `${cx * 100}% ${cy * 100}%`;
            });
            zoomWrap.addEventListener('mouseleave', () => {
                panel.style.display = 'none';
                lens.style.display = 'none';
                if (hint) hint.style.visibility = 'visible';
            });
        }

        // Note thumbnails enlarge on hover (desktop, via CSS). On touch, a tap
        // toggles the enlarged state so mobile shoppers get the same reveal.
        modal.querySelectorAll('.note-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const wasOpen = chip.classList.contains('zoomed');
                modal.querySelectorAll('.note-chip.zoomed').forEach(c => c.classList.remove('zoomed'));
                if (!wasOpen) chip.classList.add('zoomed');
            });
        });

        // Add modal styles if not already added
        if (!document.getElementById('modal-styles')) {
            const modalStyles = document.createElement('style');
            modalStyles.id = 'modal-styles';
            modalStyles.textContent = `
                .product-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.3s ease;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .product-modal-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.8);
                }
                .product-modal-content {
                    position: relative;
                    background: white;
                    border-radius: 15px;
                    max-width: 900px;
                    width: 90%;
                    max-height: 90vh;
                    overflow: auto;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                .modal-close {
                    position: absolute;
                    top: 15px;
                    right: 20px;
                    background: none;
                    border: none;
                    font-size: 2rem;
                    cursor: pointer;
                    color: #666;
                    z-index: 10;
                    transition: color 0.3s;
                }
                .modal-close:hover {
                    color: #e94560;
                }
                .modal-body {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0;
                }
                @media (max-width: 768px) {
                    .modal-body {
                        grid-template-columns: 1fr;
                    }
                }
                .modal-image {
                    position: relative;
                    background: #f8f9fa;
                    display: flex;
                    flex-direction: column;
                }
                /* Dedicated zoom column (wide desktop) — photo + details both stay visible */
                .modal-zoom-col { position: relative; background: #fff; border-left: 1px solid #f3f3f3; }
                .modal-zoom-hint { position: absolute; top: 50%; left: 0; right: 0; transform: translateY(-50%); text-align: center; color: #c4c4c4; font-size: 0.8rem; padding: 0 1rem; }
                /* Lens: square drawn over the photo marking the magnified region */
                .modal-zoom-lens {
                    position: absolute;
                    display: none;
                    border: 1.5px solid rgba(120,80,30,0.55);
                    background: rgba(201,162,75,0.18);
                    pointer-events: none;
                    z-index: 5;
                }
                /* Contained, aspect-correct magnifier box (position/size set in JS) */
                .modal-zoom-panel {
                    position: absolute;
                    background-color: #fff;
                    background-repeat: no-repeat;
                    border: 1px solid #ececef;
                    border-radius: 10px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.18);
                    display: none;
                    z-index: 6;
                    pointer-events: none;
                }
                .modal-image-main {
                    position: relative;
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                    min-height: 0;
                    overflow: hidden;
                }
                .modal-image-main img {
                    width: 100%;
                    height: 100%;
                    max-height: 78vh;
                    object-fit: contain;   /* show the whole product photo, never crop */
                    min-height: 300px;
                    /* only the scale transitions; transform-origin tracks the cursor instantly */
                    transition: transform 0.18s ease-out;
                    transform-origin: center center;
                    will-change: transform;
                }
                .modal-thumbs {
                    display: flex;
                    gap: 8px;
                    padding: 10px 16px 16px;
                    overflow-x: auto;
                    flex-wrap: nowrap;
                }
                .modal-thumb {
                    flex: 0 0 auto;
                    width: 60px;
                    height: 60px;
                    padding: 0;
                    border: 2px solid transparent;
                    border-radius: 8px;
                    overflow: hidden;
                    cursor: pointer;
                    background: #fff;
                    transition: border-color 0.2s;
                }
                .modal-thumb.active {
                    border-color: #c9a24b;
                }
                .modal-thumb img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    display: block;
                }
                .modal-discount {
                    position: absolute;
                    top: 20px;
                    left: 20px;
                    background: #e94560;
                    color: white;
                    padding: 0.5rem 1rem;
                    border-radius: 5px;
                    font-weight: 700;
                }
                .modal-details {
                    padding: 2.5rem;
                }
                .modal-category {
                    color: #d4af6a;
                    font-size: 0.9rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    margin-bottom: 0.5rem;
                }
                .modal-title {
                    font-family: 'Playfair Display', serif;
                    font-size: 1.8rem;
                    color: #1a1a2e;
                    margin-bottom: 1rem;
                }
                .modal-title a { color: inherit; text-decoration: none; transition: color 0.15s; }
                .modal-title a:hover { color: #a8853f; }
                .modal-description {
                    color: #666;
                    line-height: 1.7;
                    margin-bottom: 1.5rem;
                }
                .modal-description p { margin: 0 0 0.85rem; }
                .modal-description p:last-child { margin-bottom: 0; }
                .modal-description ul,
                .modal-description ol { margin: 0 0 0.85rem; padding-left: 1.4rem; }
                .modal-description li { margin-bottom: 0.4rem; }
                .modal-description strong { color: #3a3a3a; font-weight: 600; }
                .modal-description em { font-style: italic; }
                .modal-price {
                    margin-bottom: 1rem;
                }
                .modal-price .current-price {
                    font-size: 1.8rem;
                    font-weight: 700;
                    color: #1a1a2e;
                }
                .modal-price .old-price {
                    font-size: 1.2rem;
                    color: #999;
                    text-decoration: line-through;
                    margin-left: 1rem;
                }
                .modal-urgency {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    flex-wrap: wrap;
                    margin-bottom: 1.5rem;
                    min-height: 1.2rem;
                }
                .modal-urgency .in-stock {
                    color: #27ae60;
                    font-weight: 500;
                }
                .modal-urgency .out-stock {
                    color: #e94560;
                    font-weight: 500;
                }
                /* Low stock — restrained amber, not an alarm */
                .modal-urgency .u-lowstock {
                    color: #b26a00;
                    font-weight: 600;
                }
                /* Live viewers — muted Navy with a soft pulsing dot (premium, not red) */
                .modal-urgency .u-viewers {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.45rem;
                    color: #1a1a2e;
                    font-size: 0.9rem;
                    font-weight: 500;
                    opacity: 0.85;
                }
                .modal-urgency .u-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #1a1a2e;
                    box-shadow: 0 0 0 0 rgba(26, 26, 46, 0.45);
                    animation: urgencyPulse 2.2s ease-out infinite;
                }
                @keyframes urgencyPulse {
                    0%   { box-shadow: 0 0 0 0 rgba(26, 26, 46, 0.45); }
                    70%  { box-shadow: 0 0 0 7px rgba(26, 26, 46, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(26, 26, 46, 0); }
                }
                .modal-actions {
                    display: flex;
                    gap: 1rem;
                    flex-wrap: wrap;
                }
                .modal-actions .btn {
                    flex: 1;
                    min-width: 150px;
                    text-align: center;
                }
            `;
            // Extra styles for new modal sections (badges, shade picker, ingredients, wig specs, wishlist heart)
            modalStyles.textContent += `
                .modal-badges { display:flex; flex-wrap:wrap; gap:0.4rem; margin:0.5rem 0 0.75rem 0; }
                .badge { font-size:0.72rem; padding:0.25rem 0.55rem; border-radius:999px; font-weight:600; letter-spacing:0.02em; }
                .badge-auth   { background:#dcfce7; color:#166534; }
                .badge-local  { background:#fef3c7; color:#92400e; }
                .badge-sample { background:#e0e7ff; color:#3730a3; }
                .badge-size   { background:#f3f4f6; color:#374151; }
                .modal-chips { display:flex; flex-wrap:wrap; gap:0.35rem; margin:0.4rem 0 0.75rem 0; }
                .chip { font-size:0.72rem; background:#f3e8ff; color:#6b21a8; padding:0.2rem 0.5rem; border-radius:6px; }
                .modal-section { margin:1rem 0 0.75rem 0; padding-top:0.75rem; border-top:1px solid #f1f1f1; }
                .modal-section-title { font-weight:700; font-size:0.85rem; margin-bottom:0.55rem; color:#333; text-transform:uppercase; letter-spacing:0.05em; }
                .shade-picker { display:grid; grid-template-columns:repeat(auto-fill, minmax(70px, 1fr)); gap:0.4rem; }
                .shade-swatch { display:flex; flex-direction:column; align-items:center; gap:0.3rem; background:transparent; border:1px solid #eee; border-radius:8px; padding:0.4rem 0.3rem; cursor:pointer; transition:all 0.15s; font-size:0.65rem; color:#555; }
                .shade-swatch:hover { border-color:#7c3aed; }
                .shade-swatch.selected { border-color:#7c3aed; background:#faf5ff; }
                .shade-dot { width:28px; height:28px; border-radius:50%; border:1px solid rgba(0,0,0,0.1); display:block; }
                .shade-label { display:block; text-align:center; line-height:1.1; }
                .shade-selected-name { margin-top:0.5rem; font-size:0.85rem; color:#6b21a8; font-weight:600; }
                .wig-specs { display:grid; grid-template-columns:auto 1fr; gap:0.3rem 1rem; font-size:0.85rem; }
                .wig-specs > div { display:contents; }
                .wig-specs dt { color:#666; font-weight:600; }
                .wig-specs dd { margin:0; color:#222; }
                /* Fragrance notes: labelled rows of ingredient chips that enlarge on hover/tap */
                .modal-notes .notes-row { display:flex; align-items:center; gap:0.75rem; margin:0.55rem 0; }
                .notes-label { flex:0 0 82px; font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#666; }
                .notes-chips { display:flex; flex-wrap:wrap; gap:0.5rem; }
                .note-chip { display:inline-flex; align-items:center; gap:0.4rem; background:#f7f7f8; border:1px solid #ececef; border-radius:999px; padding:0.2rem 0.7rem 0.2rem 0.2rem; cursor:pointer; position:relative; outline:none; }
                .note-thumb { width:34px; height:34px; border-radius:50%; overflow:hidden; flex:0 0 auto; background:#efe7d8; display:flex; align-items:center; justify-content:center; position:relative; z-index:1; transition:transform 0.22s ease, box-shadow 0.22s ease; transform-origin:center; }
                .note-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
                .note-thumb-empty { font-size:0.9rem; color:#c9a24b; }
                .note-name { font-size:0.82rem; color:#333; }
                /* the reveal — thumbnail grows over its neighbours */
                .note-chip:hover .note-thumb, .note-chip:focus-visible .note-thumb, .note-chip.zoomed .note-thumb {
                    transform:scale(2.5); z-index:6; box-shadow:0 6px 18px rgba(0,0,0,0.22); border:2px solid #fff;
                }
                .note-chip:hover, .note-chip:focus-visible, .note-chip.zoomed { z-index:6; }
                .modal-details-section { margin:0.5rem 0; border-top:1px solid #f1f1f1; padding-top:0.5rem; }
                .modal-details-section summary { font-weight:600; cursor:pointer; font-size:0.85rem; color:#444; padding:0.3rem 0; }
                .modal-details-section p { margin:0.5rem 0 0 0; font-size:0.85rem; color:#555; line-height:1.5; }
                .modal-wishlist { position:absolute; top:12px; right:60px; width:40px; height:40px; border-radius:50%; border:none; background:rgba(255,255,255,0.92); font-size:1.3rem; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.12); transition:all 0.15s; z-index:5; color:#c7c7c7; }
                .modal-wishlist:hover { transform:scale(1.06); color:#e11d48; }
                .modal-wishlist.active { color:#e11d48; }
                .auth-link { margin-top:0.6rem; font-size:0.8rem; }
                .auth-link a { color:#7c3aed; text-decoration:none; font-weight:600; }
                .auth-link a:hover { text-decoration:underline; }
                .product-card .wishlist-heart { position:absolute; top:10px; left:10px; width:36px; height:36px; border-radius:50%; border:none; background:rgba(255,255,255,0.92); cursor:pointer; font-size:1.1rem; color:#c7c7c7; box-shadow:0 2px 6px rgba(0,0,0,0.1); z-index:3; transition:all 0.15s; }
                .product-card .wishlist-heart:hover { transform:scale(1.08); color:#e11d48; }
                .product-card .wishlist-heart.active { color:#e11d48; }
            `;
            document.head.appendChild(modalStyles);
        }
    } catch (error) {
        console.error('Failed to load product:', error);
        showAlert('Failed to load product details', 'error');
    }
}

// Select a shade variant in the quick-view modal
function selectShade(productId, variantId, btn) {
    const picker = document.getElementById('shade-picker-' + productId);
    if (!picker) return;
    picker.querySelectorAll('.shade-swatch').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const label = document.getElementById('shade-selected-' + productId);
    if (label) label.textContent = btn.dataset.variantName;
    // Stash chosen variant for addToCart pickup
    window._selectedVariants = window._selectedVariants || {};
    window._selectedVariants[productId] = variantId;
}

// Toggle wishlist (heart click)
async function toggleWishlist(productId, btn) {
    const active = btn.classList.contains('active');
    try {
        const res = active
            ? await fetch('/api/wishlist/' + productId, { method: 'DELETE' })
            : await fetch('/api/wishlist',   { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ productId }) });
        if (res.status === 401) {
            showAlert('Please log in to use the wishlist', 'error');
            setTimeout(() => { window.location.href = '/login'; }, 900);
            return;
        }
        if (!res.ok) {
            showAlert('Could not update wishlist', 'error');
            return;
        }
        btn.classList.toggle('active');
        btn.textContent = btn.classList.contains('active') ? '♥' : '♡';
        showAlert(active ? 'Removed from wishlist' : 'Added to wishlist', 'success');
        window._wishlistIds = null; // bust cache
    } catch {
        showAlert('Network error', 'error');
    }
}

// Hydrate heart icons on listing pages with the user's wishlist state
async function hydrateWishlistHearts() {
    try {
        const res = await fetch('/api/wishlist/ids');
        if (!res.ok) return; // not logged in, ignore
        const { ids } = await res.json();
        window._wishlistIds = new Set(ids);
        document.querySelectorAll('.product-card .wishlist-heart').forEach(btn => {
            const pid = parseInt(btn.dataset.productId, 10);
            if (window._wishlistIds.has(pid)) {
                btn.classList.add('active');
                btn.textContent = '♥';
            }
        });
    } catch { /* ignore */ }
}

// Swap the Quick View main image when a gallery thumbnail is clicked
function setModalImage(btn) {
    const main = document.getElementById('modal-main-img');
    if (main && btn.dataset.src) main.src = btn.dataset.src;
    document.querySelectorAll('.modal-thumb').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
}

// ===== Live viewers / urgency badge =====
// Stable, opaque per-browser id so the server can count distinct viewers
// without a login. Random, non-identifying — purely a headcount key.
function getViewerId() {
    try {
        let id = localStorage.getItem('crevia_vid');
        if (!id) {
            id = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem('crevia_vid', id);
        }
        return id;
    } catch (e) {
        return 'v_' + Math.random().toString(36).slice(2);
    }
}

let _urgencyTimer = null;

function renderUrgency(data) {
    const el = document.getElementById('modal-urgency');
    if (!el || !data) return;
    const parts = [];
    if (!data.inStock) {
        el.innerHTML = '<span class="out-stock">✗ Out of Stock</span>';
        return;
    }
    if (data.lowStock) {
        parts.push(`<span class="u-lowstock">Only ${data.lowStock} left</span>`);
    } else {
        parts.push('<span class="in-stock">✓ In Stock</span>');
    }
    if (data.show && data.viewers >= 2) {
        parts.push(`<span class="u-viewers"><span class="u-dot"></span>${data.viewers} people viewing now</span>`);
    }
    el.innerHTML = parts.join('');
}

async function pingUrgency(productId) {
    try {
        const res = await fetch(`/api/products/${productId}/activity?vid=${encodeURIComponent(getViewerId())}`);
        if (!res.ok) return;
        renderUrgency(await res.json());
    } catch (e) { /* badge is non-critical — fail silent */ }
}

function startUrgency(productId) {
    stopUrgency();
    pingUrgency(productId);
    // Heartbeat: keeps this viewer "present" (30s server window) and refreshes
    // the count while the modal stays open.
    _urgencyTimer = setInterval(() => pingUrgency(productId), 25000);
}

function stopUrgency() {
    if (_urgencyTimer) { clearInterval(_urgencyTimer); _urgencyTimer = null; }
}

// Close product modal
function closeProductModal() {
    stopUrgency();
    window._currentProductId = null;
    window._currentProductName = null;
    const modal = document.querySelector('.product-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeProductModal();
    }
});

// Add to cart
async function addToCart(productId) {
    try {
        const response = await fetch('/api/cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId })
        });

        if (response.ok) {
            showAlert('Added to cart successfully!', 'success');
            updateCartCount();

            // Add animation to cart icon
            const cartIcon = document.querySelector('.cart-icon');
            if (cartIcon) {
                cartIcon.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    cartIcon.style.transform = 'scale(1)';
                }, 200);
            }
        } else {
            showAlert('Failed to add to cart', 'error');
        }
    } catch (error) {
        console.error('Add to cart error:', error);
        showAlert('Failed to add to cart', 'error');
    }
}

// Show alert
function showAlert(message, type = 'success') {
    // Remove any existing alerts
    const existingAlerts = document.querySelectorAll('.floating-alert');
    existingAlerts.forEach(alert => alert.remove());

    const alert = document.createElement('div');
    alert.className = `floating-alert floating-alert-${type}`;

    const icon = type === 'success' ? '✓' : '✕';
    alert.innerHTML = `
        <span class="alert-icon">${icon}</span>
        <span class="alert-message">${message}</span>
    `;

    document.body.appendChild(alert);

    setTimeout(() => {
        alert.classList.add('fade-out');
        setTimeout(() => alert.remove(), 300);
    }, 3000);
}

// Branded confirmation dialog (replaces the native confirm()).
// Returns a Promise<boolean>. Pass { title, message, confirmText, cancelText,
// danger, onConfirm }. onConfirm runs synchronously on the confirm click, so
// callers can open a window inside the user gesture (e.g. WhatsApp).
function confirmDialog(opts = {}) {
    const o = typeof opts === 'string' ? { message: opts } : opts;
    const {
        title = 'Are you sure?',
        message = '',
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        danger = false,
        onConfirm = null
    } = o;

    if (!document.getElementById('cb-confirm-styles')) {
        const s = document.createElement('style');
        s.id = 'cb-confirm-styles';
        s.textContent = `
            .cb-confirm-overlay{position:fixed;inset:0;background:rgba(16,18,39,.55);
                display:flex;align-items:center;justify-content:center;z-index:10050;
                animation:cbFade .15s ease}
            .cb-confirm{background:#fff;width:min(430px,92vw);border-radius:14px;overflow:hidden;
                box-shadow:0 24px 70px rgba(16,18,39,.45);animation:cbPop .18s ease}
            .cb-confirm-head{background:linear-gradient(160deg,#101227,#15173a 70%,#222c57);padding:18px 22px}
            .cb-confirm-title{font-family:'Playfair Display',Georgia,serif;color:#f5f3ee;font-size:18px;font-weight:700;margin:0}
            .cb-confirm-body{padding:18px 22px 2px}
            .cb-confirm-msg{color:#4a4a55;font-size:14px;line-height:1.55;margin:0}
            .cb-confirm-actions{display:flex;justify-content:flex-end;gap:10px;padding:18px 22px 22px}
            .cb-confirm-btn{padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;
                border:1px solid transparent;font-family:inherit}
            .cb-confirm-cancel{background:#f0f0f3;color:#333;border-color:#e2e2e8}
            .cb-confirm-cancel:hover{background:#e6e6ea}
            .cb-confirm-ok{background:#15173a;color:#f3ede2;border-color:#d4af6a}
            .cb-confirm-ok:hover{background:#d4af6a;color:#15173a}
            .cb-confirm-ok.danger{background:#c0392b;color:#fff;border-color:#c0392b}
            .cb-confirm-ok.danger:hover{background:#a93226;border-color:#a93226}
            .cb-confirm-overlay.closing{opacity:0;transition:opacity .15s}
            @keyframes cbFade{from{opacity:0}to{opacity:1}}
            @keyframes cbPop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}`;
        document.head.appendChild(s);
    }

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'cb-confirm-overlay';

        const card = document.createElement('div');
        card.className = 'cb-confirm';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');

        const head = document.createElement('div');
        head.className = 'cb-confirm-head';
        const h = document.createElement('h3');
        h.className = 'cb-confirm-title';
        h.textContent = title;
        head.appendChild(h);

        const body = document.createElement('div');
        body.className = 'cb-confirm-body';
        const msg = document.createElement('p');
        msg.className = 'cb-confirm-msg';
        msg.textContent = message;
        body.appendChild(msg);

        const actions = document.createElement('div');
        actions.className = 'cb-confirm-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'cb-confirm-btn cb-confirm-cancel';
        cancelBtn.textContent = cancelText;
        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'cb-confirm-btn cb-confirm-ok' + (danger ? ' danger' : '');
        okBtn.textContent = confirmText;
        actions.appendChild(cancelBtn);
        actions.appendChild(okBtn);

        card.appendChild(head);
        card.appendChild(body);
        card.appendChild(actions);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        let done = false;
        const close = (val) => {
            if (done) return;
            done = true;
            document.removeEventListener('keydown', onKey);
            overlay.classList.add('closing');
            setTimeout(() => overlay.remove(), 150);
            resolve(val);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') close(false);
            else if (e.key === 'Enter') { if (typeof onConfirm === 'function') onConfirm(); close(true); }
        };

        cancelBtn.onclick = () => close(false);
        okBtn.onclick = () => { if (typeof onConfirm === 'function') onConfirm(); close(true); };
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(false); });
        document.addEventListener('keydown', onKey);
        setTimeout(() => okBtn.focus(), 30);
    });
}

// Add CSS animations and styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
    .floating-alert {
        position: fixed;
        top: 100px;
        right: 20px;
        z-index: 9999;
        min-width: 280px;
        max-width: 400px;
        padding: 1rem 1.5rem;
        border-radius: 10px;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        font-weight: 500;
    }
    .floating-alert-success {
        background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%);
        color: #d4af6a;
        border-left: 4px solid #d4af6a;
    }
    .floating-alert-error {
        background: linear-gradient(135deg, #2d1a1a 0%, #442d2d 100%);
        color: #e94560;
        border-left: 4px solid #e94560;
    }
    .floating-alert.fade-out {
        animation: slideOut 0.3s ease forwards;
    }
    .alert-icon {
        font-size: 1.25rem;
        font-weight: bold;
    }
    .cart-icon {
        transition: transform 0.2s ease;
    }
`;
document.head.appendChild(style);

// Search form handling
document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            const searchInput = document.getElementById('search-input');
            if (searchInput && !searchInput.value.trim()) {
                e.preventDefault();
                window.location.href = '/products';
            }
        });
    }

    // Chat input enter key handler
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }
});

// Live Chat Toggle
function toggleChat() {
    const chatBox = document.getElementById('chat-box');
    if (chatBox) {
        chatBox.classList.toggle('active');
    }
}

// Send Chat Message (redirects to WhatsApp)
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (input) {
        const message = input.value.trim();
        if (message) {
            window.open(`https://wa.me/254745853914?text=${encodeURIComponent(message)}`, '_blank');
            input.value = '';
        }
    }
}

// ===== Product image protection =====
// Professional product photos take real time and money to shoot, so instead of
// letting people quietly save or right-click them, we intercept those actions
// and turn them into a *share* of the product link. A subtle on-image watermark
// also rides along in any screenshot. This is a friendly speed bump, not DRM:
// screenshots and direct URL access can't be blocked, so we make sharing the
// path of least resistance and brand the image either way.
(function installImageProtection() {
    // Don't touch the admin dashboard — only the public storefront.
    if (location.pathname.startsWith('/admin')) return;

    const PROTECTED_SEL = '.product-image, .modal-image-main, .modal-thumb';

    function protectedImage(target) {
        if (!target || target.tagName !== 'IMG' || !target.closest) return null;
        return target.closest(PROTECTED_SEL) ? target : null;
    }

    // Resolve the product (id + name) an image belongs to.
    function productOf(img) {
        const card = img.closest('.product-card');
        if (card && card.dataset.productId) {
            const nameEl = card.querySelector('.product-name');
            return { id: card.dataset.productId, name: nameEl ? nameEl.textContent.trim() : '' };
        }
        if (window._currentProductId) {
            return { id: window._currentProductId, name: window._currentProductName || '' };
        }
        return null;
    }

    function shareUrlFor(info) {
        return (info && info.id)
            ? `${location.origin}/products?product=${info.id}`
            : location.href;
    }

    function nudge(info) {
        const name = (info && info.name) || 'this piece';
        const url = shareUrlFor(info);
        const text = `Found ${name} on CreviaBeauty 💛 Take a look: ${url}`;
        // Prefer the native share sheet (great on mobile — one tap to any app).
        if (navigator.share) {
            navigator.share({ title: 'CreviaBeauty', text, url }).catch(() => {});
            return;
        }
        showShareModal(name, url, text);
    }

    function showShareModal(name, url, text) {
        document.querySelector('.share-nudge')?.remove();
        const modal = document.createElement('div');
        modal.className = 'share-nudge';
        modal.innerHTML = `
            <div class="share-nudge-overlay"></div>
            <div class="share-nudge-card">
                <button class="share-nudge-close" aria-label="Close">&times;</button>
                <div class="share-nudge-title">Love it? Share it 💛</div>
                <p class="share-nudge-note">Please don't save our photos — instead, send the link so your friend can see it on our site too.</p>
                <input class="share-nudge-link" type="text" readonly value="${url}">
                <div class="share-nudge-actions">
                    <button class="share-nudge-btn primary" data-act="copy">Copy link</button>
                    <a class="share-nudge-btn wa" target="_blank" rel="noopener"
                       href="https://wa.me/?text=${encodeURIComponent(text)}">Share on WhatsApp</a>
                </div>
            </div>`;
        const close = () => modal.remove();
        modal.querySelector('.share-nudge-overlay').onclick = close;
        modal.querySelector('.share-nudge-close').onclick = close;
        modal.querySelector('[data-act="copy"]').onclick = () => {
            navigator.clipboard.writeText(url)
                .then(() => showAlert('Link copied — paste it anywhere', 'success'))
                .catch(() => { modal.querySelector('.share-nudge-link').select(); });
        };
        document.body.appendChild(modal);
    }

    // Right-click on a product image -> share instead of the browser save menu.
    document.addEventListener('contextmenu', (e) => {
        const img = protectedImage(e.target);
        if (img) { e.preventDefault(); nudge(productOf(img)); }
    });
    // Block drag-to-save.
    document.addEventListener('dragstart', (e) => {
        if (protectedImage(e.target)) e.preventDefault();
    });
    // Ctrl/Cmd+S anywhere there are product images -> share nudge.
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && document.querySelector('.product-image img, .modal-image-main img')) {
            e.preventDefault();
            const ctx = window._currentProductId ? { id: window._currentProductId, name: window._currentProductName } : null;
            nudge(ctx);
        }
    });

    // CSS: kill long-press save (mobile) + drag ghost, add a subtle corner
    // watermark, and style the share modal.
    const style = document.createElement('style');
    style.id = 'image-protection-styles';
    style.textContent = `
        .product-image img, .modal-image-main img, .modal-thumb img {
            -webkit-touch-callout: none;
            -webkit-user-drag: none;
            user-select: none;
        }
        .product-image, .modal-image-main { position: relative; }
        .product-image::after, .modal-image-main::after {
            content: 'CreviaBeauty';
            position: absolute; right: 8px; bottom: 8px;
            font-family: 'Playfair Display', serif;
            font-size: 0.72rem; letter-spacing: 0.5px;
            color: rgba(255,255,255,0.55);
            text-shadow: 0 1px 3px rgba(0,0,0,0.5);
            pointer-events: none; user-select: none; z-index: 2;
        }
        .share-nudge { position: fixed; inset: 0; z-index: 10001; display: flex; align-items: center; justify-content: center; animation: fadeIn 0.2s ease; }
        .share-nudge-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.6); }
        .share-nudge-card { position: relative; background: #fff; border-radius: 14px; padding: 1.75rem; width: 90%; max-width: 380px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center; }
        .share-nudge-close { position: absolute; top: 10px; right: 14px; background: none; border: none; font-size: 1.5rem; line-height: 1; cursor: pointer; color: #999; }
        .share-nudge-title { font-family: 'Playfair Display', serif; font-size: 1.3rem; color: #1a1a2e; margin-bottom: 0.5rem; }
        .share-nudge-note { color: #6b6b7b; font-size: 0.9rem; margin: 0 0 1rem; }
        .share-nudge-link { width: 100%; padding: 0.6rem 0.7rem; border: 1px solid #e0e0e6; border-radius: 8px; font-size: 0.82rem; color: #444; margin-bottom: 0.9rem; }
        .share-nudge-actions { display: flex; gap: 0.6rem; }
        .share-nudge-btn { flex: 1; padding: 0.7rem; border-radius: 8px; border: none; font-weight: 600; font-size: 0.9rem; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
        .share-nudge-btn.primary { background: #1a1a2e; color: #fff; }
        .share-nudge-btn.wa { background: #25d366; color: #fff; }
    `;
    document.head.appendChild(style);
})();

// ---- Indicative multi-currency display ------------------------------------
// Shows "≈ <local>" next to KES prices for overseas visitors. Detection is by
// IP (cached), FX rates come from the server (cached). Orders are ALWAYS billed
// in KES — this is display-only. A small switcher lets visitors change/clear it.
(function initCurrency() {
    const SYM = {
        USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', QAR: 'QAR ', NGN: '₦',
        ZAR: 'R', GHS: 'GH₵', TZS: 'TSh ', UGX: 'USh ', RWF: 'RF ', INR: '₹', CAD: 'C$',
        AUD: 'A$', CHF: 'CHF ', CNY: '¥', JPY: '¥', SEK: 'kr ', NOK: 'kr ', DKK: 'kr '
    };
    const OFFER = ['USD', 'GBP', 'EUR', 'AED', 'CAD', 'AUD', 'ZAR', 'NGN', 'INR'];
    // Country -> currency (geo API gives a country code, not a currency).
    const CCY_BY_COUNTRY = {
        US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK',
        AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', JO: 'JOD', LB: 'LBP',
        ZA: 'ZAR', NG: 'NGN', GH: 'GHS', KE: 'KES', TZ: 'TZS', UG: 'UGX', RW: 'RWF', ET: 'ETB', EG: 'EGP', MA: 'MAD',
        IN: 'INR', PK: 'PKR', BD: 'BDT', CN: 'CNY', JP: 'JPY', KR: 'KRW', SG: 'SGD', HK: 'HKD', MY: 'MYR', TH: 'THB', PH: 'PHP', ID: 'IDR',
        BR: 'BRL', MX: 'MXN', AR: 'ARS', TR: 'TRY', RU: 'RUB',
        AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR', FR: 'EUR', GR: 'EUR',
        IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR', LV: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR', HR: 'EUR'
    };
    const GEO_TTL = 7 * 24 * 3600 * 1000;
    let target = 'KES', rate = null;

    const fmt = (cur, amt) => {
        const s = SYM[cur] || (cur + ' ');
        return s + Math.round(amt).toLocaleString('en-US');
    };

    function decorate() {
        if (target === 'KES' || !rate) return;
        document.querySelectorAll('[data-kes]:not([data-fx-done])').forEach(el => {
            el.setAttribute('data-fx-done', '1');
            const kes = parseFloat(el.getAttribute('data-kes'));
            if (!kes) return;
            const span = document.createElement('span');
            span.className = 'fx-approx';
            span.title = 'Indicative price — orders are billed in KES';
            span.textContent = ' ≈ ' + fmt(target, kes * rate);
            el.insertAdjacentElement('afterend', span);
        });
    }

    async function detectCurrency() {
        const override = localStorage.getItem('crevia_ccy');
        if (override) return override;
        try {
            const cached = JSON.parse(localStorage.getItem('crevia_geo2') || 'null');
            if (cached && (Date.now() - cached.ts) < GEO_TTL) return cached.ccy;
        } catch (e) { /* ignore */ }
        try {
            const r = await fetch('https://ipwho.is/');
            const j = await r.json();
            const cc = j && (j.country_code || j.country_code_iso3);
            const ccy = (cc && CCY_BY_COUNTRY[cc]) || 'KES';
            localStorage.setItem('crevia_geo2', JSON.stringify({ ccy, ts: Date.now() }));
            return ccy;
        } catch (e) { return 'KES'; }
    }

    function injectSwitcher() {
        const host = document.querySelector('.nav-links') || document.querySelector('.nav-content') || document.querySelector('.nav-container');
        if (!host || document.getElementById('fx-switcher')) return;
        const sel = document.createElement('select');
        sel.id = 'fx-switcher';
        sel.title = 'Display currency (billing stays in KES)';
        const opts = ['KES', ...OFFER.filter(c => c !== 'KES')];
        if (!opts.includes(target)) opts.splice(1, 0, target);
        sel.innerHTML = opts.map(c => `<option value="${c}"${c === target ? ' selected' : ''}>${c === 'KES' ? 'KES (default)' : c}</option>`).join('');
        sel.addEventListener('change', () => {
            if (sel.value === 'KES') localStorage.removeItem('crevia_ccy');
            else localStorage.setItem('crevia_ccy', sel.value);
            location.reload();
        });
        host.appendChild(sel);
        if (!document.getElementById('fx-style')) {
            const st = document.createElement('style');
            st.id = 'fx-style';
            st.textContent = `
                .fx-approx { color:#16a34a; font-size:0.82em; font-weight:600; white-space:nowrap; margin-left:0.15em; }
                #fx-switcher { margin-left:0.6rem; background:transparent; color:inherit; border:1px solid rgba(255,255,255,0.3); border-radius:6px; padding:2px 6px; font-size:0.8rem; cursor:pointer; }
                #fx-switcher option { color:#1a1a2e; }
            `;
            document.head.appendChild(st);
        }
    }

    async function init() {
        target = (await detectCurrency()) || 'KES';
        injectSwitcher();
        if (target === 'KES') return;
        try {
            const r = await fetch('/api/fx-rates');
            const j = await r.json();
            rate = j && j.rates && j.rates[target];
        } catch (e) { /* leave KES */ }
        if (!rate) return;
        decorate();
        // Prices for cards/modal are added after load — decorate them as they appear.
        new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState !== 'loading') init();
    else document.addEventListener('DOMContentLoaded', init);
})();
