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

// Static files with cache headers
app.use(express.static('public', {
    maxAge: config.isProduction ? '1d' : 0,
    etag: true
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
        const categories = ['Perfumes', 'Women\'s Skincare', 'Men\'s Skincare', 'Makeup', 'Hair Care', 'Body Care', 'Fragrances', 'Beauty Tools', 'Wigs'];
        const baseUrl = 'https://creviabeauty.com';
        const today = new Date().toISOString().split('T')[0];

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${baseUrl}/</loc>
        <lastmod>${today}</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
    <url>
        <loc>${baseUrl}/products</loc>
        <lastmod>${today}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.9</priority>
    </url>
    <url>
        <loc>${baseUrl}/contact</loc>
        <lastmod>${today}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.7</priority>
    </url>`;

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
