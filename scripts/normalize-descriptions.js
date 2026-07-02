/**
 * One-off: normalize existing product descriptions (inline "- Item" bullets ->
 * one bullet per line) so they store cleanly. Only touches rows that change and
 * never alters wording — it only inserts line breaks.
 *
 * Dry run (default): node scripts/normalize-descriptions.js
 * Apply:             node scripts/normalize-descriptions.js --apply
 */
const db = require('../database');
const { normalizeDescription } = require('../utils/formatDescription');

const APPLY = process.argv.includes('--apply');

async function run() {
    await db.ready();
    const { rows } = await db.query('SELECT id, name, description FROM products');
    let changed = 0;
    for (const p of rows) {
        const norm = normalizeDescription(p.description);
        if (norm !== p.description) {
            changed++;
            if (APPLY) await db.query('UPDATE products SET description = $1 WHERE id = $2', [norm, p.id]);
            else console.log(`would change #${p.id} — ${p.name}`);
        }
    }
    console.log(`${changed} of ${rows.length} descriptions ${APPLY ? 'updated' : 'would change'} (${APPLY ? 'APPLIED' : 'dry run'})`);
    await db.close();
}

run().catch(err => { console.error(err); process.exit(1); });
