/**
 * One-time backfill: shrink oversized images already sitting in /uploads.
 *
 * New uploads are optimized on the way in (utils/optimizeImage.js), but images
 * uploaded before that existed are still full-size. This walks uploads/ and, for
 * anything wider than MAX_WIDTH or heavier than MIN_BYTES, resizes + re-encodes
 * it IN PLACE, keeping the same filename and format so every DB image_url stays
 * valid (no database migration needed).
 *
 * Safety:
 *   - DRY RUN by default: prints what it would do. Pass --apply to write.
 *   - Writes to a temp file first and only replaces the original if the result
 *     is actually smaller, so a file can never grow.
 *   - JPEG/WebP re-encode is lossy (q82/q80); PNG stays lossless (resize only).
 *
 * Usage:
 *   node scripts/backfill-optimize-uploads.js            # dry run (report)
 *   node scripts/backfill-optimize-uploads.js --apply    # actually rewrite
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const UPLOADS = path.resolve(__dirname, '..', 'uploads');
const MAX_WIDTH = 1200;
const MIN_BYTES = 150 * 1024;        // ignore anything already under 150KB
const APPLY = process.argv.includes('--apply');
const KB = n => (n / 1024).toFixed(0) + 'KB';

function walk(dir) {
    const out = [];
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else if (/\.(png|jpe?g|webp)$/i.test(e.name)) out.push(p);
    }
    return out;
}

async function encodeSameFormat(pipeline, ext) {
    if (ext === '.png') return pipeline.png({ compressionLevel: 9 }).toBuffer();       // lossless
    if (ext === '.webp') return pipeline.webp({ quality: 80 }).toBuffer();
    return pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();                    // jpg/jpeg
}

async function run() {
    const files = walk(UPLOADS);
    let scanned = 0, changed = 0, before = 0, after = 0;
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — scanning ${files.length} image(s) in /uploads\n`);

    for (const file of files) {
        const sizeBefore = fs.statSync(file).size;
        let meta;
        try { meta = await sharp(file).metadata(); } catch { continue; }
        scanned++;
        const tooWide = (meta.width || 0) > MAX_WIDTH;
        if (!tooWide && sizeBefore < MIN_BYTES) continue;      // already small enough

        const ext = path.extname(file).toLowerCase();
        let buf;
        try {
            const pipeline = sharp(file).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true });
            buf = await encodeSameFormat(pipeline, ext);
        } catch { continue; }

        if (buf.length >= sizeBefore) continue;                // never grow a file
        before += sizeBefore; after += buf.length; changed++;
        const rel = path.relative(UPLOADS, file);
        console.log(`  ${tooWide ? meta.width + 'px' : 'heavy'}  ${rel}: ${KB(sizeBefore)} -> ${KB(buf.length)}`);

        if (APPLY) {
            const tmp = file + '.tmp';
            fs.writeFileSync(tmp, buf);
            fs.renameSync(tmp, file);                          // atomic replace, same name
        }
    }

    console.log(`\n${changed}/${scanned} image(s) ${APPLY ? 'optimized' : 'would be optimized'}: ` +
        `${KB(before)} -> ${KB(after)} (saves ${KB(before - after)})`);
    if (!APPLY && changed) console.log('Re-run with --apply to write the changes.');
}

run().catch(e => { console.error(e); process.exit(1); });
