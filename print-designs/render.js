// Renders out/html/*.html to out/png/*.png at exact print size (300 dpi 4x6).
// Usage: node render.js [filter]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const base = path.join(__dirname, process.env.PD_OUT || 'out');  // PD_OUT=out-birthday for other categories
  const dir = path.join(base, 'html'), out = path.join(base, 'png');
  fs.mkdirSync(out, { recursive: true });
  const filt = process.argv[2] || '';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f.includes(filt));
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const f of files) {
    const html = path.join(dir, f);
    const port = fs.readFileSync(html, 'utf8').includes('width:1200px;height:1800px');
    await page.setViewportSize(port ? { width: 1200, height: 1800 } : { width: 1800, height: 1200 });
    await page.goto('file://' + html);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(50);
    await page.screenshot({ path: path.join(out, f.replace('.html', '.png')) });
  }
  await browser.close();
  console.log('rendered', files.length);
})();
