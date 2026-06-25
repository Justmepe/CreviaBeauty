/**
 * One-off: seed starter Makeup SKUs (prod has demo-seeding off and makeup was pruned).
 * Idempotent — does nothing if Makeup products already exist.
 * Replace with real sourced stock via the admin afterwards.
 *
 * Usage: node scripts/seed-makeup.js
 */

const db = require('../database');

const localImg = 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&h=800&fit=crop';

// [name, description, price, original_price, discount, category, subcategory, image_url, stock, brand, is_local_brand]
const MAKEUP = [
    ['MAC Ruby Woo Lipstick', 'Iconic matte red lipstick. A true blue-red that flatters every skin tone.', 3200, 3800, 16, 'Makeup', 'Lips', 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&h=800&fit=crop', 45, 'MAC', false],
    ["Fenty Beauty Pro Filt'r Foundation", 'Soft matte longwear foundation. Shade-matched coverage for African skin tones.', 5500, 6500, 15, 'Makeup', 'Face', 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&h=800&fit=crop', 35, 'Fenty Beauty', false],
    ['Urban Decay Naked Palette', '12 neutral eyeshadows from matte nude to shimmer bronze. The everyday eye edit.', 7500, 9000, 17, 'Makeup', 'Eyes', 'https://images.unsplash.com/photo-1583241800698-e8ab01830a07?w=800&h=800&fit=crop', 25, 'Urban Decay', false],
    ['Suzie Beauty Matte Lipstick, Nairobi Nights', 'Long-wear matte lipstick formulated for African skin tones. Made in Kenya.', 1200, 1500, 20, 'Makeup', 'Lips', localImg, 40, 'Suzie Beauty', true],
    ['Suzie Beauty Liquid Foundation, Med-Deep', 'Buildable medium-to-full coverage foundation. 10 shades for African skin tones. Made in Kenya.', 1850, 2200, 16, 'Makeup', 'Face', localImg, 30, 'Suzie Beauty', true],
    ['Huddah Cosmetics Liquid Matte Lip, Bossy', 'Iconic matte liquid lipstick by Huddah Monroe. 8 hours wear, full pigment.', 1450, 1800, 19, 'Makeup', 'Lips', localImg, 45, 'Huddah Cosmetics', true]
];

async function run() {
    await db.ready();
    const existing = await db.query("SELECT COUNT(*) AS count FROM products WHERE category = 'Makeup'");
    if (parseInt(existing.rows[0].count) > 0) {
        console.log(`Makeup already present (${existing.rows[0].count}). Nothing to do.`);
        await db.close();
        return;
    }
    for (const m of MAKEUP) {
        await db.query(`
            INSERT INTO products (name, description, price, original_price, discount, category, subcategory, image_url, stock, brand, is_local_brand, is_authentic_verified)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE)
        `, m);
        console.log(`+ ${m[0]}`);
    }
    console.log(`Done — ${MAKEUP.length} makeup SKUs seeded.`);
    await db.close();
}

run().catch(err => { console.error(err); process.exit(1); });
