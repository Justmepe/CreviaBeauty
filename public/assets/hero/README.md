# Animated homepage hero

The homepage hero (`public/index.html` → `<section class="crevia-hero">`) is a
cinematic React animation on desktop and a lightweight dynamic product hero on
mobile. Both are fed live from `/api/products` (newest uploaded products first),
so new products appear in the hero automatically — no redeploy needed.

## Files

| File | Role |
|---|---|
| `../heroe section/animations.jsx` | **Source** — the animation engine (Stage, Sprite, easings). |
| `../heroe section/crevia-scenes.jsx` | **Source** — the scene: categories, copy, product card. |
| `animations.js`, `crevia-scenes.js` | **Generated** — transpiled by `scripts/build-hero.js`. Do not edit. |
| `crevia-hero.js` | Mount + live-data adapter (fetch, group by category, scale, fallback). |
| `crevia-hero.css` | Hero + mobile-fallback styles. |
| `../vendor/react*.min.js` | Vendored React 18 (CSP blocks CDN scripts). |

## How the data flows

`crevia-hero.js` fetches products, keeps the newest 10 image-bearing products
per category, and writes them to `window.CreviaHeroData`. The scene reads that
object every frame, so each category shows your real, newest products. Curated
copy (headline / tag / value bullets per category) lives in `crevia-scenes.jsx`
and stays fixed; only the products are dynamic. Data re-checks every 5 minutes.

A category with no live products falls back to the placeholder list in the JSX.

## Editing

- **Change wording/categories/timing:** edit `crevia-scenes.jsx`, then rebuild:
  ```
  node scripts/build-hero.js
  ```
- **Pacing:** `SEG` in `crevia-scenes.jsx` = seconds each category holds
  (currently 30s; full loop ≈ 274.8s). Products auto-spread across that window.
- **After any change to the generated JS/CSS,** bump the cache-bust version:
  - `crevia-hero.js?v=` and `crevia-hero.css?v=` in `index.html`
  - `window.CREVIA_HERO_VER` inline in `index.html` (busts the lazy-loaded
    React + engine scripts)

## Behaviour notes

- Desktop (`>=768px`): lazy-loads React + engine and mounts the animation.
- Mobile (`<768px`): React is never loaded; a fading product hero renders instead.
- `prefers-reduced-motion`: animation is skipped, static hero shown.
- Animation pauses when the tab is hidden or the hero scrolls out of view.
