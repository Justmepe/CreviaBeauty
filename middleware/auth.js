/**
 * Authentication Middleware
 * Provides route protection and authorization checks
 */

const AppError = require('../utils/AppError');

/**
 * Require user to be authenticated
 */
const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    return next(AppError.unauthorized('Please login first'));
};

/**
 * Require user to be admin
 */
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.userId && req.session.isAdmin) {
        return next();
    }
    return next(AppError.forbidden('Admin access required'));
};

/**
 * Require user to be an approved marketer
 */
const requireMarketer = (db) => {
    return async (req, res, next) => {
        if (!req.session || !req.session.userId) {
            return next(AppError.unauthorized('Please login first'));
        }

        try {
            const result = await db.query(`
                SELECT mp.status FROM marketer_profiles mp
                WHERE mp.user_id = $1
            `, [req.session.userId]);

            const profile = result.rows[0];

            if (!profile) {
                return next(AppError.forbidden('You are not registered as a marketer'));
            }

            if (profile.status !== 'approved') {
                return next(AppError.forbidden('Your marketer account is not approved yet'));
            }

            next();
        } catch (error) {
            return next(AppError.internal('Failed to verify marketer status'));
        }
    };
};

/**
 * Optional authentication - attaches user info if available
 */
const optionalAuth = (req, res, next) => {
    // User info is already in session if logged in
    next();
};

/**
 * Verify ownership of a cart item
 */
const verifyCartOwnership = (db) => {
    return (req, res, next) => {
        const cartItemId = parseInt(req.params.id, 10);
        const userId = req.session.userId;
        const sessionId = req.sessionID;

        if (isNaN(cartItemId)) {
            return next(AppError.badRequest('Invalid cart item ID'));
        }

        const cartItem = db.prepare('SELECT * FROM cart WHERE id = ?').get(cartItemId);

        if (!cartItem) {
            return next(AppError.notFound('Cart item not found'));
        }

        // Check ownership - must match either user_id or session_id
        const isOwner = (userId && cartItem.user_id === userId) ||
                        (!userId && cartItem.session_id === sessionId);

        if (!isOwner) {
            return next(AppError.forbidden('You do not have permission to modify this item'));
        }

        req.cartItem = cartItem;
        next();
    };
};

/**
 * Verify ownership of an order
 */
const verifyOrderOwnership = (db) => {
    return (req, res, next) => {
        const orderId = parseInt(req.params.id, 10);
        const userId = req.session.userId;

        if (isNaN(orderId)) {
            return next(AppError.badRequest('Invalid order ID'));
        }

        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

        if (!order) {
            return next(AppError.notFound('Order not found'));
        }

        // Check ownership (admin can access all orders)
        if (order.user_id !== userId && !req.session.isAdmin) {
            return next(AppError.forbidden('You do not have permission to access this order'));
        }

        req.order = order;
        next();
    };
};

module.exports = {
    requireAuth,
    requireAdmin,
    requireMarketer,
    optionalAuth,
    verifyCartOwnership,
    verifyOrderOwnership
};
