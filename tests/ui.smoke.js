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

  await t('clearing a date of birth does not break the page', async () => {
    await go('numbers'); await pg.fill('[data-key="dob.0"]', ''); await pg.fill('[data-key="ess"]', '1500');
    assert(/State Pension age/.test(await txt('#spa0'))); assert(/Result so far/.test(await txt('#live'))); });
  await t('someone already past State Pension age is not told they have unused allowance', async () => {
    await go('numbers'); await pg.fill('[data-key="dob.1"]', '1955-01-01'); await pg.fill('[data-key="pension.1"]', '0'); await pg.fill('[data-key="sp.1"]', '12500');
    await pg.click('a[data-p="plan"]'); await pg.waitForTimeout(100); assert(!/Person 2 has about/.test(await txt('#facts')), 'State Pension of 12,500 uses almost all the allowance'); });
  await t('plan page shows the five stress tests', async () => {
    await go('plan'); assert.strictEqual(await pg.locator('#stress tbody tr').count(), 5); });
  await t('a name containing quotes and markup cannot break the charts', async () => {
    await go('numbers'); await pg.fill('[data-key="names.0"]', '"><b onmouseover=1>Hi'); await pg.click('a[data-p="plan"]'); await pg.waitForTimeout(150);
    assert.strictEqual(await pg.locator('svg b').count(), 0); assert(await pg.locator('svg rect[data-tip]').count() > 5);
    assert.strictEqual(await pg.locator('main b[onmouseover]').count(), 0); });
  await t('lump sum smaller than the cash kept gives a clear message, not a broken chart', async () => {
    await go('numbers'); await pg.fill('[data-key="lump"]', '1000'); await pg.fill('[data-key="emergency"]', '2000'); await pg.click('a[data-p="lump"]'); await pg.waitForTimeout(150);
    assert(/Nothing is going into the ISA/.test(await txt('#lH'))); });
  await t('a younger Person 2 stretches the plan and the plan page still renders', async () => {
    await go('numbers'); await pg.fill('[data-key="dob.1"]', '1976-10-15'); await pg.click('a[data-p="plan"]'); await pg.waitForTimeout(150);
    assert.strictEqual(await txt('#planEnd'), '80'); });
  await t('no console errors during the whole run', async () => assert.deepStrictEqual(errs, []));
  console.log(`ui smoke: ${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
