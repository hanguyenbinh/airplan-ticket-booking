import { test, expect } from '@playwright/test';

test.describe('User booking flow', () => {
  test('search page loads and can open book flow', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Find Your Flight/i })).toBeVisible();
    await page.getByRole('button', { name: /Search Flights/i }).click();
    await page.getByText(/Found|No flights/i).first().waitFor({ state: 'visible', timeout: 15000 });
    const selectBtn = page.getByRole('button', { name: /Select/i }).first();
    if (await selectBtn.isVisible()) {
      await selectBtn.click();
      await expect(page.getByRole('heading', { name: /Book Flight/i })).toBeVisible({ timeout: 10000 });
    }
  });
});
