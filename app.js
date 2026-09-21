const $ = (id) => document.getElementById(id);
const copy = async (text) => { if (text) await navigator.clipboard.writeText(text); };

document.getElementById('tabs').onclick = (e) => {
  const tab = e.target.dataset.tab;
  if (!tab) return;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('on', p.id === tab));
  $('title').textContent = e.target.textContent;
};

$('jsonBtn').onclick = () => {
  try { $('jsonOut').textContent = JSON.stringify(JSON.parse($('jsonIn').value), null, 2); }
  catch (err) { $('jsonOut').textContent = err.message; }
};
$('jsonMin').onclick = () => {
  try { $('jsonOut').textContent = JSON.stringify(JSON.parse($('jsonIn').value)); }
  catch (err) { $('jsonOut').textContent = err.message; }
};
$('jsonCopy').onclick = () => copy($('jsonOut').textContent);

$('encBtn').onclick = () => {
  $('b64Out').textContent = btoa(unescape(encodeURIComponent($('b64In').value)));
};
$('decBtn').onclick = () => {
  try { $('b64Out').textContent = decodeURIComponent(escape(atob($('b64In').value))); }
  catch (err) { $('b64Out').textContent = err.message; }
};

$('hashBtn').onclick = async () => {
  const buf = new TextEncoder().encode($('hashIn').value);
  const dig = await crypto.subtle.digest('SHA-256', buf);
  $('hashOut').textContent = [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

$('jwtBtn').onclick = () => {
  try {
    const part = $('jwtIn').value.trim().split('.')[1];
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    $('jwtOut').textContent = JSON.stringify(json, null, 2);
  } catch {
    $('jwtOut').textContent = 'Not a readable JWT payload.';
  }
};

$('uuidBtn').onclick = () => { $('uuidOut').textContent = crypto.randomUUID(); };
$('uuidCopy').onclick = () => copy($('uuidOut').textContent);

$('color').oninput = (e) => {
  $('hexOut').textContent = e.target.value;
  $('swatch').style.background = e.target.value;
};
$('hexCopy').onclick = () => copy($('hexOut').textContent);
$('swatch').style.background = '#7c5cfc';
