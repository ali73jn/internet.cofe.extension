(() => {
    'use strict';

    if (window.__rubikaPrintHelper) {
        window.__rubikaPrintHelper.stop();
    }

    const BAR_ID = 'rubika-print-action-bar';
    const selectedPhotos = new Set();
    const MIN_REAL = 300;

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // ---------- سلکتورها بر اساس دامنه ----------
    const SELECTORS = {
        'web.rubika.ir': {
            bubble: '.bubble.photo',
            media: '.media-container',
            img: 'img.media-photo',
            modalImg: 'img.photo_modal_image'
        },
		'web.eitaa.com': {
			bubble: '.bubble.photo:not(:has(.album-item)), .album-item',
			media: '.media-container',
			img: 'img.media-photo',
			modalImg: 'img.photo_modal_image'
		},
        'web.shad.ir': {
            bubble: '.bubble.photo',
            media: '.media-container',
            img: 'img.media-photo',
            modalImg: 'img.photo_modal_image'
        },
        'shadweb.iranlms.ir': {
            bubble: '.bubble.photo',
            media: '.media-container',
            img: 'img.media-photo',
            modalImg: 'img.photo_modal_image'
        },
		'web.bale.ai': {
			bubble: '[data-sentry-component="PhotoFC"], [data-sentry-component="AlbumMediaFC"]',
			media:  '[data-sentry-component="PhotoFC"] > div:first-child, ' +
					'[data-sentry-component="AlbumMediaFC"] > div:first-child',
			img:    'img[data-testid="original-photo"]',
			modalImg: 'img[data-testid="original-photo"]'
		}
    };

    const SEL = SELECTORS[location.hostname] || SELECTORS['web.rubika.ir'];
    console.log('[RPH] hostname:', location.hostname, '| selectors:', SEL);

    // ---------- RTL برای ایتا و بله ----------
    const RTL_HOSTS = ['web.eitaa.com', 'web.bale.ai'];
    const USE_RTL = RTL_HOSTS.includes(location.hostname);

    // ---------- ارتباط با main world ----------
    let __reqCounter = 0;
    const __pendingReqs = new Map();

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        if (!e.data || e.data.type !== 'rph-fetch-response') return;
        const { id, blob, error, size, mime } = e.data;
        const pending = __pendingReqs.get(id);
        if (!pending) return;
        __pendingReqs.delete(id);
        clearTimeout(pending.timer);
        if (error) pending.reject(new Error(error));
        else pending.resolve({ blob, size, mime });
    });

    function fetchViaMainWorld(url, timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            const id = 'rph-' + (++__reqCounter) + '-' + Date.now();
            const timer = setTimeout(() => {
                __pendingReqs.delete(id);
                reject(new Error('main world timeout'));
            }, timeoutMs);
            __pendingReqs.set(id, { resolve, reject, timer });
            window.postMessage({ type: 'rph-fetch-request', id, url }, '*');
        });
    }

    // ---------- helpers ----------
    function getImgElement(photo) {
        const img = photo.querySelector(SEL.img);
        if (img) return img;
        return photo.querySelector('img');
    }

    function getMediaElement(photo) {
        return photo.querySelector(SEL.media)
            || getImgElement(photo)?.parentElement
            || photo;
    }

    function guessName(url, index) {
        try {
            const u = new URL(url, location.href);
            const last = (u.pathname.split('/').filter(Boolean).pop() || '');
            const m = last.match(/^(.+?)\.(jpe?g|png|gif|webp|bmp|avif)$/i);
            if (m) return m[1].slice(0, 60) + '.' + m[2].toLowerCase().replace('jpeg', 'jpg');
        } catch (_) {}
        return `photo-${Date.now()}-${String(index).padStart(2, '0')}.jpg`;
    }

    function blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    // ⭐ دانلود از طریق chrome.downloads — دور زدن محدودیت مرورگر
function extFromMime(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('png')) return 'png';
    if (m.includes('webp')) return 'webp';
    if (m.includes('gif')) return 'gif';
    if (m.includes('bmp')) return 'bmp';
    if (m.includes('avif')) return 'avif';
    if (m.includes('svg')) return 'svg';
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    return 'jpg'; // پیش‌فرض
}

function sanitizeBase(name) {
    return String(name || '')
        .replace(/\.[^.]+$/, '')                 // پسوند قبلی رو پاک کن
        .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_') // کاراکترهای غیرمجاز
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
}

async function downloadBlob(blob, filename) {
    // ⭐ اطمینان از MIME معتبر
    let mime = String((blob && blob.type) || '').toLowerCase().trim();
    if (!mime || !mime.startsWith('image/')) {
        mime = 'image/jpeg';
        blob = new Blob([blob], { type: mime });
    }

    // ⭐ پسوند رو از MIME بگیر و اسم فایل رو باهاش هماهنگ کن
    const ext = extFromMime(mime);
    const base = sanitizeBase(filename) || `photo-${Date.now()}`;
    const finalName = `${base}.${ext}`;

    try {
        const dataUrl = await blobToDataURL(blob);
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { action: 'rph-download', dataUrl, filename: finalName },
                (resp) => {
                    if (chrome.runtime.lastError) {
                        resolve({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        resolve(resp || { success: false, error: 'no response' });
                    }
                }
            );
        });
        if (!response.success) throw new Error(response.error || 'download failed');
        return true;
    } catch (e) {
        console.warn('[RPH] chrome.downloads failed, fallback:', e);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = finalName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
        return false;
    }
}

    function triggerDownloadLink(href, filename) {
        const a = document.createElement('a');
        a.href = href;
        a.download = filename;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    async function waitFor(getter, timeoutMs, label) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const value = getter();
            if (value) return value;
            await sleep(150);
        }
        console.warn('[RPH] timeout waiting for:', label);
        return null;
    }

    // ---------- گرفتن عکس با کیفیت اصلی ----------
    async function captureImage(photo, index) {
        let img = getImgElement(photo);
        if (!img) return null;

        if (!img.complete || Math.max(img.naturalWidth, img.naturalHeight) < MIN_REAL) {
            img.scrollIntoView({ block: 'center', behavior: 'instant' });
            const start = Date.now();
            while (Date.now() - start < 4000) {
                if (img.complete && Math.max(img.naturalWidth, img.naturalHeight) >= MIN_REAL) break;
                await sleep(120);
            }
        }

        console.log('[RPH] capture start:', img.naturalWidth, 'x', img.naturalHeight);

        let usedLightbox = false;
        if (Math.max(img.naturalWidth, img.naturalHeight) < 800) {
            img.click();

            const modalImg = await waitFor(
                () => document.querySelector(SEL.modalImg),
                5000,
                'modal image'
            );

            if (modalImg && modalImg !== img) {
                await waitFor(
                    () => (modalImg.complete && modalImg.naturalWidth > MIN_REAL ? modalImg : null),
                    8000,
                    'modal full load'
                );
                if (modalImg.naturalWidth > img.naturalWidth) {
                    img = modalImg;
                    usedLightbox = true;
                }
            }
        }

        const src = img.currentSrc || img.src;
        if (!src) return null;

        let blob = null;
        try {
            const res = await fetchViaMainWorld(src);
            blob = res.blob;
            console.log('[RPH] blob size =', res.size, 'bytes');
        } catch (e) {
            console.warn('[RPH] main world fetch failed:', e);
        }

        if (usedLightbox) {
            await sleep(200);
            const closeBtn = document.querySelector('.photo-modal .close, .photo-modal [class*="close"], .modal-close');
            if (closeBtn) closeBtn.click();
            else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, keyCode: 27 }));
            await sleep(300);
        }

        if (!blob) {
            return { url: src, filename: guessName(src, index) };
        }

        return { blob, filename: guessName(src, index) };
    }

    // ---------- پرینت ----------
    const PRINT_CSS = `
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;background:#fff}
        img{display:block;margin:0 auto;max-width:100%;max-height:100vh;
            page-break-after:always;break-after:page}
        img:last-child{page-break-after:auto;break-after:auto}
        @page{margin:8mm}
    `;

    function printImages(urls) {
        if (!urls.length) return;

        const iframe = document.createElement('iframe');
        iframe.style.cssText =
            'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
        document.body.appendChild(iframe);

        const doc = iframe.contentDocument;
        doc.open();
        doc.write(
            '<!doctype html><html><head><meta charset="utf-8"><title>Print</title>' +
            '<style>' + PRINT_CSS + '</style></head><body>' +
            urls.map(u => `<img src="${String(u).replace(/"/g, '&quot;')}">`).join('') +
            '</body></html>'
        );
        doc.close();

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            setTimeout(() => iframe.remove(), 500);
        };
        iframe.contentWindow.addEventListener('afterprint', cleanup);
        setTimeout(cleanup, 60000);

        const imgs = [...doc.images];
        let loaded = 0;
        const fire = () => {
            if (++loaded < imgs.length) return;
            setTimeout(() => {
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                } catch (e) { console.error(e); }
            }, 150);
        };

        if (!imgs.length) { fire(); return; }
        imgs.forEach(im => {
            if (im.complete) fire();
            else {
                im.addEventListener('load', fire, { once: true });
                im.addEventListener('error', fire, { once: true });
            }
        });
    }

    // ---------- نوار ابزار ----------
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.innerHTML = `
        <span class="rp-count">0 selected</span>
        <button type="button" class="ghost rp-all">Select all</button>
        <button type="button" class="rp-edit">✏ Edit</button>
        <button type="button" class="primary rp-print">🖨 Print</button>
        <button type="button" class="rp-download">⬇ Download</button>
        <button type="button" class="ghost rp-clear">✕</button>
    `;
    document.body.appendChild(bar);

    const countEl = bar.querySelector('.rp-count');
    const allBtn = bar.querySelector('.rp-all');
    const printBtn = bar.querySelector('.rp-print');
    const downloadBtn = bar.querySelector('.rp-download');
    const clearBtn = bar.querySelector('.rp-clear');
	const editBtn = bar.querySelector('.rp-edit');

    function updateBar() {
        for (const p of [...selectedPhotos]) {
            if (!document.contains(p)) selectedPhotos.delete(p);
        }
        const n = selectedPhotos.size;
        countEl.textContent = `${n} selected`;
        bar.classList.toggle('visible', n > 0);
        printBtn.disabled = n === 0;
        downloadBtn.disabled = n === 0;
        editBtn.disabled = n === 0;   // ← این خط
    }

    function clearSelection() {
        selectedPhotos.clear();
        document.querySelectorAll('.my-rubika-print-controls .my-select-btn.selected')
            .forEach(b => {
                b.classList.remove('selected');
                b.title = 'Select';
            });
        updateBar();
    }

    clearBtn.addEventListener('click', clearSelection);

    allBtn.addEventListener('click', () => {
        document.querySelectorAll(SEL.bubble).forEach(p => {
            if (!getImgElement(p)) return;
            selectedPhotos.add(p);
            addControls(p);
        });
        document.querySelectorAll('.my-rubika-print-controls .my-select-btn')
            .forEach(b => {
                b.classList.add('selected');
                b.title = 'Selected';
            });
        updateBar();
    });

    async function collectSelected(updateLabel) {
        const photos = [...document.querySelectorAll(SEL.bubble)]
            .filter(p => selectedPhotos.has(p));
        const captures = [];
        for (let i = 0; i < photos.length; i++) {
            if (updateLabel) updateLabel(`⏳ ${i + 1}/${photos.length}`);
            const cap = await captureImage(photos[i], i + 1);
            if (cap) captures.push(cap);
            await sleep(200);
        }
        return captures;
    }

    printBtn.addEventListener('click', async () => {
        printBtn.disabled = true;
        const original = printBtn.textContent;
        const created = [];
        try {
            const caps = await collectSelected(t => printBtn.textContent = t);
            const urls = caps.map(c => {
                if (c.blob) {
                    const u = URL.createObjectURL(c.blob);
                    created.push(u);
                    return u;
                }
                return c.url;
            });
            printImages(urls);
            setTimeout(() => created.forEach(u => URL.revokeObjectURL(u)), 60000);
        } finally {
            printBtn.textContent = original;
            printBtn.disabled = false;
        }
    });

    // ⭐ دانلود با chrome.downloads (بدون پرامپت، بدون محدودیت)
    downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        const original = downloadBtn.textContent;
        try {
            const caps = await collectSelected(t => downloadBtn.textContent = t);
            for (let i = 0; i < caps.length; i++) {
                downloadBtn.textContent = `⬇ ${i + 1}/${caps.length}`;
                const cap = caps[i];
                if (cap.blob) {
                    await downloadBlob(cap.blob, cap.filename);
                } else {
                    triggerDownloadLink(cap.url, cap.filename);
                }
                await sleep(150);
            }
        } finally {
            downloadBtn.textContent = original;
            downloadBtn.disabled = false;
        }
    });

    // ---------- باز کردن ویرایشگر در iframe ----------
    function openEditor(captures) {
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
        const sendImages = () => {
            if (sent) return;
            sent = true;
            const items = captures.map(c => ({
                blob: c.blob || null,
                url:  c.blob ? null : c.url,
                filename: c.filename
            }));
            try {
                iframe.contentWindow.postMessage(
                    { type: 'rph-editor-load', items },
                    '*'
                );
            } catch (e) {
                console.error('[RPH] postMessage to editor failed:', e);
            }
        };

        function onMessage(e) {
            if (e.source !== iframe.contentWindow) return;
            const d = e.data;
            if (!d || !d.type) return;
            if (d.type === 'rph-editor-ready') {
                sendImages();
            } else if (d.type === 'rph-editor-close') {
                overlay.remove();
                window.removeEventListener('message', onMessage);
            }
        }
        window.addEventListener('message', onMessage);

        // fallback در صورت نرسیدن ready
        iframe.addEventListener('load', () => setTimeout(sendImages, 400));

        // بستن با Escape هم ممکنه مفید باشه
        const onKey = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                window.removeEventListener('message', onMessage);
                window.removeEventListener('keydown', onKey);
            }
        };
        window.addEventListener('keydown', onKey);
    }

    editBtn.addEventListener('click', async () => {
        editBtn.disabled = true;
        const original = editBtn.textContent;
        try {
            const caps = await collectSelected(t => editBtn.textContent = t);
            if (caps.length) openEditor(caps);
        } finally {
            editBtn.textContent = original;
            editBtn.disabled = false;
        }
    });


    // ---------- دکمه‌های روی هر عکس ----------
    function addControls(photo) {
        if (!(photo instanceof HTMLElement)) return;
        if (!photo.matches(SEL.bubble)) return;
        if (photo.querySelector('.my-rubika-print-controls')) return;

        const media = getMediaElement(photo);
        if (!media) return;
        if (getComputedStyle(media).position === 'static') {
            media.style.position = 'relative';
        }

        const controls = document.createElement('div');
        controls.className = 'my-rubika-print-controls';
        // ⭐ RTL برای ایتا و بله
        if (USE_RTL) {
            controls.style.setProperty('flex-direction', 'row-reverse', 'important');
            controls.style.setProperty('left', '6px', 'important');
            controls.style.setProperty('right', 'auto', 'important');
        }

        const selectButton = document.createElement('button');
        selectButton.className = 'my-select-btn';
        selectButton.type = 'button';
        selectButton.title = 'Select';
        selectButton.textContent = '✓';

        const printButton = document.createElement('button');
        printButton.type = 'button';
        printButton.title = 'Print this image';
        printButton.textContent = '🖨';

        const downloadButton = document.createElement('button');
        downloadButton.type = 'button';
        downloadButton.title = 'Download this image';
        downloadButton.textContent = '⬇';

        controls.append(selectButton, printButton, downloadButton);

        const kill = (e) => { e.preventDefault(); e.stopPropagation(); };
        [selectButton, printButton, downloadButton].forEach(b => {
            b.addEventListener('pointerdown', kill);
            b.addEventListener('mousedown', kill);
            b.addEventListener('touchstart', kill, { passive: false });
        });

        selectButton.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (selectedPhotos.has(photo)) {
                selectedPhotos.delete(photo);
                selectButton.classList.remove('selected');
                selectButton.title = 'Select';
            } else {
                selectedPhotos.add(photo);
                selectButton.classList.add('selected');
                selectButton.title = 'Selected';
            }
            updateBar();
        });

        printButton.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            printButton.disabled = true;
            const created = [];
            try {
                const cap = await captureImage(photo, 1);
                if (!cap) return;
                const url = cap.blob ? URL.createObjectURL(cap.blob) : cap.url;
                if (cap.blob) created.push(url);
                printImages([url]);
                setTimeout(() => created.forEach(u => URL.revokeObjectURL(u)), 60000);
            } finally { printButton.disabled = false; }
        });

        downloadButton.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            downloadButton.disabled = true;
            try {
                const cap = await captureImage(photo, 1);
                if (!cap) return;
                if (cap.blob) await downloadBlob(cap.blob, cap.filename);
                else triggerDownloadLink(cap.url, cap.filename);
            } finally { downloadButton.disabled = false; }
        });

        media.appendChild(controls);

        if (selectedPhotos.has(photo)) {
            selectButton.classList.add('selected');
            selectButton.title = 'Selected';
        }
    }

    // ---------- اسکن ----------
    function scan() {
        document.querySelectorAll(SEL.bubble).forEach(addControls);
        updateBar();
    }

    let rafPending = false;
    const observer = new MutationObserver(() => {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; scan(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const interval = setInterval(scan, 1500);
    scan();

    window.__rubikaPrintHelper = {
        stop() {
            observer.disconnect();
            clearInterval(interval);
            document.querySelectorAll('.my-rubika-print-controls').forEach(el => el.remove());
            document.getElementById(BAR_ID)?.remove();
            selectedPhotos.clear();
            delete window.__rubikaPrintHelper;
            console.log('Rubika Print Helper stopped.');
        },
        selectAll: () => allBtn.click(),
        clear: () => clearSelection(),
    };

    console.log('%cRubika Print Helper v1.3 loaded.', 'color:#2196f3;font-weight:bold');
})();