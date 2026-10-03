'use strict';
let activeId = null;
/* DarkNova Dev Kit — everything runs in the page. No network, no storage. */

/* ============================== helpers ============================== */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const live = (toolId, fn, ms = 120) => debounce((...a) => { if (activeId === toolId) fn(...a); }, ms);
const encoder = new TextEncoder();
const strictDecoder = new TextDecoder('utf-8', { fatal: true });
const kb = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 1600);
  setTimeout(() => el.remove(), 2000);
}

async function copyText(text) {
  if (!text) { toast('Nothing to copy'); return; }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API needs a secure context and permission; fall back to a hidden textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    if (!ok) { toast('Copy failed — select the text and copy manually'); return; }
  }
  toast('Copied');
}

function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bytesToB64(bytes, urlSafe = false) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  let out = btoa(bin);
  if (urlSafe) out = out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return out;
}
function b64ToBytes(input) {
  let s = String(input).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('That is not valid Base64.');
  s = s.replace(/=+$/, '');
  if (s.length % 4 === 1) throw new Error('Base64 length is invalid (a character is missing).');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* Secure random integer in [0, max) without modulo bias. */
function randInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}

/* Reusable markup: an output box with a copy button. */
const outBox = (id, label = 'Output', extra = '') => `
  <div class="outbox">
    <div class="outbar">
      <span class="lbl">${label}</span>
      <span class="status" id="${id}-status" role="status"></span>
      ${extra}
      <button type="button" class="mini" data-copy="${id}">Copy</button>
    </div>
    <pre id="${id}" tabindex="0"></pre>
  </div>`;

function setStatus(id, text, kind = '') {
  const el = $(`${id}-status`);
  if (!el) return;
  el.textContent = text;
  el.className = `status ${kind}`;
}


/* Minimal strict JSON scanner: returns the index where `text` stops being valid JSON. */
function jsonErrorIndex(text) {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const fail = () => { throw i; };
  const lit = (w) => { if (text.startsWith(w, i)) i += w.length; else fail(); };
  const str = () => {
    i++;
    while (i < text.length) {
      const c = text[i];
      if (c === '"') { i++; return; }
      if (c < ' ') fail();
      if (c === '\\') {
        i++;
        if (text[i] === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) fail(); i += 5; }
        else if ('"\\/bfnrt'.includes(text[i] || '#')) i++;
        else fail();
      } else i++;
    }
    fail();
  };
  const val = () => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++; ws();
      if (text[i] === '}') { i++; return; }
      for (;;) {
        ws(); if (text[i] !== '"') fail(); str(); ws();
        if (text[i] !== ':') fail(); i++; val(); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return; }
        fail();
      }
    } else if (c === '[') {
      i++; ws();
      if (text[i] === ']') { i++; return; }
      for (;;) {
        val(); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return; }
        fail();
      }
    } else if (c === '"') str();
    else if (c === 't') lit('true');
    else if (c === 'f') lit('false');
    else if (c === 'n') lit('null');
    else {
      const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
      if (!m) fail();
      i += m[0].length;
    }
  };
  try { val(); ws(); if (i < text.length) fail(); return -1; } catch (e) { return typeof e === 'number' ? e : -1; }
}

/* ============================== tools ============================== */

const tools = [];
const tool = (def) => tools.push(def);

/* ---------- JSON ---------- */
tool({
  id: 'json', name: 'JSON', keys: 'format minify validate pretty sort',
  lede: 'Format, validate, minify and sort. Errors point at the line and column.',
  html: () => `
    <div class="split">
      <div class="col">
        <label class="lbl" for="json-in">Input</label>
        <textarea id="json-in" spellcheck="false" placeholder='{"hello":"world"}'></textarea>
      </div>
      ${outBox('json-out')}
    </div>
    <div class="row">
      <button type="button" id="json-fmt">Format</button>
      <button type="button" class="ghost" id="json-min">Minify</button>
      <label class="opt">Indent
        <select id="json-indent"><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tab</option></select>
      </label>
      <label class="opt"><input type="checkbox" id="json-sort" /> Sort keys</label>
      <span class="grow"></span>
      <button type="button" class="ghost" id="json-sample">Sample</button>
      <button type="button" class="ghost" id="json-dl">Download</button>
      <button type="button" class="ghost" id="json-clear">Clear</button>
    </div>`,
  init() {
    let mode = 'format';
    const sortDeep = (v) => Array.isArray(v) ? v.map(sortDeep)
      : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])])) : v;
    const locate = (text, err) => {
      let m = /line (\d+) column (\d+)/.exec(err.message);
      if (m) return { line: +m[1], col: +m[2] };
      m = /position (\d+)/.exec(err.message);
      const pos = m ? +m[1] : jsonErrorIndex(text);
      if (pos < 0) return {};
      const before = text.slice(0, pos);
      return { line: before.split('\n').length, col: pos - before.lastIndexOf('\n') };
    };
    const run = () => {
      const text = $('json-in').value;
      if (!text.trim()) { $('json-out').textContent = ''; setStatus('json-out', ''); return; }
      try {
        let v = JSON.parse(text);
        if ($('json-sort').checked) v = sortDeep(v);
        const ind = $('json-indent').value;
        const out = mode === 'min' ? JSON.stringify(v) : JSON.stringify(v, null, ind === 'tab' ? '\t' : +ind);
        $('json-out').textContent = out;
        setStatus('json-out', `Valid · ${kb(encoder.encode(text).length)} → ${kb(encoder.encode(out).length)}`, 'ok');
      } catch (err) {
        const { line, col } = locate(text, err);
        const lines = text.split('\n');
        const snippet = line ? `\n\n${line}: ${lines[line - 1].slice(0, 200)}\n${' '.repeat(String(line).length + 1 + Math.max(col - 1, 0))}^` : '';
        $('json-out').textContent = `${err.message}${snippet}`;
        setStatus('json-out', line ? `Invalid · line ${line}, column ${col}` : 'Invalid JSON', 'bad');
      }
    };
    $('json-in').addEventListener('input', live('json', run));
    $('json-fmt').onclick = () => { mode = 'format'; run(); };
    $('json-min').onclick = () => { mode = 'min'; run(); };
    $('json-indent').onchange = () => { mode = 'format'; run(); };
    $('json-sort').onchange = run;
    $('json-sample').onclick = () => { $('json-in').value = '{"name":"Nova","tags":["dev","kit"],"nested":{"b":2,"a":1},"ok":true,"n":null}'; mode = 'format'; run(); };
    $('json-clear').onclick = () => { $('json-in').value = ''; run(); $('json-in').focus(); };
    $('json-dl').onclick = () => { const t = $('json-out').textContent; if (t && $('json-out-status').classList.contains('ok')) download('data.json', t, 'application/json'); else toast('Nothing valid to download'); };
  },
});

/* ---------- Base64 ---------- */
tool({
  id: 'b64', name: 'Base64', keys: 'encode decode base64url file',
  lede: 'Encode or decode text and files. UTF-8 safe, URL-safe option, forgiving about padding.',
  html: () => `
    <div class="split">
      <div class="col">
        <label class="lbl" for="b64-in">Input</label>
        <textarea id="b64-in" spellcheck="false" placeholder="Text, or Base64 to decode"></textarea>
      </div>
      ${outBox('b64-out')}
    </div>
    <div class="row">
      <div class="seg" role="group" aria-label="Direction">
        <button type="button" class="on" id="b64-enc" aria-pressed="true">Encode</button>
        <button type="button" id="b64-dec" aria-pressed="false">Decode</button>
      </div>
      <label class="opt"><input type="checkbox" id="b64-url" /> URL-safe (no padding)</label>
      <span class="grow"></span>
      <label class="filebtn ghost">Encode a file… <input type="file" id="b64-file" hidden /></label>
      <button type="button" class="ghost" id="b64-swap">Use output as input</button>
    </div>`,
  init() {
    let mode = 'enc';
    const run = () => {
      const text = $('b64-in').value;
      if (!text) { $('b64-out').textContent = ''; setStatus('b64-out', ''); return; }
      try {
        if (mode === 'enc') {
          const bytes = encoder.encode(text);
          $('b64-out').textContent = bytesToB64(bytes, $('b64-url').checked);
          setStatus('b64-out', `${kb(bytes.length)} → ${kb($('b64-out').textContent.length)}`, 'ok');
        } else {
          const bytes = b64ToBytes(text);
          try {
            $('b64-out').textContent = strictDecoder.decode(bytes);
            setStatus('b64-out', `Decoded · ${kb(bytes.length)} text`, 'ok');
          } catch {
            const preview = hex(bytes.subarray(0, 64)).replace(/(..)/g, '$1 ').trim();
            $('b64-out').textContent = `Binary data (${bytes.length} bytes), not UTF-8 text.\nFirst bytes (hex):\n${preview}${bytes.length > 64 ? ' …' : ''}`;
            setStatus('b64-out', 'Binary', 'warn');
          }
        }
      } catch (err) {
        $('b64-out').textContent = err.message;
        setStatus('b64-out', 'Invalid', 'bad');
      }
    };
    const setMode = (m) => {
      mode = m;
      $('b64-enc').classList.toggle('on', m === 'enc'); $('b64-dec').classList.toggle('on', m === 'dec');
      $('b64-enc').setAttribute('aria-pressed', m === 'enc'); $('b64-dec').setAttribute('aria-pressed', m === 'dec');
      run();
    };
    $('b64-in').addEventListener('input', live('b64', run));
    $('b64-enc').onclick = () => setMode('enc');
    $('b64-dec').onclick = () => setMode('dec');
    $('b64-url').onchange = run;
    $('b64-swap').onclick = () => { const o = $('b64-out').textContent; if (o) { $('b64-in').value = o; setMode(mode === 'enc' ? 'dec' : 'enc'); } };
    $('b64-file').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 8 * 1048576) { toast('File too large (max 8 MB)'); return; }
      const bytes = new Uint8Array(await f.arrayBuffer());
      $('b64-in').value = `(file: ${f.name})`;
      $('b64-out').textContent = bytesToB64(bytes, $('b64-url').checked);
      setStatus('b64-out', `${f.name} · ${kb(bytes.length)}`, 'ok');
      e.target.value = '';
    };
  },
});

/* ---------- URL ---------- */
tool({
  id: 'url', name: 'URL', keys: 'encode decode query parse percent',
  lede: 'Percent-encode and decode, and break a URL into its parts and query parameters.',
  html: () => `
    <div class="split">
      <div class="col">
        <label class="lbl" for="url-in">Input</label>
        <textarea id="url-in" spellcheck="false" placeholder="https://example.com/search?q=hello world&lang=en"></textarea>
      </div>
      ${outBox('url-out')}
    </div>
    <div class="row">
      <button type="button" id="url-enc">Encode</button>
      <button type="button" class="ghost" id="url-dec">Decode</button>
      <label class="opt"><input type="checkbox" id="url-full" /> Whole URL (keep <code>:/?#&amp;=</code>)</label>
    </div>
    <h2 class="sub">Parsed</h2>
    <div id="url-parts" class="kv"></div>`,
  init() {
    const parse = () => {
      const raw = $('url-in').value.trim();
      const box = $('url-parts');
      if (!raw) { box.innerHTML = '<p class="muted">Paste a URL above to see its parts.</p>'; return; }
      let u;
      try { u = new URL(raw); } catch { box.innerHTML = '<p class="muted">Not a complete URL (needs a scheme like https://).</p>'; return; }
      const rows = [['Protocol', u.protocol], ['Host', u.hostname], ['Port', u.port || '(default)'], ['Path', u.pathname], ['Hash', u.hash || '—']];
      let html = rows.map(([k, v]) => `<div><span>${k}</span><code>${esc(v)}</code></div>`).join('');
      if ([...u.searchParams].length) {
        html += '<div class="kvh">Query parameters</div>' + [...u.searchParams].map(([k, v]) => `<div><span>${esc(k)}</span><code>${esc(v)}</code></div>`).join('');
      }
      box.innerHTML = html;
    };
    const transform = (fn, label) => {
      const text = $('url-in').value;
      try {
        $('url-out').textContent = fn(text);
        setStatus('url-out', label, 'ok');
      } catch {
        $('url-out').textContent = 'Could not decode: the input has an invalid % sequence.';
        setStatus('url-out', 'Invalid', 'bad');
      }
    };
    $('url-enc').onclick = () => transform($('url-full').checked ? encodeURI : encodeURIComponent, 'Encoded');
    $('url-dec').onclick = () => transform($('url-full').checked ? decodeURI : decodeURIComponent, 'Decoded');
    $('url-in').addEventListener('input', live('url', parse));
    parse();
  },
});

/* ---------- Hash ---------- */
tool({
  id: 'hash', name: 'Hash', keys: 'sha256 sha1 sha512 hmac checksum file',
  lede: 'SHA-1, SHA-256, SHA-384 and SHA-512 of text or a file, with optional HMAC and a checksum compare.',
  html: () => `
    <div class="col">
      <label class="lbl" for="hash-in">Text</label>
      <textarea id="hash-in" rows="5" class="short" spellcheck="false" placeholder="Text to hash"></textarea>
    </div>
    <div class="row">
      <label class="filebtn ghost">Hash a file… <input type="file" id="hash-file" hidden /></label>
      <span id="hash-fileinfo" class="muted"></span>
      <button type="button" class="ghost" id="hash-fileclear" hidden>Use text instead</button>
      <span class="grow"></span>
      <label class="opt"><input type="checkbox" id="hash-upper" /> Uppercase</label>
    </div>
    <div class="col">
      <label class="lbl" for="hash-key">HMAC secret <span class="muted">(optional — leave empty for a plain hash)</span></label>
      <input id="hash-key" type="text" spellcheck="false" autocomplete="off" placeholder="Secret key" />
    </div>
    <div id="hash-results" class="results"></div>
    <div class="col">
      <label class="lbl" for="hash-cmp">Compare with expected checksum</label>
      <input id="hash-cmp" type="text" spellcheck="false" autocomplete="off" placeholder="Paste a hash to check it against the results" />
      <p class="status" id="hash-cmp-status" role="status"></p>
    </div>
    <p class="hint">MD5 is not offered: browsers' built-in crypto deliberately leaves it out.</p>`,
  init() {
    const ALGS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
    let fileBytes = null, token = 0, current = {};
    const run = async () => {
      const my = ++token;
      const data = fileBytes || encoder.encode($('hash-in').value);
      const key = $('hash-key').value;
      const upper = $('hash-upper').checked;
      const out = {};
      for (const alg of ALGS) {
        if (key) {
          const k = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: alg }, false, ['sign']);
          out[alg] = hex(await crypto.subtle.sign('HMAC', k, data));
        } else {
          out[alg] = hex(await crypto.subtle.digest(alg, data));
        }
      }
      if (my !== token || !$('hash-results')) return;
      current = out;
      $('hash-results').innerHTML = ALGS.map((a) => {
        const v = upper ? out[a].toUpperCase() : out[a];
        return `<div class="result"><span class="lbl">${key ? 'HMAC-' : ''}${a}</span><code id="hash-${a}">${v}</code><button type="button" class="mini" data-copy="hash-${a}">Copy</button></div>`;
      }).join('');
      compare();
    };
    const compare = () => {
      const want = $('hash-cmp').value.trim().toLowerCase().replace(/\s+/g, '');
      const el = $('hash-cmp-status');
      if (!want) { el.textContent = ''; el.className = 'status'; return; }
      const hit = Object.entries(current).find(([, v]) => v === want);
      el.textContent = hit ? `Match: ${hit[0]}` : 'No match';
      el.className = `status ${hit ? 'ok' : 'bad'}`;
    };
    $('hash-in').addEventListener('input', live('hash', run, 150));
    $('hash-key').addEventListener('input', live('hash', run, 150));
    $('hash-upper').onchange = run;
    $('hash-cmp').addEventListener('input', compare);
    $('hash-file').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 200 * 1048576) { toast('File too large (max 200 MB)'); return; }
      fileBytes = new Uint8Array(await f.arrayBuffer());
      $('hash-fileinfo').textContent = `${f.name} · ${kb(f.size)}`;
      $('hash-fileclear').hidden = false;
      $('hash-in').disabled = true;
      e.target.value = '';
      run();
    };
    $('hash-fileclear').onclick = () => {
      fileBytes = null; $('hash-fileinfo').textContent = ''; $('hash-fileclear').hidden = true; $('hash-in').disabled = false; run();
    };
    run();
  },
});

/* ---------- JWT ---------- */
tool({
  id: 'jwt', name: 'JWT', keys: 'token decode verify hs256 claims exp',
  lede: 'Decode a token locally, read its claims in plain language, and verify HS256/384/512 signatures.',
  html: () => `
    <div class="col">
      <label class="lbl" for="jwt-in">Token</label>
      <textarea id="jwt-in" class="short" rows="4" spellcheck="false" placeholder="header.payload.signature"></textarea>
    </div>
    <p class="status" id="jwt-badge" role="status"></p>
    <div class="split">
      ${outBox('jwt-head', 'Header')}
      ${outBox('jwt-pay', 'Payload')}
    </div>
    <div id="jwt-claims" class="kv"></div>
    <h2 class="sub">Verify signature</h2>
    <div class="row">
      <input id="jwt-secret" type="text" spellcheck="false" autocomplete="off" placeholder="Shared secret (HS256 / HS384 / HS512)" class="grow-in" />
      <button type="button" id="jwt-verify">Verify</button>
    </div>
    <p class="status" id="jwt-verify-status" role="status"></p>
    <p class="hint">Decoding never needs a secret, and anyone can read a JWT payload, so never put secrets in one. Tokens pasted here stay in this tab.</p>`,
  init() {
    let parsed = null;
    const fmtDate = (s) => {
      const d = new Date(s * 1000);
      const diff = (d.getTime() - Date.now()) / 1000;
      const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
      const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
      const [u, n] = units.find(([, sec]) => Math.abs(diff) >= sec) || units[5];
      return `${d.toISOString().replace('T', ' ').replace('.000Z', ' UTC')} (${rtf.format(Math.round(diff / n), u)})`;
    };
    const part = (p) => JSON.parse(strictDecoder.decode(b64ToBytes(p)));
    const run = () => {
      const raw = $('jwt-in').value.trim();
      parsed = null;
      $('jwt-claims').innerHTML = '';
      $('jwt-verify-status').textContent = '';
      if (!raw) { $('jwt-head').textContent = ''; $('jwt-pay').textContent = ''; setStatus('jwt-head', ''); setStatus('jwt-pay', ''); $('jwt-badge').textContent = ''; $('jwt-badge').className = 'status'; return; }
      const parts = raw.split('.');
      try {
        if (parts.length !== 3) throw new Error('A JWT has three dot-separated parts.');
        const header = part(parts[0]), payload = part(parts[1]);
        parsed = { parts, header, payload };
        $('jwt-head').textContent = JSON.stringify(header, null, 2);
        $('jwt-pay').textContent = JSON.stringify(payload, null, 2);
        setStatus('jwt-head', header.alg ? `alg ${header.alg}` : '', 'ok');
        setStatus('jwt-pay', '', 'ok');
        const now = Date.now() / 1000;
        let badge = ['Token decoded', 'ok'];
        if (typeof payload.exp === 'number') badge = payload.exp < now ? ['Expired', 'bad'] : ['Not expired', 'ok'];
        if (typeof payload.nbf === 'number' && payload.nbf > now) badge = ['Not valid yet (nbf)', 'warn'];
        if (String(header.alg).toLowerCase() === 'none') badge = ['alg "none": unsigned token, never trust it', 'bad'];
        $('jwt-badge').textContent = badge[0];
        $('jwt-badge').className = `status ${badge[1]}`;
        const rows = [];
        for (const [k, label] of [['iat', 'Issued at'], ['nbf', 'Not before'], ['exp', 'Expires']]) {
          if (typeof payload[k] === 'number') rows.push(`<div><span>${label}</span><code>${esc(fmtDate(payload[k]))}</code></div>`);
        }
        for (const [k, label] of [['iss', 'Issuer'], ['sub', 'Subject'], ['aud', 'Audience'], ['jti', 'Token ID']]) {
          if (payload[k] != null) rows.push(`<div><span>${label}</span><code>${esc(Array.isArray(payload[k]) ? payload[k].join(', ') : payload[k])}</code></div>`);
        }
        $('jwt-claims').innerHTML = rows.join('');
      } catch (err) {
        $('jwt-head').textContent = ''; $('jwt-pay').textContent = '';
        $('jwt-badge').textContent = `Not a readable JWT: ${err.message}`;
        $('jwt-badge').className = 'status bad';
      }
    };
    $('jwt-in').addEventListener('input', live('jwt', run));
    $('jwt-verify').onclick = async () => {
      const el = $('jwt-verify-status');
      if (!parsed) { el.textContent = 'Paste a valid token first.'; el.className = 'status warn'; return; }
      const algMap = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };
      const hash = algMap[parsed.header.alg];
      if (!hash) { el.textContent = `Can't verify ${parsed.header.alg || 'this algorithm'} here. Only HS256/384/512 use a shared secret.`; el.className = 'status warn'; return; }
      const secret = $('jwt-secret').value;
      if (!secret) { el.textContent = 'Enter the secret.'; el.className = 'status warn'; return; }
      try {
        const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash }, false, ['verify']);
        const ok = await crypto.subtle.verify('HMAC', key, b64ToBytes(parsed.parts[2]), encoder.encode(`${parsed.parts[0]}.${parsed.parts[1]}`));
        el.textContent = ok ? 'Signature is valid' : 'Signature does NOT match';
        el.className = `status ${ok ? 'ok' : 'bad'}`;
      } catch {
        el.textContent = 'Signature part is not valid Base64URL.';
        el.className = 'status bad';
      }
    };
  },
});

/* ---------- Generate ---------- */
tool({
  id: 'gen', name: 'Generate', keys: 'uuid ulid nanoid password random v4 v7',
  lede: 'Secure random IDs and passwords from your browser\'s cryptographic generator.',
  html: () => `
    <div class="row">
      <label class="opt">Type
        <select id="gen-type">
          <option value="uuid4">UUID v4</option>
          <option value="uuid7">UUID v7 (time-ordered)</option>
          <option value="ulid">ULID</option>
          <option value="nano">NanoID-style</option>
          <option value="pass">Password</option>
        </select>
      </label>
      <label class="opt">Count <input id="gen-count" type="number" min="1" max="50" value="5" /></label>
      <label class="opt" id="gen-len-wrap" hidden>Length <input id="gen-len" type="number" min="4" max="128" value="21" /></label>
      <button type="button" id="gen-go">Generate</button>
    </div>
    <div class="row" id="gen-pass-opts" hidden>
      <label class="opt"><input type="checkbox" id="gp-lower" checked /> a–z</label>
      <label class="opt"><input type="checkbox" id="gp-upper" checked /> A–Z</label>
      <label class="opt"><input type="checkbox" id="gp-digit" checked /> 0–9</label>
      <label class="opt"><input type="checkbox" id="gp-sym" checked /> Symbols</label>
    </div>
    ${outBox('gen-out', 'Results')}`,
  init() {
    const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const fmtUuid = (b) => { const h = hex(b); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
    const makers = {
      uuid4: () => crypto.randomUUID(),
      uuid7: () => {
        const b = new Uint8Array(16); crypto.getRandomValues(b);
        const ts = BigInt(Date.now());
        for (let i = 0; i < 6; i++) b[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
        b[6] = (b[6] & 0x0f) | 0x70; b[8] = (b[8] & 0x3f) | 0x80;
        return fmtUuid(b);
      },
      ulid: () => {
        let t = BigInt(Date.now()), time = '';
        for (let i = 0; i < 10; i++) { time = B32[Number(t % 32n)] + time; t /= 32n; }
        let rnd = '';
        for (let i = 0; i < 16; i++) rnd += B32[randInt(32)];
        return time + rnd;
      },
      nano: () => {
        const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
        const n = Math.min(128, Math.max(4, +$('gen-len').value || 21));
        let s = '';
        for (let i = 0; i < n; i++) s += A[randInt(A.length)];
        return s;
      },
      pass: () => {
        const sets = [['gp-lower', 'abcdefghijklmnopqrstuvwxyz'], ['gp-upper', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], ['gp-digit', '0123456789'], ['gp-sym', '!@#$%^&*()-_=+[]{};:,.?']]
          .filter(([id]) => $(id).checked).map(([, chars]) => chars);
        if (!sets.length) return '(choose at least one character set)';
        const n = Math.min(128, Math.max(sets.length, +$('gen-len').value || 16));
        const all = sets.join('');
        const chars = sets.map((s) => s[randInt(s.length)]); // guarantee one from each chosen set
        while (chars.length < n) chars.push(all[randInt(all.length)]);
        for (let i = chars.length - 1; i > 0; i--) { const j = randInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
        return chars.join('');
      },
    };
    const sync = () => {
      const t = $('gen-type').value;
      $('gen-len-wrap').hidden = !(t === 'nano' || t === 'pass');
      $('gen-pass-opts').hidden = t !== 'pass';
      if (t === 'pass' && +$('gen-len').value === 21) $('gen-len').value = 16;
      if (t === 'nano' && +$('gen-len').value === 16) $('gen-len').value = 21;
    };
    const go = () => {
      const t = $('gen-type').value;
      const n = Math.min(50, Math.max(1, +$('gen-count').value || 1));
      $('gen-out').textContent = Array.from({ length: n }, makers[t]).join('\n');
      setStatus('gen-out', `${n} generated`, 'ok');
    };
    $('gen-type').onchange = () => { sync(); go(); };
    $('gen-go').onclick = go;
    ['gen-count', 'gen-len', 'gp-lower', 'gp-upper', 'gp-digit', 'gp-sym'].forEach((id) => $(id).addEventListener('change', go));
    sync(); go();
  },
});

/* ---------- Timestamp ---------- */
tool({
  id: 'time', name: 'Timestamp', keys: 'unix epoch date iso time',
  lede: 'Convert between Unix time and readable dates. Seconds and milliseconds are detected automatically.',
  html: () => `
    <div class="live"><span class="lbl">Now</span><code id="ts-now"></code></div>
    <div class="row">
      <input id="ts-in" type="text" class="grow-in" spellcheck="false" autocomplete="off" placeholder="1735689600  ·  1735689600000  ·  2025-01-01T00:00:00Z  ·  Jan 1 2025" />
      <button type="button" id="ts-use-now">Use now</button>
    </div>
    <p class="status" id="ts-status" role="status"></p>
    <div id="ts-rows" class="kv"></div>`,
  init() {
    const rows = $('ts-rows');
    const parse = (s) => {
      s = s.trim();
      if (!s) return null;
      if (/^-?\d+(\.\d+)?$/.test(s)) {
        const n = Number(s), ms = Math.abs(n) >= 1e11 ? n : n * 1000;
        const d = new Date(ms);
        return isNaN(d) ? null : { d, unit: Math.abs(n) >= 1e11 ? 'milliseconds' : 'seconds' };
      }
      const d = new Date(s);
      return isNaN(d) ? null : { d, unit: 'date string' };
    };
    const rel = (d) => {
      const diff = (d.getTime() - Date.now()) / 1000;
      const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
      const [u, n] = units.find(([, sec]) => Math.abs(diff) >= sec) || units[5];
      return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(diff / n), u);
    };
    const run = () => {
      const r = parse($('ts-in').value);
      const st = $('ts-status');
      if (!$('ts-in').value.trim()) { rows.innerHTML = ''; st.textContent = ''; st.className = 'status'; return; }
      if (!r) { rows.innerHTML = ''; st.textContent = 'Could not read that as a time.'; st.className = 'status bad'; return; }
      const { d, unit } = r;
      st.textContent = `Read as ${unit}`; st.className = 'status ok';
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const data = [
        ['Unix (seconds)', String(Math.floor(d.getTime() / 1000))],
        ['Unix (milliseconds)', String(d.getTime())],
        ['ISO 8601 (UTC)', d.toISOString()],
        [`Local (${tz})`, d.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'long' })],
        ['Relative', rel(d)],
      ];
      rows.innerHTML = data.map(([k, v], i) => `<div><span>${esc(k)}</span><code id="ts-v${i}">${esc(v)}</code><button type="button" class="mini" data-copy="ts-v${i}">Copy</button></div>`).join('');
    };
    const tick = () => { const n = $('ts-now'); if (n) n.textContent = `${Math.floor(Date.now() / 1000)}  ·  ${new Date().toISOString()}`; };
    tick();
    const timer = setInterval(() => { if (!$('ts-now')) clearInterval(timer); else tick(); }, 1000);
    $('ts-in').addEventListener('input', live('time', run, 100));
    $('ts-use-now').onclick = () => { $('ts-in').value = String(Math.floor(Date.now() / 1000)); run(); };
  },
});

/* ---------- Regex ---------- */
tool({
  id: 'regex', name: 'Regex', keys: 'regular expression match test groups',
  lede: 'Test a JavaScript regular expression with live highlighting and capture groups.',
  html: () => `
    <div class="row">
      <span class="slash">/</span>
      <input id="re-pat" type="text" class="grow-in mono" spellcheck="false" autocomplete="off" placeholder="(\\w+)@(\\w+)\\.com" />
      <span class="slash">/</span>
      <label class="opt"><input type="checkbox" id="re-g" checked /> g</label>
      <label class="opt"><input type="checkbox" id="re-i" /> i</label>
      <label class="opt"><input type="checkbox" id="re-m" /> m</label>
      <label class="opt"><input type="checkbox" id="re-s" /> s</label>
      <label class="opt"><input type="checkbox" id="re-u" /> u</label>
    </div>
    <p class="status" id="re-status" role="status"></p>
    <div class="col">
      <label class="lbl" for="re-text">Test string</label>
      <textarea id="re-text" class="short" spellcheck="false" placeholder="Paste text to search"></textarea>
    </div>
    <div class="outbox"><div class="outbar"><span class="lbl">Highlighted</span></div><pre id="re-hl"></pre></div>
    <h2 class="sub">Matches</h2>
    <div id="re-list" class="kv"></div>`,
  init() {
    const MAX = 1000;
    const run = () => {
      const pat = $('re-pat').value, text = $('re-text').value;
      const flags = ['g', 'i', 'm', 's', 'u'].filter((f) => $(`re-${f}`).checked).join('');
      const st = $('re-status');
      $('re-list').innerHTML = '';
      if (!pat) { $('re-hl').textContent = text; st.textContent = ''; st.className = 'status'; return; }
      let re;
      try { re = new RegExp(pat, flags); } catch (err) {
        $('re-hl').textContent = text; st.textContent = err.message; st.className = 'status bad'; return;
      }
      const matches = [];
      if (re.global) {
        let m;
        while ((m = re.exec(text)) && matches.length < MAX) {
          matches.push(m);
          if (m[0] === '') re.lastIndex++; // avoid an infinite loop on empty matches
        }
      } else {
        const m = re.exec(text);
        if (m) matches.push(m);
      }
      let html = '', last = 0;
      for (const m of matches) {
        if (m[0] === '') continue;
        html += esc(text.slice(last, m.index)) + `<mark>${esc(m[0])}</mark>`;
        last = m.index + m[0].length;
      }
      $('re-hl').innerHTML = html + esc(text.slice(last));
      st.textContent = matches.length ? `${matches.length}${matches.length >= MAX ? '+' : ''} match${matches.length === 1 ? '' : 'es'}` : 'No matches';
      st.className = `status ${matches.length ? 'ok' : 'warn'}`;
      $('re-list').innerHTML = matches.slice(0, 100).map((m, i) => {
        const groups = m.slice(1).map((g, gi) => `<div class="grp"><span>group ${gi + 1}</span><code>${g === undefined ? '<em>undefined</em>' : esc(g)}</code></div>`).join('');
        const named = m.groups ? Object.entries(m.groups).map(([k, v]) => `<div class="grp"><span>${esc(k)}</span><code>${v === undefined ? '<em>undefined</em>' : esc(v)}</code></div>`).join('') : '';
        return `<div class="match"><div><span>#${i + 1} @ ${m.index}</span><code>${m[0] === '' ? '<em>(empty)</em>' : esc(m[0])}</code></div>${groups}${named}</div>`;
      }).join('') + (matches.length > 100 ? `<p class="muted">Showing the first 100 matches.</p>` : '');
    };
    ['re-pat', 're-text'].forEach((id) => $(id).addEventListener('input', live('regex', run, 100)));
    ['g', 'i', 'm', 's', 'u'].forEach((f) => $(`re-${f}`).addEventListener('change', run));
    run();
  },
});

/* ---------- Color ---------- */
tool({
  id: 'color', name: 'Color', keys: 'hex rgb hsl contrast wcag accessibility',
  lede: 'Convert between HEX, RGB and HSL, explore shades, and check WCAG contrast.',
  html: () => `
    <div class="row">
      <input id="clr-pick" type="color" value="#7c5cfc" aria-label="Pick a color" />
      <input id="clr-in" type="text" class="grow-in mono" spellcheck="false" autocomplete="off" value="#7c5cfc" aria-label="Color value" placeholder="#7c5cfc · rgb(124 92 252) · hsl(251 96% 68%)" />
    </div>
    <p class="status" id="clr-status" role="status"></p>
    <div class="swatch" id="clr-swatch"></div>
    <div id="clr-vals" class="kv"></div>
    <h2 class="sub">Shades</h2>
    <div class="shades" id="clr-shades"></div>
    <h2 class="sub">Contrast (WCAG)</h2>
    <div class="contrast" id="clr-contrast"></div>`,
  init() {
    const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
    const toHex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    const rgbToHsl = ({ r, g, b }) => {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
      let h = 0, s = 0;
      if (d) {
        s = d / (1 - Math.abs(2 * l - 1));
        h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60; if (h < 0) h += 360;
      }
      return { h, s: s * 100, l: l * 100 };
    };
    const hslToRgb = ({ h, s, l }) => {
      s /= 100; l /= 100;
      const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
      const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
      return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
    };
    const parse = (str) => {
      const s = str.trim().toLowerCase();
      let m = /^#?([0-9a-f]{3})$/.exec(s);
      if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16) };
      m = /^#?([0-9a-f]{6})$/.exec(s);
      if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4), 16) };
      m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(s);
      if (m) return { r: clamp(+m[1], 0, 255), g: clamp(+m[2], 0, 255), b: clamp(+m[3], 0, 255) };
      m = /^hsla?\(\s*(-?\d+(?:\.\d+)?)(?:deg)?[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%/.exec(s);
      if (m) return hslToRgb({ h: ((+m[1] % 360) + 360) % 360, s: clamp(+m[2], 0, 100), l: clamp(+m[3], 0, 100) });
      return null;
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const badge = (ok, label) => `<span class="pill ${ok ? 'ok' : 'bad'}">${label} ${ok ? '✓' : '✕'}</span>`;

    const show = (rgb) => {
      const hx = toHex(rgb), hsl = rgbToHsl(rgb);
      $('clr-pick').value = hx;
      $('clr-swatch').style.background = hx;
      const vals = [
        ['HEX', hx],
        ['RGB', `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`],
        ['HSL', `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`],
      ];
      $('clr-vals').innerHTML = vals.map(([k, v], i) => `<div><span>${k}</span><code id="clr-v${i}">${v}</code><button type="button" class="mini" data-copy="clr-v${i}">Copy</button></div>`).join('');
      $('clr-shades').innerHTML = [95, 85, 75, 65, 55, 45, 35, 25, 15].map((l) => {
        const c = toHex(hslToRgb({ h: hsl.h, s: hsl.s, l }));
        return `<button type="button" class="shade" style="background:${c}" data-color="${c}" aria-label="Use ${c}"><span>${c}</span></button>`;
      }).join('');
      $('clr-contrast').innerHTML = [['White', { r: 255, g: 255, b: 255 }], ['Black', { r: 0, g: 0, b: 0 }]].map(([name, bg]) => {
        const r = ratio(rgb, bg);
        return `<div class="ctr" style="background:${toHex(bg)};color:${hx}"><b>Aa</b><span>${hx} on ${name.toLowerCase()}</span><em>${r.toFixed(2)}:1</em>
          <div class="pills">${badge(r >= 4.5, 'AA')}${badge(r >= 7, 'AAA')}${badge(r >= 3, 'Large text AA')}</div></div>`;
      }).join('');
    };
    const fromText = () => {
      const rgb = parse($('clr-in').value);
      const st = $('clr-status');
      if (!rgb) { st.textContent = 'Use #hex, rgb(…) or hsl(…).'; st.className = 'status bad'; return; }
      st.textContent = ''; st.className = 'status';
      show(rgb);
    };
    $('clr-in').addEventListener('input', live('color', fromText, 80));
    $('clr-pick').addEventListener('input', (e) => { $('clr-in').value = e.target.value; fromText(); });
    $('clr-shades').addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (b) { $('clr-in').value = b.dataset.color; fromText(); }
    });
    fromText();
  },
});

/* ============================== shell ============================== */

const stage = $('stage');

function renderNav(filter = '') {
  const q = filter.trim().toLowerCase();
  const list = tools.filter((t) => !q || `${t.name} ${t.keys}`.toLowerCase().includes(q));
  $('tabs').innerHTML = list.length
    ? list.map((t) => `<button type="button" data-tab="${t.id}" class="${t.id === activeId ? 'on' : ''}" ${t.id === activeId ? 'aria-current="page"' : ''}>${esc(t.name)}</button>`).join('')
    : '<p class="muted none">No tools match.</p>';
}

function openTool(id, { focus = false } = {}) {
  const t = tools.find((x) => x.id === id) || tools[0];
  activeId = t.id;
  $('title').textContent = t.name;
  $('lede').textContent = t.lede;
  document.title = `${t.name} — DarkNova Dev Kit`;
  stage.innerHTML = `<section class="panel" aria-labelledby="title">${t.html()}</section>`;
  t.init();
  renderNav($('find').value);
  if (location.hash !== `#${t.id}`) history.replaceState(null, '', `#${t.id}`);
  if (focus) stage.focus({ preventScroll: true });
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { openTool(tab.dataset.tab, { focus: true }); window.scrollTo(0, 0); return; }
  const cp = e.target.closest('[data-copy]');
  if (cp) {
    const el = $(cp.dataset.copy);
    if (el) copyText(el.value ?? el.textContent);
  }
});

$('find').addEventListener('input', (e) => renderNav(e.target.value));
$('find').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = $('tabs').querySelector('[data-tab]');
    if (first) { openTool(first.dataset.tab, { focus: true }); $('find').blur(); }
  }
  if (e.key === 'Escape') { e.target.value = ''; renderNav(); e.target.blur(); }
});
document.addEventListener('keydown', (e) => {
  const typing = /input|textarea|select/i.test(document.activeElement?.tagName || '');
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
    e.preventDefault();
    $('find').focus();
    $('find').select();
  }
});
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (id && id !== activeId && tools.some((t) => t.id === id)) openTool(id);
});

openTool(location.hash.slice(1) || 'json');
