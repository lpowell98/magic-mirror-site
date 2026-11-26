// Renders brochure/brochure.html to public/brochure/magic-mirror-brochure.pdf (6 letter-size pages).
// Usage: node scripts/render-brochure.js   (needs Playwright with Chromium)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(root, 'brochure', 'brochure.html'), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: path.join(root, 'public', 'brochure', 'magic-mirror-brochure.pdf'), preferCSSPageSize: true, printBackground: true });
  await browser.close();
  console.log('brochure PDF rendered');
})();
