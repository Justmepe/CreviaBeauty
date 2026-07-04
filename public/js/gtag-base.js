/**
 * CreviaBeauty - Google Ads global tag (gtag.js) + conversion helpers.
 *
 * Loaded (deferred) in the <head> of every page. The Tag ID and conversion
 * labels live here so they're defined in ONE place, not copied across pages.
 *
 * Conversions currently wired:
 *   - Purchase  -> fired from cart.html when an order is placed (real KES value)
 *   - Contact   -> fired on WhatsApp click (label added once created in Google Ads)
 */
(function () {
    var AW_ID = 'AW-18299285655';

    // Conversion labels (the part after the slash in Google Ads' event snippet).
    var LABELS = {
        purchase: 'gsSeCIaw1MocEJfh45VE',
        whatsapp: '6iURCP-F78ocEJfh45VE'
    };

    // Load the gtag.js library from Google (async — non-blocking).
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + AW_ID;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', AW_ID);

    /**
     * Purchase conversion. Called from the checkout success handler with the
     * real order id + total so Google records revenue (in KES), not a placeholder.
     */
    window.gtagPurchase = function (orderId, total) {
        gtag('event', 'conversion', {
            send_to: AW_ID + '/' + LABELS.purchase,
            value: Number(total) || 0,
            currency: 'KES',
            transaction_id: String(orderId || '')
        });
    };

    /**
     * WhatsApp / Contact conversion. Fires when a visitor opens WhatsApp to reach
     * us. No-op until the Contact conversion action exists in Google Ads and its
     * label is filled into LABELS.whatsapp above.
     */
    window.gtagWhatsApp = function () {
        if (!LABELS.whatsapp) return;
        gtag('event', 'conversion', { send_to: AW_ID + '/' + LABELS.whatsapp });
    };

    // Catch clicks on any WhatsApp link anywhere on the site (including links
    // added to the DOM later), so we don't have to hand-wire every button.
    document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest && e.target.closest('a[href]');
        if (a && /(?:wa\.me|api\.whatsapp\.com|wa\.link)/i.test(a.getAttribute('href') || '')) {
            window.gtagWhatsApp();
        }
    }, true);
})();
