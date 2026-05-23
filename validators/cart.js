/**
 * Cart Validators
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

// Add to cart validation rules
const addToCartRules = [
    body('productId')
        .notEmpty().withMessage('Product ID is required')
        .isInt({ min: 1 }).withMessage('Invalid product ID')
        .toInt(),

    body('quantity')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('Quantity must be between 1 and 100')
        .toInt(),

    handleValidationErrors
];

// Update cart item validation rules
const updateCartRules = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid cart item ID')
        .toInt(),

    body('quantity')
        .notEmpty().withMessage('Quantity is required')
        .isInt({ min: 0, max: 100 }).withMessage('Quantity must be between 0 and 100')
        .toInt(),

    handleValidationErrors
];

// Cart item ID parameter validation
const cartIdRules = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid cart item ID')
        .toInt(),

    handleValidationErrors
];

module.exports = {
    addToCartRules,
    updateCartRules,
    cartIdRules
};
