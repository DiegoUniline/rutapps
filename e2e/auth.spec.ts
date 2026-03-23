import { test, expect } from '../playwright-fixture';

test.describe('Auth flows', () => {
  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[placeholder*="correo" i], input[placeholder*="email" i]')).toBeVisible({ timeout: 10000 });
  });

  test('protected route redirects to login without session', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/(login|$)/, { timeout: 10000 });
    const url = page.url();
    expect(url.includes('/login') || url.endsWith('/')).toBeTruthy();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.locator('input[type="email"], input[placeholder*="correo" i]').first();
    const passInput = page.locator('input[type="password"]').first();
    await emailInput.fill('fake@invalid.com');
    await passInput.fill('wrongpassword123');
    await page.locator('button[type="submit"]').first().click();
    const errorVisible = await page.locator('[role="alert"], .text-destructive, [data-sonner-toast]').first().isVisible({ timeout: 8000 }).catch(() => false);
    expect(errorVisible).toBeTruthy();
  });
});
