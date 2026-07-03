/**
 * Server-side renderer for /blog/:slug
 * Articles need real HTML with per-page meta tags for SEO — the SPA-style
 * blog list can stay client-rendered, but article pages cannot.
 */

const { escapeHtml } = require('../middleware/sanitizer');

const BASE_URL = 'https://creviabeauty.com';

function readingMinutes(article) {
    const content = article.content || {};
    let words = String(article.intro || '').split(/\s+/).length;
    for (const s of content.sections || []) {
        for (const p of s.paragraphs || []) words += String(p).split(/\s+/).length;
    }
    return Math.max(1, Math.round(words / 200));
}

function renderArticlePage(article, options = {}) {
    const content = article.content || {};
    const previewBanner = options.preview ? `
<div style="background:#c9a55a; color:#1a1a2e; text-align:center; font-weight:700; padding:0.6rem 1rem;">
    PREVIEW — ${article.status === 'published' ? 'this article is live' : 'draft, not yet published'} · close this tab and publish from the Content Studio
</div>` : '';
    const url = `${BASE_URL}/blog/${article.slug}`;
    const title = escapeHtml(article.meta_title || article.title);
    const description = escapeHtml(article.meta_description || article.intro || '');
    const heroImage = article.hero_image_url || `${BASE_URL}/images/og-image.jpg`;
    const published = article.published_at ? new Date(article.published_at) : new Date();
    const dateLabel = published.toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });

    const sectionsHtml = (content.sections || []).map(s => `
        <section class="article-section">
            ${s.heading ? `<h2>${escapeHtml(s.heading)}</h2>` : ''}
            ${(s.paragraphs || []).map(p => `<p>${escapeHtml(p)}</p>`).join('\n            ')}
        </section>`).join('\n');

    const ctaHtml = content.cta_text ? `
        <div class="article-cta">
            <div class="article-cta-label">From Crevia Beauty</div>
            <p>${escapeHtml(content.cta_text)}</p>
            <a href="${escapeHtml(content.cta_link || '/products')}" class="article-cta-btn">Shop now &rarr;</a>
        </div>` : '';

    const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        description: article.meta_description || article.intro || '',
        image: heroImage,
        datePublished: published.toISOString(),
        mainEntityOfPage: url,
        author: { '@type': 'Organization', name: 'CreviaBeauty Kenya', url: BASE_URL },
        publisher: { '@type': 'Organization', name: 'CreviaBeauty Kenya', url: BASE_URL }
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | CreviaBeauty Kenya</title>
<link rel="icon" type="image/png" href="/assets/favicon.png?v=2">
<meta name="description" content="${description}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${escapeHtml(heroImage)}">
<meta property="og:locale" content="en_KE">
<meta property="og:site_name" content="CreviaBeauty">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${escapeHtml(heroImage)}">
<script type="application/ld+json">${jsonLd}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"></noscript>
<style>
    :root { --navy: #1a1a2e; --navy-2: #2c2c54; --gold: #c9a55a; --gold-ink: #a8853f; --ink: #2b2b35; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter', -apple-system, sans-serif; color: var(--ink); background: #fff; }

    /* Navbar */
    .navbar { position: sticky; top: 0; z-index: 100; background: var(--navy); box-shadow: 0 2px 15px rgba(0,0,0,0.3); }
    .nav-content { max-width: 1100px; margin: 0 auto; padding: 0.7rem 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1.25rem; }
    .logo { display: inline-flex; align-items: center; font-family: 'Playfair Display', serif; font-size: 1.5rem; font-weight: 700; color: #fff; text-decoration: none; }
    .logo img { height: 38px; width: 38px; border-radius: 50%; object-fit: cover; background: #fff; margin-right: 10px; }
    .logo b { color: var(--gold); font-weight: 700; }
    .nav-links { display: flex; gap: 1.1rem; list-style: none; margin: 0; padding: 0; align-items: center; }
    .nav-links a { color: rgba(255,255,255,0.9); text-decoration: none; font-size: 0.9rem; font-weight: 500; white-space: nowrap; }
    .nav-links a:hover, .nav-links a.active { color: var(--gold); }
    @media (max-width: 640px) { .nav-links { display: none; } }

    /* Article */
    .article-wrap { max-width: 720px; margin: 0 auto; padding: 2.5rem 1.5rem 3rem; }
    .article-back { color: var(--gold-ink); text-decoration: none; font-weight: 600; font-size: 0.9rem; }
    .article-back:hover { color: var(--navy); }
    .article-cat { display: inline-block; margin-top: 1.4rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--gold-ink); font-weight: 700; border: 1px solid rgba(201,165,90,0.45); border-radius: 999px; padding: 0.3rem 0.85rem; }
    h1 { font-family: 'Playfair Display', serif; font-size: 2.45rem; line-height: 1.18; margin: 0.9rem 0 0.6rem; color: var(--navy); }
    .article-meta { color: #8a8a94; font-size: 0.85rem; }
    .article-hero { width: 100%; height: 400px; object-fit: cover; border-radius: 18px; margin: 1.75rem 0 0.4rem; box-shadow: 0 18px 40px rgba(26,26,46,0.16); }

    .article-intro { font-size: 1.16rem; line-height: 1.75; color: var(--navy); margin-top: 1.6rem; }
    .article-intro::first-letter { font-family: 'Playfair Display', serif; font-size: 3.4rem; line-height: 0.85; float: left; padding: 0.35rem 0.6rem 0 0; color: var(--gold-ink); }

    .article-section h2 { font-family: 'Playfair Display', serif; font-size: 1.55rem; color: var(--navy); margin: 2.4rem 0 0.4rem; }
    .article-section h2::before { content: ''; display: block; width: 46px; height: 4px; border-radius: 2px; background: var(--gold); margin-bottom: 0.85rem; }
    .article-section p { line-height: 1.8; font-size: 1.02rem; color: #3a3a44; }

    .article-cta { background: linear-gradient(120deg, var(--navy) 0%, var(--navy-2) 70%, #3b2c50 100%); color: #fff; border-radius: 18px; padding: 1.8rem; margin-top: 2.8rem; }
    .article-cta-label { color: var(--gold); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700; margin-bottom: 0.6rem; }
    .article-cta p { color: #ececef; margin: 0 0 1.1rem; line-height: 1.65; }
    .article-cta-btn { display: inline-block; background: var(--gold); color: var(--navy); font-weight: 700; padding: 0.7rem 1.5rem; border-radius: 999px; text-decoration: none; }
    .article-cta-btn:hover { filter: brightness(1.07); }

    .article-foot { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #ececf1; margin-top: 2.6rem; padding-top: 1.4rem; }

    footer { background: var(--navy); color: rgba(255,255,255,0.85); margin-top: 2rem; }
    .footer-inner { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem 1.2rem; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1.5rem; }
    .footer-inner h3 { font-family: 'Playfair Display', serif; color: #fff; margin: 0 0 0.5rem; }
    .footer-inner a { color: rgba(255,255,255,0.8); text-decoration: none; display: block; margin-top: 0.35rem; font-size: 0.92rem; }
    .footer-inner a:hover { color: var(--gold); }
    .footer-bottom { text-align: center; border-top: 1px solid rgba(255,255,255,0.12); padding: 1rem; font-size: 0.85rem; color: rgba(255,255,255,0.6); }

    @media (max-width: 640px) {
        h1 { font-size: 1.85rem; }
        .article-hero { height: 240px; }
    }
</style>
</head>
<body>
${previewBanner}
<nav class="navbar">
    <div class="nav-content">
        <a href="/" class="logo"><img src="/assets/favicon.png?v=2" alt="CreviaBeauty">Crevia<b>Beauty</b></a>
        <ul class="nav-links">
            <li><a href="/">Home</a></li>
            <li><a href="/products">Products</a></li>
            <li><a href="/bundles">Bundles</a></li>
            <li><a href="/quiz">Quizzes</a></li>
            <li><a href="/blog" class="active">The Edit</a></li>
        </ul>
    </div>
</nav>

<article class="article-wrap">
    <a href="/blog" class="article-back">&larr; Back to the Edit</a><br>
    <span class="article-cat">${escapeHtml(article.category || 'Beauty')}</span>
    <h1>${escapeHtml(article.title)}</h1>
    <div class="article-meta">${dateLabel} &middot; ${readingMinutes(article)} min read &middot; The Beauty Edit</div>
    ${article.hero_image_url ? `<img class="article-hero" src="${escapeHtml(article.hero_image_url)}" alt="${escapeHtml(article.title)}">` : ''}
    <p class="article-intro">${escapeHtml(article.intro || '')}</p>
${sectionsHtml}
${ctaHtml}
    <div class="article-foot">
        <a href="/blog" class="article-back">&larr; More from the Edit</a>
        <a href="/products" class="article-back">Shop CreviaBeauty &rarr;</a>
    </div>
</article>

<footer>
    <div class="footer-inner">
        <div><h3>CreviaBeauty Kenya</h3><p style="margin:0; font-size:0.92rem;">Premium beauty in Kenya.<br>Authenticity guaranteed &middot; Free delivery in Nairobi.</p></div>
        <div><h3>Quick Links</h3><a href="/">Home</a><a href="/products">Products</a><a href="/quiz">Scent Quiz</a><a href="/blog">The Edit</a></div>
    </div>
    <div class="footer-bottom">&copy; 2026 CreviaBeauty Kenya. All rights reserved.</div>
</footer>
</body>
</html>`;
}

module.exports = { renderArticlePage };
