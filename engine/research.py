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
        sys.exit("Discovery found no usable topics — sources may be unreachable. Try --auto (calendar) instead.")

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
            image = p.get("image_url") or ""
            if image.startswith("/"):
                image = SITE_URL + image
            return {
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
    {{ "heading": "Hook — the pain point as a scroll-stopper", "body": "1-2 short lines" }},
    {{ "heading": "The real reason this happens", "body": "1-2 short lines" }},
    {{ "heading": "Fix step 1", "body": "1-2 short lines" }},
    {{ "heading": "Fix step 2", "body": "1-2 short lines" }},
    {{ "heading": "Fix step 3", "body": "1-2 short lines" }},
    {{ "heading": "The result you actually want", "body": "1-2 short lines" }},
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


def main():
    parser = argparse.ArgumentParser(description="Crevia Beauty research engine")
    parser.add_argument("topic", nargs="?", help="Topic / pain point to research")
    parser.add_argument("--pillar", default="Problem-Solving & Education", help="Content pillar")
    parser.add_argument("--product", default="", help="Product search term for the tie-in (matched against the site catalog)")
    parser.add_argument("--notes", default="", help="Extra context for Claude")
    parser.add_argument("--day", type=int, help="Use day N of the 30-day calendar")
    parser.add_argument("--auto", action="store_true", help="Use today's calendar entry (day of month, wraps at 30)")
    parser.add_argument("--discover", action="store_true", help="No topic needed: scan beauty press/news/Reddit and pick a trending topic automatically")
    parser.add_argument("--watch", type=float, metavar="HOURS", help="Continuous mode: re-run every N hours")
    parser.add_argument("--copy", action="store_true", help="Copy the prompt to the clipboard")
    args = parser.parse_args()

    def resolve_task():
        if args.discover:
            topic, pillar, product_term = discover_topic()
            return topic, pillar, product_term, args.notes
        if args.day or args.auto:
            day = args.day or ((date.today().day - 1) % 30) + 1
            entry = load_calendar_entry(day)
            print(f"[calendar] Day {day}: {entry['title']} ({entry['pillar']})")
            return entry["title"], entry["pillar"], entry.get("product", ""), args.notes
        if not args.topic:
            parser.error("Give a topic, or use --day N / --auto for the calendar")
        return args.topic, args.pillar, args.product, args.notes

    if args.watch:
        print(f"Continuous mode: researching every {args.watch}h. Ctrl+C to stop.")
        while True:
            topic, pillar, product_term, notes = resolve_task()
            try:
                run_once(topic, pillar, product_term, notes, args.copy)
            except Exception as e:
                print(f"[error] run failed: {e}")
            wake = datetime.now().strftime("%H:%M")
            print(f"\nSleeping {args.watch}h (since {wake})...")
            time.sleep(args.watch * 3600)
    else:
        topic, pillar, product_term, notes = resolve_task()
        run_once(topic, pillar, product_term, notes, args.copy)


if __name__ == "__main__":
    main()
