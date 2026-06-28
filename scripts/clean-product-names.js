/**
 * One-off: remove em/en dashes from product names and descriptions (house style:
 * no em dashes). Replaces ' — ' / ' – ' with ' - '. Idempotent, safe to re-run.
 * Usage: node scripts/clean-product-names.js
 */

const db = require('../database');

function strip(s) {
    if (typeof s !== 'string') return s;
    return s.replace(/\s*[—–]\s*/g, ' - ').replace(/\s{2,}/g, ' ').trim();
}

async function run() {
    await db.ready();
    const result = await db.query('SELECT id, name, description FROM products');
    let updated = 0;

    for (const row of result.rows) {
        const name = strip(row.name);
        const description = strip(row.description);
        if (name !== row.name || description !== row.description) {
            await db.query('UPDATE products SET name = $2, description = $3 WHERE id = $1', [row.id, name, description]);
            updated++;
            console.log(`cleaned: ${name}`);
        }
    }

    console.log(`Done. ${updated} of ${result.rows.length} products cleaned.`);
    await db.close();
}

run().catch(err => { console.error(err); process.exit(1); });
