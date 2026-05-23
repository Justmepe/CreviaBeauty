/**
 * Rewards Validators
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

// Redeem points validation
const redeemPointsRules = [
    body('points')
        .notEmpty().withMessage('Points amount is required')
        .isInt({ min: 1 }).withMessage('Points must be a positive integer'),

    handleValidationErrors
];

// Withdraw points validation
const withdrawPointsRules = [
    body('points')
        .notEmpty().withMessage('Points amount is required')
        .isInt({ min: 1 }).withMessage('Points must be a positive integer'),

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

// Admin: Update points settings
const updatePointsSettingsRules = [
    body('points_per_kes')
        .optional()
        .isInt({ min: 1 }).withMessage('Points per KES must be a positive integer'),

    body('referral_bonus')
        .optional()
        .isInt({ min: 0 }).withMessage('Referral bonus must be a non-negative integer'),

    body('points_to_kes_rate')
        .optional()
        .isInt({ min: 1 }).withMessage('Points to KES rate must be a positive integer'),

    body('min_redeem_points')
        .optional()
        .isInt({ min: 0 }).withMessage('Minimum redeem points must be a non-negative integer'),

    body('min_points_withdrawal')
        .optional()
        .isInt({ min: 0 }).withMessage('Minimum withdrawal must be a non-negative integer'),

    handleValidationErrors
];

// Admin: Process withdrawal
const processWithdrawalRules = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid withdrawal ID')
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
    redeemPointsRules,
    withdrawPointsRules,
    updatePointsSettingsRules,
    processWithdrawalRules
};
