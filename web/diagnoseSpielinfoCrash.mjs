import { chromium } from 'playwright';

// One-off diagnostic (see CLAUDE.md's "Testing/diagnosing the backend"
// pattern -- this sandbox's own outbound network to the production site is
// unreliable, so this runs in CI instead, which has real internet access):
// reproduces the user-reported "Spielinfo tab doesn't work" crash by
// actually driving the deployed app with a real browser against a real
// live fixture and capturing the console/page error, instead of guessing
// at the cause from source reading alone.
//
// First attempt (this session) hung the whole job for 9 minutes past a
// 30s locator timeout because the browser/process was never closed on the
// failure path -- everything here now runs inside a try/finally that
// always closes the browser and calls process.exit() explicitly, so a
// failed step still finishes in seconds instead of riding out to the
// job's outer timeout.
const PROD_URL = 'https://kick-radar-eosin.vercel.app';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}\n${err.stack}`));
  page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.url()} -- ${req.failure()?.errorText}`));

  try {
    await page.goto(PROD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/00-initial-load.png', fullPage: true }).catch(() => {});
    console.log('PAGE TITLE:', await page.title());
    console.log('BODY TEXT SNIPPET:', (await page.locator('body').innerText().catch(() => '')).slice(0, 500));

    // BottomNav.jsx renders a plain <button> per tab whose accessible name
    // is just its label text ("Live" in German, same word in English) --
    // role-based lookup is more robust than getByText, which can match
    // stray "Live" text elsewhere (e.g. a live-match badge) and hang on an
    // ambiguous/invisible match instead of failing fast.
    const liveTabButton = page.getByRole('button', { name: 'Live' });
    await liveTabButton.click({ timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: '/tmp/01-live-tab.png', fullPage: true }).catch(() => {});
    console.log('Clicked Live tab OK');

    const row = page.getByText(/Leverkusen/i).first();
    await row.click({ timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/02-overlay-open.png', fullPage: true }).catch(() => {});
    console.log('Opened fixture overlay OK');

    const infoTabButton = page.getByRole('button', { name: 'Spielinfo' });
    await infoTabButton.click({ timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/03-after-spielinfo-click.png', fullPage: true }).catch(() => {});
    console.log('Clicked Spielinfo tab OK');

    const crashed = await page.getByText('Etwas ist schiefgelaufen').isVisible().catch(() => false);
    console.log('CRASHED:', crashed);
  } catch (err) {
    console.log('STEP FAILED:', err.message);
    await page.screenshot({ path: '/tmp/99-failure.png', fullPage: true }).catch(() => {});
  } finally {
    console.log('--- console/page logs ---');
    console.log(logs.join('\n'));
    await browser.close();
  }
}

main()
  .catch((err) => {
    console.error('diagnoseSpielinfoCrash failed:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
