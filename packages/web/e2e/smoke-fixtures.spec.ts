import { test, expect } from '@playwright/test';

test('loads the shell and renders the sidebar chat', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Q3 Brief')).toBeVisible();
});

test('clicking a chat row loads its messages', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Q3 Brief').click();
  await expect(page.getByText('Hello smoke')).toBeVisible();
});

test('Cmd+K opens the command palette', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Meta+k');
  await expect(page.getByPlaceholder(/jump to chat/i)).toBeVisible();
});
