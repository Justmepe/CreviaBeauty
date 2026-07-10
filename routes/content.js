/**
 * Content Calendar Routes — the Notion-style content ops board.
 *
 * One row in content_items per planned social/blog post. The board is admin-only.
 * Lifecycle: idea -> draft -> scheduled -> published (or skipped). Marking an item
 * published stamps published_at, which is what the monthly rollup and the "posted on
 * time vs late" measurement read. Engagement/sales numbers are entered by hand into
 * the metrics JSONB blob (built-in calendar + manual metrics, per the product decision).
 *
 * A daily Discord reminder (utils/contentReminder.js) pings when scheduled items are
 * due or overdue; POST /remind triggers that check on demand.
 */

const express = require('express');

const { asyncHandler } = require('../middleware/errorHandler');
const { requireAdmin } = require('../middleware/auth');
const AppError = require('../utils/AppError');
const { runDueReminders } = require('../utils/contentReminder');

// Whitelisted so a typo in the UI can't wedge an item into an unknown state.
const STATUSES = ['idea', 'draft', 'scheduled', 'published', 'skipped'];

// Numeric metric keys we accept. Anything else in the payload is ignored so the
// JSONB blob stays clean and the rollup can sum known fields.
const METRIC_KEYS = ['reach', 'impressions', 'likes', 'comments', 'saves', 'shares', 'clicks', 'orders', 'revenue'];

function clampStr(v, max) {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s ? s.slice(0, max) : null;
}

// 'HH:MM' 24h or null. Rejects anything else rather than storing junk.
function cleanTime(v) {
    if (!v) return null;
    const m = String(v).trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

// 'YYYY-MM-DD' or null.
function cleanDate(v) {
    if (!v) return null;
    const s = String(v).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// Keep only known numeric metric keys, coerced to finite non-negative numbers.
function cleanMetrics(input) {
    const out = {};
    if (input && typeof input === 'object') {
        for (const k of METRIC_KEYS) {
            if (input[k] === '' || input[k] === undefined || input[k] === null) continue;
            const n = Number(input[k]);
            if (Number.isFinite(n) && n >= 0) out[k] = n;
        }
    }
    return out;
}

module.exports = (db) => {
    const router = express.Router();
    router.use(requireAdmin);

    // GET /api/admin/content?month=YYYY-MM&status=scheduled
    // Lists items, optionally scoped to a scheduled month and/or status.
    router.get('/', asyncHandler(async (req, res) => {
        const where = [];
        const params = [];

        const month = clampStr(req.query.month, 7);
        if (month && /^\d{4}-\d{2}$/.test(month)) {
            params.push(month + '-01');
            // Anything scheduled in the month, plus anything published in the month
            // (an item can be published without a scheduled_date).
            where.push(`(
                (scheduled_date >= $${params.length}::date AND scheduled_date < ($${params.length}::date + INTERVAL '1 month'))
                OR (published_at >= $${params.length}::date AND published_at < ($${params.length}::date + INTERVAL '1 month'))
            )`);
        }

        const status = clampStr(req.query.status, 20);
        if (status && STATUSES.includes(status)) {
            params.push(status);
            where.push(`status = $${params.length}`);
        }

        const sql = `
            SELECT id, title, pillar, format, platform, product, status,
                   to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
                   scheduled_time, published_at, link, notes,
                   metrics, article_id, created_at, updated_at
            FROM content_items
            ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
            ORDER BY COALESCE(scheduled_date, published_at::date, created_at::date) ASC,
                     scheduled_time ASC NULLS LAST, id ASC
        `;
        const result = await db.query(sql, params);
        res.json(result.rows);
    }));

    // GET /api/admin/content/rollup?month=YYYY-MM — monthly performance summary.
    router.get('/rollup', asyncHandler(async (req, res) => {
        const month = clampStr(req.query.month, 7);
        if (!month || !/^\d{4}-\d{2}$/.test(month)) throw AppError.badRequest('month must be YYYY-MM');
        const first = month + '-01';

        // Pull the month's items once, aggregate in JS (small volumes; keeps the
        // pillar/platform/day-of-week breakdowns readable vs. many GROUP BY trips).
        const { rows } = await db.query(`
            SELECT status, pillar, platform,
                   to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
                   published_at, metrics
            FROM content_items
            WHERE (scheduled_date >= $1::date AND scheduled_date < ($1::date + INTERVAL '1 month'))
               OR (published_at   >= $1::date AND published_at   < ($1::date + INTERVAL '1 month'))
        `, [first]);

        const summary = {
            month,
            planned: 0,        // has a scheduled_date this month
            published: 0,      // status published this month
            skipped: 0,
            onTime: 0,         // published on/before its scheduled_date
            late: 0,           // published after its scheduled_date
            byPillar: {},      // pillar -> { planned, published }
            byPlatform: {},    // platform -> { planned, published }
            byDayOfWeek: [0, 0, 0, 0, 0, 0, 0], // Sun..Sat published counts
            metrics: Object.fromEntries(METRIC_KEYS.map(k => [k, 0]))
        };

        const inMonth = (d) => d && String(d).slice(0, 7) === month;

        for (const r of rows) {
            const pillar = r.pillar || 'Unassigned';
            const platform = r.platform || 'Unassigned';
            summary.byPillar[pillar] = summary.byPillar[pillar] || { planned: 0, published: 0 };
            summary.byPlatform[platform] = summary.byPlatform[platform] || { planned: 0, published: 0 };

            if (inMonth(r.scheduled_date)) {
                summary.planned++;
                summary.byPillar[pillar].planned++;
                summary.byPlatform[platform].planned++;
            }

            const publishedThisMonth = r.status === 'published' && r.published_at && inMonth(r.published_at.toISOString());
            if (publishedThisMonth) {
                summary.published++;
                summary.byPillar[pillar].published++;
                summary.byPlatform[platform].published++;
                summary.byDayOfWeek[new Date(r.published_at).getDay()]++;

                if (r.scheduled_date) {
                    const sched = new Date(r.scheduled_date + 'T23:59:59');
                    if (new Date(r.published_at) <= sched) summary.onTime++; else summary.late++;
                }

                const m = r.metrics || {};
                for (const k of METRIC_KEYS) {
                    const n = Number(m[k]);
                    if (Number.isFinite(n)) summary.metrics[k] += n;
                }
            }

            if (r.status === 'skipped') summary.skipped++;
        }

        res.json(summary);
    }));

    // POST /api/admin/content — create an item.
    router.post('/', asyncHandler(async (req, res) => {
        const b = req.body || {};
        const title = clampStr(b.title, 300);
        if (!title) throw AppError.badRequest('Title is required');
        const status = STATUSES.includes(b.status) ? b.status : 'idea';

        const r = await db.query(`
            INSERT INTO content_items
                (title, pillar, format, platform, product, status, scheduled_date, scheduled_time, link, notes, metrics)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING *
        `, [
            title,
            clampStr(b.pillar, 100), clampStr(b.format, 100), clampStr(b.platform, 50), clampStr(b.product, 150),
            status, cleanDate(b.scheduled_date), cleanTime(b.scheduled_time),
            clampStr(b.link, 2000), clampStr(b.notes, 4000), JSON.stringify(cleanMetrics(b.metrics))
        ]);
        res.status(201).json(r.rows[0]);
    }));

    // PUT /api/admin/content/:id — patch any subset of fields.
    router.put('/:id', asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) throw AppError.badRequest('Invalid content ID');
        const b = req.body || {};

        // Build a partial update from only the keys the client actually sent.
        const sets = [];
        const params = [];
        const set = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

        if ('title' in b) {
            const t = clampStr(b.title, 300);
            if (!t) throw AppError.badRequest('Title cannot be empty');
            set('title', t);
        }
        if ('pillar' in b) set('pillar', clampStr(b.pillar, 100));
        if ('format' in b) set('format', clampStr(b.format, 100));
        if ('platform' in b) set('platform', clampStr(b.platform, 50));
        if ('product' in b) set('product', clampStr(b.product, 150));
        if ('scheduled_date' in b) set('scheduled_date', cleanDate(b.scheduled_date));
        if ('scheduled_time' in b) set('scheduled_time', cleanTime(b.scheduled_time));
        if ('link' in b) set('link', clampStr(b.link, 2000));
        if ('notes' in b) set('notes', clampStr(b.notes, 4000));
        if ('metrics' in b) set('metrics', JSON.stringify(cleanMetrics(b.metrics)));

        if ('status' in b) {
            if (!STATUSES.includes(b.status)) throw AppError.badRequest('Invalid status');
            set('status', b.status);
            // Keep published_at consistent with status transitions here too, so a
            // status change made from the board (not the Publish button) stays honest.
            if (b.status === 'published') {
                sets.push('published_at = COALESCE(published_at, CURRENT_TIMESTAMP)');
            } else {
                sets.push('published_at = NULL');
            }
        }

        if (!sets.length) throw AppError.badRequest('No fields to update');
        sets.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);

        const r = await db.query(
            `UPDATE content_items SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
            params
        );
        if (!r.rows[0]) throw AppError.notFound('Content item not found');
        res.json(r.rows[0]);
    }));

    // POST /api/admin/content/:id/publish — mark live now, stamping the timestamp
    // that the monthly rollup measures. Optional link records where it went live.
    router.post('/:id/publish', asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) throw AppError.badRequest('Invalid content ID');
        const link = clampStr((req.body || {}).link, 2000);

        const r = await db.query(`
            UPDATE content_items
            SET status = 'published',
                published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
                link = COALESCE($2, link),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `, [id, link]);
        if (!r.rows[0]) throw AppError.notFound('Content item not found');
        res.json(r.rows[0]);
    }));

    // PUT /api/admin/content/:id/metrics — save the manually-entered numbers.
    router.put('/:id/metrics', asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) throw AppError.badRequest('Invalid content ID');
        const metrics = cleanMetrics((req.body || {}).metrics || req.body);
        const r = await db.query(
            `UPDATE content_items SET metrics = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
            [id, JSON.stringify(metrics)]
        );
        if (!r.rows[0]) throw AppError.notFound('Content item not found');
        res.json(r.rows[0]);
    }));

    // DELETE /api/admin/content/:id
    router.delete('/:id', asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) throw AppError.badRequest('Invalid content ID');
        await db.query('DELETE FROM content_items WHERE id = $1', [id]);
        res.json({ success: true });
    }));

    // POST /api/admin/content/remind — run the due/overdue Discord check on demand.
    // The daily scheduler calls the same runDueReminders(db) internally.
    router.post('/remind', asyncHandler(async (req, res) => {
        const result = await runDueReminders(db);
        res.json({ success: true, ...result });
    }));

    return router;
};
