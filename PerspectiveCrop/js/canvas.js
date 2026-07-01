/**
 * canvas.js - Canvas rendering and context setup
 *
 * Manages the HTML5 Canvas, handles high-DPI rendering,
 * coordinate transformations, and draw operations.
 */

class CanvasManager {
    constructor(canvasElement) {
        /** @type {HTMLCanvasElement} */
        this.canvas = canvasElement;
        /** @type {CanvasRenderingContext2D} */
        this.ctx = null;
        /** @type {number} Device pixel ratio for HiDPI support */
        this.dpr = Utils.getDevicePixelRatio();
        /** @type {number} Logical canvas width (CSS pixels) */
        this.logicalWidth = 0;
        /** @type {number} Logical canvas height (CSS pixels) */
        this.logicalHeight = 0;
        /** @type {HTMLImageElement|HTMLCanvasElement|null} Currently loaded image source */
        this.image = null;
        /** @type {{width: number, height: number}} Original image dimensions */
        this.imageSize = { width: 0, height: 0 };

        this._initContext();
        this._setupResizeObserver();
    }

    /**
     * Initialize the 2D rendering context with HiDPI support.
     */
    _initContext() {
        this.ctx = this.canvas.getContext('2d', {
            alpha: true,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high'
        });
        this.resize();
    }

    /**
     * Observe container size changes to keep canvas sized correctly.
     */
    _setupResizeObserver() {
        const container = this.canvas.parentElement;
        if (window.ResizeObserver) {
            this._resizeObserver = new ResizeObserver(() => this.resize());
            this._resizeObserver.observe(container);
        } else {
            this._resizeHandler = Utils.debounce(() => this.resize(), 100);
            window.addEventListener('resize', this._resizeHandler);
        }
    }

    /**
     * Resize the canvas to fill its container, accounting for device pixel ratio.
     */
    resize() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        this.logicalWidth = rect.width;
        this.logicalHeight = rect.height;

        this.canvas.width = Math.floor(this.logicalWidth * this.dpr);
        this.canvas.height = Math.floor(this.logicalHeight * this.dpr);

        this.canvas.style.width = this.logicalWidth + 'px';
        this.canvas.style.height = this.logicalHeight + 'px';

        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    /**
     * Clear the entire canvas.
     */
    clear() {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
    }

    /**
     * Set a loaded image/canvas and track its dimensions.
     * Accepts both HTMLImageElement and HTMLCanvasElement.
     * @param {HTMLImageElement|HTMLCanvasElement} source - The image or canvas source
     */
    setImage(source) {
        this.image = source;
        // Canvas elements use .width/.height, Image elements use .naturalWidth/.naturalHeight
        if (source instanceof HTMLCanvasElement) {
            this.imageSize = { width: source.width, height: source.height };
        } else {
            this.imageSize = { width: source.naturalWidth, height: source.naturalHeight };
        }
    }

    /**
     * Check if an image is currently loaded.
     * @returns {boolean}
     */
    hasImage() {
        return this.image !== null;
    }

    /**
     * Get an offscreen canvas copy of the current image.
     * Useful for passing to OpenCV or other processing that needs a canvas.
     * @returns {HTMLCanvasElement} Canvas with the current image drawn on it
     */
    getImageCanvas() {
        const offscreen = document.createElement('canvas');
        offscreen.width = this.imageSize.width;
        offscreen.height = this.imageSize.height;
        const offCtx = offscreen.getContext('2d');
        offCtx.drawImage(this.image, 0, 0);
        return offscreen;
    }

    /**
     * Draw the image onto the canvas, transformed by viewport.
     * @param {Viewport} viewport - The viewport controlling zoom/pan
     */
    drawImage(viewport) {
        if (!this.image) return;

        const ctx = this.ctx;
        ctx.save();

        ctx.translate(viewport.offsetX, viewport.offsetY);
        ctx.scale(viewport.zoom, viewport.zoom);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw image with shadow for depth effect
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 20 / viewport.zoom;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4 / viewport.zoom;

        ctx.drawImage(this.image, 0, 0);

        ctx.restore();
    }

    /**
     * Draw a checkerboard transparency pattern for a given region.
     * @param {number} x - X position (in canvas coordinates)
     * @param {number} y - Y position
     * @param {number} width - Width of the pattern area
     * @param {number} height - Height of the pattern area
     * @param {number} tileSize - Size of each checker tile (default 10)
     */
    drawCheckerboard(x, y, width, height, tileSize = 10) {
        const ctx = this.ctx;
        ctx.save();

        const cols = Math.ceil(width / tileSize);
        const rows = Math.ceil(height / tileSize);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const isLight = (row + col) % 2 === 0;
                ctx.fillStyle = isLight ? '#3a3a5a' : '#2a2a4a';
                ctx.fillRect(
                    x + col * tileSize,
                    y + row * tileSize,
                    tileSize,
                    tileSize
                );
            }
        }

        ctx.restore();
    }

    /**
     * Convert screen (CSS pixel) coordinates to image coordinates.
     * @param {number} screenX - X in CSS pixels
     * @param {number} screenY - Y in CSS pixels
     * @param {Viewport} viewport - Current viewport
     * @returns {{x: number, y: number}} Image-space coordinates
     */
    screenToImage(screenX, screenY, viewport) {
        return {
            x: (screenX - viewport.offsetX) / viewport.zoom,
            y: (screenY - viewport.offsetY) / viewport.zoom
        };
    }

    /**
     * Convert image coordinates to screen (CSS pixel) coordinates.
     * @param {number} imageX - X in image pixels
     * @param {number} imageY - Y in image pixels
     * @param {Viewport} viewport - Current viewport
     * @returns {{x: number, y: number}} Screen-space coordinates
     */
    imageToScreen(imageX, imageY, viewport) {
        return {
            x: imageX * viewport.zoom + viewport.offsetX,
            y: imageY * viewport.zoom + viewport.offsetY
        };
    }

    /**
     * Destroy the canvas manager and clean up observers.
     */
    destroy() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
    }
}

// Make CanvasManager available globally
window.CanvasManager = CanvasManager;
