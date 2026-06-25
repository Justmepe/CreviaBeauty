# Crevia Research Engine

Automates the research + prompt-generation half of the content loop, so the
only manual step left is the copy/paste with claude.ai (free chat — no API key).

```
research engine (Python, scheduled)          you                    Content Studio (admin)
─────────────────────────────────── ──────────────────── ─────────────────────────────────
scans beauty press / news / Reddit → copy prompt from    → paste Claude's reply in Step 2
researches the chosen topic          Prompt Inbox,        → article is LIVE on /blog
pulls live product data from site    paste into claude.ai → carousel ready as PNG / PDF
writes prompt → Prompt Inbox
```

## Commands

```powershell
# Today's series (weekday rotation), fills the admin Prompt Inbox
python engine/research.py --discover

# A specific series (any day)
python engine/research.py --series spot-the-fake
python engine/research.py --series decoded

# Your own ad-hoc topic
python engine/research.py "Why your lip color fades by lunch" --product "Lipstick"

# Continuous mode: one post per run, every 24 hours (leave running / PM2)
python engine/research.py --discover --watch 24
```

## The weekly series (one Fragrantica community thread per weekday)

| Day | `--series` key | Series |
|-----|----------------|--------|
| Mon | `spot-the-fake` | Spot the Fake (authenticity) |
| Tue | `decoded` | Decoded (notes, dry-down, who it's for) |
| Wed | `scent-for-the-moment` | Scent for the Moment (occasion) |
| Thu | `the-layer` | The Layer (layering, multi-item basket) |
| Fri | `punches-above-its-price` | Beast mode value |
| Sat | `your-signature` | Identity / signature |
| Sun | `the-wardrobe` | Building a fragrance wardrobe |

Each run picks the next product in the series' category (deterministic rotation,
no repeats), researches it, and writes a prompt that produces a blog guide,
carousel, **Reel shot-list**, and the comment-to-DM post pack. Prompts land in
`engine/output/*-prompt.txt` and appear in **Admin → Marketing → Content Studio →
Prompt Inbox** with a Copy button.

## Schedule it (so the inbox fills itself)

Windows Task Scheduler — one trending topic every morning at 7:00:

```powershell
schtasks /create /tn "CreviaResearch" /sc daily /st 07:00 `
  /tr "\"C:\Users\Peter Gikonyo\AppData\Local\Programs\Python\Python313\python.exe\" d:\CreviaBeauty\engine\research.py --discover"
```

Add a second task with `--auto` if you also want the calendar-guided article each day.

## Sources & behaviour

- **DuckDuckGo web + news search** (`ddgs` package) — expert guides, mistakes, current coverage
- **Beauty press RSS** — Allure, Glamour, Refinery29 (headlines for trend context)
- **Reddit** — real people describing pain points (often blocked for unauthenticated requests; the engine skips it gracefully)
- **Crevia site API** (`http://localhost:3000`) — live product data for the soft-CTA tie-in

All sources are best-effort: if one is unreachable the prompt is still generated
from the rest. Discovered topics are remembered in `output/used_topics.json` so
the engine never repeats itself.

Dependencies: `pip install requests ddgs`
