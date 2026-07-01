/**
 * handles.js - Corner handle rendering, dragging, and snapping
 */

class HandlesManager {
    constructor(canvasManager, viewport) {
        this.canvasManager = canvasManager;
        this.viewport = viewport;
        this.corners = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 }
        ];
        this.handleRadius = 7;
        this.hoverRadius = 12;
        this.snapThreshold = 15;
        this.activeHandle = -1;
        this.hoveredHandle = -1;
        this.isDragging = false;
        this.lastMousePos = { x: 0, y: 0 };
        this.cornerLabels = ['TL', 'TR', 'BR', 'BL'];

        this.handleColors = {
            normal: '#4f46e5',
            hovered: '#1d4ed8',
            active: '#7c3aed',
            edge: '#d97706'
        };
    }

    resetToImageBounds() {
        const cm = this.canvasManager;
        if (!cm.hasImage()) return;
        this.corners = [
            { x: 0, y: 0 },
            { x: cm.imageSize.width, y: 0 },
            { x: cm.imageSize.width, y: cm.imageSize.height },
            { x: 0, y: cm.imageSize.height }
        ];
    }

    setCorners(newCorners) {
        if (newCorners.length !== 4) return;
        for (let i = 0; i < 4; i++) {
            this.corners[i] = { x: newCorners[i].x, y: newCorners[i].y };
        }
    }

    getCorners() {
        return Utils.deepClone(this.corners);
    }

    getCropDimensions() {
        if (!this.canvasManager.hasImage()) return { width: 0, height: 0 };
        const ordered = Utils.orderCorners(this.corners);
        const width = Utils.distance(ordered[0], ordered[1]);
        const height = Utils.distance(ordered[0], ordered[3]);
        return { width: Math.round(width), height: Math.round(height) };
    }

    draw(viewport) {
        const cm = this.canvasManager;
        if (!cm.hasImage()) return;
        const ctx = cm.ctx;
        ctx.save();

        this._drawMask(ctx, viewport);
        this._drawPolygon(ctx, viewport);
        for (let i = 0; i < 4; i++) {
            this._drawHandle(ctx, viewport, i);
        }
        this._drawDimensions(ctx, viewport);

        ctx.restore();
    }

    _drawMask(ctx, viewport) {
        const cm = this.canvasManager;
        const imgScreenCorners = this.corners.map(c => cm.imageToScreen(c.x, c.y, viewport));
        const canvasW = cm.logicalWidth;
        const canvasH = cm.logicalHeight;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.rect(0, 0, canvasW, canvasH);
        ctx.moveTo(imgScreenCorners[0].x, imgScreenCorners[0].y);
        for (let i = 3; i >= 0; i--) {
            ctx.lineTo(imgScreenCorners[i].x, imgScreenCorners[i].y);
        }
        ctx.closePath();
        ctx.fill('evenodd');
    }

    _drawPolygon(ctx, viewport) {
        const cm = this.canvasManager;
        const screenCorners = this.corners.map(c => cm.imageToScreen(c.x, c.y, viewport));
        ctx.beginPath();
        ctx.moveTo(screenCorners[0].x, screenCorners[0].y);
        for (let i = 1; i < 4; i++) {
            ctx.lineTo(screenCorners[i].x, screenCorners[i].y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(79, 70, 229, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.stroke();
        ctx.fillStyle = 'rgba(79, 70, 229, 0.06)';
        ctx.fill();
    }

    _drawHandle(ctx, viewport, index) {
        const cm = this.canvasManager;
        const screenPos = cm.imageToScreen(this.corners[index].x, this.corners[index].y, viewport);
        const radius = this.handleRadius;
        const isActive = this.activeHandle === index;
        const isHovered = this.hoveredHandle === index;

        let color = this.handleColors.normal;
        if (isActive) color = this.handleColors.active;
        else if (isHovered) color = this.handleColors.hovered;

        if (isActive || isHovered) {
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, radius + 6, 0, Math.PI * 2);
            ctx.fillStyle = isActive ? 'rgba(124, 58, 237, 0.25)' : 'rgba(79, 70, 229, 0.15)';
            ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? '#ffffff' : 'rgba(0, 0, 0, 0.7)';
        ctx.fill();
    }

    _drawDimensions(ctx, viewport) {
        const cm = this.canvasManager;
        ctx.font = '11px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-mono');
        ctx.fillStyle = 'rgba(79, 70, 229, 0.8)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const dims = this.getCropDimensions();
        const topMid = {
            x: (this.corners[0].x + this.corners[1].x) / 2,
            y: (this.corners[0].y + this.corners[1].y) / 2
        };
        const topScreen = cm.imageToScreen(topMid.x, topMid.y - 15 / viewport.zoom, viewport);
        ctx.fillText(dims.width + 'px', topScreen.x, topScreen.y);

        const leftMid = {
            x: (this.corners[0].x + this.corners[3].x) / 2,
            y: (this.corners[0].y + this.corners[3].y) / 2
        };
        const leftScreen = cm.imageToScreen(leftMid.x - 15 / viewport.zoom, leftMid.y, viewport);
        ctx.save();
        ctx.translate(leftScreen.x, leftScreen.y);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(dims.height + 'px', 0, 0);
        ctx.restore();
    }

    hitTest(screenX, screenY) {
        const cm = this.canvasManager;
        for (let i = 0; i < 4; i++) {
            const screenPos = cm.imageToScreen(this.corners[i].x, this.corners[i].y, this.viewport);
            const dist = Utils.distance({ x: screenX, y: screenY }, screenPos);
            if (dist <= this.hoverRadius) {
                return i;
            }
        }
        return -1;
    }

    startDrag(handleIndex) {
        this.activeHandle = handleIndex;
        this.isDragging = true;
    }

    updateDrag(screenX, screenY) {
        if (!this.isDragging || this.activeHandle < 0) return;
        const cm = this.canvasManager;
        const imgPos = cm.screenToImage(screenX, screenY, this.viewport);
        const imgW = cm.imageSize.width;
        const imgH = cm.imageSize.height;

        let x = imgPos.x;
        let y = imgPos.y;

        x = this._snapToEdge(x, [0, imgW]);
        y = this._snapToEdge(y, [0, imgH]);

        x = Utils.clamp(x, -5, imgW + 5);
        y = Utils.clamp(y, -5, imgH + 5);

        this.corners[this.activeHandle] = { x, y };
        this.lastMousePos = { x: Math.round(x), y: Math.round(y) };

        window.dispatchEvent(new CustomEvent('status:mouse', {
            detail: this.lastMousePos
        }));
    }

    endDrag() {
        this.isDragging = false;
        this.activeHandle = -1;
    }

    updateHover(screenX, screenY) {
        this.hoveredHandle = this.hitTest(screenX, screenY);
    }

    _snapToEdge(value, edges) {
        for (const edge of edges) {
            const snapped = Utils.snapToEdge(value, edge, this.snapThreshold);
            if (snapped !== null) return snapped;
        }
        return value;
    }

    getCursorStyle() {
        if (this.isDragging) return 'grabbing';
        if (this.hoveredHandle >= 0) return 'grab';
        const cm = this.canvasManager;
        if (cm.hasImage()) return 'crosshair';
        return 'default';
    }
}

window.HandlesManager = HandlesManager;