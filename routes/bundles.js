/**
 * Bundles Routes
 */

const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const AppError = require('../utils/AppError');

module.exports = (db) => {
    // List all active bundles with their items + savings
    router.get('/', asyncHandler(async (req, res) => {
        const bundles = await db.query(`SELECT * FROM bundles WHERE is_active = TRUE ORDER BY id`);

        // For each bundle, attach items + compute individual-sum vs bundle-price
        const result = [];
        for (const b of bundles.rows) {
            const items = await db.query(`
                SELECT bi.quantity, p.id, p.name, p.price, p.image_url, p.category
                FROM bundle_items bi
                JOIN products p ON p.id = bi.product_id
                WHERE bi.bundle_id = $1
            `, [b.id]);
            const individualSum = items.rows.reduce((sum, it) => sum + parseFloat(it.price) * it.quantity, 0);
            const savings = Math.max(0, individualSum - parseFloat(b.bundle_price));
            result.push({
                ...b,
                items: items.rows,
                individual_sum: individualSum,
                savings,
                savings_pct: individualSum > 0 ? Math.round((savings / individualSum) * 100) : 0
            });
        }
        res.json({ data: result });
    }));

    // Get bundle by slug
    router.get('/:slug', asyncHandler(async (req, res) => {
        const b = await db.query(`SELECT * FROM bundles WHERE slug = $1 AND is_active = TRUE`, [req.params.slug]);
        if (b.rows.length === 0) throw AppError.notFound('Bundle not found');
        const items = await db.query(`
            SELECT bi.quantity, p.*
            FROM bundle_items bi
            JOIN products p ON p.id = bi.product_id
            WHERE bi.bundle_id = $1
        `, [b.rows[0].id]);
        const individualSum = items.rows.reduce((sum, it) => sum + parseFloat(it.price) * it.quantity, 0);
        const savings = Math.max(0, individualSum - parseFloat(b.rows[0].bundle_price));
        res.json({
            ...b.rows[0],
            items: items.rows,
            individual_sum: individualSum,
            savings,
            savings_pct: individualSum > 0 ? Math.round((savings / individualSum) * 100) : 0
        });
    }));

    return router;
};
