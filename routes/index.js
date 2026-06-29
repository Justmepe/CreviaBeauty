/**
 * Route Aggregator
 * Combines all route modules
 */

const authRoutes = require('./auth');
const productRoutes = require('./products');
const cartRoutes = require('./cart');
const orderRoutes = require('./orders');
const reviewRoutes = require('./reviews');
const contactRoutes = require('./contact');
const adminRoutes = require('./admin');
const marketerRoutes = require('./marketer');
const rewardsRoutes = require('./rewards');
const wishlistRoutes = require('./wishlist');
const bundlesRoutes = require('./bundles');
const heroSlidesRoutes = require('./heroSlides');
const articlesRoutes = require('./articles');
const receiptsRoutes = require('./receipts');

module.exports = (app, db) => {
    // Auth routes
    app.use('/api', authRoutes(db));

    // Product routes
    app.use('/api/products', productRoutes(db));

    // Cart routes
    app.use('/api/cart', cartRoutes(db));

    // Order routes
    app.use('/api/orders', orderRoutes(db));

    // Receipt routes (guest self-service + admin manual)
    app.use('/api/receipts', receiptsRoutes(db));

    // Review routes
    app.use('/api/reviews', reviewRoutes(db));

    // Contact routes
    app.use('/api/contact', contactRoutes(db));

    // Admin routes
    app.use('/api/admin', adminRoutes(db));

    // Marketer routes
    app.use('/api/marketer', marketerRoutes(db));

    // Rewards routes
    app.use('/api/rewards', rewardsRoutes(db));

    // Wishlist routes
    app.use('/api/wishlist', wishlistRoutes(db));

    // Bundles routes
    app.use('/api/bundles', bundlesRoutes(db));

    // Hero slides — split into public + admin routers
    const heroSlides = heroSlidesRoutes(db);
    app.use('/api/hero-slides', heroSlides.public);
    app.use('/api/admin/hero-slides', heroSlides.admin);

    // Articles (Content Studio) — split into public + admin routers
    const articles = articlesRoutes(db);
    app.use('/api/articles', articles.public);
    app.use('/api/admin/articles', articles.admin);
    app.use('/api/admin/youtube', articles.youtube);
};
