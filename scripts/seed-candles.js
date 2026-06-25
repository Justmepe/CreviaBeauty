/**
 * One-off: seed starter Candle SKUs into any environment (prod has demo-seeding off).
 * Idempotent — does nothing if Candles products already exist.
 * Replace these with real sourced stock via the admin afterwards.
 *
 * Usage: node scripts/seed-candles.js
 */

const db = require('../database');

const imgWarm  = 'https://images.unsplash.com/photo-1602874801006-e26c4c5b5b0a?w=800&h=800&fit=crop';
const imgSoft  = 'https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800&h=800&fit=crop';
const imgFresh = 'https://images.unsplash.com/photo-1606830733744-0ad778449672?w=800&h=800&fit=crop';

const CANDLES = [
    ['Amber & Oud Luxury Candle 200g', 'Warm amber, oud and a whisper of vanilla. A slow, sophisticated burn for evenings in.', 2800, 3400, 18, 'Candles', 'Luxury Candles', imgWarm, 30, 'Crevia Home', 'Oriental / Woody'],
    ['Rose & Saffron Luxury Candle 200g', 'Turkish rose layered with saffron and soft musk. Romantic, rich, unmistakably premium.', 3200, 3800, 16, 'Candles', 'Luxury Candles', imgSoft, 24, 'Crevia Home', 'Floral'],
    ['Vanilla & Sandalwood Soy Candle 160g', 'Creamy vanilla over warm sandalwood. The cosy, everyday signature scent for any room.', 2200, 2600, 15, 'Candles', 'Scented Candles', imgWarm, 40, 'Crevia Home', 'Oriental / Woody'],
    ['Fresh Linen & White Tea Candle 160g', 'Clean linen, white tea and a touch of citrus. Light, airy and office-calm.', 1900, 2300, 17, 'Candles', 'Scented Candles', imgFresh, 45, 'Crevia Home', 'Fresh / Aromatic'],
    ['Citrus & Bergamot Travel Candle 90g', 'Bright bergamot and zesty citrus in a pocket-size tin. Bring your scent anywhere.', 1500, 1800, 17, 'Candles', 'Scented Candles', imgFresh, 60, 'Crevia Home', 'Fresh / Aromatic']
];

async function run() {
    await db.ready();
    const existing = await db.query("SELECT COUNT(*) AS count FROM products WHERE category = 'Candles'");
    if (parseInt(existing.rows[0].count) > 0) {
        console.log(`Candles already present (${existing.rows[0].count}). Nothing to do.`);
        await db.close();
        return;
    }
    for (const c of CANDLES) {
        await db.query(`
            INSERT INTO products (name, description, price, original_price, discount, category, subcategory, image_url, stock, brand, scent_family, is_authentic_verified)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE)
        `, c);
        console.log(`+ ${c[0]}`);
    }
    console.log(`Done — ${CANDLES.length} candle SKUs seeded.`);
    await db.close();
}

run().catch(err => { console.error(err); process.exit(1); });
