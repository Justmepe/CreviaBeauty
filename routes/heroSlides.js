/**
 * Hero Slides Routes
 * Public GET for the homepage carousel; admin CRUD under /api/admin/hero-slides.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');

const { asyncHandler } = require('../middleware/errorHandler');
const { requireAdmin } = require('../middleware/auth');
const AppError = require('../utils/AppError');
const config = require('../config');
const { optimizeUploads } = require('../utils/optimizeImage');

module.exports = (db) => {
    const publicRouter = express.Router();
    const adminRouter = express.Router();

    // Multer (mirrors the product upload config)
    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, 'uploads/'),
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(null, 'hero-' + uniqueSuffix + path.extname(file.originalname));
        }
    });
    const upload = multer({
        storage,
        limits: { fileSize: config.uploadMaxSize },
        fileFilter: (req, file, cb) => {
            const extname = config.uploadAllowedTypes.test(path.extname(file.originalname).toLowerCase());
            const mimetype = config.uploadAllowedTypes.test(file.mimetype);
            if (extname && mimetype) return cb(null, true);
            cb(new Error('Only image files are allowed'));
        }
    });

    // ============ PUBLIC ============

    // GET /api/hero-slides — active slides ordered by display_order
    publicRouter.get('/', asyncHandler(async (req, res) => {
        const result = await db.query(`
            SELECT id, category, image_url, badge, title_prefix, title_highlight, title_suffix,
                   description, link_text, extra_link_url, extra_link_text, display_order
            FROM hero_slides
            WHERE is_active = TRUE
            ORDER BY display_order ASC, id ASC
        `);
        res.json(result.rows);
    }));

    // ============ ADMIN ============

    adminRouter.use(requireAdmin);

    // GET /api/admin/hero-slides — all slides (incl. inactive)
    adminRouter.get('/', asyncHandler(async (req, res) => {
        const result = await db.query(`
            SELECT * FROM hero_slides
            ORDER BY display_order ASC, id ASC
        `);
        res.json(result.rows);
    }));

    // GET /api/admin/hero-slides/:id
    adminRouter.get('/:id', asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) throw AppError.badRequest('Invalid slide ID');

        const result = await db.query('SELECT * FROM hero_slides WHERE id = $1', [id]);
        if (!result.rows[0]) throw AppError.notFound('Slide not found');
        res.json(result.rows[0]);
    }));

    // Helpers for create/update — parse + validate body, return the resolved field values
    function parseSlideBody(body, fileFilename, existingImageUrl) {
        const titlePrefix = (body.title_prefix || '').trim();
        const linkText = (body.link_text || '').trim();
        const category = (body.category || '').trim();

        if (!titlePrefix) throw AppError.badRequest('Title prefix is required');
        if (!linkText) throw AppError.badRequest('Link text is required');
        if (!category) throw AppError.badRequest('Category is required');

        const imageUrlField = (body.image_url || '').trim();
        const imageUrl = fileFilename ? `/uploads/${fileFilename}` : (imageUrlField || existingImageUrl);
        if (!imageUrl) throw AppError.badRequest('Image is required (upload a file or provide a URL)');

        const displayOrderRaw = body.display_order;
        const displayOrder = displayOrderRaw === undefined || displayOrderRaw === '' ? 0 : parseInt(displayOrderRaw, 10);
        if (isNaN(displayOrder)) throw AppError.badRequest('Display order must be a number');

        // is_active arrives as 'true'/'false' string from multipart forms or boolean from JSON
        const isActiveRaw = body.is_active;
        const isActive = isActiveRaw === undefined || isActiveRaw === ''
            ? true
            : (isActiveRaw === true || isActiveRaw === 'true' || isActiveRaw === '1' || isActiveRaw === 'on');

        return {
            category,
            image_url: imageUrl,
            badge: (body.badge || '').trim() || null,
            title_prefix: titlePrefix,
            title_highlight: (body.title_highlight || '').trim() || null,
            title_suffix: (body.title_suffix || '').trim() || null,
            description: (body.description || '').trim() || null,
            link_text: linkText,
            extra_link_url: (body.extra_link_url || '').trim() || null,
            extra_link_text: (body.extra_link_text || '').trim() || null,
            display_order: displayOrder,
            is_active: isActive
        };
    }

    // POST /api/admin/hero-slides — create
    adminRouter.post('/', upload.single('image'), optimizeUploads, asyncHandler(async (req, res) => {
        const s = parseSlideBody(req.body, req.file && req.file.filename, null);
        const result = await db.query(`
            INSERT INTO hero_slides
                (category, image_url, badge, title_prefix, title_highlight, title_suffix,
                 description, link_text, extra_link_url, extra_link_text, display_order, is_active)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING *
        `, [s.category, s.image_url, s.badge, s.title_prefix, s.title_highlight, s.title_suffix,
            s.description, s.link_text, s.extra_link_url, s.extra_link_text, s.display_order, s.is_active]);
        res.json({ success: true, slide: result.rows[0] });
    }));

    // PUT /api/admin/hero-slides/:id — update
    adminRouter.put('/:id', upload.single('image'), optimizeUploads, asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) throw AppError.badRequest('Invalid slide ID');

        const existing = await db.query('SELECT image_url FROM hero_slides WHERE id = $1', [id]);
        if (!existing.rows[0]) throw AppError.notFound('Slide not found');

        const s = parseSlideBody(req.body, req.file && req.file.filename, existing.rows[0].image_url);
        const result = await db.query(`
            UPDATE hero_slides
            SET category = $1, image_url = $2, badge = $3, title_prefix = $4,
                title_highlight = $5, title_suffix = $6, description = $7, link_text = $8,
                extra_link_url = $9, extra_link_text = $10, display_order = $11, is_active = $12,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $13
            RETURNING *
        `, [s.category, s.image_url, s.badge, s.title_prefix, s.title_highlight, s.title_suffix,
            s.description, s.link_text, s.extra_link_url, s.extra_link_text, s.display_order, s.is_active, id]);
        res.json({ success: true, slide: result.rows[0] });
    }));

    // DELETE /api/admin/hero-slides/:id
    adminRouter.delete('/:id', asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) throw AppError.badRequest('Invalid slide ID');

        const result = await db.query('DELETE FROM hero_slides WHERE id = $1 RETURNING id', [id]);
        if (!result.rows[0]) throw AppError.notFound('Slide not found');
        res.json({ success: true });
    }));

    return { public: publicRouter, admin: adminRouter };
};
