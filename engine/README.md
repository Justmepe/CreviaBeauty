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
# Autonomous: discover a trending topic and research it (fills the admin Prompt Inbox)
python engine/research.py --discover

# Guided: research today's entry from the 30-day content calendar (calendar.json)
python engine/research.py --auto

# Specific calendar day, or your own topic
python engine/research.py --day 4
python engine/research.py "Why your lip color fades by lunch" --product "Lipstick"

# Continuous mode: re-run every 24 hours (leave running in a terminal)
python engine/research.py --discover --watch 24
```

Prompts land in `engine/output/*-prompt.txt` and appear automatically in
**Admin → Marketing → Content Studio → Prompt Inbox** with a Copy button.

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
