/**
 * Centralized Configuration Module
 * Loads and validates environment variables
 */

require('dotenv').config();

const config = {
    // Server
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3000,
    isProduction: process.env.NODE_ENV === 'production',

    // Session
    sessionSecret: process.env.SESSION_SECRET,
    sessionMaxAge: 24 * 60 * 60 * 1000, // 24 hours

    // Database (PostgreSQL)
    database: {
        connectionString: process.env.DATABASE_URL,
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        name: process.env.DB_NAME || 'creviabeauty',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
    },

    // File Upload
    uploadMaxSize: parseInt(process.env.UPLOAD_MAX_SIZE, 10) || 5 * 1024 * 1024,
    uploadAllowedTypes: /jpeg|jpg|png|gif|webp/,

    // Cookies
    cookieSecure: process.env.COOKIE_SECURE === 'true',

    // Rate Limiting
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100
    },
    authRateLimit: {
        windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
        maxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 10) || 5
    },

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info'
};

// Validate required configuration
function validateConfig() {
    const required = ['sessionSecret'];
    const missing = required.filter(key => !config[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    if (config.sessionSecret.length < 32) {
        throw new Error('SESSION_SECRET must be at least 32 characters long');
    }

    if (config.isProduction && !config.cookieSecure) {
        console.warn('WARNING: Cookie secure flag is false in production. Set COOKIE_SECURE=true for HTTPS.');
    }
}

// Validate on load
validateConfig();

module.exports = config;
