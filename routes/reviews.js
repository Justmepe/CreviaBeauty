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
            orderId,
            reviewToken
        } = req.body;

        const userId = req.session?.userId || null;

        // A review arriving via a valid admin request link is pre-trusted (we
        // solicited it from a real buyer), so it skips the moderation queue.
        // Organic/anonymous submissions still land unapproved for review.
        let trustedRequest = null;
        if (reviewToken) {
            const lookup = await db.query(
                "SELECT id FROM review_requests WHERE token = $1 AND status = 'sent'",
                [String(reviewToken).slice(0, 64)]
            );
            trustedRequest = lookup.rows[0] || null;
        }
        const autoApprove = !!trustedRequest;

        const result = await db.query(`
            INSERT INTO reviews (
                user_id, order_id, product_id, customer_name, customer_email,
                rating, review_text, product_quality, delivery_rating, is_approved
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
            deliveryRating || null,
            autoApprove
        ]);

        const reviewId = result.rows[0].id;

        // Close out the request so it shows as completed in the follow-up list.
        if (trustedRequest) {
            await db.query(`
                UPDATE review_requests
                SET status = 'completed', review_id = $1, completed_at = NOW()
                WHERE id = $2
            `, [reviewId, trustedRequest.id]);
        }

        logger.info('Review submitted', {
            reviewId,
            rating,
            customerName,
            autoApproved: autoApprove
        });

        res.json({
            success: true,
            autoApproved: autoApprove,
            message: autoApprove
                ? 'Thank you for your review! It is now live on our site.'
                : 'Thank you for your review! It will be visible after approval.'
        });
    }));

    // Get approved reviews (public)
    router.get('/', cacheMiddleware('reviews', TTL.REVIEWS), asyncHandler(async (req, res) => {
        const result = await db.query(`
            SELECT r.*, p.name as product_name, p.image_url as product_image
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
