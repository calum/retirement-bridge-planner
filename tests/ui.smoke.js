// Drives the real page in headless Chromium. Needs Playwright:
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright CHROMIUM=/path/to/chromium node tests/ui.smoke.js
const path = require('path'), assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = 'file://' + path.join(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
const t = async (n, f) => { try { await f(); pass++; } catch (e) { fail++; console.log('FAIL: ' + n + '\n    ' + e.message); } };
(async () => {
  const reqs = [];
  const b = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {});
  const nc = b.newContext.bind(b); b.newContext = async o => { const c = await nc(o); c.on('request', r => reqs.push(r.url())); return c; };
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
    await go('numbers'); assert(/example dates/.test(await txt('#dobB')));
    await pg.fill('[data-key="dob.0"]', '1960-04-05'); assert(/claim State Pension from age 66 /.test(await txt('#spa0')));
    await pg.fill('[data-key="dob.1"]', '1970-06-01'); assert(/claim State Pension from age 67 /.test(await txt('#spa1')));
    assert.strictEqual((await txt('#dobB')).trim(), ''); });
  await t('Marriage Allowance toggle changes the plan and shows the saving', async () => {
    await go('whatif'); const before = await txt('#maTxt'); assert(/Saves about/.test(before));
    const lowest = () => txt('#wK .kpi .v'); const a = await lowest();
    await pg.check('input[data-flag="marriage"]'); const c = await lowest(); assert.notStrictEqual(a, c); });
  await t('extra pension slider moves the result and the "needed" boxes show amounts', async () => {
    await go('whatif'); const a = await txt('#wK .kpi .v'); await pg.fill('#x2', '6000'); const c = await txt('#wK .kpi .v');
    assert.notStrictEqual(a, c); assert(/£/.test(await txt('#need'))); });
  await t('lump sum page: growth slider changes the chart, and the three choices switch the view', async () => {
    await go('lump'); const h1 = await txt('#lH'); await pg.fill('#gr', '6'); assert.notStrictEqual(h1, await txt('#lH'));
    assert.strictEqual(await pg.locator('#gTbl tbody tr').count() > 5, true); assert(/Paid to you/.test(await txt('#gTbl')), 'income column shows when taking an income');
    await pg.click('.modeBtn[data-mode="grow"]'); assert.strictEqual(await pg.getAttribute('.modeBtn[data-mode="grow"]','aria-pressed'), 'true');
    assert(!/Paid to you/.test(await txt('#gTbl'))); assert(await pg.locator('#swrBox').isHidden()); assert(await pg.locator('#barsWrap').isHidden());
    assert(/grows to/.test(await txt('#gH')) && !/paying you/.test(await txt('#gH')));
    await pg.click('.modeBtn[data-mode="cash"]'); assert(/No investment/.test(await txt('#gH'))); assert(await pg.locator('#splitBox').isHidden());
    await pg.click('.modeBtn[data-mode="income"]'); assert(!(await pg.locator('#swrBox').isHidden())); });
  await t('the split between savings pot and investment always adds up to the lump sum', async () => {
    await go('lump'); await pg.click('.modeBtn[data-mode="grow"]');
    const sum = async () => (+await pg.inputValue('#amtCash')) + (+await pg.inputValue('#amtInv'));
    const lump = async () => (await pg.evaluate(() => JSON.parse(localStorage.getItem('retirement-bridge-v1')).lump || 0)) || +(await pg.evaluate(() => document.querySelector('#split').max));
    await pg.fill('#split', '5000'); assert.strictEqual(await pg.inputValue('#amtInv'), '5000'); assert.strictEqual(await sum(), +await pg.evaluate(() => document.querySelector('#split').max));
    await pg.fill('#amtCash', '3000'); assert.strictEqual(await sum(), +await pg.evaluate(() => document.querySelector('#split').max)); assert.strictEqual(await pg.inputValue('#amtCash'), '3000');
    await pg.fill('#amtCash', '99999999'); assert.strictEqual(await pg.inputValue('#amtInv'), '0'); });
  await t('the numbers page invest box and savings pot box follow each other and the choice shows there too', async () => {
    await go('numbers'); const lump = +await pg.inputValue('[data-key="lump"]'); await pg.fill('#isaOut', '10000');
    assert.strictEqual(+await pg.inputValue('[data-key="emergency"]'), lump - 10000);
    await pg.click('.modeBtn[data-mode="grow"]'); await pg.click('a[data-p="lump"]'); await pg.waitForTimeout(100);
    assert.strictEqual(await pg.getAttribute('.modeBtn[data-mode="grow"]','aria-pressed'), 'true'); });
  await t('plans saved before the new option keep taking an income', async () => {
    await go('numbers'); await pg.evaluate(() => localStorage.setItem('retirement-bridge-v1', JSON.stringify({invest:true, swr:4.35, ess:1500}))); await pg.reload(); await pg.waitForTimeout(150);
    assert.strictEqual(await pg.getAttribute('.modeBtn[data-mode="income"]','aria-pressed'), 'true'); });
  await t('lump sum smaller than the cash kept gives a clear message, not a broken chart', async () => {
    await go('numbers'); await pg.fill('[data-key="lump"]', '1000'); await pg.fill('[data-key="emergency"]', '2000'); await pg.click('a[data-p="lump"]'); await pg.waitForTimeout(150);
    assert(/Nothing is going into the investment/.test(await txt('#gH'))); assert(/Nothing to compare/.test(await txt('#lH'))); });
  await t('the savings pot page shows the investment column when investing', async () => {
    await go('pot'); assert(/Investment at the end of the year/.test(await txt('#tbl'))); await pg.click('.modeBtn[data-mode="cash"]').catch(()=>{}); });
  await t('numbers persist in the browser after reload', async () => {
    await go('numbers'); await pg.fill('[data-key="ess"]', '1234'); await pg.reload(); await pg.waitForTimeout(150);
    assert.strictEqual(await pg.inputValue('[data-key="ess"]'), '1234'); });
  await t('reset needs a second tap, then restores the defaults', async () => {
    await go('numbers'); await pg.fill('[data-key="ess"]', '999'); await pg.click('#reset'); assert.strictEqual(await pg.inputValue('[data-key="ess"]'), '999');
    await pg.click('#reset'); await pg.waitForTimeout(150); assert.notStrictEqual(await pg.inputValue('[data-key="ess"]'), '999'); });

  await t('clearing a date of birth does not break the page', async () => {
    await go('numbers'); await pg.fill('[data-key="dob.0"]', ''); await pg.fill('[data-key="ess"]', '1500');
    assert(/claim State Pension from age/.test(await txt('#spa0'))); assert(/Where you stand so far/.test(await txt('#live'))); });
  await t('someone already past State Pension age is not told they have unused allowance', async () => {
    await go('numbers'); await pg.fill('[data-key="dob.1"]', '1955-01-01'); await pg.fill('[data-key="pension.1"]', '0'); await pg.fill('[data-key="sp.1"]', '12500');
    await pg.click('a[data-p="plan"]'); await pg.waitForTimeout(100); assert(!/Person 2 has about/.test(await txt('#facts')), 'State Pension of 12,500 uses almost all the allowance'); });
  await t('plan page shows the five stress tests', async () => {
    await go('plan'); assert.strictEqual(await pg.locator('#stress tbody tr').count(), 5); });
  await t('a name containing quotes and markup cannot break the charts', async () => {
    await go('numbers'); await pg.fill('[data-key="names.0"]', '"><b onmouseover=1>Hi'); await pg.click('a[data-p="plan"]'); await pg.waitForTimeout(150);
    assert.strictEqual(await pg.locator('svg b').count(), 0); assert(await pg.locator('svg rect[data-tip]').count() > 5);
    assert.strictEqual(await pg.locator('main b[onmouseover]').count(), 0); });
  await t('a younger Person 2 stretches the plan and the plan page still renders', async () => {
    await go('numbers'); await pg.fill('[data-key="dob.1"]', '1976-10-15'); await pg.click('a[data-p="plan"]'); await pg.waitForTimeout(150);
    assert(/up to age 80/.test(await txt('#planSpan'))); });

  await t('the answer: plenty of savings gives a clear "yes, you can afford to retire"', async () => {
    await go('numbers'); await pg.fill('[data-key="cash"]', '600000'); await pg.click('a[data-p="plan"]'); await pg.waitForTimeout(150);
    assert(/Yes, you can afford to retire\./.test(await txt('#answer h1'))); assert.strictEqual(await pg.locator('#answer [data-try]').count(), 0);
    assert(/Safe/.test(await txt('#answer .lines'))); });
  await t('the answer: not enough money gives "not yet" and offers extra-income options with a try button', async () => {
    await go('numbers'); await pg.fill('[data-key="cash"]', '0'); await pg.fill('[data-key="lump"]', '0'); await pg.fill('[data-key="ess"]', '2500'); await pg.fill('[data-key="ideal"]', '3000');
    await pg.click('a[data-p="plan"]'); await pg.waitForTimeout(150);
    assert(/Not yet/.test(await txt('#answer h1'))); assert(/could safely retire if/.test(await txt('#answer'))); assert(await pg.locator('#answer [data-try]').count() >= 1); });
  await t('"try this in my plan" adds the earnings, improves the answer, and can be removed', async () => {
    await go('numbers'); await pg.fill('[data-key="cash"]', '5000'); await pg.fill('[data-key="ess"]', '1800'); await pg.click('a[data-p="plan"]'); await pg.waitForTimeout(150);
    const before = await txt('#answer h1'); assert(!/^Yes/.test(before), before);
    await pg.locator('#answer [data-try]').first().click(); await pg.waitForTimeout(150);
    assert(/already includes extra earnings/.test(await txt('#answer'))); assert(/^Yes/.test(await txt('#answer h1')), await txt('#answer h1'));
    await pg.click('[data-clearwork]'); await pg.waitForTimeout(100); assert(!/already includes extra earnings/.test(await txt('#answer'))); assert.strictEqual(await txt('#answer h1'), before); });
  await t('what-if earnings sliders change the lowest-savings result and show their amounts', async () => {
    await go('whatif'); const a = await txt('#wK .kpi .v'); await pg.fill('#w0', '10000'); assert(/£10,000 a year/.test(await txt('#w0v'))); assert.notStrictEqual(a, await txt('#wK .kpi .v'));
    assert(/earns an extra/.test(await txt('#need'))); });
  await t('the glossary explains the words, and the page avoids money jargon', async () => {
    await go('plan'); assert(await pg.locator('details.gloss').count() >= 8);
    for (const h of ['plan','pot','whatif','lump','numbers']){ await pg.goto(url + '#' + h); await pg.reload(); await pg.waitForTimeout(100);
      const text = await pg.evaluate(() => document.querySelector('main').innerText);
      assert(!/\b(drawdown|SWR|annualised|decumulation|gap years|bridge years|buffer)\b/i.test(text), 'jargon on '+h+': '+(text.match(/\b(drawdown|SWR|annualised|decumulation|gap years|bridge years|buffer)\b/i)||[])[0]); } });
  await t('plain English: the main pages read easily (Flesch reading ease 60 or more)', async () => {
    const syll = w => { w = w.toLowerCase().replace(/[^a-z]/g,''); if (!w) return 0; const m = w.replace(/e$/,'').match(/[aeiouy]+/g); return Math.max(1, m ? m.length : 1); };
    for (const h of ['plan','numbers','lump']){ await go(h);
      const text = await pg.evaluate(() => [...document.querySelectorAll('main p, main li, main h1, main h2, main .hint, main .lead')].map(e => e.innerText).join(' . '));
      const clean = text.replace(/£[\d,.]+k?/g,'five').replace(/\d+(\.\d+)?%?/g,'five');
      const sentences = Math.max(1, clean.split(/[.!?]+\s/).length), words = clean.split(/\s+/).filter(w => /[a-z]/i.test(w));
      const ease = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (words.reduce((a,w) => a + syll(w), 0) / words.length);
      console.log('   reading ease', h, ease.toFixed(0)); assert(ease >= 60, h + ' reads at ' + ease.toFixed(0)); } });
  await t('on a phone: bottom tab bar, no sideways scroll, and tables become cards', async () => {
    const pctx = await b.newContext({viewport:{width:390,height:800}, hasTouch:true, isMobile:true}), ph = await pctx.newPage();
    await ph.goto(url + '#plan'); await ph.evaluate(() => localStorage.clear()); await ph.reload(); await ph.waitForTimeout(200);
    const box = await ph.locator('#tabs').boundingBox(); assert(Math.abs(box.y + box.height - 800) < 2, 'tab bar sits at the bottom: '+JSON.stringify(box));
    for (const h of ['plan','pot','whatif','lump','numbers']){ await ph.goto(url + '#' + h); await ph.waitForTimeout(150);
      assert.strictEqual(await ph.evaluate('document.documentElement.scrollWidth - window.innerWidth'), 0, 'overflow on '+h); }
    await ph.goto(url + '#plan'); await ph.waitForTimeout(150);
    assert.strictEqual(await ph.evaluate(() => getComputedStyle(document.querySelector('#stress td:nth-child(2)')).display), 'flex');
    assert.strictEqual(await ph.evaluate(() => getComputedStyle(document.querySelector('#stress thead')).display), 'none');
    assert(await ph.evaluate(() => document.querySelector('main').getBoundingClientRect().bottom > 0));
    await pctx.close(); });
  await t('a narrow window on a laptop or PC keeps the full layout (mobile view is for touch devices only)', async () => {
    const nctx = await b.newContext({viewport:{width:390,height:800}}), nw = await nctx.newPage();     // mouse and keyboard, small window
    await nw.goto(url + '#plan'); await nw.evaluate(() => localStorage.clear()); await nw.reload(); await nw.waitForTimeout(200);
    assert.strictEqual(await nw.evaluate(() => matchMedia('(pointer:coarse)').matches), false);
    assert.notStrictEqual(await nw.evaluate(() => getComputedStyle(document.querySelector('#tabs')).position), 'fixed', 'tab bar is not pinned to the bottom');
    assert.strictEqual(await nw.evaluate(() => getComputedStyle(document.querySelector('#stress thead')).display), 'table-header-group', 'real table, not cards');
    for (const h of ['plan','pot','whatif','lump','numbers']){ await nw.goto(url + '#' + h); await nw.waitForTimeout(120);
      assert.strictEqual(await nw.evaluate('document.documentElement.scrollWidth - window.innerWidth'), 0, 'no sideways scroll on '+h+' in a narrow desktop window'); }
    await nctx.close(); });
  await t('on a desktop: normal tab bar at the top and real tables', async () => {
    await go('plan'); const box = await pg.locator('#tabs').boundingBox(); assert(box.y < 200, 'tabs at the top');
    assert.strictEqual(await pg.evaluate(() => getComputedStyle(document.querySelector('#stress thead')).display), 'table-header-group'); });
  const key = 'retirement-bridge-v1', saved = pg2 => pg2.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), key);
  await t('first visit with nothing saved opens the guided tour', async () => {
    const c = await b.newContext({viewport:{width:1000,height:900}}), p = await c.newPage();
    await p.goto(url); await p.waitForTimeout(250);
    assert(/#tour$/.test(p.url()), p.url()); assert(/Welcome/.test(await p.locator('#tourH').innerText())); assert(/Step 1 of/.test(await p.locator('#tourCount').innerText())); await c.close(); });
  await t('someone who already has saved numbers goes straight to the plan', async () => {
    const c = await b.newContext({viewport:{width:1000,height:900}}), p = await c.newPage();
    await p.goto(url + '#numbers'); await p.evaluate(k => localStorage.setItem(k, JSON.stringify({ess:1700})), key);
    const p2 = await c.newPage(); await p2.goto(url); await p2.waitForTimeout(250);
    assert(!/#tour/.test(p2.url())); assert(await p2.locator('#answer').count() === 1); await c.close(); });
  await t('the tour walks through every field, one question at a time, and saves each answer', async () => {
    const c = await b.newContext({viewport:{width:1000,height:900}}), p = await c.newPage(); const errs2 = []; p.on('pageerror', e => errs2.push(String(e)));
    await p.goto(url); await p.waitForTimeout(200);
    const head = () => p.locator('#tourH').innerText(), count = () => p.locator('#tourCount').innerText(), next = () => p.click('[data-tour="next"]'), heads = [];
    const step = async () => { heads.push(await head()); await next(); };
    await step(); assert(/How it works/.test(await head())); await step();                                         // welcome, how it works
    await p.fill('[data-key="names.0"]', 'Alex'); await p.fill('[data-key="names.1"]', 'Sam'); await step();
    assert(/Alex/.test(await head())); await p.fill('[data-key="dob.0"]', '1966-10-15'); assert(/age 67/.test(await p.locator('#tourSpa0').innerText())); await step();
    assert(/Sam/.test(await head())); await p.fill('[data-key="dob.1"]', '1961-02-10'); assert(/age 66 and 11 months/.test(await p.locator('#tourSpa1').innerText())); await step();
    await p.click('[data-set="pensionAge.0,65"]'); assert.strictEqual(await p.inputValue('[data-key="pensionAge.0"]'), '65'); await step();
    await p.fill('[data-key="pension.0"]', '14000'); await step();
    await p.fill('[data-key="pension.1"]', '3000'); await p.fill('[data-key="pensionAge.1"]', '57'); await step();
    await p.click('[data-set="sp.0,12547.6"]'); assert.strictEqual(await p.inputValue('[data-key="sp.0"]'), '12547.6'); await step();
    await p.fill('[data-key="sp.1"]', '9000'); await step();
    await p.fill('[data-key="work.0"]', '5000'); await step();
    await p.fill('[data-key="ess"]', '1600'); await step();
    await p.fill('[data-key="ideal"]', '2200'); await step();
    await p.fill('[data-key="cash"]', '25000'); await step();
    await p.fill('[data-key="lump"]', '20000'); await step();
    assert(/lump sum/.test(await head())); await p.click('.modeBtn[data-mode="grow"]'); await p.fill('#amtInv', '15000'); assert.strictEqual(await p.inputValue('#amtCash'), '5000'); await step();
    assert(/married/.test(await head())); await p.click('[data-flagset="marriage,1"]'); assert.strictEqual(await p.getAttribute('[data-flagset="marriage,1"]', 'aria-pressed'), 'true'); await step();
    assert(/All done/.test(await head())); assert(await p.locator('#answer, .answer').count() >= 1); assert(/Step (\d+) of \1/.test(await count()));
    await next(); await p.waitForTimeout(150); assert(/#plan$/.test(p.url()));
    const st = await saved(p);
    assert.deepStrictEqual(st.names, ['Alex','Sam']); assert.deepStrictEqual(st.dob, ['1966-10-15','1961-02-10']); assert.strictEqual(st.pensionAge[0], 65); assert.strictEqual(st.pensionAge[1], 57);
    assert.deepStrictEqual(st.pension, [14000, 3000]); assert.deepStrictEqual(st.sp, [12547.6, 9000]); assert.strictEqual(st.work[0], 5000);
    assert.strictEqual(st.ess, 1600); assert.strictEqual(st.ideal, 2200); assert.strictEqual(st.cash, 25000); assert.strictEqual(st.lump, 20000);
    assert.strictEqual(st.emergency, 5000); assert.strictEqual(st.invest, true); assert.strictEqual(st.drawdown, false); assert.strictEqual(st.marriage, true); assert.strictEqual(st.tourSeen, true);
    assert(heads.length >= 15, 'enough small steps: ' + heads.length); assert.deepStrictEqual(errs2, []);
    await p.goto(url); await p.waitForTimeout(150); assert(!/#tour/.test(p.url()), 'finished tour is not shown again'); await c.close(); });
  await t('Back keeps what was typed, and the progress count follows', async () => {
    await go('tour'); for (let i = 0; i < 11; i++) await pg.click('[data-tour="next"]');             // to the essentials-spending step
    assert(/must pay/.test(await txt('#tourH'))); await pg.fill('[data-key="ess"]', '1234'); const n = await txt('#tourCount');
    await pg.click('[data-tour="next"]'); assert.notStrictEqual(await txt('#tourCount'), n); await pg.click('[data-tour="back"]');
    assert.strictEqual(await pg.inputValue('[data-key="ess"]'), '1234'); assert.strictEqual(await txt('#tourCount'), n); });
  await t('the lump-sum choice step is skipped when there is no lump sum', async () => {
    await go('tour'); for (let i = 0; i < 14; i++) await pg.click('[data-tour="next"]');             // lump sum amount step
    assert(/tax-free lump sum when you retire/.test(await txt('#tourH'))); await pg.fill('[data-key="lump"]', '0');
    const total = await txt('#tourCount'); await pg.click('[data-tour="next"]'); assert(/married/.test(await txt('#tourH')), 'jumped straight to the next question'); assert.notStrictEqual(await txt('#tourCount'), total); });
  await t('skipping the tour goes to the plan and it is not shown again', async () => {
    const c = await b.newContext({viewport:{width:1000,height:900}}), p = await c.newPage();
    await p.goto(url); await p.waitForTimeout(150); await p.click('[data-tour="skip"]'); await p.waitForTimeout(150); assert(/#plan$/.test(p.url()));
    const p2 = await c.newPage(); await p2.goto(url); await p2.waitForTimeout(150); assert(!/#tour/.test(p2.url())); await c.close(); });
  await t('the guided tour link restarts the tour from the first step', async () => {
    await go('plan'); await pg.click('.tourlink'); await pg.waitForTimeout(100); assert(/Welcome/.test(await txt('#tourH'))); });
  await t('the privacy page says plainly that nothing leaves the device, and the delete button really deletes', async () => {
    await go('numbers'); await pg.fill('[data-key="ess"]', '1234'); assert.strictEqual((await saved(pg)).ess, 1234);
    await pg.click('a[href="#privacy"]'); await pg.waitForTimeout(100); const text = await pg.evaluate(() => document.querySelector('main').innerText);
    assert(/Nothing you type ever leaves this device/.test(text)); assert(/Nothing is sent over the internet/.test(text)); assert(/Try it yourself/.test(text)); assert(/no account/i.test(text));
    await pg.click('#wipe'); assert.notStrictEqual(await saved(pg), null, 'one tap does not delete'); await pg.click('#wipe'); assert.strictEqual(await saved(pg), null); assert(/Done/.test(await txt('#wipeMsg'))); });
  await t('every page has the privacy line in the footer', async () => {
    for (const h of ['plan','pot','whatif','lump','numbers','privacy']){ await go(h); assert(/never sent anywhere/.test(await txt('footer')), h); } });
  await t('the app never speaks as "we", on any page or tour step', async () => {
    const bad = /\b(we|we've|we'll|our|ours|us|let's)\b/i, found = [];
    for (const h of ['plan','pot','whatif','lump','numbers','privacy']){ await go(h); const tx = await pg.evaluate(() => document.querySelector('main').textContent + ' ' + document.querySelector('footer').textContent); const m = tx.match(bad); if (m) found.push(h + ': ' + m[0]); }
    await go('tour'); for (let i = 0; i < 20; i++){ const tx = await pg.evaluate(() => document.querySelector('#tourBox').textContent); const m = tx.match(bad); if (m) found.push('tour step ' + i + ': ' + m[0]); if (!(await pg.locator('[data-tour="next"]').count()) || /All done/.test(await txt('#tourH'))) break; await pg.click('[data-tour="next"]'); }
    assert.deepStrictEqual(found, []); });
  await t('it keeps working with the internet switched off', async () => {
    const c = await b.newContext({viewport:{width:1000,height:900}}), p = await c.newPage(); const errs3 = [];
    p.on('pageerror', e => errs3.push(String(e))); await p.goto(url + '#numbers'); await c.setOffline(true);
    await p.fill('[data-key="ess"]', '1777'); await p.click('a[data-p="plan"]'); await p.waitForTimeout(150);
    assert(await p.locator('#answer').count() === 1); assert.strictEqual((await saved(p)).ess, 1777); assert.deepStrictEqual(errs3, []); await c.close(); });
  await t('no console errors during the whole run', async () => assert.deepStrictEqual(errs, []));
  await t('the browser made no outside connections during the entire test run', async () => { const outside = reqs.filter(u => !/^(file:|data:|about:|blob:)/.test(u)); assert.deepStrictEqual(outside, []); });
  console.log(`ui smoke: ${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
