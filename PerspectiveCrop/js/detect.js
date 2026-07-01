/**
 * detect.js - OpenCV.js auto corner detection
 */

class DetectManager {
    constructor(canvasManager, handlesManager, historyManager) {
        this.canvasManager = canvasManager;
        this.handlesManager = handlesManager;
        this.historyManager = historyManager;
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loadingText = document.getElementById('loading-text');
    }

    isOpenCVReady() { return typeof cv !== 'undefined' && cv.Mat; }

    _showLoading(text = 'در حال تشخیص گوشه‌ها...') {
        if (this.loadingText) this.loadingText.textContent = text;
        if (this.loadingOverlay) this.loadingOverlay.classList.remove('hidden');
    }
    _hideLoading() { if (this.loadingOverlay) this.loadingOverlay.classList.add('hidden'); }

    async detectCorners() {
        const cm = this.canvasManager;
        if (!cm.hasImage()) return;

        if (!this.isOpenCVReady()) {
            this._showError('OpenCV.js بارگذاری نشده است. تشخیص خودکار به OpenCV نیاز دارد.');
            return;
        }

        this._showLoading('در حال تشخیص لبه‌های سند...');

        try {
            const scale = Math.min(1, 800 / Math.max(cm.imageSize.width, cm.imageSize.height));
            const corners = await this._detectWithOpenCV(scale);

            if (corners) {
                const scaled = corners.map(c => ({ x: c.x / scale, y: c.y / scale }));
                this.handlesManager.setCorners(scaled);
                if (this.historyManager) this.historyManager.saveState();
                window.dispatchEvent(new CustomEvent('render:required'));
            } else {
                this._showError('گوشه‌های سند شناسایی نشد. لطفاً تصویر واضح‌تری با لبه‌های مشخص استفاده کنید.');
            }
        } catch (err) {
            console.error('Detection failed:', err);
            this._showError('خطا در تشخیص: ' + err.message);
        } finally {
            this._hideLoading();
        }
    }

    async _detectWithOpenCV(scale) {
        return new Promise((resolve, reject) => {
            try {
                const cm = this.canvasManager;

                const procCanvas = document.createElement('canvas');
                const pw = Math.round(cm.imageSize.width * scale);
                const ph = Math.round(cm.imageSize.height * scale);
                procCanvas.width = pw;
                procCanvas.height = ph;
                const procCtx = procCanvas.getContext('2d');
                procCtx.drawImage(cm.image, 0, 0, pw, ph);

                let src = cv.imread(procCanvas);
                let gray = new cv.Mat();
                let blur = new cv.Mat();
                let edges = new cv.Mat();
                let contours = new cv.MatVector();
                let hierarchy = new cv.Mat();

                cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
                let ksize = new cv.Size(5, 5);
                cv.GaussianBlur(gray, blur, ksize, 0);
                cv.Canny(blur, edges, 50, 150);

                let kernel = cv.Mat.ones(3, 3, cv.CV_8U);
                cv.dilate(edges, edges, kernel);
                cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

                let bestContour = null;
                let bestArea = 0;
                const minArea = (pw * ph) * 0.05;
                const maxArea = (pw * ph) * 0.98;

                for (let i = 0; i < contours.size(); i++) {
                    const contour = contours.get(i);
                    const area = cv.contourArea(contour);
                    if (area < minArea || area > maxArea) continue;

                    const peri = cv.arcLength(contour, true);
                    const approx = new cv.Mat();
                    cv.approxPolyDP(contour, approx, 0.02 * peri, true);

                    if (approx.rows === 4 && area > bestArea) {
                        bestArea = area;
                        if (bestContour) bestContour.delete();
                        bestContour = approx;
                    } else {
                        approx.delete();
                    }
                }

                if (bestContour && bestContour.rows === 4) {
                    const points = [];
                    for (let i = 0; i < 4; i++) {
                        points.push({ x: bestContour.data32S[i * 2], y: bestContour.data32S[i * 2 + 1] });
                    }
                    const ordered = Utils.orderCorners(points);

                    src.delete(); gray.delete(); blur.delete(); edges.delete();
                    kernel.delete(); contours.delete(); hierarchy.delete(); bestContour.delete();
                    resolve(ordered);
                } else {
                    src.delete(); gray.delete(); blur.delete(); edges.delete();
                    kernel.delete(); contours.delete(); hierarchy.delete();
                    if (bestContour) bestContour.delete();
                    resolve(null);
                }
            } catch (err) { reject(err); }
        });
    }

    _showError(message) {
        const t = document.createElement('div');
        t.className = 'toast-error';
        t.textContent = message;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }
}

window.DetectManager = DetectManager;