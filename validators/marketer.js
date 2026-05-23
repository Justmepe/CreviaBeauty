/**
 * Marketer Validators
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

// Apply to become a marketer
const applyMarketerRules = [
    body('paymentMethod')
        .optional()
        .trim()
        .isIn(['mpesa', 'bank']).withMessage('Payment method must be mpesa or bank'),

    body('paymentDetails')
        .optional()
        .trim()
        .isLength({ max: 500 }).withMessage('Payment details must be less than 500 characters'),

    handleValidationErrors
];

// Request payout validation
const payoutRequestRules = [
    body('amount')
        .notEmpty().withMessage('Amount is required')
        .isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),

    body('paymentMethod')
        .trim()
        .notEmpty().withMessage('Payment method is required')
        .isIn(['mpesa', 'bank']).withMessage('Payment method must be mpesa or bank'),

    body('paymentDetails')
        .trim()
        .notEmpty().withMessage('Payment details are required')
        .isLength({ max: 500 }).withMessage('Payment details must be less than 500 characters'),

    handleValidationErrors
];

// Admin: Update marketer commission rate
const updateCommissionRules = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid marketer ID')
        .toInt(),

    body('commissionRate')
        .notEmpty().withMessage('Commission rate is required')
        .isFloat({ min: 1, max: 50 }).withMessage('Commission rate must be between 1 and 50'),

    handleValidationErrors
];

// Admin: Update marketer status
const updateMarketerStatusRules = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid marketer ID')
        .toInt(),

    body('status')
        .optional()
        .trim()
        .isIn(['pending', 'approved', 'suspended']).withMessage('Status must be pending, approved, or suspended'),

    handleValidationErrors
];

// Admin: Process payout
const processPayoutRules = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid payout ID')
        .toInt(),

    body('status')
        .trim()
        .notEmpty().withMessage('Status is required')
        .isIn(['approved', 'rejected']).withMessage('Status must be approved or rejected'),

    body('notes')
        .optional()
        .trim()
        .isLength({ max: 500 }).withMessage('Notes must be less than 500 characters'),

    handleValidationErrors
];

module.exports = {
    applyMarketerRules,
    payoutRequestRules,
    updateCommissionRules,
    updateMarketerStatusRules,
    processPayoutRules
};
