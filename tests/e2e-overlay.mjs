import { mkdtemp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionPath = path.join(root, '.output', 'chrome-mv3');
const screenshotDir = path.join(root, 'test-results');

const failures = [];

function check(label, condition) {
  if (condition) {
    console.log(`  pass  ${label}`);
    return;
  }
  failures.push(label);
  console.log(`  fail  ${label}`);
}

async function activeTab(worker) {
  return worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { id: tab?.id ?? null, url: tab?.url ?? '', title: tab?.title ?? '' };
  });
}

async function dispatchKey(page, type, init) {
  await page.evaluate(({ type: eventType, init: eventInit }) => {
    window.dispatchEvent(new KeyboardEvent(eventType, {
      bubbles: true,
      cancelable: true,
      composed: true,
      ...eventInit,
    }));
  }, { type, init });
}

async function findOverlay(pages) {
  for (const page of pages) {
    const count = await page.locator('switch-tab-overlay .tab.selected').count().catch(() => 0);
    if (count > 0) return page;
  }
  return null;
}

const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'switch-tab-e2e-'));
const extensionArg = extensionPath.replace(/\\/g, '/');
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  args: [
    '--headless=new',
    `--disable-extensions-except=${extensionArg}`,
    `--load-extension=${extensionArg}`,
  ],
});

try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  const extensionId = new URL(worker.url()).hostname;
  console.log(`extension id: ${extensionId}`);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.waitForSelector('[data-label="next"]');
  check('settings page shows the forward shortcut', /Q/i.test((await options.locator('[data-label="next"]').innerText()).trim()));

  const first = await context.newPage();
  const second = await context.newPage();
  const third = await context.newPage();
  await first.goto('https://example.com');
  await second.goto('https://example.org');
  await third.goto('https://example.net');
  await options.close();
  for (const page of context.pages()) {
    if (!page.url().startsWith('http')) await page.close();
  }
  await third.bringToFront();
  await third.waitForLoadState('domcontentloaded');
  await third.waitForTimeout(500);

  const before = await activeTab(worker);
  console.log(`  info  active before shortcut: ${JSON.stringify(before)}`);

  await dispatchKey(third, 'keydown', { key: 'q', code: 'KeyQ', ctrlKey: true });
  await third.waitForTimeout(700);

  const afterPress = await activeTab(worker);
  console.log(`  info  active after keydown: ${JSON.stringify(afterPress)}`);
  check('shortcut press switches the real tab', afterPress.id != null && afterPress.id !== before.id);

  const pages = context.pages();
  const hostPage = await findOverlay(pages);
  check('overlay appears on the active tab', Boolean(hostPage));

  if (hostPage) {
    const host = hostPage.locator('switch-tab-overlay');
    const selectedHost = (await host.locator('.tab.selected .host').innerText().catch(() => '')).trim();
    const selectedIsCurrent = await host.locator('.tab.selected.current').count();
    const activeHost = (() => {
      try {
        return new URL(afterPress.url).hostname.replace(/^www\./, '');
      } catch {
        return '';
      }
    })();

    check('lists open tabs', await host.locator('.tab').count() >= 3);
    check('selected row is the current tab', selectedIsCurrent >= 1);
    check('popup selection matches the real active tab', !activeHost || selectedHost.includes(activeHost) || afterPress.url.includes(selectedHost));

    await mkdir(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, 'overlay.png');
    await hostPage.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  shot  ${screenshotPath}`);
  }

  await dispatchKey(hostPage ?? third, 'keyup', { key: 'Control', code: 'ControlLeft', ctrlKey: false });
  await third.waitForTimeout(500);

  const afterRelease = await activeTab(worker);
  console.log(`  info  active after release: ${JSON.stringify(afterRelease)}`);
  check('tab stays switched after release', afterRelease.id === afterPress.id);

  let overlayStillOpen = false;
  for (const page of context.pages()) {
    const open = await page.locator('switch-tab-overlay .switch-tab:not([hidden])').count().catch(() => 0);
    if (open > 0) overlayStillOpen = true;
  }
  check('overlay closes after release', !overlayStillOpen);
} finally {
  await context.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}

console.log('\nall e2e checks passed');
