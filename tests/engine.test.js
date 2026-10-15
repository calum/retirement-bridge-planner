// Run: node tests/engine.test.js
const H = require('./harness.js');
const {simulate, summarise, assess, neededExtra, lumpModel, spaMonths, monthIdx, defaultState, assert, t, near, done, rng, money, axisMoney, ageText, PA_BASE, HR_THRESHOLD, PA_FREEZE_END, END_AGE} = H;

// A tidy test scenario: both born 15 Oct 1966, retirement month = "now", so the plan starts at age 60
// and both State Pensions begin exactly 84 months in. Money values are made up.
const NOW = monthIdx('2026-10-15');
function base(over){
  return Object.assign(defaultState(), {
    dob:['1966-10-15','1966-10-15'], dobConfirmed:true,
    pension:[14000,0], pensionAge:[60,55], sp:[12547.60,9000],
    ess:1600, ideal:2200, cash:25000, lump:21000, emergency:2000, swr:4, invest:true,
    inflation:0, cashReal:0, growth:3, marriage:false, extra2:0
  }, over||{});
}
const run = (over, o) => simulate(base(over), Object.assign({nowIdx:NOW}, o||{}));

/* ---------- 1. State Pension age (official worked examples and boundaries) ---------- */
[['1953-10-05',66],['1960-04-05',66],['1960-04-06',66+1/12],['1960-05-05',66+1/12],['1960-05-06',66+2/12],
 ['1960-12-06',66+9/12],['1961-01-06',66+10/12],['1961-02-06',66+11/12],['1961-03-05',66+11/12],
 ['1961-03-06',67],['1966-10-15',67],['1977-04-05',67],['1977-04-06',68],['1990-01-01',68]].forEach(([d,y]) =>
  t('State Pension age for born '+d+' = '+y.toFixed(3), () => near(spaMonths(d)/12, y, 1e-9)));
t('State Pension age never falls as date of birth gets later', () => {
  let prev = 0;
  for (let d = new Date(1955,0,1); d < new Date(1990,0,1); d = new Date(d.getTime()+86400000)){
    const s = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const m = spaMonths(s); assert(m >= prev, 'fell at '+s); assert(m >= 66*12 && m <= 68*12); prev = m;
  }
});

/* ---------- 2. Hand-calculated figures (worked out on paper, not by the code) ---------- */
// Person 1: pension 14,000, tax = (14,000-12,570)*20% = 286, net 13,714. ISA = (21,000-2,000)*4% = 760.
// Before State Pension: (13,714 + 760)/12 = 1,206.1666...
// After: Person 1 gross 26,547.60, tax 2,795.52, net 23,752.08. Person 2 State Pension 9,000, no tax.
// (23,752.08 + 9,000 + 760)/12 = 2,792.6733...
t('hand calc: monthly income before and after State Pension', () => {
  const s = run();
  near(s.months[0].income, 14474/12, 1e-9); near(s.months[83].income, 14474/12, 1e-9);
  near(s.months[84].income, 33512.08/12, 1e-9); near(s.months[119].income, 33512.08/12, 1e-9);
});
t('hand calc: tax paid', () => {
  const s = run();
  near(s.months[0].tax[0], 286, 1e-9); near(s.months[0].tax[1], 0, 1e-9);
  near(s.months[84].tax[0], 2795.52, 1e-9); near(s.months[84].tax[1], 0, 1e-9);
});
t('hand calc: ISA and starting savings', () => {
  const s = run(); near(s.isaAmt, 19000); near(s.isaYear, 760); near(s.buf0, 27000);
  const c = run({invest:false}); near(c.isaAmt, 0); near(c.isaYear, 0); near(c.buf0, 46000);
});
t('hand calc: first-year savings balance', () => {
  // (1,206.1667 - 1,600) x 12 = -4,726 a year
  const s = run(); near(s.rows[0].endBuf.e, 27000 - 4726, 1e-6);
  // ideal: (1,206.1667 - 2,200) x 12 = -11,926
  near(s.rows[0].endBuf.i, 27000 - 11926, 1e-6);
});
t('hand calc: Marriage Allowance with a non-taxpayer partner', () => {
  // Before: Person 1 tax 286 less 252 = 34. After: 2,795.52 less 252 = 2,543.52.
  const s = run({marriage:true});
  near(s.months[0].tax[0], 34, 1e-9); near(s.months[0].mSave, 252 > 286 ? 286 : 252, 1e-9);
  near(s.months[0].income, (13966+760)/12, 1e-9);
  near(s.months[84].tax[0], 2543.52, 1e-9); near(s.months[84].mSave, 252, 1e-9);
  near(s.months[84].income, (24004.08+9000+760)/12, 1e-9);
  near(s.marriageTotal, 252*10 - 0, 1e-6); // 252 a year for 10 years
});
t('hand calc: Marriage Allowance is capped by the tax actually owed', () => {
  // Person 1 pays only 6 of tax (12,600 pension, 30 over the allowance). Saving cannot exceed 6.
  const s = run({pension:[12600,0], sp:[0,0], marriage:true});
  near(s.months[0].tax[0], 0, 1e-9); near(s.months[0].mSave, 6, 1e-9);
});
t('hand calc: giver close to the allowance loses part of the saving', () => {
  // Person 2 has 12,000 of pension: giving 1,260 leaves them 690 taxable = 138 tax. Net saving 252-138 = 114.
  const s = run({pension:[20000,12000], pensionAge:[60,55], sp:[0,0], marriage:true});
  near(s.months[0].tax[1], 138, 1e-9); near(s.months[0].mSave, 114, 1e-9);
  near(s.months[0].tax[0], 1486 - 252, 1e-9);
});
t('Marriage Allowance is not used when it would not save money', () => {
  // Person 2 exactly at the allowance: giving up 1,260 costs 252 in tax, the same as the saving.
  const s = run({pension:[20000,12570], sp:[0,0], marriage:true});
  near(s.months[0].mSave, 0); near(s.months[0].tax[0], 1486); near(s.months[0].tax[1], 0);
});
t('Marriage Allowance is not used when both pay tax, or neither does', () => {
  let s = run({pension:[20000,15000], sp:[0,0], marriage:true}); near(s.months[0].mSave, 0);
  s = run({pension:[9000,5000], sp:[0,0], marriage:true}); near(s.months[0].mSave, 0);
});
t('Marriage Allowance is not available to a higher-rate taxpayer', () => {
  const s = run({pension:[60000,0], sp:[0,0], marriage:true}); near(s.months[0].mSave, 0);
  const e = run({pension:[HR_THRESHOLD,0], sp:[0,0], marriage:true}); near(e.months[0].mSave, 252);
});
t('Marriage Allowance works whichever partner is the taxpayer', () => {
  const a = run({pension:[0,20000], pensionAge:[60,55], sp:[0,0], marriage:true}); near(a.months[0].mSave, 252);
  near(a.months[0].tax[1], 1486-252);
});

/* ---------- 3. An independent, year-at-a-time calculator to compare against ---------- */
// Written differently on purpose: annual arithmetic, no monthly loop, no shared helpers.
function refPlan(s){
  const out = []; let buf = s.cash + (s.invest ? Math.min(s.emergency, s.lump) : s.lump);
  const isa = s.invest ? Math.max(0, s.lump - s.emergency) * s.swr / 100 : 0;
  for (let y = 0; y < 10; y++){
    const spa = y >= 7;
    const g = [s.pension[0] + (spa ? s.sp[0] : 0), s.pension[1] + (spa ? s.sp[1] : 0)];
    let tax = [g[0], g[1]].map(x => 0.2 * Math.max(0, x - 12570));
    if (s.marriage){
      let best = tax[0] + tax[1];
      for (const [giver, taker] of [[0,1],[1,0]]){
        if (g[giver] <= 12570 && g[taker] > 12570 && g[taker] <= 50270){
          const t2 = [0,0]; t2[giver] = 0.2 * Math.max(0, g[giver] - 11310); t2[taker] = Math.max(0, tax[taker] - 252);
          if (t2[0] + t2[1] < best){ tax = t2; best = t2[0] + t2[1]; }
        }
      }
    }
    const income = g[0] + g[1] - tax[0] - tax[1] + isa;
    buf = { e: buf, i: buf };
    out.push({income, tax: tax[0] + tax[1], eEnd: 0, iEnd: 0}); // placeholders filled below
  }
  let be = s.cash + (s.invest ? Math.min(s.emergency, s.lump) : s.lump), bi = be;
  out.forEach(r => { be += r.income - 12 * s.ess; bi += r.income - 12 * s.ideal; r.eEnd = be; r.iEnd = bi; });
  return out;
}
const scenarios = [
  {}, {marriage:true}, {invest:false}, {invest:false, marriage:true}, {pension:[14000,6000]}, {pension:[14000,6000], marriage:true},
  {pension:[9000,0], sp:[12547.60,12547.60]}, {pension:[30000,0], marriage:true}, {ess:900, ideal:1300}, {sp:[0,0]}, {cash:0, lump:0, emergency:0}
];
scenarios.forEach((over, k) => t('independent calculator agrees: scenario '+k+' '+JSON.stringify(over), () => {
  const s = run(over), ref = refPlan(base(over));
  assert.strictEqual(s.rows.length, 10);
  s.rows.forEach((r, y) => {
    near(r.endBuf.e, ref[y].eEnd, 1e-6, 'essentials balance, year '+(y+1));
    near(r.endBuf.i, ref[y].iEnd, 1e-6, 'ideal balance, year '+(y+1));
    near(r.income, ref[y].income, 1e-6, 'yearly income, year '+(y+1));
    near(r.tax, ref[y].tax, 1e-6, 'yearly tax, year '+(y+1));
  });
}));

/* ---------- 4. Money moves correctly ---------- */
t('savings balance equals starting pot plus every month in minus out', () => {
  const s = run({pension:[14000,3000]});
  let e = s.buf0, i = s.buf0;
  s.months.forEach(m => { e += m.income - 1600; i += m.income - 2200; near(m.e, e, 1e-6); near(m.i, i, 1e-6); });
});
t('yearly rows add up to the monthly figures', () => {
  const s = run({pension:[14000,3000], marriage:true});
  near(s.rows.reduce((a,r) => a + r.income, 0), s.months.reduce((a,m) => a + m.income, 0), 1e-6);
  near(s.rows.reduce((a,r) => a + r.n, 0), s.N);
  near(s.rows.reduce((a,r) => a + r.mSave, 0), s.marriageTotal, 1e-6);
  s.rows.forEach(r => near(r.src.p0+r.src.q0+r.src.p1+r.src.q1+r.src.isa, r.avg, 1e-6, 'sources add to average monthly income'));
  near(s.rows[s.rows.length-1].endBuf.e, s.months[s.N-1].e);
});
t('tax shown plus money received equals gross income plus ISA', () => {
  const s = run({pension:[14000,3000]});
  [0, 50, 84, 119].forEach(m => { const r = s.months[m];
    const gross = (m >= 0 ? 14000 : 0) + (m >= 0 ? 3000 : 0) + (m >= 84 ? 12547.60 + 9000 : 0);
    near(r.income*12 + r.tax[0] + r.tax[1], gross + s.isaYear, 1e-6); });
});
t('lump sum kept as cash adds the whole lump sum to savings and gives no ISA income', () => {
  const a = run({invest:true}), b = run({invest:false});
  near(b.buf0 - a.buf0, 21000 - 2000); near(a.isaYear, 760); near(b.isaYear, 0);
  near(a.months[0].income - b.months[0].income, 760/12);
});
t('emergency cash larger than the lump sum cannot create money', () => {
  const s = run({lump:1000, emergency:5000}); near(s.isaAmt, 0); near(s.buf0, 25000 + 1000);
});
t('cash interest compounds monthly to the stated yearly rate', () => {
  const first = run().months[0].income;
  const s = run({cashReal:2, ess:first}); // no flow in the bridge, so only interest moves the balance
  near(s.months[11].e, 27000 * 1.02, 1e-6);
  const n = run({cashReal:-2, ess:first}); near(n.months[11].e, 27000 * 0.98, 1e-6);
});
t('an overdrawn balance earns no interest', () => {
  const s = run({cashReal:5, cash:0, lump:0, emergency:0});
  let b = 0; s.months.slice(0,10).forEach(m => { b += m.income - 1600; near(m.e, b, 1e-6); });
});

/* ---------- 5. Tax-free allowance and inflation ---------- */
t('no inflation: allowance stays at 12,570', () => run().months.forEach(m => near(m.PA, PA_BASE)));
t('inflation: allowance frozen until April 2031 (in today\'s money it shrinks), then holds', () => {
  const s = run({inflation:2.5});
  near(s.months[0].PA, PA_BASE);
  const frozenYears = (PA_FREEZE_END - NOW) / 12, floor = PA_BASE / Math.pow(1.025, frozenYears);
  let prev = Infinity; s.months.forEach(m => { assert(m.PA <= prev + 1e-9); prev = m.PA; });
  near(s.months[119].PA, floor, 1e-9);
  const atFreeze = s.months.find(m => m.idx >= PA_FREEZE_END); near(atFreeze.PA, floor, 1e-9);
});
t('more inflation never means less tax', () => {
  const a = run({inflation:0}), b = run({inflation:3});
  a.months.forEach((m,i) => assert(b.months[i].tax[0] >= m.tax[0] - 1e-9));
});
t('pension below the allowance pays no tax; income equals pension', () => {
  const s = run({pension:[12000,0], sp:[0,0], invest:false}); near(s.months[0].income, 1000); near(s.months[0].tax[0], 0);
});
t('State Pension and pension are added together before tax', () => {
  const s = run({pension:[5000,0], sp:[10000,0], invest:false});
  near(s.months[100].tax[0], (15000-12570)*0.2, 1e-9);
});

/* ---------- 6. Timing: ages, State Pension dates, a late-starting pension ---------- */
t('plan runs to age 70 and rows count matches', () => {
  const s = run(); assert.strictEqual(s.N, 120); assert.strictEqual(s.rows.length, 10);
  assert.strictEqual(s.rows[0].age0, 60); assert.strictEqual(s.rows[9].age0, 69); near(s.rows[9].age1, END_AGE);
});
t('plan starts today if retirement date has passed, and still ends at age 70', () => {
  const s = simulate(base({dob:['1960-04-05','1960-04-05'], pensionAge:[60,55]}), {nowIdx:monthIdx('2022-04-15')}); // age 62
  near(s.N, 8*12); near(s.rows[0].age0, 62);
});
t('State Pension arrives in the right month for each person', () => {
  const s = run({dob:['1966-10-15','1964-02-10'], sp:[10000,8000], pension:[0,0], invest:false, cash:0, lump:0});
  // Person 2: born Feb 1964 -> 67 -> Feb 2031
  const p2 = monthIdx('1964-02-10') + 67*12 - NOW; near(s.spaM[1], p2); near(s.spaM[0], 84);
  near(s.months[p2-1].q[1], 0); near(s.months[p2].q[1], 8000);
  near(s.months[83].q[0], 0); near(s.months[84].q[0], 10000);
});
t('Person 2 pension that starts later does not count before its start age', () => {
  const s = run({pension:[0,6000], pensionAge:[60,63], sp:[0,0], invest:false});
  near(s.months[35].p[1], 0); near(s.months[36].p[1], 6000);
});
t('State Pension age 66 vs 67 shifts the bridge by exactly one year', () => {
  const six = simulate(base({dob:['1960-04-05','1960-04-05']}), {nowIdx:monthIdx('1960-04-05')+720});
  const sev = run();
  near(six.spaM[0], 72); near(sev.spaM[0], 84);
});

/* ---------- 7. Needed extra pension ---------- */
t('needed extra pension keeps savings at or above zero, and 10 pounds less does not', () => {
  const s = base({ess:1700, ideal:2300}), f = (x, sc) => summarise(simulate(s, {nowIdx:NOW, extra2:x}), sc).min;
  const orig = global.__now; // neededExtra uses today's date, so test the same function with fixed inputs below
  for (const sc of ['e','i']){
    let lo = 0, hi = 40000;
    if (f(0, sc) >= 0) continue;
    for (let k=0;k<50;k++){ const mid=(lo+hi)/2; if (f(mid,sc)>=0) hi=mid; else lo=mid; }
    assert(f(Math.ceil(hi/10)*10, sc) >= -1e-6); assert(f(Math.ceil(hi/10)*10 - 10 - 0.01, sc) < 0 || hi < 10);
  }
});
t('neededExtra returns 0 when already covered and null when hopeless', () => {
  assert.strictEqual(neededExtra(Object.assign(defaultState(), {ess:100, ideal:100}), 'e'), 0);
  assert.strictEqual(neededExtra(Object.assign(defaultState(), {ess:9000, ideal:9000, pension:[0,0], sp:[0,0]}), 'e'), null);
});

/* ---------- 8. Lump sum: cash versus invested ---------- */
t('no growth, no withdrawal: nothing changes', () => { const m = lumpModel(10000, 0, 0, 5); m.pot.forEach(v => near(v, 10000)); });
t('growth with no withdrawal matches compound interest', () => {
  const m = lumpModel(10000, 0, 0.03, 10); near(m.pot[10], 10000*Math.pow(1.03,10), 1e-6);
});
t('with withdrawals matches the standard annuity formula', () => {
  const A = 16560, W = 662.4, r = 0.03, m = lumpModel(A, W, r, 30);
  for (let y = 1; y <= 30; y++) near(m.pot[y], A*Math.pow(1+r,y) - W*(Math.pow(1+r,y)-1)/r, 1e-6, 'year '+y);
});
t('at zero growth: pot plus income taken always equals the amount, and it runs out on time', () => {
  const m = lumpModel(16560, 720, 0, 30);
  m.pot.forEach((v,y) => near(v + m.taken[y], 16560, 1e-6));
  assert.strictEqual(m.pot.findIndex(v => v <= 0.5), 23); near(m.taken[30], 16560, 1e-6);
});
t('pot never goes negative and income taken never exceeds what was available', () => {
  const m = lumpModel(5000, 900, -0.1, 20); m.pot.forEach(v => assert(v >= 0));
  m.taken.forEach((v,y) => assert(v <= 5000*Math.pow(1.0, y) + 1e-6));
});
t('a bad first year lowers every later balance', () => {
  const a = lumpModel(16560, 662, 0.03, 30), b = lumpModel(16560, 662, 0.03, 30, -0.25);
  for (let y = 1; y <= 30; y++) assert(b.pot[y] < a.pot[y]);
});
t('higher growth never gives a lower balance', () => {
  const lo = lumpModel(16560, 662, 0.00, 30), mid = lumpModel(16560, 662, 0.03, 30), hi = lumpModel(16560, 662, 0.05, 30);
  for (let y = 0; y <= 30; y++){ assert(lo.pot[y] <= mid.pot[y] + 1e-9 && mid.pot[y] <= hi.pot[y] + 1e-9); }
});

/* ---------- 9. Number formatting ---------- */
t('money formats pounds, signs and rounding', () => {
  assert.strictEqual(money(1234.5), '£1,235'); assert.strictEqual(money(-631.4), '−£631'); assert.strictEqual(money(0), '£0');
  assert.strictEqual(money(-0.2), '£0'); assert.strictEqual(money(65.254, true), '£65.25'); assert.strictEqual(money(1000000), '£1,000,000');
  assert.strictEqual(money(-12.5, true), '−£12.50');
});
t('axis money is compact', () => { assert.strictEqual(axisMoney(2500), '£2.5k'); assert.strictEqual(axisMoney(-10000), '−£10k'); assert.strictEqual(axisMoney(500), '£500'); assert.strictEqual(axisMoney(0), '£0'); });
t('ages read naturally', () => {
  assert.strictEqual(ageText(804), '67'); assert.strictEqual(ageText(802), '66 and 10 months'); assert.strictEqual(ageText(793), '66 and 1 month');
  assert.strictEqual(ageText(803.7), '67');
});

/* ---------- 10. Randomised checks: rules that must hold for any inputs ---------- */
const R = rng(20260515);
const pick = (lo, hi) => lo + (hi - lo) * R();
function randomState(){
  const yr = Math.floor(pick(1955, 1985));
  const d = () => yr + Math.floor(pick(-3, 4)) + '-' + String(1 + Math.floor(R()*12)).padStart(2,'0') + '-' + String(1 + Math.floor(R()*28)).padStart(2,'0');
  return Object.assign(defaultState(), {
    dob:[d(), d()], dobConfirmed:true,
    pension:[R()<.1?0:Math.round(pick(0,45000)), R()<.4?0:Math.round(pick(0,30000))],
    pensionAge:[Math.round(pick(55,66)), Math.round(pick(55,67))],
    sp:[Math.round(pick(0,12600)), Math.round(pick(0,12600))],
    ess:Math.round(pick(500,3000)), ideal:Math.round(pick(1000,5000)),
    cash:Math.round(pick(0,80000)), lump:Math.round(pick(0,60000)), emergency:Math.round(pick(0,8000)),
    swr:+pick(2,6).toFixed(2), invest:R()<.5, inflation:+pick(0,6).toFixed(1), cashReal:+pick(-2,3).toFixed(1), marriage:R()<.5, extra2:0
  });
}
const nowFor = s => monthIdx(s.dob[0]) + 55*12 + Math.floor(pick(0, 120));
for (let k = 0; k < 400; k++){
  const s = randomState(), now = nowFor(s), o = {nowIdx: now};
  let sim; try { sim = simulate(s, o); } catch (e) { t('random '+k+' runs', () => { throw e; }); continue; }
  t('random '+k+': tax, income and balances are sane', () => {
    assert(sim.N >= 12); assert.strictEqual(sim.rows.length, Math.ceil(sim.N/12));
    near(sim.rows.reduce((a,r)=>a+r.n,0), sim.N);
    sim.months.forEach((m, i) => {
      assert(m.tax[0] >= 0 && m.tax[1] >= 0, 'negative tax');
      assert(m.tax[0] <= 0.2*(m.p[0]+m.q[0]+m.tax[0]) + 1e-6, 'tax over 20%');
      assert(m.income >= 0 && isFinite(m.income), 'bad income');
      assert(m.mSave >= 0, 'negative Marriage Allowance saving');
      if (!s.marriage) assert.strictEqual(m.mSave, 0);
      assert(isFinite(m.e) && isFinite(m.i));
    });
    near(sim.rows.reduce((a,r)=>a+r.income,0), sim.months.reduce((a,m)=>a+m.income,0), 1e-5);
    near(sim.rows.reduce((a,r)=>a+r.mSave,0), sim.marriageTotal, 1e-5);
  });
  t('random '+k+': with no interest or inflation the balance is exactly starting pot plus flows', () => {
    const z = simulate(Object.assign({}, s, {cashReal:0, inflation:0}), o);
    let e = z.buf0, i = z.buf0;
    z.months.forEach(m => { e += m.income - s.ess; i += m.income - s.ideal; near(m.e, e, 1e-5); near(m.i, i, 1e-5); });
  });
  t('random '+k+': Marriage Allowance never increases tax and saving equals the tax drop', () => {
    const off = simulate(Object.assign({}, s, {marriage:false}), o), on = simulate(Object.assign({}, s, {marriage:true}), o);
    on.months.forEach((m, i) => {
      const before = off.months[i].tax[0] + off.months[i].tax[1], after = m.tax[0] + m.tax[1];
      assert(after <= before + 1e-9, 'tax went up');
      near(before - after, m.mSave, 1e-9, 'saving matches tax drop');
      assert(m.mSave <= 252 + 1e-9, 'saving above 252');
      assert(m.income >= off.months[i].income - 1e-9);
    });
    assert(on.marriageTotal >= 0);
  });
  t('random '+k+': more pension for Person 2 never lowers income or savings', () => {
    const a = simulate(s, Object.assign({extra2:0}, o)), b = simulate(s, Object.assign({extra2:3000}, o));
    a.months.forEach((m, i) => { assert(b.months[i].income >= m.income - 1e-9); assert(b.months[i].e >= m.e - 1e-9); });
  });
  t('random '+k+': higher spending never raises savings; ideal never above essentials if ideal >= essentials', () => {
    const lo = simulate(Object.assign({}, s, {ess:1000, ideal:1000}), o), hi = simulate(Object.assign({}, s, {ess:1500, ideal:1500}), o);
    lo.months.forEach((m, i) => assert(hi.months[i].e <= m.e + 1e-9));
    const sm = summarise(sim, 'e'); assert(sm.min <= sim.buf0 + 1e-9);
    if (s.ideal >= s.ess) sim.months.forEach(m => assert(m.i <= m.e + 1e-9));
  });
  t('random '+k+': lump sum choice only moves the opening pot and ISA income', () => {
    const a = simulate(Object.assign({}, s, {invest:true}), o), b = simulate(Object.assign({}, s, {invest:false}), o);
    near(b.buf0 - a.buf0, s.lump - Math.min(s.emergency, s.lump), 1e-9);
    near(a.isaYear, Math.max(0, s.lump - s.emergency) * s.swr/100, 1e-9); near(b.isaYear, 0);
  });
}
t('random: neededExtra gives a plan that works, and a smaller amount does not', () => {
  const R2 = rng(7); let checked = 0;
  for (let k = 0; k < 40; k++){
    const s = randomState(); s.extra2 = 0;
    // neededExtra reads the real clock, so give it a state whose retirement date is in the future
    s.dob = [H.minusYears(new Date().toISOString().slice(0,10), 58), H.minusYears(new Date().toISOString().slice(0,10), 58)];
    for (const sc of ['e','i']){
      const x = neededExtra(s, sc), f = v => summarise(simulate(s, {extra2:v}), sc).min;
      if (x === null){ assert(f(40000) < 0); continue; }
      if (x === 0){ assert(f(0) >= 0); continue; }
      assert(f(x) >= -1e-6, 'needed amount works'); assert(f(x - 10) < 0, 'ten pounds less does not'); checked++;
    }
  }
  assert(checked > 5, 'enough cases exercised: '+checked);
});

/* ---------- 11. Review fixes ---------- */
t('horizon: default case still ends at age 70 (3 years after State Pension at 67)', () => { const s = run(); assert.strictEqual(s.N, 120); near(s.endAge, 70); });
t('horizon: a much younger Person 2 extends the plan to 3 years after THEIR State Pension starts', () => {
  const s = run({dob:['1966-10-15','1976-10-15']});
  near(s.spaM[1], 204); assert.strictEqual(s.N, 204 + 36); near(s.endAge, 60 + 240/12);
  assert(s.months[s.N-1].q[1] > 0 && s.months[s.N-37].q[1] === 0 || s.months[s.N-37].q[1] > 0, 'State Pension for Person 2 is inside the plan');
  near(s.months[203].q[1], 0); assert(s.months[204].q[1] > 0);
});
t('horizon: an older Person 2 does not shorten the plan', () => assert.strictEqual(run({dob:['1966-10-15','1960-01-01']}).N, 120));
t('payment lag: pensions and State Pension start one month later, ISA income does not', () => {
  const s = run({payLag:1});
  near(s.months[0].p[0], 0); assert(s.months[1].p[0] > 0); near(s.months[84].q[0], 0); assert(s.months[85].q[0] > 0);
  assert(s.months[0].isa > 0); near(s.spaM[0], 84, 1e-9, 'the legal State Pension date does not move');
});
t('payment lag: costs exactly one more month of spending net of the ISA income', () => {
  // lowest point is just before State Pension. With a one-month lag it is one month later, so
  // lowest(lag 1) = lowest(lag 0) + (ISA per month - monthly spending)
  const a = summarise(run(), 'e').min, b = summarise(run({payLag:1}), 'e').min;
  near(b, a + (760/12 - 1600), 1e-6);
});
t('ISA income stops when the pot is used up', () => {
  const s = run({lump:20000, emergency:0, swr:20, growth:0});
  near(s.isaYear, 4000); near(s.months[59].isa, 4000); near(s.months[60].isa, 0);
  near(s.months.reduce((a,m) => a + m.isa/12, 0), 20000, 1e-6, 'never takes out more than was put in at 0% growth');
});
t('ISA income carries on while the pot lasts (growth keeps pace)', () => {
  const s = run({lump:20000, emergency:0, swr:4, growth:3}); s.months.forEach(m => near(m.isa, 800, 1e-9));
});
const minAt = cash => summarise(run({cash}), 'e').min;
t('assess: covered, tight and runs-out thresholds', () => {
  const m0 = minAt(25000), need = c => c;                       // lowest point rises 1-for-1 with starting cash
  const withMin = target => run({cash: 25000 + (target - m0)});
  let a = assess(withMin(10000), 'e', 1600); assert.strictEqual(a.cls, 'good'); assert.strictEqual(a.code, 'covered');
  a = assess(withMin(4799), 'e', 1600); assert.strictEqual(a.cls, 'warn'); assert.strictEqual(a.code, 'tight');
  a = assess(withMin(4801), 'e', 1600); assert.strictEqual(a.cls, 'good');
  a = assess(withMin(1), 'e', 1600); assert.strictEqual(a.cls, 'warn');
  a = assess(withMin(-1), 'e', 1600); assert.strictEqual(a.cls, 'bad'); assert.strictEqual(a.code, 'runs-out');
});
t('assess: income below spending after the plan ends is not shown as covered', () => {
  // Pensions never cover spending. A large pot gets through to the end but not for life.
  const mk = cash => run({pension:[6000,0], sp:[5000,0], cash, lump:0, emergency:0, ess:1500, ideal:2000});
  const lastsTo = a => (a.lastsToM == null ? Infinity : (a.lastsToM + mk(0).start - monthIdx('1966-10-15')) / 12);
  let a = assess(mk(120000), 'e', 1500); assert.strictEqual(a.runOut, -1); assert.strictEqual(a.code, 'long-run'); assert.strictEqual(a.cls, 'bad'); assert(lastsTo(a) < 85);
  const target = 90; let lo = 120000, hi = 600000; for (let k=0;k<60;k++){ const mid=(lo+hi)/2; const x = assess(mk(mid),'e',1500); if (lastsTo(x) < target) lo = mid; else hi = mid; }
  a = assess(mk(hi), 'e', 1500); assert.strictEqual(a.cls, 'warn'); assert.strictEqual(a.code, 'long-run');
  a = assess(mk(5e6), 'e', 1500); assert.strictEqual(a.cls, 'good');
});
t('assess: surplus after State Pension never triggers the long-run warning', () => assert.notStrictEqual(assess(run({cash:60000}), 'e', 1600).code, 'long-run'));
t('neededExtra with a cushion needs more than without, and is minimal', () => {
  const today = new Date().toISOString().slice(0,10), mk = () => Object.assign(base({dob:[H.minusYears(today,58), H.minusYears(today,58)], ess:1700}), {extra2:0});
  const f = x => summarise(simulate(mk(), {extra2:x}), 'e').min;
  const plain = neededExtra(mk(), 'e'), cushion = neededExtra(mk(), 'e', 5100);
  assert(plain > 0 && cushion > plain, plain+' / '+cushion);
  assert(f(cushion) >= 5100 - 1e-6); assert(f(cushion - 10) < 5100);
});
t('neededExtra: a plan that is covered but has no cushion needs nothing for coverage and something for the cushion', () => {
  const today = new Date().toISOString().slice(0,10);
  const mk = cash => Object.assign(base({dob:[H.minusYears(today,58), H.minusYears(today,58)], cash}), {extra2:0});
  const min0 = summarise(simulate(mk(25000)), 'e').min;
  const s = mk(25000 + 1000 - min0);                 // lowest point is exactly 1,000
  near(summarise(simulate(s), 'e').min, 1000, 1e-6);
  assert.strictEqual(neededExtra(s, 'e'), 0);
  const c = neededExtra(s, 'e', 4800); assert(c > 0 && c < 2000, String(c));
  assert(summarise(simulate(s, {extra2:c}), 'e').min >= 4800 - 1e-6); assert(summarise(simulate(s, {extra2:c-10}), 'e').min < 4800);
});

done('engine tests');
