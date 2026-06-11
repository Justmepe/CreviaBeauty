/**
 * One-off: remove em dashes from existing articles (house style: none allowed).
 * New articles are cleaned automatically at processing time in routes/articles.js.
 * Safe to re-run. Usage: node scripts/strip-em-dashes.js
 */

const db = require('../database');

function strip(value) {
    if (typeof value === 'string') {
        return value.replace(/\s*—\s*/g, ', ').replace(/\s+,/g, ',');
    }
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value)) out[key] = strip(value[key]);
        return out;
    }
    return value;
}

async function run() {
    await db.ready();
    const result = await db.query('SELECT id, title, intro, meta_title, meta_description, tags, content FROM articles');
    let updated = 0;

    for (const row of result.rows) {
        const cleaned = {
            title: strip(row.title),
            intro: strip(row.intro),
            meta_title: strip(row.meta_title),
            meta_description: strip(row.meta_description),
            tags: strip(row.tags),
            content: strip(row.content)
        };
        const changed = cleaned.title !== row.title || cleaned.intro !== row.intro ||
            cleaned.meta_title !== row.meta_title || cleaned.meta_description !== row.meta_description ||
            cleaned.tags !== row.tags || JSON.stringify(cleaned.content) !== JSON.stringify(row.content);

        if (changed) {
            await db.query(`
                UPDATE articles
                SET title = $2, intro = $3, meta_title = $4, meta_description = $5, tags = $6,
                    content = $7, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [row.id, cleaned.title, cleaned.intro, cleaned.meta_title, cleaned.meta_description,
                cleaned.tags, JSON.stringify(cleaned.content)]);
            updated++;
            console.log(`cleaned: ${cleaned.title}`);
        }
    }
    console.log(`Done. ${updated} of ${result.rows.length} articles cleaned.`);
    await db.close();
}

run().catch(err => { console.error(err); process.exit(1); });
