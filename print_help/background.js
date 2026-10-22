/* ---------- منوی راست‌کلیک «همیار کافینت → ویرایش عکس» ---------- */
addNetcofeContextMenu(
    {
        id: 'rph-edit-image',
        title: 'ویرایش عکس ✏️',
        contexts: ['image']
    },
    (info, tab) => {
        if (!tab || tab.id == null) return;
        if (!info.srcUrl) return;

        chrome.tabs.sendMessage(
            tab.id,
            { action: 'rph-open-editor-for-image', srcUrl: info.srcUrl }
        ).catch(err => {
            console.warn('[RPH-BG] tab message failed:', err && err.message);
        });
    }
);

/* ---------- blob → dataURL ---------- */
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}

/* ---------- پیام‌های محتوا ---------- */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    /* (الف) دانلود مستقیم بدون دیالوگ */
    if (request && request.action === 'rph-download') {
        let safeName = String(request.filename || 'photo.jpg')
            .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_');

        chrome.downloads.download(
            {
                url: request.dataUrl,
                filename: safeName,
                saveAs: false,
                conflictAction: 'uniquify'
            },
            (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error('[RPH-BG] download failed:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    console.log('[RPH-BG] download started, id =', downloadId, 'name =', safeName);
                    sendResponse({ success: true, downloadId });
                }
            }
        );
        return true;
    }

    /* (ب) fetch تصویر از سمت extension (برای دور زدن CORS) */
    if (request && request.action === 'rph-fetch-image') {
        (async () => {
            try {
                const res = await fetch(request.url, { credentials: 'include' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const blob = await res.blob();
                const dataUrl = await blobToDataURL(blob);
                sendResponse({ success: true, dataUrl, mime: blob.type, size: blob.size });
            } catch (e) {
                console.warn('[RPH-BG] fetch image failed:', e && e.message);
                sendResponse({ success: false, error: String(e && e.message || e) });
            }
        })();
        return true;
    }
});