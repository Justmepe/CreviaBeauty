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
                <div class="product-name">${safeName}</div>
                <div class="product-description">${safeDescription}</div>
                <div class="product-footer">
                    <div class="product-price ${hasDiscount ? 'discounted' : ''}">
                        ${formatPrice(product.price)}
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
                        <h2 class="modal-title">${safeName}</h2>
                        ${badgesBlock}
                        ${chipsBlock}
                        <div class="modal-description">${safeDescription}</div>
                        <div class="modal-price">
                            <span class="current-price">${formatPrice(product.price)}</span>
                            ${product.original_price ? `<span class="old-price">${formatPrice(product.original_price)}</span>` : ''}
                        </div>
                        <div class="modal-stock">
                            ${product.stock > 0 ? `<span class="in-stock">✓ In Stock (${product.stock} available)</span>` : '<span class="out-stock">✗ Out of Stock</span>'}
                        </div>
                        ${variantsBlock}
                        ${wigBlock}
                        ${ingredientsBlock}
                        ${allergensBlock}
                        <div class="modal-actions">
                            <button class="btn" onclick="addToCart(${product.id}); closeProductModal();">Add to Cart</button>
                            <button class="btn btn-outline" onclick="closeProductModal()">Continue Shopping</button>
                        </div>
                        ${product.is_authentic_verified ? '<div class="auth-link"><a href="/authenticity">Read about our authenticity guarantee →</a></div>' : ''}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        // Cursor-follow zoom on the main image (desktop hover only). Moving the
        // mouse pans the magnified view; leaving resets it smoothly.
        const zoomWrap = modal.querySelector('.modal-image-main');
        const zoomImg = modal.querySelector('#modal-main-img');
        if (zoomWrap && zoomImg && window.matchMedia && window.matchMedia('(hover: hover)').matches) {
            zoomWrap.addEventListener('mousemove', (e) => {
                const r = zoomWrap.getBoundingClientRect();
                const x = ((e.clientX - r.left) / r.width) * 100;
                const y = ((e.clientY - r.top) / r.height) * 100;
                zoomImg.style.transformOrigin = `${x}% ${y}%`;
                zoomImg.style.transform = 'scale(2.2)';
            });
            zoomWrap.addEventListener('mouseleave', () => {
                zoomImg.style.transform = '';
                zoomImg.style.transformOrigin = 'center center';
            });
        }

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
                .modal-image-main {
                    position: relative;
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                    min-height: 0;
                    overflow: hidden;       /* contain the hover zoom */
                    cursor: zoom-in;
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
                .modal-stock {
                    margin-bottom: 1.5rem;
                }
                .modal-stock .in-stock {
                    color: #27ae60;
                    font-weight: 500;
                }
                .modal-stock .out-stock {
                    color: #e94560;
                    font-weight: 500;
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

// Close product modal
function closeProductModal() {
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
