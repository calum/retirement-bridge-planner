// Run: node tests/privacy.test.js
// The app promises that nothing is sent anywhere. These checks read the page's source and fail if anything could do that.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; } catch (e) { fail++; console.log('FAIL: ' + n + '\n    ' + e.message); } };
const none = (re, why) => t(why, () => { const m = src.match(re); assert(!m, 'found: ' + (m && m[0])); });

none(/https?:\/\//i, 'no web addresses anywhere in the page (no fonts, scripts, images or links to load)');
none(/\bfetch\s*\(/, 'no fetch()');
none(/XMLHttpRequest/, 'no XMLHttpRequest');
none(/sendBeacon/, 'no sendBeacon');
none(/WebSocket|EventSource|RTCPeerConnection|importScripts|serviceWorker|SharedWorker/, 'no sockets, streams, workers or service workers');
none(/new\s+Image\b|<img\b|<iframe|<embed|<object|<video|<audio|<form\b|<script[^>]*\ssrc=|<link[^>]*href=|@import|url\s*\((?!\s*['"]?#)/i, 'nothing that can load an outside file or submit a form (local #references inside a chart are fine)');
none(/document\.cookie|indexedDB|openDatabase|sessionStorage/, 'no cookies or other storage besides localStorage');
none(/navigator\.(sendBeacon|share|clipboard|geolocation|mediaDevices)|window\.open|location\.(href|assign)\s*=/, 'no sharing, location, camera or navigation away');
t('localStorage is used only to save, load and delete the user\'s own numbers on this device', () => {
  const uses = src.match(/localStorage\.\w+/g) || [];
  assert.deepStrictEqual(uses.sort(), ['localStorage.getItem', 'localStorage.removeItem', 'localStorage.setItem']);
  assert.strictEqual((src.match(/localStorage\.setItem/g) || []).length, 1);
});
if (/^<!doctype/i.test(src)){
  t('the standalone page tells the browser to block every outside connection', () => {
    const m = src.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/); assert(m, 'policy present');
    assert(/default-src 'none'/.test(m[1])); assert(/connect-src 'none'/.test(m[1])); assert(/form-action 'none'/.test(m[1])); assert(!/https?:/.test(m[1]));
  });
}
console.log(`privacy checks: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
