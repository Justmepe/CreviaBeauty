/**
 * CreviaBeauty - Main Server
 * Express.js server with security hardening
 */

// Load environment variables first
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');

// Load configuration
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./database');

// Load middleware
const { globalLimiter } = require('./middleware/rateLimiter');
const { sanitizeAll } = require('./middleware/sanitizer');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const PostgresSessionStore = require('./middleware/sessionStore');

// Initialize Express
const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// ============ SECURITY MIDDLEWARE ============

// Security headers with Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            scriptSrcAttr: ["'unsafe-inline'"], // Allow onclick handlers
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https:"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: config.isProduction ? [] : null
        }
    },
    crossOriginEmbedderPolicy: false, // Allow external images
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Response compression
app.use(compression());

// Rate limiting
app.use(globalLimiter);

// ============ BODY PARSING & SANITIZATION ============

// Pasted Claude responses (full articles) far exceed the global 10kb cap.
// Mounting a larger parser on the articles admin path first means the global
// parser below skips these requests (body already parsed).
app.use('/api/admin/articles', express.json({ limit: '2mb' }));
app.use('/api/admin/youtube', express.json({ limit: '2mb' }));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Input sanitization (XSS protection)
app.use(sanitizeAll);

// ============ SESSION CONFIGURATION ============

const sessionStore = new PostgresSessionStore({
    pool: db.pool,
    tableName: 'sessions'
});

app.use(session({
    store: sessionStore,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: 'crevia.sid', // Custom cookie name (not 'connect.sid')
    cookie: {
        secure: config.cookieSecure,
        httpOnly: true,
        sameSite: 'strict',
        maxAge: config.sessionMaxAge
    }
}));

// ============ STATIC FILES ============

const publicDir = path.resolve(__dirname, 'public');

// Browsers auto-request /favicon.ico for the tab icon; serve the existing PNG
// so it doesn't 404 on every page.
app.get('/favicon.ico', (req, res) => res.redirect(301, '/assets/favicon.png'));

// Static HTML page routes (before static middleware for explicit routing)
app.get('/products', (req, res) => res.sendFile(path.join(publicDir, 'products.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(publicDir, 'cart.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(publicDir, 'contact.html')));
app.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(publicDir, 'register.html')));
app.get('/marketer-register', (req, res) => res.sendFile(path.join(publicDir, 'marketer-register.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
app.get('/review', (req, res) => res.sendFile(path.join(publicDir, 'review.html')));
app.get('/my-orders', (req, res) => res.sendFile(path.join(publicDir, 'my-orders.html')));
app.get('/become-marketer', (req, res) => res.sendFile(path.join(publicDir, 'become-marketer.html')));
app.get('/marketer', (req, res) => res.sendFile(path.join(publicDir, 'marketer.html')));
app.get('/customer', (req, res) => res.sendFile(path.join(publicDir, 'customer.html')));
app.get('/my-rewards', (req, res) => res.sendFile(path.join(publicDir, 'my-rewards.html')));
app.get('/wishlist', (req, res) => res.sendFile(path.join(publicDir, 'wishlist.html')));
app.get('/bundles', (req, res) => res.sendFile(path.join(publicDir, 'bundles.html')));
app.get('/authenticity', (req, res) => res.sendFile(path.join(publicDir, 'authenticity.html')));
app.get('/quiz', (req, res) => res.sendFile(path.join(publicDir, 'quiz.html')));
app.get('/blog', (req, res) => res.sendFile(path.join(publicDir, 'blog.html')));

// Article pages are server-rendered so each gets its own meta tags / OG / JSON-LD
const { renderArticlePage } = require('./utils/renderArticle');
const { requireAdmin } = require('./middleware/auth');

// Admin-only preview of a draft (or any) article, rendered with the exact
// branded template the public page uses — review before publishing.
app.get('/admin/preview/:id', requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.redirect(302, '/admin');
        const result = await db.query(
            `SELECT slug, title, category, hero_image_url, intro, meta_title, meta_description, tags, content, status, published_at
             FROM articles WHERE id = $1`,
            [id]
        );
        if (!result.rows[0]) return res.redirect(302, '/admin');
        res.set('Cache-Control', 'no-store');
        res.send(renderArticlePage(result.rows[0], { preview: true }));
    } catch (error) {
        logger.error('Article preview error', { id: req.params.id, error: error.message });
        res.redirect(302, '/admin');
    }
});
// Receipt builder forms. The public guest form lets any customer fill in their
// own details; the admin form issues a receipt for an off-website sale.
const { renderReceiptBuilderPage } = require('./utils/renderReceiptBuilder');
app.get('/receipt', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.send(renderReceiptBuilderPage('guest'));
});
app.get('/admin/receipt/new', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.send(renderReceiptBuilderPage('admin'));
});

// Admin-only branded receipt for an order, rendered print-ready (Save as PDF
// from the browser). Append ?print=1 to auto-open the print dialog.
const { renderReceiptPage } = require('./utils/renderReceipt');
app.get('/admin/receipt/:id', requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.redirect(302, '/admin');

        const orderResult = await db.query(`
            SELECT o.*, COALESCE(u.name, o.customer_name) AS user_name, u.email AS user_email
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.id = $1
        `, [id]);
        const order = orderResult.rows[0];
        if (!order) return res.redirect(302, '/admin');

        // Guest/manual orders carry free-text line items in items_json;
        // website orders reference real products via order_items.
        let items;
        if (order.items_json) {
            try { items = JSON.parse(order.items_json); } catch (e) { items = []; }
        } else {
            const itemsResult = await db.query(`
                SELECT oi.quantity, oi.price, p.name
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = $1
            `, [id]);
            items = itemsResult.rows;
        }

        const settingsResult = await db.query('SELECT setting_key, setting_value FROM payment_settings');
        const settings = {};
        for (const row of settingsResult.rows) settings[row.setting_key] = row.setting_value;

        res.set('Cache-Control', 'no-store');
        res.send(renderReceiptPage(order, items, settings, { theme: req.query.theme }));
    } catch (error) {
        logger.error('Receipt render error', { id: req.params.id, error: error.message });
        res.redirect(302, '/admin');
    }
});
app.get('/blog/:slug', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT slug, title, category, hero_image_url, intro, meta_title, meta_description, tags, content, published_at
             FROM articles WHERE slug = $1 AND status = 'published'`,
            [req.params.slug]
        );
        if (!result.rows[0]) return res.redirect(302, '/blog');
        res.set('Cache-Control', 'public, max-age=300');
        res.send(renderArticlePage(result.rows[0]));
    } catch (error) {
        logger.error('Article render error', { slug: req.params.slug, error: error.message });
        res.redirect(302, '/blog');
    }
});

// Static files with cache headers.
// HTML documents are served no-cache so the browser always re-fetches the
// markup (and therefore picks up any bumped ?v= asset URLs immediately).
// Hashed/versioned assets still get the long max-age in production.
app.use(express.static('public', {
    maxAge: config.isProduction ? '1d' : 0,
    etag: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

app.use('/uploads', express.static('uploads', {
    maxAge: config.isProduction ? '7d' : 0,
    etag: true
}));

// ============ SITEMAP FOR SEO ============

app.get('/sitemap.xml', async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, category, created_at FROM products ORDER BY created_at DESC');
        const products = result.rows;
        const categories = ['Perfumes', 'Skincare', 'Hair', 'Makeup', 'Candles'];
        const baseUrl = 'https://creviabeauty.com';
        const today = new Date().toISOString().split('T')[0];

        // High-value pages that should be in the sitemap. Listed in priority order.
        // Login/Register/Cart/Admin are excluded — they're already blocked in robots.txt
        // and offer no SEO value (transactional, auth-gated).
        const staticPages = [
            { loc: '/',              changefreq: 'daily',   priority: '1.0' },
            { loc: '/products',      changefreq: 'daily',   priority: '0.9' },
            { loc: '/bundles',       changefreq: 'weekly',  priority: '0.8' },
            { loc: '/quiz',          changefreq: 'monthly', priority: '0.8' }, // conversion page (fragrance quiz)
            { loc: '/blog',          changefreq: 'weekly',  priority: '0.7' },
            { loc: '/authenticity',  changefreq: 'monthly', priority: '0.7' }, // trust signal
            { loc: '/become-marketer', changefreq: 'monthly', priority: '0.6' },
            { loc: '/contact',       changefreq: 'monthly', priority: '0.6' }
        ];

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
        for (const p of staticPages) {
            xml += `
    <url>
        <loc>${baseUrl}${p.loc}</loc>
        <lastmod>${today}</lastmod>
        <changefreq>${p.changefreq}</changefreq>
        <priority>${p.priority}</priority>
    </url>`;
        }

        // Category pages
        categories.forEach(category => {
            xml += `
    <url>
        <loc>${baseUrl}/products?category=${encodeURIComponent(category)}</loc>
        <lastmod>${today}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>`;
        });

        // Article pages
        const articlesResult = await db.query(
            "SELECT slug, published_at, updated_at FROM articles WHERE status = 'published' ORDER BY published_at DESC"
        );
        articlesResult.rows.forEach(article => {
            const lastmod = (article.updated_at || article.published_at)
                ? new Date(article.updated_at || article.published_at).toISOString().split('T')[0]
                : today;
            xml += `
    <url>
        <loc>${baseUrl}/blog/${article.slug}</loc>
        <lastmod>${lastmod}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.7</priority>
    </url>`;
        });

        // Product pages
        products.forEach(product => {
            const lastmod = product.created_at
                ? new Date(product.created_at).toISOString().split('T')[0]
                : today;
            xml += `
    <url>
        <loc>${baseUrl}/products?search=${encodeURIComponent(product.name)}</loc>
        <lastmod>${lastmod}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.6</priority>
    </url>`;
        });

        xml += `
</urlset>`;

        res.set('Content-Type', 'application/xml');
        res.set('Cache-Control', 'public, max-age=3600'); // 1 hour — Googlebot doesn't need it any fresher
        res.send(xml);
    } catch (error) {
        logger.error('Sitemap generation error', { error: error.message });
        res.status(500).send('Error generating sitemap');
    }
});

// ============ HEALTH CHECK ENDPOINT ============

app.get('/health', async (req, res) => {
    try {
        // Check database connection
        const dbCheck = await db.query('SELECT 1 as check');

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: dbCheck.rows.length > 0 ? 'connected' : 'disconnected',
            environment: config.nodeEnv
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: error.message
        });
    }
});

// ============ API ROUTES ============

// Request logging middleware
app.use('/api', (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.logRequest(req, res, duration);
    });

    next();
});

// Mount all API routes
require('./routes')(app, db);

// ============ ERROR HANDLING ============

// 404 handler for API routes
app.use('/api/*', notFoundHandler);

// Global error handler
app.use(errorHandler);

// ============ GRACEFUL SHUTDOWN ============

let server;

const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(async () => {
        logger.info('HTTP server closed');

        // Close session store
        try {
            sessionStore.close();
            logger.info('Session store closed');
        } catch (err) {
            logger.error('Error closing session store', { error: err.message });
        }

        // Close database connection
        try {
            await db.close();
            logger.info('Database connection closed');
        } catch (err) {
            logger.error('Error closing database', { error: err.message });
        }

        // Close the headless browser used for receipt PDFs
        try {
            await require('./utils/receiptPdf').closeBrowser();
        } catch (err) {
            logger.error('Error closing receipt browser', { error: err.message });
        }

        process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason: String(reason) });
});

// ============ START SERVER ============

// In test mode, supertest drives the app directly — no need to bind a port.
// Skipping listen() also avoids EADDRINUSE conflicts with a running dev server.
if (config.nodeEnv !== 'test') {
    server = app.listen(config.port, () => {
    logger.info('Server started', {
        port: config.port,
        environment: config.nodeEnv,
        pid: process.pid
    });

    // Only show startup banner in development
    if (!config.isProduction) {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║            CreviaBeauty - Server Started                    ║
╠════════════════════════════════════════════════════════════╣
║  URL:         http://localhost:${config.port}                        ║
║  Environment: ${config.nodeEnv.padEnd(43)}║
║  Node:        ${process.version.padEnd(43)}║
╠════════════════════════════════════════════════════════════╣
║  Security Features Enabled:                                ║
║  ✓ Helmet security headers                                 ║
║  ✓ Rate limiting                                           ║
║  ✓ Input sanitization                                      ║
║  ✓ Session security (PostgreSQL store)                     ║
║  ✓ Request validation                                      ║
║  ✓ Compression                                             ║
╚════════════════════════════════════════════════════════════╝
        `);
    }
});
}

module.exports = app;
