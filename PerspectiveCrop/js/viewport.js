/**
 * viewport.js - Zoom, pan, and fit-to-screen logic
 */

class Viewport {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.minZoom = 0.01;
        this.maxZoom = 50;
        this.zoomStep = 0.15;
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.panStartOffsetX = 0;
        this.panStartOffsetY = 0;
        this.spaceHeld = false;
    }

    setZoom(newZoom, centerX, centerY) {
        const oldZoom = this.zoom;
        this.zoom = Utils.clamp(newZoom, this.minZoom, this.maxZoom);
        if (centerX !== undefined && centerY !== undefined) {
            this.offsetX = centerX - (centerX - this.offsetX) * (this.zoom / oldZoom);
            this.offsetY = centerY - (centerY - this.offsetY) * (this.zoom / oldZoom);
        }
        this._notifyZoomChange();
    }

    zoomIn(centerX, centerY) {
        this.setZoom(this.zoom * (1 + this.zoomStep), centerX, centerY);
    }

    zoomOut(centerX, centerY) {
        this.setZoom(this.zoom / (1 + this.zoomStep), centerX, centerY);
    }

    startPan(screenX, screenY) {
        this.isPanning = true;
        this.panStart = { x: screenX, y: screenY };
        this.panStartOffsetX = this.offsetX;
        this.panStartOffsetY = this.offsetY;
    }

    updatePan(screenX, screenY) {
        if (!this.isPanning) return;
        this.offsetX = this.panStartOffsetX + (screenX - this.panStart.x);
        this.offsetY = this.panStartOffsetY + (screenY - this.panStart.y);
    }

    endPan() {
        this.isPanning = false;
    }

    fitToScreen() {
        const cm = this.canvasManager;
        if (!cm.hasImage()) return;
        const padding = 40;
        const availableWidth = cm.logicalWidth - padding * 2;
        const availableHeight = cm.logicalHeight - padding * 2;
        const scaleX = availableWidth / cm.imageSize.width;
        const scaleY = availableHeight / cm.imageSize.height;
        const fitZoom = Math.min(scaleX, scaleY, 1);
        this.zoom = Math.max(fitZoom, this.minZoom);
        this.offsetX = (cm.logicalWidth - cm.imageSize.width * this.zoom) / 2;
        this.offsetY = (cm.logicalHeight - cm.imageSize.height * this.zoom) / 2;
        this._notifyZoomChange();
    }

    resetView() {
        const cm = this.canvasManager;
        if (!cm.hasImage()) return;
        this.zoom = 1;
        this.offsetX = (cm.logicalWidth - cm.imageSize.width) / 2;
        this.offsetY = (cm.logicalHeight - cm.imageSize.height) / 2;
        this._notifyZoomChange();
    }

    setSpaceHeld(held) {
        this.spaceHeld = held;
    }

    getZoomPercent() {
        return Math.round(this.zoom * 100) + '%';
    }



	/**
	 * Zoom and pan to fit all four corner handles in view.
	 */
	fitToCorners(corners) {
		console.log('3️⃣ fitToCorners فراخوانی شد');
		const cm = this.canvasManager;
		
		if (!cm.hasImage()) {
			console.warn('⚠️ fitToCorners: تصویری وجود ندارد');
			return;
		}
		if (!corners || corners.length !== 4) {
			console.warn('⚠️ fitToCorners: نقاط نامعتبر', corners);
			return;
		}

		// پیدا کردن bounding box نقاط
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const p of corners) {
			if (p.x < minX) minX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.x > maxX) maxX = p.x;
			if (p.y > maxY) maxY = p.y;
		}

		const width = maxX - minX;
		const height = maxY - minY;
		console.log(`📐 ابعاد نقاط: width=${width}, height=${height}`);

		if (width < 1 || height < 1) {
			console.warn('⚠️ نقاط روی هم افتاده، fitToScreen جایگزین');
			this.fitToScreen();
			return;
		}

		const padding = 40;
		const availW = cm.logicalWidth - padding * 2;
		const availH = cm.logicalHeight - padding * 2;
		const scaleX = availW / width;
		const scaleY = availH / height;
		let newZoom = Math.min(scaleX, scaleY, 10);
		newZoom = Math.max(newZoom, this.minZoom);
		
		console.log(`🔍 زوم جدید: ${newZoom}`);
		this.zoom = newZoom;

		const centerX = (minX + maxX) / 2;
		const centerY = (minY + maxY) / 2;
		this.offsetX = cm.logicalWidth / 2 - centerX * this.zoom;
		this.offsetY = cm.logicalHeight / 2 - centerY * this.zoom;

		console.log(`📍 offset جدید: X=${this.offsetX}, Y=${this.offsetY}`);
		console.log('4️⃣ ✅ fitToCorners با موفقیت انجام شد');
		
		this._notifyZoomChange();
	}


    _notifyZoomChange() {
        window.dispatchEvent(new CustomEvent('viewport:zoomChange', {
            detail: { zoom: this.zoom, percent: this.getZoomPercent() }
        }));
    }
}

window.Viewport = Viewport;