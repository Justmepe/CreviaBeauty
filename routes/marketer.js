/**
 * Marketer Routes
 * Handles affiliate/marketer functionality
 */

const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, requireAdmin, requireMarketer } = require('../middleware/auth');
const {
    applyMarketerRules,
    payoutRequestRules,
    updateCommissionRules,
    updateMarketerStatusRules,
    processPayoutRules
} = require('../validators/marketer');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// Generate unique marketer code
function generateMarketerCode(userId) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'MKT';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code + userId.toString().padStart(3, '0');
}

module.exports = (db) => {
    // ============ MARKETER ROUTES ============

    // Apply to become a marketer
    router.post('/apply', requireAuth, applyMarketerRules, asyncHandler(async (req, res) => {
        const userId = req.session.userId;
        const { paymentMethod, paymentDetails } = req.body;

        // Check if user already has a marketer profile
        const existingProfile = await db.query(
            'SELECT id, status FROM marketer_profiles WHERE user_id = $1',
            [userId]
        );

        if (existingProfile.rows.length > 0) {
            const status = existingProfile.rows[0].status;
            if (status === 'approved') {
                throw AppError.conflict('You are already an approved marketer');
            } else if (status === 'pending') {
                throw AppError.conflict('Your marketer application is pending approval');
            } else {
                throw AppError.conflict('Your marketer account is suspended. Please contact support.');
            }
        }

        // Generate unique referral code for the user if they don't have one
        let referralCode = null;
        const userResult = await db.query('SELECT referral_code FROM users WHERE id = $1', [userId]);
        if (!userResult.rows[0].referral_code) {
            referralCode = generateMarketerCode(userId);
            await db.query('UPDATE users SET referral_code = $1 WHERE id = $2', [referralCode, userId]);
        } else {
            referralCode = userResult.rows[0].referral_code;
        }

        // Create marketer profile
        await db.query(`
            INSERT INTO marketer_profiles (user_id, status)
            VALUES ($1, 'pending')
        `, [userId]);

        logger.info('Marketer application submitted', { userId });

        res.json({
            success: true,
            message: 'Your application has been submitted and is pending approval',
            referralCode
        });
    }));

    // Get marketer dashboard stats
    router.get('/dashboard', requireAuth, requireMarketer(db), asyncHandler(async (req, res) => {
        const userId = req.session.userId;

        // Get marketer profile
        const profileResult = await db.query(`
            SELECT mp.*, u.referral_code
            FROM marketer_profiles mp
            JOIN users u ON mp.user_id = u.id
            WHERE mp.user_id = $1
        `, [userId]);

        const profile = profileResult.rows[0];

        // Get commission tier info
        const tierResult = await db.query(`
            SELECT * FROM commission_tiers WHERE tier_name = $1
        `, [profile.tier]);

        const tier = tierResult.rows[0];

        // Get next tier info
        const nextTierResult = await db.query(`
            SELECT * FROM commission_tiers
            WHERE min_sales > $1
            ORDER BY min_sales ASC LIMIT 1
        `, [profile.total_sales]);

        const nextTier = nextTierResult.rows[0];

        // Get recent sales count (last 30 days)
        const recentSalesResult = await db.query(`
            SELECT COUNT(*) as count, COALESCE(SUM(order_total), 0) as total
            FROM commissions
            WHERE marketer_id = $1 AND created_at > NOW() - INTERVAL '30 days'
        `, [userId]);

        const recentSales = recentSalesResult.rows[0];

        res.json({
            success: true,
            profile: {
                status: profile.status,
                tier: profile.tier,
                commissionRate: parseFloat(profile.commission_rate),
                referralCode: profile.referral_code,
                totalSales: parseFloat(profile.total_sales),
                totalCommission: parseFloat(profile.total_commission),
                pendingCommission: parseFloat(profile.pending_commission),
                withdrawnCommission: parseFloat(profile.withdrawn_commission),
                availableBalance: parseFloat(profile.total_commission) - parseFloat(profile.pending_commission) - parseFloat(profile.withdrawn_commission),
                createdAt: profile.created_at,
                approvedAt: profile.approved_at
            },
            currentTier: tier,
            nextTier: nextTier || null,
            recentStats: {
                salesCount: parseInt(recentSales.count),
                salesTotal: parseFloat(recentSales.total)
            }
        });
    }));

    // Get marketer sales
    router.get('/sales', requireAuth, requireMarketer(db), asyncHandler(async (req, res) => {
        const userId = req.session.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // Get sales with order details
        const salesResult = await db.query(`
            SELECT c.*, o.status as order_status, o.created_at as order_date,
                   u.name as customer_name
            FROM commissions c
            JOIN orders o ON c.order_id = o.id
            LEFT JOIN users u ON o.user_id = u.id
            WHERE c.marketer_id = $1
            ORDER BY c.created_at DESC
            LIMIT $2 OFFSET $3
        `, [userId, limit, offset]);

        // Get total count
        const countResult = await db.query(`
            SELECT COUNT(*) as total FROM commissions WHERE marketer_id = $1
        `, [userId]);

        res.json({
            success: true,
            sales: salesResult.rows,
            pagination: {
                page,
                limit,
                total: parseInt(countResult.rows[0].total),
                totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
            }
        });
    }));

    // Get commission history
    router.get('/commissions', requireAuth, requireMarketer(db), asyncHandler(async (req, res) => {
        const userId = req.session.userId;
        const status = req.query.status; // pending, approved, cancelled

        let query = `
            SELECT c.*, o.id as order_id, o.created_at as order_date
            FROM commissions c
            JOIN orders o ON c.order_id = o.id
            WHERE c.marketer_id = $1
        `;
        const params = [userId];

        if (status) {
            query += ` AND c.status = $2`;
            params.push(status);
        }

        query += ` ORDER BY c.created_at DESC`;

        const result = await db.query(query, params);

        res.json({
            success: true,
            commissions: result.rows
        });
    }));

    // Request payout
    router.post('/payout', requireAuth, requireMarketer(db), payoutRequestRules, asyncHandler(async (req, res) => {
        const userId = req.session.userId;
        const { amount, paymentMethod, paymentDetails } = req.body;

        // Get marketer profile
        const profileResult = await db.query(`
            SELECT * FROM marketer_profiles WHERE user_id = $1
        `, [userId]);

        const profile = profileResult.rows[0];

        // Calculate available balance
        const availableBalance = parseFloat(profile.total_commission) -
                                 parseFloat(profile.pending_commission) -
                                 parseFloat(profile.withdrawn_commission);

        // Get minimum payout setting
        const minPayoutResult = await db.query(`
            SELECT setting_value FROM points_settings WHERE setting_key = 'min_marketer_payout'
        `);
        const minPayout = parseFloat(minPayoutResult.rows[0]?.setting_value || 5000);

        if (amount < minPayout) {
            throw AppError.badRequest(`Minimum payout amount is KES ${minPayout.toLocaleString()}`);
        }

        if (amount > availableBalance) {
            throw AppError.badRequest(`Insufficient balance. Your available balance is KES ${availableBalance.toLocaleString()}`);
        }

        // Check for pending payout requests
        const pendingPayoutResult = await db.query(`
            SELECT id FROM marketer_payouts
            WHERE marketer_id = $1 AND status = 'pending'
        `, [userId]);

        if (pendingPayoutResult.rows.length > 0) {
            throw AppError.conflict('You already have a pending payout request');
        }

        // Create payout request
        const payoutResult = await db.query(`
            INSERT INTO marketer_payouts (marketer_id, amount, payment_method, payment_details)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [userId, amount, paymentMethod, paymentDetails]);

        // Update pending commission in marketer profile
        await db.query(`
            UPDATE marketer_profiles
            SET pending_commission = pending_commission + $1
            WHERE user_id = $2
        `, [amount, userId]);

        logger.info('Marketer payout requested', { userId, amount, payoutId: payoutResult.rows[0].id });

        res.json({
            success: true,
            message: 'Payout request submitted successfully',
            payoutId: payoutResult.rows[0].id
        });
    }));

    // Get payout history
    router.get('/payouts', requireAuth, requireMarketer(db), asyncHandler(async (req, res) => {
        const userId = req.session.userId;

        const result = await db.query(`
            SELECT * FROM marketer_payouts
            WHERE marketer_id = $1
            ORDER BY created_at DESC
        `, [userId]);

        res.json({
            success: true,
            payouts: result.rows
        });
    }));

    // ============ ADMIN ROUTES ============

    // Get all marketers (admin)
    router.get('/admin/list', requireAdmin, asyncHandler(async (req, res) => {
        const status = req.query.status; // pending, approved, suspended

        let query = `
            SELECT mp.*, u.name, u.email, u.phone, u.referral_code
            FROM marketer_profiles mp
            JOIN users u ON mp.user_id = u.id
        `;
        const params = [];

        if (status) {
            query += ` WHERE mp.status = $1`;
            params.push(status);
        }

        query += ` ORDER BY mp.created_at DESC`;

        const result = await db.query(query, params);

        res.json({
            success: true,
            marketers: result.rows
        });
    }));

    // Get marketer details (admin)
    router.get('/admin/:id', requireAdmin, asyncHandler(async (req, res) => {
        const marketerId = parseInt(req.params.id, 10);

        const profileResult = await db.query(`
            SELECT mp.*, u.name, u.email, u.phone, u.referral_code
            FROM marketer_profiles mp
            JOIN users u ON mp.user_id = u.id
            WHERE mp.user_id = $1
        `, [marketerId]);

        if (profileResult.rows.length === 0) {
            throw AppError.notFound('Marketer not found');
        }

        // Get recent sales
        const salesResult = await db.query(`
            SELECT c.*, o.id as order_id, o.status as order_status
            FROM commissions c
            JOIN orders o ON c.order_id = o.id
            WHERE c.marketer_id = $1
            ORDER BY c.created_at DESC
            LIMIT 10
        `, [marketerId]);

        res.json({
            success: true,
            marketer: profileResult.rows[0],
            recentSales: salesResult.rows
        });
    }));

    // Approve/Suspend marketer (admin)
    router.put('/admin/:id/status', requireAdmin, updateMarketerStatusRules, asyncHandler(async (req, res) => {
        const marketerId = parseInt(req.params.id, 10);
        const { status } = req.body;

        const profileResult = await db.query(`
            SELECT * FROM marketer_profiles WHERE user_id = $1
        `, [marketerId]);

        if (profileResult.rows.length === 0) {
            throw AppError.notFound('Marketer not found');
        }

        const currentProfile = profileResult.rows[0];

        // Update status
        const updates = ['status = $1'];
        const params = [status, marketerId];

        // Set approved_at if approving
        if (status === 'approved' && currentProfile.status !== 'approved') {
            updates.push('approved_at = NOW()');

            // Also update user role
            await db.query(`UPDATE users SET role = 'marketer' WHERE id = $1`, [marketerId]);
        }

        await db.query(`
            UPDATE marketer_profiles
            SET ${updates.join(', ')}
            WHERE user_id = $2
        `, params);

        logger.info('Marketer status updated', { marketerId, status, adminId: req.session.userId });

        res.json({
            success: true,
            message: `Marketer ${status === 'approved' ? 'approved' : status === 'suspended' ? 'suspended' : 'updated'} successfully`
        });
    }));

    // Update marketer commission rate (admin)
    router.put('/admin/:id/commission', requireAdmin, updateCommissionRules, asyncHandler(async (req, res) => {
        const marketerId = parseInt(req.params.id, 10);
        const { commissionRate } = req.body;

        const result = await db.query(`
            UPDATE marketer_profiles
            SET commission_rate = $1
            WHERE user_id = $2
            RETURNING *
        `, [commissionRate, marketerId]);

        if (result.rowCount === 0) {
            throw AppError.notFound('Marketer not found');
        }

        logger.info('Marketer commission rate updated', { marketerId, commissionRate, adminId: req.session.userId });

        res.json({
            success: true,
            message: 'Commission rate updated successfully'
        });
    }));

    // Get all payout requests (admin)
    router.get('/admin/payouts/list', requireAdmin, asyncHandler(async (req, res) => {
        const status = req.query.status; // pending, approved, rejected

        let query = `
            SELECT mp.*, u.name, u.email, u.phone
            FROM marketer_payouts mp
            JOIN users u ON mp.marketer_id = u.id
        `;
        const params = [];

        if (status) {
            query += ` WHERE mp.status = $1`;
            params.push(status);
        }

        query += ` ORDER BY mp.created_at DESC`;

        const result = await db.query(query, params);

        res.json({
            success: true,
            payouts: result.rows
        });
    }));

    // Process payout (admin)
    router.put('/admin/payouts/:id', requireAdmin, processPayoutRules, asyncHandler(async (req, res) => {
        const payoutId = parseInt(req.params.id, 10);
        const { status, notes } = req.body;
        const adminId = req.session.userId;

        // Get payout details
        const payoutResult = await db.query(`
            SELECT * FROM marketer_payouts WHERE id = $1
        `, [payoutId]);

        if (payoutResult.rows.length === 0) {
            throw AppError.notFound('Payout request not found');
        }

        const payout = payoutResult.rows[0];

        if (payout.status !== 'pending') {
            throw AppError.conflict('This payout has already been processed');
        }

        await db.transaction(async (client) => {
            // Update payout status
            await client.query(`
                UPDATE marketer_payouts
                SET status = $1, notes = $2, processed_at = NOW(), processed_by = $3
                WHERE id = $4
            `, [status, notes, adminId, payoutId]);

            if (status === 'approved') {
                // Move from pending to withdrawn
                await client.query(`
                    UPDATE marketer_profiles
                    SET pending_commission = pending_commission - $1,
                        withdrawn_commission = withdrawn_commission + $1
                    WHERE user_id = $2
                `, [payout.amount, payout.marketer_id]);
            } else {
                // Rejected - just remove from pending
                await client.query(`
                    UPDATE marketer_profiles
                    SET pending_commission = pending_commission - $1
                    WHERE user_id = $2
                `, [payout.amount, payout.marketer_id]);
            }
        });

        logger.info('Payout processed', { payoutId, status, adminId });

        res.json({
            success: true,
            message: `Payout ${status === 'approved' ? 'approved' : 'rejected'} successfully`
        });
    }));

    // Get products with commission amounts (marketer only)
    router.get('/products', requireAuth, requireMarketer(db), asyncHandler(async (req, res) => {
        const userId = req.session.userId;
        const { category, search, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        // Get marketer's commission rate
        const profileResult = await db.query(`
            SELECT commission_rate FROM marketer_profiles WHERE user_id = $1
        `, [userId]);

        const commissionRate = parseFloat(profileResult.rows[0].commission_rate);

        // Build query
        let query = `
            SELECT id, name, description, price, category, image_url, stock,
                   COALESCE(cost_price, 0) as cost_price
            FROM products WHERE 1=1
        `;
        let countQuery = 'SELECT COUNT(*) as total FROM products WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (category) {
            query += ` AND category = $${paramIndex}`;
            countQuery += ` AND category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }

        if (search) {
            query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex + 1})`;
            countQuery += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex + 1})`;
            params.push(`%${search}%`, `%${search}%`);
            paramIndex += 2;
        }

        // Get total count
        const totalResult = await db.query(countQuery, params);
        const total = parseInt(totalResult.rows[0].total);

        // Get paginated results
        query += ` ORDER BY name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        const productsResult = await db.query(query, [...params, limit, offset]);

        // Calculate commission for each product (without exposing cost_price)
        const products = productsResult.rows.map(product => {
            const price = parseFloat(product.price);
            const costPrice = parseFloat(product.cost_price);
            const profit = Math.max(0, price - costPrice);
            const commission = (profit * commissionRate) / 100;

            return {
                id: product.id,
                name: product.name,
                description: product.description,
                price: price,
                category: product.category,
                image_url: product.image_url,
                stock: product.stock,
                commission: commission // Commission amount the marketer would earn
            };
        });

        res.json({
            success: true,
            products,
            commissionRate,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    }));

    // ADMIN: Approve marketer application
    router.post('/admin/approve/:userId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
        const { userId } = req.params;

        // Update marketer status to approved
        const result = await db.query(
            'UPDATE marketer_profiles SET status = $1 WHERE user_id = $2 RETURNING *',
            ['approved', userId]
        );

        if (result.rows.length === 0) {
            throw AppError.notFound('Marketer profile not found');
        }

        logger.info('Marketer application approved', { userId, adminId: req.session.userId });

        res.json({
            success: true,
            message: 'Marketer application approved',
            profile: result.rows[0]
        });
    }));

    // ADMIN: Reject marketer application
    router.post('/admin/reject/:userId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { reason } = req.body;

        // Update marketer status to rejected
        const result = await db.query(
            'UPDATE marketer_profiles SET status = $1, rejection_reason = $2 WHERE user_id = $3 RETURNING *',
            ['rejected', reason || 'Application did not meet requirements', userId]
        );

        if (result.rows.length === 0) {
            throw AppError.notFound('Marketer profile not found');
        }

        logger.info('Marketer application rejected', { userId, adminId: req.session.userId, reason });

        res.json({
            success: true,
            message: 'Marketer application rejected'
        });
    }));

    // Validate marketer code (public - for checkout)
    router.get('/validate-code/:code', asyncHandler(async (req, res) => {
        const code = req.params.code.toUpperCase();

        const result = await db.query(`
            SELECT u.id, u.name, mp.status
            FROM users u
            JOIN marketer_profiles mp ON u.id = mp.user_id
            WHERE UPPER(u.referral_code) = $1
        `, [code]);

        if (result.rows.length === 0) {
            return res.json({ valid: false, message: 'Invalid marketer code' });
        }

        const marketer = result.rows[0];

        if (marketer.status !== 'approved') {
            return res.json({ valid: false, message: 'This marketer code is not active' });
        }

        res.json({
            valid: true,
            marketerName: marketer.name
        });
    }));

    return router;
};
