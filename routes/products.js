/**
 * Product Routes
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { requireAdmin } = require('../middleware/auth');
const { productRules, productIdRules, productQueryRules } = require('../validators/product');
const { cacheMiddleware, invalidateCache, TTL } = require('../middleware/cache');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
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
            category, search, page = 1, limit = 50,
            scent_family, skin_type, hair_texture, brand, wig_origin, wig_cap_type, wig_texture,
            is_local_brand, is_sample, is_authentic, min_price, max_price
        } = req.query;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM products WHERE 1=1';
        let countQuery = 'SELECT COUNT(*) as total FROM products WHERE 1=1';
        const params = [];
        let paramIndex = 1;

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
            `SELECT DISTINCT ${col} AS v FROM products WHERE ${col} IS NOT NULL ${catFilter} ORDER BY 1`;
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
        const categories = ['Perfumes', 'Women\'s Skincare', 'Men\'s Skincare', 'Makeup', 'Fragrances', 'Wigs'];

        const heroImages = await db.query(`
            SELECT DISTINCT ON (category) id, name, category, image_url
            FROM products
            WHERE image_url IS NOT NULL AND image_url != '' AND category = ANY($1)
            ORDER BY category, created_at DESC
        `, [categories]);

        const result = heroImages.rows.map(product => ({
            category: product.category,
            image: product.image_url,
            productName: product.name
        }));

        res.json(result);
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

        res.json(product);
    }));

    // Add product (admin only)
    router.post('/', requireAdmin, upload.single('image'), invalidateCache('products'), productRules, asyncHandler(async (req, res) => {
        const {
            name, description, price, originalPrice, discount, category, stock, costPrice,
            wigTexture, wigCapType, wigOrigin, wigDensity,
            brand, isLocalBrand, scentFamily, skinType, hairTexture, ingredients, allergens,
            isAuthenticVerified, isSample, size
        } = req.body;
        const image_url = req.file ? `/uploads/${req.file.filename}` : null;

        const result = await db.query(`
            INSERT INTO products (
                name, description, price, original_price, discount, category, image_url, stock, cost_price,
                wig_texture, wig_cap_type, wig_origin, wig_density,
                brand, is_local_brand, scent_family, skin_type, hair_texture, ingredients, allergens,
                is_authentic_verified, is_sample, size
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
            RETURNING id
        `, [
            name, description, price, originalPrice || null, discount || 0, category, image_url, stock || 0, costPrice || 0,
            wigTexture || null, wigCapType || null, wigOrigin || null, wigDensity || null,
            brand || null, !!isLocalBrand, scentFamily || null, skinType || null, hairTexture || null, ingredients || null, allergens || null,
            !!isAuthenticVerified, !!isSample, size || null
        ]);

        logger.info('Product created', { productId: result.rows[0].id, name, category });

        res.json({ success: true, productId: result.rows[0].id });
    }));

    // Update product (admin only)
    router.put('/:id', requireAdmin, upload.single('image'), invalidateCache('products'), productIdRules, productRules, asyncHandler(async (req, res) => {
        const {
            name, description, price, originalPrice, discount, category, stock, costPrice,
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
            is_authentic_verified = $20, is_sample = $21, size = $22
        `;
        const baseParams = [
            name, description, price, originalPrice || null, discount || 0, category, stock || 0, costPrice || 0,
            wigTexture || null, wigCapType || null, wigOrigin || null, wigDensity || null,
            brand || null, !!isLocalBrand, scentFamily || null, skinType || null,
            hairTexture || null, ingredients || null, allergens || null,
            !!isAuthenticVerified, !!isSample, size || null
        ];

        let query, params;
        if (req.file) {
            query = `UPDATE products SET ${setBase}, image_url = $23 WHERE id = $24`;
            params = [...baseParams, `/uploads/${req.file.filename}`, productId];
        } else {
            query = `UPDATE products SET ${setBase} WHERE id = $23`;
            params = [...baseParams, productId];
        }

        await db.query(query, params);

        logger.info('Product updated', { productId, name });

        res.json({ success: true });
    }));

    // Delete product (admin only)
    router.delete('/:id', requireAdmin, invalidateCache('products'), productIdRules, asyncHandler(async (req, res) => {
        const productId = req.params.id;

        const existing = await db.query('SELECT id FROM products WHERE id = $1', [productId]);
        if (existing.rows.length === 0) {
            throw AppError.notFound('Product not found');
        }

        await db.query('DELETE FROM products WHERE id = $1', [productId]);

        logger.info('Product deleted', { productId });

        res.json({ success: true });
    }));

    return router;
};
