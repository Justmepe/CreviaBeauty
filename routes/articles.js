/**
 * Articles Routes — the Content Studio engine
 *
 * The publishing loop (no Claude API key needed):
 *   1. Admin generates a research+writing prompt  (POST /api/admin/articles/prompt)
 *   2. Admin pastes the prompt into claude.ai chat and copies the JSON response
 *   3. Admin pastes the response back (POST /api/admin/articles/publish) — or uploads
 *      the .docx downloaded from claude.ai (POST /api/admin/articles/import)
 *   4. The engine extracts + validates the JSON and publishes the article live at /blog/<slug>,
 *      with carousel slides stored alongside for PNG/PDF export in the admin.
 *
 * Public GET endpoints feed /blog and /blog/:slug.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');

const { asyncHandler } = require('../middleware/errorHandler');
const { requireAdmin } = require('../middleware/auth');
const AppError = require('../utils/AppError');

// ============ HELPERS ============

function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 140);
}

function truncate(text, max) {
    const s = String(text || '').trim();
    return s.length <= max ? s : s.substring(0, max - 1).trimEnd() + '…';
}

/**
 * House style: no em dashes anywhere in published content.
 * " — " becomes ", "; bare "—" becomes ", ". Applied recursively
 * to every string in the normalized article.
 */
function stripEmDashes(value) {
    if (typeof value === 'string') {
        return value.replace(/\s*—\s*/g, ', ').replace(/\s+,/g, ',');
    }
    if (Array.isArray(value)) return value.map(stripEmDashes);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value)) out[key] = stripEmDashes(value[key]);
        return out;
    }
    return value;
}

/**
 * Pull a JSON object out of pasted chat output / docx text.
 * Tolerates surrounding prose, ```json fences, and curly quotes
 * introduced by word processors.
 */
function extractJson(raw) {
    const text = String(raw || '');
    const candidates = [];

    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) candidates.push(fence[1]);

    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) candidates.push(text.substring(first, last + 1));

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch (e) {
            // Word/docx round-trips often replace straight quotes with curly ones
            try {
                return JSON.parse(candidate.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'"));
            } catch (e2) { /* try next candidate */ }
        }
    }
    return null;
}

/**
 * Validate + normalize the JSON contract Claude returns into article fields.
 * Lenient where possible — the loop should publish, not nag.
 */
function normalizeArticle(payload) {
    if (!payload || typeof payload !== 'object') {
        throw AppError.badRequest('Could not find a JSON object in the pasted content. Paste Claude\'s full response, including the JSON block.');
    }

    const title = String(payload.title || payload.headline || '').trim();
    if (!title) throw AppError.badRequest('The JSON is missing a "title".');

    // Sections: accept {heading, paragraphs[]}, {heading, body}, or plain strings
    const rawSections = Array.isArray(payload.sections) ? payload.sections : [];
    const sections = rawSections.map((s) => {
        if (typeof s === 'string') return { heading: '', paragraphs: [s] };
        const paragraphs = Array.isArray(s.paragraphs) ? s.paragraphs
            : (typeof s.paragraphs === 'string' && s.paragraphs.trim()) ? [s.paragraphs]
            : (typeof s.body === 'string' && s.body.trim()) ? [s.body]
            : [];
        return {
            heading: String(s.heading || s.title || '').trim(),
            paragraphs: paragraphs.map(p => String(p).trim()).filter(Boolean)
        };
    }).filter(s => s.heading || s.paragraphs.length);

    const intro = String(payload.intro || payload.intro_text || '').trim();
    if (!intro && sections.length === 0) {
        throw AppError.badRequest('The JSON has no "intro" and no "sections" — there is nothing to publish.');
    }

    // Carousel slides: {heading, body} (accept {title, text} variants)
    const rawCarousel = Array.isArray(payload.carousel) ? payload.carousel
        : (payload.carousel && Array.isArray(payload.carousel.slides)) ? payload.carousel.slides : [];
    const carousel = rawCarousel.slice(0, 10).map(s => ({
        heading: String((s && (s.heading || s.title)) || '').trim(),
        body: String((s && (s.body || s.text || s.content)) || '').trim()
    })).filter(s => s.heading || s.body);

    const tags = Array.isArray(payload.tags) ? payload.tags.map(t => String(t).trim()).filter(Boolean).join(',')
        : String(payload.tags || '').trim();

    let ctaLink = String(payload.cta_link || payload.product_link || '').trim();
    // Normalize absolute creviabeauty.com URLs to site-relative paths
    ctaLink = ctaLink.replace(/^https?:\/\/(www\.)?creviabeauty\.com/i, '');
    if (ctaLink && !/^(\/|https?:\/\/)/i.test(ctaLink)) ctaLink = '/' + ctaLink;

    let heroImage = String(payload.hero_image_url || payload.hero_image || '').trim();
    if (heroImage && !/^(\/uploads\/|https?:\/\/)/i.test(heroImage)) heroImage = '';

    const rawSocial = (payload.social && typeof payload.social === 'object') ? payload.social : {};
    const social = {
        dm_keyword: String(rawSocial.dm_keyword || '').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 15),
        caption: String(rawSocial.caption || '').trim(),
        first_comment: String(rawSocial.first_comment || '').trim(),
        dm_reply: String(rawSocial.dm_reply || '').trim(),
        lead_followup: String(rawSocial.lead_followup || '').trim()
    };

    return stripEmDashes({
        slug: slugify(payload.slug) || slugify(title),
        title: truncate(title, 255),
        category: truncate(payload.category || 'Beauty', 100),
        hero_image_url: heroImage || null,
        intro: intro || sections[0].paragraphs[0] || '',
        meta_title: truncate(payload.meta_title || title, 70),
        meta_description: truncate(payload.meta_description || intro, 160),
        tags: truncate(tags, 300) || null,
        content: {
            sections,
            cta_text: String(payload.cta_text || '').trim(),
            cta_link: ctaLink,
            carousel,
            social
        }
    });
}

/**
 * Fill any social-pack fields Claude didn't provide, using the final slug.
 * The pack powers the comment-to-DM funnel: caption on the post, the link as
 * first comment, and the reply to send when someone comments the keyword.
 */
function completeSocialPack(article) {
    const social = article.content.social;
    const articleUrl = `https://creviabeauty.com/blog/${article.slug}`;
    if (!social.dm_keyword) social.dm_keyword = 'GUIDE';
    if (!social.caption) {
        social.caption = `${article.title}\n\n${article.intro}\n\nSwipe for the full breakdown 👉\n\n💬 Comment "${social.dm_keyword}" and we'll DM you the full guide.\n\n#CreviaBeauty #NairobiBeauty #KenyanBeauty`;
    }
    if (!social.first_comment) {
        social.first_comment = `The full guide, free → ${articleUrl}`;
    }
    if (!social.dm_reply) {
        social.dm_reply = `Here's the full guide 👇\n${articleUrl}\n\nAnything specific you're struggling with? Reply here, we read everything. 💛`;
    }
    if (!social.lead_followup) {
        social.lead_followup = `So glad that helped! 💛 Two quick things:\n\n1) Want every new guide the moment it drops? Reply with your email or WhatsApp number and we'll send them to you first. No spam, just the good stuff.\n\n2) What's the ONE beauty problem you're fighting right now? We research and write these guides from real questions like yours.`;
    }
}

/** Resolve slug collisions by appending -2, -3, ... */
async function uniqueSlug(db, slug) {
    let candidate = slug;
    for (let i = 2; i < 50; i++) {
        const existing = await db.query('SELECT id FROM articles WHERE slug = $1', [candidate]);
        if (existing.rows.length === 0) return candidate;
        candidate = `${slug}-${i}`;
    }
    throw AppError.badRequest('Could not generate a unique slug for this article');
}

function buildPrompt({ topic, pillar, product, audienceNotes }) {
    const productBlock = product ? `
PRODUCT TIE-IN (use as the soft CTA — frame it as the solution already discussed, never as a sales pitch):
- Name: ${product.name}
- Category: ${product.category || '-'}
- Price: KES ${Number(product.price).toLocaleString()}
- Description: ${product.description || '-'}
- Product link (use as cta_link): /products?search=${encodeURIComponent(product.name)}
- Product image (use as hero_image_url): ${product.image_url || '(none — omit hero_image_url)'}` : `
PRODUCT TIE-IN: none specified — end with a soft CTA to /products and omit hero_image_url.`;

    return `You are a senior beauty content strategist and direct-response copywriter for Crevia Beauty, a premium online beauty store in Nairobi, Kenya (creviabeauty.com). You write in the style of Alex Hormozi's $100M Offers framework: identify a real pain point, agitate why it happens, deliver a real solution, and paint the dream outcome — then connect it naturally to a product. Never pushy, never salesy. Audience: Kenyan beauty lovers; prices in KES; warm, direct, no fluff.

FIRST, research this topic thoroughly (use web search if available to you): current techniques, common mistakes, trending angles, and what people actually struggle with.

TOPIC: ${topic}
CONTENT PILLAR: ${pillar}${audienceNotes ? `\nEXTRA CONTEXT FROM THE TEAM: ${audienceNotes}` : ''}
${productBlock}

THEN write one complete blog article AND a social media carousel, and return them as ONE JSON object — no commentary before or after, no markdown outside the JSON, exactly this shape:

{
  "type": "crevia-article",
  "title": "Headline that names the pain point or trend in relatable language",
  "slug": "short-kebab-case-keyword-slug",
  "category": "${pillar}",
  "meta_title": "Under 60 characters, main keyword + pain point",
  "meta_description": "Under 155 characters, summarizes the solution with a soft call to action",
  "tags": ["3-5", "seo", "tags"],
  "hero_image_url": "the product image URL given above, or omit this field",
  "intro": "One paragraph naming the pain and how it shows up day to day",
  "sections": [
    { "heading": "The Problem", "paragraphs": ["Why this happens — 2-3 paragraphs of real explanation"] },
    { "heading": "The Fix", "paragraphs": ["Step-by-step guidance the reader can act on today"] },
    { "heading": "The Result", "paragraphs": ["Paint the picture of life after the fix"] }
  ],
  "cta_text": "1-2 sentences. Use language like 'This is exactly why we stock...' or 'If you want this result, start with...'",
  "cta_link": "the product link given above",
  "carousel": [
    { "heading": "Hook — the pain point as a scroll-stopper", "body": "1-2 short lines" },
    { "heading": "The real reason this happens", "body": "1-2 short lines" },
    { "heading": "Fix step 1", "body": "1-2 short lines" },
    { "heading": "Fix step 2", "body": "1-2 short lines" },
    { "heading": "Fix step 3", "body": "1-2 short lines" },
    { "heading": "The result you actually want", "body": "1-2 short lines" },
    { "heading": "Want the full guide?", "body": "Comment the keyword below and we'll DM you the full guide. @creviabeauty" }
  ],
  "social": {
    "dm_keyword": "ONE short uppercase word people comment to get the link, e.g. GLOW",
    "caption": "The carousel post caption: hook, 2-3 lines of value, then 'Comment <keyword> and we'll DM you the full guide.' End with 3-4 hashtags for Kenyan beauty.",
    "first_comment": "One line with the article link placeholder: The full guide, free → https://creviabeauty.com/blog/<slug>",
    "dm_reply": "The DM to send when someone comments the keyword: warm, link to the article, one engagement question.",
    "lead_followup": "The second DM, sent after they open the link: ask for their email or WhatsApp number to get future guides first, and ask the one beauty problem they want solved next. Warm, zero pressure."
  }
}

RULES:
- paragraphs are plain text only: no HTML, no markdown.
- NEVER use em dashes (—) anywhere. Use commas, periods, or colons instead.
- Keep carousel slide text short enough to read on a phone (heading ≤ 8 words, body ≤ 30 words).
- British/Kenyan English. Prices in KES where relevant.
- Return ONLY the JSON object.`;
}

// ============ ROUTERS ============

module.exports = (db) => {
    const publicRouter = express.Router();
    const adminRouter = express.Router();

    // Docx uploads stay in memory — they're parsed, never stored
    const docxUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            if (path.extname(file.originalname).toLowerCase() === '.docx') return cb(null, true);
            cb(new Error('Only .docx files are allowed'));
        }
    });

    // ============ PUBLIC ============

    // GET /api/articles — published articles, newest first
    publicRouter.get('/', asyncHandler(async (req, res) => {
        const result = await db.query(`
            SELECT slug, title, category, hero_image_url, intro, tags, published_at
            FROM articles
            WHERE status = 'published'
            ORDER BY published_at DESC, id DESC
        `);
        res.json(result.rows);
    }));

    // GET /api/articles/:slug — single published article
    publicRouter.get('/:slug', asyncHandler(async (req, res) => {
        const result = await db.query(
            `SELECT slug, title, category, hero_image_url, intro, meta_title, meta_description, tags, content, published_at
             FROM articles WHERE slug = $1 AND status = 'published'`,
            [req.params.slug]
        );
        if (!result.rows[0]) throw AppError.notFound('Article not found');
        res.json(result.rows[0]);
    }));

    // ============ ADMIN ============

    adminRouter.use(requireAdmin);

    // GET /api/admin/articles — all articles incl. unpublished
    adminRouter.get('/', asyncHandler(async (req, res) => {
        const result = await db.query(`
            SELECT id, slug, title, category, status, hero_image_url, intro,
                   (content->'carousel') AS carousel,
                   (content->'social') AS social,
                   published_at, created_at
            FROM articles ORDER BY created_at DESC
        `);
        res.json(result.rows);
    }));

    // The Python research engine (engine/research.py) drops finished prompts here.
    // The admin Prompt Inbox reads them so nothing has to be generated by hand.
    const ENGINE_OUTPUT_DIR = path.resolve(__dirname, '..', 'engine', 'output');

    const ENGINE_DONE_DIR = path.join(ENGINE_OUTPUT_DIR, 'done');

    function listPromptFiles(dir, status, withContent) {
        try {
            return fs.readdirSync(dir)
                .filter(f => f.endsWith('-prompt.txt'))
                .map(f => {
                    const full = path.join(dir, f);
                    return {
                        name: f,
                        topic: f.replace(/-prompt\.txt$/, '').replace(/-/g, ' '),
                        status,
                        modified: fs.statSync(full).mtime,
                        content: withContent ? fs.readFileSync(full, 'utf8') : undefined
                    };
                })
                .sort((a, b) => b.modified - a.modified);
        } catch (e) {
            return []; // dir doesn't exist until the research engine first runs
        }
    }

    // GET /api/admin/articles/inbox — pending prompts first, then recently completed
    adminRouter.get('/inbox', asyncHandler(async (req, res) => {
        const pending = listPromptFiles(ENGINE_OUTPUT_DIR, 'pending', true);
        const done = listPromptFiles(ENGINE_DONE_DIR, 'done', false).slice(0, 10);
        res.json([...pending, ...done]);
    }));

    // POST /api/admin/articles/inbox/:name/done — archive a prompt once its response is processed
    adminRouter.post('/inbox/:name/done', asyncHandler(async (req, res) => {
        const name = path.basename(req.params.name);
        if (!name.endsWith('-prompt.txt')) throw AppError.badRequest('Invalid prompt file');
        const from = path.join(ENGINE_OUTPUT_DIR, name);
        if (!fs.existsSync(from)) throw AppError.notFound('Prompt not found');
        fs.mkdirSync(ENGINE_DONE_DIR, { recursive: true });
        fs.renameSync(from, path.join(ENGINE_DONE_DIR, name));
        res.json({ success: true });
    }));

    // DELETE /api/admin/articles/inbox/:name — discard a prompt (pending or done)
    adminRouter.delete('/inbox/:name', asyncHandler(async (req, res) => {
        const name = path.basename(req.params.name);
        if (!name.endsWith('-prompt.txt')) throw AppError.badRequest('Invalid prompt file');
        const pendingPath = path.join(ENGINE_OUTPUT_DIR, name);
        const donePath = path.join(ENGINE_DONE_DIR, name);
        const full = fs.existsSync(pendingPath) ? pendingPath : donePath;
        if (!fs.existsSync(full)) throw AppError.notFound('Prompt not found');
        fs.unlinkSync(full);
        res.json({ success: true });
    }));

    // POST /api/admin/articles/prompt — build the prompt to paste into claude.ai.
    // Saves into the Prompt Inbox so custom prompts share the same
    // Copy → Inject → Done lifecycle as engine-researched ones.
    adminRouter.post('/prompt', asyncHandler(async (req, res) => {
        const topic = String(req.body.topic || '').trim();
        if (!topic) throw AppError.badRequest('Topic is required');
        const pillar = String(req.body.pillar || 'Problem-Solving & Education').trim();
        const audienceNotes = String(req.body.notes || '').trim();

        let product = null;
        const productId = parseInt(req.body.product_id, 10);
        if (!isNaN(productId)) {
            const result = await db.query(
                'SELECT name, category, price, description, image_url FROM products WHERE id = $1', [productId]
            );
            product = result.rows[0] || null;
        }

        const prompt = buildPrompt({ topic, pillar, product, audienceNotes });

        let inboxName = null;
        try {
            fs.mkdirSync(ENGINE_OUTPUT_DIR, { recursive: true });
            let base = slugify(topic).substring(0, 80) || 'custom-topic';
            inboxName = `${base}-prompt.txt`;
            for (let i = 2; fs.existsSync(path.join(ENGINE_OUTPUT_DIR, inboxName)) && i < 20; i++) {
                inboxName = `${base}-${i}-prompt.txt`;
            }
            fs.writeFileSync(path.join(ENGINE_OUTPUT_DIR, inboxName), prompt, 'utf8');
        } catch (e) {
            inboxName = null; // prompt still returned even if the inbox write fails
        }

        res.json({ prompt, inbox_name: inboxName });
    }));

    // Shared processing pipeline: raw text → JSON → validate → DRAFT article.
    // Nothing goes live here — the admin reviews the branded blog preview,
    // carousel and PDF first, then publishes explicitly.
    async function processFromRaw(raw, res) {
        const payload = extractJson(raw);
        const article = normalizeArticle(payload);
        article.slug = await uniqueSlug(db, article.slug);
        completeSocialPack(article);

        const result = await db.query(`
            INSERT INTO articles (slug, title, category, hero_image_url, intro, meta_title, meta_description, tags, content, status, published_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',NULL)
            RETURNING id, slug, title, category, status, intro, content, published_at
        `, [article.slug, article.title, article.category, article.hero_image_url, article.intro,
            article.meta_title, article.meta_description, article.tags, JSON.stringify(article.content)]);

        const saved = result.rows[0];
        res.json({
            success: true,
            article: saved,
            preview_url: `/admin/preview/${saved.id}`,
            publish_url: `/blog/${saved.slug}`
        });
    }

    // POST /api/admin/articles/process — paste Claude's response, engine renders a draft
    adminRouter.post('/process', asyncHandler(async (req, res) => {
        const raw = typeof req.body.raw === 'string' ? req.body.raw : JSON.stringify(req.body.article || req.body);
        if (!raw || !raw.trim()) throw AppError.badRequest('Paste Claude\'s response first');
        await processFromRaw(raw, res);
    }));

    // POST /api/admin/articles/import — upload the .docx downloaded from claude.ai
    adminRouter.post('/import', docxUpload.single('docx'), asyncHandler(async (req, res) => {
        if (!req.file) throw AppError.badRequest('Upload a .docx file');
        const { value } = await mammoth.extractRawText({ buffer: req.file.buffer });
        await processFromRaw(value, res);
    }));

    // PUT /api/admin/articles/:id/status — publish / unpublish
    adminRouter.put('/:id/status', asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) throw AppError.badRequest('Invalid article ID');
        const status = req.body.status === 'draft' ? 'draft' : 'published';

        const result = await db.query(`
            UPDATE articles
            SET status = $1::text,
                published_at = CASE WHEN $1::text = 'published' THEN CURRENT_TIMESTAMP ELSE published_at END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 RETURNING id, slug, status
        `, [status, id]);
        if (!result.rows[0]) throw AppError.notFound('Article not found');
        res.json({ success: true, article: result.rows[0] });
    }));

    // DELETE /api/admin/articles/:id
    adminRouter.delete('/:id', asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) throw AppError.badRequest('Invalid article ID');
        const result = await db.query('DELETE FROM articles WHERE id = $1 RETURNING id', [id]);
        if (!result.rows[0]) throw AppError.notFound('Article not found');
        res.json({ success: true });
    }));

    return { public: publicRouter, admin: adminRouter };
};
