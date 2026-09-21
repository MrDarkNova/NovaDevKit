const $ = (id) => document.getElementById(id);

$('jsonBtn').onclick = () => {
  try {
    $('jsonOut').textContent = JSON.stringify(JSON.parse($('jsonIn').value), null, 2);
  } catch (err) {
    $('jsonOut').textContent = err.message;
  }
};

$('jsonCopy').onclick = async () => {
  const text = $('jsonOut').textContent;
  if (text) await navigator.clipboard.writeText(text);
};

$('encBtn').onclick = () => {
  $('b64Out').textContent = btoa(unescape(encodeURIComponent($('b64In').value)));
};

$('decBtn').onclick = () => {
  try {
    $('b64Out').textContent = decodeURIComponent(escape(atob($('b64In').value)));
  } catch (err) {
    $('b64Out').textContent = err.message;
  }
};

$('uuidBtn').onclick = () => {
  $('uuidOut').textContent = crypto.randomUUID();
};

$('color').oninput = (e) => {
  $('hexOut').textContent = e.target.value;
};
