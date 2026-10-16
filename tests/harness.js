// Loads the calculation engine and the number formatters straight out of index.html,
// so the tests exercise exactly the code the page runs.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const slice = (a, b) => src.split(a)[1].split(b)[0];
const engine = new Function(slice('/*ENGINE_START*/','/*ENGINE_END*/') +
  ';return {simulate,summarise,assess,readiness,neededWork,maxSafeSpend,MAX_SPEND,stressedState,lumpModel,spaMonths,monthIdx,defaultState,minusYears,dateAtAge,PA_BASE,TAX_RATE,HR_THRESHOLD,NI_RATE,NI_THRESHOLD,RESERVE_MONTHS,SPEND_MARGIN,PA_FREEZE_END,END_AGE}')();
const fmt = new Function(slice('/*FORMAT_START*/','/*FORMAT_END*/') + ';return {money,axisMoney,ageText}')();
let pass = 0, fail = 0;
function t(name, fn){ try { fn(); pass++; } catch (e) { fail++; console.log('FAIL: ' + name + '\n    ' + String(e.message).split('\n').join('\n    ')); } }
function near(a, b, eps, msg){ assert(Math.abs(a - b) <= (eps == null ? 1e-6 : eps), (msg ? msg + ': ' : '') + 'expected ' + b + ', got ' + a); }
function done(label){ console.log(`${label}: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
// small seeded random numbers so any failure can be reproduced
function rng(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
module.exports = {...engine, ...fmt, assert, t, near, done, rng};
