// Run: node tests/mutation.js
// Breaks the calculation code on purpose, one change at a time, and checks that the test suite notices each one.
// A change that the tests do NOT notice ("survived") means a gap in the tests. Every one must be caught.
// If a code change makes a search string below disappear ("missing"), update the string to match the new code.
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const MUTATIONS = [
  ["tax rate 20%->25%", "const TAX_RATE = 0.20;", "const TAX_RATE = 0.25;"],
  ["personal allowance 12570->12500", "const PA_BASE = 12570;", "const PA_BASE = 12500;"],
  ["SPA 67 -> 66 for 1961-77", "if (v <= 19770405) return 67*12;", "if (v <= 19770405) return 66*12;"],
  ["SPA boundary off by a day", "if (v <= 19600405) return 66*12;", "if (v <= 19600406) return 66*12;"],
  ["marriage transfer 10%->12%", "const T = Math.ceil(PA*0.1/10)*10;", "const T = Math.ceil(PA*0.12/10)*10;"],
  ["marriage not capped by tax", "alt[r] = Math.max(0, tax[r] - T*TAX_RATE);", "alt[r] = tax[r] - T*TAX_RATE;"],
  ["marriage ignores donor tax", "alt[d] = Math.max(0, gross[d] - (PA - T)) * TAX_RATE;", "alt[d] = 0;"],
  ["marriage allows higher rate", "gross[r] <= HR_THRESHOLD", "true"],
  ["marriage always claimed", "if (save > 0){ tax = alt; mSave = save; }", "{ tax = alt; mSave = save; }"],
  ["ISA base double counts emergency", "const isaBase = o.legacyIsa ? isaAmt + s.emergency : isaAmt;", "const isaBase = isaAmt + s.emergency;"],
  ["lump kept as cash forgets emergency", "const buf0 = s.cash + (s.invest ? Math.min(s.emergency, s.lump) : s.lump);", "const buf0 = s.cash + (s.invest ? 0 : s.lump);"],
  ["split: savings get all of it", "const buf0 = s.cash + (s.invest ? Math.min(s.emergency, s.lump) : s.lump);", "const buf0 = s.cash + s.lump;"],
  ["income forgets ISA", "+w[0]+w[1]-ni[0]-ni[1]+isa)/12;", "+w[0]+w[1]-ni[0]-ni[1])/12;"],
  ["interest not monthly-compounded", "const rc = Math.pow(1 + s.cashReal/100, 1/12) - 1;", "const rc = s.cashReal/100/12;"],
  ["interest on overdraft", "if (bal > 0) bal *= (1 + rc);", "bal *= (1 + rc);"],
  ["retirement date ignored (plan starts a year late)", "const retire = monthIdx(s.pensionDate[0]);", "const retire = monthIdx(s.pensionDate[0]) + 12;"],
  ["P2 pension date off by a month", "const penStart = [retire, monthIdx(s.pensionDate[1])];", "const penStart = [retire, monthIdx(s.pensionDate[1]) + 1];"],
  ["29 Feb kept in a year with no 29 Feb", "(m==='02' && d==='29' && !leap) ? '28' : d", "d"],
  ["P2 pension start ignored", "p[i] = idx >= penStart[i] + lag ? pen[i] : 0;", "p[i] = pen[i];"],
  ["State Pension a month early", "const spaIdx = s.dob.map((d,i) => dobIdx[i] + spaMonths(d));", "const spaIdx = s.dob.map((d,i) => dobIdx[i] + spaMonths(d) - 1);"],
  ["plan ends at 71", "const END_AGE = 70;", "const END_AGE = 71;"],
  ["PA never eroded", "const PA = PA_BASE / Math.pow(1 + s.inflation/100, t);", "const PA = PA_BASE;"],
  ["annuity withdraw at start", "p = p*(1+r);\n    const w = Math.min(p, withdrawal); p -= w;", "const w = Math.min(p, withdrawal); p -= w; p = p*(1+r);"],
  ["lump pot can go negative", "const w = Math.min(p, withdrawal); p -= w; t += w;", "const w = withdrawal; p -= w; t += w;"],
  ["spending ignored in the balance", "bal += income - s.spend;", "bal += income;"],
  ["spending 1% too high in the balance", "bal += income - s.spend;", "bal += income - s.spend*1.01;"],
  ["money rounds toward zero", "const r = d ? Math.round(n*100)/100 : Math.round(n);", "const r = d ? Math.trunc(n*100)/100 : Math.trunc(n);"],
  ["tax shared wrongly (all on pension)", "p[i] *= k; q[i] *= k; w[i] *= k;", "p[i] *= k; q[i] *= 1; w[i] *= k;"],
  ["horizon ignores later State Pension", "Math.max(spaIdx[0], spaIdx[1]) + COVER_AFTER_SPA - start", "0"],
  ["horizon only 12 months past SPA", "const COVER_AFTER_SPA = 36;", "const COVER_AFTER_SPA = 12;"],
  ["payment lag ignored for State Pension", "q[i] = idx >= spaIdx[i] + lag ? s.sp[i] : 0;", "q[i] = idx >= spaIdx[i] ? s.sp[i] : 0;"],
  ["payment lag ignored for pension", "p[i] = idx >= penStart[i] + lag ? pen[i] : 0;", "p[i] = idx >= penStart[i] ? pen[i] : 0;"],
  ["ISA income never stops", "isa = isaModel.taken[yr+1] - isaModel.taken[yr];", "isa = s.invest ? isaYear : 0;"],
  ["ISA income a year early", "isa = isaModel.taken[yr+1] - isaModel.taken[yr];", "isa = isaModel.taken[Math.min(yr+2, isaModel.taken.length-1)] - isaModel.taken[Math.min(yr+1, isaModel.taken.length-1)];"],
  ["drawdown switch ignored", "const isaYear = (s.invest && s.drawdown) ? isaBase * s.swr/100 : 0;", "const isaYear = s.invest ? isaBase * s.swr/100 : 0;"],
  ["investment value reported a year late", "isaEnd:isaModel.pot[a/12+1]", "isaEnd:isaModel.pot[a/12]"],
  ["investment start value wrong", "isaStart:isaModel.pot[a/12],", "isaStart:isaModel.pot[a/12+1],"],
  ["investment growth ignored", "lumpModel(isaAmt, isaYear, s.growth/100, Y, null)", "lumpModel(isaAmt, isaYear, 0, Y, null)"],
  ["investment never exists", "const isaModel = s.invest ? lumpModel(", "const isaModel = false ? lumpModel("],
  ["assess: tight threshold 2 months", "else if (s.min < budget*3){ cls = 'warn'; code = 'tight'; }", "else if (s.min < budget*2){ cls = 'warn'; code = 'tight'; }"],
  ["assess: long-run bad cutoff 50", "if (lastsToAge < 85){ cls = 'bad'", "if (lastsToAge < 50){ cls = 'bad'"],
  ["assess: long-run ignored", "if (endFlow < -0.5){ lastsToM = sim.N + s.end/(-endFlow); }", "if (false){ lastsToM = 0; }"],
  ["assess: running out not bad", "if (s.runOut >= 0){ cls = 'bad'; code = 'runs-out'; }", "if (s.runOut >= 0){ cls = 'warn'; code = 'runs-out'; }"],
  ["National Insurance rate", "const NI_RATE = 0.08;", "const NI_RATE = 0.12;"],
  ["National Insurance threshold", "const NI_THRESHOLD = 12570;", "const NI_THRESHOLD = 9000;"],
  ["earnings carry on after State Pension", "(idx < spaIdx[i] ? ((s.work || [0,0])[i] || 0) : 0)", "((s.work || [0,0])[i] || 0)"],
  ["earnings not taxed", "const gross = [p[0]+q[0]+w[0], p[1]+q[1]+w[1]];", "const gross = [p[0]+q[0], p[1]+q[1]];"],
  ["back-at-start: target includes the lump sum", "r.bal < sim.cash) dipM = m;", "r.bal < sim.buf0) dipM = m;"],
  ["back-at-start: target includes the lump sum (recovery)", "r.bal >= sim.cash) backM = m;", "r.bal >= sim.buf0) backM = m;"],
  ["back-at-start: recovery ignores the dip", "if (dipM < 0){ if (r.bal < sim.cash) dipM = m; } else if", "if (dipM < 0){ if (r.bal < sim.cash) dipM = m; } if"],
  ["emergency fund 3 months", "const RESERVE_MONTHS = 6;", "const RESERVE_MONTHS = 3;"],
  ["emergency fund not tied to spending", "reserve = RESERVE_MONTHS * s.spend;", "reserve = RESERVE_MONTHS * 1500;"],
  ["no spending margin", "const SPEND_MARGIN = 0.05;", "const SPEND_MARGIN = 0;"],
  ["no payment delay in margin", "const STRESS_LAG = 1;", "const STRESS_LAG = 0;"],
  ["no inflation in margin", "inflation:Math.max(s.inflation, STRESS_INFLATION)", "inflation:s.inflation"],
  ["margin not applied to spending", "spend:s.spend*(1+SPEND_MARGIN)});", "spend:s.spend});"],
  ["safe ignores long-run shortfall", "stressed.runOut < 0 && stressed.code !== 'long-run' && stressed.minLater >= reserve;", "stressed.runOut < 0 && stressed.minLater >= reserve;"],
  ["safe ignores run-out", "stressed.runOut < 0 && stressed.code !== 'long-run' && stressed.minLater >= reserve;", "stressed.code !== 'long-run' && stressed.minLater >= reserve;"],
  ["safe measured from month one", "stressed.minLater >= reserve;", "stressed.minMonths >= reserve;"],
  ["year-one window starts at once", "if (m >= 11 && r.bal < minLater)", "if (m >= 0 && r.bal < minLater)"],
  ["tight level wrong", "const level = safe ? 'safe' : (base.runOut < 0 && base.cls !== 'bad' ? 'tight' : 'no');", "const level = safe ? 'safe' : 'tight';"],
  ["base plan judged on stressed spending", "const base = assess(simulate(s, o), s.spend);", "const base = assess(simulate(s, o), st.spend);"],
  ["stressed plan judged on plain spending", "const stressed = assess(simulate(st, o), st.spend);", "const stressed = assess(simulate(st, o), s.spend);"],
  ["needed work never zero", "if (ok(0)) return 0;", "if (false) return 0;"],
  ["needed work never null", "if (!ok(hi)) return null;", "if (false) return null;"],
  ["needed work ignores existing earnings", "w[person] = base[person] + x;", "w[person] = x;"],
  ["safe maximum search backwards", "if (safe(mid)) lo = mid; else hi = mid; }\n  return Math.floor(lo/10)*10;", "if (safe(mid)) hi = mid; else lo = mid; }\n  return Math.floor(lo/10)*10;"],
  ["safe maximum rounds up", "return Math.floor(lo/10)*10;", "return Math.ceil(lo/10)*10;"],
  ["safe maximum has no ceiling", "if (safe(MAX_SPEND)) return MAX_SPEND;", "if (false) return MAX_SPEND;"],
  ["safe maximum ignores the safe test (uses plain)", "const safe = x => readiness(Object.assign({}, s, {spend:x}), o).safe;", "const safe = x => readiness(Object.assign({}, s, {spend:x}), o).level !== 'no';"]
];
let caught = 0; const survived = [], missing = [];
for (const [name, from, to] of MUTATIONS){
  if (!src.includes(from)){ missing.push(name); console.log('MISSING   ' + name); continue; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-')); fs.mkdirSync(path.join(dir, 'tests'));
  fs.writeFileSync(path.join(dir, 'index.html'), src.replace(from, () => to));
  for (const f of ['harness.js', 'engine.test.js']) fs.copyFileSync(path.join(__dirname, f), path.join(dir, 'tests', f));
  const r = spawnSync(process.execPath, [path.join(dir, 'tests', 'engine.test.js')], { encoding: 'utf8' });
  if (r.status !== 0){ caught++; console.log('caught    ' + name); } else { survived.push(name); console.log('SURVIVED  ' + name); }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`${caught} of ${MUTATIONS.length} deliberate bugs caught. Survived: ${survived.length}. Missing: ${missing.length}.`);
process.exit(survived.length || missing.length ? 1 : 0);
