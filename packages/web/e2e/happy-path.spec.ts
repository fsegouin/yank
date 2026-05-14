import { test, expect } from '@playwright/test';

test('setup screen renders and link button is interactive', async ({ page }) => {
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: /link your whatsapp/i })).toBeVisible();
  await page.getByRole('button', { name: /link device/i }).click();
  await expect(page.getByText(/waiting for phone/i)).toBeVisible({ timeout: 5_000 });
});

test('home renders main pane', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.pane')).toBeVisible();
});

test('composer sends a message and surfaces a pending → sent status flip', async ({
  page,
  request,
}) => {
  const chatsRes = await request.get('/api/chats');
  const chats = (await chatsRes.json()) as Array<{ id: string }>;
  test.skip(chats.length === 0, 'No chats present — seed via daemon first');

  await page.goto(`/c/${chats[0]!.id}`);
  const composer = page.locator('.composer textarea');
  await composer.fill('hello from playwright');
  await composer.press('Enter');

  const pending = page.locator('.msg.pending', { hasText: 'hello from playwright' });
  await expect(pending).toBeVisible({ timeout: 2_000 });
  await expect(page.locator('.msg.sent', { hasText: 'hello from playwright' })).toBeVisible({
    timeout: 5_000,
  });
});
