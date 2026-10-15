// Drives the real page in headless Chromium. Needs Playwright:
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright CHROMIUM=/path/to/chromium node tests/ui.smoke.js
const path = require('path'), assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = 'file://' + path.join(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
const t = async (n, f) => { try { await f(); pass++; } catch (e) { fail++; console.log('FAIL: ' + n + '\n    ' + e.message); } };
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {});
  const ctx = await b.newContext({viewport:{width:1000,height:900}}), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  const txt = sel => pg.locator(sel).first().innerText();
  const go = async h => { await pg.goto(url + '#' + h); await pg.evaluate(() => localStorage.clear()); await pg.reload(); await pg.waitForTimeout(150); };
  for (const h of ['plan','pot','whatif','lump','numbers']) await t('page '+h+' renders with no errors or sideways scroll', async () => {
    await go(h); assert((await txt('main')).length > 200);
    assert.strictEqual(await pg.evaluate('document.documentElement.scrollWidth - window.innerWidth'), 0); });
  await t('budget switch changes the highlighted card and the chart label', async () => {
    await go('plan'); await pg.click('#vI'); assert.strictEqual(await pg.getAttribute('#vI','aria-pressed'), 'true');
    assert(/ideal/i.test(await txt('#heroH'))); });
  await t('renaming a person changes the labels everywhere', async () => {
    await go('numbers'); await pg.fill('[data-key="names.0"]', 'Alex'); await pg.fill('[data-key="names.1"]', 'Sam');
    assert(/Alex/.test(await txt('.brand'))); await pg.click('a[data-p="plan"]'); assert(/Alex/.test(await txt('main'))); assert(/Sam/.test(await txt('main'))); });
  await t('date of birth sets State Pension age, and the placeholder warning disappears', async () => {
    await go('numbers'); assert(/placeholders/.test(await txt('#dobB')));
    await pg.fill('[data-key="dob.0"]', '1960-04-05'); assert(/State Pension age 66, from/.test(await txt('#spa0')));
    await pg.fill('[data-key="dob.1"]', '1970-06-01'); assert(/State Pension age 67, from/.test(await txt('#spa1')));
    assert.strictEqual((await txt('#dobB')).trim(), ''); });
  await t('Marriage Allowance toggle changes the plan and shows the saving', async () => {
    await go('whatif'); const before = await txt('#maTxt'); assert(/Saves about/.test(before));
    const lowest = () => txt('#wK .kpi .v'); const a = await lowest();
    await pg.check('input[data-flag="marriage"]'); const c = await lowest(); assert.notStrictEqual(a, c); });
  await t('extra pension slider moves the result and the "needed" boxes show amounts', async () => {
    await go('whatif'); const a = await txt('#wK .kpi .v'); await pg.fill('#x2', '6000'); const c = await txt('#wK .kpi .v');
    assert.notStrictEqual(a, c); assert(/£/.test(await txt('#need'))); });
  await t('lump sum page: toggling choice changes the comparison and growth slider changes the chart', async () => {
    await go('lump'); const h1 = await txt('#lH'); await pg.fill('#gr', '6'); assert.notStrictEqual(h1, await txt('#lH'));
    await pg.click('#invN'); assert.strictEqual(await pg.getAttribute('#invN','aria-pressed'), 'true'); });
  await t('numbers persist in the browser after reload', async () => {
    await go('numbers'); await pg.fill('[data-key="ess"]', '1234'); await pg.reload(); await pg.waitForTimeout(150);
    assert.strictEqual(await pg.inputValue('[data-key="ess"]'), '1234'); });
  await t('reset needs a second tap, then restores the defaults', async () => {
    await go('numbers'); await pg.fill('[data-key="ess"]', '999'); await pg.click('#reset'); assert.strictEqual(await pg.inputValue('[data-key="ess"]'), '999');
    await pg.click('#reset'); await pg.waitForTimeout(150); assert.notStrictEqual(await pg.inputValue('[data-key="ess"]'), '999'); });
  await t('no console errors during the whole run', async () => assert.deepStrictEqual(errs, []));
  console.log(`ui smoke: ${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
