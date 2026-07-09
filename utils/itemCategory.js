/**
 * Resolve a free-text order line-item name to catalog attributes
 * (category, subcategory, brand).
 *
 * Order line items live in `orders.items_json` as free text ({name, quantity,
 * price}) with no product_id/category. To power richer analytics we resolve
 * each name in tiers:
 *   1. Match against the live product catalog (exact, then containment) and
 *      inherit its category / subcategory / brand.
 *   2. Fall back to a keyword heuristic for category and a known-brand scan of
 *      the item name for brand.
 *
 * Categories in the catalog: Haircare, Skincare, Makeup, Perfumes, Candles,
 * Body Care, Beauty Tools.
 */

// Strip size tokens (150ml, 50 g, 1l, 12pcs) and punctuation, collapse spaces.
function normalize(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/\b\d+(\.\d+)?\s*(ml|l|g|kg|oz|pcs|pc|pack|x)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

// Ordered keyword rules — first match wins, most specific first.
const KEYWORD_RULES = [
    [/\b(perfume|cologne|parfum|eau de|fragrance|edp|edt)\b/, 'Perfumes'],
    [/\b(body mist|body spray|body lotion|body butter|body cream|shower gel|deodorant|scrub|exfoliat)\b/, 'Body Care'],
    [/\b(lipstick|lip gloss|lip liner|mascara|foundation|concealer|eyeliner|eyeshadow|eye shadow|blush|highlighter|bronzer|makeup|setting powder|primer)\b/, 'Makeup'],
    [/\b(shampoo|conditioner|hair|wig|braid|weave|edge|relaxer|leave[- ]?in|detangl)\b/, 'Haircare'],
    [/\b(candle|wax melt|diffuser|incense)\b/, 'Candles'],
    [/\b(serum|cleanser|moisturi|toner|sunscreen|spf|face cream|skin|acne|retinol|niacinamide|hyaluronic|vitamin c)\b/, 'Skincare'],
    [/\b(brush|sponge|applicator|beauty tool|mirror|tweezer|roller)\b/, 'Beauty Tools'],
    // Generic fragrance leftovers (a plain "mist"/"scent"/"spray" reads as fragrance)
    [/\b(mist|scent|spray)\b/, 'Perfumes']
];

/**
 * Pure keyword heuristic. Returns a category string or null if nothing matched.
 */
function guessCategoryFromName(name) {
    const n = normalize(name);
    if (!n) return null;
    for (const [re, cat] of KEYWORD_RULES) {
        if (re.test(n)) return cat;
    }
    return null;
}

/**
 * Build a resolver bound to the current product catalog.
 * @param {Array<{name:string, category:string, subcategory?:string, brand?:string}>} products
 * @returns {(rawName:string) => {name, category, subcategory, brand, matched}}
 */
function buildCategoryResolver(products) {
    const clean = (v) => (v == null ? '' : String(v).trim());

    const indexed = (products || [])
        .map((p) => ({
            name: p.name,
            category: clean(p.category) || 'Other',
            subcategory: clean(p.subcategory) || null,
            brand: clean(p.brand) || null,
            norm: normalize(p.name)
        }))
        .filter((p) => p.norm.length >= 3)
        // Longest names first so "Argan Oil Shampoo" wins over "Oil".
        .sort((a, b) => b.norm.length - a.norm.length);

    const exact = new Map();
    for (const p of indexed) {
        if (!exact.has(p.norm)) exact.set(p.norm, p);
    }

    // Known brands (normalized) for scanning unmatched item names. Longest first
    // so "tom ford" matches before a hypothetical "tom".
    const brands = [];
    const seenBrand = new Set();
    for (const p of products || []) {
        const b = clean(p.brand);
        const nb = normalize(b);
        if (b && nb.length >= 3 && !seenBrand.has(nb)) {
            seenBrand.add(nb);
            brands.push({ brand: b, norm: nb });
        }
    }
    brands.sort((a, b) => b.norm.length - a.norm.length);

    function detectBrand(itemNorm) {
        if (!itemNorm) return null;
        for (const b of brands) {
            // Word-boundary-ish containment on the normalized (space-delimited) name.
            if ((' ' + itemNorm + ' ').includes(' ' + b.norm + ' ') || itemNorm.includes(b.norm)) {
                return b.brand;
            }
        }
        return null;
    }

    return function resolve(rawName) {
        const n = normalize(rawName);
        if (n) {
            // 1. exact normalized match
            const hit = exact.get(n);
            if (hit) {
                return { name: hit.name, category: hit.category, subcategory: hit.subcategory, brand: hit.brand, matched: true };
            }
            // 2. containment match (require >= 4 chars to avoid spurious hits)
            for (const p of indexed) {
                if (p.norm.length >= 4 && (n.includes(p.norm) || p.norm.includes(n))) {
                    return { name: p.name, category: p.category, subcategory: p.subcategory, brand: p.brand, matched: true };
                }
            }
        }
        // 3. heuristic fallbacks
        return {
            name: String(rawName || 'Unknown').trim() || 'Unknown',
            category: guessCategoryFromName(rawName) || 'Other',
            subcategory: null,
            brand: detectBrand(n),
            matched: false
        };
    };
}

module.exports = { normalize, guessCategoryFromName, buildCategoryResolver };
