/**
 * Receipt PDF Renderer
 *
 * Turns a rendered receipt HTML page into a PDF Buffer using a headless
 * Chromium (Puppeteer). The PDF page is sized to the 80mm receipt strip and
 * trimmed to the content height, so it prints as one clean continuous slip.
 *
 * A single browser instance is reused across calls and relaunched if it dies.
 */

const puppeteer = require('puppeteer');
const logger = require('./logger');

let browserPromise = null;

async function getBrowser() {
    if (browserPromise) {
        const b = await browserPromise.catch(() => null);
        if (b && b.connected) return b;
        browserPromise = null;
    }
    browserPromise = puppeteer.launch({
        headless: true,
        // --no-sandbox is required to run as root on most Linux servers.
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    return browserPromise;
}

/**
 * @param {string} html  A full receipt HTML document (from renderReceiptPage).
 * @returns {Promise<Buffer>} PDF bytes.
 */
async function htmlToPdf(html) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
        // Print media hides the toolbar and matches the receipt's print styles.
        await page.emulateMediaType('print');
        // Make sure the brand webfonts have painted before measuring/printing.
        await page.evaluate(() => document.fonts && document.fonts.ready);

        const heightPx = await page.evaluate(() => {
            const sheet = document.querySelector('.sheet');
            return Math.ceil((sheet ? sheet.scrollHeight : document.body.scrollHeight) + 4);
        });

        return await page.pdf({
            printBackground: true,
            width: '80mm',
            height: `${heightPx}px`,
            margin: { top: '0', bottom: '0', left: '0', right: '0' },
            pageRanges: '1'
        });
    } finally {
        await page.close().catch(() => {});
    }
}

// Best-effort shutdown for graceful exits.
async function closeBrowser() {
    if (!browserPromise) return;
    try {
        const b = await browserPromise;
        await b.close();
    } catch (e) {
        logger.warn('Receipt browser close failed', { error: e.message });
    }
    browserPromise = null;
}

module.exports = { htmlToPdf, closeBrowser };
