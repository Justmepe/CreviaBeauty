/**
 * Order Routes
 */

const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { createOrderRules } = require('../validators/order');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// Discord webhook for new-order notifications.
// Set DISCORD_WEBHOOK_URL in .env to enable. If unset, notifications are skipped silently —
// so dev/test/CI runs don't need it.
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Send Discord notification for new orders
async function sendDiscordOrderNotification(orderData) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        const paymentMethodLabels = {
            'cod': 'Cash on Delivery',
            'mpesa': 'M-Pesa',
            'bank': 'Bank Transfer'
        };

        const embed = {
            title: '🛒 New Order Received!',
            color: 0x4CAF50, // Green color
            fields: [
                {
                    name: '📦 Order ID',
                    value: `#${orderData.orderId}`,
                    inline: true
                },
                {
                    name: '💰 Total Amount',
                    value: `KSh ${Number(orderData.total).toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🏷️ Payment Reference',
                    value: orderData.paymentReference,
                    inline: true
                },
                {
                    name: '👤 Customer Name',
                    value: orderData.customerName || 'N/A',
                    inline: true
                },
                {
                    name: '📧 Email',
                    value: orderData.customerEmail || 'N/A',
                    inline: true
                },
                {
                    name: '📱 Phone',
                    value: orderData.phone || 'N/A',
                    inline: true
                },
                {
                    name: '💳 Payment Method',
                    value: paymentMethodLabels[orderData.paymentMethod] || orderData.paymentMethod,
                    inline: true
                },
                {
                    name: '📍 Shipping Address',
                    value: orderData.shippingAddress || 'N/A',
                    inline: false
                },
                {
                    name: '🛍️ Items',
                    value: orderData.items.map(item => `• ${item.name} x${item.quantity} - KSh ${(parseFloat(item.price) * item.quantity).toLocaleString()}`).join('\n'),
                    inline: false
                }
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: 'CreviaBeauty Order System'
            }
        };

        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                embeds: [embed]
            })
        });

        if (!response.ok) {
            logger.error('Discord webhook failed', { status: response.status });
        } else {
            logger.info('Discord notification sent', { orderId: orderData.orderId });
        }
    } catch (error) {
        // Don't throw - just log the error so order creation still succeeds
        logger.error('Failed to send Discord notification', { error: error.message });
    }
}

// Generate unique payment reference
function generatePaymentReference() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `CRV-${timestamp}-${random}`;
}

module.exports = (db) => {
    // Get payment settings (public - for checkout page)
    router.get('/payment-settings', asyncHandler(async (req, res) => {
        const result = await db.query('SELECT setting_key, setting_value FROM payment_settings');

        // Convert to object
        const settings = {};
        for (const row of result.rows) {
            settings[row.setting_key] = row.setting_value;
        }

        res.json(settings);
    }));

    // Helper: Get points settings
    async function getPointsSettings(client) {
        const result = await client.query('SELECT setting_key, setting_value FROM points_settings');
        const settings = {};
        for (const row of result.rows) {
            settings[row.setting_key] = row.setting_value;
        }
        return settings;
    }

    // Create order with transaction
    router.post('/', requireAuth, createOrderRules, asyncHandler(async (req, res) => {
        const { shippingAddress, phone, paymentMethod = 'cod', marketerCode, redeemPoints } = req.body;
        const userId = req.session.userId;

        // Validate payment method
        const validPaymentMethods = ['cod', 'mpesa', 'bank'];
        if (!validPaymentMethods.includes(paymentMethod)) {
            throw AppError.badRequest('Invalid payment method');
        }

        // Get customer details for notification
        const customerResult = await db.query('SELECT name, email, referred_by, points_balance FROM users WHERE id = $1', [userId]);
        const customer = customerResult.rows[0] || {};

        const result = await db.transaction(async (client) => {
            // Get points settings
            const pointsSettings = await getPointsSettings(client);
            const pointsPerKes = parseInt(pointsSettings.points_per_kes) || 100;
            const pointsToKesRate = parseInt(pointsSettings.points_to_kes_rate) || 10;
            const minRedeemPoints = parseInt(pointsSettings.min_redeem_points) || 1000;
            const referralBonus = parseInt(pointsSettings.referral_bonus) || 500;
            const pointsEnabled = pointsSettings.points_enabled === 'true';
            const referralsEnabled = pointsSettings.referrals_enabled === 'true';

            // Get cart items (including cost_price for commission calculation)
            const cartResult = await client.query(`
                SELECT c.quantity, p.id as product_id, p.price, p.stock, p.name, COALESCE(p.cost_price, 0) as cost_price
                FROM cart c
                JOIN products p ON c.product_id = p.id
                WHERE c.user_id = $1
            `, [userId]);

            const cartItems = cartResult.rows;

            if (cartItems.length === 0) {
                throw AppError.badRequest('Cart is empty');
            }

            // Verify stock availability
            for (const item of cartItems) {
                if (item.stock > 0 && item.quantity > item.stock) {
                    throw AppError.badRequest(`Not enough stock for ${item.name}. Only ${item.stock} available.`);
                }
            }

            let total = cartItems.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);
            let discountFromPoints = 0;
            let pointsRedeemed = 0;

            // Handle points redemption
            if (redeemPoints && redeemPoints > 0 && pointsEnabled) {
                const userPointsBalance = customer.points_balance || 0;

                if (redeemPoints < minRedeemPoints) {
                    throw AppError.badRequest(`Minimum ${minRedeemPoints} points required to redeem`);
                }

                if (redeemPoints > userPointsBalance) {
                    throw AppError.badRequest('Insufficient points balance');
                }

                discountFromPoints = redeemPoints / pointsToKesRate;
                if (discountFromPoints > total) {
                    discountFromPoints = total;
                    pointsRedeemed = Math.floor(total * pointsToKesRate);
                } else {
                    pointsRedeemed = redeemPoints;
                }

                total = total - discountFromPoints;

                // Deduct points from user
                await client.query(`
                    UPDATE users SET points_balance = points_balance - $1 WHERE id = $2
                `, [pointsRedeemed, userId]);

                // Log points transaction
                const newBalanceResult = await client.query('SELECT points_balance FROM users WHERE id = $1', [userId]);
                await client.query(`
                    INSERT INTO points_transactions (user_id, points, type, description, balance_after)
                    VALUES ($1, $2, 'redeemed', 'Points redeemed at checkout', $3)
                `, [userId, -pointsRedeemed, newBalanceResult.rows[0].points_balance]);
            }

            // Validate marketer code
            let marketerId = null;
            let marketerProfile = null;
            if (marketerCode) {
                const marketerResult = await client.query(`
                    SELECT u.id, mp.status, mp.commission_rate
                    FROM users u
                    JOIN marketer_profiles mp ON u.id = mp.user_id
                    WHERE UPPER(u.referral_code) = $1 AND mp.status = 'approved'
                `, [marketerCode.toUpperCase()]);

                if (marketerResult.rows.length > 0) {
                    const marketer = marketerResult.rows[0];
                    // Prevent self-referral
                    if (marketer.id !== userId) {
                        marketerId = marketer.id;
                        marketerProfile = marketer;
                    }
                }
            }

            // Calculate points to be earned (will be awarded on delivery)
            const pointsToEarn = pointsEnabled ? Math.floor(total / pointsPerKes) : 0;

            // Generate unique payment reference
            const paymentReference = generatePaymentReference();

            // Create order with payment details and marketer/points info
            const orderResult = await client.query(`
                INSERT INTO orders (user_id, total, shipping_address, phone, payment_method, payment_status, payment_reference, marketer_id, marketer_code, points_earned, points_redeemed, discount_from_points)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING id
            `, [userId, total, shippingAddress, phone, paymentMethod, 'pending', paymentReference, marketerId, marketerCode || null, pointsToEarn, pointsRedeemed, discountFromPoints]);

            const orderId = orderResult.rows[0].id;

            // Add order items and update stock
            for (const item of cartItems) {
                await client.query(`
                    INSERT INTO order_items (order_id, product_id, quantity, price)
                    VALUES ($1, $2, $3, $4)
                `, [orderId, item.product_id, item.quantity, item.price]);

                if (item.stock > 0) {
                    await client.query(`
                        UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1
                    `, [item.quantity, item.product_id]);
                }
            }

            // Create commission record if marketer attributed (based on PROFIT MARGIN)
            if (marketerId && marketerProfile) {
                const commissionRate = parseFloat(marketerProfile.commission_rate);

                // Calculate total profit from all items
                let totalProfit = 0;
                for (const item of cartItems) {
                    const itemPrice = parseFloat(item.price);
                    const itemCost = parseFloat(item.cost_price) || 0;
                    const itemProfit = (itemPrice - itemCost) * item.quantity;
                    totalProfit += Math.max(0, itemProfit); // Ensure no negative profit
                }

                // Commission is based on profit, not total sale
                const commissionAmount = (totalProfit * commissionRate) / 100;

                await client.query(`
                    INSERT INTO commissions (marketer_id, order_id, order_total, commission_rate, commission_amount, status)
                    VALUES ($1, $2, $3, $4, $5, 'pending')
                `, [marketerId, orderId, total, commissionRate, commissionAmount]);

                logger.info('Commission created (profit-based)', { marketerId, orderId, totalProfit, commissionAmount });
            }

            // Clear cart
            await client.query('DELETE FROM cart WHERE user_id = $1', [userId]);

            return {
                orderId,
                total,
                itemCount: cartItems.length,
                paymentReference,
                paymentMethod,
                items: cartItems,
                pointsEarned: pointsToEarn,
                pointsRedeemed,
                discountFromPoints
            };
        });

        logger.info('Order created', {
            orderId: result.orderId,
            userId,
            total: result.total,
            items: result.itemCount,
            paymentMethod: result.paymentMethod,
            paymentReference: result.paymentReference,
            marketerCode: marketerCode || null,
            pointsRedeemed: result.pointsRedeemed,
            pointsEarned: result.pointsEarned
        });

        // Send Discord notification (async, don't await to not block response)
        sendDiscordOrderNotification({
            orderId: result.orderId,
            total: result.total,
            paymentReference: result.paymentReference,
            paymentMethod: result.paymentMethod,
            phone,
            shippingAddress,
            items: result.items,
            customerName: customer.name,
            customerEmail: customer.email
        });

        res.json({
            success: true,
            orderId: result.orderId,
            paymentReference: result.paymentReference,
            paymentMethod: result.paymentMethod,
            total: result.total,
            pointsEarned: result.pointsEarned,
            pointsRedeemed: result.pointsRedeemed,
            discountFromPoints: result.discountFromPoints
        });
    }));

    // Get user orders (basic)
    router.get('/', requireAuth, asyncHandler(async (req, res) => {
        const userId = req.session.userId;

        const result = await db.query(`
            SELECT o.*,
                   (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
            FROM orders o
            WHERE o.user_id = $1
            ORDER BY o.created_at DESC
        `, [userId]);

        res.json(result.rows);
    }));

    // Get user orders with items (for my-orders page)
    router.get('/my-orders', requireAuth, asyncHandler(async (req, res) => {
        const userId = req.session.userId;

        const ordersResult = await db.query(`
            SELECT o.id, o.total as total_amount, o.status, o.shipping_address, o.phone,
                   o.payment_method, o.payment_status, o.payment_reference, o.created_at
            FROM orders o
            WHERE o.user_id = $1
            ORDER BY o.created_at DESC
        `, [userId]);

        const orders = ordersResult.rows;

        // Get items for each order
        for (const order of orders) {
            const itemsResult = await db.query(`
                SELECT oi.quantity, oi.price, p.name, p.image_url
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = $1
            `, [order.id]);
            order.items = itemsResult.rows;
        }

        res.json({ orders });
    }));

    // Get order details
    router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
        const orderId = parseInt(req.params.id, 10);
        const userId = req.session.userId;

        if (isNaN(orderId)) {
            throw AppError.badRequest('Invalid order ID');
        }

        const orderResult = await db.query(`
            SELECT * FROM orders WHERE id = $1 AND user_id = $2
        `, [orderId, userId]);

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

    return router;
};
