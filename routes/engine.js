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
const { sendEmbed } = require('../utils/discord');
const { markSeen } = require('../utils/promptNotifier');

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

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

    // POST /api/engine/plan  { items: [ {title, product_id, product_ids, pillar,
    //   format, platform, slot_time 'HH:MM', prompt_file}, ... ] }
    // Creates one scheduled content_items row per item (today, in CONTENT_TZ), tied to
    // the product, at its staggered slot. Idempotent via source_prompt so re-runs don't
    // duplicate. Sends ONE "today's plan" Discord ping and suppresses the per-prompt ping.
    router.post('/plan', async (req, res, next) => {
        try {
            const tz = process.env.CONTENT_TZ || 'Africa/Nairobi';
            const items = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, 20) : [];
            if (!items.length) return res.json({ created: 0, skipped: 0 });

            const created = [];
            let skipped = 0;
            for (const it of items) {
                const title = String((it && it.title) || '').trim().slice(0, 300);
                if (!title) { skipped++; continue; }
                const productId = parseInt(it.product_id, 10) || null;
                const productIds = Array.isArray(it.product_ids)
                    ? it.product_ids.map(x => parseInt(x, 10)).filter(n => Number.isInteger(n) && n > 0).slice(0, 4)
                    : (productId ? [productId] : []);
                const format = String(it.format || '').trim().slice(0, 100) || null;
                const pillar = String(it.pillar || '').trim().slice(0, 100) || null;
                const platform = String(it.platform || 'Instagram').trim().slice(0, 50);
                const slot = TIME_RE.test(String(it.slot_time || '')) ? String(it.slot_time) : null;
                const src = String(it.prompt_file || '').trim().slice(0, 200) || null;

                // Idempotency: same prompt already planned for today -> skip.
                if (src) {
                    const dup = await db.query(
                        `SELECT 1 FROM content_items WHERE source_prompt = $1
                         AND scheduled_date = (NOW() AT TIME ZONE $2)::date LIMIT 1`, [src, tz]);
                    if (dup.rows.length) { skipped++; continue; }
                }

                await db.query(`
                    INSERT INTO content_items
                        (title, pillar, format, platform, status, scheduled_date, scheduled_time,
                         product_id, product_ids, source_prompt)
                    VALUES ($1,$2,$3,$4,'scheduled',(NOW() AT TIME ZONE $5)::date,$6,$7,$8::int[],$9)
                `, [title, pillar, format, platform, tz, slot, productId, productIds, src]);
                created.push({ title, slot, format });
            }

            // Suppress promptNotifier's separate ping for these files.
            markSeen(items.map(it => it && it.prompt_file).filter(Boolean));

            if (created.length && process.env.CONTENT_DISCORD_WEBHOOK_URL) {
                const lines = created
                    .sort((a, b) => (a.slot || '99:99').localeCompare(b.slot || '99:99'))
                    .map(c => `• ${c.slot || '—'}  ${c.title}${c.format ? `  (${c.format})` : ''}`)
                    .join('\n').slice(0, 1600);
                await sendEmbed({
                    title: `🗓 Today's plan: ${created.length} post${created.length === 1 ? '' : 's'}`,
                    description: 'Prompts are in the Content Studio inbox. Paste each into claude.ai, then post at these times:\n\n' + lines,
                    color: 0xC9A24B,
                    footer: { text: 'CreviaBeauty Content Calendar' },
                    timestamp: new Date().toISOString()
                }, undefined, process.env.CONTENT_DISCORD_WEBHOOK_URL);
            }

            res.json({ created: created.length, skipped });
        } catch (e) {
            next(e);
        }
    });

    return router;
};
