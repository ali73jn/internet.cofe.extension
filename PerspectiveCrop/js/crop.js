/**
 * crop.js - Perspective crop transformation (Live Preview only)
 * Never modifies the original image.
 */

class CropManager {
    constructor(canvasManager, viewport, handlesManager) {
        this.canvasManager = canvasManager;
        this.viewport = viewport;
        this.handlesManager = handlesManager;

        this.livePreviewCanvas = document.getElementById('live-preview-canvas');
        this.livePreviewCtx = this.livePreviewCanvas ? this.livePreviewCanvas.getContext('2d') : null;
        this.previewPlaceholder = document.getElementById('preview-placeholder');
        this.previewDimensions = document.getElementById('preview-dimensions');
    }

    _isOpenCVReady() {
        return typeof cv !== 'undefined' && cv.Mat;
    }

    getCroppedImage() {
        const cm = this.canvasManager;
        if (!cm.hasImage()) return null;

        const corners = this.handlesManager.getCorners();
        const dims = this.handlesManager.getCropDimensions();
        if (!dims || dims.width < 5 || dims.height < 5) return null;

        try {
            if (this._isOpenCVReady()) {
                return this._cropWithOpenCV(corners, dims);
            } else {
                return this._cropWithCanvas(corners, dims);
            }
        } catch (err) {
            console.error('Crop error:', err);
            return null;
        }
    }

    _cropWithOpenCV(corners, dims) {
        const cm = this.canvasManager;
        const ordered = Utils.orderCorners(corners);

        const srcCanvas = cm.getImageCanvas();
        const src = cv.imread(srcCanvas);

        const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            ordered[0].x, ordered[0].y,
            ordered[1].x, ordered[1].y,
            ordered[2].x, ordered[2].y,
            ordered[3].x, ordered[3].y
        ]);
        const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            dims.width, 0,
            dims.width, dims.height,
            0, dims.height
        ]);

        const dsize = new cv.Size(dims.width, dims.height);
        const M = cv.getPerspectiveTransform(srcTri, dstTri);
        const dst = new cv.Mat();
        cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = dims.width;
        outputCanvas.height = dims.height;
        cv.imshow(outputCanvas, dst);

        src.delete(); dst.delete(); M.delete(); srcTri.delete(); dstTri.delete();
        return outputCanvas;
    }

    _cropWithCanvas(corners, dims) {
        const cm = this.canvasManager;
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = dims.width;
        outputCanvas.height = dims.height;
        const ctx = outputCanvas.getContext('2d');

        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = cm.imageSize.width;
        srcCanvas.height = cm.imageSize.height;
        const srcCtx = srcCanvas.getContext('2d');
        srcCtx.drawImage(cm.image, 0, 0);

        const ordered = Utils.orderCorners(corners);
        const gridSize = 20;

        for (let gy = 0; gy < gridSize; gy++) {
            for (let gx = 0; gx < gridSize; gx++) {
                const u0 = gx / gridSize, v0 = gy / gridSize;
                const u1 = (gx + 1) / gridSize, v1 = (gy + 1) / gridSize;

                const src00 = Utils.bilerp(ordered, u0, v0);
                const src10 = Utils.bilerp(ordered, u1, v0);
                const src11 = Utils.bilerp(ordered, u1, v1);
                const src01 = Utils.bilerp(ordered, u0, v1);

                const dstX = u0 * dims.width;
                const dstY = v0 * dims.height;
                const dstW = (u1 - u0) * dims.width;
                const dstH = (v1 - v0) * dims.height;

                const srcPoints = [src00, src10, src11];
                const dstPoints = [
                    { x: dstX, y: dstY },
                    { x: dstX + dstW, y: dstY },
                    { x: dstX + dstW, y: dstY + dstH }
                ];

                const affine = Utils.getAffineParams(srcPoints, dstPoints);
                if (!affine) continue;

                ctx.save();
                ctx.beginPath();
                ctx.rect(dstX, dstY, dstW, dstH);
                ctx.clip();
                ctx.setTransform(affine.a, affine.b, affine.c, affine.d, affine.e, affine.f);
                ctx.drawImage(srcCanvas, 0, 0);
                ctx.restore();
            }
        }

        return outputCanvas;
    }

    updatePreview() {
        const cm = this.canvasManager;
        if (!cm.hasImage()) {
            if (this.livePreviewCanvas) this.livePreviewCanvas.classList.remove('visible');
            if (this.previewPlaceholder) this.previewPlaceholder.classList.remove('hidden');
            return;
        }

        const croppedCanvas = this.getCroppedImage();
        if (!croppedCanvas) {
            if (this.livePreviewCanvas) this.livePreviewCanvas.classList.remove('visible');
            if (this.previewPlaceholder) this.previewPlaceholder.classList.remove('hidden');
            return;
        }

        const panel = this.livePreviewCanvas.parentElement;
        const maxW = panel.clientWidth - 24;
        const maxH = panel.clientHeight - 24;
        const scale = Math.min(maxW / croppedCanvas.width, maxH / croppedCanvas.height, 1);

        this.livePreviewCanvas.width = croppedCanvas.width;
        this.livePreviewCanvas.height = croppedCanvas.height;
        this.livePreviewCanvas.style.width = Math.round(croppedCanvas.width * scale) + 'px';
        this.livePreviewCanvas.style.height = Math.round(croppedCanvas.height * scale) + 'px';

        this.livePreviewCtx.clearRect(0, 0, croppedCanvas.width, croppedCanvas.height);
        this.livePreviewCtx.drawImage(croppedCanvas, 0, 0);

        this.livePreviewCanvas.classList.add('visible');
        if (this.previewPlaceholder) this.previewPlaceholder.classList.add('hidden');

        if (this.previewDimensions) {
            this.previewDimensions.textContent = `ابعاد: ${croppedCanvas.width}×${croppedCanvas.height}`;
        }
    }
}

window.CropManager = CropManager;