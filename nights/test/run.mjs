// Headless-Chrome test for the Nights app. Usage: node test/run.mjs [outdir]
// Serves the app folder, pins the clock, taps through the check-in, seeds histories for the
// streak/skip rules, the 04:00 day boundary, payoff stats, calendar editing and criteria locking,
// and writes screenshots to outdir.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || join(ROOT, 'test', 'out');
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const p = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
  try { res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(await readFile(join(ROOT, p))); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/index.html`;
const profile = join(OUT, 'chrome-profile');
const PORT = 9400 + Math.floor(Math.random() * 500);
for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { rmSync(join(profile, f), { force: true }); } catch {} }
const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=412,915', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const errors = [];
for (let i = 0; i < 120; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); ws = new WebSocket(l[0].webSocketDebuggerUrl); break; } catch { await sleep(250); } }
if (!ws) { chrome.kill(); throw new Error('could not connect to Chrome on port ' + PORT); }
await new Promise(r => ws.onopen = r);
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || 'exception');
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
const shot = async (name, h = 915) => { await sleep(350); const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 412, height: h, scale: 1 } }); writeFileSync(join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); };
const fullHeight = () => js('document.documentElement.scrollHeight');
let failures = 0; const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) failures++; };

await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Network.enable'); await send('Network.setBypassServiceWorker', { bypass: true });
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
const load = async () => { await send('Page.navigate', { url: URL_ }); for (let i = 0; i < 300; i++) { await sleep(100); if (await js('document.readyState') === 'complete' && await js('typeof walk') === 'function') return; } throw new Error('page did not load: ' + JSON.stringify(errors) + ' ' + await js('[location.href, document.readyState, typeof walk, document.title].join(" | ")')); };
await load();
await js(`localStorage.clear(); 1`); await load();

// Pin the clock and re-render. Dates are relative to this morning: Sun 27 Sep 2026.
const setNow = iso => js(`clock = () => new Date('${iso}'); viewMonth = null; render(); 1`);
const T = '2026-09-27';
const day = n => { const d = new Date(T + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// spec: { offset: 'y' | 'n' | [tried, slept, rested] }
const seed = async spec => js(`(() => { entries = {}; const s = ${JSON.stringify(spec)};
  for (const k in s) { const v = s[k]; const a = Array.isArray(v) ? v : [v === 'y', null, null];
    entries[k] = { tried: a[0], slept: a[1], rested: a[2], ts: 1 }; }
  save(LS_DATA, entries); viewMonth = null; render(); return Object.keys(entries).length; })()`);
const state = () => js(`JSON.stringify({ w: (() => { const w = walk(); return { streak: w.streak, best: w.best, bank: w.bank, covered: [...w.covered], lastBreak: w.lastBreak }; })(),
  hero: document.getElementById('streakNum').textContent, unit: document.getElementById('streakUnit').textContent, sub: document.getElementById('streakSub').textContent,
  heroCls: document.getElementById('streakNum').className, miss: document.getElementById('miss').hidden ? null : document.getElementById('miss').textContent,
  tiles: [...document.querySelectorAll('#tiles .tile')].map(t => t.querySelector('.label').textContent + '=' + t.querySelector('.value').textContent) })`).then(JSON.parse);
const tapCheckin = (k, v) => js(`document.querySelector('#checkin .q[data-k=${k}] button[data-v="${v}"]').click(); 1`);

// ---------- 1. fresh check-in ----------
console.log('1. fresh check-in');
await setNow(T + 'T08:00:00');
let s = await state();
check(await js(`document.getElementById('when').textContent`) === 'Night of Sat → Sun 27 Sep', 'header names last night');
check(s.hero === '0' && s.heroCls.includes('zero'), 'empty state shows 0, not in accent');
check((await js(`document.getElementById('payoff').textContent`)).includes('After a couple of weeks'), 'payoff empty-state text');
await shot('1-fresh');
await tapCheckin('tried', 1);
s = await state();
check(await js(`entries['${T}'].tried`) === true, 'tap "Tried" saves for this morning');
check(s.hero === '1' && s.unit === 'night in a row', 'streak 1, singular unit');
await tapCheckin('slept', 1); await tapCheckin('rested', 0);
check(await js(`JSON.stringify([entries['${T}'].slept, entries['${T}'].rested])`) === '[true,false]', 'slept/rested saved');
check(await js(`document.getElementById('saved').textContent`).then(t => t.startsWith('Saved.')), 'all-three saved message');
check(await js(`localStorage.getItem('nights.entries')`).then(t => JSON.parse(t)[T].tried === true), 'persisted to localStorage');
await tapCheckin('tried', 1);
check(await js(`entries['${T}'].tried`) === null && (await state()).hero === '0', 'tapping the chosen answer again clears it');
await tapCheckin('tried', 1);
await shot('2-checked-in');

// ---------- 2. day boundary ----------
console.log('2. 04:00 day boundary');
await setNow('2026-09-28T02:30:00');
check(await js('todayKey()') === T, '02:30 Monday still counts as Sunday morning');
await setNow('2026-09-28T04:30:00');
check(await js('todayKey()') === day(1), '04:30 Monday is Monday morning');
s = await state();
check(s.hero === '1' && s.sub === 'Log last night to extend it', 'unanswered today: streak carried from yesterday, with prompt');
await setNow(T + 'T08:00:00');

// ---------- 3. streak and skip rules ----------
console.log('3. streak & skips');
// 10 tried mornings ending yesterday, today unanswered
let spec = {}; for (let i = -10; i <= -1; i++) spec[day(i)] = 'y';
await seed(spec); s = await state();
check(s.w.streak === 10 && s.hero === '10', `10 tried, today pending -> 10 (got ${s.hero})`);
// one "didn't" inside a run is covered by a skip; streak counts tried nights only
spec = {}; for (let i = -12; i <= 0; i++) spec[day(i)] = 'y'; spec[day(-5)] = 'n';
await seed(spec); s = await state();
check(s.w.covered.length === 1 && s.w.covered[0] === day(-5), 'single miss covered by a skip');
check(s.w.streak === 12, `streak holds and counts only tried nights (12, got ${s.w.streak})`);
check(await js(`document.querySelector('#cal [data-k="${day(-5)}"]').classList.contains('s')`), 'calendar marks the skip night');
// an unlogged morning counts as a miss (and gets covered)
spec = {}; for (let i = -6; i <= 0; i++) if (i !== -3) spec[day(i)] = 'y';
await seed(spec); s = await state();
check(s.w.covered.includes(day(-3)) && s.w.streak === 6, 'unlogged gap is a miss, covered by a skip');
// two misses in a row reset even with skips banked
spec = {}; for (let i = -10; i <= -3; i++) spec[day(i)] = 'y'; spec[day(-2)] = 'n'; spec[day(-1)] = 'n';
await seed(spec); s = await state();
check(s.w.streak === 0 && s.w.best === 8 && s.w.lastBreak === day(-1), 'two misses in a row reset (best 8 kept)');
check(s.heroCls.includes('rate') && s.hero === '8' && s.unit === 'of the last 10 nights tried', `after a reset the hero shows the rate (${s.hero} ${s.unit})`);
check(s.tiles[2].startsWith('Last 7'), 'rate mode swaps the third tile to Last 7');
await shot('3-rate-mode');
// skips run out: bank starts at 1, +1 each Monday, max 2
spec = {}; for (let i = -27; i <= 0; i++) spec[day(i)] = 'y'; // Mon 31 Aug .. Sun 27 Sep
spec[day(-26)] = 'n'; spec[day(-24)] = 'n';                 // Tue 1, Thu 3 Sep: same week, only one skip available
await seed(spec); s = await state();
check(s.w.covered.length === 1 && s.w.lastBreak === day(-24), 'second miss in the same week (no skip left) resets');
check(s.w.bank === 2, `bank refills on Monday and caps at 2 (got ${s.w.bank})`);
// a miss with streak 0 does not burn a skip
spec = { [day(-3)]: 'n', [day(-2)]: 'y', [day(-1)]: 'y' };
await seed(spec); s = await state();
check(s.w.covered.length === 0 && s.w.bank === 1 && s.w.streak === 2, 'miss before any streak does not use a skip');

// ---------- 4. miss panel ----------
console.log('4. miss panel');
spec = {}; for (let i = -6; i <= -1; i++) spec[day(i)] = 'y'; spec[T] = 'n';
await seed(spec); s = await state();
check(s.miss && s.miss.startsWith('A skip covered last night') && s.miss.includes('holds at 6'), 'covered miss message');
check(s.miss.includes('Tip: write a note'), 'note tip when no note set');
await js(`settings.note = 'You felt awful in August. The chores stopped first.'; save(LS_SET, settings); render(); 1`);
check((await state()).miss.includes('You felt awful in August'), 'note to future self shown after a miss');
await shot('4-miss-covered', 700);
spec[day(-1)] = 'n'; await seed(spec); s = await state();
check(s.miss.startsWith('Two in a row'), 'two-in-a-row message');
spec = { [T]: 'n' }; await seed(spec); s = await state();
check(s.miss.startsWith('Tonight starts a new streak'), 'first-ever miss is not called "two in a row"');
await js(`settings.note = ''; save(LS_SET, settings); render(); 1`);

// ---------- 5. payoff ----------
console.log('5. payoff');
spec = {};
// tried: 8 nights, slept well 6/8, rested 4/8; didn't: 4 nights, slept well 1/4, rested 1/4
const Y = [[1,1],[1,1],[1,1],[1,1],[1,0],[1,0],[0,0],[0,0]], N = [[1,1],[0,0],[0,0],[0,0]];
Y.forEach((a, i) => spec[day(-1 - i)] = [true, !!a[0], !!a[1]]);
N.forEach((a, i) => spec[day(-20 - i)] = [false, !!a[0], !!a[1]]);
await seed(spec);
const pay = await js(`[...document.querySelectorAll('#payoff .bar .v')].map(v => v.textContent)`);
check(JSON.stringify(pay) === JSON.stringify(['75% of 8', '25% of 4', '50% of 8', '25% of 4']), `payoff rates ${JSON.stringify(pay)}`);
check((await js(`document.querySelector('#payoff .note').textContent`)).startsWith('Few nights'), 'small-n caveat shown');

// ---------- 6. realistic history for screenshots ----------
console.log('6. realistic history');
spec = {}; let r = 7;
for (let i = -75; i <= -1; i++) {
  r = (r * 1103515245 + 12345) % 2147483648; const u = r / 2147483648;
  if (u < 0.05) continue;                                     // a few unlogged mornings
  const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  const tried = i > -22 ? (i === -9 ? false : true) : u < 0.62;
  const slept = rnd() < (tried ? 0.72 : 0.4), rested = rnd() < (tried ? 0.6 : 0.3);
  spec[day(i)] = [tried, slept, rested];
}
await seed(spec);
s = await state();
console.log('     streak', s.w.streak, 'best', s.w.best, 'bank', s.w.bank, 'covered', s.w.covered.join(' '));
check(s.w.streak >= 15, 'recent good run gives a double-digit streak');
check(await js(`document.querySelectorAll('#weekly svg path.col').length`) >= 8, 'weekly columns drawn');
check(await js(`document.querySelectorAll('#weekly svg path.col').length`) <= 26, 'weekly columns capped at 26');
await shot('5-home-top');
const H = await fullHeight(); await shot('6-home-full', H);
await tapCheckin('tried', 1); await tapCheckin('slept', 1); await tapCheckin('rested', 0);
check(await js(`document.getElementById('checkin').classList.contains('done')`), 'check-in collapses once all three are answered');
await shot('5b-home-done');
await js(`delete entries['${T}']; save(LS_DATA, entries); render(); 1`);
// weekly tooltip
await js(`(() => { const sv = document.querySelector('#weekly svg'); const r = sv.getBoundingClientRect();
  sv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.right - 12, clientY: r.top + 60 })); return 1; })()`);
check((await js(`document.querySelector('#weekly .tip').textContent`)).includes('week of'), 'tap on weekly chart shows a tooltip');
// metric switch
await js(`document.querySelector('#metricSeg [data-m=rested]').click(); 1`);
check(await js(`document.querySelector('#weekly .title').textContent`) === 'Mornings rested per week', 'metric switch re-scopes calendar + weekly chart');
check(await js(`document.querySelectorAll('#cal .cell.s').length`) === 0, 'skip marks only on the "tried" view');
await js(`document.querySelector('#metricSeg [data-m=tried]').click(); 1`);

// ---------- 7. calendar editing & month nav ----------
console.log('7. calendar edit');
await js(`document.querySelector('#cal [data-k="${day(-9)}"]').click(); 1`);
check(await js(`getComputedStyle(document.getElementById('sheet')).display`) === 'block', 'tapping a day opens the edit sheet');
check(await js(`document.getElementById('sheetTitle').textContent`) === 'Night of Thu → Fri 18 Sep', 'sheet names the night');
await shot('7-sheet');
await js(`document.querySelector('#sheet .q[data-k=tried] button[data-v="1"]').click(); 1`);
check(await js(`entries['${day(-9)}'].tried`) === true, 'sheet edit saved');
check(await js(`walk().covered.has('${day(-9)}')`) === false, 'fixing a night removes its skip');
await js(`document.getElementById('sheetClose').click(); 1`);
check(await js(`document.querySelector('#cal [data-k="${day(1)}"]').disabled`), 'future days are not editable');
check(await js(`document.getElementById('nextM').disabled`), 'cannot page into future months');
await js(`document.getElementById('prevM').click(); 1`);
check(await js(`document.getElementById('monthTitle').textContent`) === 'August 2026', 'previous month');
await js(`document.getElementById('prevM').click(); 1`);
check(await js(`document.getElementById('prevM').disabled`), 'cannot page before the first entry');
await js(`viewMonth = null; renderCal(); 1`);

// ---------- 8. criteria lock ----------
console.log('8. criteria lock');
await js(`document.getElementById('critIn').value = 'Lights out by 23:30, phone on the charger across the room'; document.getElementById('critBtn').click(); 1`);
check(await js(`document.getElementById('critIn').readOnly`) && await js(`document.getElementById('critLine').textContent`) === 'Lights out by 23:30, phone on the charger across the room', 'saved criteria is locked and shown under the question');
check(await js(`document.getElementById('critSince').textContent`) === 'Since Sun 27 Sep', 'criteria dated');
await setNow('2026-10-04T08:00:00');
await js(`document.getElementById('critBtn').click(); document.getElementById('critIn').value = 'Lights out by 00:00'; document.getElementById('critBtn').click(); 1`);
check(await js(`settings.criteriaHistory.length`) === 1 && (await js(`document.getElementById('critHist').textContent`)).includes('Until Sun 4 Oct: “Lights out by 23:30'), 'changing criteria keeps the old one, dated');
await setNow(T + 'T08:00:00');

// ---------- 9. export ----------
console.log('9. export');
const csv = await js('csv()');
const lines = csv.trim().split('\n');
check(lines[0] === 'morning,tried,slept_well,rested,logged_at', 'CSV header');
check(lines.length === await js('Object.keys(entries).length') + 1, 'one CSV row per logged morning');
check(/^2026-\d\d-\d\d,[01],[01],[01],/.test(lines[1]), 'CSV row format');

check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
ws.close(); chrome.kill(); server.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed'); console.log('screenshots in ' + OUT);
process.exit(failures ? 1 : 0);
