(() => {
  if (window.__sait_ready) return;
  window.__sait_ready = true;

  function sanitizeFilename(name) {
    return (name || 'image')
      .replace(/[#%&{}\\<>*?/$!'\":@+`|=]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
  }

  function getFilenameBaseFromUrl(url) {
    try {
      const u = new URL(url);
      let base = u.pathname.split('/').pop() || 'image';
      base = base.split('?')[0].split('#')[0];
      base = decodeURIComponent(base);
      base = base.replace(/\.(png|jpe?g|webp|gif|svg|bmp|tiff?|avif|pdf)$/i, '');
      base = sanitizeFilename(base);
      return base || 'image';
    } catch {
      return 'image';
    }
  }

  function showLoader(text) {
    let loader = document.getElementById('__sait_loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = '__sait_loader';
      Object.assign(loader.style, {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.55)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        fontSize: '24px',
        fontFamily: 'Tahoma, Arial, sans-serif',
        direction: 'rtl',
      });
      document.body.appendChild(loader);
    }
    loader.innerText = text || 'در حال آماده‌سازی...';
  }

  function hideLoader() {
    const el = document.getElementById('__sait_loader');
    if (el) el.remove();
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  function canvasToBlob(canvas, mimeType) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('toBlob returned null'));
          resolve(blob);
        }, mimeType);
      } catch (e) {
        reject(e);
      }
    });
  }

  function makeCanvas(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return canvas;
  }

  async function preparePdfDataUrl(canvas) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF library is not available');
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [canvas.width, canvas.height],
    });
    const imgData = canvas.toDataURL('image/jpeg');
    pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
    return pdf.output('datauristring');
  }

  chrome.runtime.onMessage.addListener((message) => {
    const { action, imageUrl } = message || {};
    if (!action || !imageUrl) return;

    (async () => {
      showLoader('در حال آماده‌سازی...');
      try {
        const img = await loadImage(imageUrl);
        const canvas = makeCanvas(img);
        const base = getFilenameBaseFromUrl(imageUrl);

        let dataUrl;
        let filename;

        if (action === 'saveAsPDF') {
          dataUrl = await preparePdfDataUrl(canvas);
          filename = `${base}.pdf`;
        } else {
          let mimeType = 'image/png';
          let ext = 'png';
          if (action === 'saveAsJPG') {
            mimeType = 'image/jpeg';
            ext = 'jpg';
          } else if (action === 'saveAsWEBP') {
            mimeType = 'image/webp';
            ext = 'webp';
          }
          const blob = await canvasToBlob(canvas, mimeType);
          dataUrl = await blobToDataURL(blob);
          filename = `${base}.${ext}`;
        }

        chrome.runtime.sendMessage({
          action: 'downloadPreparedFile',
          dataUrl,
          filename,
        }, (response) => {
          hideLoader();
          if (chrome.runtime.lastError || !response?.success) {
            alert('ذخیره تصویر با فرمت: ذخیره‌سازی تصویر تبدیل‌شده انجام نشد.');
          }
        });
      } catch (e) {
        hideLoader();
        alert(
          'ذخیره تصویر با فرمت: تبدیل یا ذخیره‌سازی انجام نشد (معمولاً به دلیل محدودیت CORS).\n\nتصویر را در تب جدید باز کنید و به‌صورت دستی ذخیره کنید.'
        );
        window.open(imageUrl, '_blank', 'noopener,noreferrer');
      }
    })();
  });
})();