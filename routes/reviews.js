/**
 * Review Routes
 */

const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { formLimiter } = require('../middleware/rateLimiter');
const { reviewRules } = require('../validators/review');
const { cacheMiddleware, invalidateCache, TTL } = require('../middleware/cache');
const logger = require('../utils/logger');

module.exports = (db) => {
    // Submit a review (public)
    router.post('/', formLimiter, reviewRules, invalidateCache('reviews'), asyncHandler(async (req, res) => {
        const {
            customerName,
            customerEmail,
            rating,
            reviewText,
            productQuality,
            deliveryRating,
            productId,
            orderId
        } = req.body;

        const userId = req.session?.userId || null;

        const result = await db.query(`
            INSERT INTO reviews (
                user_id, order_id, product_id, customer_name, customer_email,
                rating, review_text, product_quality, delivery_rating, is_approved
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
            RETURNING id
        `, [
            userId,
            orderId || null,
            productId || null,
            customerName,
            customerEmail || null,
            rating,
            reviewText || null,
            productQuality || null,
            deliveryRating || null
        ]);

        logger.info('Review submitted', {
            reviewId: result.rows[0].id,
            rating,
            customerName
        });

        res.json({
            success: true,
            message: 'Thank you for your review! It will be visible after approval.'
        });
    }));

    // Get approved reviews (public)
    router.get('/', cacheMiddleware('reviews', TTL.REVIEWS), asyncHandler(async (req, res) => {
        const result = await db.query(`
            SELECT r.*, p.name as product_name
            FROM reviews r
            LEFT JOIN products p ON r.product_id = p.id
            WHERE r.is_approved = TRUE
            ORDER BY r.created_at DESC
            LIMIT 20
        `);

        res.json(result.rows);
    }));

    return router;
};
