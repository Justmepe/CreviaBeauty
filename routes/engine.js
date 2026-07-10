/**
 * Engine routes — a tiny, token-protected surface the Python research engine
 * (engine/research.py) calls to read the coverage brain, so it can pick products
 * the calendar says haven't been covered yet instead of a blind rotation counter.
 *
 * Auth: a shared secret in CONTENT_ENGINE_TOKEN (sent as x-engine-token header or
 * ?token=). If the var is unset the surface is disabled (503), so it's inert until
 * deliberately configured on the server.
 */

const express = require('express');

module.exports = (db) => {
    const router = express.Router();

    router.use((req, res, next) => {
        const token = process.env.CONTENT_ENGINE_TOKEN;
        if (!token) return res.status(503).json({ error: 'engine endpoint disabled (CONTENT_ENGINE_TOKEN not set)' });
        const got = req.get('x-engine-token') || req.query.token;
        if (got !== token) return res.status(403).json({ error: 'invalid engine token' });
        next();
    });

    // GET /api/engine/uncovered?count=3&category=Perfumes
    // Products the content calendar has featured least (never-covered first), so the
    // engine generates for real gaps. Returns catalog fields the prompt builders need.
    router.get('/uncovered', async (req, res, next) => {
        try {
            const count = Math.min(20, Math.max(1, parseInt(req.query.count, 10) || 3));
            const conds = ['p.is_hidden = FALSE'];
            const params = [];
            if (req.query.category) {
                params.push(String(req.query.category).slice(0, 100));
                conds.push(`p.category = $${params.length}`);
            }
            const { rows } = await db.query(`
                SELECT p.id, p.name, p.category, p.price, p.description, p.image_url,
                       p.brand, p.scent_family,
                       COUNT(ci.id)::int AS times_featured,
                       to_char(MAX(COALESCE(ci.published_at::date, ci.scheduled_date)), 'YYYY-MM-DD') AS last_featured
                FROM products p
                LEFT JOIN content_items ci ON (ci.product_id = p.id OR p.id = ANY(ci.product_ids))
                WHERE ${conds.join(' AND ')}
                GROUP BY p.id
                ORDER BY times_featured ASC, last_featured ASC NULLS FIRST, p.id ASC
                LIMIT $${params.length + 1}
            `, [...params, count]);
            res.json({ products: rows });
        } catch (e) {
            next(e);
        }
    });

    return router;
};
