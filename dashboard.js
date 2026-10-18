const $ = id => document.getElementById(id);
const live = [false, false];
let toastTimer, filter = 'all', lastTop = null, unread = 0, firstLoad = true, serverUp = true;
let lastEventsKey = '', lastPortsKey = '', latest = null;

/* ---------- helpers ---------- */
function toast(m) { const e = $('toast'); e.textContent = m; e.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => e.classList.remove('show'), 2800); }
async function post(path, data) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.error || 'Request failed');
  return d;
}
function store(k, v) { try { v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) {} }
function load(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
function pill(id, status) {
  const e = $(id);
  e.textContent = { online: 'CONNECTED', connecting: 'CONNECTING', error: 'ERROR' }[status] || 'OFFLINE';
  e.className = 'state ' + (['online', 'error', 'connecting'].includes(status) ? status : '');
}

/* ---------- theme, greeting, views ---------- */
function setTheme(t) { document.documentElement.dataset.theme = t; $('themeUse').setAttribute('href', t === 'dark' ? '#i-sun' : '#i-moon'); store('sdpc.theme2', t); }
setTheme(load('sdpc.theme2', 'light'));
$('themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
{ const h = new Date().getHours(); $('greet').textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
function view(v) {
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('on', e.id === 'v-' + v));
  document.querySelectorAll('.tab').forEach(e => e.classList.toggle('on', e.dataset.v === v));
  document.title = { live: 'Live', hardware: 'Hardware', events: 'Events' }[v] + ' · SmartDoor';
}
document.querySelectorAll('.tab').forEach(t => t.onclick = () => view(t.dataset.v));

/* ---------- clock ---------- */
function tickClock() { const d = new Date(); $('clockTime').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); $('clockDate').textContent = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }); }
tickClock(); setInterval(tickClock, 15000);

/* ---------- cameras ---------- */
const since = [0, 0];
function fmt(sec) { return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
setInterval(() => { for (const n of [1, 2]) if (live[n - 1]) $(`badgeT${n}`).textContent = 'LIVE ' + fmt(Math.floor((Date.now() - since[n - 1]) / 1000)); }, 1000);
function stageUi(n, on) { $(`badge${n}`).hidden = !on; $(`sbtn${n}`).hidden = !on; if (on) { since[n - 1] = Date.now(); $(`badgeT${n}`).textContent = 'LIVE 00:00'; $(`open${n}`).href = cam(n).url.value.trim(); } }
document.querySelectorAll('[data-full]').forEach(b => b.onclick = () => { const st = $(`screen${b.dataset.full}`); if (st.requestFullscreen) st.requestFullscreen().catch(() => toast('Fullscreen not available')); });
function counts() { $('camCount').textContent = `${live.filter(Boolean).length} / 2`; $('tCamsS').textContent = live.every(Boolean) ? 'Disconnect both' : 'Connect both'; $('tCams').classList.toggle('act', live.some(Boolean)); }
const cam = n => ({ screen: $(`screen${n}`), img: $(`screen${n}`).querySelector('img'), ph: $(`screen${n}`).querySelector('.placeholder'), btn: $(`camBtn${n}`), url: $(`url${n}`) });
const timers = [null, null];
function camStop(n, status = 'offline') {
  const c = cam(n); clearTimeout(timers[n - 1]);
  c.img.onload = c.img.onerror = null;
  c.img.removeAttribute('src');          // removeAttribute does not fire a spurious "error" like img.src='' does
  c.img.hidden = true; c.ph.hidden = false; live[n - 1] = false;
  c.btn.disabled = false; c.btn.textContent = 'Connect'; stageUi(n, false); pill(`camStatus${n}`, status); counts();
}
function camStart(n) {
  const c = cam(n), url = c.url.value.trim();
  if (!/^https?:\/\//i.test(url)) return toast(`Camera ${n}: enter a full URL starting with http://`);
  store(`sdpc.url${n}`, url);
  camStop(n); c.btn.disabled = true; c.btn.textContent = 'Opening…'; pill(`camStatus${n}`, 'connecting');
  const fail = () => { camStop(n, 'error'); toast(`Camera ${n} stream did not load. Check that it is online and the URL is correct.`); };
  c.img.onload = () => { clearTimeout(timers[n - 1]); c.img.hidden = false; c.ph.hidden = true; live[n - 1] = true; c.btn.disabled = false; c.btn.textContent = 'Disconnect'; stageUi(n, true); pill(`camStatus${n}`, 'online'); counts(); };
  c.img.onerror = fail;
  timers[n - 1] = setTimeout(fail, 10000);
  c.img.src = url;
}
for (const n of [1, 2]) { cam(n).url.value = load(`sdpc.url${n}`, cam(n).url.value); cam(n).btn.onclick = () => live[n - 1] ? camStop(n) : camStart(n); }
function allCams() { if (live.every(Boolean)) { camStop(1); camStop(2); } else { for (const n of [1, 2]) if (!live[n - 1]) camStart(n); } }

/* ---------- server state ---------- */
function tagOf(m) { const t = m.split(':')[0]; return ['PIR', 'SERVO'].includes(t) ? t : 'SYS'; }
function renderEvents(events) {
  const shown = events.filter(e => filter === 'all' || tagOf(e.message) === filter);
  const key = filter + '|' + shown.map(e => e.time + e.message).join('\n');
  if (key === lastEventsKey) return; lastEventsKey = key;
  $('evCount').textContent = `${events.length} event${events.length === 1 ? '' : 's'}`;
  const box = $('events');
  box.replaceChildren(...(shown.length ? shown.map(e => {
    const d = document.createElement('div'), t = document.createElement('time'), g = document.createElement('span'), m = document.createElement('span');
    const tag = tagOf(e.message); d.className = 'ev' + (/MOTION DETECTED/i.test(e.message) ? ' motion' : '');
    t.textContent = e.time; g.className = 'tag ' + tag; g.textContent = tag; m.textContent = tag === 'SYS' ? e.message : e.message.slice(e.message.indexOf(':') + 1).trim();
    d.append(t, g, m); return d;
  }) : [Object.assign(document.createElement('div'), { className: 'emptyrow', textContent: 'No events yet…' })]));
}
function trackMotion(events) {
  const top = events.length ? events[0].time + events[0].message : null;
  if (!firstLoad && top !== lastTop) {
    for (const e of events) { if (e.time + e.message === lastTop) break; if (/MOTION DETECTED/i.test(e.message)) { unread++; toast('🚶 Motion detected'); } }
    $('bellBadge').textContent = unread; $('bellBadge').hidden = !unread;
  }
  lastTop = top; firstLoad = false;
}
function renderPorts(s) {
  const key = JSON.stringify(s.ports); if (key === lastPortsKey) return; lastPortsKey = key;
  for (const [id, fallback] of [['pirPort', 'COM10'], ['servoPort', 'COM11']]) {
    const sel = $(id); if (document.activeElement === sel) continue;     // never rebuild a dropdown the user has open
    const value = sel.value || fallback, ports = [...new Set([value, ...s.ports])];
    sel.replaceChildren(...ports.map(p => { const o = document.createElement('option'); o.value = o.textContent = p; return o; })); sel.value = value;
  }
}
async function refresh() {
  let s;
  try { s = await (await fetch('/api/state', { cache: 'no-store' })).json(); serverUp = true; }
  catch (e) { serverUp = false; $('srvDot').className = 'dot off'; $('srvText').textContent = 'Server offline'; throw e; }
  latest = s; $('srvDot').className = 'dot on'; $('srvText').textContent = 'Local server';
  for (const [key, prefix] of [['PIR', 'pir'], ['SERVO', 'servo']]) {
    const d = s[key], b = $(`${prefix}Btn`); pill(`${prefix}Status`, d.status);
    b.textContent = { online: 'Disconnect', connecting: 'Connecting…' }[d.status] || 'Connect'; b.dataset.status = d.status; b.disabled = d.status === 'connecting';
  }
  const m = s.motion === 'Waiting for Arduino #1' ? 'Waiting' : s.motion;
  $('motion').textContent = m; $('motion2').textContent = m; $('tMotionS').textContent = m;
  $('motDot').className = 'dot ' + (m === 'Motion detected' ? 'warn' : m === 'No motion' ? 'on' : '');
  $('tMotion').classList.toggle('act', m === 'Motion detected'); $('readout').classList.toggle('alert', m === 'Motion detected');
  $('connected').textContent = `${['PIR', 'SERVO'].filter(k => s[k].status === 'online').length} / 2`;
  renderPorts(s);
  const online = s.SERVO.status === 'online';
  for (const id of ['lockBtn', 'unlockBtn', 'tLock', 'tUnlock']) { $(id).disabled = !online; }
  const lm = s.events.find(e => /MOTION DETECTED/i.test(e.message)); $('lastMotion').textContent = lm ? 'Last motion at ' + lm.time : 'No motion seen yet';
  trackMotion(s.events); renderEvents(s.events);
}
for (const [key, prefix] of [['PIR', 'pir'], ['SERVO', 'servo']]) $(`${prefix}Btn`).onclick = async () => {
  const connected = $(`${prefix}Btn`).dataset.status === 'online';
  try { await post(connected ? '/api/disconnect' : '/api/connect', { key, port: $(`${prefix}Port`).value }); await refresh(); } catch (e) { toast(e.message); }
};
async function refreshPorts() { lastPortsKey = ''; try { await refresh(); toast('COM port list refreshed'); } catch (e) { toast('Server is not responding'); } }
$('refresh').onclick = refreshPorts; $('tPorts').onclick = refreshPorts;
document.querySelectorAll('.chip').forEach(c => c.onclick = () => { filter = c.dataset.f; document.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); lastEventsKey = ''; if (latest) renderEvents(latest.events); });

/* ---------- export event log ---------- */
$('dlLog').onclick = () => {
  if (!latest || !latest.events.length) return toast('No events to export yet');
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const rows = ['time,source,message', ...latest.events.slice().reverse().map(e => [e.time, tagOf(e.message), tagOf(e.message) === 'SYS' ? e.message : e.message.slice(e.message.indexOf(':') + 1).trim()].map(q).join(','))];
  const a = document.createElement('a'), d = new Date(), p = n => String(n).padStart(2, '0');
  a.href = URL.createObjectURL(new Blob([rows.join('\r\n')], { type: 'text/csv' }));
  a.download = `smartdoor-events-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('Event log downloaded');
};

/* ---------- servo (with confirmation) ---------- */
function confirmMove() { return new Promise(res => { $('modal').hidden = false; $('mYes').onclick = () => { $('modal').hidden = true; res(true); }; $('mNo').onclick = () => { $('modal').hidden = true; res(false); }; }); }
async function servo(command) {
  if (!(await confirmMove())) return;
  try { await post('/api/command', { key: 'SERVO', command }); toast(command === 'LOCK' ? 'Servo → 0° (LOCK)' : 'Servo → 90° (bench test)'); } catch (e) { toast(e.message); }
}
$('lockBtn').onclick = $('tLock').onclick = () => servo('LOCK');
$('unlockBtn').onclick = $('tUnlock').onclick = () => servo('UNLOCK');
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden) $('mNo').click(); });

/* ---------- misc actions ---------- */
function full() { const g = $('camGrid'); view('live'); if (g.requestFullscreen) g.requestFullscreen().catch(() => toast('Fullscreen not available')); else toast('Fullscreen not available'); }
$('tCams').onclick = allCams; $('tFull').onclick = full; $('fsBtn').onclick = full; $('tMotion').onclick = () => view('hardware');
$('bellBtn').onclick = () => { toast(unread ? `${unread} motion alert${unread > 1 ? 's' : ''} since you last looked` : 'No new motion alerts'); unread = 0; $('bellBadge').hidden = true; };

/* ---------- tips ---------- */
const TIPS = [['Serial port busy?', 'Close the Arduino IDE Serial Monitor for COM10 and COM11 before connecting.'], ['Camera will not load', 'The PC and the ESP32-CAM must be on the same network. Open the stream URL in a new tab to test it.'], ['One viewer at a time', 'An ESP32-CAM stream serves one viewer at once. Close other tabs showing the same camera.'], ['Jump anywhere', 'Press Ctrl K, type "events" or "lock", then press Enter.'], ['PIR is jumpy at first', 'The HC-SR501 needs about 30 seconds after power-up to settle. Early readings are ignored.']];
let ti = 0; function tip() { $('tipT').textContent = TIPS[ti % TIPS.length][0]; $('tipB').textContent = TIPS[ti % TIPS.length][1]; } $('tipBtn').onclick = () => { ti++; tip(); }; tip();

/* ---------- command palette ---------- */
const CMDS = [['connect cameras', 'Open both streams', allCams], ['connect camera 1', 'Entry camera', () => camStart(1)], ['connect camera 2', 'Secondary camera', () => camStart(2)], ['refresh ports', 'Re-scan COM ports', refreshPorts], ['lock', 'Servo to 0°', () => servo('LOCK')], ['unlock', 'Servo to 90° (bench test)', () => servo('UNLOCK')], ['fullscreen', 'Camera wall', full], ['live', 'Go to Live', () => view('live')], ['hardware', 'Go to Hardware', () => view('hardware')], ['events', 'Go to Events', () => view('events')], ['theme', 'Light / dark', () => $('themeBtn').click()]];
let sel = 0, shown = []; const cin = $('cmd'), cl = $('cmds');
function rc() { const q = cin.value.trim().toLowerCase(); shown = (q ? CMDS.filter(c => c[0].includes(q) || c[1].toLowerCase().includes(q)) : CMDS.slice(0, 6)).slice(0, 7); sel = 0; cl.hidden = !shown.length || document.activeElement !== cin; cl.innerHTML = shown.map((c, i) => `<button class="cmd${i ? '' : ' sel'}" data-i="${i}">${c[0]}<small>${c[1]}</small></button>`).join(''); cl.querySelectorAll('.cmd').forEach(b => b.onmousedown = e => { e.preventDefault(); run(+b.dataset.i); }); }
function run(i) { const c = shown[i]; if (!c) return; cin.value = ''; cin.blur(); cl.hidden = true; c[2](); }
cin.addEventListener('input', rc); cin.addEventListener('focus', rc); cin.addEventListener('blur', () => setTimeout(() => cl.hidden = true, 100));
cin.addEventListener('keydown', e => { const it = cl.querySelectorAll('.cmd'); if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!it.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + it.length) % it.length; it.forEach((x, i) => x.classList.toggle('sel', i === sel)); } else if (e.key === 'Enter') run(sel); else if (e.key === 'Escape') cin.blur(); });
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); cin.focus(); } });

counts(); refresh().catch(() => {}); setInterval(() => refresh().catch(() => {}), 1000);
