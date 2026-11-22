// test/helpers/appBoot.mjs — one boot for headless-browser tests.
//
// Three traps cost this suite hours, and every new browser test used to meet them again:
//   1. the first-run 美术资源 modal (ui/assetMode.js) covers the page until a mode is stored;
//   2. the entry film (ui/entryFilm.js) is a full-screen <dialog> that swallows the test's clicks;
//   3. the hub lobby (0.4.0) moved 设置 into `.topbar__tools` and put room creation behind 同盟模拟 → 协议.
//
// `?e2e=1` (public/js/e2eMode.js) switches 1 and 2 off inside the page. This module builds such a URL, seeds the
// profile, waits for the app to be online and offers the hub flows the tests share.
//
//   const page = await openApp(browser, { base });            // the hub lobby, online
//   const page = await openApp(browser, { base, entered: false }); // the title screen
//   await createRoom(page);                                   // 同盟模拟 → 标准模拟 → 创建同盟, `.room-screen` up
//   await openSettings(page, '.lobby-screen');                // the 设置 modal

/** Append `e2e=1` (and any extra query) to an app URL. */
export function appUrl(base, path = '/', extra = '') {
  const url = new URL(path, base);
  url.searchParams.set('e2e', '1');
  for (const [k, v] of new URLSearchParams(extra)) url.searchParams.set(k, v);
  return url.href;
}

/**
 * A page on the app, past the title screen unless `entered: false`, online.
 * @param {import('puppeteer-core').Browser} browser
 * @param {{ base: string, name?: string, viewport?: object, path?: string, entered?: boolean,
 *   prefs?: { lang?: string, textSize?: string, assetMode?: string } }} opts
 */
export async function openApp(browser, { base, name = '测试博士', viewport = { width: 1600, height: 900 }, path = '/', entered = true, prefs = {} } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const { lang = 'zh-CN', textSize = 'md', assetMode = 'stream' } = prefs;
  await page.evaluateOnNewDocument((n, entered, lang, textSize, assetMode) => {
    try {
      localStorage.setItem('sp.name', n);
      localStorage.setItem('sp.pref.lang', JSON.stringify(lang));
      localStorage.setItem('sp.pref.settings', JSON.stringify({ textSize }));
      localStorage.setItem('sp.pref.assetMode', JSON.stringify(assetMode)); // belt and braces with ?e2e=1
      localStorage.setItem('sp.pref.loadout.view', JSON.stringify('list')); // the roster rows the tests' selectors use
      if (entered) sessionStorage.setItem('sp.entered', '1');
    } catch { /* private mode */ }
  }, name, entered, lang, textSize, assetMode);
  await page.goto(appUrl(base, path), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => globalThis.__SP__?.store.get().connection.status === 'online', { timeout: 30000 });
  if (entered) await page.waitForSelector('.lobby-screen', { timeout: 15000 });
  return page;
}

/** The room creation flow of the hub lobby: 同盟模拟 → a protocol card → 创建同盟 → `.room-screen`. */
export async function createRoom(page, { mode = 'coop', protocol = '标准模拟' } = {}) {
  const entry = mode === 'solo' ? '.hub-entry--solo' : '.hub-entry--coop';
  await page.click(entry);
  await page.waitForSelector('.proto-start', { timeout: 15000 });
  if (protocol) {
    await page.evaluate((label) => {
      const card = [...document.querySelectorAll('.pcard')].find((c) => c.textContent.includes(label));
      card?.click();
    }, protocol);
  }
  await page.click('.proto-start');
  await page.waitForSelector('.room-screen', { timeout: 20000 });
}

/** The 设置 modal from a screen's top bar (`[data-testid="settings-btn"]`), e.g. '.lobby-screen' or '.room-screen'. */
export async function openSettings(page, screen) {
  await page.click(`${screen} [data-testid="settings-btn"]`);
  await page.waitForSelector('.modal', { timeout: 10000 });
  return page;
}
