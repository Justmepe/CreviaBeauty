/**
 * One-off: link existing reviews to a product so the homepage review cards can
 * show the product reviewed. Only touches reviews where product_id IS NULL.
 * Matches a product by keywords in the review text, then category, then random.
 *
 * Usage: node scripts/backfill-review-products.js
 */

const db = require('../database');

// keyword in review text -> product search term
const HINTS = [
    [/sauvage|dior/i, 'Sauvage'],
    [/perfume|scent|fragrance|cologne/i, 'Perfume'],
    [/lipstick|matte lip|lip/i, 'Lipstick'],
    [/foundation/i, 'Foundation'],
    [/makeup/i, 'Makeup'],
    [/skincare|cream|la mer|serum|cleanser/i, 'Cleanser'],
    [/hair|wig/i, 'Hair'],
    [/candle/i, 'Candle'],
    [/body|bum bum|butter/i, 'Candle']
];

async function findProduct(text) {
    for (const [re, term] of HINTS) {
        if (re.test(text || '')) {
            let r = await db.query('SELECT id FROM products WHERE name ILIKE $1 ORDER BY id LIMIT 1', [`%${term}%`]);
            if (r.rows[0]) return r.rows[0].id;
            r = await db.query('SELECT id FROM products WHERE category = $1 ORDER BY id LIMIT 1', [term]);
            if (r.rows[0]) return r.rows[0].id;
        }
    }
    const any = await db.query('SELECT id FROM products ORDER BY RANDOM() LIMIT 1');
    return any.rows[0] ? any.rows[0].id : null;
}

async function run() {
    await db.ready();
    const reviews = await db.query('SELECT id, review_text FROM reviews WHERE product_id IS NULL');
    if (reviews.rows.length === 0) {
        console.log('No reviews need backfilling.');
        await db.close();
        return;
    }
    let n = 0;
    for (const rev of reviews.rows) {
        const pid = await findProduct(rev.review_text);
        if (pid) {
            await db.query('UPDATE reviews SET product_id = $1 WHERE id = $2', [pid, rev.id]);
            n++;
        }
    }
    console.log(`Linked ${n} of ${reviews.rows.length} reviews to products.`);
    await db.close();
}

run().catch(err => { console.error(err); process.exit(1); });
