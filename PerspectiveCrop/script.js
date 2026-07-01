/**
 * script.js - Main application entry point
 */

class Application {
    constructor() {
        const canvasElement = document.getElementById('main-canvas');

        this.canvasManager = new CanvasManager(canvasElement);
        this.viewport = new Viewport(this.canvasManager);
        this.handles = new HandlesManager(this.canvasManager, this.viewport);
        this.historyManager = new HistoryManager(this.canvasManager, this.handles);

        this.imageLoader = new ImageLoader(
            this.canvasManager, this.viewport, this.historyManager, this.handles
        );

        this.exportManager = new ExportManager(
            this.canvasManager, this.viewport, this.handles, this.historyManager
        );

        this.cropManager = new CropManager(
            this.canvasManager, this.viewport, this.handles
        );

        this.detectManager = new DetectManager(
            this.canvasManager, this.handles, this.historyManager
        );

        this.ui = new UIManager(this);

        this._bindCanvasEvents();

        this._updatePreviewDebounced = Utils.debounce(() => this.cropManager.updatePreview(), 100);

        window.addEventListener('render:required', () => {
            this.ui.requestRender();
            this._updatePreviewDebounced();
        });
        window.addEventListener('image:loaded', () => this._updatePreviewDebounced());
        window.addEventListener('history:restored', () => this._updatePreviewDebounced());

        this._initOpenCV();
        this.render();
        this._updatePreviewDebounced();
    }

	render() {
		console.log('🔄 رندر انجام شد');
		const cm = this.canvasManager;
		cm.clear();
		cm.drawImage(this.viewport);
		if (cm.hasImage()) {
			this.handles.draw(this.viewport);
			this.ui.updateCropStatus();
		}
	}

    _bindCanvasEvents() {
        const canvas = this.canvasManager.canvas;

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (!this.canvasManager.hasImage()) return;
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            if (e.deltaY < 0) this.viewport.zoomIn(mx, my);
            else this.viewport.zoomOut(mx, my);
            this.ui.requestRender();
        }, { passive: false });

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                this.viewport.startPan(mx, my);
                canvas.classList.add('panning-active');
                return;
            }
            if (e.button !== 0) return;

            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            if (this.viewport.spaceHeld) {
                this.viewport.startPan(mx, my);
                canvas.classList.add('panning-active');
                e.preventDefault();
                return;
            }

            if (this.canvasManager.hasImage()) {
                const idx = this.handles.hitTest(mx, my);
                if (idx >= 0) {
                    this.handles.startDrag(idx);
                    e.preventDefault();
                    return;
                }
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            if (this.viewport.isPanning) {
                this.viewport.updatePan(mx, my);
                this.ui.requestRender();
                return;
            }

            if (this.handles.isDragging) {
                this.handles.updateDrag(mx, my);
                this.ui.requestRender();
                this._updatePreviewDebounced();
                return;
            }

            if (this.canvasManager.hasImage()) {
                this.handles.updateHover(mx, my);
                canvas.style.cursor = this.handles.getCursorStyle();
            }

            if (this.canvasManager.hasImage()) {
                const imgPos = this.canvasManager.screenToImage(mx, my, this.viewport);
                window.dispatchEvent(new CustomEvent('status:mouse', {
                    detail: { x: Math.round(imgPos.x), y: Math.round(imgPos.y) }
                }));
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 1) {
                this.viewport.endPan();
                canvas.classList.remove('panning-active');
                return;
            }
            if (this.handles.isDragging) {
                this.handles.endDrag();
                this.historyManager.saveState();
                this.ui.requestRender();
                this._updatePreviewDebounced();
            }
            if (this.viewport.isPanning) {
                this.viewport.endPan();
                canvas.classList.remove('panning-active');
            }
        });

        canvas.addEventListener('mouseleave', () => {
            if (this.handles.isDragging) {
                this.handles.endDrag();
                this.historyManager.saveState();
            }
            if (this.viewport.isPanning) {
                this.viewport.endPan();
                canvas.classList.remove('panning-active');
            }
            this.handles.hoveredHandle = -1;
            canvas.style.cursor = '';
        });

        canvas.addEventListener('dblclick', () => {
            if (this.canvasManager.hasImage()) {
                this.viewport.fitToScreen();
                this.ui.requestRender();
            }
        });

        let lastTouchDist = 0;
        let lastTouchCenter = { x: 0, y: 0 };

        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                const t = e.touches[0];
                const rect = canvas.getBoundingClientRect();
                const mx = t.clientX - rect.left;
                const my = t.clientY - rect.top;
                if (this.canvasManager.hasImage()) {
                    const idx = this.handles.hitTest(mx, my);
                    if (idx >= 0) { this.handles.startDrag(idx); e.preventDefault(); return; }
                }
                this.viewport.startPan(mx, my);
            } else if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastTouchDist = Math.sqrt(dx * dx + dy * dy);
                lastTouchCenter = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2
                };
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 1) {
                const t = e.touches[0];
                const rect = canvas.getBoundingClientRect();
                const mx = t.clientX - rect.left;
                const my = t.clientY - rect.top;
                if (this.handles.isDragging) {
                    this.handles.updateDrag(mx, my);
                    this.ui.requestRender();
                    this._updatePreviewDebounced();
                } else if (this.viewport.isPanning) {
                    this.viewport.updatePan(mx, my);
                    this.ui.requestRender();
                }
            } else if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (lastTouchDist > 0) {
                    const s = dist / lastTouchDist;
                    const rect = canvas.getBoundingClientRect();
                    this.viewport.setZoom(this.viewport.zoom * s,
                        lastTouchCenter.x - rect.left, lastTouchCenter.y - rect.top);
                    this.ui.requestRender();
                }
                lastTouchDist = dist;
            }
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            if (this.handles.isDragging) {
                this.handles.endDrag();
                this.historyManager.saveState();
                this._updatePreviewDebounced();
            }
            this.viewport.endPan();
            lastTouchDist = 0;
        });

        window.addEventListener('resize', Utils.debounce(() => {
            this.canvasManager.resize();
            this.ui.requestRender();
            this._updatePreviewDebounced();
        }, 100));
    }

    _initOpenCV() {
        if (typeof cv !== 'undefined' && cv.Mat) {
            this.ui.updateOpenCVStatus('ready');
            this._updatePreviewDebounced();
            return;
        }

        if (!document.querySelector('script[src*="opencv.js"]')) {
            const script = document.createElement('script');
            script.async = true;
            script.src = 'libs/opencv.js';
            script.onload = () => {
                const check = setInterval(() => {
                    if (typeof cv !== 'undefined' && cv.Mat) {
                        clearInterval(check);
                        this.ui.updateOpenCVStatus('ready');
                        this._updatePreviewDebounced();
                    }
                }, 200);
                setTimeout(() => {
                    clearInterval(check);
                    if (typeof cv === 'undefined' || !cv.Mat) {
                        this.ui.updateOpenCVStatus('error');
                        console.warn('OpenCV.js not loaded. Using canvas fallback.');
                        this._updatePreviewDebounced();
                    }
                }, 15000);
            };
            script.onerror = () => {
                this.ui.updateOpenCVStatus('error');
                console.warn('OpenCV.js failed to load. Using canvas fallback.');
                this._updatePreviewDebounced();
            };
            document.head.appendChild(script);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new Application(); });