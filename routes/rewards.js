/**
 * Rewards Routes
 * Handles points and referral functionality
 */

const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
    redeemPointsRules,
    withdrawPointsRules,
    updatePointsSettingsRules,
    processWithdrawalRules
} = require('../validators/rewards');
const { generateReferralCode } = require('../utils/referralCode');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

module.exports = (db) => {
    // Helper to get points settings
    async function getPointsSettings() {
        const result = await db.query('SELECT setting_key, setting_value FROM points_settings');
        const settings = {};
        for (const row of result.rows) {
            settings[row.setting_key] = row.setting_value;
        }
        return settings;
    }

    // ============ CUSTOMER ROUTES ============

    // Get points balance
    router.get('/balance', requireAuth, asyncHandler(async (req, res) => {
        const userId = req.session.userId;

        const userResult = await db.query(
            'SELECT points_balance FROM users WHERE id = $1',
            [userId]
        );

        const settings = await getPointsSettings();
        const pointsToKes = parseInt(settings.points_to_kes_rate) || 10;
        const pointsBalance = parseInt(userResult.rows[0].points_balance) || 0;

        res.json({
            success: true,
            pointsBalance,
            kesValue: pointsBalance / pointsToKes,
            pointsToKesRate: pointsToKes
        });
    }));

    // Get points history
    router.get('/history', requireAuth, asyncHandler(async (req, res) => {
        const userId = req.session.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const result = await db.query(`
            SELECT * FROM points_transactions
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [userId, limit, offset]);

        const countResult = await db.query(
            'SELECT COUNT(*) as total FROM points_transactions WHERE user_id = $1',
            [userId]
        );

        res.json({
            success: true,
            transactions: result.rows,
            pagination: {
                page,
                limit,
                total: parseInt(countResult.rows[0].total),
                totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
            }
        });
    }));

    // Get or generate referral code
    router.get('/referral-code', requireAuth, asyncHandler(async (req, res) => {
        const userId = req.session.userId;

        let result = await db.query(
            'SELECT referral_code FROM users WHERE id = $1',
            [userId]
        );

        let referralCode = result.rows[0].referral_code;

        // Generate if doesn't exist
        if (!referralCode) {
            referralCode = generateReferralCode(userId);
            await db.query(
                'UPDATE users SET referral_code = $1 WHERE id = $2',
                [referralCode, userId]
            );
        }

        res.json({
            success: true,
            referralCode
        });
    }));

    // Get list of referred users
    router.get('/referrals', requireAuth, asyncHandler(async (req, res) => {
        const userId = req.session.userId;

        const result = await db.query(`
            SELECT cr.*, u.name, u.created_at as user_joined
            FROM customer_referrals cr
            JOIN users u ON cr.referred_id = u.id
            WHERE cr.referrer_id = $1
            ORDER BY cr.created_at DESC
        `, [userId]);

        // Get bonus info
        const settings = await getPointsSettings();
        const referralBonus = parseInt(settings.referral_bonus) || 500;

        res.json({
            success: true,
            referrals: result.rows,
            referralBonus,
            totalReferred: result.rows.length,
            bonusesAwarded: result.rows.filter(r => r.bonus_awarded).length
        });
    }));

    // Request points withdrawal
    router.post('/withdraw', requireAuth, withdrawPointsRules, asyncHandler(async (req, res) => {
        const userId = req.session.userId;
        const { points, paymentMethod, paymentDetails } = req.body;

        // Get user's points balance
        const userResult = await db.query(
            'SELECT points_balance FROM users WHERE id = $1',
            [userId]
        );
        const currentBalance = parseInt(userResult.rows[0].points_balance) || 0;

        if (points > currentBalance) {
            throw AppError.badRequest('Insufficient points balance');
        }

        // Get settings
        const settings = await getPointsSettings();
        const minRedeemPoints = parseInt(settings.min_redeem_points) || 1000;
        const pointsToKes = parseInt(settings.points_to_kes_rate) || 10;
        const minWithdrawal = parseInt(settings.min_points_withdrawal) || 5000;

        if (points < minRedeemPoints) {
            throw AppError.badRequest(`Minimum ${minRedeemPoints.toLocaleString()} points required for withdrawal`);
        }

        const kesAmount = points / pointsToKes;

        if (kesAmount < minWithdrawal) {
            throw AppError.badRequest(`Minimum withdrawal amount is KES ${minWithdrawal.toLocaleString()}`);
        }

        // Check for pending withdrawal
        const pendingResult = await db.query(`
            SELECT id FROM points_withdrawals
            WHERE user_id = $1 AND status = 'pending'
        `, [userId]);

        if (pendingResult.rows.length > 0) {
            throw AppError.conflict('You already have a pending withdrawal request');
        }

        await db.transaction(async (client) => {
            // Create withdrawal request
            await client.query(`
                INSERT INTO points_withdrawals (user_id, points, kes_amount, payment_method, payment_details)
                VALUES ($1, $2, $3, $4, $5)
            `, [userId, points, kesAmount, paymentMethod, paymentDetails]);

            // Deduct points immediately (held until processed)
            await client.query(`
                UPDATE users SET points_balance = points_balance - $1 WHERE id = $2
            `, [points, userId]);

            // Log transaction
            const balanceResult = await client.query(
                'SELECT points_balance FROM users WHERE id = $1',
                [userId]
            );
            await client.query(`
                INSERT INTO points_transactions (user_id, points, type, description, balance_after)
                VALUES ($1, $2, 'withdrawal', 'Points withdrawal request', $3)
            `, [userId, -points, balanceResult.rows[0].points_balance]);
        });

        logger.info('Points withdrawal requested', { userId, points, kesAmount });

        res.json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            kesAmount
        });
    }));

    // Get withdrawal history
    router.get('/withdrawals', requireAuth, asyncHandler(async (req, res) => {
        const userId = req.session.userId;

        const result = await db.query(`
            SELECT * FROM points_withdrawals
            WHERE user_id = $1
            ORDER BY created_at DESC
        `, [userId]);

        res.json({
            success: true,
            withdrawals: result.rows
        });
    }));

    // Validate referral code (public - for registration)
    router.get('/validate-referral/:code', asyncHandler(async (req, res) => {
        const code = req.params.code.toUpperCase();

        const result = await db.query(`
            SELECT id, name FROM users
            WHERE UPPER(referral_code) = $1
        `, [code]);

        if (result.rows.length === 0) {
            return res.json({ valid: false, message: 'Invalid referral code' });
        }

        res.json({
            valid: true,
            referrerName: result.rows[0].name
        });
    }));

    // ============ ADMIN ROUTES ============

    // Get points settings (admin)
    router.get('/admin/settings', requireAdmin, asyncHandler(async (req, res) => {
        const settings = await getPointsSettings();
        res.json({ success: true, settings });
    }));

    // Update points settings (admin)
    router.put('/admin/settings', requireAdmin, updatePointsSettingsRules, asyncHandler(async (req, res) => {
        const allowedSettings = [
            'points_per_kes',
            'referral_bonus',
            'points_to_kes_rate',
            'min_redeem_points',
            'min_marketer_payout',
            'min_points_withdrawal',
            'points_enabled',
            'referrals_enabled'
        ];

        for (const [key, value] of Object.entries(req.body)) {
            if (allowedSettings.includes(key)) {
                await db.query(`
                    INSERT INTO points_settings (setting_key, setting_value, updated_at)
                    VALUES ($1, $2, NOW())
                    ON CONFLICT (setting_key)
                    DO UPDATE SET setting_value = $2, updated_at = NOW()
                `, [key, value.toString()]);
            }
        }

        logger.info('Points settings updated', { adminId: req.session.userId });

        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    }));

    // Get all withdrawal requests (admin)
    router.get('/admin/withdrawals', requireAdmin, asyncHandler(async (req, res) => {
        const status = req.query.status;

        let query = `
            SELECT pw.*, u.name, u.email, u.phone
            FROM points_withdrawals pw
            JOIN users u ON pw.user_id = u.id
        `;
        const params = [];

        if (status) {
            query += ` WHERE pw.status = $1`;
            params.push(status);
        }

        query += ` ORDER BY pw.created_at DESC`;

        const result = await db.query(query, params);

        res.json({
            success: true,
            withdrawals: result.rows
        });
    }));

    // Process withdrawal (admin)
    router.put('/admin/withdrawals/:id', requireAdmin, processWithdrawalRules, asyncHandler(async (req, res) => {
        const withdrawalId = parseInt(req.params.id, 10);
        const { status, notes } = req.body;
        const adminId = req.session.userId;

        // Get withdrawal details
        const withdrawalResult = await db.query(
            'SELECT * FROM points_withdrawals WHERE id = $1',
            [withdrawalId]
        );

        if (withdrawalResult.rows.length === 0) {
            throw AppError.notFound('Withdrawal request not found');
        }

        const withdrawal = withdrawalResult.rows[0];

        if (withdrawal.status !== 'pending') {
            throw AppError.conflict('This withdrawal has already been processed');
        }

        await db.transaction(async (client) => {
            // Update withdrawal status
            await client.query(`
                UPDATE points_withdrawals
                SET status = $1, notes = $2, processed_at = NOW(), processed_by = $3
                WHERE id = $4
            `, [status, notes, adminId, withdrawalId]);

            if (status === 'rejected') {
                // Refund points
                await client.query(`
                    UPDATE users SET points_balance = points_balance + $1 WHERE id = $2
                `, [withdrawal.points, withdrawal.user_id]);

                // Log refund transaction
                const balanceResult = await client.query(
                    'SELECT points_balance FROM users WHERE id = $1',
                    [withdrawal.user_id]
                );
                await client.query(`
                    INSERT INTO points_transactions (user_id, points, type, description, balance_after)
                    VALUES ($1, $2, 'refund', 'Withdrawal request rejected - points refunded', $3)
                `, [withdrawal.user_id, withdrawal.points, balanceResult.rows[0].points_balance]);
            }
        });

        logger.info('Withdrawal processed', { withdrawalId, status, adminId });

        res.json({
            success: true,
            message: `Withdrawal ${status === 'approved' ? 'approved' : 'rejected'} successfully`
        });
    }));

    // Get rewards statistics (admin)
    router.get('/admin/stats', requireAdmin, asyncHandler(async (req, res) => {
        // Total points in circulation
        const totalPointsResult = await db.query(
            'SELECT COALESCE(SUM(points_balance), 0) as total FROM users'
        );

        // Total referrals
        const referralsResult = await db.query(
            'SELECT COUNT(*) as total, SUM(CASE WHEN bonus_awarded THEN 1 ELSE 0 END) as bonuses FROM customer_referrals'
        );

        // Pending withdrawals
        const pendingWithdrawalsResult = await db.query(`
            SELECT COUNT(*) as count, COALESCE(SUM(kes_amount), 0) as total
            FROM points_withdrawals WHERE status = 'pending'
        `);

        // Points transactions summary (last 30 days)
        const transactionsResult = await db.query(`
            SELECT type, SUM(ABS(points)) as total
            FROM points_transactions
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY type
        `);

        res.json({
            success: true,
            stats: {
                totalPointsInCirculation: parseInt(totalPointsResult.rows[0].total),
                totalReferrals: parseInt(referralsResult.rows[0].total),
                bonusesAwarded: parseInt(referralsResult.rows[0].bonuses),
                pendingWithdrawals: {
                    count: parseInt(pendingWithdrawalsResult.rows[0].count),
                    totalKes: parseFloat(pendingWithdrawalsResult.rows[0].total)
                },
                transactionsByType: transactionsResult.rows
            }
        });
    }));

    return router;
};
