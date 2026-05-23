/**
 * Rate Limiting Middleware
 * Protects against brute force and DoS attacks
 */

const rateLimit = require('express-rate-limit');
const config = require('../config');
const AppError = require('../utils/AppError');

// Custom handler for rate limit exceeded
const rateLimitHandler = (req, res, next, options) => {
    next(AppError.tooManyRequests(options.message));
};

/**
 * Global rate limiter - applies to all requests
 */
const globalLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    skip: (req) => {
        // Skip rate limiting for static assets
        return req.path.startsWith('/css/') ||
               req.path.startsWith('/js/') ||
               req.path.startsWith('/images/') ||
               req.path.startsWith('/uploads/');
    }
});

/**
 * Auth rate limiter - stricter limits for login/register
 */
const authLimiter = rateLimit({
    windowMs: config.authRateLimit.windowMs, // 15 minutes
    max: config.authRateLimit.maxRequests, // 5 attempts
    message: 'Too many login attempts, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    skipSuccessfulRequests: false
});

/**
 * Form submission limiter - for contact/review forms
 */
const formLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 submissions per hour
    message: 'Too many form submissions, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler
});

/**
 * API rate limiter - for general API endpoints
 */
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: 'Too many API requests, please slow down',
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler
});

module.exports = {
    globalLimiter,
    authLimiter,
    formLimiter,
    apiLimiter
};
