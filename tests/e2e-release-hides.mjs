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

async function overlayOpenOn(page) {
  return page.evaluate(() => {
    const host = document.querySelector('switch-tab-overlay');
    const panel = host?.shadowRoot?.querySelector('.switch-tab');
    return Boolean(host && panel && !panel.hidden);
  }).catch(() => false);
}

async function findOpenOverlay(pages) {
  for (const page of pages) {
    if (await overlayOpenOn(page)) return page;
  }
  return null;
}

const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'switch-tab-release-'));
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

  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto('https://example.com');
  await second.goto('https://example.org');
  for (const page of context.pages()) {
    if (!page.url().startsWith('http')) await page.close();
  }
  await second.bringToFront();
  await second.waitForLoadState('domcontentloaded');
  await second.waitForTimeout(400);

  await dispatchKey(second, 'keydown', { key: 'q', code: 'KeyQ', ctrlKey: true });
  await second.waitForTimeout(700);

  const heldPage = await findOpenOverlay(context.pages());
  check('popup is visible while the shortcut is held', Boolean(heldPage));

  await mkdir(screenshotDir, { recursive: true });
  if (heldPage) {
    await heldPage.screenshot({ path: path.join(screenshotDir, 'popup-held.png'), fullPage: true });
    console.log('  shot  test-results/popup-held.png');
  }

  await dispatchKey(heldPage ?? second, 'keyup', {
    key: 'Control',
    code: 'ControlLeft',
    ctrlKey: false,
  });
  await second.waitForTimeout(500);

  const stillOpen = await findOpenOverlay(context.pages());
  check('popup disappears when the shortcut is released', !stillOpen);

  const afterPage = stillOpen ?? heldPage ?? second;
  await afterPage.screenshot({ path: path.join(screenshotDir, 'popup-released.png'), fullPage: true });
  console.log('  shot  test-results/popup-released.png');
} finally {
  await context.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}

console.log('\nrelease-hides checks passed');
