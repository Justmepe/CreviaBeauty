/**
 * Content Studio / articles integration tests — real PG, real session auth.
 * Covers the publish loop: prompt generation → paste Claude's response → live article.
 */

const {
    waitForDb,
    registerAndLoginCustomer,
    loginAsAdmin,
    getAnyProductId,
    request
} = require('./helpers');

beforeAll(async () => {
    await waitForDb();
    // Remove articles left behind by previous runs so slug expectations hold
    const db = require('../database');
    await db.query("DELETE FROM articles WHERE slug LIKE 'foundation-cracks-by-noon-%'");
});

// A realistic Claude reply: prose around a fenced JSON block.
function claudeResponse(slugSuffix) {
    const article = {
        type: 'crevia-article',
        title: `Why Your Foundation Cracks By Noon ${slugSuffix}`,
        slug: `foundation-cracks-by-noon-${slugSuffix}`,
        category: 'Problem-Solving & Education',
        meta_title: 'Why Foundation Cracks By Noon (And The Fix)',
        meta_description: 'Foundation cracking by midday? The cause is prep, not the product. Here is the 3-step fix.',
        tags: ['foundation', 'makeup', 'beauty tips'],
        intro: 'You leave the house flawless — and by lunch your foundation has settled into every line. It is not the foundation.',
        sections: [
            { heading: 'The Problem', paragraphs: ['Skin prep is the missing step.', 'Dry patches drink the product unevenly.'] },
            { heading: 'The Fix', paragraphs: ['Step 1: hydrate. Step 2: thin layers. Step 3: set only the T-zone.'] },
            { heading: 'The Result', paragraphs: ['Makeup that still looks fresh at 5pm.'] }
        ],
        cta_text: 'This is exactly why we stock the Pro Brush & Sponge Set.',
        cta_link: '/products?search=brush',
        carousel: [
            { heading: 'Foundation cracking by noon?', body: 'It is not the foundation.' },
            { heading: 'The real reason', body: 'Skin prep, not product.' },
            { heading: 'Want the full guide?', body: 'Link in bio. @creviabeauty' }
        ]
    };
    return `Here's your article!\n\n\`\`\`json\n${JSON.stringify(article, null, 2)}\n\`\`\`\n\nLet me know if you want changes.`;
}

describe('Public blog API', () => {
    test('lists published articles (seeded)', async () => {
        const res = await request().get('/api/articles');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(3);
        expect(res.body[0]).toHaveProperty('slug');
        expect(res.body[0]).toHaveProperty('title');
    });

    test('returns a single article by slug with content', async () => {
        const res = await request().get('/api/articles/first-time-wig-buyer');
        expect(res.status).toBe(200);
        expect(res.body.title).toMatch(/first wig/i);
        expect(Array.isArray(res.body.content.sections)).toBe(true);
    });

    test('404s for unknown slug', async () => {
        const res = await request().get('/api/articles/does-not-exist');
        expect(res.status).toBe(404);
    });

    test('server-renders /blog/:slug with SEO meta', async () => {
        const res = await request().get('/blog/first-time-wig-buyer');
        expect(res.status).toBe(200);
        expect(res.text).toContain('<link rel="canonical" href="https://creviabeauty.com/blog/first-time-wig-buyer">');
        expect(res.text).toContain('og:type" content="article"');
        expect(res.text).toContain('application/ld+json');
    });

    test('redirects unknown article pages to /blog', async () => {
        const res = await request().get('/blog/does-not-exist');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/blog');
    });

    test('sitemap includes article URLs', async () => {
        const res = await request().get('/sitemap.xml');
        expect(res.status).toBe(200);
        expect(res.text).toContain('/blog/first-time-wig-buyer');
    });
});

describe('Content Studio admin flow', () => {
    test('rejects non-admin users', async () => {
        const agent = await registerAndLoginCustomer();
        const res = await agent.post('/api/admin/articles/process').send({ raw: claudeResponse('x') });
        expect([401, 403]).toContain(res.status);
    });

    test('preview route is admin-only', async () => {
        const res = await request().get('/admin/preview/1');
        expect([302, 401, 403]).toContain(res.status);
        expect(res.status === 302 ? res.headers.location !== undefined : true).toBe(true);
    });

    test('generates a prompt embedding the product tie-in', async () => {
        const admin = await loginAsAdmin();
        const productId = await getAnyProductId();
        const res = await admin.post('/api/admin/articles/prompt').send({
            topic: 'Why your foundation cracks by noon',
            pillar: 'Problem-Solving & Education',
            product_id: productId
        });
        expect(res.status).toBe(200);
        expect(res.body.prompt).toContain('Why your foundation cracks by noon');
        expect(res.body.prompt).toContain('PRODUCT TIE-IN');
        expect(res.body.prompt).toContain('crevia-article');

        // The prompt is saved into the inbox for the Copy → Inject lifecycle
        expect(res.body.inbox_name).toMatch(/-prompt\.txt$/);
        const inbox = await admin.get('/api/admin/articles/inbox');
        expect(inbox.body.some(p => p.name === res.body.inbox_name)).toBe(true);

        // Clean up so repeated test runs don't accumulate inbox files
        await admin.delete(`/api/admin/articles/inbox/${encodeURIComponent(res.body.inbox_name)}`);
    });

    test('processes a pasted Claude response into a DRAFT (not live), then publishes', async () => {
        const admin = await loginAsAdmin();
        const res = await admin.post('/api/admin/articles/process').send({ raw: claudeResponse('live') });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.article.status).toBe('draft');
        expect(res.body.preview_url).toBe(`/admin/preview/${res.body.article.id}`);
        expect(res.body.article.content.carousel).toHaveLength(3);

        // House style: em dashes are stripped from everything at processing time
        expect(JSON.stringify(res.body.article)).not.toContain('—');
        expect(res.body.article.intro).toContain('flawless, and by lunch');

        // Social pack is completed with defaults when Claude doesn't provide one
        const social = res.body.article.content.social;
        expect(social.dm_keyword).toBe('GUIDE');
        expect(social.caption).toContain('Comment "GUIDE"');
        expect(social.first_comment).toContain('/blog/foundation-cracks-by-noon-live');
        expect(social.dm_reply).toContain('/blog/foundation-cracks-by-noon-live');
        expect(social.lead_followup).toMatch(/email|WhatsApp/);

        // NOT live yet
        const draftPage = await request().get(res.body.publish_url);
        expect(draftPage.status).toBe(302);
        const list1 = await request().get('/api/articles');
        expect(list1.body.some(a => a.slug === 'foundation-cracks-by-noon-live')).toBe(false);

        // Admin can preview the branded page
        const preview = await admin.get(res.body.preview_url);
        expect(preview.status).toBe(200);
        expect(preview.text).toContain('PREVIEW');
        expect(preview.text).toContain('Why Your Foundation Cracks By Noon');

        // Explicit publish → live
        const pub = await admin.put(`/api/admin/articles/${res.body.article.id}/status`).send({ status: 'published' });
        expect(pub.body.success).toBe(true);

        const page = await request().get(res.body.publish_url);
        expect(page.status).toBe(200);
        expect(page.text).toContain('Why Your Foundation Cracks By Noon');

        const list2 = await request().get('/api/articles');
        expect(list2.body.some(a => a.slug === 'foundation-cracks-by-noon-live')).toBe(true);
    });

    test('resolves slug collisions instead of failing', async () => {
        const admin = await loginAsAdmin();
        const res = await admin.post('/api/admin/articles/process').send({ raw: claudeResponse('live') });
        expect(res.status).toBe(200);
        expect(res.body.article.slug).toBe('foundation-cracks-by-noon-live-2');
    });

    test('rejects pastes with no JSON in them', async () => {
        const admin = await loginAsAdmin();
        const res = await admin.post('/api/admin/articles/process').send({ raw: 'Sorry, I cannot help with that.' });
        expect(res.status).toBe(400);
    });

    test('unpublish hides the article from the public site', async () => {
        const admin = await loginAsAdmin();
        const processed = await admin.post('/api/admin/articles/process').send({ raw: claudeResponse('toggle') });
        const { id, slug } = processed.body.article;
        await admin.put(`/api/admin/articles/${id}/status`).send({ status: 'published' });

        const res = await admin.put(`/api/admin/articles/${id}/status`).send({ status: 'draft' });
        expect(res.body.success).toBe(true);

        const page = await request().get(`/blog/${slug}`);
        expect(page.status).toBe(302);

        const api = await request().get(`/api/articles/${slug}`);
        expect(api.status).toBe(404);
    });

    test('deletes an article', async () => {
        const admin = await loginAsAdmin();
        const processed = await admin.post('/api/admin/articles/process').send({ raw: claudeResponse('del') });
        const { id, slug } = processed.body.article;

        const res = await admin.delete(`/api/admin/articles/${id}`);
        expect(res.body.success).toBe(true);

        const api = await request().get(`/api/articles/${slug}`);
        expect(api.status).toBe(404);
    });
});
