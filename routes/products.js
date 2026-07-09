/**
 * Product Routes
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

const { optimizeUploads } = require('../utils/optimizeImage');

const { asyncHandler } = require('../middleware/errorHandler');
const { requireAdmin } = require('../middleware/auth');
const { productRules, productIdRules, productQueryRules } = require('../validators/product');
const { cacheMiddleware, invalidateCache, TTL } = require('../middleware/cache');
const liveViewers = require('../middleware/liveViewers');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { normalizeDescription } = require('../utils/formatDescription');
const config = require('../config');

module.exports = (db) => {
    // Multer configuration
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, 'uploads/');
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + path.extname(file.originalname));
        }
    });

    const upload = multer({
        storage,
        limits: { fileSize: config.uploadMaxSize },
        fileFilter: (req, file, cb) => {
            const extname = config.uploadAllowedTypes.test(path.extname(file.originalname).toLowerCase());
            const mimetype = config.uploadAllowedTypes.test(file.mimetype);
            if (extname && mimetype) {
                return cb(null, true);
            }
            cb(new Error('Only image files are allowed!'));
        }
    });

    // Get all products with pagination + faceted filters
    router.get('/', productQueryRules, asyncHandler(async (req, res) => {
        const {
            category, subcategory, search, page = 1, limit = 50,
            scent_family, skin_type, hair_texture, brand, wig_origin, wig_cap_type, wig_texture,
            is_local_brand, is_sample, is_authentic, min_price, max_price
        } = req.query;
        const offset = (page - 1) * limit;

        let query = "SELECT *, (SELECT COALESCE(array_agg(pi.image_url ORDER BY pi.sort_order, pi.id), ARRAY[]::text[]) FROM product_images pi WHERE pi.product_id = products.id) AS gallery FROM products WHERE 1=1";
        let countQuery = 'SELECT COUNT(*) as total FROM products WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        // Hide retired/hidden products (e.g. wigs) from the public storefront.
        // Admin passes include_hidden=true to still see and manage them.
        if (req.query.include_hidden !== 'true') {
            query += ' AND (is_hidden IS NOT TRUE)';
            countQuery += ' AND (is_hidden IS NOT TRUE)';
        }

        const addEq = (col, val) => {
            if (val) {
                query += ` AND ${col} = $${paramIndex}`;
                countQuery += ` AND ${col} = $${paramIndex}`;
                params.push(val);
                paramIndex++;
            }
        };
        const addBool = (col, val) => {
            if (val === 'true' || val === 'false') {
                query += ` AND ${col} = $${paramIndex}`;
                countQuery += ` AND ${col} = $${paramIndex}`;
                params.push(val === 'true');
                paramIndex++;
            }
        };
        addEq('category', category);
        addEq('subcategory', subcategory);
        addEq('scent_family', scent_family);
        addEq('skin_type', skin_type);
        addEq('hair_texture', hair_texture);
        addEq('brand', brand);
        addEq('wig_origin', wig_origin);
        addEq('wig_cap_type', wig_cap_type);
        addEq('wig_texture', wig_texture);
        addBool('is_local_brand', is_local_brand);
        addBool('is_sample', is_sample);
        addBool('is_authentic_verified', is_authentic);

        if (min_price) {
            query += ` AND price >= $${paramIndex}`;
            countQuery += ` AND price >= $${paramIndex}`;
            params.push(parseFloat(min_price));
            paramIndex++;
        }
        if (max_price) {
            query += ` AND price <= $${paramIndex}`;
            countQuery += ` AND price <= $${paramIndex}`;
            params.push(parseFloat(max_price));
            paramIndex++;
        }

        if (search) {
            query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex + 1} OR brand ILIKE $${paramIndex + 2})`;
            countQuery += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex + 1} OR brand ILIKE $${paramIndex + 2})`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
            paramIndex += 3;
        }

        // Get total count
        const totalResult = await db.query(countQuery, params);
        const total = parseInt(totalResult.rows[0].total);

        // Get paginated results
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        const products = await db.query(query, [...params, limit, offset]);

        res.json({
            data: products.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    }));

    // Get filter facet options (for sidebar dropdowns)
    router.get('/facets', asyncHandler(async (req, res) => {
        const { category } = req.query;
        const catFilter = category ? 'AND category = $1' : '';
        const params = category ? [category] : [];
        const facetQuery = (col) =>
            `SELECT DISTINCT ${col} AS v FROM products WHERE ${col} IS NOT NULL AND (is_hidden IS NOT TRUE) ${catFilter} ORDER BY 1`;
        const [scents, skins, hairs, brands, origins, caps, textures] = await Promise.all([
            db.query(facetQuery('scent_family'), params),
            db.query(facetQuery('skin_type'),    params),
            db.query(facetQuery('hair_texture'), params),
            db.query(facetQuery('brand'),        params),
            db.query(facetQuery('wig_origin'),   params),
            db.query(facetQuery('wig_cap_type'), params),
            db.query(facetQuery('wig_texture'),  params)
        ]);
        res.json({
            scent_family:  scents.rows.map(r => r.v),
            skin_type:     skins.rows.map(r => r.v),
            hair_texture:  hairs.rows.map(r => r.v),
            brand:         brands.rows.map(r => r.v),
            wig_origin:    origins.rows.map(r => r.v),
            wig_cap_type:  caps.rows.map(r => r.v),
            wig_texture:   textures.rows.map(r => r.v)
        });
    }));

    // Get hero images - optimized query
    router.get('/hero-images', cacheMiddleware('hero', TTL.HERO_IMAGES), asyncHandler(async (req, res) => {
        const categories = ['Perfumes', 'Skincare', 'Haircare', 'Makeup', 'Candles'];

        const heroImages = await db.query(`
            SELECT DISTINCT ON (category) id, name, category, image_url
            FROM products
            WHERE image_url IS NOT NULL AND image_url != '' AND (is_hidden IS NOT TRUE) AND category = ANY($1)
            ORDER BY category, created_at DESC
        `, [categories]);

        const result = heroImages.rows.map(product => ({
            category: product.category,
            image: product.image_url,
            productName: product.name
        }));

        res.json(result);
    }));

    // Lightweight catalog for the receipt builder's product picker:
    // every product's name + price, no pagination, ordered by name.
    router.get('/options', asyncHandler(async (req, res) => {
        const result = await db.query(
            'SELECT id, name, price FROM products ORDER BY name ASC'
        );
        res.json(result.rows);
    }));

    // Shared note-image library list. MUST be before '/:id' or the id matcher
    // captures "note-library" and 422s.
    router.get('/note-library', asyncHandler(async (req, res) => {
        const r = await db.query('SELECT note_name, image_url FROM note_library ORDER BY note_name');
        res.set('Cache-Control', 'no-store');
        res.json({ notes: r.rows });
    }));

    // Get single product (includes shade variants if any)
    router.get('/:id', productIdRules, asyncHandler(async (req, res) => {
        const result = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
        const product = result.rows[0];

        if (!product) {
            throw AppError.notFound('Product not found');
        }

        const variants = await db.query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY id', [req.params.id]);
        product.variants = variants.rows;

        // Gallery: extra angle shots. `gallery` keeps ids (for admin delete/cover);
        // `images` is the flat cover-first list the storefront renders.
        const gallery = await db.query(
            'SELECT id, image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order, id',
            [req.params.id]
        );
        product.gallery = gallery.rows;
        product.images = [product.image_url, ...gallery.rows.map(r => r.image_url)].filter(Boolean);

        // Fragrance notes (top/heart/base), ordered within each tier.
        const notes = await db.query(
            `SELECT n.id, n.tier, n.note_name, COALESCE(NULLIF(n.image_url, ''), l.image_url) AS image_url
             FROM product_notes n LEFT JOIN note_library l ON LOWER(l.note_name) = LOWER(n.note_name)
             WHERE n.product_id = $1 ORDER BY n.sort_order, n.id`,
            [req.params.id]
        );
        product.notes = notes.rows;

        res.json(product);
    }));

    // Live activity for the urgency badge: registers an anonymous heartbeat and
    // returns a blended "X viewing now" count plus a low-stock nudge. No login
    // needed — the client sends an opaque viewer id (falls back to session id).
    router.get('/:id/activity', productIdRules, asyncHandler(async (req, res) => {
        const productId = parseInt(req.params.id, 10);
        const viewerId = (typeof req.query.vid === 'string' && req.query.vid.slice(0, 64)) || req.sessionID || req.ip;
        liveViewers.touch(productId, viewerId);

        const result = await db.query('SELECT stock FROM products WHERE id = $1', [productId]);
        if (result.rows.length === 0) throw AppError.notFound('Product not found');

        res.set('Cache-Control', 'no-store');
        res.json(liveViewers.activity(productId, result.rows[0].stock));
    }));

    // Cover image is field "image" (one); extra angle shots are field "images" (many).
    const productUpload = upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'images', maxCount: 12 }
    ]);
    const coverFile = (req) => (req.files && req.files.image && req.files.image[0]) || null;
    const galleryFiles = (req) => (req.files && req.files.images) || [];

    // Persist a product's fragrance notes. `raw` is the JSON string the admin
    // form sends: [{tier, name, imageUrl}]. Replaces any existing notes for the
    // product. Silently ignores malformed rows so a bad note can't 500 a save.
    const VALID_TIERS = new Set(['top', 'heart', 'base']);
    async function saveNotes(productId, raw) {
        if (raw === undefined || raw === null) return; // field absent -> leave notes untouched
        let list;
        try { list = JSON.parse(raw); } catch { return; }
        if (!Array.isArray(list)) return;

        await db.query('DELETE FROM product_notes WHERE product_id = $1', [productId]);
        let order = 0;
        for (const n of list) {
            const tier = String(n && n.tier || '').toLowerCase();
            const name = String(n && n.name || '').trim().slice(0, 80);
            if (!VALID_TIERS.has(tier) || !name) continue;
            const imageUrl = n.imageUrl ? String(n.imageUrl).slice(0, 500) : null;
            await db.query(
                'INSERT INTO product_notes (product_id, tier, note_name, image_url, sort_order) VALUES ($1,$2,$3,$4,$5)',
                [productId, tier, name, imageUrl, order++]
            );
        }
    }

    // Upload a single ingredient/note image and return its URL. The admin form
    // uploads note images as they're picked, then references the returned URL in
    // the product's notes JSON on save (keeps the product save free of per-note
    // multipart matching).
    router.post('/note-image', requireAdmin, upload.single('image'), optimizeUploads, asyncHandler(async (req, res) => {
        if (!req.file) throw AppError.badRequest('No image uploaded');
        res.json({ url: `/uploads/${req.file.filename}` });
    }));

    // Shared note-image library. POST uploads/updates the image for a note name
    // (upsert), so you only ever upload each ingredient once. (The GET list route
    // is registered above /:id so it isn't shadowed by the id matcher.)
    router.post('/note-library', requireAdmin, upload.single('image'), optimizeUploads, asyncHandler(async (req, res) => {
        const name = String(req.body.noteName || '').trim().slice(0, 80);
        if (!name) throw AppError.badRequest('Note name is required');
        if (!req.file) throw AppError.badRequest('No image uploaded');
        const imageUrl = `/uploads/${req.file.filename}`;
        await db.query(
            `INSERT INTO note_library (note_name, image_url) VALUES ($1, $2)
             ON CONFLICT (note_name) DO UPDATE SET image_url = EXCLUDED.image_url`,
            [name, imageUrl]
        );
        res.json({ note_name: name, image_url: imageUrl });
    }));

    // Add product (admin only)
    router.post('/', requireAdmin, productUpload, optimizeUploads, invalidateCache('products'), productRules, asyncHandler(async (req, res) => {
        const {
            name, description, price, originalPrice, discount, category, subcategory, stock, costPrice,
            wigTexture, wigCapType, wigOrigin, wigDensity,
            brand, isLocalBrand, scentFamily, skinType, hairTexture, ingredients, allergens,
            isAuthenticVerified, isSample, size
        } = req.body;
        const cover = coverFile(req);
        const extras = galleryFiles(req);
        // No dedicated cover uploaded? Use the first gallery shot as the cover.
        const coverName = cover ? cover.filename : (extras[0] && extras[0].filename) || null;
        const image_url = coverName ? `/uploads/${coverName}` : null;

        const result = await db.query(`
            INSERT INTO products (
                name, description, price, original_price, discount, category, image_url, stock, cost_price,
                wig_texture, wig_cap_type, wig_origin, wig_density,
                brand, is_local_brand, scent_family, skin_type, hair_texture, ingredients, allergens,
                is_authentic_verified, is_sample, size, subcategory
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
            RETURNING id
        `, [
            name, normalizeDescription(description), price, originalPrice || null, discount || 0, category, image_url, stock || 0, costPrice || 0,
            wigTexture || null, wigCapType || null, wigOrigin || null, wigDensity || null,
            brand || null, !!isLocalBrand, scentFamily || null, skinType || null, hairTexture || null, ingredients || null, allergens || null,
            !!isAuthenticVerified, !!isSample, size || null, subcategory || null
        ]);

        const newId = result.rows[0].id;

        // Gallery = the extra shots. If there was no dedicated cover, the first
        // extra became the cover above, so skip it here.
        const galleryStart = cover ? 0 : 1;
        for (let i = galleryStart; i < extras.length; i++) {
            await db.query(
                'INSERT INTO product_images (product_id, image_url, sort_order) VALUES ($1, $2, $3)',
                [newId, `/uploads/${extras[i].filename}`, i]
            );
        }

        await saveNotes(newId, req.body.notes);

        logger.info('Product created', { productId: newId, name, category, gallery: Math.max(0, extras.length - galleryStart) });

        res.json({ success: true, productId: newId });
    }));

    // Update product (admin only)
    router.put('/:id', requireAdmin, productUpload, optimizeUploads, invalidateCache('products'), productIdRules, productRules, asyncHandler(async (req, res) => {
        const {
            name, description, price, originalPrice, discount, category, subcategory, stock, costPrice,
            wigTexture, wigCapType, wigOrigin, wigDensity,
            brand, isLocalBrand, scentFamily, skinType, hairTexture, ingredients, allergens,
            isAuthenticVerified, isSample, size
        } = req.body;
        const productId = req.params.id;

        // Check product exists
        const existing = await db.query('SELECT id FROM products WHERE id = $1', [productId]);
        if (existing.rows.length === 0) {
            throw AppError.notFound('Product not found');
        }

        const setBase = `
            name = $1, description = $2, price = $3, original_price = $4,
            discount = $5, category = $6, stock = $7, cost_price = $8,
            wig_texture = $9, wig_cap_type = $10, wig_origin = $11, wig_density = $12,
            brand = $13, is_local_brand = $14, scent_family = $15, skin_type = $16,
            hair_texture = $17, ingredients = $18, allergens = $19,
            is_authentic_verified = $20, is_sample = $21, size = $22, subcategory = $23
        `;
        const baseParams = [
            name, normalizeDescription(description), price, originalPrice || null, discount || 0, category, stock || 0, costPrice || 0,
            wigTexture || null, wigCapType || null, wigOrigin || null, wigDensity || null,
            brand || null, !!isLocalBrand, scentFamily || null, skinType || null,
            hairTexture || null, ingredients || null, allergens || null,
            !!isAuthenticVerified, !!isSample, size || null, subcategory || null
        ];

        const cover = coverFile(req);
        const extras = galleryFiles(req);

        let query, params;
        if (cover) {
            query = `UPDATE products SET ${setBase}, image_url = $24 WHERE id = $25`;
            params = [...baseParams, `/uploads/${cover.filename}`, productId];
        } else {
            query = `UPDATE products SET ${setBase} WHERE id = $24`;
            params = [...baseParams, productId];
        }

        await db.query(query, params);

        // Append any newly uploaded angle shots to the gallery (after existing ones).
        if (extras.length) {
            const max = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS m FROM product_images WHERE product_id = $1', [productId]);
            let order = parseInt(max.rows[0].m, 10) || 0;
            for (const f of extras) {
                order += 1;
                await db.query(
                    'INSERT INTO product_images (product_id, image_url, sort_order) VALUES ($1, $2, $3)',
                    [productId, `/uploads/${f.filename}`, order]
                );
            }
        }

        await saveNotes(productId, req.body.notes);

        logger.info('Product updated', { productId, name, addedImages: extras.length });

        res.json({ success: true });
    }));

    // Delete a gallery image (admin only)
    router.delete('/:id/images/:imageId', requireAdmin, invalidateCache('products'), asyncHandler(async (req, res) => {
        const result = await db.query(
            'DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING id',
            [req.params.imageId, req.params.id]
        );
        if (result.rows.length === 0) throw AppError.notFound('Image not found');
        res.json({ success: true });
    }));

    // Promote a gallery image to cover (admin only): the old cover drops into the gallery.
    router.put('/:id/images/:imageId/cover', requireAdmin, invalidateCache('products'), asyncHandler(async (req, res) => {
        const productId = req.params.id;
        const prod = await db.query('SELECT image_url FROM products WHERE id = $1', [productId]);
        if (prod.rows.length === 0) throw AppError.notFound('Product not found');
        const img = await db.query('SELECT image_url FROM product_images WHERE id = $1 AND product_id = $2', [req.params.imageId, productId]);
        if (img.rows.length === 0) throw AppError.notFound('Image not found');

        const oldCover = prod.rows[0].image_url;
        const newCover = img.rows[0].image_url;
        if (oldCover) {
            // Swap: the old cover takes this gallery slot, the new cover is promoted.
            await db.query('UPDATE product_images SET image_url = $1 WHERE id = $2', [oldCover, req.params.imageId]);
        } else {
            // No prior cover — just consume the gallery row.
            await db.query('DELETE FROM product_images WHERE id = $1', [req.params.imageId]);
        }
        await db.query('UPDATE products SET image_url = $1 WHERE id = $2', [newCover, productId]);
        res.json({ success: true });
    }));

    // Delete product (admin only)
    router.delete('/:id', requireAdmin, invalidateCache('products'), productIdRules, asyncHandler(async (req, res) => {
        const productId = req.params.id;

        const existing = await db.query('SELECT id FROM products WHERE id = $1', [productId]);
        if (existing.rows.length === 0) {
            throw AppError.notFound('Product not found');
        }

        // Products that appear in real orders are kept for order history.
        const ordered = await db.query('SELECT 1 FROM order_items WHERE product_id = $1 LIMIT 1', [productId]);
        if (ordered.rows.length) {
            throw AppError.badRequest('This product is part of existing orders, so it cannot be deleted. Set its stock to 0 to hide it from the store instead.');
        }

        // reviews.product_id has no ON DELETE CASCADE, so it blocks deletion.
        // Remove the product's reviews first; cart, wishlist, images and variants
        // all cascade automatically.
        await db.query('DELETE FROM reviews WHERE product_id = $1', [productId]);
        await db.query('DELETE FROM products WHERE id = $1', [productId]);

        logger.info('Product deleted', { productId });

        res.json({ success: true });
    }));

    return router;
};
