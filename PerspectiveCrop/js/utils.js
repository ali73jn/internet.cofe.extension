/**
 * utils.js - Helper functions and math utilities
 */

const Utils = {
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    distance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    distanceToSegment(point, lineStart, lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Utils.distance(point, lineStart);
        let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq;
        t = Utils.clamp(t, 0, 1);
        const projX = lineStart.x + t * dx;
        const projY = lineStart.y + t * dy;
        return Utils.distance(point, { x: projX, y: projY });
    },

    degToRad(degrees) { return degrees * (Math.PI / 180); },
    radToDeg(radians) { return radians * (180 / Math.PI); },

    maxInscribedRect(corners) {
        const topWidth = Utils.distance(corners[0], corners[1]);
        const bottomWidth = Utils.distance(corners[3], corners[2]);
        const leftHeight = Utils.distance(corners[0], corners[3]);
        const rightHeight = Utils.distance(corners[1], corners[2]);
        return { width: Math.round(Math.max(topWidth, bottomWidth)), height: Math.round(Math.max(leftHeight, rightHeight)) };
    },

    uniqueId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    },

    throttle(func, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
        const cloned = {};
        for (const key of Object.keys(obj)) {
            cloned[key] = Utils.deepClone(obj[key]);
        }
        return cloned;
    },

    snapToEdge(value, edgeValue, threshold) {
        const diff = Math.abs(value - edgeValue);
        return diff <= threshold ? edgeValue : null;
    },

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
    },

    getDevicePixelRatio() {
        return window.devicePixelRatio || 1;
    },

    // ============================================================
    // توابع جدید برای تبدیل پرسپکتیو و مرتب‌سازی گوشه‌ها
    // ============================================================

    orderCorners(points) {
        if (points.length !== 4) return points;
        const cx = points.reduce((s, p) => s + p.x, 0) / 4;
        const cy = points.reduce((s, p) => s + p.y, 0) / 4;
        const ordered = [null, null, null, null];
        for (const p of points) {
            const dx = p.x - cx, dy = p.y - cy;
            if (dx < 0 && dy < 0) ordered[0] = p;
            else if (dx >= 0 && dy < 0) ordered[1] = p;
            else if (dx >= 0 && dy >= 0) ordered[2] = p;
            else ordered[3] = p;
        }
        if (ordered.some(c => c === null)) {
            return [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
        }
        return ordered;
    },

    bilerp(corners, u, v) {
        const top = Utils.lerp(corners[0], corners[1], u);
        const bottom = Utils.lerp(corners[3], corners[2], u);
        return Utils.lerp(top, bottom, v);
    },

    getAffineParams(srcPoints, dstPoints) {
        const [s1, s2, s3] = srcPoints;
        const [d1, d2, d3] = dstPoints;

        const det = s1.x * (s2.y - s3.y) - s1.y * (s2.x - s3.x) + (s2.x * s3.y - s3.x * s2.y);
        if (Math.abs(det) < 1e-10) return null;

        const a = (d1.x * (s2.y - s3.y) - s1.y * (d2.x - d3.x) + (s2.x * d3.x - s3.x * d2.x)) / det;
        const b = (s1.x * (d2.x - d3.x) - d1.x * (s2.x - s3.x) + (s2.x * s3.y - s3.x * s2.y)) / det;
        const c = (s1.x * (s2.y * d3.x - s3.y * d2.x) - s1.y * (s2.x * d3.x - s3.x * d2.x) + (s2.x * s3.y - s3.x * s2.y) * d1.x) / det;

        const d = (d1.y * (s2.y - s3.y) - s1.y * (d2.y - d3.y) + (s2.x * d3.y - s3.x * d2.y)) / det;
        const e = (s1.x * (d2.y - d3.y) - d1.y * (s2.x - s3.x) + (s2.x * s3.y - s3.x * s2.y)) / det;
        const f = (s1.x * (s2.y * d3.y - s3.y * d2.y) - s1.y * (s2.x * d3.y - s3.x * d2.y) + (s2.x * s3.y - s3.x * s2.y) * d1.y) / det;

        return { a, b, c, d, e, f };
    }
};

window.Utils = Utils;