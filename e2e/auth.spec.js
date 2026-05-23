// @ts-check
const { test, expect } = require('@playwright/test');
const { randomUser } = require('./helpers');

// Submit the auth form by its #id — NOT a generic button[type="submit"], because the
// pages also contain a #search-form (header search bar) which would steal the submit.
async function submitForm(page, formId) {
    await page.locator(`#${formId} button[type="submit"]`).click();
}

async function registerNewCustomer(page, u) {
    await page.goto('/register');
    await page.fill('#name', u.name);
    await page.fill('#email', u.email);
    if (await page.locator('#phone').count()) await page.fill('#phone', u.phone);
    await page.fill('#password', u.password);
    const confirmField = page.locator('#confirmPassword, #confirm-password');
    if (await confirmField.count()) await confirmField.fill(u.password);
    await submitForm(page, 'register-form');
}

test.describe('Customer register + login through the UI', () => {
    test('register form creates an account and lands the user back on the home page', async ({ page }) => {
        const u = randomUser('e2ereg');
        await registerNewCustomer(page, u);

        // Customer-account registration redirects to home (per register.html).
        await expect(page).toHaveURL(/\/(\?|$)|^[^?]*\/$/, { timeout: 10000 });
        // Either way, the session should now report logged-in.
        const userJson = await page.request.get('/api/user').then(r => r.json());
        expect(userJson.loggedIn).toBe(true);
        expect(userJson.user.email).toBe(u.email);
    });

    test('login with wrong password shows a real error message, not [object Object]', async ({ page }) => {
        const u = randomUser('e2ewrong');
        await registerNewCustomer(page, u);
        await page.waitForLoadState('networkidle');
        await page.request.post('/logout');

        // Attempt login with wrong password.
        await page.goto('/login');
        await page.fill('#email', u.email);
        await page.fill('#password', 'TotallyWrongPassword99!');
        await submitForm(page, 'login-form');

        const alert = page.locator('#alert-container .alert-error');
        await expect(alert).toBeVisible({ timeout: 10000 });
        await expect(alert).toContainText(/invalid|incorrect|wrong|email|password/i);
        await expect(alert).not.toContainText('[object Object]');
    });

    test('admin login redirects to /admin', async ({ page }) => {
        await page.goto('/login');
        await page.fill('#email', 'admin@creviabeauty.com');
        await page.fill('#password', 'admin123');
        await submitForm(page, 'login-form');

        await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });
        await expect(page.locator('body')).not.toContainText('[object Object]');
    });
});
