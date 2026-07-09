/**
 * Homepage JavaScript
 * Handles hero slideshow, featured products, and reviews
 */

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

// Hero slides are loaded from /api/hero-slides (admin-managed via /admin#hero-slides).
let heroSlides = [];
let currentSlide = 0;
let slides = [];
let dots = [];
let autoplayInterval;

// Load hero slides from the admin-managed table
async function loadHeroImages() {
    try {
        const response = await fetch('/api/hero-slides');
        heroSlides = await response.json();

        if (!Array.isArray(heroSlides) || heroSlides.length === 0) {
            return;
        }

        // Two layers per slide so product photos are never cropped:
        // a blurred cover backdrop fills the banner, and the full image
        // floats on the right as a product card.
        const heroBackground = document.getElementById('hero-background');
        if (heroBackground) {
            heroBackground.innerHTML = heroSlides.map((slide, index) => {
                const img = escapeHtml(slide.image_url);
                return `
                <div class="hero-slide ${index === 0 ? 'active' : ''}">
                    <div class="hero-slide-backdrop" style="background-image: url('${img}');"></div>
                    <div class="hero-slide-product" style="background-image: url('${img}');"></div>
                </div>`;
            }).join('');
        }

        // Dots
        const heroDots = document.getElementById('hero-dots');
        if (heroDots) {
            heroDots.innerHTML = heroSlides.map((_, index) => `
                <span class="hero-dot ${index === 0 ? 'active' : ''}" onclick="goToSlide(${index})"></span>
            `).join('');
        }

        slides = document.querySelectorAll('.hero-slide');
        dots = document.querySelectorAll('.hero-dot');

        updateHeroContent(0);

        if (autoplayInterval) clearInterval(autoplayInterval);
        autoplayInterval = setInterval(nextSlide, 5000);

    } catch (error) {
        console.error('Failed to load hero slides:', error);
    }
}

function updateHeroContent(index) {
    if (heroSlides.length === 0) return;

    const slide = heroSlides[index];
    const heroContent = document.getElementById('hero-content');
    if (!heroContent) return;

    // Compose title from structured pieces — each piece escaped individually, then assembled with a trusted <span>
    const titleHtml = [
        escapeHtml(slide.title_prefix || ''),
        slide.title_highlight ? `<span class="highlight">${escapeHtml(slide.title_highlight)}</span>` : '',
        slide.title_suffix ? escapeHtml(slide.title_suffix) : ''
    ].filter(Boolean).join(' ');

    // Description = plain text + optional anchor (both pieces escaped, anchor href escaped)
    let descriptionHtml = escapeHtml(slide.description || '');
    if (slide.extra_link_url && slide.extra_link_text) {
        descriptionHtml += ` <a href="${escapeHtml(slide.extra_link_url)}" style="color:#fff;text-decoration:underline;">${escapeHtml(slide.extra_link_text)}</a>`;
    }

    heroContent.innerHTML = `
        <div class="hero-text">
            ${slide.badge ? `<div class="promo-badge">${escapeHtml(slide.badge)}</div>` : ''}
            <h1>${titleHtml}</h1>
            <p>${descriptionHtml}</p>
            <div class="hero-buttons">
                <a href="/products?category=${encodeURIComponent(slide.category)}" class="btn">${escapeHtml(slide.link_text)}</a>
                <a href="/products" class="btn btn-outline-white">View All Products</a>
            </div>
            <div class="hero-features">
                <div class="hero-feature">
                    <span class="hero-feature-icon">🚚</span>
                    <span>Free Delivery</span>
                </div>
                <div class="hero-feature">
                    <span class="hero-feature-icon">💯</span>
                    <span>Quality Guaranteed</span>
                </div>
                <div class="hero-feature">
                    <span class="hero-feature-icon">💰</span>
                    <span>Best Prices</span>
                </div>
            </div>
        </div>
    `;
}

function goToSlide(index) {
    if (slides.length === 0) return;
    slides[currentSlide].classList.remove('active');
    dots[currentSlide].classList.remove('active');
    currentSlide = index;
    slides[currentSlide].classList.add('active');
    dots[currentSlide].classList.add('active');
    updateHeroContent(currentSlide);
}

function changeSlide(direction) {
    if (slides.length === 0) return;
    let newIndex = currentSlide + direction;
    if (newIndex >= slides.length) newIndex = 0;
    if (newIndex < 0) newIndex = slides.length - 1;
    goToSlide(newIndex);
}

function nextSlide() {
    changeSlide(1);
}

// Load homepage product rows: New Arrivals (newest) + Best Sellers (most-reviewed).
async function loadHomeProducts() {
    const bsEl = document.getElementById('best-sellers');
    const naEl = document.getElementById('new-arrivals');
    try {
        const response = await fetch('/api/products?limit=100');
        const result = await response.json();
        const products = result.data || result || [];

        // New Arrivals: the API returns newest-first (created_at DESC).
        if (naEl) naEl.innerHTML = products.slice(0, 8).map(createProductCard).join('');

        // Best Sellers: rank by how many approved reviews each product has (real
        // social proof). Falls back to biggest discounts if there are no reviews yet.
        let bestSellers;
        try {
            const reviews = await (await fetch('/api/reviews')).json();
            const counts = {};
            (reviews || []).forEach(r => { if (r.product_name) counts[r.product_name] = (counts[r.product_name] || 0) + 1; });
            const ranked = [...products].sort((a, b) => (counts[b.name] || 0) - (counts[a.name] || 0));
            bestSellers = (counts && Object.keys(counts).length)
                ? ranked.filter(p => counts[p.name]).slice(0, 8)
                : [];
        } catch (e) { bestSellers = []; }
        if (!bestSellers.length) {
            bestSellers = [...products].sort((a, b) => (b.discount || 0) - (a.discount || 0)).slice(0, 8);
        }
        if (bsEl) bsEl.innerHTML = bestSellers.map(createProductCard).join('');

        if (typeof hydrateWishlistHearts === 'function') hydrateWishlistHearts();
        fillCategoryCounts();
    } catch (error) {
        console.error('Failed to load products:', error);
        const msg = '<p style="grid-column: 1/-1; text-align: center; padding: 3rem;">Failed to load products. Please refresh the page.</p>';
        if (bsEl) bsEl.innerHTML = msg;
        if (naEl) naEl.innerHTML = '';
    }
}

// Fill the "N products" chips on the Shop by Category tiles.
// The API caps limit at 100, so walk pages until the catalog is fully counted.
async function fillCategoryCounts() {
    try {
        const products = [];
        for (let page = 1; page <= 5; page++) {
            const response = await fetch(`/api/products?limit=100&page=${page}`);
            const result = await response.json();
            const batch = result.data || [];
            products.push(...batch);
            if (!result.pagination || page >= result.pagination.pages) break;
        }
        // Products come back newest-first (created_at DESC), so the first image
        // seen per category is the newest — use it as the tile image.
        const counts = {};
        const catImage = {};
        products.forEach(p => {
            if (!p.category) return;
            counts[p.category] = (counts[p.category] || 0) + 1;
            if (p.image_url && !catImage[p.category]) catImage[p.category] = p.image_url;
        });
        document.querySelectorAll('.category-card[data-category]').forEach(card => {
            const cat = card.dataset.category;
            const n = counts[cat];
            const chip = card.querySelector('.category-chip');
            if (n && chip) {
                chip.textContent = `${n} product${n === 1 ? '' : 's'}`;
                chip.classList.add('show');
            }
            // Replace the hardcoded stock photo with a real product image.
            const imgEl = card.querySelector('.category-image');
            if (imgEl && catImage[cat]) {
                imgEl.style.backgroundImage = `url("${catImage[cat].replace(/"/g, '%22')}")`;
            }
        });
    } catch (e) { /* chips/images are optional decoration */ }
}

// Load customer reviews with carousel animation
async function loadReviews() {
    try {
        const response = await fetch('/api/reviews');
        const reviews = await response.json();
        const container = document.getElementById('reviews-container');

        if (!container) return;

        if (reviews.length === 0) {
            container.innerHTML = '<p class="no-reviews">No reviews yet. Be the first to share your experience!</p>';
            return;
        }

        const reviewCard = (review) => `
            <div class="review-card">
                ${review.product_name ? `
                <a class="review-product-link" href="/products?search=${encodeURIComponent(review.product_name)}">
                    ${review.product_image ? `<img class="review-product-img" src="${review.product_image}" alt="${escapeHtml(review.product_name)}" loading="lazy">` : ''}
                    <span class="review-product-name">${escapeHtml(review.product_name)}</span>
                </a>` : ''}
                <div class="review-stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
                <p class="review-text">"${escapeHtml(review.review_text || 'Great experience!')}"</p>
                <div class="review-byline">
                    <div class="review-avatar">${escapeHtml(review.customer_name.charAt(0).toUpperCase())}</div>
                    <div>
                        <h4>${escapeHtml(review.customer_name)}</h4>
                        <span class="review-date">${new Date(review.created_at).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                </div>
            </div>
        `;

        // For carousel: duplicate reviews for infinite scroll effect
        const reviewsToShow = reviews.slice(0, 8);
        const duplicatedReviews = [...reviewsToShow, ...reviewsToShow];

        container.innerHTML = `
            <div class="reviews-carousel">
                ${duplicatedReviews.map(review => reviewCard(review)).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Failed to load reviews:', error);
        const container = document.getElementById('reviews-container');
        if (container) {
            container.innerHTML = '<p class="no-reviews">Unable to load reviews.</p>';
        }
    }
}

// Live Chat Toggle
function toggleChat() {
    const chatBox = document.getElementById('chat-box');
    if (chatBox) {
        chatBox.classList.toggle('active');
    }
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (input) {
        const message = input.value.trim();
        if (message) {
            window.open(`https://wa.me/254111768092?text=${encodeURIComponent(message)}`, '_blank');
            input.value = '';
        }
    }
}

// Initialize homepage
document.addEventListener('DOMContentLoaded', () => {
    // Hero is now handled by /assets/hero/crevia-hero.js (animated + live data).
    // loadHeroImages();

    // Load homepage product rows (Best Sellers + New Arrivals)
    loadHomeProducts();

    // Load reviews
    loadReviews();

    // Chat input handler
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }
});
