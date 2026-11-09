/**
 * Take a high-resolution screenshot of a page with the system Edge/Chrome (no browser download needed).
 *
 *   npx tsx scripts/screenshot.ts <url> <out.png> [options]
 *
 *   --width 1280 --height 900      viewport (CSS px)
 *   --dpr 2                        device pixel ratio (2 = crisp)
 *   --full                         capture the whole scrollable page
 *   --selector "css"               capture only this element
 *   --click "Text A|~Part of B|tab:Name"  click first, in order: exact button name, "~" = button name contains
 *                                  the text, "tab:" = a tab (e.g. an ingredient category)
 *   --wait 2500                    ms to wait after load/clicks (animations)
 *   --mobile                       emulate a phone (390 wide, touch)
 *   --scheme dark|light            prefers-color-scheme
 *
 * The dev server must already be running (npm run dev, default http://localhost:3000).
 */
import { chromium } from '@playwright/test';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const [url, out] = process.argv.slice(2);
  if (!url || !out || url.startsWith('--') || out.startsWith('--')) {
    console.error('usage: tsx scripts/screenshot.ts <url> <out.png> [--width N --height N --dpr N --full --selector css --click "A|B" --wait ms --mobile]');
    process.exit(2);
  }

  const mobile = flag('mobile');
  const width = Number(arg('width') ?? (mobile ? 390 : 1280));
  const height = Number(arg('height') ?? (mobile ? 844 : 900));
  const dpr = Number(arg('dpr') ?? 2);

  let browser;
  for (const channel of ['msedge', 'chrome'] as const) {
    try {
      browser = await chromium.launch({ channel });
      break;
    } catch {
      /* try the next channel */
    }
  }
  if (!browser) throw new Error('Neither Microsoft Edge nor Google Chrome could be launched.');

  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: (arg('scheme') as 'dark' | 'light' | undefined) ?? 'dark',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`);
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  for (const text of (arg('click') ?? '').split('|').filter(Boolean)) {
    // "~Mozzarella" = accessible name CONTAINS the text; "tab:Salumi" clicks a tab; plain text = exact button name.
    if (text.startsWith('tab:')) {
      await page.getByRole('tab', { name: text.slice(4) }).first().click();
      await page.waitForTimeout(250);
      continue;
    }
    const partial = text.startsWith('~');
    await page.getByRole('button', { name: partial ? text.slice(1) : text, exact: !partial }).first().click();
    await page.waitForTimeout(partial ? 350 : 150);
  }
  await page.waitForTimeout(Number(arg('wait') ?? 2500));

  const selector = arg('selector');
  if (selector) await page.locator(selector).first().screenshot({ path: out });
  else await page.screenshot({ path: out, fullPage: flag('full') });

  console.log(`saved ${out} (${width}x${height} @${dpr}x)`);
  if (errors.length) console.log(`browser reported ${errors.length} error(s):\n${errors.slice(0, 5).join('\n')}`);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
