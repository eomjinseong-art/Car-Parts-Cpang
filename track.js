(function () {
  var LANDING_FLAG = 'va_landing';

  function storageGet(key) {
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (e) {}
  }

  function clip(value) {
    var text = String(value);
    return text.length > 255 ? text.slice(0, 255) : text;
  }

  function send(name, data) {
    if (typeof window.va !== 'function') return;
    try { window.va('event', { name: name, data: data }); } catch (e) {}
  }

  var params = new URLSearchParams(location.search);
  var utmSource = (params.get('utm_source') || '').trim();
  var utmCampaign = (params.get('utm_campaign') || '').trim();

  if (utmSource) storageSet('utm_src', utmSource);

  if (!storageGet(LANDING_FLAG)) {
    var refHost = '';
    try {
      if (document.referrer) refHost = new URL(document.referrer).hostname;
    } catch (e) {}
    send('landing', {
      src: clip(utmSource || refHost || 'none'),
      campaign: clip(utmCampaign || 'none')
    });
    storageSet(LANDING_FLAG, '1');
  }

  document.addEventListener('click', function (event) {
    var node = event.target;
    if (node && node.nodeType !== 1) node = node.parentElement;
    var link = node && node.closest && node.closest('a');
    if (!link || !link.href) return;
    var host = '';
    try { host = new URL(link.href, location.href).hostname; } catch (e) { return; }
    if (!host || host === location.hostname) return;
    send('cta_click', {
      dest: clip(host),
      src: clip(storageGet('utm_src') || 'none')
    });
  }, true);
})();
