/**
 * Cart Routes
 */

const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { addToCartRules, updateCartRules, cartIdRules } = require('../validators/cart');
const AppError = require('../utils/AppError');

module.exports = (db) => {
    // Verify cart ownership middleware
    const verifyCartOwnership = async (req, res, next) => {
        const cartItemId = parseInt(req.params.id, 10);
        const userId = req.session.userId;
        const sessionId = req.sessionID;

        if (isNaN(cartItemId)) {
            return next(AppError.badRequest('Invalid cart item ID'));
        }

        const result = await db.query('SELECT * FROM cart WHERE id = $1', [cartItemId]);
        const cartItem = result.rows[0];

        if (!cartItem) {
            return next(AppError.notFound('Cart item not found'));
        }

        const isOwner = (userId && cartItem.user_id === userId) ||
                        (!userId && cartItem.session_id === sessionId);

        if (!isOwner) {
            return next(AppError.forbidden('You do not have permission to modify this item'));
        }

        req.cartItem = cartItem;
        next();
    };

    // Get cart
    router.get('/', asyncHandler(async (req, res) => {
        const userId = req.session.userId;
        const sessionId = req.sessionID;

        let result;
        if (userId) {
            result = await db.query(`
                SELECT c.id, c.quantity, p.id as product_id, p.name, p.price, p.image_url, p.stock
                FROM cart c
                JOIN products p ON c.product_id = p.id
                WHERE c.user_id = $1
            `, [userId]);
        } else {
            result = await db.query(`
                SELECT c.id, c.quantity, p.id as product_id, p.name, p.price, p.image_url, p.stock
                FROM cart c
                JOIN products p ON c.product_id = p.id
                WHERE c.session_id = $1
            `, [sessionId]);
        }

        const items = result.rows;
        const total = items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);

        res.json({ items, total, count: items.length });
    }));

    // Add to cart
    router.post('/', addToCartRules, asyncHandler(async (req, res) => {
        const { productId, quantity = 1 } = req.body;
        const userId = req.session.userId;
        const sessionId = req.sessionID;

        // Check product exists and has stock
        const productResult = await db.query('SELECT id, stock, name FROM products WHERE id = $1', [productId]);
        const product = productResult.rows[0];

        if (!product) {
            throw AppError.notFound('Product not found');
        }

        // Check existing cart item
        let existingResult;
        if (userId) {
            existingResult = await db.query('SELECT * FROM cart WHERE user_id = $1 AND product_id = $2', [userId, productId]);
        } else {
            existingResult = await db.query('SELECT * FROM cart WHERE session_id = $1 AND product_id = $2', [sessionId, productId]);
        }
        const existing = existingResult.rows[0];

        const currentQty = existing ? existing.quantity : 0;
        const requestedQty = currentQty + quantity;

        if (product.stock > 0 && requestedQty > product.stock) {
            throw AppError.badRequest(`Only ${product.stock} units available for ${product.name}`);
        }

        if (existing) {
            await db.query('UPDATE cart SET quantity = quantity + $1 WHERE id = $2', [quantity, existing.id]);
        } else {
            await db.query(`
                INSERT INTO cart (user_id, product_id, quantity, session_id)
                VALUES ($1, $2, $3, $4)
            `, [userId || null, productId, quantity, userId ? null : sessionId]);
        }

        res.json({ success: true });
    }));

    // Update cart item - with ownership verification
    router.put('/:id', updateCartRules, asyncHandler(async (req, res, next) => {
        await verifyCartOwnership(req, res, async () => {
            const { quantity } = req.body;
            const cartItem = req.cartItem;

            if (quantity <= 0) {
                await db.query('DELETE FROM cart WHERE id = $1', [cartItem.id]);
            } else {
                // Check stock availability
                const productResult = await db.query('SELECT stock, name FROM products WHERE id = $1', [cartItem.product_id]);
                const product = productResult.rows[0];

                if (product && product.stock > 0 && quantity > product.stock) {
                    throw AppError.badRequest(`Only ${product.stock} units available for ${product.name}`);
                }

                await db.query('UPDATE cart SET quantity = $1 WHERE id = $2', [quantity, cartItem.id]);
            }

            res.json({ success: true });
        });
    }));

    // Remove from cart - with ownership verification
    router.delete('/:id', cartIdRules, asyncHandler(async (req, res, next) => {
        await verifyCartOwnership(req, res, async () => {
            await db.query('DELETE FROM cart WHERE id = $1', [req.cartItem.id]);
            res.json({ success: true });
        });
    }));

    return router;
};
