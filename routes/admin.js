/**
 * Admin Routes
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { requireAdmin } = require('../middleware/auth');
const { updateStatusRules, validStatuses } = require('../validators/order');
const { reviewIdRules, approveReviewRules } = require('../validators/review');
const { invalidateCache } = require('../middleware/cache');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

module.exports = (db) => {
    // All admin routes require authentication
    router.use(requireAdmin);

    // ============ ORDER MANAGEMENT ============

    // Get all orders with pagination
    router.get('/orders', asyncHandler(async (req, res) => {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 50;
        const offset = (page - 1) * limit;

        const totalResult = await db.query('SELECT COUNT(*) as total FROM orders');
        const total = parseInt(totalResult.rows[0].total);

        const ordersResult = await db.query(`
            SELECT o.*, COALESCE(u.name, o.customer_name) as user_name, u.email as user_email,
                   (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            ORDER BY o.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        res.json({
            data: ordersResult.rows,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    }));

    // Get order details
    router.get('/orders/:id', asyncHandler(async (req, res) => {
        const orderId = parseInt(req.params.id, 10);

        if (isNaN(orderId)) {
            throw AppError.badRequest('Invalid order ID');
        }

        const orderResult = await db.query(`
            SELECT o.*, u.name as user_name, u.email as user_email
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.id = $1
        `, [orderId]);

        const order = orderResult.rows[0];

        if (!order) {
            throw AppError.notFound('Order not found');
        }

        const itemsResult = await db.query(`
            SELECT oi.*, p.name, p.image_url
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = $1
        `, [orderId]);

        res.json({ ...order, items: itemsResult.rows });
    }));

    // Helper: Get points settings
    async function getPointsSettings() {
        const result = await db.query('SELECT setting_key, setting_value FROM points_settings');
        const settings = {};
        for (const row of result.rows) {
            settings[row.setting_key] = row.setting_value;
        }
        return settings;
    }

    // Update order status
    router.put('/orders/:id', updateStatusRules, asyncHandler(async (req, res) => {
        const { status } = req.body;
        const orderId = parseInt(req.params.id, 10);

        if (isNaN(orderId)) {
            throw AppError.badRequest('Invalid order ID');
        }

        const existingResult = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        const existing = existingResult.rows[0];

        if (!existing) {
            throw AppError.notFound('Order not found');
        }

        const previousStatus = existing.status;
        const isCompleting = (status === 'delivered' || status === 'complete') && previousStatus !== 'delivered' && previousStatus !== 'complete';
        const isCancelling = status === 'cancelled' && previousStatus !== 'cancelled';

        await db.transaction(async (client) => {
            // Restore stock if cancelling
            if (isCancelling) {
                const itemsResult = await client.query(
                    'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
                    [orderId]
                );

                for (const item of itemsResult.rows) {
                    await client.query(
                        'UPDATE products SET stock = stock + $1 WHERE id = $2',
                        [item.quantity, item.product_id]
                    );
                }

                // Cancel pending commission
                await client.query(`
                    UPDATE commissions SET status = 'cancelled' WHERE order_id = $1 AND status = 'pending'
                `, [orderId]);

                // Refund redeemed points if any
                if (existing.points_redeemed > 0) {
                    await client.query(`
                        UPDATE users SET points_balance = points_balance + $1 WHERE id = $2
                    `, [existing.points_redeemed, existing.user_id]);

                    const balanceResult = await client.query('SELECT points_balance FROM users WHERE id = $1', [existing.user_id]);
                    await client.query(`
                        INSERT INTO points_transactions (user_id, points, type, description, reference_id, balance_after)
                        VALUES ($1, $2, 'refund', 'Order cancelled - points refunded', $3, $4)
                    `, [existing.user_id, existing.points_redeemed, orderId, balanceResult.rows[0].points_balance]);
                }
            }

            // Handle order completion (delivery/complete)
            if (isCompleting) {
                const pointsSettings = await getPointsSettings();
                const referralBonus = parseInt(pointsSettings.referral_bonus) || 500;
                const pointsEnabled = pointsSettings.points_enabled === 'true';
                const referralsEnabled = pointsSettings.referrals_enabled === 'true';

                // Award points earned from purchase
                if (pointsEnabled && existing.points_earned > 0) {
                    await client.query(`
                        UPDATE users SET points_balance = points_balance + $1 WHERE id = $2
                    `, [existing.points_earned, existing.user_id]);

                    const balanceResult = await client.query('SELECT points_balance FROM users WHERE id = $1', [existing.user_id]);
                    await client.query(`
                        INSERT INTO points_transactions (user_id, points, type, description, reference_id, balance_after)
                        VALUES ($1, $2, 'earned', 'Points earned from order #' || $3, $3, $4)
                    `, [existing.user_id, existing.points_earned, orderId, balanceResult.rows[0].points_balance]);

                    logger.info('Points awarded', { userId: existing.user_id, points: existing.points_earned, orderId });
                }

                // Handle referral bonus (first order only)
                if (referralsEnabled && referralBonus > 0) {
                    // Check if this is user's first completed order
                    const firstOrderCheck = await client.query(`
                        SELECT id FROM orders
                        WHERE user_id = $1 AND id != $2 AND (status = 'delivered' OR status = 'complete')
                        LIMIT 1
                    `, [existing.user_id, orderId]);

                    if (firstOrderCheck.rows.length === 0) {
                        // This is the first completed order
                        // Check if user was referred
                        const referralCheck = await client.query(`
                            SELECT cr.id, cr.referrer_id, cr.bonus_awarded
                            FROM customer_referrals cr
                            WHERE cr.referred_id = $1 AND cr.bonus_awarded = FALSE
                        `, [existing.user_id]);

                        if (referralCheck.rows.length > 0) {
                            const referral = referralCheck.rows[0];

                            // Award bonus to referrer
                            await client.query(`
                                UPDATE users SET points_balance = points_balance + $1 WHERE id = $2
                            `, [referralBonus, referral.referrer_id]);

                            let referrerBalance = await client.query('SELECT points_balance FROM users WHERE id = $1', [referral.referrer_id]);
                            await client.query(`
                                INSERT INTO points_transactions (user_id, points, type, description, reference_id, balance_after)
                                VALUES ($1, $2, 'referral_bonus', 'Referral bonus - friend made first purchase', $3, $4)
                            `, [referral.referrer_id, referralBonus, existing.user_id, referrerBalance.rows[0].points_balance]);

                            // Award bonus to referred user
                            await client.query(`
                                UPDATE users SET points_balance = points_balance + $1 WHERE id = $2
                            `, [referralBonus, existing.user_id]);

                            let referredBalance = await client.query('SELECT points_balance FROM users WHERE id = $1', [existing.user_id]);
                            await client.query(`
                                INSERT INTO points_transactions (user_id, points, type, description, reference_id, balance_after)
                                VALUES ($1, $2, 'referral_bonus', 'Welcome bonus - first purchase with referral', $3, $4)
                            `, [existing.user_id, referralBonus, referral.referrer_id, referredBalance.rows[0].points_balance]);

                            // Mark referral as bonus awarded and link to order
                            await client.query(`
                                UPDATE customer_referrals SET bonus_awarded = TRUE, first_order_id = $1 WHERE id = $2
                            `, [orderId, referral.id]);

                            logger.info('Referral bonus awarded', { referrerId: referral.referrer_id, referredId: existing.user_id, bonus: referralBonus });
                        }
                    }
                }

                // Approve pending commission
                if (existing.marketer_id) {
                    const commissionResult = await client.query(`
                        SELECT id, commission_amount FROM commissions
                        WHERE order_id = $1 AND status = 'pending'
                    `, [orderId]);

                    if (commissionResult.rows.length > 0) {
                        const commission = commissionResult.rows[0];

                        await client.query(`
                            UPDATE commissions SET status = 'approved', approved_at = NOW() WHERE id = $1
                        `, [commission.id]);

                        // Update marketer profile totals
                        await client.query(`
                            UPDATE marketer_profiles
                            SET total_sales = total_sales + $1,
                                total_commission = total_commission + $2
                            WHERE user_id = $3
                        `, [existing.total, commission.commission_amount, existing.marketer_id]);

                        // Check and update tier
                        const profileResult = await client.query(`
                            SELECT total_sales FROM marketer_profiles WHERE user_id = $1
                        `, [existing.marketer_id]);

                        const totalSales = parseFloat(profileResult.rows[0].total_sales);

                        const tierResult = await client.query(`
                            SELECT tier_name, commission_rate FROM commission_tiers
                            WHERE min_sales <= $1
                            ORDER BY min_sales DESC LIMIT 1
                        `, [totalSales]);

                        if (tierResult.rows.length > 0) {
                            await client.query(`
                                UPDATE marketer_profiles
                                SET tier = $1, commission_rate = $2
                                WHERE user_id = $3
                            `, [tierResult.rows[0].tier_name, tierResult.rows[0].commission_rate, existing.marketer_id]);
                        }

                        logger.info('Commission approved', { marketerId: existing.marketer_id, commission: commission.commission_amount, orderId });
                    }
                }
            }

            // Update order status
            await client.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
        });

        logger.info('Order status updated', { orderId, status, previousStatus });

        res.json({ success: true });
    }));

    // Update payment status
    router.put('/orders/:id/payment', asyncHandler(async (req, res) => {
        const { payment_status } = req.body;
        const orderId = parseInt(req.params.id, 10);

        if (isNaN(orderId)) {
            throw AppError.badRequest('Invalid order ID');
        }

        const validStatuses = ['pending', 'paid'];
        if (!validStatuses.includes(payment_status)) {
            throw AppError.badRequest('Invalid payment status');
        }

        const existingResult = await db.query('SELECT id FROM orders WHERE id = $1', [orderId]);
        if (!existingResult.rows[0]) {
            throw AppError.notFound('Order not found');
        }

        await db.query('UPDATE orders SET payment_status = $1 WHERE id = $2', [payment_status, orderId]);

        logger.info('Payment status updated', { orderId, payment_status });

        res.json({ success: true });
    }));

    // ============ REVIEW MANAGEMENT ============

    // Get all reviews with pagination
    router.get('/reviews', asyncHandler(async (req, res) => {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 50;
        const offset = (page - 1) * limit;

        const totalResult = await db.query('SELECT COUNT(*) as total FROM reviews');
        const total = parseInt(totalResult.rows[0].total);

        const reviewsResult = await db.query(`
            SELECT r.*, p.name as product_name
            FROM reviews r
            LEFT JOIN products p ON r.product_id = p.id
            ORDER BY r.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        res.json({
            data: reviewsResult.rows,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    }));

    // Approve/reject review
    router.put('/reviews/:id', invalidateCache('reviews'), approveReviewRules, asyncHandler(async (req, res) => {
        const { isApproved } = req.body;
        const reviewId = parseInt(req.params.id, 10);

        if (isNaN(reviewId)) {
            throw AppError.badRequest('Invalid review ID');
        }

        const existingResult = await db.query('SELECT id FROM reviews WHERE id = $1', [reviewId]);
        if (existingResult.rows.length === 0) {
            throw AppError.notFound('Review not found');
        }

        await db.query('UPDATE reviews SET is_approved = $1 WHERE id = $2', [isApproved, reviewId]);

        logger.info('Review status updated', { reviewId, approved: isApproved });

        res.json({ success: true });
    }));

    // Delete review
    router.delete('/reviews/:id', invalidateCache('reviews'), reviewIdRules, asyncHandler(async (req, res) => {
        const reviewId = parseInt(req.params.id, 10);

        if (isNaN(reviewId)) {
            throw AppError.badRequest('Invalid review ID');
        }

        const existingResult = await db.query('SELECT id FROM reviews WHERE id = $1', [reviewId]);
        if (existingResult.rows.length === 0) {
            throw AppError.notFound('Review not found');
        }

        await db.query('DELETE FROM reviews WHERE id = $1', [reviewId]);

        logger.info('Review deleted', { reviewId });

        res.json({ success: true });
    }));

    // ============ REVIEW REQUESTS (post-purchase follow-up) ============

    // List recent review requests with product name + status, for the
    // follow-up table in admin.
    router.get('/review-requests', asyncHandler(async (req, res) => {
        const result = await db.query(`
            SELECT rr.*, p.name AS product_name
            FROM review_requests rr
            LEFT JOIN products p ON rr.product_id = p.id
            ORDER BY rr.created_at DESC
            LIMIT 100
        `);
        res.json({ data: result.rows });
    }));

    // Generate a review-request link for a customer. Returns a token + the
    // relative review path; the client builds the absolute URL + WhatsApp link.
    router.post('/review-requests', asyncHandler(async (req, res) => {
        const { orderId, productId, customerName, customerPhone } = req.body;

        const pid = parseInt(productId, 10);
        if (isNaN(pid)) throw AppError.badRequest('A product is required');

        const prod = await db.query('SELECT id, name FROM products WHERE id = $1', [pid]);
        if (prod.rows.length === 0) throw AppError.notFound('Product not found');

        const oid = orderId ? parseInt(orderId, 10) : null;
        const token = crypto.randomBytes(16).toString('hex');
        const name = (customerName || '').toString().trim().slice(0, 255) || null;
        const phone = (customerPhone || '').toString().trim().slice(0, 50) || null;

        const result = await db.query(`
            INSERT INTO review_requests (token, order_id, product_id, customer_name, customer_phone)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [token, oid, pid, name, phone]);

        logger.info('Review request created', { id: result.rows[0].id, productId: pid, orderId: oid });

        // Deep link the customer lands on: product preselected, token tracked,
        // name prefilled for convenience.
        const params = new URLSearchParams({ product: String(pid), rt: token });
        if (name) params.set('name', name);

        res.json({
            success: true,
            token,
            path: `/review?${params.toString()}`,
            productName: prod.rows[0].name
        });
    }));

    // ============ CONTACT MANAGEMENT ============

    // Get all contacts with pagination
    router.get('/contacts', asyncHandler(async (req, res) => {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 50;
        const offset = (page - 1) * limit;

        const totalResult = await db.query('SELECT COUNT(*) as total FROM contacts');
        const total = parseInt(totalResult.rows[0].total);

        const contactsResult = await db.query(`
            SELECT * FROM contacts
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        res.json({
            data: contactsResult.rows,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    }));

    // Delete contact message
    router.delete('/contacts/:id', asyncHandler(async (req, res) => {
        const contactId = parseInt(req.params.id, 10);

        if (isNaN(contactId)) {
            throw AppError.badRequest('Invalid contact ID');
        }

        await db.query('DELETE FROM contacts WHERE id = $1', [contactId]);

        logger.info('Contact deleted', { contactId });

        res.json({ success: true });
    }));

    // ============ PAYMENT SETTINGS ============

    // Get all payment settings
    router.get('/payment-settings', asyncHandler(async (req, res) => {
        const result = await db.query('SELECT setting_key, setting_value FROM payment_settings');

        // Convert to object for easier frontend use
        const settings = {};
        for (const row of result.rows) {
            settings[row.setting_key] = row.setting_value;
        }

        res.json(settings);
    }));

    // Update payment settings
    router.put('/payment-settings', asyncHandler(async (req, res) => {
        const settings = req.body;

        if (!settings || typeof settings !== 'object') {
            throw AppError.badRequest('Invalid settings data');
        }

        // Update each setting
        for (const [key, value] of Object.entries(settings)) {
            await db.query(`
                INSERT INTO payment_settings (setting_key, setting_value, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (setting_key)
                DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP
            `, [key, value]);
        }

        logger.info('Payment settings updated', { keys: Object.keys(settings) });

        res.json({ success: true });
    }));

    return router;
};
