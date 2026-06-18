/* ───────────────────────────────────────────────────────────────────────────
 * CreviaBeauty animated hero — mount + live-data adapter.
 *
 * - Pulls products from /api/products, groups them by category, newest upload
 *   first, and exposes them as window.CreviaHeroData for the scene to read.
 * - Desktop (>=768px): lazy-loads React + the transpiled animation engine and
 *   mounts the cinematic scene with a custom no-chrome timeline loop (no
 *   scrubber/play bar). The 1920x900 canvas is scaled to fit responsively.
 * - Mobile (<768px): skips React entirely and renders a lightweight, dynamic
 *   fading product hero from the same data.
 * - Refreshes the data every REFRESH_MS so newly uploaded products appear
 *   without a redeploy.
 *
 * The engine JS is generated from the .jsx sources — see scripts/build-hero.js.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var BASE = '/assets/hero/';
  var VENDOR = '/assets/vendor/';
  var VER = window.CREVIA_HERO_VER || 'v1';      // bump to cache-bust
  var REFRESH_MS = 5 * 60 * 1000;                // re-check products every 5 min
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  var PORTRAIT = window.matchMedia('(orientation: portrait)');
  // The animation runs on every device now (landscape + portrait scenes); only
  // a reduced-motion preference falls back to the static product hero.
  function animationAllowed() { return !REDUCED.matches; }
  // Pick the scene component + canvas dimensions for the current orientation.
  function pickScene() {
    if (PORTRAIT.matches && window.CreviaScenesMobile) {
      return { comp: window.CreviaScenesMobile, W: 900, H: 1600, mode: 'portrait' };
    }
    return { comp: window.CreviaScenes, W: 1920, H: 900, mode: 'landscape' };
  }

  // The nine curated categories, in scene order. Live products are matched to
  // these by name; anything else from the catalog is ignored by the hero.
  var CATEGORY_ORDER = ['Perfumes', 'Skincare', 'Hair'];

  function v(url) { return url + '?' + VER; }

  // Cache the last good payload so repeat visits paint product images instantly
  // (no text-only flash) before the network fetch returns. Refreshed below.
  var CACHE_KEY = 'creviaHero:' + VER;
  var CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
  function loadCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.t || (Date.now() - o.t) > CACHE_TTL) return null;
      return o.data;
    } catch (e) { return null; }
  }
  function saveCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (e) {}
  }

  // ── data ──────────────────────────────────────────────────────────────────
  // Fetch up to a few pages and keep the newest, image-bearing products per
  // category. Returns { byCategory, newest } where newest is a flat, newest-
  // first list used by the mobile fallback.
  function fetchProducts() {
    var all = [];
    function page(p) {
      return fetch('/api/products?limit=100&page=' + p)
        .then(function (r) { return r.json(); })
        .then(function (res) {
          var batch = (res && res.data) || (Array.isArray(res) ? res : []);
          all = all.concat(batch);
          var pages = res && res.pagination && res.pagination.pages;
          if (pages && p < pages && p < 3) return page(p + 1);
        });
    }
    return page(1).then(function () { return build(all); });
  }

  function ts(p) {
    var d = p.created_at ? Date.parse(p.created_at) : 0;
    return isNaN(d) ? 0 : d;
  }

  function build(products) {
    var withImg = products.filter(function (p) { return p.image_url; });
    withImg.sort(function (a, b) { return ts(b) - ts(a); }); // newest first

    var byCategory = {};
    CATEGORY_ORDER.forEach(function (cat) {
      byCategory[cat] = withImg
        .filter(function (p) { return p.category === cat; })
        .slice(0, 10)
        .map(toCard);
    });
    return { byCategory: byCategory, newest: withImg.slice(0, 6).map(toCard) };
  }

  function toCard(p) {
    var price = Number(p.price) || 0;
    var was = p.original_price != null ? Number(p.original_price) : null;
    return {
      name: p.name || '',
      price: price,
      was: was && was > price ? was : null,
      img: p.image_url,
      category: p.category || ''
    };
  }

  // ── mobile / fallback hero (vanilla, no React) ──────────────────────────────
  var fbTimer = null, fbIdx = 0;
  function renderFallback(data) {
    var el = document.getElementById('crevia-hero-fallback');
    if (!el) return;
    var items = (data && data.newest) || [];
    if (!items.length) return; // keep the static markup already in the page

    el.innerHTML =
      items.map(function (p, i) {
        return '' +
          '<div class="ch-fb-slide' + (i === 0 ? ' active' : '') + '">' +
            '<div class="ch-fb-img" style="background-image:url(\'' + esc(p.img) + '\')"></div>' +
            '<div class="ch-fb-info">' +
              '<span class="ch-fb-badge">New In · ' + esc(p.category || 'Beauty') + '</span>' +
              '<h1 class="ch-fb-name">' + esc(p.name) + '</h1>' +
              '<div class="ch-fb-price">' + kes(p.price) +
                (p.was ? ' <s>' + kes(p.was) + '</s>' : '') +
              '</div>' +
              '<div class="ch-fb-cta">' +
                '<a class="btn" href="/products?category=' + encodeURIComponent(p.category) + '">Shop Now</a>' +
                '<a class="btn btn-outline-white" href="/products">View All</a>' +
              '</div>' +
            '</div>' +
          '</div>';
      }).join('') +
      '<div class="ch-fb-dots">' +
        items.map(function (_, i) {
          return '<span class="ch-fb-dot' + (i === 0 ? ' active' : '') + '"></span>';
        }).join('') +
      '</div>';

    fbIdx = 0;
    if (fbTimer) clearInterval(fbTimer);
    // Always rotate when there's more than one slide. The fallback is shown
    // whenever the desktop animation isn't mounted (mobile, tablet, reduced
    // motion, or while React is still loading), so it must never be frozen.
    // If the animation later mounts and hides the fallback, ticking the hidden
    // element is cheap and harmless.
    if (items.length > 1) {
      fbTimer = setInterval(function () { fbStep(el, items.length); }, 4500);
    }
  }

  function fbStep(el, n) {
    var slides = el.querySelectorAll('.ch-fb-slide');
    var dots = el.querySelectorAll('.ch-fb-dot');
    if (!slides.length) return;
    slides[fbIdx].classList.remove('active');
    if (dots[fbIdx]) dots[fbIdx].classList.remove('active');
    fbIdx = (fbIdx + 1) % n;
    slides[fbIdx].classList.add('active');
    if (dots[fbIdx]) dots[fbIdx].classList.add('active');
  }

  function kes(n) { return 'KES ' + Number(n || 0).toLocaleString('en-KE'); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // ── animation (landscape on wide screens, portrait 9:16 on phones) ──────────
  var loadingAnim = false, animReady = false, scaleObserver = null, root = null, currentMode = null;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = false; // preserve order
      s.onload = res; s.onerror = function () { rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function loadAnimation() {
    if (loadingAnim || animReady) return Promise.resolve();
    loadingAnim = true;
    // React first, then the engine, then the scene (each depends on the prior).
    return loadScript(v(VENDOR + 'react.production.min.js'))
      .then(function () { return loadScript(v(VENDOR + 'react-dom.production.min.js')); })
      .then(function () { return loadScript(v(BASE + 'animations.js')); })
      .then(function () { return loadScript(v(BASE + 'crevia-scenes.js')); })
      .then(mountAnimation)
      .catch(function (e) { console.error('[crevia-hero] animation load failed', e); });
  }

  function mountAnimation() {
    var React = window.React, ReactDOM = window.ReactDOM;
    var canvas = document.getElementById('crevia-hero-canvas');
    var wrap = document.getElementById('crevia-hero-wrap');
    if (!React || !ReactDOM || !canvas || !wrap || !window.CreviaScenes || !window.TimelineContext) return;

    var sel = pickScene();
    currentMode = sel.mode;
    var DURATION = Number(window.CREVIA_DURATION) || 95;

    // Size the canvas to this scene's native resolution; the wrap mirrors its
    // aspect ratio so the contain-scale below fills it with no letterboxing.
    canvas.style.width = sel.W + 'px';
    canvas.style.height = sel.H + 'px';
    wrap.style.aspectRatio = sel.W + ' / ' + sel.H;

    function HeroStage() {
      var useState = React.useState, useRef = React.useRef, useEffect = React.useEffect;
      var t = useState(0), time = t[0], setTime = t[1];
      var raf = useRef(0), last = useRef(null), paused = useRef(false);

      useEffect(function () {
        function step(now) {
          if (!paused.current) {
            if (last.current == null) last.current = now;
            var dt = (now - last.current) / 1000; last.current = now;
            setTime(function (prev) { var n = prev + dt; return n >= DURATION ? n % DURATION : n; });
          } else {
            last.current = now;
          }
          raf.current = requestAnimationFrame(step);
        }
        raf.current = requestAnimationFrame(step);

        function onVis() { paused.current = document.hidden; }
        document.addEventListener('visibilitychange', onVis);

        // Pause when the hero is scrolled out of view (saves CPU/battery).
        var io = null;
        if ('IntersectionObserver' in window) {
          io = new IntersectionObserver(function (en) {
            paused.current = !en[0].isIntersecting || document.hidden;
          }, { threshold: 0.01 });
          io.observe(canvas);
        }
        return function () {
          cancelAnimationFrame(raf.current);
          document.removeEventListener('visibilitychange', onVis);
          if (io) io.disconnect();
        };
      }, []);

      return React.createElement(
        window.TimelineContext.Provider,
        { value: { time: time, duration: DURATION, playing: true } },
        React.createElement(sel.comp)
      );
    }

    if (!root) root = ReactDOM.createRoot(canvas);
    root.render(React.createElement(HeroStage));
    animReady = true;

    // Contain-scale the fixed-resolution canvas into the wrap.
    function rescale() {
      if (!wrap) return;
      var s = Math.min(wrap.clientWidth / sel.W, wrap.clientHeight / sel.H);
      canvas.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
    }
    if (scaleObserver) scaleObserver.disconnect();
    if ('ResizeObserver' in window) {
      scaleObserver = new ResizeObserver(rescale);
      scaleObserver.observe(wrap);
    } else {
      window.addEventListener('resize', rescale);
    }
    document.body.classList.add('crevia-hero-live');
    requestAnimationFrame(rescale);
  }

  // Re-compose the scene when the device rotates between portrait and landscape.
  function onOrientationChange() {
    if (animReady && pickScene().mode !== currentMode) mountAnimation();
  }

  // ── orchestration ───────────────────────────────────────────────────────────
  function refresh() {
    return fetchProducts().then(function (data) {
      window.CreviaHeroData = data.byCategory; // scene reads this every frame
      renderFallback(data);
      saveCache(data);
    }).catch(function (e) { console.error('[crevia-hero] data fetch failed', e); });
  }

  function init() {
    // Instant paint from cache (if any), then refresh from the network.
    var cached = loadCache();
    if (cached) {
      window.CreviaHeroData = cached.byCategory;
      renderFallback(cached);
    }
    refresh().then(function () {
      if (animationAllowed()) loadAnimation();
    });
    // Swap landscape <-> portrait scene on rotation.
    if (PORTRAIT.addEventListener) PORTRAIT.addEventListener('change', onOrientationChange);
    else if (PORTRAIT.addListener) PORTRAIT.addListener(onOrientationChange);

    setInterval(refresh, REFRESH_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
