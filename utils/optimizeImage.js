/**
 * Image optimization for uploads.
 *
 * Product/hero/gallery images upload straight to /uploads at whatever size and
 * format the admin picked — often 3000px+ phone photos weighing several MB.
 * PageSpeed flagged "improve image delivery" as the single biggest payload win
 * (3.6 MB on desktop). This module resizes every upload down to a sane max width
 * and re-encodes it as WebP, replacing the original file in place so the
 * existing `/uploads/${filename}` URL machinery keeps working unchanged.
 *
 * Fail-open: if sharp throws (corrupt file, unsupported format), we leave the
 * original untouched and keep its filename — an upload must never 500 just
 * because optimization hiccuped.
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const MAX_WIDTH = 1200;     // storefront never displays product images wider than this
const WEBP_QUALITY = 80;

// Resize + convert a freshly-uploaded file to WebP, replacing the original.
// Returns the new basename (e.g. "1699...-42.webp") or, on failure, the original.
async function toOptimizedWebp(filePath) {
    try {
        const dir = path.dirname(filePath);
        const base = path.basename(filePath, path.extname(filePath));
        const outName = base + '.webp';
        const outPath = path.join(dir, outName);
        const buf = await sharp(filePath)
            .rotate()                                                   // honor EXIF orientation
            .resize({ width: MAX_WIDTH, withoutEnlargement: true })
            .webp({ quality: WEBP_QUALITY })
            .toBuffer();
        fs.writeFileSync(outPath, buf);
        if (path.resolve(outPath) !== path.resolve(filePath)) {
            try { fs.unlinkSync(filePath); } catch { /* original already gone */ }
        }
        return outName;
    } catch {
        return path.basename(filePath);                                // fail open
    }
}

// Gather every uploaded file regardless of which multer API produced it:
// upload.single (req.file), upload.array (req.files array), or
// upload.fields (req.files object keyed by field -> array).
function collectFiles(req) {
    if (req.file) return [req.file];
    if (Array.isArray(req.files)) return req.files;
    if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
    return [];
}

// Express middleware: place it directly AFTER the multer middleware. It rewrites
// each file's filename/path/mimetype to the optimized .webp so downstream
// handlers that build `/uploads/${f.filename}` store the optimized URL.
function optimizeUploads(req, res, next) {
    (async () => {
        for (const f of collectFiles(req)) {
            if (!f || !f.path) continue;
            const newName = await toOptimizedWebp(f.path);
            f.filename = newName;
            f.path = path.join(path.dirname(f.path), newName);
            f.mimetype = 'image/webp';
        }
    })().then(() => next()).catch(next);
}

module.exports = { toOptimizedWebp, optimizeUploads, MAX_WIDTH };
