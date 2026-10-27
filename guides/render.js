const { chromium } = require('playwright');
(async () => {
  const dir = __dirname, out = '/home/user/bysoftlight.github.io/guides';
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
  await p.goto('file://' + out + '/source.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
  const names = { p: 'participant', s: 'staff' };
  for (const id of await p.$$eval('.card', els => els.map(e => e.id))) {
    const el = await p.$('#' + id);
    // ตรวจข้อความล้นการ์ด
    const over = await el.evaluate(e => [...e.querySelectorAll('*')].some(c => { const r = c.getBoundingClientRect(), R = e.getBoundingClientRect(); return r.bottom > R.bottom - 40 || r.right > R.right - 40; }));
    if (over) console.log('OVERFLOW', id);
    await el.screenshot({ path: `${out}/${names[id[0]]}-${id.slice(1).padStart(2,'0')}.png` });
  }
  console.log(await p.evaluate(() => document.fonts.check('40px "IBM Plex Sans Thai"')));
  await b.close();
})();
