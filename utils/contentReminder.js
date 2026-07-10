/**
 * Content due-reminder — the Discord side of the content calendar.
 *
 * Finds scheduled items that are due today or overdue and still not published,
 * then posts a single grouped embed to the Discord webhook (via utils/discord.js)
 * so whoever runs the socials knows what to process. reminded_at is stamped so the
 * same item isn't re-pinged within ~20h, which keeps both the daily scheduler and
 * the manual POST /remind endpoint idempotent.
 *
 * Posts to CONTENT_DISCORD_WEBHOOK_URL, a channel dedicated to content ops (kept
 * separate from the orders/receipts DISCORD_WEBHOOK_URL). No-ops silently when that
 * var is unset (dev/test/CI), matching the existing order/receipt notifier.
 */

const { sendEmbed } = require('./discord');
const logger = require('./logger');

// Champagne gold, to match the brand embeds elsewhere.
const EMBED_COLOR = 0xC9A24B;

function fmtDate(d) {
    // d is a JS Date (from a DATE column) or a 'YYYY-MM-DD' string.
    const s = typeof d === 'string' ? d : (d ? d.toISOString().slice(0, 10) : '');
    return s;
}

/**
 * @param {object} db  the pg pool wrapper (has .query)
 * @returns {Promise<{count:number, skipped?:boolean}>}
 */
async function runDueReminders(db) {
    const webhookUrl = process.env.CONTENT_DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        return { count: 0, skipped: true };
    }

    // Due = scheduled, on or before today, not yet reminded in the last 20h.
    const { rows } = await db.query(`
        SELECT id, title, pillar, format, platform, product, scheduled_date, scheduled_time,
               (scheduled_date < CURRENT_DATE) AS overdue
        FROM content_items
        WHERE status = 'scheduled'
          AND scheduled_date IS NOT NULL
          AND scheduled_date <= CURRENT_DATE
          AND (reminded_at IS NULL OR reminded_at < NOW() - INTERVAL '20 hours')
        ORDER BY scheduled_date ASC, scheduled_time ASC NULLS LAST, id ASC
    `);

    if (!rows.length) return { count: 0 };

    // Group by "type of content" (pillar) so the ping reads like a to-do list.
    const byPillar = {};
    for (const r of rows) {
        const key = r.pillar || 'Unassigned';
        (byPillar[key] = byPillar[key] || []).push(r);
    }

    const fields = Object.entries(byPillar).map(([pillar, items]) => ({
        name: pillar,
        value: items.map(r => {
            const flag = r.overdue ? '⚠️ overdue' : 'today';
            const when = fmtDate(r.scheduled_date) + (r.scheduled_time ? ` ${r.scheduled_time}` : '');
            const meta = [r.platform, r.format].filter(Boolean).join(' · ');
            return `• **${r.title}** (${flag}, ${when})${meta ? `\n  ${meta}` : ''}`;
        }).join('\n').slice(0, 1024), // Discord field value hard cap
        inline: false
    }));

    const overdueCount = rows.filter(r => r.overdue).length;
    const embed = {
        title: `📅 ${rows.length} post${rows.length === 1 ? '' : 's'} to process`,
        description: overdueCount
            ? `${overdueCount} overdue, ${rows.length - overdueCount} due today.`
            : 'Due today.',
        color: EMBED_COLOR,
        fields,
        footer: { text: 'CreviaBeauty Content Calendar' },
        timestamp: new Date().toISOString()
    };

    await sendEmbed(embed, undefined, webhookUrl);

    // Stamp reminded_at so these don't re-fire until the next window.
    const ids = rows.map(r => r.id);
    await db.query(
        `UPDATE content_items SET reminded_at = NOW() WHERE id = ANY($1::int[])`,
        [ids]
    );

    logger.info('Content due-reminder sent', { count: rows.length, overdue: overdueCount });
    return { count: rows.length, overdue: overdueCount };
}

module.exports = { runDueReminders };
