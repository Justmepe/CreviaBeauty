// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright config — Phase 2 smoke tests.
 *
 * Defaults to the local dev server on http://localhost:3000. Override with
 *   BASE_URL=https://creviabeauty.com npx playwright test
 * to smoke-test production. Tests use unique-emailed users per run so they
 * don't pollute whichever DB they hit.
 *
 * Run with:  npm run e2e          # headless chromium
 *            npm run e2e:headed   # see the browser
 *            npm run e2e:debug    # step through with the inspector
 */
module.exports = defineConfig({
    testDir: './e2e',
    timeout: 30 * 1000,
    expect: { timeout: 5000 },
    fullyParallel: false,                 // serial — tests share a DB
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        ignoreHTTPSErrors: true
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
    ]
});
