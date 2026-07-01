/**
 * ui.js - Toolbar, status bar, event bindings, and keyboard shortcuts
 */

class UIManager {
    constructor(app) {
        this.app = app;
        this.spaceDown = false;
        this.renderFrameId = null;
        this.renderRequested = false;

        this._bindToolbar();
        this._bindStatusBar();
        this._bindKeyboard();
        this._bindModals();

        window.addEventListener('render:required', () => this.requestRender());
        window.addEventListener('image:loaded', () => {
            this.requestRender();
        });

        this._startRenderLoop();
    }

    // ==========================================
    // Toolbar
    // ==========================================

    _bindToolbar() {
        // دکمه باز کردن
        document.getElementById('btn-open').addEventListener('click', () => {
            this.app.imageLoader.openFileDialog();
        });
        document.getElementById('btn-welcome-open').addEventListener('click', () => {
            this.app.imageLoader.openFileDialog();
        });

        // دکمه‌های دیگر
        document.getElementById('btn-undo').addEventListener('click', () => this.app.historyManager.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.app.historyManager.redo());

        document.getElementById('btn-rotate-cw').addEventListener('click', () => this.app.exportManager.rotate(1));
        document.getElementById('btn-rotate-ccw').addEventListener('click', () => this.app.exportManager.rotate(-1));
        document.getElementById('btn-flip-h').addEventListener('click', () => this.app.exportManager.flip('horizontal'));
        document.getElementById('btn-flip-v').addEventListener('click', () => this.app.exportManager.flip('vertical'));

        document.getElementById('btn-detect').addEventListener('click', () => this.app.detectManager.detectCorners());

        // ==========================================
        // دکمه نمایش نقاط (اصلاح‌شده)
        // ==========================================
        document.getElementById('btn-fit-corners').addEventListener('click', () => {
            const cm = this.app.canvasManager;
            if (!cm.hasImage()) {
                console.warn('تصویری بارگذاری نشده');
                return;
            }
            // استفاده از this.app.handles (نه handlesManager)
            const corners = this.app.handles.getCorners();
            if (corners && corners.length === 4) {
                this.app.viewport.fitToCorners(corners);
                this.requestRender();
            } else {
                console.warn('نقاط نامعتبر:', corners);
            }
        });

        document.getElementById('btn-fit').addEventListener('click', () => {
            this.app.viewport.fitToScreen();
            this.requestRender();
        });
        document.getElementById('btn-reset').addEventListener('click', () => {
            this.app.viewport.resetView();
            this.requestRender();
        });
        document.getElementById('btn-help').addEventListener('click', () => this._toggleModal('help-modal'));
    }

    // ==========================================
    // Status Bar
    // ==========================================

    _bindStatusBar() {
        const zoomDisplay = document.getElementById('zoom-display');
        const statusZoom = document.getElementById('status-zoom');

        window.addEventListener('viewport:zoomChange', (e) => {
            const text = e.detail.percent;
            zoomDisplay.textContent = this._toPersianNum(text);
            statusZoom.textContent = 'زوم: ' + this._toPersianNum(text);
        });

        window.addEventListener('image:loaded', (e) => {
            document.getElementById('status-image-size').textContent =
                `ابعاد: ${this._toPersianNum(e.detail.width)}×${this._toPersianNum(e.detail.height)}`;
            const p = this.app.viewport.getZoomPercent();
            zoomDisplay.textContent = this._toPersianNum(p);
            statusZoom.textContent = 'زوم: ' + this._toPersianNum(p);
        });

        window.addEventListener('history:restored', (e) => {
            document.getElementById('status-image-size').textContent =
                `ابعاد: ${this._toPersianNum(e.detail.width)}×${this._toPersianNum(e.detail.height)}`;
            const p = this.app.viewport.getZoomPercent();
            zoomDisplay.textContent = this._toPersianNum(p);
            statusZoom.textContent = 'زوم: ' + this._toPersianNum(p);
        });

        window.addEventListener('crop:dimensions', (e) => {
            document.getElementById('status-crop-size').textContent =
                `برش: ${this._toPersianNum(e.detail.width)}×${this._toPersianNum(e.detail.height)}`;
        });

        window.addEventListener('status:mouse', (e) => {
            document.getElementById('status-mouse').textContent =
                `موقعیت: ${this._toPersianNum(e.detail.x)}, ${this._toPersianNum(e.detail.y)}`;
        });
    }

    // ==========================================
    // Keyboard Shortcuts
    // ==========================================

    _bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

            const key = e.key.toLowerCase();
            const ctrl = e.ctrlKey || e.metaKey;
            const shift = e.shiftKey;

            if (key === ' ' && !ctrl && !shift) {
                e.preventDefault();
                if (!this.spaceDown) {
                    this.spaceDown = true;
                    this.app.viewport.setSpaceHeld(true);
                    this.app.canvasManager.canvas.classList.add('panning');
                }
                return;
            }
            if (ctrl && key === 'o') { e.preventDefault(); this.app.imageLoader.openFileDialog(); return; }
            if (ctrl && key === 's') { e.preventDefault(); if (this.app.canvasManager.hasImage()) document.getElementById('btn-export-save').click(); return; }
            if (ctrl && !shift && key === 'z') { e.preventDefault(); this.app.historyManager.undo(); return; }
            if ((ctrl && key === 'y') || (ctrl && shift && key === 'z')) { e.preventDefault(); this.app.historyManager.redo(); return; }

            if (key === 'r' && !ctrl) { e.preventDefault(); if (this.app.canvasManager.hasImage()) this.app.exportManager.rotate(shift ? -1 : 1); return; }
            if (key === 'h' && !ctrl) { e.preventDefault(); if (this.app.canvasManager.hasImage()) this.app.exportManager.flip('horizontal'); return; }
            if (key === 'v' && !ctrl) { e.preventDefault(); if (this.app.canvasManager.hasImage()) this.app.exportManager.flip('vertical'); return; }
            if (key === 'd' && !ctrl) { e.preventDefault(); this.app.detectManager.detectCorners(); return; }
            if (key === 'f' && !ctrl) { e.preventDefault(); this.app.viewport.fitToScreen(); this.requestRender(); return; }
            if (key === '0' && !ctrl) { e.preventDefault(); this.app.viewport.resetView(); this.requestRender(); return; }

            if ((key === '+' || key === '=') && !ctrl) {
                e.preventDefault();
                const c = this.app.canvasManager;
                this.app.viewport.zoomIn(c.logicalWidth / 2, c.logicalHeight / 2);
                this.requestRender(); return;
            }
            if (key === '-' && !ctrl) {
                e.preventDefault();
                const c = this.app.canvasManager;
                this.app.viewport.zoomOut(c.logicalWidth / 2, c.logicalHeight / 2);
                this.requestRender(); return;
            }

            if (key === 'escape') { e.preventDefault(); this._closeAllModals(); return; }
            if (key === '?' || (shift && key === '/')) { e.preventDefault(); this._toggleModal('help-modal'); return; }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === ' ') {
                this.spaceDown = false;
                this.app.viewport.setSpaceHeld(false);
                this.app.viewport.endPan();
                this.app.canvasManager.canvas.classList.remove('panning');
                this.app.canvasManager.canvas.classList.remove('panning-active');
            }
        });
    }

    // ==========================================
    // Modals
    // ==========================================

    _bindModals() {
        document.getElementById('btn-help-close').addEventListener('click', () => this._closeAllModals());

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
        });
    }

    _toggleModal(id) {
        const m = document.getElementById(id);
        if (m.classList.contains('hidden')) { this._closeAllModals(); m.classList.remove('hidden'); }
        else m.classList.add('hidden');
    }

    _closeAllModals() {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    }

    // ==========================================
    // Render Loop
    // ==========================================

    requestRender() { this.renderRequested = true; }

    _startRenderLoop() {
        const loop = () => {
            if (this.renderRequested || this.app.handles.isDragging) {
                this.app.render();
                this.renderRequested = false;
            }
            this.renderFrameId = requestAnimationFrame(loop);
        };
        this.renderFrameId = requestAnimationFrame(loop);
    }

    updateOpenCVStatus(status) {
        const dot = document.getElementById('opencv-indicator');
        const item = document.getElementById('status-opencv');
        dot.className = 'indicator-dot';
        if (status === 'ready') { dot.classList.add('ready'); item.lastChild.textContent = 'OpenCV: آماده'; }
        else if (status === 'error') { dot.classList.add('error'); item.lastChild.textContent = 'OpenCV: خطا'; }
        else { item.lastChild.textContent = 'OpenCV: در حال بارگذاری...'; }
    }

    updateCropStatus() {
        if (this.app.canvasManager.hasImage()) {
            const d = this.app.handles.getCropDimensions();
            document.getElementById('status-crop-size').textContent =
                `برش: ${this._toPersianNum(d.width)}×${this._toPersianNum(d.height)}`;
        }
    }

    _toPersianNum(str) {
        const persianDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        return String(str).replace(/\d/g, d => persianDigits[parseInt(d)]);
    }

    destroy() { if (this.renderFrameId) cancelAnimationFrame(this.renderFrameId); }
}

window.UIManager = UIManager;