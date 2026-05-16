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

test('triage happy path', async ({ page }) => {
  await page.goto('/triage');
  // Wait for at least one triage card
  const cards = page.locator('[data-testid="triage-card"]');
  await expect(cards.first()).toBeVisible({ timeout: 5_000 });
  const initialCount = await cards.count();

  // Press '1' to assign focused card to Work
  await page.keyboard.press('1');
  await expect(cards).toHaveCount(initialCount - 1, { timeout: 3_000 });

  // Undo toast appears
  await expect(page.locator('[data-testid="undo-toast"]')).toBeVisible({ timeout: 3_000 });

  // Click undo
  await page.locator('[data-testid="undo-toast"] button', { hasText: /undo/i }).click();
  await expect(cards).toHaveCount(initialCount, { timeout: 3_000 });
});
