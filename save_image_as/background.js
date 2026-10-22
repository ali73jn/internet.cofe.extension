/* ---------- منوی "همیار کافینت → 💛 ذخیره تصویر با فرمت" ---------- */
const FORMATS = ["PNG", "JPG", "WEBP", "PDF"];

function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('chrome-extension://')
  );
}

async function ensureContentInjected(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Boolean(window.__sait_ready),
    });
    if (result) return true;
  } catch (e) {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'save_image_as/libs/jspdf.umd.min.js',
        'save_image_as/content.js'
      ],
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function safeSendMessage(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, payload);
    return true;
  } catch (err) {
    const injected = await ensureContentInjected(tabId);
    if (!injected) return false;
    try {
      await chrome.tabs.sendMessage(tabId, payload);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

// 🟡 والد زیرمنو (خودش کاری نمی‌کنه)
addNetcofeContextMenu(
  {
    id: 'saveImageAs',
    title: 'ذخیره تصویر با فرمت 💛',
    contexts: ['image']
  },
  null
);

// 🟢 آیتم‌های زیرمنو
for (const format of FORMATS) {
  addNetcofeContextMenu(
    {
      id: 'saveAs' + format,
      parentId: 'saveImageAs',
      title: format,
      contexts: ['image']
    },
    async (info, tab) => {
      if (!info.srcUrl || !String(info.menuItemId).startsWith('saveAs')) return;
      const pageUrl = info.pageUrl || (tab && tab.url) || '';
      if (isRestrictedUrl(pageUrl)) return;
      const formatId = String(info.menuItemId).replace('saveAs', '');
      await safeSendMessage(tab.id, {
        action: 'saveAs' + formatId,
        imageUrl: info.srcUrl,
        pageUrl,
      });
    }
  );
}

/* ---------- دانلود فایل آماده‌شده ---------- */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || request.action !== 'downloadPreparedFile') return;

  chrome.downloads.download(
    {
      url: request.dataUrl,
      filename: request.filename,
      saveAs: false,
      conflictAction: 'uniquify',
    },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message || 'download failed' });
        return;
      }
      sendResponse({ success: true, downloadId });
    }
  );
  return true;
});