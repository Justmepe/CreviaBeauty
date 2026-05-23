/**
 * Centralized Error Handler Middleware
 * Provides consistent error responses and logging
 */

const multer = require('multer');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Handle 404 Not Found errors
 */
const notFoundHandler = (req, res, next) => {
    next(AppError.notFound(`Route ${req.originalUrl} not found`));
};

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
    // Default values
    let statusCode = err.statusCode || 500;
    let code = err.code || 'INTERNAL_ERROR';
    let message = err.message || 'An unexpected error occurred';
    let details = err.details || null;

    // Log the error
    if (statusCode >= 500) {
        logger.error('Server error', {
            error: err.message,
            stack: err.stack,
            path: req.path,
            method: req.method
        });
    } else {
        logger.warn('Client error', {
            error: err.message,
            code: code,
            path: req.path,
            method: req.method
        });
    }

    // Handle specific error types
    if (err instanceof multer.MulterError) {
        statusCode = 400;
        code = 'UPLOAD_ERROR';
        if (err.code === 'LIMIT_FILE_SIZE') {
            message = 'File too large. Maximum size is 5MB';
        } else {
            message = `Upload error: ${err.message}`;
        }
    } else if (err.message === 'Only image files are allowed!') {
        statusCode = 400;
        code = 'INVALID_FILE_TYPE';
        message = err.message;
    } else if (err.name === 'ValidationError') {
        statusCode = 422;
        code = 'VALIDATION_ERROR';
    } else if (err.code === 'SQLITE_CONSTRAINT') {
        statusCode = 409;
        code = 'CONFLICT';
        message = 'A record with this information already exists';
    } else if (err.code === 'EBADCSRFTOKEN') {
        statusCode = 403;
        code = 'INVALID_CSRF_TOKEN';
        message = 'Invalid or missing CSRF token. Please refresh the page and try again.';
    }

    // Don't leak error details in production
    if (config.isProduction && statusCode >= 500) {
        message = 'An unexpected error occurred. Please try again later.';
        details = null;
    }

    // Send error response
    res.status(statusCode).json({
        success: false,
        error: {
            code,
            message,
            ...(details && { details })
        }
    });
};

/**
 * Async handler wrapper - catches errors from async route handlers
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = {
    notFoundHandler,
    errorHandler,
    asyncHandler
};
