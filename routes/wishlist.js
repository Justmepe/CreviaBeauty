/**
 * Wishlist Routes
 */

const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const AppError = require('../utils/AppError');

module.exports = (db) => {
    // Get current user's wishlist (joined with products)
    router.get('/', requireAuth, asyncHandler(async (req, res) => {
        const result = await db.query(`
            SELECT p.*, w.created_at AS wishlisted_at
            FROM wishlists w
            JOIN products p ON p.id = w.product_id
            WHERE w.user_id = $1
            ORDER BY w.created_at DESC
        `, [req.session.userId]);
        res.json({ data: result.rows });
    }));

    // Get just the product IDs (for fast heart-icon hydration on listing pages)
    router.get('/ids', requireAuth, asyncHandler(async (req, res) => {
        const result = await db.query(`SELECT product_id FROM wishlists WHERE user_id = $1`, [req.session.userId]);
        res.json({ ids: result.rows.map(r => r.product_id) });
    }));

    // Add a product to the wishlist
    router.post('/', requireAuth, asyncHandler(async (req, res) => {
        const productId = parseInt(req.body.productId, 10);
        if (!Number.isInteger(productId) || productId < 1) {
            throw AppError.badRequest('Invalid productId');
        }
        const exists = await db.query('SELECT id FROM products WHERE id = $1', [productId]);
        if (exists.rows.length === 0) throw AppError.notFound('Product not found');
        await db.query(`
            INSERT INTO wishlists (user_id, product_id) VALUES ($1, $2)
            ON CONFLICT (user_id, product_id) DO NOTHING
        `, [req.session.userId, productId]);
        res.json({ success: true });
    }));

    // Remove a product from the wishlist
    router.delete('/:productId', requireAuth, asyncHandler(async (req, res) => {
        const productId = parseInt(req.params.productId, 10);
        if (!Number.isInteger(productId) || productId < 1) {
            throw AppError.badRequest('Invalid productId');
        }
        await db.query(`DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2`,
            [req.session.userId, productId]);
        res.json({ success: true });
    }));

    return router;
};
