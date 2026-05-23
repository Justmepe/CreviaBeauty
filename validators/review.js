/**
 * Review Validators
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

// Review creation validation rules
const reviewRules = [
    body('customerName')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
        .matches(/^[a-zA-Z\s'-]+$/).withMessage('Name can only contain letters, spaces, hyphens and apostrophes'),

    body('customerEmail')
        .optional({ checkFalsy: true })
        .trim()
        .isEmail().withMessage('Please provide a valid email address')
        .normalizeEmail()
        .isLength({ max: 255 }).withMessage('Email is too long'),

    body('rating')
        .notEmpty().withMessage('Rating is required')
        .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5')
        .toInt(),

    body('productQuality')
        .optional({ checkFalsy: true })
        .isInt({ min: 1, max: 5 }).withMessage('Product quality rating must be between 1 and 5')
        .toInt(),

    body('deliveryRating')
        .optional({ checkFalsy: true })
        .isInt({ min: 1, max: 5 }).withMessage('Delivery rating must be between 1 and 5')
        .toInt(),

    body('reviewText')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 1000 }).withMessage('Review text must be less than 1000 characters'),

    body('productId')
        .optional({ checkFalsy: true })
        .isInt({ min: 1 }).withMessage('Invalid product ID')
        .toInt(),

    body('orderId')
        .optional({ checkFalsy: true })
        .isInt({ min: 1 }).withMessage('Invalid order ID')
        .toInt(),

    handleValidationErrors
];

// Review ID parameter validation
const reviewIdRules = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid review ID')
        .toInt(),

    handleValidationErrors
];

// Review approval validation
const approveReviewRules = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid review ID')
        .toInt(),

    body('isApproved')
        .notEmpty().withMessage('Approval status is required')
        .isBoolean().withMessage('Approval status must be a boolean')
        .toBoolean(),

    handleValidationErrors
];

module.exports = {
    reviewRules,
    reviewIdRules,
    approveReviewRules
};
