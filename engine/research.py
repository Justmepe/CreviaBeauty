#!/usr/bin/env python3
"""
Crevia Beauty — Topic Research Engine

Researches a beauty topic across free sources (no paid APIs) and produces a
ready-to-paste Claude prompt with the research findings embedded. The output
of the claude.ai chat is then pasted into Admin -> Marketing -> Content Studio,
which publishes the article + carousel to the site.

Sources (all best-effort; the engine degrades gracefully if one is down):
  - DuckDuckGo web search   (topic, common mistakes, how-to angles)
  - DuckDuckGo news search  (what is trending right now)
  - Reddit                  (real people describing the pain in their own words)
  - Beauty press RSS feeds  (Allure, Byrdie, Refinery29 — current headlines)
  - The Crevia site API     (live product data for the tie-in)

Usage:
  python engine/research.py "Why your foundation cracks by noon" --product "brush"
  python engine/research.py --day 4              # day 4 of the 30-day calendar
  python engine/research.py --auto               # today's calendar entry
  python engine/research.py --auto --watch 24    # continuous: re-run every 24h
  python engine/research.py "topic" --copy       # also copy prompt to clipboard

Output: engine/output/<slug>-prompt.txt (and stdout).
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote

import requests

try:
    from ddgs import DDGS
except ImportError:
    DDGS = None

ENGINE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = ENGINE_DIR / "output"
CALENDAR_FILE = ENGINE_DIR / "calendar.json"
# Local dev runs on 3000; production (VPS) runs on 3010 — override via env
SITE_URL = os.environ.get("CREVIA_SITE_URL", "http://localhost:3000")
# Shared secret to read the coverage brain (/api/engine/*). Empty -> fall back to rotation.
ENGINE_TOKEN = os.environ.get("CONTENT_ENGINE_TOKEN", "")

# On the VPS the engine sits beside the app; if the token isn't in the process env,
# read it from the app's .env so the PM2 research process needs no extra config.
if not ENGINE_TOKEN:
    try:
        _env_file = ENGINE_DIR.parent / ".env"
        if _env_file.exists():
            for _line in _env_file.read_text(encoding="utf-8").splitlines():
                _line = _line.strip()
                if _line.startswith("CONTENT_ENGINE_TOKEN=") and "=" in _line:
                    ENGINE_TOKEN = _line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
}

RSS_FEEDS = [
    ("Allure", "https://www.allure.com/feed/rss"),
    ("Glamour", "https://www.glamour.com/feed/rss"),
    ("Refinery29 Beauty", "https://www.refinery29.com/en-us/beauty/rss.xml"),
]


def slugify(text):
    text = re.sub(r"[^a-z0-9]+", "-", text.lower())
    return text.strip("-")[:80] or "topic"


# ---------------------------------------------------------------- research

def search_web(topic):
    """DuckDuckGo text search across three angles on the topic."""
    if DDGS is None:
        print("  [skip] ddgs not installed (pip install ddgs)")
        return []
    findings = []
    seen = set()
    queries = [topic, f"{topic} common mistakes", f"how to fix {topic}"]
    for query in queries:
        try:
            with DDGS() as ddgs:
                for hit in ddgs.text(query, max_results=6):
                    url = hit.get("href") or hit.get("url") or ""
                    if not url or url in seen:
                        continue
                    seen.add(url)
                    findings.append({
                        "title": hit.get("title", "").strip(),
                        "snippet": (hit.get("body") or "").strip()[:300],
                        "source": url,
                    })
        except Exception as e:
            print(f"  [warn] web search failed for '{query}': {e}")
        time.sleep(1)  # be polite, avoid rate limits
    return findings[:14]


def search_news(topic):
    """DuckDuckGo news — what is being written about this right now."""
    if DDGS is None:
        return []
    try:
        with DDGS() as ddgs:
            return [{
                "title": hit.get("title", "").strip(),
                "snippet": (hit.get("body") or "").strip()[:250],
                "date": hit.get("date", ""),
                "source": hit.get("url", ""),
            } for hit in ddgs.news(topic, max_results=6)]
    except Exception as e:
        print(f"  [warn] news search failed: {e}")
        return []


def search_reddit(topic):
    """Real people describing the pain point in their own words."""
    try:
        url = f"https://www.reddit.com/search.json?q={quote(topic)}&sort=relevance&t=year&limit=8"
        response = requests.get(url, headers=HEADERS, timeout=15)
        response.raise_for_status()
        posts = []
        for child in response.json().get("data", {}).get("children", []):
            post = child.get("data", {})
            posts.append({
                "title": post.get("title", "").strip(),
                "subreddit": post.get("subreddit", ""),
                "upvotes": post.get("score", 0),
                "comments": post.get("num_comments", 0),
                "snippet": (post.get("selftext") or "").strip()[:300],
            })
        return posts
    except Exception as e:
        print(f"  [warn] reddit search failed: {e}")
        return []


def fetch_all_rss():
    """All current beauty-press headlines."""
    headlines = []
    for name, feed_url in RSS_FEEDS:
        try:
            response = requests.get(feed_url, headers=HEADERS, timeout=15)
            response.raise_for_status()
            root = ET.fromstring(response.content)
            for item in root.iter("item"):
                title = (item.findtext("title") or "").strip()
                if title:
                    headlines.append({"outlet": name, "title": title})
        except Exception as e:
            print(f"  [warn] RSS failed for {name}: {e}")
    return headlines


def fetch_rss_headlines(topic):
    """Current beauty-press headlines; topic matches are flagged."""
    keywords = [w for w in re.findall(r"[a-z]{4,}", topic.lower())]
    headlines = [
        {**h, "matches_topic": any(k in h["title"].lower() for k in keywords)}
        for h in fetch_all_rss()
    ]
    relevant = [h for h in headlines if h["matches_topic"]]
    trending = [h for h in headlines if not h["matches_topic"]][:5]
    return relevant[:6] + trending


# ---------------------------------------------------------------- topic discovery

# Maps words seen in trending headlines to a product search term in the catalog
PRODUCT_KEYWORDS = {
    "foundation": "Foundation", "concealer": "Foundation", "blush": "Makeup",
    "lip": "Lipstick", "gloss": "Lipstick", "lipstick": "Lipstick",
    "eyeshadow": "Palette", "palette": "Palette", "mascara": "Makeup", "eyeliner": "Makeup",
    "wig": "Wig", "lace": "Wig",
    "hair": "Hair", "curl": "Hair", "braids": "Hair", "shampoo": "Shampoo", "scalp": "Hair",
    "perfume": "Perfume", "fragrance": "Perfume", "scent": "Perfume",
    "skin": "Cleanser", "skincare": "Cleanser", "moisturizer": "Cream", "serum": "Serum",
    "brush": "Brush", "sponge": "Brush",
    "body": "Body Butter", "butter": "Body Butter",
}

BEAUTY_SUBREDDITS = ["MakeupAddiction", "beauty", "HaircareScience", "30PlusSkinCare", "fragrance"]

USED_TOPICS_FILE = OUTPUT_DIR / "used_topics.json"


def load_used_topics():
    try:
        return set(json.loads(USED_TOPICS_FILE.read_text(encoding="utf-8")))
    except Exception:
        return set()


def save_used_topic(slug):
    used = load_used_topics()
    used.add(slug)
    OUTPUT_DIR.mkdir(exist_ok=True)
    USED_TOPICS_FILE.write_text(json.dumps(sorted(used), indent=2), encoding="utf-8")


def score_candidate(title):
    """How usable is this headline as a Crevia topic? Product-keyword matches drive the score.
    No beauty keyword at all -> rejected, so fashion/lifestyle headlines can't slip through."""
    lower = title.lower()
    matches = [term for word, term in PRODUCT_KEYWORDS.items() if word in lower]
    if not matches:
        return -1, ""
    score = len(matches) * 10
    words = len(title.split())
    if 4 <= words <= 16:
        score += 5
    for signal in ("how to", "why", "mistake", "trend", "viral", "best", "fix", "secret"):
        if signal in lower:
            score += 3
    return score, matches[0]


def discover_topic():
    """Scan beauty press, news and Reddit; pick the strongest fresh topic automatically."""
    print("  - scanning beauty press, news and Reddit for candidate topics...")
    candidates = []

    for h in fetch_all_rss():
        candidates.append({"title": h["title"], "origin": h["outlet"]})

    if DDGS is not None:
        for query in ("beauty trend this week", "makeup trend viral", "hair trend"):
            try:
                with DDGS() as ddgs:
                    for hit in ddgs.news(query, max_results=5):
                        candidates.append({"title": hit.get("title", "").strip(), "origin": "news"})
            except Exception:
                pass
            time.sleep(1)

    for sub in BEAUTY_SUBREDDITS:
        try:
            url = f"https://www.reddit.com/r/{sub}/top.json?t=week&limit=8"
            response = requests.get(url, headers=HEADERS, timeout=15)
            response.raise_for_status()
            for child in response.json().get("data", {}).get("children", []):
                post = child.get("data", {})
                if post.get("score", 0) > 50:
                    candidates.append({"title": post.get("title", "").strip(), "origin": f"r/{sub}"})
        except Exception:
            pass

    used = load_used_topics()
    best = None
    for c in candidates:
        if not c["title"] or slugify(c["title"]) in used:
            continue
        score, product_term = score_candidate(c["title"])
        if best is None or score > best["score"]:
            best = {**c, "score": score, "product": product_term}

    if best is None or best["score"] <= 0:
        raise RuntimeError("Discovery found no usable topics right now (sources unreachable or all candidates used)")

    print(f"  - picked: \"{best['title']}\" (from {best['origin']}, score {best['score']})")
    save_used_topic(slugify(best["title"]))
    return best["title"], "Trending Beauty News & Insights", best["product"]


def fetch_product(search_term):
    """Live product data from the Crevia site for the soft CTA tie-in."""
    if not search_term:
        return None
    try:
        response = requests.get(
            f"{SITE_URL}/api/products", params={"search": search_term}, timeout=10
        )
        response.raise_for_status()
        body = response.json()
        products = body.get("data", body) if isinstance(body, dict) else body
        if products:
            p = products[0]
            # Keep image paths relative (/uploads/...). Prefixing SITE_URL bakes in
            # http://localhost:3010, which a visitor's browser can never reach.
            image = p.get("image_url") or ""
            return {
                "id": p.get("id"),
                "name": p.get("name"),
                "category": p.get("category"),
                "price": p.get("price"),
                "description": p.get("description"),
                "image_url": image,
                "link": f"/products?search={quote(p.get('name', ''))}",
            }
    except Exception as e:
        print(f"  [warn] could not reach the site API for product data: {e}")
    return None


def fetch_products(category=None, limit=100):
    """Products from the live site, optionally filtered to a category."""
    try:
        params = {"limit": limit}
        if category:
            params["category"] = category
        r = requests.get(f"{SITE_URL}/api/products", params=params, timeout=10)
        r.raise_for_status()
        body = r.json()
        rows = body.get("data", body) if isinstance(body, dict) else body
        out = []
        for p in rows or []:
            # Keep image paths relative (/uploads/...). Prefixing SITE_URL bakes in
            # http://localhost:3010, which a visitor's browser can never reach.
            image = p.get("image_url") or ""
            out.append({
                "id": p.get("id"),
                "name": p.get("name"), "category": p.get("category"),
                "brand": p.get("brand"), "price": p.get("price"),
                "scent_family": p.get("scent_family"),
                "description": p.get("description"), "image_url": image,
                "link": f"/products?search={quote(p.get('name', ''))}",
            })
        return out
    except Exception as e:
        print(f"  [warn] could not fetch products ({category}): {e}")
        return []


# ---------------------------------------------------------------- content series
# The weekly rotation. Each weekday anchors to one Fragrantica community thread,
# turned into a named recurring series. This replaces US-magazine headline scraping
# with on-brand, catalog-anchored content the audience actually talks about.
SERIES = [
    {
        "key": "spot-the-fake", "name": "Spot the Fake", "weekday": 0,
        "thread": "Authenticity & batch codes", "category": "Perfumes",
        "angle": ("Teach the reader how to tell a GENUINE bottle from a River Road counterfeit. "
                  "Use the exact tells Kenyan buyers check: batch code, packaging and font, cellophane, "
                  "spray quality, sillage and longevity, and price-as-a-signal (fakes cost a fraction). "
                  "Pain: the fear of being scammed. Fix: the checklist. Result: buying with confidence. "
                  "Close on Crevia's authenticity guarantee (sourced direct, batch-code verifiable)."),
        "research": "how to spot fake {q} perfume batch code authentic",
    },
    {
        "key": "decoded", "name": "Decoded", "weekday": 1,
        "thread": "Reviews & deconstruction", "category": "Perfumes",
        "angle": ("Deconstruct this exact fragrance like a great Fragrantica review in Crevia's voice: "
                  "opening notes, heart, dry-down, longevity, projection and sillage, the seasons and occasions it suits, "
                  "and WHO it is for. Pain: buying blind. Fix: knowing exactly what you get. Result: a confident pick."),
        "research": "{q} fragrance notes review longevity projection",
    },
    {
        "key": "scent-for-the-moment", "name": "Scent for the Moment", "weekday": 2,
        "thread": "Help me find / scenario", "category": "Perfumes",
        "angle": ("Match this fragrance to ONE specific Kenyan moment: a Nairobi wedding, the boardroom, a first date, "
                  "Sunday service, a night out in Westlands, or a hot-season day. Scent-as-memory, occasion and mood. "
                  "Pain: not knowing what to wear when. Fix: the right scent for the scene. Result: owning the room."),
        "research": "best perfume for {q} occasion mood",
    },
    {
        "key": "the-layer", "name": "The Layer", "weekday": 3,
        "thread": "Layering & combinations", "category": "Perfumes",
        "angle": ("Show how to LAYER this fragrance with a complementary product (a scented candle for the home, a body "
                  "product, or a second lighter scent) so it lasts longer and feels custom. Pain: scent fading by noon and "
                  "smelling like everyone else. Fix: layering. Result: a signature that lasts. Drives a two-item basket."),
        "research": "perfume layering combinations how to make scent last",
    },
    {
        "key": "punches-above-its-price", "name": "Punches Above Its Price", "weekday": 4,
        "thread": "Cheapies & beast mode", "category": "Perfumes",
        "angle": ("Spotlight a scent that delivers designer-level projection and longevity at an accessible Kenyan price. "
                  "Beast mode without the beast price. Pain: wanting to smell expensive on a budget. Fix: this pick. "
                  "Result: compliments without the guilt. Lead with value, projection and longevity."),
        "research": "long lasting beast mode fragrance value for money {q}",
    },
    {
        "key": "your-signature", "name": "Your Signature", "weekday": 5,
        "thread": "Identity, gender & occasions", "category": "Perfumes",
        "angle": ("Identity piece: what a signature scent says about you, and how to choose a signature versus a rotation. "
                  "Frame this fragrance as a signature for a certain kind of person. Pain: smelling forgettable. "
                  "Fix: owning a signature. Result: being remembered by your scent."),
        "research": "how to find your signature scent fragrance identity",
    },
    {
        "key": "the-wardrobe", "name": "The Wardrobe", "weekday": 6,
        "thread": "Collecting & the fragrance wardrobe", "category": "Perfumes",
        "angle": ("Teach building a fragrance WARDROBE: the few scents every collection needs (a fresh daily, an office-safe, "
                  "a date-night, a special-occasion, a signature). Feature this fragrance as one pillar and name the gaps. "
                  "Pain: owning one bottle for everything. Fix: a small, smart wardrobe. Result: the right scent every day. "
                  "Drives repeat, multi-bottle buying."),
        "research": "fragrance wardrobe must have scents for every occasion",
    },
]


def pick_series(override_key=None):
    if override_key:
        for s in SERIES:
            if s["key"] == override_key:
                return s
        sys.exit(f"Unknown series '{override_key}'. Options: {', '.join(s['key'] for s in SERIES)}")
    weekday = date.today().weekday()  # Mon=0 .. Sun=6
    for s in SERIES:
        if s["weekday"] == weekday:
            return s
    return SERIES[0]


ROTATION_FILE = OUTPUT_DIR / "rotation.json"


def pick_product_for_series(series):
    """Rotate deterministically through the series' category so products don't repeat."""
    products = fetch_products(series["category"]) or fetch_products()
    if not products:
        return None
    try:
        rot = json.loads(ROTATION_FILE.read_text(encoding="utf-8"))
    except Exception:
        rot = {}
    idx = rot.get(series["key"], 0) % len(products)
    rot[series["key"]] = idx + 1
    OUTPUT_DIR.mkdir(exist_ok=True)
    ROTATION_FILE.write_text(json.dumps(rot, indent=2), encoding="utf-8")
    return products[idx]


# ---------------------------------------------------------------- prompt

def format_findings(web, news, reddit, headlines):
    lines = []
    if web:
        lines.append("WEB RESEARCH (what experts and guides say):")
        for f in web:
            lines.append(f"- {f['title']}: {f['snippet']} [{f['source']}]")
    if reddit:
        lines.append("\nREDDIT (real people describing this pain in their own words — mine these for relatable language):")
        for p in reddit:
            extra = f" — \"{p['snippet']}\"" if p["snippet"] else ""
            lines.append(f"- r/{p['subreddit']} ({p['upvotes']} upvotes, {p['comments']} comments): {p['title']}{extra}")
    if news:
        lines.append("\nRECENT NEWS on this topic:")
        for n in news:
            lines.append(f"- {n['title']} ({n['date']}): {n['snippet']}")
    if headlines:
        lines.append("\nBEAUTY PRESS RIGHT NOW (for current context and trend awareness):")
        for h in headlines:
            flag = " [ON-TOPIC]" if h["matches_topic"] else ""
            lines.append(f"- {h['outlet']}: {h['title']}{flag}")
    return "\n".join(lines) if lines else "(No research sources reachable — write from your own knowledge.)"


def build_series_prompt(series, product, research_block):
    if product:
        price = f"KES {int(float(product['price'])):,}" if product.get("price") else "-"
        pname = product["name"]
        product_block = f"""THE PRODUCT THIS POST IS BUILT AROUND:
- Name: {pname}
- Brand: {product.get('brand') or '-'}
- Category: {product.get('category') or '-'}
- Scent family: {product.get('scent_family') or '-'}
- Price: {price}
- Description: {product.get('description') or '-'}
- Product link (use as cta_link): {product['link']}
- Product image (use as hero_image_url): {product.get('image_url') or '(omit hero_image_url)'}"""
    else:
        pname = "a Crevia Beauty product"
        product_block = "No specific product available. Keep it general and soft-CTA to /products."

    return f"""You are the senior content strategist and copywriter for Crevia Beauty, a premium AUTHENTIC fragrance and beauty store in Nairobi, Kenya (creviabeauty.com). Voice: warm, confident, direct, a little aspirational. Kenyan English, prices in KES. Crevia competes on IDENTITY and TRUST, never on being the cheapest. Style nods to Alex Hormozi's $100M Offers: name a real pain, explain why it happens, give a real fix, paint the result, then connect to the product without being salesy.

TODAY'S SERIES: "{series['name']}"   (community thread: {series['thread']})
THE ANGLE FOR THIS SERIES:
{series['angle']}

{product_block}

=== RESEARCH (gathered {date.today().isoformat()}; ground the post in this and add your own expertise) ===
{research_block}
=== END RESEARCH ===

Produce ONE Instagram-ready content set for this series and product, as ONE JSON object, no commentary before or after, no markdown outside the JSON, exactly this shape:

{{
  "type": "crevia-article",
  "series": "{series['name']}",
  "title": "Scroll-stopping headline in the series' angle",
  "slug": "short-kebab-case-keyword-slug",
  "category": "{series['name']}",
  "meta_title": "Under 60 characters",
  "meta_description": "Under 155 characters, value plus a soft CTA",
  "tags": ["3-5", "seo", "tags"],
  "hero_image_url": "the product image URL above, or omit this field",
  "intro": "One paragraph naming the pain in the reader's own words",
  "sections": [
    {{ "heading": "The Problem", "paragraphs": ["why this happens, 2-3 short paragraphs"] }},
    {{ "heading": "The Fix", "paragraphs": ["specific steps the reader can do today"] }},
    {{ "heading": "The Result", "paragraphs": ["life after the fix"] }}
  ],
  "cta_text": "1-2 warm sentences tying back to {pname}",
  "cta_link": "the product link above",
  "carousel": [
    {{ "heading": "Hook (the pain as a scroll-stopper)", "highlight": "1-2 words copied from THIS heading to print in gold", "body": "1-2 short lines" }},
    {{ "heading": "Why it happens", "highlight": "1-2 key words from this heading", "body": "1-2 short lines" }},
    {{ "heading": "What the right choice gives you", "bullets": [ {{ "icon": "user", "text": "Benefit (1-3 words)" }}, {{ "icon": "star", "text": "Benefit" }}, {{ "icon": "diamond", "text": "Benefit" }} ] }},
    {{ "heading": "Point or step 1", "highlight": "1-2 key words", "body": "1-2 short lines" }},
    {{ "heading": "Point or step 2", "highlight": "1-2 key words", "body": "1-2 short lines" }},
    {{ "heading": "The result you want", "highlight": "1-2 key words", "body": "1-2 short lines" }},
    {{ "heading": "Want the full guide?", "body": "Comment the keyword below and we'll DM it. @creviabeauty" }}
  ],
  "reel": [
    {{ "shot": "What to film or show on screen", "say": "One short line to say or put as on-screen text" }},
    {{ "shot": "...", "say": "..." }}
  ],
  "social": {{
    "dm_keyword": "ONE short uppercase word to comment for the link, themed to the series",
    "caption": "Hook, 2-3 value lines, then 'Comment <keyword> and we'll DM you the full guide.' End with 3-4 Kenyan beauty hashtags.",
    "first_comment": "The full guide, free -> https://creviabeauty.com/blog/<slug>",
    "dm_reply": "Warm DM with the article link and one engagement question.",
    "lead_followup": "Second DM after they open the link: ask for their email or WhatsApp to get guides first, and the one beauty problem they want solved next."
  }}
}}

RULES:
- "reel" is a 5 to 7 shot vertical Reel script. Each shot: a concrete visual plus one short line to say or overlay. Put the hook in shot 1. Keep every shot filmable on a phone.
- paragraphs are plain text only: no HTML, no markdown.
- NEVER use em dashes anywhere. Use commas, periods, or colons instead.
- Carousel text short enough to read on a phone (heading <= 8 words, body <= 30 words).
- Carousel "highlight": copy the 1-2 most meaningful words THAT APPEAR in that slide's heading (exact words) so they print in gold. Omit on the final CTA slide.
- Carousel "bullets": use ONE slide as a 3-item list for benefits/qualities/mistakes. Each item is {{ "icon", "text" }} with text 1-3 words. Allowed icons ONLY: user, star, diamond, heart, shield, gift, check, clock, x. Use "x" for mistakes, "check" for do's, user/star/diamond/heart for benefits. A bullets slide has no "body".
- Kenyan English, KES prices. Return ONLY the JSON object."""


def build_prompt(topic, pillar, product, notes, research_block):
    if product:
        price = f"KES {int(float(product['price'])):,}" if product.get("price") else "-"
        product_block = f"""PRODUCT TIE-IN (use as the soft CTA — frame it as the solution already discussed, never as a sales pitch):
- Name: {product['name']}
- Category: {product.get('category') or '-'}
- Price: {price}
- Description: {product.get('description') or '-'}
- Product link (use as cta_link): {product['link']}
- Product image (use as hero_image_url): {product.get('image_url') or '(none — omit hero_image_url)'}"""
    else:
        product_block = "PRODUCT TIE-IN: none specified — end with a soft CTA to /products and omit hero_image_url."

    notes_block = f"\nEXTRA CONTEXT FROM THE TEAM: {notes}" if notes else ""

    return f"""You are a senior beauty content strategist and direct-response copywriter for Crevia Beauty, a premium online beauty store in Nairobi, Kenya (creviabeauty.com). You write in the style of Alex Hormozi's $100M Offers framework: identify a real pain point, agitate why it happens, deliver a real solution, and paint the dream outcome — then connect it naturally to a product. Never pushy, never salesy. Audience: Kenyan beauty lovers; prices in KES; warm, direct, no fluff.

TOPIC: {topic}
CONTENT PILLAR: {pillar}{notes_block}

{product_block}

=== RESEARCH FINDINGS (gathered {date.today().isoformat()} by our research engine) ===
Ground the article in these findings. Use the Reddit language to make the pain relatable. Reference what is current. You may add your own expertise on top.

{research_block}
=== END RESEARCH ===

Write one complete blog article AND a social media carousel, and return them as ONE JSON object — no commentary before or after, no markdown outside the JSON, exactly this shape:

{{
  "type": "crevia-article",
  "title": "Headline that names the pain point or trend in relatable language",
  "slug": "short-kebab-case-keyword-slug",
  "category": "{pillar}",
  "meta_title": "Under 60 characters, main keyword + pain point",
  "meta_description": "Under 155 characters, summarizes the solution with a soft call to action",
  "tags": ["3-5", "seo", "tags"],
  "hero_image_url": "the product image URL given above, or omit this field",
  "intro": "One paragraph naming the pain and how it shows up day to day",
  "sections": [
    {{ "heading": "The Problem", "paragraphs": ["Why this happens — 2-3 paragraphs of real explanation"] }},
    {{ "heading": "The Fix", "paragraphs": ["Step-by-step guidance the reader can act on today"] }},
    {{ "heading": "The Result", "paragraphs": ["Paint the picture of life after the fix"] }}
  ],
  "cta_text": "1-2 sentences. Use language like 'This is exactly why we stock...' or 'If you want this result, start with...'",
  "cta_link": "the product link given above",
  "carousel": [
    {{ "heading": "Hook — the pain point as a scroll-stopper", "highlight": "1-2 words copied from THIS heading to print in gold", "body": "1-2 short lines" }},
    {{ "heading": "The real reason this happens", "highlight": "1-2 key words from this heading", "body": "1-2 short lines" }},
    {{ "heading": "What the right choice gives you", "bullets": [ {{ "icon": "user", "text": "Benefit (1-3 words)" }}, {{ "icon": "star", "text": "Benefit" }}, {{ "icon": "diamond", "text": "Benefit" }} ] }},
    {{ "heading": "Fix step 1", "highlight": "1-2 key words", "body": "1-2 short lines" }},
    {{ "heading": "Fix step 2", "highlight": "1-2 key words", "body": "1-2 short lines" }},
    {{ "heading": "The result you actually want", "highlight": "1-2 key words", "body": "1-2 short lines" }},
    {{ "heading": "Want the full guide?", "body": "Comment the keyword below and we'll DM you the full guide. @creviabeauty" }}
  ],
  "social": {{
    "dm_keyword": "ONE short uppercase word people comment to get the link, e.g. GLOW",
    "caption": "The carousel post caption: hook, 2-3 lines of value, then 'Comment <keyword> and we'll DM you the full guide.' End with 3-4 hashtags for Kenyan beauty.",
    "first_comment": "One line with the article link placeholder: The full guide, free -> https://creviabeauty.com/blog/<slug>",
    "dm_reply": "The DM to send when someone comments the keyword: warm, link to the article, one engagement question.",
    "lead_followup": "The second DM, sent after they open the link: ask for their email or WhatsApp number to get future guides first, and ask the one beauty problem they want solved next. Warm, zero pressure."
  }}
}}

RULES:
- paragraphs are plain text only: no HTML, no markdown.
- NEVER use em dashes anywhere. Use commas, periods, or colons instead.
- Keep carousel slide text short enough to read on a phone (heading <= 8 words, body <= 30 words).
- Carousel "highlight": copy the 1-2 most meaningful words THAT APPEAR in that slide's heading (exact words) so they print in gold. Omit on the final CTA slide.
- Carousel "bullets": use ONE slide as a 3-item list for benefits/qualities/mistakes. Each item is {{ "icon", "text" }} with text 1-3 words. Allowed icons ONLY: user, star, diamond, heart, shield, gift, check, clock, x. Use "x" for mistakes, "check" for do's, user/star/diamond/heart for benefits. A bullets slide has no "body".
- British/Kenyan English. Prices in KES where relevant.
- Return ONLY the JSON object."""


# ---------------------------------------------------------------- runner

def load_calendar_entry(day):
    if not CALENDAR_FILE.exists():
        sys.exit(f"calendar.json not found at {CALENDAR_FILE}")
    calendar = json.loads(CALENDAR_FILE.read_text(encoding="utf-8"))
    for entry in calendar:
        if entry["day"] == day:
            return entry
    sys.exit(f"No calendar entry for day {day} (calendar has {len(calendar)} days)")


def run_once(topic, pillar, product_term, notes, copy_to_clipboard):
    print(f"\n=== Researching: {topic} ===")
    print("  - web search...")
    web = search_web(topic)
    print(f"    {len(web)} findings")
    print("  - news...")
    news = search_news(topic)
    print(f"    {len(news)} items")
    print("  - reddit...")
    reddit = search_reddit(topic)
    print(f"    {len(reddit)} threads")
    print("  - beauty press RSS...")
    headlines = fetch_rss_headlines(topic)
    print(f"    {len(headlines)} headlines")
    print("  - product data from site...")
    product = fetch_product(product_term)
    print(f"    {product['name'] if product else 'no product tie-in'}")

    research_block = format_findings(web, news, reddit, headlines)
    prompt = build_prompt(topic, pillar, product, notes, research_block)

    OUTPUT_DIR.mkdir(exist_ok=True)
    out_file = OUTPUT_DIR / f"{slugify(topic)}-prompt.txt"
    out_file.write_text(prompt, encoding="utf-8")

    print(f"\nPrompt saved: {out_file}")
    if copy_to_clipboard:
        try:
            subprocess.run("clip", input=prompt.encode("utf-16-le"), check=True)
            print("Prompt copied to clipboard.")
        except Exception:
            print("(clipboard copy failed — open the file instead)")
    print("\nNext: paste the prompt into claude.ai, then paste Claude's reply into")
    print("Admin -> Marketing -> Content Studio -> Step 2. The article goes live instantly.")
    return out_file


def run_series(series, copy_to_clipboard):
    print(f"\n=== Series: {series['name']}  ({series['thread']}) ===")
    print("  - picking a product from the catalogue...")
    product = pick_product_for_series(series)
    print(f"    {product['name'] if product else '(no product found, going general)'}")

    q = (product.get("brand") or product.get("name")) if product else series["name"]
    query = series["research"].replace("{q}", q)
    print(f"  - web search: {query}")
    web = search_web(query)
    print(f"    {len(web)} findings")
    print("  - reddit...")
    reddit = search_reddit(query)
    print(f"    {len(reddit)} threads")

    research_block = format_findings(web, [], reddit, [])
    prompt = build_series_prompt(series, product, research_block)

    OUTPUT_DIR.mkdir(exist_ok=True)
    base = f"{series['key']}-{slugify(product['name']) if product else 'general'}"
    out_file = OUTPUT_DIR / f"{base}-prompt.txt"
    out_file.write_text(prompt, encoding="utf-8")

    print(f"\nPrompt saved: {out_file}")
    if copy_to_clipboard:
        try:
            subprocess.run("clip", input=prompt.encode("utf-16-le"), check=True)
            print("Prompt copied to clipboard.")
        except Exception:
            print("(clipboard copy failed, open the file instead)")
    print("\nNext: copy this prompt into claude.ai, then Inject the reply in")
    print("Admin -> Marketing -> Content Studio. Review the draft, carousel, Reel and post-pack, then publish.")
    pid = product.get("id") if product else None
    return {
        "product_id": pid,
        "product_ids": [pid] if pid else [],
        "title": f"{series['name']}: {product['name']}" if product else series["name"],
        "pillar": series["name"],
        "format": "Carousel + Reel",
        "platform": "Instagram",
        "prompt_file": out_file.name,
    }


# ── YouTube origin-story essays (weekly) ──────────────────────────────────
# Different muscle from the carousel series: a 6-8 min narrative essay about why
# a fragrance exists. The reply lands in the same inbox but routes to the
# YouTube Scripts processor (the file name carries a youtube- prefix).

def clean_fragrance_name(name):
    """Strip SKU noise (size, decant, em dashes) so the essay names the fragrance,
    not the listing, e.g. 'Tom Ford Black Orchid — 10ml Decant' -> 'Tom Ford Black Orchid'."""
    if not name:
        return name
    n = re.sub(r"\s*[—–-]\s*\d+\s*ml.*$", "", name, flags=re.I)   # drop a '— 10ml Decant' tail
    n = n.replace("—", ", ").replace("–", ", ")
    n = re.sub(r"\b\d+\s*ml\b", "", n, flags=re.I)
    n = re.sub(r"\bdecant\b", "", n, flags=re.I)
    n = re.sub(r"\s{2,}", " ", n).strip(" ,-")
    return n or name


def pick_youtube_product():
    """Rotate weekly through the perfume catalogue (separate counter from series)."""
    products = [p for p in (fetch_products("Perfumes") or fetch_products() or []) if p.get("name")]
    if not products:
        return None
    try:
        rot = json.loads(ROTATION_FILE.read_text(encoding="utf-8"))
    except Exception:
        rot = {}
    idx = rot.get("youtube", 0) % len(products)
    rot["youtube"] = idx + 1
    OUTPUT_DIR.mkdir(exist_ok=True)
    ROTATION_FILE.write_text(json.dumps(rot, indent=2), encoding="utf-8")
    return products[idx]


def build_youtube_prompt(product):
    name = clean_fragrance_name(product["name"]) if product else "a classic designer fragrance"
    return f"""You are a fragrance historian and narrative essayist writing a YouTube video script for CreviaBeauty, a premium fragrance house in Nairobi, Kenya. This is NOT a review. It is a 6 to 8 minute narrative essay about the ORIGIN and MEANING of one fragrance: why it exists, who created it, what they were solving for, and what it was really selling.

FRAGRANCE: {name}

First research carefully. Prefer authoritative fragrance sources: Fragrantica and Basenotes for the perfumer, launch year and notes; the brand's own house and press material; and industry press such as WWD. Treat Wikipedia as a cross-check only, never your main source. Find: the perfumer(s) and house, the launch year and market moment, the creative brief, the competing scents at the time, the notes and what they evoke, and how the culture received it and wears it now. If sources disagree, or you cannot confirm a specific name, date, note or ranking, do NOT state it as fact in the script.

Then write a flowing SPOKEN essay, first person, warm and intelligent, never salesy, structured as: 1) COLD OPEN (0:00 to 0:30) one arresting idea that reframes the fragrance, no "hi guys welcome back"; 2) THE PERSON AND THE BRIEF; 3) THE MOMENT it launched into; 4) WHAT IT WAS REALLY SELLING (power, accessibility, rebellion, nostalgia) which is the heart; 5) THE LEGACY; 6) SOFT CLOSE with one reflective line and a light contextual CTA.

Return ONE JSON object, no text before or after, exactly this shape:
{{
  "type": "crevia-youtube",
  "fragrance": "{name}",
  "titles": ["3 SEO YouTube titles"],
  "hook": "the cold-open lines",
  "script": "the full spoken script, 900 to 1200 words, plain text with paragraph breaks, no markdown",
  "chapters": [{{"time": "0:00", "title": "chapter title"}}],
  "thumbnail_text": "3 to 5 punchy words",
  "seo_description": "150 to 200 word description, ending with: Explore the collection at https://creviabeauty.com",
  "tags": ["8 to 12 search tags"],
  "facts_to_verify": ["each specific name, date, note or ranking to confirm before filming, or [] if fully confident"],
  "pinned_comment": "I cover the why behind fragrances, not just reviews. Full collection at CreviaBeauty: https://creviabeauty.com",
  "carousel": [
    {{"heading": "Hook from the core idea", "body": "1-2 short lines"}},
    {{"heading": "Story beat 1", "body": "1-2 short lines"}},
    {{"heading": "Story beat 2", "body": "1-2 short lines"}},
    {{"heading": "What it was really selling", "body": "1-2 short lines"}},
    {{"heading": "Watch the full story", "body": "The full essay is on our YouTube. @creviabeauty"}}
  ]
}}

RULES:
- British / Kenyan English.
- NEVER use em dashes. Use commas, periods or colons.
- It is a history and a story, never a sales pitch.
- NEVER name your source in the narration. Do not say "according to Wikipedia" or similar.
- If unsure of any specific name, date, note or ranking, leave it OUT of the script and list it in facts_to_verify.
- "carousel" is a 5-slide Instagram teaser, last slide points to YouTube.
- Return ONLY the JSON object."""


def run_youtube(copy_to_clipboard):
    print("\n=== YouTube origin-story (weekly) ===")
    product = pick_youtube_product()
    print(f"    {product['name'] if product else '(no perfume found, going general)'}")
    prompt = build_youtube_prompt(product)
    OUTPUT_DIR.mkdir(exist_ok=True)
    slug = slugify(product["name"]) if product else "fragrance"
    out_file = OUTPUT_DIR / f"youtube-{slug}-prompt.txt"
    out_file.write_text(prompt, encoding="utf-8")
    print(f"\nYouTube prompt saved: {out_file}")
    if copy_to_clipboard:
        try:
            subprocess.run("clip", input=prompt.encode("utf-16-le"), check=True)
            print("Prompt copied to clipboard.")
        except Exception:
            print("(clipboard copy failed, open the file instead)")
    print("Next: copy into claude.ai, then Inject the reply in the Prompt Inbox. It saves to YouTube Scripts.")
    return out_file


# ── Product posts (single image + caption), coverage-aware ────────────────
# The calendar knows which products have NOT been posted about. We ask it for the
# least-covered products and generate a real caption prompt for each, so the system
# decides what to post (no manual planning) and never repeats a product needlessly.

def fetch_uncovered(count=3, category=None):
    """Least-covered products from the content calendar's coverage brain."""
    if not ENGINE_TOKEN:
        print("  [warn] CONTENT_ENGINE_TOKEN not set; cannot read coverage, using catalog order.")
        return []
    try:
        params = {"count": count, "token": ENGINE_TOKEN}
        if category:
            params["category"] = category
        r = requests.get(f"{SITE_URL}/api/engine/uncovered", params=params, timeout=10)
        r.raise_for_status()
        return r.json().get("products", [])
    except Exception as e:
        print(f"  [warn] coverage fetch failed: {e}")
        return []


def build_product_post_prompt(product):
    """A claude.ai prompt that outputs a single-image Instagram product post caption pack."""
    name = product.get("name") or "this product"
    price = f"KES {int(float(product['price'])):,}" if product.get("price") else "-"
    link = f"{SITE_URL}/products?search={quote(name)}"
    return f"""You are the social copywriter for Crevia Beauty, a premium AUTHENTIC beauty and fragrance store in Nairobi, Kenya (creviabeauty.com). Write ONE single-image Instagram product post (NOT a carousel) for the product below. Short-form, scroll-stopping, native to the feed. Kenyan English, prices in KES. Crevia competes on identity and trust, never on being the cheapest. Style nods to Alex Hormozi: name the desire or pain, show why THIS product answers it, make the offer clear.

THE PRODUCT:
- Name: {name}
- Brand: {product.get('brand') or '-'}
- Category: {product.get('category') or '-'}
- Scent family: {product.get('scent_family') or '-'}
- Price: {price}
- Description: {product.get('description') or '-'}
- Product link (use as first_comment link): {link}
- Product image (use as image_url, or omit): {product.get('image_url') or '(none)'}

Return ONE JSON object, no text before or after, no markdown outside the JSON, exactly this shape:

{{
  "type": "crevia-product-post",
  "product": "{name}",
  "on_image_text": "3 to 6 word scroll-stopper to print on the image",
  "caption": "2 to 4 short lines: the desire or problem, why this product, the KES price, then 'Comment <keyword> and we will DM you the link.' End with 3 to 4 Kenyan beauty hashtags.",
  "dm_keyword": "ONE short uppercase word to comment for the link",
  "first_comment": "One line with the product link.",
  "dm_reply": "The warm DM to send when they comment the keyword: the link and one engagement question.",
  "image_direction": "One sentence on how to shoot or style the single image: props, background, angle."
}}

RULES:
- Single image, not a carousel. Punchy, native to the feed.
- Kenyan English, KES prices. NEVER use em dashes; use commas, periods or colons.
- Return ONLY the JSON object."""


def build_product_story_prompt(product):
    """A claude.ai prompt for an EDUCATIONAL STORYTELLING carousel about a product:
    the idea, how it came to be, the founder/brand motivation, why people connect.
    Outputs the same crevia-article JSON as the series carousels, so it publishes
    through the existing Content Studio (blog + carousel + social pack)."""
    name = product.get("name") or "this product"
    price = f"KES {int(float(product['price'])):,}" if product.get("price") else "-"
    link = product.get("link") or f"/products?search={quote(name)}"
    image = product.get("image_url") or "(none, omit hero_image_url)"
    return f"""You are the senior brand storyteller for Crevia Beauty, a premium AUTHENTIC beauty and fragrance store in Nairobi, Kenya (creviabeauty.com). Write an EDUCATIONAL STORYTELLING carousel about the product below. Not a sales pitch: a story that makes people CONNECT with it. Tell the idea behind it, how it came to be, the motivation and inspiration of the people or house who created it, the desire or problem it was born from, and why it still matters today. Warm, intelligent, a little aspirational. Kenyan English, prices in KES. Crevia competes on identity and trust, never on being cheapest. No em dashes.

THE PRODUCT:
- Name: {name}
- Brand / house: {product.get('brand') or '-'}
- Category: {product.get('category') or '-'}
- Scent family: {product.get('scent_family') or '-'}
- Price: {price}
- Description: {product.get('description') or '-'}
- Product link (use as cta_link): {link}
- Product image (use as hero_image_url): {image}

First research the REAL story: the house or brand behind {name}, who created it and why, the year and moment it launched into, and what it was really made for. Then research the CRAFT: the scent family and the note pyramid (top, heart, base), and most importantly HOW those note choices serve the intention, why each accord was chosen, the signature accord or the note discovery that makes it what it is, and how the composition builds the exact feeling the creator was chasing. If this is not a fragrance, cover the key ingredients or design choices and why they were chosen instead. Prefer authoritative sources (for fragrances, houses like Fragrantica and Basenotes for the perfumer, year and notes). If you cannot confirm a specific name, date, note or fact, do NOT state it as fact: keep that beat general and list the unconfirmed specifics in facts_to_verify.

Return ONE JSON object, no text before or after, no markdown outside the JSON, exactly this shape:

{{
  "type": "crevia-article",
  "title": "A story-driven headline, not just the product name",
  "slug": "short-kebab-case-slug",
  "category": "Product Story",
  "meta_title": "Under 60 characters",
  "meta_description": "Under 155 characters: the story hook and a soft CTA",
  "tags": ["3-5", "seo", "tags"],
  "hero_image_url": "the product image URL above, or omit this field",
  "intro": "One paragraph that opens the story and the emotional hook",
  "sections": [
    {{ "heading": "The Idea", "paragraphs": ["the desire or problem it was born from, 2-3 short paragraphs"] }},
    {{ "heading": "The Story", "paragraphs": ["how it came to be, the motivation and the people behind it"] }},
    {{ "heading": "The Notes That Carry It", "paragraphs": ["the scent family and the note pyramid, and how those note choices serve the intention: why each accord was chosen and how they build the feeling. For a non-fragrance, the key ingredients and why."] }},
    {{ "heading": "Why It Connects", "paragraphs": ["what it means to the person who wears or uses it today"] }}
  ],
  "cta_text": "1-2 warm sentences inviting them to make it theirs, tied to {name}",
  "cta_link": "the product link above",
  "carousel": [
    {{ "heading": "Hook: an arresting line from the story", "highlight": "1-2 words from this heading", "body": "1-2 short lines" }},
    {{ "heading": "The idea it was born from", "highlight": "1-2 key words", "body": "1-2 short lines" }},
    {{ "heading": "How it came to be", "highlight": "1-2 key words", "body": "1-2 short lines" }},
    {{ "heading": "The notes that carry the feeling", "highlight": "1-2 key words", "body": "the scent family or signature accord, and the intention it serves, in 1-2 short lines" }},
    {{ "heading": "What it gives you", "bullets": [ {{ "icon": "heart", "text": "Feeling" }}, {{ "icon": "star", "text": "Feeling" }}, {{ "icon": "diamond", "text": "Feeling" }} ] }},
    {{ "heading": "Why it still matters", "highlight": "1-2 key words", "body": "1-2 short lines" }},
    {{ "heading": "Make it yours", "body": "Comment the keyword below and we will DM you the details. @creviabeauty" }}
  ],
  "social": {{
    "dm_keyword": "ONE short uppercase word to comment for the link, themed to the story",
    "caption": "The story hook in 2-3 lines, then 'Comment <keyword> and we will DM you the details.' End with 3-4 Kenyan beauty hashtags.",
    "first_comment": "One line: the product, here -> https://creviabeauty.com{link}",
    "dm_reply": "Warm DM with the link and one question about what draws them to it.",
    "lead_followup": "Second DM after they open the link: ask for their email or WhatsApp to hear these stories first."
  }},
  "facts_to_verify": ["each specific name, date or claim to confirm before posting, or [] if fully confident"]
}}

RULES:
- It is a STORY, educational and emotional, never a hard sell.
- paragraphs are plain text only: no HTML, no markdown.
- NEVER use em dashes. Use commas, periods or colons.
- Carousel text short enough to read on a phone (heading <= 8 words, body <= 30 words).
- Carousel "highlight": copy 1-2 words that appear in that slide's heading, to print in gold. Omit on the final CTA slide.
- One carousel slide uses "bullets": a 3-item list, each {{ "icon", "text" }} with text 1-3 words. Icons ONLY: user, star, diamond, heart, shield, gift, check, clock, x.
- Kenyan English, KES prices. Return ONLY the JSON object."""


def run_product_stories(count, copy_to_clipboard=False, products=None):
    """Generate `count` product-story carousel prompts for the least-covered products."""
    print(f"\n=== Product story carousels (x{count}, least-covered first) ===")
    if products is None:
        products = fetch_uncovered(count) or (fetch_products() or [])[:count]
    made = []
    for product in products:
        prompt = build_product_story_prompt(product)
        OUTPUT_DIR.mkdir(exist_ok=True)
        slug = slugify(product.get("name") or f"product-{product.get('id')}")
        out_file = OUTPUT_DIR / f"story-{slug}-prompt.txt"
        out_file.write_text(prompt, encoding="utf-8")
        print(f"  - {product.get('name')}  ->  {out_file.name}")
        pid = product.get("id")
        made.append({
            "product_id": pid,
            "product_ids": [pid] if pid else [],
            "title": f"Story: {product.get('name')}",
            "pillar": "Product Story",
            "format": "Story carousel",
            "platform": "Instagram",
            "prompt_file": out_file.name,
        })
    if not made:
        print("  (no products available)")
    return made


def run_product_posts(count, copy_to_clipboard=False, products=None):
    """Generate `count` product-post prompts. Uses `products` if given, else the
    least-covered products from the coverage brain."""
    print(f"\n=== Product posts (x{count}, least-covered first) ===")
    if products is None:
        products = fetch_uncovered(count) or (fetch_products() or [])[:count]
    made = []
    for product in products:
        prompt = build_product_post_prompt(product)
        OUTPUT_DIR.mkdir(exist_ok=True)
        slug = slugify(product.get("name") or f"product-{product.get('id')}")
        out_file = OUTPUT_DIR / f"product-{slug}-prompt.txt"
        out_file.write_text(prompt, encoding="utf-8")
        print(f"  - {product.get('name')}  ->  {out_file.name}")
        pid = product.get("id")
        made.append({
            "product_id": pid,
            "product_ids": [pid] if pid else [],
            "title": f"Product post: {product.get('name')}",
            "pillar": "Product",
            "format": "Single image",
            "platform": "Instagram",
            "prompt_file": out_file.name,
        })
    if not made:
        print("  (no products available to post about)")
    return made


# Staggered posting slots for the day's plan (Nairobi time), assigned in order.
PLAN_SLOTS = ["09:00", "11:00", "13:00", "15:00", "18:00", "20:00"]


def post_plan(items):
    """Register the day's generated pieces on the content calendar (one row each,
    scheduled at a staggered slot, tied to its product), and fire one plan ping."""
    items = [it for it in (items or []) if it]
    if not items:
        return
    for i, it in enumerate(items):
        it["slot_time"] = PLAN_SLOTS[i % len(PLAN_SLOTS)]
    if not ENGINE_TOKEN:
        print("  [warn] CONTENT_ENGINE_TOKEN not set; prompts are in the inbox but not added to the calendar.")
        return
    try:
        r = requests.post(f"{SITE_URL}/api/engine/plan", json={"items": items},
                          headers={"x-engine-token": ENGINE_TOKEN}, timeout=15)
        r.raise_for_status()
        res = r.json()
        print(f"  - calendar: created {res.get('created')} item(s), skipped {res.get('skipped')}")
    except Exception as e:
        print(f"  [warn] could not add the plan to the calendar: {e}")


def main():
    parser = argparse.ArgumentParser(description="Crevia Beauty research engine")
    parser.add_argument("topic", nargs="?", help="Topic / pain point to research")
    parser.add_argument("--pillar", default="Problem-Solving & Education", help="Content pillar")
    parser.add_argument("--product", default="", help="Product search term for the tie-in (matched against the site catalog)")
    parser.add_argument("--notes", default="", help="Extra context for Claude")
    parser.add_argument("--series", metavar="KEY", help="Run a specific series (spot-the-fake, decoded, scent-for-the-moment, the-layer, punches-above-its-price, your-signature, the-wardrobe)")
    parser.add_argument("--discover", action="store_true", help="Run today's series (weekday rotation). Default when no topic is given.")
    parser.add_argument("--watch", type=float, metavar="HOURS", help="Continuous mode: re-run every N hours")
    parser.add_argument("--copy", action="store_true", help="Copy the prompt to the clipboard")
    parser.add_argument("--youtube", action="store_true", help="Queue a YouTube origin-story prompt (weekly fragrance rotation)")
    parser.add_argument("--product-posts", type=int, metavar="N", default=0, help="Generate N single-image product-post prompts for the least-covered products")
    parser.add_argument("--product-stories", type=int, metavar="N", default=0, help="Generate N product-story carousel prompts for the least-covered products")
    args = parser.parse_args()

    # The weekday the weekly YouTube essay is queued (Wed). Mon=0 .. Sun=6.
    YOUTUBE_WEEKDAY = 2

    # The daily plan: this many product-story carousels + this many single-image
    # product posts, each about a different least-covered product (6/day by default).
    DAILY_STORIES = 3
    DAILY_PRODUCT_POSTS = 3

    # One unit of work: a chosen series, an ad-hoc topic, or today's series by default.
    def do_run():
        if args.youtube:
            run_youtube(args.copy)
            return
        if args.product_posts:
            post_plan(run_product_posts(args.product_posts))
            return
        if args.product_stories:
            post_plan(run_product_stories(args.product_stories))
            return
        if args.topic and not args.series:
            print(f"\n=== Ad-hoc topic: {args.topic} ===")
            web = search_web(args.topic)
            news = search_news(args.topic)
            reddit = search_reddit(args.topic)
            headlines = fetch_rss_headlines(args.topic)
            product = fetch_product(args.product)
            research_block = format_findings(web, news, reddit, headlines)
            prompt = build_prompt(args.topic, args.pillar, product, args.notes, research_block)
            OUTPUT_DIR.mkdir(exist_ok=True)
            out = OUTPUT_DIR / f"{slugify(args.topic)}-prompt.txt"
            out.write_text(prompt, encoding="utf-8")
            print(f"\nPrompt saved: {out}")
        elif args.series:
            # Explicit fragrance series carousel (the 7-day Fragrantica rotation),
            # still available on demand. Registers it on the calendar too.
            carousel = run_series(pick_series(args.series), args.copy)
            post_plan([carousel] if carousel else [])
        else:
            # The daily plan: DAILY_STORIES story carousels + DAILY_PRODUCT_POSTS product
            # posts, each about a DIFFERENT least-covered product (coverage-aware, no manual
            # planning), all registered on the calendar in one shot at staggered times.
            need = DAILY_STORIES + DAILY_PRODUCT_POSTS
            pool = fetch_uncovered(need) or (fetch_products() or [])[:need]
            plan = []
            try:
                plan.extend(run_product_stories(DAILY_STORIES, products=pool[:DAILY_STORIES]))
            except Exception as e:
                print(f"[warn] daily story carousels failed: {e}")
            try:
                plan.extend(run_product_posts(DAILY_PRODUCT_POSTS, products=pool[DAILY_STORIES:need]))
            except Exception as e:
                print(f"[warn] daily product posts failed: {e}")
            post_plan(plan)
            # Once a week, also queue a YouTube origin-story prompt into the inbox.
            if date.today().weekday() == YOUTUBE_WEEKDAY:
                try:
                    run_youtube(args.copy)
                except Exception as e:
                    print(f"[warn] weekly youtube prompt failed: {e}")

    if args.watch:
        print(f"Continuous mode: one post every {args.watch}h (today's series). Ctrl+C to stop.")
        while True:
            # Failures must not exit the process: under PM2 that becomes a restart loop.
            delay_hours = args.watch
            try:
                do_run()
            except Exception as e:
                print(f"[error] run failed: {e}")
                delay_hours = min(args.watch, 4)
            wake = datetime.now().strftime("%H:%M")
            print(f"\nSleeping {delay_hours}h (since {wake})...")
            time.sleep(delay_hours * 3600)
    else:
        do_run()


if __name__ == "__main__":
    main()
