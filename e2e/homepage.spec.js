// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Homepage smoke', () => {
    test('loads with CreviaBeauty branding (not the old "Furnitures" branding)', async ({ page }) => {
        await page.goto('/');
        // Title contains the brand.
        await expect(page).toHaveTitle(/CreviaBeauty/i);
        // Logo text.
        await expect(page.locator('.logo').first()).toContainText('CreviaBeauty');
        // Search placeholder is for products, not furniture.
        const searchInput = page.locator('#search-input').first();
        await expect(searchInput).toHaveAttribute('placeholder', /beauty product/i);
    });

    test('top bar shows both contact phones', async ({ page }) => {
        await page.goto('/');
        const topBar = page.locator('.top-bar, .contact-info').first();
        await expect(topBar).toContainText('+254 745 853 914');
        await expect(topBar).toContainText('+254 111 768 092');
    });

    test('hero slide renders real content (no raw <a> markup, no [object Object])', async ({ page }) => {
        await page.goto('/');
        // Wait for the hero content to populate (it fetches /api/hero-slides on load).
        const heroContent = page.locator('#hero-content');
        await expect(heroContent).toBeVisible();
        await expect(heroContent.locator('h1')).not.toBeEmpty({ timeout: 10000 });

        // Critical: the description must not contain the literal "<a href=" string
        // (was the original bug where HTML was escaped to text in the Fragrances slide).
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).not.toContain('<a href=');
        expect(bodyText).not.toContain('[object Object]');
    });

    test('category dropdown lists beauty categories', async ({ page }) => {
        await page.goto('/');
        // The dropdown is inside the nav. Items include the seeded beauty cats.
        const nav = page.locator('.dropdown-menu, .nav-dropdown').first();
        await expect(nav).toContainText('Perfumes');
        await expect(nav).toContainText('Makeup');
        await expect(nav).toContainText('Hair Care');
        // And NO legacy furniture cats.
        await expect(nav).not.toContainText('Office Furniture');
        await expect(nav).not.toContainText('Living Room');
    });
});
