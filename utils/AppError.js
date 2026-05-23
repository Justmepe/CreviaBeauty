/**
 * Custom Application Error Class
 * Provides structured error handling with codes and status
 */

class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }

    // Common error factory methods
    static badRequest(message, details = null) {
        return new AppError(message, 400, 'BAD_REQUEST', details);
    }

    static unauthorized(message = 'Please login first') {
        return new AppError(message, 401, 'UNAUTHORIZED');
    }

    static forbidden(message = 'Access denied') {
        return new AppError(message, 403, 'FORBIDDEN');
    }

    static notFound(message = 'Resource not found') {
        return new AppError(message, 404, 'NOT_FOUND');
    }

    static conflict(message, details = null) {
        return new AppError(message, 409, 'CONFLICT', details);
    }

    static validationError(message, details = null) {
        return new AppError(message, 422, 'VALIDATION_ERROR', details);
    }

    static tooManyRequests(message = 'Too many requests, please try again later') {
        return new AppError(message, 429, 'TOO_MANY_REQUESTS');
    }

    static internal(message = 'An unexpected error occurred') {
        return new AppError(message, 500, 'INTERNAL_ERROR');
    }

    toJSON() {
        return {
            success: false,
            error: {
                code: this.code,
                message: this.message,
                ...(this.details && { details: this.details })
            }
        };
    }
}

module.exports = AppError;
