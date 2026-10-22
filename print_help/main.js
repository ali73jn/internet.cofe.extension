// این فایل در main world اجرا میشه — همون جایی که خود روبیکا هست
// پس blob URLهایی که روبیکا ساخته، از اینجا کامل قابل fetch هستن

(() => {
  if (window.__rphMainReady) return;
  window.__rphMainReady = true;

  const DEBUG_PREFIX = '[RPH-MAIN]';

  window.addEventListener('message', async (e) => {
    if (e.source !== window) return;
    if (!e.data || e.data.type !== 'rph-fetch-request') return;

    const { id, url } = e.data;

    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const blob = await res.blob();

      console.log(`${DEBUG_PREFIX} fetched ok: ${blob.size} bytes, type=${blob.type}`);

      window.postMessage({
        type: 'rph-fetch-response',
        id,
        blob,
        size: blob.size,
        mime: blob.type
      }, '*');
    } catch (err) {
      console.error(`${DEBUG_PREFIX} fetch failed:`, err);
      window.postMessage({
        type: 'rph-fetch-response',
        id,
        error: String(err && err.message || err)
      }, '*');
    }
  });

  console.log('%c[RPH-MAIN] ready', 'color:#00e676;font-weight:bold');
})();