/**
 * Product Validators
 */

const { body, param, query, validationResult } = require('express-validator');
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

// Valid categories
const validCategories = [
    'Perfumes',
    'Women\'s Skincare',
    'Men\'s Skincare',
    'Makeup',
    'Hair Care',
    'Body Care',
    'Fragrances',
    'Beauty Tools',
    'Wigs'
];

// Perfume subcategories (audience). Optional; only meaningful for 'Perfumes'.
const validSubcategories = ["Women's", "Men's", "Unisex"];

// Product creation/update validation rules
const productRules = [
    body('name')
        .trim()
        .notEmpty().withMessage('Product name is required')
        .isLength({ min: 2, max: 200 }).withMessage('Product name must be between 2 and 200 characters'),

    body('description')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 2000 }).withMessage('Description must be less than 2000 characters'),

    body('price')
        .notEmpty().withMessage('Price is required')
        .isFloat({ min: 0 }).withMessage('Price must be a positive number')
        .toFloat(),

    body('originalPrice')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0 }).withMessage('Original price must be a positive number')
        .toFloat(),

    body('discount')
        .optional({ checkFalsy: true })
        .isInt({ min: 0, max: 100 }).withMessage('Discount must be between 0 and 100')
        .toInt(),

    body('category')
        .notEmpty().withMessage('Category is required')
        .isIn(validCategories).withMessage(`Category must be one of: ${validCategories.join(', ')}`),

    body('subcategory')
        .optional({ checkFalsy: true })
        .isIn(validSubcategories).withMessage(`Subcategory must be one of: ${validSubcategories.join(', ')}`),

    body('stock')
        .optional({ checkFalsy: true })
        .isInt({ min: 0 }).withMessage('Stock must be a non-negative integer')
        .toInt(),

    // Wig-specific attributes (optional, only meaningful when category = 'Wigs')
    body('wigTexture')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 50 }).withMessage('Wig texture must be 50 characters or fewer'),

    body('wigCapType')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 50 }).withMessage('Wig cap type must be 50 characters or fewer'),

    body('wigOrigin')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 50 }).withMessage('Wig origin must be 50 characters or fewer'),

    body('wigDensity')
        .optional({ checkFalsy: true })
        .isInt({ min: 100, max: 300 }).withMessage('Wig density must be between 100% and 300%')
        .toInt(),

    // Facet / metadata attributes (optional, populated by admin based on category)
    body('brand').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
    body('isLocalBrand').optional({ checkFalsy: true }).isBoolean().toBoolean(),
    body('scentFamily').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
    body('skinType').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
    body('hairTexture').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
    body('ingredients').optional({ checkFalsy: true }).trim().isLength({ max: 4000 }),
    body('allergens').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }),
    body('isAuthenticVerified').optional({ checkFalsy: true }).isBoolean().toBoolean(),
    body('isSample').optional({ checkFalsy: true }).isBoolean().toBoolean(),
    body('size').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),

    handleValidationErrors
];

// Product ID parameter validation
const productIdRules = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid product ID')
        .toInt(),

    handleValidationErrors
];

// Product query validation
const productQueryRules = [
    query('category')
        .optional()
        .isIn([...validCategories, '']).withMessage('Invalid category'),

    query('subcategory')
        .optional({ checkFalsy: true })
        .isIn(validSubcategories).withMessage('Invalid subcategory'),

    query('search')
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage('Search query too long'),

    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('Page must be a positive integer')
        .toInt(),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
        .toInt(),

    handleValidationErrors
];

module.exports = {
    productRules,
    productIdRules,
    productQueryRules,
    validCategories
};
