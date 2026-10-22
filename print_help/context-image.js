(() => {
  'use strict';

  // فقط یک بار در هر صفحه
  if (window.__rphContextImageReady) return;
  window.__rphContextImageReady = true;

  function blobToDataURL(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }

  function fetchViaBackground(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'rph-fetch-image', url },
        (resp) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!resp || !resp.success) {
            return reject(new Error(resp && resp.error || 'bg fetch failed'));
          }
          resolve(resp.dataUrl);
        }
      );
    });
  }

  function guessFilename(url) {
    try {
      const u = new URL(url, location.href);
      const last = (u.pathname.split('/').filter(Boolean).pop() || '');
      if (/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(last)) {
        return last.slice(0, 60).replace(/jpeg/i, 'jpg');
      }
    } catch (_) {}
    return 'photo-' + Date.now() + '.jpg';
  }

  // خروجی: یکی از {blob} یا {dataUrl} یا {url} (به ترتیب اولویت)
  async function getImageSource(srcUrl) {
    // ۱) fetch مستقیم از context صفحه (برای blob:, data:, same-origin, CORS)
    try {
      const res = await fetch(srcUrl, { credentials: 'include' });
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 0) {
          return { blob };
        }
      }
    } catch (e) {
      console.warn('[RPH-Ctx] direct fetch failed:', e && e.message);
    }
    // ۲) fetch از background (host_permissions)
    try {
      const dataUrl = await fetchViaBackground(srcUrl);
      if (dataUrl) return { dataUrl };
    } catch (e) {
      console.warn('[RPH-Ctx] background fetch failed:', e && e.message);
    }
    // ۳) آخرین تلاش: URL را پاس بده، شاید editor خودش بتواند باز کند
    return { url: srcUrl };
  }

  function openEditorWithImage(source, filename) {
    document.getElementById('rph-editor-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'rph-editor-overlay';

    const iframe = document.createElement('iframe');
    iframe.id = 'rph-editor-frame';
    iframe.src = chrome.runtime.getURL('print_help/editor.html');
    iframe.setAttribute('allow', 'clipboard-write');

    overlay.appendChild(iframe);
    document.body.appendChild(overlay);

    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      try {
        iframe.contentWindow.postMessage({
          type: 'rph-editor-load',
          items: [{
            blob:    source.blob    || null,
            dataUrl: source.dataUrl || null,
            url:     source.url     || null,
            filename
          }]
        }, '*');
      } catch (e) {
        console.error('[RPH-Ctx] postMessage failed:', e);
      }
    };

    const onMessage = (e) => {
      if (e.source !== iframe.contentWindow) return;
      const d = e.data;
      if (!d || !d.type) return;
      if (d.type === 'rph-editor-ready') {
        send();
      } else if (d.type === 'rph-editor-close') {
        overlay.remove();
        window.removeEventListener('message', onMessage);
      }
    };
    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', () => setTimeout(send, 400));

    const onKey = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        window.removeEventListener('message', onMessage);
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.action !== 'rph-open-editor-for-image') return;
    const srcUrl = msg.srcUrl;
    if (!srcUrl) {
      sendResponse({ success: false, error: 'no srcUrl' });
      return;
    }
    (async () => {
      try {
        const source = await getImageSource(srcUrl);
        openEditorWithImage(source, guessFilename(srcUrl));
        sendResponse({ success: true });
      } catch (e) {
        console.error('[RPH-Ctx] open editor failed:', e);
        sendResponse({ success: false, error: String(e && e.message || e) });
      }
    })();
    return true; // پاسخ async
  });

  console.log('%c[RPH-Ctx] context-image ready', 'color:#10b981;font-weight:bold');
})();