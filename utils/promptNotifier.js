/**
 * Prompt-ready notifier — pings the content Discord channel when the research
 * engine drops a new prompt into engine/output/ (i.e. "the research is done").
 *
 * The server calls notifyNewPrompts() on the same interval as the due-reminder.
 * State is the set of prompt files seen on the previous scan (persisted to
 * engine/output/.notified.json). A file present now but not last time = new -> ping.
 * A file that disappears (processed into done/ or deleted) drops from the set, so if
 * the engine later regenerates a prompt with the same name it pings again.
 *
 * Cold start (no state file yet) records the current files WITHOUT pinging, so a
 * deploy/restart never floods the channel with prompts that were already there.
 *
 * Posts to CONTENT_DISCORD_WEBHOOK_URL; no-ops when unset (dev/test/CI).
 */

const fs = require('fs');
const path = require('path');
const { sendEmbed } = require('./discord');
const logger = require('./logger');

const EMBED_COLOR = 0xC9A24B;
const OUTPUT_DIR = path.resolve(__dirname, '..', 'engine', 'output');
const SEEN_FILE = path.join(OUTPUT_DIR, '.notified.json');

function listPrompts() {
    try {
        return fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('-prompt.txt'));
    } catch (e) {
        return []; // dir doesn't exist until the engine first runs
    }
}

function loadSeen() {
    try {
        return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')));
    } catch (e) {
        return null; // no state yet -> cold start
    }
}

function saveSeen(set) {
    try {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        fs.writeFileSync(SEEN_FILE, JSON.stringify([...set], null, 2));
    } catch (e) {
        logger.error('Prompt notifier state save failed', { error: e.message });
    }
}

// filename -> a readable topic + a content-type label.
function describe(file) {
    const isYt = file.startsWith('youtube-');
    const isProduct = file.startsWith('product-');
    const topic = file
        .replace(/-prompt\.txt$/, '')
        .replace(/^(youtube|product)-/, '')
        .replace(/-/g, ' ');
    const label = isYt ? '🎬 YouTube script' : isProduct ? '🛍 Product post' : '📝 Carousel / article';
    return { label, topic };
}

async function notifyNewPrompts() {
    const webhookUrl = process.env.CONTENT_DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return { skipped: true };

    const current = listPrompts();
    const seen = loadSeen();

    if (seen === null) {
        saveSeen(new Set(current)); // cold start: adopt current as baseline, don't ping
        return { initialized: current.length };
    }

    const fresh = current.filter(f => !seen.has(f));
    // Persist the current view regardless, so disappeared files drop out.
    saveSeen(new Set(current));

    if (!fresh.length) return { count: 0 };

    const fields = fresh.slice(0, 20).map(f => {
        const { label, topic } = describe(f);
        return { name: label, value: topic.slice(0, 1024), inline: false };
    });

    await sendEmbed({
        title: `🧪 ${fresh.length} new prompt${fresh.length === 1 ? '' : 's'} ready to process`,
        description: 'Open Admin → Content Studio → Prompt Inbox, copy each into claude.ai, then Inject the reply.',
        color: EMBED_COLOR,
        fields,
        footer: { text: 'CreviaBeauty Content Engine' },
        timestamp: new Date().toISOString()
    }, undefined, webhookUrl);

    logger.info('New-prompt notification sent', { count: fresh.length });
    return { count: fresh.length };
}

module.exports = { notifyNewPrompts };
