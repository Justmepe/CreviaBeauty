/**
 * Input Sanitization Middleware
 * Protects against XSS and injection attacks
 */

const xss = require('xss');

// XSS sanitization options
const xssOptions = {
    whiteList: {}, // No HTML tags allowed
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style']
};

/**
 * Sanitize a single string value
 */
const sanitizeString = (value) => {
    if (typeof value !== 'string') return value;
    return xss(value.trim(), xssOptions);
};

/**
 * Recursively sanitize an object
 */
const sanitizeObject = (obj) => {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
        return sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    if (typeof obj === 'object') {
        const sanitized = {};
        for (const key of Object.keys(obj)) {
            sanitized[key] = sanitizeObject(obj[key]);
        }
        return sanitized;
    }

    return obj;
};

/**
 * Middleware to sanitize request body
 */
const sanitizeBody = (req, res, next) => {
    if (req.body) {
        req.body = sanitizeObject(req.body);
    }
    next();
};

/**
 * Middleware to sanitize query parameters
 */
const sanitizeQuery = (req, res, next) => {
    if (req.query) {
        req.query = sanitizeObject(req.query);
    }
    next();
};

/**
 * Middleware to sanitize route parameters
 */
const sanitizeParams = (req, res, next) => {
    if (req.params) {
        req.params = sanitizeObject(req.params);
    }
    next();
};

/**
 * Combined sanitization middleware
 */
const sanitizeAll = (req, res, next) => {
    if (req.body) req.body = sanitizeObject(req.body);
    if (req.query) req.query = sanitizeObject(req.query);
    if (req.params) req.params = sanitizeObject(req.params);
    next();
};

/**
 * HTML escape for safe rendering (use on output)
 */
const escapeHtml = (text) => {
    if (typeof text !== 'string') return text;
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
};

module.exports = {
    sanitizeString,
    sanitizeObject,
    sanitizeBody,
    sanitizeQuery,
    sanitizeParams,
    sanitizeAll,
    escapeHtml
};
