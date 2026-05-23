/**
 * Authentication Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { authLimiter } = require('../middleware/rateLimiter');
const { registerRules, loginRules } = require('../validators/auth');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// Generate unique referral code
function generateReferralCode(userId) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'REF';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code + userId.toString().padStart(3, '0');
}

module.exports = (db) => {
    // Register
    router.post('/register', authLimiter, registerRules, asyncHandler(async (req, res) => {
        const { name, email, phone, password, referralCode } = req.body;

        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            throw AppError.conflict('Email already registered');
        }

        // Validate referral code if provided
        let referrerId = null;
        if (referralCode) {
            const referrerResult = await db.query(
                'SELECT id FROM users WHERE UPPER(referral_code) = $1',
                [referralCode.toUpperCase()]
            );
            if (referrerResult.rows.length > 0) {
                referrerId = referrerResult.rows[0].id;
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await db.query(`
            INSERT INTO users (name, email, phone, password, referred_by)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [name, email, phone || null, hashedPassword, referrerId]);

        const userId = result.rows[0].id;

        // Generate and save referral code for the new user
        const newReferralCode = generateReferralCode(userId);
        await db.query('UPDATE users SET referral_code = $1 WHERE id = $2', [newReferralCode, userId]);

        // Create customer referral record if referred
        if (referrerId) {
            await db.query(`
                INSERT INTO customer_referrals (referrer_id, referred_id)
                VALUES ($1, $2)
            `, [referrerId, userId]);
            logger.info('Customer referred', { referrerId, referredId: userId });
        }

        // Migrate cart items from session to user
        if (req.sessionID) {
            await db.query(`
                UPDATE cart SET user_id = $1, session_id = NULL
                WHERE session_id = $2 AND user_id IS NULL
            `, [userId, req.sessionID]);
        }

        req.session.userId = userId;
        req.session.userName = name;
        req.session.isAdmin = false;

        logger.info('User registered', { userId, email });

        res.json({
            success: true,
            message: 'Registration successful',
            user: { name, email }
        });
    }));

    // Register Marketer
    router.post('/register-marketer', authLimiter, registerRules, asyncHandler(async (req, res) => {
        const { name, email, phone, password, paymentMethod, paymentDetails, userType } = req.body;

        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            throw AppError.conflict('Email already registered');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await db.query(`
            INSERT INTO users (name, email, phone, password, role)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [name, email, phone || null, hashedPassword, 'marketer']);

        const userId = result.rows[0].id;

        // Generate referral code for marketer
        const marketerCode = generateReferralCode(userId);
        await db.query('UPDATE users SET referral_code = $1 WHERE id = $2', [marketerCode, userId]);

        // Create marketer profile with pending status
        await db.query(`
            INSERT INTO marketer_profiles (user_id, status)
            VALUES ($1, 'pending')
        `, [userId]);

        // Migrate cart items from session to user
        if (req.sessionID) {
            await db.query(`
                UPDATE cart SET user_id = $1, session_id = NULL
                WHERE session_id = $2 AND user_id IS NULL
            `, [userId, req.sessionID]);
        }

        req.session.userId = userId;
        req.session.userName = name;
        req.session.isAdmin = false;
        req.session.isMarketer = false; // Not approved yet
        req.session.userRole = 'marketer';

        logger.info('Marketer registered', { userId, email });

        res.json({
            success: true,
            message: 'Marketer account created successfully. Your application is pending approval.',
            user: { name, email, role: 'marketer', marketerCode },
            referralCode: marketerCode
        });
    }));

    // Login
    router.post('/login', authLimiter, loginRules, asyncHandler(async (req, res) => {
        const { email, password } = req.body;

        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            throw AppError.unauthorized('Invalid email or password');
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            throw AppError.unauthorized('Invalid email or password');
        }

        // Migrate cart items from session to user
        if (req.sessionID) {
            await db.query(`
                UPDATE cart SET user_id = $1, session_id = NULL
                WHERE session_id = $2 AND user_id IS NULL
            `, [user.id, req.sessionID]);
        }

        // Check if user is a marketer
        const marketerResult = await db.query(
            'SELECT status FROM marketer_profiles WHERE user_id = $1',
            [user.id]
        );
        const isMarketer = marketerResult.rows.length > 0 && marketerResult.rows[0].status === 'approved';

        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.isAdmin = user.is_admin === true;
        req.session.isMarketer = isMarketer;
        req.session.userRole = user.role || 'customer';

        logger.info('User logged in', { userId: user.id, email });

        res.json({
            success: true,
            user: {
                name: user.name,
                email: user.email,
                isAdmin: user.is_admin === true,
                isMarketer,
                role: user.role || 'customer',
                pointsBalance: user.points_balance || 0
            }
        });
    }));

    // Delete rejected marketer account
    router.post('/delete-rejected-account', asyncHandler(async (req, res) => {
        const userId = req.session.userId;

        if (!userId) {
            throw AppError.unauthorized('Not logged in');
        }

        // Get user to verify they are a rejected marketer
        const userResult = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
        if (!userResult.rows[0]) {
            throw AppError.notFound('User not found');
        }

        const user = userResult.rows[0];
        if (user.role !== 'marketer') {
            throw AppError.forbidden('Only rejected marketers can use this endpoint');
        }

        // Check if marketer status is rejected
        const marketerResult = await db.query(
            'SELECT status FROM marketer_profiles WHERE user_id = $1',
            [userId]
        );

        if (!marketerResult.rows[0] || marketerResult.rows[0].status !== 'rejected') {
            throw AppError.forbidden('Account not marked for deletion');
        }

        // Delete marketer profile
        await db.query('DELETE FROM marketer_profiles WHERE user_id = $1', [userId]);

        // Delete user account
        await db.query('DELETE FROM users WHERE id = $1', [userId]);

        logger.info('Rejected marketer account deleted', { userId });

        res.json({
            success: true,
            message: 'Account has been removed'
        });
    }));

    // Logout
    router.post('/logout', asyncHandler(async (req, res) => {
        const userId = req.session.userId;

        req.session.destroy((err) => {
            if (err) {
                logger.error('Logout error', { error: err.message });
            }
        });

        if (userId) {
            logger.info('User logged out', { userId });
        }

        res.json({ success: true });
    }));

    // Get current user
    router.get('/user', asyncHandler(async (req, res) => {
        if (req.session.userId) {
            // Get fresh user data from database
            const userResult = await db.query(
                'SELECT name, email, role, points_balance, referral_code FROM users WHERE id = $1',
                [req.session.userId]
            );
            const user = userResult.rows[0];

            // Check marketer status
            const marketerResult = await db.query(
                'SELECT status FROM marketer_profiles WHERE user_id = $1',
                [req.session.userId]
            );
            const marketerStatus = marketerResult.rows[0]?.status;
            const isMarketer = user?.role === 'marketer' || marketerStatus === 'approved';

            res.json({
                loggedIn: true,
                user: {
                    name: user?.name || req.session.userName,
                    email: user?.email,
                    isAdmin: req.session.isAdmin,
                    isMarketer,
                    marketerStatus,
                    role: user?.role || 'customer',
                    pointsBalance: user?.points_balance || 0,
                    referralCode: user?.referral_code
                }
            });
        } else {
            res.json({ loggedIn: false });
        }
    }));

    return router;
};
