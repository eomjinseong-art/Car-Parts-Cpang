(function () {
  const ABACUS = 'https://abacus.jasoncameron.dev';
  const NAMESPACE = 'car-parts-cpang';
  const KEY = 'visits';
  const STORE = 'abacus-visits-date';

  function todayKey() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }

  function readHitDate() {
    try { return localStorage.getItem(STORE); } catch { return null; }
  }

  function writeHitDate(value) {
    try { localStorage.setItem(STORE, value); } catch {}
  }

  function target() {
    let node = document.getElementById('visitCount');
    if (node) return node;
    const nav = document.querySelector('header nav');
    if (!nav) return null;
    node = document.createElement('span');
    node.id = 'visitCount';
    node.hidden = true;
    node.setAttribute('aria-hidden', 'true');
    node.className = 'ml-auto shrink-0 self-center text-[11px] font-medium tracking-wide text-neutral-400 tabular-nums';
    nav.appendChild(node);
    return node;
  }

  function show(value) {
    const node = target();
    const n = Number(value);
    if (!node || !Number.isFinite(n)) return;
    node.textContent = '👁 ' + n.toLocaleString('ko-KR');
    node.hidden = false;
  }

  const today = todayKey();
  const already = readHitDate() === today;
  fetch(`${ABACUS}/${already ? 'get' : 'hit'}/${NAMESPACE}/${KEY}`)
    .then(res => { if (!res.ok) throw new Error('abacus'); return res.json(); })
    .then(data => {
      if (!Number.isFinite(Number(data && data.value))) throw new Error('value');
      if (!already) writeHitDate(today);
      show(data.value);
    })
    .catch(() => {});
})();
