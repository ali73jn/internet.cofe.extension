/**
 * export.js - PNG/JPG export with quality, scale, and real file size display
 */

class ExportManager {
    constructor(canvasManager, viewport, handlesManager, historyManager) {
        this.canvasManager = canvasManager;
        this.viewport = viewport;
        this.handlesManager = handlesManager;
        this.historyManager = historyManager;

        this.formatSelect = document.getElementById('export-format');
        this.qualitySlider = document.getElementById('export-quality');
        this.qualityValue = document.getElementById('quality-value');
        this.scaleSlider = document.getElementById('export-scale');
        this.scaleValue = document.getElementById('scale-value');
        this.exportInfo = document.getElementById('export-info');

        this._updateInfoDebounced = Utils.debounce(() => this._updateInfo(), 300);

        this._bindEvents();
        this._updateInfo();

        window.addEventListener('image:loaded', () => this._updateInfoDebounced());
        window.addEventListener('history:restored', () => this._updateInfoDebounced());
        window.addEventListener('render:required', () => this._updateInfoDebounced());
    }

    _bindEvents() {
        this.formatSelect.addEventListener('change', () => this._updateInfoDebounced());
        this.qualitySlider.addEventListener('input', () => {
            this.qualityValue.textContent = this.qualitySlider.value + '٪';
            this._updateInfoDebounced();
        });
        this.scaleSlider.addEventListener('input', () => {
            this.scaleValue.textContent = this.scaleSlider.value + '٪';
            this._updateInfoDebounced();
        });

        document.getElementById('btn-export-save').addEventListener('click', () => this.exportImage());
    }

    _updateInfo() {
        const cm = this.canvasManager;
        if (!cm.hasImage()) {
            this.exportInfo.innerHTML = '📂 تصویری بارگذاری نشده است.';
            return;
        }

        if (!window.app || !window.app.cropManager) {
            this.exportInfo.innerHTML = '⏳ در حال آماده‌سازی...';
            return;
        }

        const croppedCanvas = window.app.cropManager.getCroppedImage();
        if (!croppedCanvas) {
            this.exportInfo.innerHTML = '⚠️ برش نامعتبر. لطفاً نقاط را تنظیم کنید.';
            return;
        }

        const format = this.formatSelect.value;
        const quality = parseInt(this.qualitySlider.value) / 100;
        const scale = parseInt(this.scaleSlider.value) / 100;
        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';

        // ابعاد نهایی با اعمال مقیاس
        const w = Math.round(croppedCanvas.width * scale);
        const h = Math.round(croppedCanvas.height * scale);

        // نمایش ابعاد و کیفیت به صورت پیش‌فرض (تا زمانی که حجم واقعی محاسبه شود)
        this.exportInfo.innerHTML = `
            <span>📐 رزولوشن: <strong>${w}×${h}</strong></span>
            <span style="margin-right:12px;">🎨 کیفیت: <strong>${Math.round(quality * 100)}٪</strong></span>
            <span style="margin-right:12px;">⏳ در حال محاسبه حجم...</span>
        `;

        // تولید بلاک واقعی برای محاسبه حجم
        let outputCanvas = croppedCanvas;
        if (scale < 1) {
            const scaledCanvas = document.createElement('canvas');
            scaledCanvas.width = w;
            scaledCanvas.height = h;
            const ctx = scaledCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(croppedCanvas, 0, 0, w, h);
            outputCanvas = scaledCanvas;
        }

        try {
            outputCanvas.toBlob((blob) => {
                if (!blob) {
                    this.exportInfo.innerHTML = `
                        <span>📐 رزولوشن: <strong>${w}×${h}</strong></span>
                        <span style="margin-right:12px;">🎨 کیفیت: <strong>${Math.round(quality * 100)}٪</strong></span>
                        <span style="margin-right:12px;">❌ خطا در محاسبه حجم</span>
                    `;
                    return;
                }

                const sizeInBytes = blob.size;
                let sizeText;
                if (sizeInBytes < 1024) {
                    sizeText = sizeInBytes + ' بایت';
                } else if (sizeInBytes < 1024 * 1024) {
                    sizeText = (sizeInBytes / 1024).toFixed(1) + ' کیلوبایت';
                } else {
                    sizeText = (sizeInBytes / (1024 * 1024)).toFixed(2) + ' مگابایت';
                }

                this.exportInfo.innerHTML = `
                    <span>📐 رزولوشن: <strong>${w}×${h}</strong></span>
                    <span style="margin-right:12px;">🎨 کیفیت: <strong>${Math.round(quality * 100)}٪</strong></span>
                    <span style="margin-right:12px;">💾 حجم واقعی: <strong>${sizeText}</strong></span>
                `;
            }, mimeType, quality);
        } catch (err) {
            console.warn('خطا در محاسبه حجم:', err);
            this.exportInfo.innerHTML = `
                <span>📐 رزولوشن: <strong>${w}×${h}</strong></span>
                <span style="margin-right:12px;">🎨 کیفیت: <strong>${Math.round(quality * 100)}٪</strong></span>
                <span style="margin-right:12px;">❌ خطا در محاسبه حجم</span>
            `;
        }
    }

    exportImage() {
        const cm = this.canvasManager;
        if (!cm.hasImage()) {
            this._showError('هیچ تصویری بارگذاری نشده است.');
            return;
        }

        if (!window.app || !window.app.cropManager) {
            this._showError('خطا در سیستم برش.');
            return;
        }

        const croppedCanvas = window.app.cropManager.getCroppedImage();
        if (!croppedCanvas) {
            this._showError('برش معتبر نیست. لطفاً نقاط را به درستی تنظیم کنید.');
            return;
        }

        const scale = parseInt(this.scaleSlider.value) / 100;
        let outputCanvas = croppedCanvas;

        if (scale < 1) {
            const newW = Math.round(croppedCanvas.width * scale);
            const newH = Math.round(croppedCanvas.height * scale);
            const scaledCanvas = document.createElement('canvas');
            scaledCanvas.width = newW;
            scaledCanvas.height = newH;
            const ctx = scaledCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(croppedCanvas, 0, 0, newW, newH);
            outputCanvas = scaledCanvas;
        }

        const format = this.formatSelect.value;
        const quality = parseInt(this.qualitySlider.value) / 100;
        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const ext = format === 'jpeg' ? 'jpg' : 'png';

        try {
            outputCanvas.toBlob((blob) => {
                if (!blob) {
                    this._showError('خطا در ایجاد فایل خروجی.');
                    return;
                }
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `cropped.${ext}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, mimeType, quality);
        } catch (err) {
            this._showError('خطا: ' + err.message);
        }
    }

    // ==========================================
    // Rotate & Flip
    // ==========================================

    rotate(direction) {
        const cm = this.canvasManager;
        if (!cm.hasImage()) return;

        const oldW = cm.imageSize.width;
        const oldH = cm.imageSize.height;

        const rotCanvas = document.createElement('canvas');
        rotCanvas.width = oldH;
        rotCanvas.height = oldW;
        const rCtx = rotCanvas.getContext('2d');

        rCtx.save();
        if (direction === 1) { rCtx.translate(oldH, 0); rCtx.rotate(Math.PI / 2); }
        else { rCtx.translate(0, oldW); rCtx.rotate(-Math.PI / 2); }
        rCtx.drawImage(cm.image, 0, 0);
        rCtx.restore();

        cm.setImage(rotCanvas);

        const newCorners = this._rotateCorners(this.handlesManager.getCorners(), direction, oldW, oldH);
        this.handlesManager.setCorners(newCorners);

        if (this.historyManager) this.historyManager.saveState();
        this.viewport.fitToScreen();

        window.dispatchEvent(new CustomEvent('image:loaded', {
            detail: { width: rotCanvas.width, height: rotCanvas.height, name: 'تصویر چرخیده' }
        }));
        window.dispatchEvent(new CustomEvent('render:required'));
    }

    _rotateCorners(corners, direction, oldW, oldH) {
        if (direction === 1) return corners.map(c => ({ x: oldH - c.y, y: c.x }));
        else return corners.map(c => ({ x: c.y, y: oldW - c.x }));
    }

    flip(axis) {
        const cm = this.canvasManager;
        if (!cm.hasImage()) return;

        const w = cm.imageSize.width, h = cm.imageSize.height;

        const flipCanvas = document.createElement('canvas');
        flipCanvas.width = w;
        flipCanvas.height = h;
        const fCtx = flipCanvas.getContext('2d');

        fCtx.save();
        if (axis === 'horizontal') { fCtx.translate(w, 0); fCtx.scale(-1, 1); }
        else { fCtx.translate(0, h); fCtx.scale(1, -1); }
        fCtx.drawImage(cm.image, 0, 0);
        fCtx.restore();

        cm.setImage(flipCanvas);

        const newCorners = this._flipCorners(this.handlesManager.getCorners(), axis, w, h);
        this.handlesManager.setCorners(newCorners);

        if (this.historyManager) this.historyManager.saveState();
        this.viewport.fitToScreen();

        window.dispatchEvent(new CustomEvent('image:loaded', {
            detail: { width: w, height: h, name: 'تصویر آینه‌ای' }
        }));
        window.dispatchEvent(new CustomEvent('render:required'));
    }

    _flipCorners(corners, axis, w, h) {
        if (axis === 'horizontal') return corners.map(c => ({ x: w - c.x, y: c.y }));
        else return corners.map(c => ({ x: c.x, y: h - c.y }));
    }

    _showError(message) {
        const t = document.createElement('div');
        t.className = 'toast-error';
        t.textContent = message;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }
}

window.ExportManager = ExportManager;