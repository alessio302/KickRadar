import { chromium } from 'playwright';

// One-off diagnostic (see CLAUDE.md's "Testing/diagnosing the backend"
// pattern -- this sandbox's own outbound network to the production site is
// unreliable, so this runs in CI instead, which has real internet access):
// reproduces the user-reported "Spielinfo tab doesn't work" crash by
// actually driving the deployed app with a real browser against a real
// live fixture (Bayer Leverkusen vs RB Leipzig, currently live) and
// capturing the console/page error, instead of guessing at the cause from
// source reading alone.
const PROD_URL = 'https://kick-radar-eosin.vercel.app';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}\n${err.stack}`));
  page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.url()} -- ${req.failure()?.errorText}`));

  await page.goto(PROD_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  await page.getByText('Live', { exact: true }).click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: '/tmp/01-live-tab.png', fullPage: true }).catch(() => {});

  const row = page.getByText(/Leverkusen/i).first();
  await row.waitFor({ timeout: 15000 }).catch(() => {});
  await row.click({ timeout: 15000 }).catch((e) => logs.push(`[click-row-failed] ${e.message}`));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/02-overlay-open.png', fullPage: true }).catch(() => {});

  const infoTabButton = page.getByRole('button', { name: 'Spielinfo' });
  await infoTabButton.waitFor({ timeout: 10000 }).catch((e) => logs.push(`[info-tab-not-found] ${e.message}`));
  await infoTabButton.click({ timeout: 10000 }).catch((e) => logs.push(`[click-info-tab-failed] ${e.message}`));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/03-after-spielinfo-click.png', fullPage: true }).catch(() => {});

  const crashed = await page.getByText('Etwas ist schiefgelaufen').isVisible().catch(() => false);
  console.log('CRASHED:', crashed);
  console.log('--- console/page logs ---');
  console.log(logs.join('\n'));

  await browser.close();
}

main().catch((err) => {
  console.error('diagnoseSpielinfoCrash failed:', err);
  process.exitCode = 1;
});
