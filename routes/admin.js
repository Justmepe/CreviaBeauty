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
const { sendPaidReceiptToDiscord } = require('../utils/orderReceipt');
const { buildCategoryResolver } = require('../utils/itemCategory');

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
            SELECT oi.*, p.name, p.image_url, p.category
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = $1
        `, [orderId]);

        res.json({ ...order, items: itemsResult.rows });
    }));

    // ============ DASHBOARD ANALYTICS ============

    // Aggregated analytics for the admin dashboard charts/KPIs
    router.get('/analytics', asyncHandler(async (req, res) => {
        const num = (v) => Number(v) || 0;

        const [summaryRes, revByDayRes, statusRes, lineItemsRes, jsonOrdersRes, productsRes, paymentRes, recentRes] = await Promise.all([
            db.query(`
                SELECT
                    (SELECT COUNT(*) FROM products)                                   AS total_products,
                    (SELECT COUNT(*) FROM products WHERE stock < 10)                  AS low_stock,
                    (SELECT COUNT(*) FROM orders)                                     AS total_orders,
                    (SELECT COUNT(*) FROM orders WHERE status = 'pending')            AS pending_orders,
                    (SELECT COUNT(*) FROM orders WHERE status = 'delivered')          AS delivered_orders,
                    (SELECT COALESCE(SUM(total), 0) FROM orders)                      AS total_revenue,
                    (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status = 'delivered') AS realized_revenue,
                    (SELECT COUNT(*) FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS orders_30d,
                    (SELECT COALESCE(SUM(total), 0) FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS revenue_30d
            `),
            db.query(`
                SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
                       COALESCE(SUM(o.total), 0)    AS revenue,
                       COUNT(o.id)                  AS orders
                FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS d(day)
                LEFT JOIN orders o ON o.created_at::date = d.day::date
                GROUP BY d.day
                ORDER BY d.day
            `),
            db.query(`SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY count DESC`),
            // Structured line items (storefront checkout writes to order_items)
            db.query(`
                SELECT p.name, COALESCE(p.category, 'Other') AS category,
                       p.subcategory, p.brand, oi.quantity, oi.price
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
            `),
            // Free-text line items (manual / receipt orders store these in items_json)
            db.query(`SELECT items_json FROM orders WHERE items_json IS NOT NULL AND items_json <> ''`),
            // Catalog used to resolve free-text item names back to category/brand
            db.query(`SELECT id, name, category, subcategory, brand FROM products`),
            db.query(`
                SELECT COALESCE(payment_method, 'cod') AS method,
                       COUNT(*)                  AS count,
                       COALESCE(SUM(total), 0)   AS revenue
                FROM orders
                GROUP BY payment_method
                ORDER BY count DESC
            `),
            db.query(`
                SELECT o.id, o.total, o.status, o.created_at,
                       COALESCE(u.name, o.customer_name) AS user_name
                FROM orders o
                LEFT JOIN users u ON o.user_id = u.id
                ORDER BY o.created_at DESC
                LIMIT 6
            `)
        ]);

        const s = summaryRes.rows[0] || {};
        const totalOrders = num(s.total_orders);
        const totalRevenue = num(s.total_revenue);

        // Aggregate revenue by category / subcategory / brand / product from BOTH
        // structured order_items and free-text items_json. Each attribute is taken
        // in priority order: an explicit field on the item, the linked product_id,
        // the live catalog by name, then a keyword/known-brand heuristic.
        const resolveCategory = buildCategoryResolver(productsRes.rows);
        const productById = new Map(productsRes.rows.map(p => [String(p.id), p]));
        const catMap = new Map();    // category -> { revenue, units }
        const subMap = new Map();    // subcategory -> { revenue, units }
        const brandMap = new Map();  // brand -> { revenue, units }
        const prodMap = new Map();   // product name -> { revenue, units, brand, category }
        const clean = (v) => (v == null ? '' : String(v).trim());
        const bump = (map, key, revenue, qty, extra) => {
            const e = map.get(key) || Object.assign({ revenue: 0, units: 0 }, extra);
            e.revenue += revenue; e.units += qty;
            if (extra) Object.assign(e, extra, { revenue: e.revenue, units: e.units });
            map.set(key, e);
        };
        const addLine = ({ name, category, subcategory, brand, qty, price }) => {
            const revenue = qty * price;
            if (!revenue && !qty) return;
            const cat = clean(category) || 'Other';
            bump(catMap, cat, revenue, qty);
            // Null subcategory falls back to the parent category so the chart stays meaningful.
            bump(subMap, clean(subcategory) || cat, revenue, qty);
            bump(brandMap, clean(brand) || 'Unbranded / Other', revenue, qty);
            bump(prodMap, clean(name) || 'Unknown', revenue, qty, { brand: clean(brand) || null, category: cat });
        };

        for (const r of lineItemsRes.rows) {
            addLine({
                name: r.name, category: r.category, subcategory: r.subcategory, brand: r.brand,
                qty: num(r.quantity), price: num(r.price)
            });
        }
        for (const r of jsonOrdersRes.rows) {
            let items;
            try { items = JSON.parse(r.items_json); } catch (e) { continue; }
            if (!Array.isArray(items)) continue;
            for (const it of items) {
                const qty = num(it.quantity != null ? it.quantity : it.qty) || 1;
                const price = num(it.price != null ? it.price : it.unit_price);
                const linked = it.product_id != null ? productById.get(String(it.product_id)) : null;
                const m = resolveCategory(it.name || (linked && linked.name) || '');
                // Prefer an explicit field, then linked product, then resolver.
                addLine({
                    name: clean(it.name) || (linked && linked.name) || m.name,
                    category: clean(it.category) || (linked && linked.category) || m.category,
                    subcategory: clean(it.subcategory) || (linked && linked.subcategory) || m.subcategory,
                    brand: clean(it.brand) || (linked && linked.brand) || m.brand,
                    qty, price
                });
            }
        }

        const toSorted = (map, keyName) => [...map.entries()]
            .map(([k, v]) => Object.assign({ [keyName]: k, revenue: Math.round(v.revenue), units: v.units },
                v.brand !== undefined ? { brand: v.brand, category: v.category } : {}))
            .sort((a, b) => b.revenue - a.revenue);

        const revenueByCategory = toSorted(catMap, 'category');
        const revenueBySubcategory = toSorted(subMap, 'subcategory');
        const revenueByBrand = toSorted(brandMap, 'brand');
        const topProducts = toSorted(prodMap, 'name').slice(0, 6);

        res.json({
            summary: {
                totalProducts: num(s.total_products),
                lowStock: num(s.low_stock),
                totalOrders,
                pendingOrders: num(s.pending_orders),
                deliveredOrders: num(s.delivered_orders),
                totalRevenue,
                realizedRevenue: num(s.realized_revenue),
                avgOrderValue: totalOrders ? Math.round(totalRevenue / totalOrders) : 0,
                orders30d: num(s.orders_30d),
                revenue30d: num(s.revenue_30d)
            },
            revenueByDay: revByDayRes.rows.map(r => ({
                date: r.date,
                revenue: num(r.revenue),
                orders: num(r.orders)
            })),
            ordersByStatus: statusRes.rows.map(r => ({ status: r.status || 'unknown', count: num(r.count) })),
            revenueByCategory,
            revenueBySubcategory,
            revenueByBrand,
            topProducts,
            paymentMethods: paymentRes.rows.map(r => ({
                method: r.method,
                count: num(r.count),
                revenue: num(r.revenue)
            })),
            recentOrders: recentRes.rows.map(r => ({
                id: r.id,
                total: num(r.total),
                status: r.status,
                created_at: r.created_at,
                user_name: r.user_name
            }))
        });
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

            // For Cash on Delivery, completing the order means cash was collected,
            // so mark it paid (which triggers the PAID receipt below).
            if (isCompleting && existing.payment_method === 'cod' && existing.payment_status !== 'paid') {
                await client.query('UPDATE orders SET payment_status = $1 WHERE id = $2', ['paid', orderId]);
            }
        });

        logger.info('Order status updated', { orderId, status, previousStatus });

        // COD just got paid on delivery — send the final PAID receipt to Discord.
        if (isCompleting && existing.payment_method === 'cod' && existing.payment_status !== 'paid') {
            sendPaidReceiptToDiscord(db, orderId);
        }

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

        const existingResult = await db.query('SELECT id, payment_status FROM orders WHERE id = $1', [orderId]);
        const existing = existingResult.rows[0];
        if (!existing) {
            throw AppError.notFound('Order not found');
        }

        await db.query('UPDATE orders SET payment_status = $1 WHERE id = $2', [payment_status, orderId]);

        logger.info('Payment status updated', { orderId, payment_status });

        // On transition to paid, push the final PAID receipt to Discord
        // (background — don't block the response on PDF render + upload).
        if (payment_status === 'paid' && existing.payment_status !== 'paid') {
            sendPaidReceiptToDiscord(db, orderId);
        }

        res.json({ success: true });
    }));

    // Delete an order (clean up mistakes/tests). Hard delete and irreversible:
    // restores stock and reverses points like a cancel (for real user orders),
    // clears rows that reference the order, then removes it. order_items go via
    // ON DELETE CASCADE; points_transactions are left as an audit trail.
    router.delete('/orders/:id', asyncHandler(async (req, res) => {
        const orderId = parseInt(req.params.id, 10);
        if (isNaN(orderId)) {
            throw AppError.badRequest('Invalid order ID');
        }

        const existingResult = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        const existing = existingResult.rows[0];
        if (!existing) {
            throw AppError.notFound('Order not found');
        }

        await db.transaction(async (client) => {
            const alreadyCancelled = existing.status === 'cancelled';

            // Restore stock unless it was already restored by a prior cancel.
            if (!alreadyCancelled) {
                const itemsResult = await client.query(
                    'SELECT product_id, quantity FROM order_items WHERE order_id = $1', [orderId]
                );
                for (const item of itemsResult.rows) {
                    await client.query(
                        'UPDATE products SET stock = stock + $1 WHERE id = $2',
                        [item.quantity, item.product_id]
                    );
                }
            }

            // Reverse points for a real (logged-in) order not already cancelled.
            if (!alreadyCancelled && existing.user_id) {
                if (existing.points_redeemed > 0) {
                    await client.query(
                        'UPDATE users SET points_balance = points_balance + $1 WHERE id = $2',
                        [existing.points_redeemed, existing.user_id]
                    );
                }
                if ((existing.status === 'delivered' || existing.status === 'complete') && existing.points_earned > 0) {
                    await client.query(
                        'UPDATE users SET points_balance = GREATEST(0, points_balance - $1) WHERE id = $2',
                        [existing.points_earned, existing.user_id]
                    );
                }
            }

            // Clear / unlink rows that reference this order (no cascade on these).
            await client.query('UPDATE reviews SET order_id = NULL WHERE order_id = $1', [orderId]);
            await client.query('DELETE FROM review_requests WHERE order_id = $1', [orderId]);
            await client.query('DELETE FROM commissions WHERE order_id = $1', [orderId]);
            await client.query('UPDATE customer_referrals SET first_order_id = NULL WHERE first_order_id = $1', [orderId]);

            await client.query('DELETE FROM orders WHERE id = $1', [orderId]);
        });

        logger.info('Order deleted', { orderId });
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

        // A review from a tracked request is referenced by review_requests.review_id.
        // Unlink it first so the delete doesn't hit that foreign key.
        await db.query('UPDATE review_requests SET review_id = NULL WHERE review_id = $1', [reviewId]);
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
