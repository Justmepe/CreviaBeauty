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

        // Background slides
        const heroBackground = document.getElementById('hero-background');
        if (heroBackground) {
            heroBackground.innerHTML = heroSlides.map((slide, index) => `
                <div class="hero-slide ${index === 0 ? 'active' : ''}"
                     style="background-image: url('${escapeHtml(slide.image_url)}');"></div>
            `).join('');
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

// Load featured products
async function loadFeaturedProducts() {
    try {
        const response = await fetch('/api/products');
        const result = await response.json();
        const products = result.data || result;
        const container = document.getElementById('featured-products');

        if (container) {
            const featured = products.slice(0, 8);
            container.innerHTML = featured.map(product => createProductCard(product)).join('');
            if (typeof hydrateWishlistHearts === 'function') hydrateWishlistHearts();
        }
    } catch (error) {
        console.error('Failed to load products:', error);
        const container = document.getElementById('featured-products');
        if (container) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 3rem;">Failed to load products. Please refresh the page.</p>';
        }
    }
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
                <div class="review-header">
                    <div class="review-avatar">${escapeHtml(review.customer_name.charAt(0).toUpperCase())}</div>
                    <div class="review-info">
                        <h4>${escapeHtml(review.customer_name)}</h4>
                        <div class="review-stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
                    </div>
                </div>
                <p class="review-text">"${escapeHtml(review.review_text || 'Great experience!')}"</p>
                <div class="review-meta">
                    ${review.product_quality ? `<span class="review-product">📦 Quality: ${'★'.repeat(review.product_quality)}</span>` : ''}
                    ${review.delivery_rating ? `<span class="review-delivery">🚚 Delivery: ${'★'.repeat(review.delivery_rating)}</span>` : ''}
                </div>
                <div class="review-date">${new Date(review.created_at).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
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
            window.open(`https://wa.me/254745853914?text=${encodeURIComponent(message)}`, '_blank');
            input.value = '';
        }
    }
}

// Initialize homepage
document.addEventListener('DOMContentLoaded', () => {
    // Load hero slideshow
    loadHeroImages();

    // Load featured products
    loadFeaturedProducts();

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
