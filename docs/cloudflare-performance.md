# Cloudflare performance setup (free plan)

Concrete, free-plan-compatible steps to lift the cache hit ratio (was ~42%) and
fix the www/apex split. All done in the Cloudflare dashboard for `creviabeauty.com`.

Our origin already sends sensible `Cache-Control` headers (static assets 1d,
`/uploads` 7d, product pages 120s, `no-store` on auth/receipt pages), and
static asset URLs are query-versioned (`styles.css?v=6`, `favicon.png?v=2`) so
they can be cache-busted by bumping the version. The rules below build on that.

---

## 1. Cache Rule — cache static assets long at the edge

**Caching → Cache Rules → Create rule.** Name: `Static assets - long cache`.

- When incoming requests match:
  - Field: **URI Path**, Operator: **matches regex**, Value:
    ```
    \.(css|js|png|jpg|jpeg|gif|svg|webp|avif|ico|woff|woff2|ttf|otf|mp4|webm)$
    ```
- Then:
  - **Cache eligibility:** Eligible for cache
  - **Edge TTL:** Override origin, **1 month**
  - **Browser TTL:** Respect origin (keeps our 1-day header for browsers)

Safe because assets are versioned (`?v=`). To force a refresh, bump the `?v=`
in the HTML (or Purge Cache in the dashboard).

## 2. Cache Rule — never cache dynamic/auth routes

**Create rule.** Name: `Bypass dynamic`. Put it **above** rule #1 (rules run top-down).

- When incoming requests match:
  - Field: **URI Path**, Operator: **matches regex**, Value:
    ```
    ^/(api|admin|cart|login|register|customer|marketer|my-orders|my-rewards|wishlist|receipt|r/|checkout)
    ```
- Then: **Cache eligibility → Bypass cache**

(Belt-and-suspenders — our app already sends `no-store` on these, but this
guarantees the edge never holds a personalized page.)

## 3. Redirect www → apex (fixes the DNS split)

DNS analytics showed both `creviabeauty.com` (990) and `www.creviabeauty.com`
(510) resolving. Our canonicals point to the bare apex, so www must 301 to apex
to consolidate ranking signals.

**Rules → Redirect Rules → Create rule.** Name: `www to apex`.

- When: Field **Hostname**, Operator **equals**, Value `www.creviabeauty.com`
- Then: **Static redirect** →
  - Type: **301 Permanent**
  - URL: `https://creviabeauty.com` + preserve path/query (use dynamic
    "Preserve query string" toggle, or expression:
    `concat("https://creviabeauty.com", http.request.uri.path)`)

## 4. Free toggles worth flipping

- **Speed → Optimization → Content Optimization:** enable **Brotli** (usually on),
  **Early Hints**, **Rocket Loader** (test — can break JS; verify the storefront
  after enabling).
- **Caching → Tiered Cache:** enable (free, improves hit ratio via a hub tier).
- **Speed → Optimization → Image Optimization:** Polish/Mirage are **Pro-only** —
  not available on free. That's why we compress images manually (see below).

---

## Image weight baseline (optimized 2026-07-03)

Manual compression with `sharp` (no Polish on free plan):

| Asset | Before | After | Notes |
|---|---|---|---|
| `assets/favicon.png` | 112 KB | 34 KB | 512x512, every page (favicon + apple-icon + nav) |
| `assets/Logo.png` | 2044 KB | 8 KB | resized 1536x1024 → 600x400; schema logo + blog fallback |
| `images/og-image.jpg` | 1071 KB | 19 KB | resized to spec 1200x630, mozjpeg q82 |

Total ~3.1 MB removed. Re-run: `node scripts/optimize-images.js` (keeps `.bak`).

## How to measure (no field CWV yet — traffic too low)

Run a **lab** test since Google has no real-user data yet:
- https://pagespeed.web.dev → test `https://creviabeauty.com` and one product URL.
- Watch: **LCP** (target <2.5s), **CLS** (<0.1), **TBT** (<200ms), total page weight.
- Re-test after this deploy to confirm the image savings landed.
