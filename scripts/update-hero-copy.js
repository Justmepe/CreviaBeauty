/**
 * One-off: rewrite hero slide copy from category-led to problem-led
 * ($100M Offers framing: pain/outcome headline, proof, risk reversal).
 * Matches rows by category — safe to re-run, e.g. against production.
 *
 * Usage: node scripts/update-hero-copy.js
 */

const db = require('../database');

const COPY = [
    {
        category: 'Perfumes',
        badge: 'BATCH-CODE VERIFIED',
        title_prefix: 'Never Wonder If It\'s',
        title_highlight: 'Fake',
        title_suffix: 'Again',
        description: 'Every bottle sourced direct and batch-code verifiable: Dior, Chanel, Tom Ford, Jo Malone. Authenticity guaranteed · Free delivery in Nairobi.',
        link_text: 'Shop Perfumes',
        extra_link_url: '/quiz',
        extra_link_text: 'Not sure where to start? Take the 5-question scent quiz.'
    },
    {
        category: "Women's Skincare",
        badge: 'INGREDIENT-LED',
        title_prefix: 'Skincare That Matches',
        title_highlight: 'Your Skin,',
        title_suffix: 'Not The Hype',
        description: 'Full ingredient and allergen info on every product. From La Mer to CeraVe, pick what your skin actually needs. Authenticity guaranteed · Free delivery in Nairobi.',
        link_text: "Shop Women's Skincare"
    },
    {
        category: "Men's Skincare",
        badge: 'NO-OVERWHELM GROOMING',
        title_prefix: 'Look Sharp In',
        title_highlight: 'Two Steps,',
        title_suffix: 'Not Ten',
        description: 'Cleanse, hydrate, done. A focused grooming line without the ten-step overwhelm. Free delivery in Nairobi.',
        link_text: "Shop Men's Skincare"
    },
    {
        category: 'Makeup',
        badge: 'SHADE-MATCHED FOR YOU',
        title_prefix: 'Foundation That Actually',
        title_highlight: 'Matches',
        title_suffix: null,
        description: 'Foundations in 12 shades for African skin tones. Kenyan brands like Suzie Beauty alongside Fenty, MAC and Urban Decay. Free delivery in Nairobi.',
        link_text: 'Shop Makeup'
    },
    {
        category: 'Fragrances',
        badge: 'FIND YOUR SIGNATURE',
        title_prefix: 'Find The Scent That Feels Like',
        title_highlight: 'You',
        title_suffix: null,
        description: 'Five questions, one signature scent. Long-lasting designer fragrances, authenticity guaranteed.',
        link_text: 'Shop Fragrances',
        extra_link_url: '/quiz',
        extra_link_text: 'Take the 5-question scent quiz.'
    },
    {
        category: 'Hair Care',
        badge: 'TYPE 4 FRIENDLY',
        title_prefix: 'Wash Day Without The',
        title_highlight: 'Guesswork',
        title_suffix: null,
        description: "Filter by your texture: 4A, 4B, 4C. Cantu, Shea Moisture, Marini Naturals, Mielle and Aunt Jackie's. Free delivery in Nairobi.",
        link_text: 'Shop Hair Care'
    },
    {
        category: 'Body Care',
        badge: 'BODY EDIT',
        title_prefix: 'The Glow That',
        title_highlight: 'Doesn\'t Wash Off',
        title_suffix: null,
        description: "Whipped butters, bath rituals, and cult favourites like Sol de Janeiro's Bum Bum cream. Free delivery in Nairobi.",
        link_text: 'Shop Body Care'
    },
    {
        category: 'Beauty Tools',
        badge: 'PRO TOOLS',
        title_prefix: 'Your Makeup Is Fine. Your',
        title_highlight: 'Tools',
        title_suffix: 'Aren\'t.',
        description: 'Dyson Airwrap, Real Techniques brushes: the kit pieces that change a routine. Authenticity guaranteed.',
        link_text: 'Shop Beauty Tools'
    },
    {
        category: 'Wigs',
        badge: 'BEGINNER FRIENDLY',
        title_prefix: 'Salon Hair,',
        title_highlight: 'Zero',
        title_suffix: 'Salon Hours',
        description: 'Glueless, beginner-friendly styles, from everyday headband wigs to luxury HD lace. Human hair and synthetic. Free delivery in Nairobi.',
        link_text: 'Shop Wigs'
    }
];

async function run() {
    await db.ready();
    let updated = 0;
    for (const c of COPY) {
        const result = await db.query(`
            UPDATE hero_slides
            SET badge = $2, title_prefix = $3, title_highlight = $4, title_suffix = $5,
                description = $6, link_text = $7,
                extra_link_url = COALESCE($8, extra_link_url),
                extra_link_text = COALESCE($9, extra_link_text),
                updated_at = CURRENT_TIMESTAMP
            WHERE category = $1
        `, [c.category, c.badge, c.title_prefix, c.title_highlight, c.title_suffix,
            c.description, c.link_text, c.extra_link_url || null, c.extra_link_text || null]);
        updated += result.rowCount;
        console.log(`${c.category}: ${result.rowCount} row(s) updated`);
    }
    console.log(`Done — ${updated} slides updated.`);
    await db.close();
}

run().catch(err => { console.error(err); process.exit(1); });
