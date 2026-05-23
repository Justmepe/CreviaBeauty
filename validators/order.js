/**
 * Order Validators
 */

const { body, param, validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

// Helper to handle validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const details = errors.array().map(err => ({
            field: err.path,
            message: err.msg
        }));
        return next(AppError.validationError('Validation failed', details));
    }
    next();
};

// Order creation validation rules
const createOrderRules = [
    body('shippingAddress')
        .trim()
        .notEmpty().withMessage('Shipping address is required')
        .isLength({ min: 10, max: 500 }).withMessage('Shipping address must be between 10 and 500 characters'),

    body('phone')
        .trim()
        .notEmpty().withMessage('Phone number is required')
        .matches(/^\+?[0-9\s-]{10,15}$/).withMessage('Please provide a valid phone number'),

    handleValidationErrors
];

// Order ID parameter validation
const orderIdRules = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid order ID')
        .toInt(),

    handleValidationErrors
];

// Valid order statuses
const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'complete', 'cancelled'];

// Order status update validation
const updateStatusRules = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid order ID')
        .toInt(),

    body('status')
        .trim()
        .notEmpty().withMessage('Status is required')
        .isIn(validStatuses).withMessage(`Status must be one of: ${validStatuses.join(', ')}`),

    handleValidationErrors
];

module.exports = {
    createOrderRules,
    orderIdRules,
    updateStatusRules,
    validStatuses
};
