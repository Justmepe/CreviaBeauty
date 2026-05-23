/**
 * Contact Routes
 */

const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { formLimiter } = require('../middleware/rateLimiter');
const { contactRules } = require('../validators/contact');
const logger = require('../utils/logger');

module.exports = (db) => {
    // Submit contact form
    router.post('/', formLimiter, contactRules, asyncHandler(async (req, res) => {
        const { name, email, phone, message } = req.body;

        const result = await db.query(`
            INSERT INTO contacts (name, email, phone, message)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [name, email, phone || null, message]);

        logger.info('Contact form submitted', {
            contactId: result.rows[0].id,
            email
        });

        res.json({ success: true, message: 'Message sent successfully!' });
    }));

    return router;
};
