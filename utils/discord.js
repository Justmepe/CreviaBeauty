/**
 * Discord notifier
 *
 * Posts an order/receipt embed to the configured Discord webhook, optionally
 * with a file attachment (the receipt PDF). Set DISCORD_WEBHOOK_URL in .env to
 * enable; if unset, calls are skipped silently so dev/test/CI need no webhook.
 *
 * Uses Node's global fetch / FormData / Blob (Node 18+).
 */

const logger = require('./logger');

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

/**
 * @param {object} embed  A Discord embed object.
 * @param {object} [file] Optional attachment: { buffer: Buffer, filename: string }.
 * @param {string} [webhookUrl] Override the default webhook (e.g. a dedicated
 *                 content channel). Falls back to DISCORD_WEBHOOK_URL when omitted.
 */
async function sendEmbed(embed, file, webhookUrl) {
    const url = webhookUrl || DISCORD_WEBHOOK_URL;
    if (!url) return;
    try {
        let body;
        const payload = { embeds: [embed] };

        if (file && file.buffer) {
            const form = new FormData();
            form.append('payload_json', JSON.stringify(payload));
            form.append(
                'files[0]',
                new Blob([file.buffer], { type: 'application/pdf' }),
                file.filename || 'receipt.pdf'
            );
            body = form; // fetch sets the multipart boundary header automatically
        } else {
            body = JSON.stringify(payload);
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: file && file.buffer ? undefined : { 'Content-Type': 'application/json' },
            body
        });

        if (!res.ok) {
            logger.error('Discord webhook failed', { status: res.status });
        }
    } catch (error) {
        logger.error('Discord notification failed', { error: error.message });
    }
}

module.exports = { sendEmbed };
