// Run: node tests/engine.test.js
const H = require('./harness.js');
const {simulate, summarise, assess, readiness, neededWork, stressedState, NI_RATE, NI_THRESHOLD, RESERVE_MONTHS, SPEND_MARGIN, maxSafeSpend, MAX_SPEND, lumpModel, spaMonths, monthIdx, defaultState, dateAtAge, assert, t, near, done, rng, money, axisMoney, ageText, PA_BASE, HR_THRESHOLD, PA_FREEZE_END, END_AGE} = H;

// A tidy test scenario: both born 15 Oct 1966, retirement month = "now", so the plan starts at age 60
// and both State Pensions begin exactly 84 months in. Money values are made up.
const NOW = monthIdx('2026-10-15');
function base(over){
  return Object.assign(defaultState(), {
    dob:['1966-10-15','1966-10-15'], dobConfirmed:true,
    pension:[14000,0], pensionDate:['2026-10-15','2021-10-15'], sp:[12547.60,9000],
    spend:1600, cash:25000, lump:21000, emergency:2000, swr:4, invest:true,
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
  const s = run(); near(s.rows[0].endBal, 27000 - 4726, 1e-6);
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
  const s = run({pension:[20000,12000], pensionDate:['2026-10-15','2021-10-15'], sp:[0,0], marriage:true});
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
  const a = run({pension:[0,20000], pensionDate:['2026-10-15','2021-10-15'], sp:[0,0], marriage:true}); near(a.months[0].mSave, 252);
  near(a.months[0].tax[1], 1486-252);
});

/* ---------- 3. An independent, year-at-a-time calculator to compare against ---------- */
// Written differently on purpose: annual arithmetic, no monthly loop, no shared helpers.
function refPlan(s){
  const out = []; let bal = s.cash + (s.invest ? Math.min(s.emergency, s.lump) : s.lump);
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
    bal += income - 12 * s.spend;
    out.push({income, tax: tax[0] + tax[1], end: bal});
  }
  return out;
}
const scenarios = [
  {}, {marriage:true}, {invest:false}, {invest:false, marriage:true}, {pension:[14000,6000]}, {pension:[14000,6000], marriage:true},
  {pension:[9000,0], sp:[12547.60,12547.60]}, {pension:[30000,0], marriage:true}, {spend:900}, {sp:[0,0]}, {cash:0, lump:0, emergency:0}
];
scenarios.forEach((over, k) => t('independent calculator agrees: scenario '+k+' '+JSON.stringify(over), () => {
  const s = run(over), ref = refPlan(base(over));
  assert.strictEqual(s.rows.length, 10);
  s.rows.forEach((r, y) => {
    near(r.endBal, ref[y].end, 1e-6, 'savings balance, year '+(y+1));
    near(r.income, ref[y].income, 1e-6, 'yearly income, year '+(y+1));
    near(r.tax, ref[y].tax, 1e-6, 'yearly tax, year '+(y+1));
  });
}));

/* ---------- 4. Money moves correctly ---------- */
t('savings balance equals starting pot plus every month in minus out', () => {
  const s = run({pension:[14000,3000]});
  let e = s.buf0;
  s.months.forEach(m => { e += m.income - 1600; near(m.bal, e, 1e-6); });
});
t('yearly rows add up to the monthly figures', () => {
  const s = run({pension:[14000,3000], marriage:true});
  near(s.rows.reduce((a,r) => a + r.income, 0), s.months.reduce((a,m) => a + m.income, 0), 1e-6);
  near(s.rows.reduce((a,r) => a + r.n, 0), s.N);
  near(s.rows.reduce((a,r) => a + r.mSave, 0), s.marriageTotal, 1e-6);
  s.rows.forEach(r => near(r.src.p0+r.src.q0+r.src.p1+r.src.q1+r.src.w+r.src.isa, r.avg, 1e-6, 'sources add to average monthly income'));
  near(s.rows[s.rows.length-1].endBal, s.months[s.N-1].bal);
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
  const s = run({cashReal:2, spend:first}); // no flow in the bridge, so only interest moves the balance
  near(s.months[11].bal, 27000 * 1.02, 1e-6);
  const n = run({cashReal:-2, spend:first}); near(n.months[11].bal, 27000 * 0.98, 1e-6);
});
t('an overdrawn balance earns no interest', () => {
  const s = run({cashReal:5, cash:0, lump:0, emergency:0});
  let b = 0; s.months.slice(0,10).forEach(m => { b += m.income - 1600; near(m.bal, b, 1e-6); });
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
  const s = simulate(base({dob:['1960-04-05','1960-04-05'], pensionDate:['2020-04-05','2015-04-05']}), {nowIdx:monthIdx('2022-04-15')}); // age 62
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
  const s = run({pension:[0,6000], pensionDate:['2026-10-15','2029-10-15'], sp:[0,0], invest:false});
  near(s.months[35].p[1], 0); near(s.months[36].p[1], 6000);
});
t('State Pension age 66 vs 67 shifts the bridge by exactly one year', () => {
  const six = simulate(base({dob:['1960-04-05','1960-04-05'], pensionDate:['2020-04-05','2015-04-05']}), {nowIdx:monthIdx('1960-04-05')+720});
  const sev = run();
  near(six.spaM[0], 72); near(sev.spaM[0], 84);
});

/* ---------- 7. The safe maximum monthly spending ---------- */
// Two cases worked out on paper.
// (a) No income of any kind, savings C. Safe means lasting to age 95 with spending 5% higher:
//     the plan is 120 months, then 300 more months to age 95, so C >= 1.05 x spend x 420, i.e. spend <= C / 441.
t('safe maximum: with no income at all it is savings / 441 a month (lasting to 95 with the 5% margin)', () => {
  const s = base({pension:[0,0], sp:[0,0], work:[0,0], lump:0, emergency:0, invest:false, cash:450000});
  assert.strictEqual(maxSafeSpend(s, {nowIdx:NOW}), 1020);                 // 450,000 / 441 = 1,020.4
  assert(readiness(Object.assign({}, s, {spend:1020}), {nowIdx:NOW}).safe); assert(!readiness(Object.assign({}, s, {spend:1030}), {nowIdx:NOW}).safe);
  assert.strictEqual(maxSafeSpend(Object.assign({}, s, {cash:88400}), {nowIdx:NOW}), 200);   // 88,400 / 441 = 200.5
});
// (b) Nothing coming in until both State Pensions start (month 84), then plenty. With the margin the first payments are
//     a month late (month 85) and spending is 1.05 x spend, so the lowest point is C - 1.05 x spend x 85, which must stay
//     at or above 6 x spend. So spend <= C / (1.05 x 85 + 6) = C / 95.25.
t('safe maximum: limited by the years before State Pension: savings / 95.25 a month', () => {
  const s = base({pension:[0,0], sp:[20000,20000], work:[0,0], lump:0, emergency:0, invest:false, cash:100000});
  assert.strictEqual(maxSafeSpend(s, {nowIdx:NOW}), 1040);                 // 100,000 / 95.25 = 1,049.9
  assert(readiness(Object.assign({}, s, {spend:1040}), {nowIdx:NOW}).safe); assert(!readiness(Object.assign({}, s, {spend:1050}), {nowIdx:NOW}).safe);
});
t('safe maximum: zero when nothing is coming in and nothing is saved, and capped at the ceiling for huge savings', () => {
  assert.strictEqual(maxSafeSpend(base({pension:[0,0], sp:[0,0], work:[0,0], lump:0, emergency:0, invest:false, cash:0}), {nowIdx:NOW}), 0);
  assert.strictEqual(maxSafeSpend(base({cash:50000000}), {nowIdx:NOW}), MAX_SPEND);
});
t('safe maximum: planning to spend exactly the maximum is safe, and ten pounds more is not', () => {
  const s = base({cash:15000}), m = maxSafeSpend(s, {nowIdx:NOW});
  assert(m > 0 && m < MAX_SPEND); assert(readiness(Object.assign({}, s, {spend:m}), {nowIdx:NOW}).safe); assert(!readiness(Object.assign({}, s, {spend:m + 10}), {nowIdx:NOW}).safe);
});
t('safe maximum: more savings, pension, earnings or Marriage Allowance never lower it', () => {
  const o = {nowIdx:NOW}, b = maxSafeSpend(base({cash:15000}), o);
  for (const over of [{cash:20000}, {pension:[16000,0]}, {sp:[12547.60,12547.60]}, {work:[3000,0]}, {work:[0,3000]}, {marriage:true}, {lump:30000, emergency:30000}])
    assert(maxSafeSpend(base(Object.assign({cash:15000}, over)), o) >= b, 'lowered by ' + JSON.stringify(over));
});
t('safe maximum: the safety margin only ever lowers it (a plan with later payments or higher prices can spend less)', () => {
  const o = {nowIdx:NOW}, b = maxSafeSpend(base({cash:15000}), o);
  assert(maxSafeSpend(base({cash:15000, payLag:3}), o) <= b); assert(maxSafeSpend(base({cash:15000, inflation:4}), o) <= b);
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
  const d0 = d(), d1 = d();
  return Object.assign(defaultState(), {
    dob:[d0, d1], dobConfirmed:true,
    pension:[R()<.1?0:Math.round(pick(0,45000)), R()<.4?0:Math.round(pick(0,30000))],
    pensionDate:[dateAtAge(d0, Math.round(pick(55,66))), dateAtAge(d1, Math.round(pick(55,67)))],
    sp:[Math.round(pick(0,12600)), Math.round(pick(0,12600))],
    spend:Math.round(pick(500,3000)),
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
      assert(isFinite(m.bal));
    });
    near(sim.rows.reduce((a,r)=>a+r.income,0), sim.months.reduce((a,m)=>a+m.income,0), 1e-5);
    near(sim.rows.reduce((a,r)=>a+r.mSave,0), sim.marriageTotal, 1e-5);
  });
  t('random '+k+': with no interest or inflation the balance is exactly starting pot plus flows', () => {
    const z = simulate(Object.assign({}, s, {cashReal:0, inflation:0}), o);
    let e = z.buf0;
    z.months.forEach(m => { e += m.income - s.spend; near(m.bal, e, 1e-5); });
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
    a.months.forEach((m, i) => { assert(b.months[i].income >= m.income - 1e-9); assert(b.months[i].bal >= m.bal - 1e-9); });
  });
  t('random '+k+': higher spending never raises savings', () => {
    const lo = simulate(Object.assign({}, s, {spend:1000}), o), hi = simulate(Object.assign({}, s, {spend:1500}), o);
    lo.months.forEach((m, i) => assert(hi.months[i].bal <= m.bal + 1e-9));
    const sm = summarise(sim); assert(sm.min <= sim.buf0 + 1e-9);
  });
  t('random '+k+': lump sum choice only moves the opening pot and ISA income', () => {
    const a = simulate(Object.assign({}, s, {invest:true}), o), b = simulate(Object.assign({}, s, {invest:false}), o);
    near(b.buf0 - a.buf0, s.lump - Math.min(s.emergency, s.lump), 1e-9);
    near(a.isaYear, Math.max(0, s.lump - s.emergency) * s.swr/100, 1e-9); near(b.isaYear, 0);
  });
}
t('random: the safe maximum is safe, and ten pounds more is not (and never goes backwards as savings grow)', () => {
  let checked = 0;
  for (let k = 0; k < 60; k++){
    const s = randomState(), o = {nowIdx: nowFor(s)}, m = maxSafeSpend(s, o);
    if (m >= MAX_SPEND){ assert(readiness(Object.assign({}, s, {spend:MAX_SPEND}), o).safe); continue; }
    if (m > 0) assert(readiness(Object.assign({}, s, {spend:m}), o).safe, 'safe at the maximum');
    assert(!readiness(Object.assign({}, s, {spend:m + 10}), o).safe, 'ten pounds more is not safe');
    assert(maxSafeSpend(Object.assign({}, s, {cash:s.cash + 20000}), o) >= m, 'more savings never lowers it'); checked++;
  }
  assert(checked > 20, 'enough cases: ' + checked);
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
  const a = summarise(run()).min, b = summarise(run({payLag:1})).min;
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
const minAt = cash => summarise(run({cash})).min;
t('assess: covered, tight and runs-out thresholds', () => {
  const m0 = minAt(25000), need = c => c;                       // lowest point rises 1-for-1 with starting cash
  const withMin = target => run({cash: 25000 + (target - m0)});
  let a = assess(withMin(10000), 1600); assert.strictEqual(a.cls, 'good'); assert.strictEqual(a.code, 'covered');
  a = assess(withMin(4799), 1600); assert.strictEqual(a.cls, 'warn'); assert.strictEqual(a.code, 'tight');
  a = assess(withMin(4801), 1600); assert.strictEqual(a.cls, 'good');
  a = assess(withMin(1), 1600); assert.strictEqual(a.cls, 'warn');
  a = assess(withMin(-1), 1600); assert.strictEqual(a.cls, 'bad'); assert.strictEqual(a.code, 'runs-out');
});
t('assess: income below spending after the plan ends is not shown as covered', () => {
  // Pensions never cover spending. A large pot gets through to the end but not for life.
  const mk = cash => run({pension:[6000,0], sp:[5000,0], cash, lump:0, emergency:0, spend:1500});
  const lastsTo = a => (a.lastsToM == null ? Infinity : (a.lastsToM + mk(0).start - monthIdx('1966-10-15')) / 12);
  let a = assess(mk(120000), 1500); assert.strictEqual(a.runOut, -1); assert.strictEqual(a.code, 'long-run'); assert.strictEqual(a.cls, 'bad'); assert(lastsTo(a) < 85);
  const target = 90; let lo = 120000, hi = 600000; for (let k=0;k<60;k++){ const mid=(lo+hi)/2; const x = assess(mk(mid),1500); if (lastsTo(x) < target) lo = mid; else hi = mid; }
  a = assess(mk(hi), 1500); assert.strictEqual(a.cls, 'warn'); assert.strictEqual(a.code, 'long-run');
  a = assess(mk(5e6), 1500); assert.strictEqual(a.cls, 'good');
});
t('assess: surplus after State Pension never triggers the long-run warning', () => assert.notStrictEqual(assess(run({cash:60000}), 1600).code, 'long-run'));
/* ---------- 12. Lump sum: split between savings pot and investment, with or without income ---------- */
const annuity = (A, W, r, y) => r === 0 ? A - W*y : A*Math.pow(1+r,y) - W*(Math.pow(1+r,y)-1)/r;
t('grow only: no income taken, pot compounds exactly, savings pot unchanged by the choice', () => {
  const g = run({drawdown:false}), d = run({drawdown:true});
  near(g.isaYear, 0); g.months.forEach(m => near(m.isa, 0)); near(g.buf0, d.buf0);
  g.rows.forEach((r, y) => { near(r.isaEnd, 19000*Math.pow(1.03, y+1), 1e-6); near(r.isaStart, 19000*Math.pow(1.03, y), 1e-6); });
  near(g.months[0].income, d.months[0].income - 760/12, 1e-9, 'income differs by exactly the ISA income');
});
t('grow only: lower income means the savings pot is lower by exactly the income that was not taken', () => {
  const g = run({drawdown:false}), d = run({drawdown:true});
  d.months.forEach((m, i) => near(m.bal - g.months[i].bal, 760/12 * (i+1), 1e-6));
});
t('with income: investment follows the annuity formula year by year', () => {
  const d = run({drawdown:true}); d.rows.forEach((r, y) => near(r.isaEnd, annuity(19000, 760, 0.03, y+1), 1e-6, 'year '+(y+1)));
});
t('with income at 0% growth: pot plus income taken always equals what was put in', () => {
  const d = run({drawdown:true, growth:0}); let taken = 0;
  d.rows.forEach((r, y) => { taken += r.src.isa*12; near(r.isaEnd + taken, 19000, 1e-6); });
});
t('keeping it all as cash: no investment anywhere', () => {
  const c = run({invest:false}); c.isaPot.forEach(v => near(v, 0)); c.rows.forEach(r => { near(r.isaEnd, 0); near(r.isaStart, 0); });
});
t('the split: everything to the savings pot, everything to the investment', () => {
  const allCash = run({emergency:21000}); near(allCash.isaStart, 0); allCash.rows.forEach(r => near(r.isaEnd, 0)); near(allCash.buf0, 25000 + 21000); near(allCash.isaYear, 0);
  const allInv = run({emergency:0, drawdown:false}); near(allInv.isaStart, 21000); near(allInv.buf0, 25000); near(allInv.rows[9].isaEnd, 21000*Math.pow(1.03,10), 1e-6);
});
t('split amounts always add up: savings pot top-up plus investment equals the lump sum', () => {
  for (const e of [0, 500, 2000, 10000, 21000, 30000]) { const s = run({emergency:e}); near((s.buf0 - 25000) + s.isaStart, 21000, 1e-9, 'emergency '+e); }
});
t('the investment value never goes below zero and is flat at 0% growth with no income', () => {
  run({drawdown:false, growth:0}).rows.forEach(r => near(r.isaEnd, 19000, 1e-9));
  run({drawdown:true, swr:30, growth:0}).rows.forEach(r => assert(r.isaEnd >= 0));
});
for (let k = 0; k < 150; k++){
  const s2 = randomState(); s2.growth = +pick(0, 7).toFixed(1); s2.drawdown = R() < .5;
  t('random lump '+k+': investment value is consistent with its income and growth', () => {
    const sim = simulate(s2, {nowIdx: nowFor(s2)});
    const amt = s2.invest ? Math.max(0, s2.lump - s2.emergency) : 0;
    near(sim.isaStart, amt, 1e-9); sim.rows.forEach(r => { assert(r.isaEnd >= -1e-9); assert(isFinite(r.isaEnd)); });
    if (!s2.invest || amt === 0) sim.rows.forEach(r => near(r.isaEnd, 0, 1e-9));
    if (s2.invest && !s2.drawdown){ sim.months.forEach(m => near(m.isa, 0)); let prev = amt; sim.rows.forEach(r => { assert(r.isaEnd >= prev - 1e-9); prev = r.isaEnd; }); }
    if (s2.invest && s2.drawdown){ // money in the pot plus cumulative income, at zero growth, equals what went in
      const z = simulate(Object.assign({}, s2, {growth:0}), {nowIdx: nowFor(s2)}); let tk = 0; z.rows.forEach(r => { tk += r.src.isa*12; near(r.isaEnd + tk, amt, 1e-5); }); }
  });
}

/* ---------- 13. Part-time earnings, and the "safe to retire" test ---------- */
t('earnings: hand calculation with tax and National Insurance', () => {
  // Person 1: pension 14,000 + earnings 20,000 = 34,000. Tax (34,000-12,570)*20% = 4,286. NI (20,000-12,570)*8% = 594.40.
  // Net 34,000 - 4,286 - 594.40 = 29,119.60. Plus ISA 760.
  const s = run({work:[20000,0]});
  near(s.months[0].tax[0], 4286, 1e-9); near(s.months[0].ni[0], 594.4, 1e-9); near(s.months[0].income, (29119.6 + 760)/12, 1e-9);
  near(s.months[0].w[0], 20000*(1-4286/34000), 1e-9, 'earnings after tax shown on their own');
});
t('earnings stop on the person\'s own State Pension birthday, and not before', () => {
  const s = run({work:[0,10000], pension:[14000,0]});
  near(s.months[83].w[1], 10000); near(s.months[84].w[1], 0);
  const base = run(); near(s.months[84].income, base.months[84].income, 1e-9);
  near(s.months[0].income - base.months[0].income, 10000/12, 1e-9, 'under the tax-free allowance, all of it is kept');
});
t('earnings under the tax-free allowance pay no tax or National Insurance', () => {
  const s = run({work:[0,12570], pension:[0,0], invest:false}); near(s.months[0].tax[1], 0); near(s.months[0].ni[1], 0); near(s.months[0].income, 12570/12, 1e-9);
});
t('earnings above the threshold pay National Insurance only on the earnings, not on the pension', () => {
  const s = run({work:[13570,0], pension:[14000,0], invest:false}); near(s.months[0].ni[0], 1000*NI_RATE, 1e-9);
});
t('earnings count towards the Marriage Allowance test (a working partner is not a non-taxpayer)', () => {
  const s = run({work:[0,13000], pension:[20000,0], sp:[0,0], marriage:true}); near(s.months[0].mSave, 0, 1e-9);
});
t('earnings: yearly rows still add up and tax and National Insurance are kept apart', () => {
  const s = run({work:[20000,6000], marriage:true});
  s.rows.forEach(r => near(r.src.p0+r.src.q0+r.src.p1+r.src.q1+r.src.w+r.src.isa, r.avg, 1e-6));
  near(s.rows[0].ni, 594.4, 1e-9); near(s.rows[8].ni, 0);
  near(s.rows[0].tax, s.months[0].tax[0] + s.months[0].tax[1], 1e-9);
});
t('lowest balance after the first month excludes the opening balance', () => {
  const s = run({spend:1}), x = summarise(s); near(x.min, s.buf0); assert(x.minMonths > s.buf0);
});
t('safety margin: spending +5%, payments a month late, prices +2.5%, never made less careful', () => {
  const st = stressedState(base());
  near(st.spend, 1680); assert.strictEqual(st.payLag, 1); near(st.inflation, 2.5);
  const harsh = stressedState(base({payLag:3, inflation:4})); assert.strictEqual(harsh.payLag, 3); near(harsh.inflation, 4);
  near(base().spend, 1600, 0, 'the original state is not changed');
});
const minOf = cash => summarise(simulate(stressedState(base({cash})), {nowIdx:NOW})).minLater;
t('safe to retire: needs the emergency fund (6 months of essentials) untouched even with the safety margin', () => {
  const m0 = minOf(25000), reserve = RESERVE_MONTHS * 1600;      // the lowest balance rises 1-for-1 with starting cash
  const at = target => readiness(base({cash: 25000 + (target - m0)}), {nowIdx:NOW});
  assert.strictEqual(at(reserve + 1).level, 'safe'); assert(at(reserve + 1).safe);
  assert.notStrictEqual(at(reserve - 1).level, 'safe'); near(at(reserve - 1).gap, 1, 1e-6);
  near(at(reserve + 1).reserve, 9600);
});
t('safe / tight / no: tight works as entered but fails the margin; no runs out as entered', () => {
  const m0 = minOf(25000), b0 = summarise(simulate(base(), {nowIdx:NOW})).minMonths;   // as entered
  const withBase = target => base({cash: 25000 + (target - b0)});                        // base lowest balance = target
  assert.strictEqual(readiness(withBase(50000), {nowIdx:NOW}).level, 'safe');
  const r = readiness(withBase(300), {nowIdx:NOW}); assert.strictEqual(r.level, 'tight');
  assert.strictEqual(readiness(withBase(-300), {nowIdx:NOW}).level, 'no');
});
t('safe to retire is always stricter than the plain traffic light', () => {
  for (const cash of [0, 5000, 15000, 25000, 40000, 80000, 200000]){
    const r = readiness(base({cash}), {nowIdx:NOW});
    if (r.level === 'safe') assert(r.base.runOut < 0, 'safe implies it works as entered');
    near(0, 0);
  }
});
t('safe to retire: a permanent shortfall after State Pension is never safe, however large the savings look', () => {
  const r = readiness(base({pension:[6000,0], sp:[5000,0], cash:150000, lump:0, emergency:0}), {nowIdx:NOW}); assert(!r.safe); assert.notStrictEqual(r.level, 'safe');
});
const notSafe = () => base({cash:15000, spend:1700});
t('how much more would make it safe: minimal for each person', () => {
  for (const person of [0,1]){
    const s = notSafe(), x = neededWork(s, person, {nowIdx:NOW});
    assert(x > 0 && x !== null, 'needs something '+person);
    const withX = v => { const w = [0,0]; w[person] = v; return readiness(Object.assign({}, s, {work:w}), {nowIdx:NOW}); };
    assert(withX(x).safe, 'works at '+x); assert(!withX(x - 10).safe, 'ten pounds less does not');
  }
});
t('how much more: 0 when already safe, nothing to add on top of existing earnings', () => {
  assert.strictEqual(neededWork(base({cash:500000}), 0, {nowIdx:NOW}), 0);
  const s = notSafe(), x = neededWork(s, 0, {nowIdx:NOW});
  const y = neededWork(Object.assign({}, s, {work:[x,0]}), 0, {nowIdx:NOW}); assert.strictEqual(y, 0);
  const half = neededWork(Object.assign({}, s, {work:[Math.floor(x/2/10)*10,0]}), 0, {nowIdx:NOW}); assert(half > 0 && half < x);
});
t('how much more: null when working cannot fix it (huge spending, or already past State Pension age)', () => {
  assert.strictEqual(neededWork(base({spend:9000}), 0, {nowIdx:NOW}), null);
  const old = base({dob:['1966-10-15','1955-01-01'], pension:[14000,0], sp:[12547.60,9000]});
  assert.strictEqual(neededWork(Object.assign(old, {cash:0, spend:3000}), 1, {nowIdx:NOW}), null);
});
t('more earnings never lower income or savings', () => {
  const a = run(), b = run({work:[5000,0]}), c = run({work:[5000,8000]});
  a.months.forEach((m,i) => { assert(b.months[i].income >= m.income - 1e-9); assert(c.months[i].income >= b.months[i].income - 1e-9); assert(c.months[i].bal >= m.bal - 1e-9); });
});
for (let k = 0; k < 120; k++){
  const s2 = randomState(); s2.work = [R() < .5 ? 0 : Math.round(pick(0,30000)), R() < .5 ? 0 : Math.round(pick(0,30000))];
  t('random earnings '+k+': tax and National Insurance are sane and the safety margin is never kinder', () => {
    const o = {nowIdx: nowFor(s2)}, sim = simulate(s2, o), st = simulate(stressedState(s2), o);
    sim.months.forEach((m, i) => { assert(m.ni[0] >= 0 && m.ni[1] >= 0); assert(m.income >= 0); assert(m.tax[0] >= 0);
      near(m.ni[0], Math.max(0, m.w[0] / (1 - (m.tax[0] > 0 ? m.tax[0]/(m.p[0]+m.q[0]+m.w[0]+m.tax[0]) : 0)) - NI_THRESHOLD) * NI_RATE, 1e-6);
      assert(st.months[i].income <= m.income + 1e-9, 'late payments and inflation never raise income');
      assert(st.months[i].bal <= m.bal + 1e-9, 'stressed balance never above the plain one'); });
    { const r = readiness(s2, o); if (r.level === 'safe') assert(r.base.runOut < 0); assert(r.gap >= 0); }
  });
}
t('safe to retire: starting below the emergency fund is fine if savings build past it within the first year', () => {
  const s = base({cash:5000, work:[40000,0], spend:1600});                 // earnings far above spending: the fund fills quickly
  const r = readiness(s, {nowIdx:NOW}); assert(r.stressed.minMonths < r.reserve, 'below the fund in the first months'); assert(r.safe, 'but safe: it is in place by the end of year one');
  const slow = readiness(base({cash:5000, work:[2000,0]}), {nowIdx:NOW}); assert(!slow.safe, 'not safe if the fund is never reached');
});
t('safe to retire: the emergency fund must stay in place after the first year', () => {
  // plenty at the start, but savings fall below the fund later (before State Pension)
  const s = base({cash:11000, lump:0, emergency:0, spend:1600}); const r = readiness(s, {nowIdx:NOW});
  assert(!r.safe); assert(r.stressed.minLater < r.reserve);
});
t('lowest balance from the end of the first year ignores the first eleven months', () => {
  const s = run({cash:0, lump:0, emergency:0, work:[0,0], pension:[30000,0], spend:1000}), x = summarise(s);
  assert(x.minLater >= x.minMonths); near(x.minLater, s.months[11].bal, 1e-9);
});
t('safe to retire: going below zero early is never safe, even if a large income arrives before the end of year one', () => {
  // No savings. Person 2's big pension only starts six months in, so the first months are overdrawn.
  const s = base({cash:0, lump:0, emergency:0, dob:['1966-10-15','1967-04-15'], pension:[0,100000], pensionDate:['2026-10-15','2027-04-15'], sp:[0,0], work:[0,0], spend:1600});
  const r = readiness(s, {nowIdx:NOW});
  assert(r.stressed.runOut >= 0, 'overdrawn in the first months'); assert(r.stressed.minLater >= r.reserve, 'but comfortably above the fund after year one');
  assert(!r.safe); assert.strictEqual(r.level, 'no');
});
t('close but not safe: the plan as entered is judged on the spending entered, not the 5% higher figure', () => {
  // Income 1,025 a month for life (12,300 a year, under the tax-free allowance), spending 1,000: a small surplus, no savings.
  // As entered it works (so "tight", not "no"). With spending 5% higher (1,050) the first month is already short.
  const s = base({cash:0, lump:0, emergency:0, invest:false, pension:[0,12300], pensionDate:['2026-10-15','2021-10-15'], sp:[0,0], work:[0,0], spend:1000});
  const r = readiness(s, {nowIdx:NOW});
  assert(r.base.runOut < 0, 'works as entered'); assert(r.base.endFlow > 0, 'income above spending'); assert(r.stressed.runOut >= 0, 'short with the margin');
  assert.strictEqual(r.level, 'tight');
});



/* ---------- retirement date ---------- */
t('retirement date: a date part-way through a year starts the plan in that month', () => {
  // Retiring 15 Apr 2027 (6 months after NOW, Oct 2026): the plan starts 6 months later than "now", and the pension begins in its first month.
  const s = run({pensionDate:['2027-04-15','2027-04-15'], pension:[14000,0], sp:[0,0], work:[0,0]});
  assert.strictEqual(s.start, monthIdx('2027-04-15'));
  assert.strictEqual(s.retire, monthIdx('2027-04-15'));
  assert(s.months[0].p[0] > 0, 'pension paid in the first month');
});
t('retirement date: dateAtAge keeps day and month, and moves 29 Feb to 28 Feb in a year with no 29 Feb', () => {
  assert.strictEqual(dateAtAge('1966-10-15', 60), '2026-10-15');
  assert.strictEqual(dateAtAge('1964-02-29', 61), '2025-02-28');
  assert.strictEqual(dateAtAge('1964-02-29', 60), '2024-02-29');
});

/* ---------- savings back at the starting amount ---------- */
// Person 1: pension 12,000 (under the allowance, no tax) = 1,000 a month; spending 1,200, so savings fall 200 a month for 84 months
// (to 10,000 - 16,800 = -6,800). State Pension then adds 12,000: gross 24,000, tax (24,000-12,570)*20% = 2,286, net 21,714 = 1,809.50 a month.
// Surplus 609.50 a month. Back to 10,000 needs 16,800/609.50 = 27.56, so 28 months: month index 84+27 = 111.
const back = over => summarise(run(Object.assign({pension:[12000,0], sp:[12000,0], pensionDate:['2026-10-15','2021-10-15'], work:[0,0], spend:1200, cash:10000, lump:0, emergency:0, invest:false}, over)));
t('savings back at the starting amount: hand calc', () => {
  const x = back(); assert.strictEqual(x.dipM, 0); assert.strictEqual(x.backM, 111);
  const s = run({pension:[12000,0], sp:[12000,0], work:[0,0], spend:1200, cash:10000, lump:0, emergency:0, invest:false});
  assert(s.months[110].bal < 10000 && s.months[111].bal >= 10000);
});
t('savings back at the starting amount: never below it', () => {
  const x = back({pension:[20000,0], cash:5000}); assert.strictEqual(x.dipM, -1); assert.strictEqual(x.backM, -1);
});
t('savings back at the starting amount: not back before the plan ends', () => {
  const x = back({sp:[3000,0]}); assert.strictEqual(x.dipM, 0); assert.strictEqual(x.backM, -1);
});
t('savings back at the starting amount: the lump sum added to savings is not part of the target', () => {
  // 15,000 at the start (10,000 entered + 5,000 lump), target 10,000: falls below it after 26 months of -200 (15,000 - 5,200 = 9,800).
  const x = back({lump:5000}); assert.strictEqual(x.dipM, 25);
  // At month 83 savings are 15,000 - 16,800 = -1,800; 11,800/609.50 = 19.36, so 20 months: month index 84+19 = 103.
  assert.strictEqual(x.backM, 103);
});

done('engine tests');
