/**
 * Content due-reminder — the Discord side of the content calendar.
 *
 * Fires per item AT ITS OWN scheduled time, interpreted in the business timezone
 * (CONTENT_TZ, default Africa/Nairobi), NOT the server's UTC clock. So a product
 * post set for 09:00 pings at 09:00 Nairobi and an educational carousel set for
 * 18:00 pings at 18:00 — they never get lumped into one fixed morning batch. Items
 * with no time fall back to CONTENT_REMIND_HOUR. An optional lead
 * (CONTENT_REMIND_LEAD_MIN) fires the ping that many minutes early.
 *
 * The server calls this every ~15 min; the SQL below self-selects only items whose
 * moment has arrived (or is overdue) and that haven't been reminded in the last 20h,
 * so each item pings once at its time and overdue items nag at most once a day.
 *
 * Posts to CONTENT_DISCORD_WEBHOOK_URL, a channel dedicated to content ops (kept
 * separate from the orders/receipts DISCORD_WEBHOOK_URL). No-ops silently when that
 * var is unset (dev/test/CI), matching the existing order/receipt notifier.
 */

const { sendEmbed } = require('./discord');
const logger = require('./logger');

// Champagne gold, to match the brand embeds elsewhere.
const EMBED_COLOR = 0xC9A24B;

const CONTENT_TZ = process.env.CONTENT_TZ || 'Africa/Nairobi';

// Default posting time (HH:MM) for items scheduled without an explicit time.
function defaultTime() {
    const h = parseInt(process.env.CONTENT_REMIND_HOUR, 10);
    return Number.isInteger(h) && h >= 0 && h <= 23 ? String(h).padStart(2, '0') + ':00' : '09:00';
}

// Minutes to fire before the scheduled moment (0 = exactly on time).
function leadMinutes() {
    const n = parseInt(process.env.CONTENT_REMIND_LEAD_MIN, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * @param {object} db  the pg pool wrapper (has .query)
 * @returns {Promise<{count:number, skipped?:boolean, overdue?:number}>}
 */
async function runDueReminders(db) {
    const webhookUrl = process.env.CONTENT_DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        return { count: 0, skipped: true };
    }

    // A scheduled item is "due to ping" when its wall-clock moment
    // (scheduled_date + scheduled_time, read as CONTENT_TZ local time) has arrived,
    // give or take the lead. Comparing both sides in CONTENT_TZ local time makes this
    // correct no matter what timezone the server runs in.
    const { rows } = await db.query(`
        SELECT id, title, pillar, format, platform, product,
               to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
               scheduled_time,
               (scheduled_date < (NOW() AT TIME ZONE $1)::date) AS overdue
        FROM content_items
        WHERE status = 'scheduled'
          AND scheduled_date IS NOT NULL
          AND (scheduled_date + COALESCE(NULLIF(scheduled_time, '')::time, $2::time))
                <= (NOW() AT TIME ZONE $1) + ($3 * INTERVAL '1 minute')
          AND (reminded_at IS NULL OR reminded_at < NOW() - INTERVAL '20 hours')
        ORDER BY scheduled_date ASC, scheduled_time ASC NULLS LAST, id ASC
    `, [CONTENT_TZ, defaultTime(), leadMinutes()]);

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
            const flag = r.overdue ? '⚠️ overdue' : 'now';
            const when = r.scheduled_time ? `${r.scheduled_date} ${r.scheduled_time}` : r.scheduled_date;
            const meta = [r.platform, r.format].filter(Boolean).join(' · ');
            return `• **${r.title}** (${flag}, ${when})${meta ? `\n  ${meta}` : ''}`;
        }).join('\n').slice(0, 1024), // Discord field value hard cap
        inline: false
    }));

    const overdueCount = rows.filter(r => r.overdue).length;
    const embed = {
        title: `📣 Time to post: ${rows.length} item${rows.length === 1 ? '' : 's'}`,
        description: overdueCount
            ? `${overdueCount} overdue, ${rows.length - overdueCount} due now.`
            : 'Scheduled for right about now.',
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
