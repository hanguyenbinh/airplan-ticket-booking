import { test, expect } from '@playwright/test';

test.describe('Admin pages', () => {
  test('admin bookings route renders', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible({ timeout: 15000 });
  });

  test('admin inventory route renders', async ({ page }) => {
    await page.goto('/admin/inventory');
    await expect(page.getByRole('heading', { name: 'Seat Map' })).toBeVisible({ timeout: 15000 });
  });

  test('admin pricing route renders', async ({ page }) => {
    await page.goto('/admin/pricing');
    await expect(page.getByRole('heading', { name: 'Dynamic Pricing' })).toBeVisible({ timeout: 15000 });
  });
});
