import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('.monstats/previews', { recursive: true });
const browser = await chromium.launch({
  channel: process.env.MONSTATS_BROWSER_CHANNEL,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    colorScheme: 'dark',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.MONSTATS_PREVIEW_URL ?? 'http://127.0.0.1:3000');
  await page.getByRole('button', { name: 'Incineroar', exact: true }).waitFor();
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((i) => i.decode()));
  });
  await page.screenshot({ path: '.monstats/previews/usage.png' });
  await page.getByRole('button', { name: 'Incineroar', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Incineroar', exact: true })
    .waitFor();
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((i) => i.decode()));
  });
  await page.screenshot({
    path: '.monstats/previews/detail.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '.monstats/previews/mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Ladder', exact: true }).click();
  await page.locator('.ladder-table, .ladder-panel .empty').waitFor();
  await page.screenshot({ path: '.monstats/previews/ladder-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.screenshot({ path: '.monstats/previews/ladder.png' });
  console.log({
    errors,
    overflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  });
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
