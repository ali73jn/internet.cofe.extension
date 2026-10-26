// ==================== تنظیمات اصلی ====================
const CONFIG = {
    FALLBACK_ICON_PATH: "icons/default_icon.png",
    FOLDER_ICON_PATH: "icons/folder.png",
    DEFAULT_BG_IMAGE_PATH: "icons/default_bg.jpg",
    ICONS_JSON_URL: "data/icons.json",
    GRID_CELL_SIZE: 20,
    GRID_GAP: 0,
    HORIZONTAL_PIXEL_OFFSET: 0,
	
    STORAGE_KEYS: {
        LAYOUT: 'netcofe_layout',
        BACKGROUND: 'netcofe_background',
        SETTINGS: 'netcofe_settings',
        THEME: 'netcofe_theme',
        USER_BOOKMARKS: 'netcofe_user_bookmarks',
        CUSTOM_URLS: 'netcofe_custom_urls',
        FAVICON_CACHE: 'netcofe_favicon_cache_v3',
        CURRENT_PATHS: 'netcofe_current_paths',
        SELECTED_CITY: 'netcofe_selected_city',
        ZOOM_LEVEL: 'netcofe_zoom_level',
        BACKGROUND_BLUR: 'netcofe_background_blur',
        SETTINGS_APPLIED: 'netcofe_settings_applied',
        FIRST_RUN: 'netcofe_first_run',
        SEARCH_MODE: 'netcofe_search_mode'
    },
	
	ONLINE: {
        BOOKMARKS_URL: "https://raw.githubusercontent.com/ali73jn/internet.cofe.extension/refs/heads/main/data/bookmarks.json",
        SETTINGS_URL: "https://raw.githubusercontent.com/ali73jn/internet.cofe.extension/refs/heads/main/data/settings.json" 
    }
};

// ==================== تبدیل تاریخ میلادی به شمسی ====================
function gregorianToJalali(gy, gm, gd) {
    var g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var jy = (gy <= 1600) ? 0 : 979;
    gy -= (gy <= 1600) ? 621 : 1600;
    var gy2 = (gm > 2) ? (gy + 1) : gy;
    var days = (365 * gy) + (parseInt((gy2 + 3) / 4)) - (parseInt((gy2 + 99) / 100)) + 
               (parseInt((gy2 + 399) / 400)) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * (parseInt(days / 12053));
    days %= 12053;
    jy += 4 * (parseInt(days / 1461));
    days %= 1461;
    jy += parseInt((days - 1) / 365);
    if (days > 365) days = (days - 1) % 365;
    var jm = (days < 186) ? 1 + parseInt(days / 31) : 7 + parseInt((days - 186) / 30);
    var jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return [jy, jm, jd];
}

function getPersianDateTime() {
    const now = new Date();
    const jalali = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const persianDays = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
    const dayOfWeek = now.getDay();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();
    const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const toPersianDigits = (num) => num.toString().replace(/\d/g, d => persianDigits[d]);
    return {
        date: `${toPersianDigits(jalali[0])}/${toPersianDigits(jalali[1])}/${toPersianDigits(jalali[2])}`,
        day: persianDays[dayOfWeek],
        time24: `${toPersianDigits(hours.toString().padStart(2, '0'))}:${toPersianDigits(minutes.toString().padStart(2, '0'))}:${toPersianDigits(seconds.toString().padStart(2, '0'))}`,
        hours: toPersianDigits(hours.toString().padStart(2, '0')),
        minutes: toPersianDigits(minutes.toString().padStart(2, '0')),
        seconds: toPersianDigits(seconds.toString().padStart(2, '0'))
    };
}

// ==================== وضعیت برنامه ====================
let state = {
    isEditMode: false,
    isDarkMode: false,
    isCompactMode: false,
    backgroundBlur: 0.2,
    zoomLevel: 100,
    currentPaths: {},
    dragInfo: null,
    resizeInfo: null,
    layoutMap: {},
    bookmarks: [],
    userBookmarks: [],
    searchTerm: '',
    currentModal: null,
    customIcons: {},
    netcofeRootId: null,
    searchMode: 'floating'  // 'floating' | 'card'
};

// ==================== Storage Manager ====================
class StorageManager {
    static async get(key) {
        try {
            const result = await chrome.storage.local.get(key);
            return result[key] || null;
        } catch (error) {
            console.error('خطا در خواندن از storage:', error);
            return null;
        }
    }
    static async set(key, value) {
        try {
            await chrome.storage.local.set({ [key]: value });
            return true;
        } catch (error) {
            console.error('خطا در ذخیره در storage:', error);
            return false;
        }
    }
    static async remove(key) {
        try {
            await chrome.storage.local.remove(key);
            return true;
        } catch (error) {
            console.error('خطا در حذف از storage:', error);
            return false;
        }
    }
    static async clearAll() {
        try {
            await chrome.storage.local.clear();
            return true;
        } catch (error) {
            console.error('خطا در پاک کردن storage:', error);
            return false;
        }
    }
}

// ==================== Bookmark Manager ====================
class BookmarkManager {
    static ROOT_FOLDER_NAME = "netcofe";

	static async initRootFolder() {
		try {
			const BOOKMARKS_BAR_ID = "1";
			const children = await chrome.bookmarks.getChildren(BOOKMARKS_BAR_ID);
			const existingFolder = children.find(child => !child.url && child.title === this.ROOT_FOLDER_NAME);
			if (existingFolder) {
				state.netcofeRootId = existingFolder.id;
				console.log('✅ پوشه netcofe پیدا شد:', existingFolder.id);
			} else {
				const created = await chrome.bookmarks.create({ parentId: BOOKMARKS_BAR_ID, title: this.ROOT_FOLDER_NAME });
				state.netcofeRootId = created.id;
				console.log('✅ پوشه netcofe ساخته شد:', created.id);
			}
			return state.netcofeRootId;
		} catch (error) {
			console.error('❌ خطا در ایجاد پوشه root:', error);
			return null;
		}
	}

    static async loadBookmarks() {
        try {
            if (!state.netcofeRootId) await this.initRootFolder();
            state.currentPaths = await StorageManager.get(CONFIG.STORAGE_KEYS.CURRENT_PATHS) || {};
            const tree = await chrome.bookmarks.getSubTree(state.netcofeRootId);
            const rootChildren = tree[0].children || [];
            await this.loadCustomIcons();
            state.bookmarks = this.convertChromeBookmarks(rootChildren);
            return state.bookmarks;
        } catch (error) {
            console.error('خطا در بارگذاری بوکمارک‌ها:', error);
            state.bookmarks = await this.getDefaultBookmarks();
            return state.bookmarks;
        }
    }

    static async loadCustomIcons() {
        try {
            const cached = await StorageManager.get('custom_icons_cache');
            const now = Date.now();
            if (cached && cached.timestamp && (now - cached.timestamp) < 24 * 60 * 60 * 1000) {
                state.customIcons = cached.data || {};
                return;
            }
            const customUrls = await StorageManager.get(CONFIG.STORAGE_KEYS.CUSTOM_URLS) || {};
            const iconsUrl = customUrls.icons || CONFIG.ICONS_JSON_URL;
            const response = await fetch(iconsUrl);
            if (response.ok) {
                state.customIcons = await response.json();
                await StorageManager.set('custom_icons_cache', { data: state.customIcons, timestamp: now });
            } else {
                state.customIcons = {};
            }
        } catch (e) {
            console.warn('⚠️ خطا در بارگذاری آیکون‌های سفارشی:', e);
            state.customIcons = {};
        }
    }

    static convertChromeBookmarks(chromeNodes) {
        const converted = [];
        for (const node of chromeNodes) {
            const convertedNode = { id: node.id, title: node.title, url: node.url || undefined };
            if (node.children && node.children.length > 0) {
                convertedNode.children = this.convertChromeBookmarks(node.children);
            }
            converted.push(convertedNode);
        }
        return converted;
    }

    static async getDefaultBookmarks() {
        return [
            { id: 'default_google', title: 'گوگل', url: 'https://google.com', type: 'bookmark', children: [] },
            { id: 'default_github', title: 'GitHub', url: 'https://github.com', type: 'bookmark', children: [] }
        ];
    }

    static async addUserBookmark(bookmarkData, parentId = null) {
        try {
            if (!state.netcofeRootId) await this.initRootFolder();
            const targetParentId = parentId || state.netcofeRootId;
            const newBookmark = {
                title: bookmarkData.title,
                url: bookmarkData.type === 'bookmark' ? bookmarkData.url : undefined
            };
            if (bookmarkData.parentPath && bookmarkData.parentPath.length > 0) {
                await this.addBookmarkToPath(newBookmark, bookmarkData.parentPath, targetParentId);
            } else {
                await chrome.bookmarks.create({ parentId: targetParentId, ...newBookmark });
            }
            await this.loadBookmarks();
            return true;
        } catch (error) {
            console.error('خطا در افزودن بوکمارک:', error);
            return false;
        }
    }

    static async addBookmarkToPath(bookmark, path, rootFolderId) {
        let currentParentId = rootFolderId;
        for (let i = 0; i < path.length; i++) {
            const folderId = path[i];
            try {
                const folder = await chrome.bookmarks.get(folderId);
                if (folder && folder[0]) currentParentId = folder[0].id;
                else { currentParentId = rootFolderId; break; }
            } catch { currentParentId = rootFolderId; break; }
        }
        await chrome.bookmarks.create({ parentId: currentParentId, ...bookmark });
    }

    static async updateUserBookmark(id, updates) {
        try {
            await chrome.bookmarks.update(id, { title: updates.title, url: updates.url || undefined });
            await this.loadBookmarks();
            return true;
        } catch (error) { console.error('خطا در به‌روزرسانی:', error); return false; }
    }

    static async deleteUserBookmark(id) {
        try {
            await chrome.bookmarks.removeTree(id);
            await this.loadBookmarks();
            return true;
        } catch (error) { console.error('خطا در حذف:', error); return false; }
    }

    static async exportBookmarks() {
        try {
            if (!state.netcofeRootId) return null;
            const tree = await chrome.bookmarks.getSubTree(state.netcofeRootId);
            return { version: '1.0', exportedAt: new Date().toISOString(), bookmarks: tree[0].children || [] };
        } catch (error) { console.error('خطا در export:', error); return null; }
    }

    static async importBookmarks(importedData, replaceExisting = true) {
        try {
            if (!state.netcofeRootId) await this.initRootFolder();
            if (replaceExisting) {
                const existing = await chrome.bookmarks.getChildren(state.netcofeRootId);
                for (const child of existing) await chrome.bookmarks.removeTree(child.id);
            }
            const bookmarksToImport = importedData.bookmarks || importedData;
            const createNodes = async (parentId, nodes) => {
                for (const node of nodes) {
                    const newNode = await chrome.bookmarks.create({
                        parentId, title: node.title, url: node.url || undefined
                    });
                    if (node.children && node.children.length > 0) await createNodes(newNode.id, node.children);
                }
            };
            await createNodes(state.netcofeRootId, bookmarksToImport);
            await this.loadBookmarks();
            return true;
        } catch (error) { console.error('خطا در import:', error); return false; }
    }
}

// ==================== Favicon Manager ====================
class FaviconManager {
    static FAVICON_CACHE_KEY = CONFIG.STORAGE_KEYS.FAVICON_CACHE;
    static CUSTOM_ICON_CACHE_KEY = 'custom_icon_cache_v1';

    static async getCache() {
        const res = await chrome.storage.local.get(this.FAVICON_CACHE_KEY);
        return res[this.FAVICON_CACHE_KEY] || {};
    }
    static async saveCache(cache) { await chrome.storage.local.set({ [this.FAVICON_CACHE_KEY]: cache }); }
    static async getCustomIconCache() {
        const res = await chrome.storage.local.get(this.CUSTOM_ICON_CACHE_KEY);
        return res[this.CUSTOM_ICON_CACHE_KEY] || {};
    }
    static async saveCustomIconCache(cache) { await chrome.storage.local.set({ [this.CUSTOM_ICON_CACHE_KEY]: cache }); }
    static stripWww(url) { return url ? url.replace(/^https?:\/\/www\./i, 'https://') : url; }
    static extractOrigin(url) {
        if (!url) return null;
        try { return new URL(this.stripWww(url)).origin; } catch { return null; }
    }
    static isLocalPath(path) {
        if (!path) return false;
        return path.startsWith('./') || path.startsWith('/') || !path.includes('://') || path.startsWith('file://');
    }
    static resolveLocalPath(relativePath) {
        if (!relativePath) return relativePath;
        try {
            if (relativePath.startsWith('./')) return chrome.runtime.getURL('/') + relativePath.substring(2);
            return relativePath;
        } catch { return relativePath; }
    }
    static loadImageSafe(src, timeout = 3000) {
        return new Promise(resolve => {
            const img = new Image();
            let done = false;
            const finish = ok => { if (!done) { done = true; resolve(ok); } };
            img.onload = () => { (img.naturalWidth > 1 && img.naturalHeight > 1) ? finish(true) : finish(false); };
            img.onerror = () => finish(false);
            img.src = src;
            setTimeout(() => finish(false), timeout);
        });
    }
    static async tryDirectIcon(iconUrl) {
        try { return (await this.loadImageSafe(iconUrl)) ? iconUrl : null; } catch { return null; }
    }
    static blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    static async loadLocalIconDirect(iconUrl) {
        try {
            const response = await fetch(iconUrl);
            if (!response.ok) return null;
            const blob = await response.blob();
            return blob.size === 0 ? null : await this.blobToBase64(blob);
        } catch { return null; }
    }
    static async cacheIcon(pageUrl, iconUrl, cache) {
        try {
            const ok = await this.loadImageSafe(iconUrl);
            if (!ok) return null;
            const response = await fetch(iconUrl);
            if (!response.ok) return null;
            const blob = await response.blob();
            if (blob.size === 0) return null;
            const base64 = await this.blobToBase64(blob);
            cache[pageUrl] = base64;
            await this.saveCache(cache);
            return base64;
        } catch { return null; }
    }
    static async cacheCustomIcon(url, imageUrl) {
        try {
            const cache = await this.getCustomIconCache();
            const origin = this.extractOrigin(url);
            const cacheKey = origin || url;
            const now = Date.now();
            if (this.isLocalPath(imageUrl)) return null;
            if (cache[cacheKey] && cache[cacheKey].timestamp > now - 7 * 24 * 60 * 60 * 1000) return cache[cacheKey].data;
            const response = await fetch(imageUrl);
            if (!response.ok) return null;
            const blob = await response.blob();
            if (blob.size === 0) return null;
            const base64 = await this.blobToBase64(blob);
            cache[cacheKey] = { data: base64, timestamp: now };
            await this.saveCustomIconCache(cache);
            return base64;
        } catch { return null; }
    }
    static async getCustomIconCached(url) {
        try {
            const cache = await this.getCustomIconCache();
            const now = Date.now();
            const origin = this.extractOrigin(url);
            if (!origin) return null;
            if (cache[origin] && cache[origin].timestamp > now - 7 * 24 * 60 * 60 * 1000) return cache[origin].data;
            const withWww = origin.replace(/^https?:\/\//, 'https://www.');
            if (cache[withWww] && cache[withWww].timestamp > now - 7 * 24 * 60 * 60 * 1000) return cache[withWww].data;
            return null;
        } catch { return null; }
    }
    static async tryHtmlIcon(url) {
        try {
            const response = await fetch(url, { redirect: "follow", credentials: "omit", mode: "cors" });
            if (!response.ok) return null;
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, "text/html");
            for (const link of doc.querySelectorAll("link[rel]")) {
                if (link.getAttribute("rel").toLowerCase().includes("icon")) {
                    const href = link.getAttribute("href");
                    if (href) return new URL(href, url).href;
                }
            }
        } catch { return null; }
        return null;
    }
    static async resolveFavicon(url) {
        if (!url || !url.startsWith("http")) return CONFIG.FALLBACK_ICON_PATH;
        const origin = this.extractOrigin(url);
        if (!origin) return CONFIG.FALLBACK_ICON_PATH;
        const domain = new URL(url).hostname;
        try {
            const cache = await this.getCache();
            if (cache[url]) {
                const ok = await this.loadImageSafe(cache[url]);
                if (ok) return cache[url];
                delete cache[url];
            }
        } catch (e) {}
        if (state.customIcons && state.customIcons[origin]) {
            const iconPath = state.customIcons[origin];
            if (this.isLocalPath(iconPath)) {
                const base64 = await this.loadLocalIconDirect(this.resolveLocalPath(iconPath));
                if (base64) return base64;
            } else {
                const cached = await this.getCustomIconCached(origin);
                if (cached) return cached;
                const base64 = await this.cacheCustomIcon(origin, iconPath);
                if (base64) return base64;
            }
        }
        const fastCandidates = [
            `${origin}/favicon.ico`,
            `https://icons.duckduckgo.com/ip3/${domain}.ico`,
            `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
        ];
        for (const iconUrl of fastCandidates) {
            const icon = await this.tryDirectIcon(iconUrl);
            if (icon) {
                const base64 = await this.cacheIcon(url, icon, await this.getCache());
                if (base64) return base64;
            }
        }
        const htmlIcon = await this.tryHtmlIcon(url);
        if (htmlIcon) {
            const base64 = await this.cacheIcon(url, htmlIcon, await this.getCache());
            if (base64) return base64;
        }
        return CONFIG.FALLBACK_ICON_PATH;
    }
    static async clearCache() {
        await chrome.storage.local.remove(this.FAVICON_CACHE_KEY);
        await chrome.storage.local.remove(this.CUSTOM_ICON_CACHE_KEY);
    }
}

// ==================== Zoom Manager ====================
class ZoomManager {
    static MIN_ZOOM = 75;
    static MAX_ZOOM = 125;
    static ZOOM_STEP = 1;

    static async loadZoom() {
        const savedZoom = await StorageManager.get(CONFIG.STORAGE_KEYS.ZOOM_LEVEL);
        if (savedZoom !== null && savedZoom >= 75 && savedZoom <= 125) {
            state.zoomLevel = savedZoom;
        } else {
            state.zoomLevel = 100;
            await this.saveZoom();
        }
    }
    
	static applyZoom() {
    const zoomPercent = state.zoomLevel;
    const zoomWrapper = document.getElementById('zoom-wrapper');
    if (!zoomWrapper) return;

    if (zoomPercent === 100) {
        zoomWrapper.style.zoom = '';
        zoomWrapper.style.transform = '';
        zoomWrapper.style.transformOrigin = '';
        zoomWrapper.style.width = '100%';
        zoomWrapper.style.marginTop = '0px';
        zoomWrapper.style.marginBottom = '0px';
        return;
    }

    const scale = zoomPercent / 100;
    zoomWrapper.style.zoom = '';
    zoomWrapper.style.transform = `scale(${scale})`;
    zoomWrapper.style.transformOrigin = 'top right';   // ⭐ مهم — تراز راست
    zoomWrapper.style.width = `${100 / scale}%`;       // ⭐ جبران عرض
    zoomWrapper.style.marginTop = '0px';
    zoomWrapper.style.marginBottom = '0px';

    if (zoomPercent < 100) {
        const scaledHeight = zoomWrapper.scrollHeight * scale;
        const viewportHeight = window.innerHeight;
        if (scaledHeight < viewportHeight - 100) {
            const extraSpace = (viewportHeight - scaledHeight) / 2;
            zoomWrapper.style.marginTop = `${extraSpace}px`;
            zoomWrapper.style.marginBottom = `${extraSpace}px`;
        }
    }
}
	
	
    static updateZoomDisplay() {
        const display = document.getElementById('zoom-level-display');
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        const zoomInBtn = document.getElementById('zoom-in-btn');
        if (display) display.textContent = `${state.zoomLevel}%`;
        if (zoomOutBtn) {
            zoomOutBtn.classList.toggle('disabled', state.zoomLevel <= this.MIN_ZOOM);
            zoomOutBtn.title = `کوچک‌نمایی (${this.MIN_ZOOM}-${this.MAX_ZOOM}%)`;
        }
        if (zoomInBtn) {
            zoomInBtn.classList.toggle('disabled', state.zoomLevel >= this.MAX_ZOOM);
            zoomInBtn.title = `بزرگ‌نمایی (${this.MIN_ZOOM}-${this.MAX_ZOOM}%)`;
        }
    }
    static setupEventListeners() {
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        const zoomInBtn = document.getElementById('zoom-in-btn');
        if (zoomOutBtn && zoomInBtn) {
            zoomOutBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                if (state.zoomLevel > this.MIN_ZOOM) {
                    state.zoomLevel -= this.ZOOM_STEP;
                    this.applyZoom(); this.saveZoom(); this.updateZoomDisplay();
                }
            });
            zoomInBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                if (state.zoomLevel < this.MAX_ZOOM) {
                    state.zoomLevel += this.ZOOM_STEP;
                    this.applyZoom(); this.saveZoom(); this.updateZoomDisplay();
                }
            });
            document.addEventListener('keydown', (e) => {
                if (state.isEditMode) {
                    if (e.ctrlKey && e.key === '-') { e.preventDefault(); zoomOutBtn.click(); }
                    else if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomInBtn.click(); }
                    else if (e.ctrlKey && e.key === '0') {
                        e.preventDefault();
                        state.zoomLevel = 100;
                        this.applyZoom(); this.saveZoom(); this.updateZoomDisplay();
                    }
                }
            });
        }
    }
    static async saveZoom() {
        await StorageManager.set(CONFIG.STORAGE_KEYS.ZOOM_LEVEL, state.zoomLevel);
    }
}

// ==================== Overlay Manager (Blur — زیر همه چیز) ====================
class OverlayManager {
    static async loadBlur() {
        const savedBlur = await StorageManager.get(CONFIG.STORAGE_KEYS.BACKGROUND_BLUR);
        if (savedBlur !== null && savedBlur >= 0 && savedBlur <= 10) {
            state.backgroundBlur = savedBlur;
        } else {
            state.backgroundBlur = 0;
        }
        this.applyBlur();
    }
	static applyBlur() {
		let overlayElement = document.getElementById('background-overlay');
		if (!overlayElement) {
			overlayElement = document.createElement('div');
			overlayElement.id = 'background-overlay';
			document.body.appendChild(overlayElement);
		}
		// ⭐ position: fixed با inset -10% تا لبه‌ها artifact نداشته باشند
		overlayElement.style.position = 'fixed';
		overlayElement.style.top = '-10%';
		overlayElement.style.left = '-10%';
		overlayElement.style.right = '-10%';
		overlayElement.style.bottom = '-10%';
		overlayElement.style.width = 'auto';
		overlayElement.style.height = 'auto';
		overlayElement.style.pointerEvents = 'none';
		// ⭐ z-index منفی: زیر همه آیتم‌ها ولی بالای پس‌زمینه اصلی
		overlayElement.style.zIndex = '-9997';

		let blurValue = state.backgroundBlur;
		const actualBlur = blurValue * 1.5;
		overlayElement.style.backdropFilter = `blur(${actualBlur}px)`;
		overlayElement.style.webkitBackdropFilter = `blur(${actualBlur}px)`;

		const opacity = Math.min(blurValue / 15, 0.1);
		overlayElement.style.backgroundColor = `rgba(255, 255, 255, ${opacity})`;
	}
    static async saveBlur() {
        await StorageManager.set(CONFIG.STORAGE_KEYS.BACKGROUND_BLUR, state.backgroundBlur);
    }
    static increaseBlur() {
        if (state.backgroundBlur < 10) {
            state.backgroundBlur = Math.min(10, state.backgroundBlur + 0.1);
            state.backgroundBlur = Math.round(state.backgroundBlur * 10) / 10;
            this.applyBlur(); this.saveBlur();
        }
    }
    static decreaseBlur() {
        if (state.backgroundBlur > 0) {
            state.backgroundBlur = Math.max(0, state.backgroundBlur - 0.1);
            state.backgroundBlur = Math.round(state.backgroundBlur * 10) / 10;
            this.applyBlur(); this.saveBlur();
        }
    }
    static setupEventListeners() {
        const blurBtn = document.getElementById('overlay-blur-btn');
        if (blurBtn) {
            blurBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                this.showBlurControlMenu(e);
            });
        }
    }
    static showBlurControlMenu(event) {
        const existingMenu = document.getElementById('blur-control-menu');
        if (existingMenu) { existingMenu.remove(); return; }
        const menu = document.createElement('div');
        menu.id = 'blur-control-menu';
        menu.className = 'blur-control-menu';
        const displayValue = Math.round(state.backgroundBlur * 10);
        menu.innerHTML = `
            <div class="blur-menu-header">
                <span>میزان بلور پس‌زمینه</span>
                <button class="close-blur-menu">×</button>
            </div>
            <div class="blur-preview">
                <div class="blur-preview-box" id="blur-preview-box"></div>
                <div class="blur-description"><small>مقدار واقعی: ${state.backgroundBlur.toFixed(1)}px</small></div>
            </div>
            <div class="blur-slider-container">
                <input type="range" id="blur-intensity-slider" min="0" max="100" step="1" value="${displayValue}">
                <div class="blur-value-display"><span id="blur-intensity-value">${displayValue}%</span></div>
            </div>
            <div class="blur-scale"><span>0%</span><span>50%</span><span>100%</span></div>
            <div class="blur-presets">
                <button class="blur-preset" data-value="0">بدون بلور</button>
                <button class="blur-preset" data-value="4">ملایم</button>
                <button class="blur-preset" data-value="10">متوسط</button>
                <button class="blur-preset" data-value="20">زیاد</button>
                <button class="blur-preset" data-value="40">شدید</button>
                <button class="blur-preset" data-value="100">کامل</button>
            </div>
            <div class="blur-buttons">
                <button id="blur-decrease-btn" class="blur-small-btn" title="کاهش 0.1px">−</button>
                <button id="blur-increase-btn" class="blur-small-btn" title="افزایش 0.1px">+</button>
                <button id="blur-reset-btn" class="blur-reset-btn">بازنشانی</button>
            </div>
        `;
        document.body.appendChild(menu);
        const btnRect = event.target.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${Math.max(10, btnRect.top - menu.offsetHeight - 10)}px`;
        menu.style.right = `${window.innerWidth - btnRect.right}px`;
        this.updateBlurPreview();
        this.setupBlurMenuEvents();
    }
    static updateBlurPreview() {
        const previewBox = document.getElementById('blur-preview-box');
        if (previewBox) {
            previewBox.style.backdropFilter = `blur(${state.backgroundBlur}px)`;
            previewBox.style.webkitBackdropFilter = `blur(${state.backgroundBlur}px)`;
        }
    }
    static setupBlurMenuEvents() {
        const slider = document.getElementById('blur-intensity-slider');
        const valueDisplay = document.getElementById('blur-intensity-value');
        const decreaseBtn = document.getElementById('blur-decrease-btn');
        const increaseBtn = document.getElementById('blur-increase-btn');
        const resetBtn = document.getElementById('blur-reset-btn');
        const presetButtons = document.querySelectorAll('.blur-preset');
        const closeBtn = document.querySelector('.close-blur-menu');
        const menu = document.getElementById('blur-control-menu');
        const updateDescription = () => {
            const desc = document.querySelector('.blur-description small');
            if (desc) desc.textContent = `مقدار واقعی: ${state.backgroundBlur.toFixed(1)}px`;
        };
        if (slider) {
            slider.addEventListener('input', (e) => {
                const displayValue = parseInt(e.target.value);
                state.backgroundBlur = displayValue / 10;
                valueDisplay.textContent = `${displayValue}%`;
                this.applyBlur(); this.updateBlurPreview(); updateDescription();
            });
            slider.addEventListener('change', () => this.saveBlur());
        }
        if (decreaseBtn) decreaseBtn.addEventListener('click', () => {
            this.decreaseBlur();
            const dv = Math.round(state.backgroundBlur * 10);
            if (slider && valueDisplay) { slider.value = dv; valueDisplay.textContent = `${dv}%`; this.updateBlurPreview(); updateDescription(); }
        });
        if (increaseBtn) increaseBtn.addEventListener('click', () => {
            this.increaseBlur();
            const dv = Math.round(state.backgroundBlur * 10);
            if (slider && valueDisplay) { slider.value = dv; valueDisplay.textContent = `${dv}%`; this.updateBlurPreview(); updateDescription(); }
        });
        if (resetBtn) resetBtn.addEventListener('click', () => {
            state.backgroundBlur = 0;
            this.applyBlur(); this.saveBlur();
            if (slider && valueDisplay) { slider.value = 0; valueDisplay.textContent = '0%'; this.updateBlurPreview(); updateDescription(); }
        });
        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const dv = parseInt(btn.dataset.value);
                state.backgroundBlur = dv / 10;
                this.applyBlur(); this.saveBlur();
                if (slider && valueDisplay) { slider.value = dv; valueDisplay.textContent = `${dv}%`; this.updateBlurPreview(); updateDescription(); }
            });
        });
        if (closeBtn) closeBtn.addEventListener('click', () => menu.remove());
        document.addEventListener('click', (e) => {
            if (menu && !menu.contains(e.target) && !e.target.closest('#overlay-blur-btn')) menu.remove();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menu) menu.remove();
        });
    }
}

// ==================== Font Manager ====================
class FontManager {
    static FONTS_URL = 'data/fonts.json';
    static STORAGE_KEY = 'netcofe_selected_font';
    static DEFAULT_FONT = 'DashboardLocalFont';
    static fonts = [];

    static getFallbackFonts() {
        return [
            { name: 'Vazirmatn', file: './font/Vazirmatn.woff2', label: 'وزیرمتن' },
            { name: 'Vazir',     file: './font/Vazir.woff2',     label: 'وزیر' },
            { name: 'IRANSans',  file: './font/IRANSans.woff2',  label: 'ایران‌سنس' },
            { name: 'Sahel',     file: './font/Sahel.woff2',     label: 'ساحل' },
            { name: 'Shabnam',   file: './font/Shabnam.woff2',   label: 'شبنم' },
            { name: 'Samim',     file: './font/Samim.woff2',     label: 'صمیم' }
        ];
    }

	static async init() {
		await this.loadFonts();
		const saved = await StorageManager.get(this.STORAGE_KEY);
		if (saved) {
			this.applyFont(saved, false);
		} else if (this.fonts.length > 0) {
			this.applyFont(this.fonts[0].name, false);
		}
	}

	static async loadFonts() {
		let list = [];
		try {
			const response = await fetch(this.FONTS_URL);
			if (response.ok) {
				const data = await response.json();
				list = Array.isArray(data) ? data : (data.fonts || []);
			}
		} catch (e) {
			console.warn('⚠️ data/fonts.json یافت نشد، از لیست پیش‌فرض استفاده می‌شود');
		}
		if (!list.length) list = this.getFallbackFonts();

		this.fonts = list;   // ❌ بدون DashboardLocalFont — لیست مستقیم
		this.injectFontFaces();
	}

    static injectFontFaces() {
        const existing = document.getElementById('dynamic-font-faces');
        if (existing) existing.remove();
        const userFonts = this.fonts.filter(f => !f.isDefault && f.file);
        if (!userFonts.length) return;
        const style = document.createElement('style');
        style.id = 'dynamic-font-faces';
        style.textContent = userFonts.map(f => {
            const fmt = f.file.endsWith('.woff2') ? 'woff2'
                      : f.file.endsWith('.woff') ? 'woff'
                      : f.file.endsWith('.ttf') ? 'truetype'
                      : 'woff2';
            return `@font-face {
                font-family: "${f.name}";
                src: url("${f.file}") format("${fmt}");
                font-style: normal;
                font-weight: 100 900;
                font-display: swap;
            }`;
        }).join('\n');
        document.head.appendChild(style);
    }

	static applyFont(fontName, save = true) {
		const font = this.fonts.find(f => f.name === fontName);
		if (!font) return;
		document.documentElement.style.setProperty(
			'--font-ui',
			`"${font.name}", "DashboardLocalFont", "Segoe UI", Tahoma, sans-serif`
		);
		if (save) StorageManager.set(this.STORAGE_KEY, fontName);
	}

    static async getCurrentFont() {
        return (await StorageManager.get(this.STORAGE_KEY)) || this.DEFAULT_FONT;
    }

	static async showModal() {
		const modal = document.getElementById('font-modal');
		const list = document.getElementById('font-list');
		if (!modal || !list) return;
		list.innerHTML = '';
		const current = await this.getCurrentFont();

		this.fonts.forEach(font => {
			const item = document.createElement('button');
			item.type = 'button';
			item.className = 'font-item' + (current === font.name ? ' active' : '');
			item.innerHTML = `
				<span class="font-preview" style="font-family: '${font.name}', sans-serif; direction: rtl;">
					نمونه متن فارسی ۱۲۳
				</span>
				<span class="font-name">${font.label || font.name}</span>
				<span class="font-check">✓</span>
			`;
			item.addEventListener('click', () => {
				this.applyFont(font.name);
				list.querySelectorAll('.font-item').forEach(i => i.classList.remove('active'));
				item.classList.add('active');
			});
			list.appendChild(item);
		});

		modal.classList.remove('hidden');
	}
	
}

// ==================== Dimensions Manager ====================
class DimensionsManager {
    static STORAGE_KEY = 'netcofe_dimensions';

    // ⭐ برای افزودن آیتم جدید، فقط یک آبجکت به این آرایه اضافه کنید:
    //    { key, label, default, min, max, cssVar, unit }
		static config = [
			{ key: 'topMargin',        label: 'حاشیه بالا',                              default: 12, min: 0,    max: 80,  cssVar: '--dashboard-top-margin',    unit: 'px' },
			{ key: 'rightMargin',      label: 'حاشیه راست',                              default: 17.5,   min: 0,    max: 100, cssVar: '--dashboard-right-margin',  unit: 'px' },
			{ key: 'searchCardHeight', label: 'ارتفاع دکمه سرچ',                          default: 48,   min: 11.4, max: 76,  cssVar: '--search-card-height',      unit: 'px' },
			{ key: 'toolbarWidth',     label: 'عرض منوی ابزارها',                         default: 32.5,  min: 0,    max: 70, cssVar: '--toolbar-width',  unit: 'px' },
			{ key: 'cardHeaderHeight', label: 'ارتفاع عنوان کارت‌ها',                     default: 20,   min: 0,    max: 40,  cssVar: '--card-header-height',      unit: 'px' },
			{ key: 'breadcrumbsHeight',label: 'ارتفاع نوار آدرس کارت‌ها',                 default: 18,   min: 0,    max: 40,  cssVar: '--breadcrumbs-height',      unit: 'px' },
			{ key: 'gridModeGap',      label: 'فاصله بین بوکمارک‌ها در چینش کاشی',        default: 6,    min: 0,    max: 30,  cssVar: '--grid-mode-gap',           unit: 'px' },
			{ key: 'gridTileHeight',   label: 'ارتفاع بوکمارک‌ها در حالت کاشی',            default: 80,  min: 40,    max: 120,  cssVar: '--grid-tile-height',        unit: 'px' },
			{ key: 'gridCompactness',  label: 'فشردگی چینش داخلی در حالت کاشی',           default: 6.8,  min: 0,    max: 30,  cssVar: '--grid-compactness',        unit: 'px' },
			{ key: 'listModeGap',      label: 'فاصله بین بوکمارک‌ها در چینش لیست',        default: 6,    min: 0,    max: 30,  cssVar: '--list-mode-gap',           unit: 'px' },
			{ key: 'listTileHeight',   label: 'ارتفاع بوکمارک‌ها در حالت لیست',            default: 31, min: 20,   max: 60,  cssVar: '--list-tile-height',        unit: 'px' }
		];

    static offsets = {};

    static computeValue(dim, offset) {
        if (offset >= 0) {
            return dim.default + (offset / 100) * (dim.max - dim.default);
        } else {
            return dim.default + (offset / 100) * (dim.default - dim.min);
        }
    }

    static getValue(dim) {
        const offset = this.offsets[dim.key] || 0;
        return Math.round(this.computeValue(dim, offset) * 10) / 10;
    }

    static async init() {
        const saved = await StorageManager.get(this.STORAGE_KEY);
        if (saved && typeof saved === 'object') this.offsets = { ...saved };
        this.config.forEach(d => {
            if (typeof this.offsets[d.key] !== 'number') this.offsets[d.key] = 0;
        });
        this.applyAll();
    }

		static applyAll() {
			this.config.forEach(dim => {
				const offset = this.offsets[dim.key] || 0;
				const value = this.getValue(dim);
				document.documentElement.style.setProperty(dim.cssVar, `${value}${dim.unit}`);
			});
		}

    static async save() {
        await StorageManager.set(this.STORAGE_KEY, this.offsets);
    }

    static async reset() {
        this.config.forEach(d => { this.offsets[d.key] = 0; });
        this.applyAll();
        await this.save();
    }

static showModal() {
    const modal = document.getElementById('dimensions-modal');
    const list = document.getElementById('dimensions-list');
    if (!modal || !list) return;
    list.innerHTML = '';

    this.config.forEach(dim => {
        const offset = this.offsets[dim.key] || 0;
        const value = this.getValue(dim);
        const isDefault = offset === 0;

        const row = document.createElement('div');
        row.className = 'dim-row';
        row.innerHTML = `
            <span class="dim-label" title="${dim.label}">${dim.label}</span>
            <div class="dim-controls">
                <button type="button" class="dim-step" data-step="1" aria-label="افزایش">+</button>
                <input type="range" class="dim-slider"
                       min="-100" max="100" step="0.01" value="${offset}">
                <button type="button" class="dim-step" data-step="-1" aria-label="کاهش">−</button>
            </div>
            <span class="dim-value ${isDefault ? 'at-default' : ''}">
                ${value}${dim.unit}
            </span>
        `;

        const slider = row.querySelector('.dim-slider');
        const valueDisplay = row.querySelector('.dim-value');
        const stepBtns = row.querySelectorAll('.dim-step');

        const updateDisplay = (newOffset) => {
            this.offsets[dim.key] = newOffset;
            const newValue = this.getValue(dim);
            valueDisplay.textContent = `${newValue}${dim.unit}`;
            valueDisplay.classList.toggle('at-default', newOffset === 0);
            document.documentElement.style.setProperty(dim.cssVar, `${newValue}${dim.unit}`);

            // ⭐ به‌روزرسانی ارتفاع کارت جستجو (grid row span)
            if (dim.key === 'searchCardHeight') {
                const card = document.querySelector('.search-card');
                if (card) {
                    const newH = Math.max(1, Math.ceil(newValue / 20));
                    card.style.gridRowEnd = `span ${newH}`;
                    if (state.layoutMap['جستجو']) {
                        state.layoutMap['جستجو'].h = newH;
                    }
                }
            }
        };

        slider.addEventListener('input', e => updateDisplay(parseFloat(e.target.value)));
        slider.addEventListener('change', () => this.save());
        slider.addEventListener('dblclick', () => {
            slider.value = 0;
            updateDisplay(0);
            this.save();
        });

        // ⭐ دکمه‌ها: هر کلیک = ۰.۱ واحد از مقدار واقعی
        stepBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const stepDir = parseFloat(btn.dataset.step); // +1 یا -1
                const currentValue = this.getValue(dim);
                const targetValue = currentValue + stepDir * 0.1;

                // محاسبه offset متناسب با targetValue (با احتیاط در عبور از پیش‌فرض)
                let newOffset;
                if (targetValue >= dim.default) {
                    newOffset = dim.max > dim.default
                        ? 100 * (targetValue - dim.default) / (dim.max - dim.default)
                        : 0;
                } else {
                    newOffset = dim.default > dim.min
                        ? 100 * (targetValue - dim.default) / (dim.default - dim.min)
                        : 0;
                }
                newOffset = Math.max(-100, Math.min(100, newOffset));
                newOffset = Math.round(newOffset * 100) / 100;

                slider.value = newOffset;
                updateDisplay(newOffset);
                this.save();
            });
        });

        list.appendChild(row);
    });

    modal.classList.remove('hidden');
}


}

// ==================== Weather Manager ====================
class WeatherManager {
    static userCoordinates = null;
    static async getWeather() {
        try {
            const savedCity = await StorageManager.get(CONFIG.STORAGE_KEYS.SELECTED_CITY);
            let coordinates;
            if (savedCity) {
                const [lat, lon] = savedCity.coordinates.split(',').map(Number);
                coordinates = { latitude: lat, longitude: lon };
                this.userCoordinates = coordinates;
            } else {
                coordinates = { latitude: 35.6892, longitude: 51.3890 };
                this.userCoordinates = coordinates;
            }
            const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}&current_weather=true&timezone=auto`
            );
            if (!response.ok) throw new Error('خطا');
            return this.formatWeatherData(await response.json());
        } catch (error) {
            return this.getFallbackWeather();
        }
    }
    static formatWeatherData(data) {
        const current = data.current_weather;
        const weatherCodes = {
            0: 'آفتابی', 1: 'آفتابی', 2: 'نیمه ابری', 3: 'ابری', 45: 'مه', 48: 'مه',
            51: 'نمنم باران', 53: 'باران ملایم', 55: 'باران شدید', 61: 'باران ملایم',
            63: 'باران', 65: 'باران شدید', 71: 'بارش برف ملایم', 73: 'بارش برف',
            75: 'بارش برف شدید', 80: 'رگبار باران', 81: 'رگبار شدید', 82: 'رگبار سیل‌آسا',
            95: 'رعد و برق', 96: 'رعد و برق با باران', 99: 'رعد و برق شدید'
        };
        return {
            temperature: Math.round(current.temperature),
            weatherCode: current.weathercode,
            condition: weatherCodes[current.weathercode] || 'نامشخص',
            windSpeed: Math.round(current.windspeed),
            windDirection: current.winddirection,
            time: new Date(current.time),
            isDay: current.is_day === 1
        };
    }
    static getFallbackWeather() {
        return { temperature: 22, condition: 'آفتابی', windSpeed: 5, isDay: true, isFallback: true };
    }
    static getWeatherIcon(condition) {
        const icons = {
            'آفتابی': '☀️', 'نیمه ابری': '⛅', 'ابری': '☁️', 'مه': '🌫️',
            'باران': '🌧️', 'باران ملایم': '🌦️', 'باران شدید': '⛈️',
            'برف': '❄️', 'رعد و برق': '⚡', 'نامشخص': '🌈'
        };
        return icons[condition] || '🌈';
    }
}

// ==================== Theme Manager ====================
class ThemeManager {
    static async init() {
        const settings = await StorageManager.get(CONFIG.STORAGE_KEYS.SETTINGS) || {};
        const savedTheme = await StorageManager.get(CONFIG.STORAGE_KEYS.THEME);
        if (savedTheme) {
            state.isDarkMode = savedTheme === 'dark';
        } else if (settings.autoDarkMode && window.matchMedia) {
            state.isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        this.applyTheme();
        this.setupThemeListeners();
    }
    static applyTheme() {
        document.documentElement.setAttribute('data-theme', state.isDarkMode ? 'dark' : 'light');
        StorageManager.set(CONFIG.STORAGE_KEYS.THEME, state.isDarkMode ? 'dark' : 'light');
        OverlayManager.loadBlur();
    }
    static setupThemeListeners() {
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                const settings = StorageManager.get(CONFIG.STORAGE_KEYS.SETTINGS) || {};
                if (settings.autoDarkMode) { state.isDarkMode = e.matches; this.applyTheme(); }
            });
        }
    }
    static toggleTheme() {
        state.isDarkMode = !state.isDarkMode;
        this.applyTheme();
        return state.isDarkMode;
    }
}

// ==================== Background Manager ====================
class BackgroundManager {
    static async initBackground() {
        const bgData = await StorageManager.get(CONFIG.STORAGE_KEYS.BACKGROUND);
        const bgElement = document.getElementById('fixed-background');
        const body = document.body;
        body.style.background = 'none';
        body.style.backgroundColor = 'transparent';
        if (bgElement) {
            bgElement.style.backgroundRepeat = 'no-repeat';
            bgElement.style.backgroundPosition = 'center center';
            bgElement.style.backgroundSize = 'cover';
            bgElement.style.backgroundAttachment = 'fixed';
            bgElement.style.backgroundImage = bgData ? `url(${bgData})` : `url(${CONFIG.DEFAULT_BG_IMAGE_PATH})`;
        }
    }
    static async setBackground(imageData) {
        await StorageManager.set(CONFIG.STORAGE_KEYS.BACKGROUND, imageData);
        const bgElement = document.getElementById('fixed-background');
        if (bgElement) bgElement.style.backgroundImage = `url(${imageData})`;
        else this.initBackground();
    }
    static async resetBackground() {
        await StorageManager.remove(CONFIG.STORAGE_KEYS.BACKGROUND);
        const bgElement = document.getElementById('fixed-background');
        if (bgElement) bgElement.style.backgroundImage = `url(${CONFIG.DEFAULT_BG_IMAGE_PATH})`;
        else this.initBackground();
    }
}

// ==================== Drag & Resize System ====================
class DragResizeManager {
    static startDrag(e, card) {
        if (e.button !== 0 || !state.isEditMode) return;
        e.preventDefault();
        state.dragInfo = {
            card,
            startX: e.clientX, startY: e.clientY,
            startCol: parseInt(card.style.gridColumnStart) || 1,
            startRow: parseInt(card.style.gridRowStart) || 1
        };
        card.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
        const onDrag = this.onDrag.bind(this);
        const stopDrag = this.stopDrag.bind(this);
        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', stopDrag);
        state.dragInfo.onDrag = onDrag;
        state.dragInfo.stopDrag = stopDrag;
    }
    static onDrag(e) {
        if (!state.dragInfo) return;
        const dx = e.clientX - state.dragInfo.startX;
        const dy = e.clientY - state.dragInfo.startY;
        const dCol = Math.round(dx / (CONFIG.GRID_CELL_SIZE + CONFIG.GRID_GAP));
        const dRow = Math.round(dy / (CONFIG.GRID_CELL_SIZE + CONFIG.GRID_GAP));
        state.dragInfo.card.style.gridColumnStart = Math.max(1, state.dragInfo.startCol - dCol);
        state.dragInfo.card.style.gridRowStart = Math.max(1, state.dragInfo.startRow + dRow);
    }
    static stopDrag() {
        if (state.dragInfo) {
            state.dragInfo.card.classList.remove('dragging');
            const category = state.dragInfo.card.dataset.category;
            if (state.layoutMap[category]) {
                state.layoutMap[category].col = parseInt(state.dragInfo.card.style.gridColumnStart) || 1;
                state.layoutMap[category].row = parseInt(state.dragInfo.card.style.gridRowStart) || 1;
                StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
            }
            if (state.dragInfo.onDrag && state.dragInfo.stopDrag) {
                window.removeEventListener('mousemove', state.dragInfo.onDrag);
                window.removeEventListener('mouseup', state.dragInfo.stopDrag);
            }
        }
        state.dragInfo = null;
        document.body.style.cursor = 'default';
    }
    static startResize(e, card) {
        if (e.button !== 0 || !state.isEditMode) return;
        e.preventDefault(); e.stopPropagation();
        const colEnd = card.style.gridColumnEnd;
        const rowEnd = card.style.gridRowEnd;
        state.resizeInfo = {
            card,
            startX: e.clientX, startY: e.clientY,
            startW: colEnd ? parseInt(colEnd.split(' ')[1]) : 8,
            startH: rowEnd ? parseInt(rowEnd.split(' ')[1]) : 6
        };
        const onResize = this.onResize.bind(this);
        const stopResize = this.stopResize.bind(this);
        window.addEventListener('mousemove', onResize);
        window.addEventListener('mouseup', stopResize);
        state.resizeInfo.onResize = onResize;
        state.resizeInfo.stopResize = stopResize;
    }
    static onResize(e) {
        if (!state.resizeInfo) return;
        const dx = e.clientX - state.resizeInfo.startX;
        const dy = e.clientY - state.resizeInfo.startY;
        const dW = Math.round(dx / (CONFIG.GRID_CELL_SIZE + CONFIG.GRID_GAP));
        const dH = Math.round(dy / (CONFIG.GRID_CELL_SIZE + CONFIG.GRID_GAP));
        const newW = Math.max(4, state.resizeInfo.startW - dW);
        const newH = Math.max(4, state.resizeInfo.startH + dH);
        state.resizeInfo.card.style.gridColumnEnd = `span ${newW}`;
        state.resizeInfo.card.style.gridRowEnd = `span ${newH}`;
        const actualWidthInPixels = (newW * CONFIG.GRID_CELL_SIZE) + ((newW - 1) * CONFIG.GRID_GAP) + CONFIG.HORIZONTAL_PIXEL_OFFSET;
        state.resizeInfo.card.style.width = `${actualWidthInPixels}px`;
    }
    static stopResize() {
        if (state.resizeInfo) {
            const category = state.resizeInfo.card.dataset.category;
            if (state.layoutMap[category]) {
                const colEnd = state.resizeInfo.card.style.gridColumnEnd;
                const rowEnd = state.resizeInfo.card.style.gridRowEnd;
                state.layoutMap[category].w = colEnd ? parseInt(colEnd.split(' ')[1]) : 8;
                state.layoutMap[category].h = rowEnd ? parseInt(rowEnd.split(' ')[1]) : 6;
                StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
            }
            if (state.resizeInfo.onResize && state.resizeInfo.stopResize) {
                window.removeEventListener('mousemove', state.resizeInfo.onResize);
                window.removeEventListener('mouseup', state.resizeInfo.stopResize);
            }
        }
        state.resizeInfo = null;
    }
}

// ==================== Import/Export System ====================
class ImportExportManager {
	static async fetchJsonFromUrl(url) {
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			return await response.json();
		} catch (e) {
			console.error("❌ خطا در دریافت از URL:", url, e);
			alert(`خطا در دریافت داده از ${url}. لطفا لینک را چک کنید.`);
			return null;
		}
	}

	static async importBookmarksOnline(silent = false) {
		const importedData = await this.fetchJsonFromUrl(CONFIG.ONLINE.BOOKMARKS_URL);
		if (!importedData) return false;
		try {
			const bookmarksArray = importedData.bookmarks || importedData;
			if (!Array.isArray(bookmarksArray)) throw new Error('فرمت فایل نامعتبر است');
			return await BookmarkManager.importBookmarks(bookmarksArray, true);
		} catch (error) { console.error('خطا:', error); return false; }
	}

	static async importBookmarksLocal(silent = false) {
		try {
			const localUrl = chrome.runtime.getURL('data/bookmarks.json');
			const response = await fetch(localUrl);
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			const importedData = await response.json();
			const bookmarksArray = importedData.bookmarks || importedData;
			if (!Array.isArray(bookmarksArray)) throw new Error('فرمت نامعتبر');
			return await BookmarkManager.importBookmarks(bookmarksArray, true);
		} catch (error) { console.error('❌ خطا:', error); return false; }
	}

	// ============================================================
	// ⭐ متد مشترک: اعمال داده‌های تنظیمات (قدیمی + جدید)
	// ============================================================
	static async applySettingsData(importedData) {
		if (!importedData || typeof importedData !== 'object') {
			throw new Error('داده تنظیمات نامعتبر است');
		}

		// ---- سازگاری با فرمت قدیمی (فقط layoutMap خام) ----
		const isOldFormat = !importedData.version
			&& !importedData.layout
			&& !importedData.bookmarks
			&& !importedData.theme
			&& typeof importedData.zoomLevel !== 'number'
			&& !importedData.selectedFont
			&& !importedData.dimensions
			&& !importedData.searchMode;

		if (isOldFormat) {
			state.layoutMap = importedData;
			await StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
			return;
		}

		// ---- فرمت جدید ----
		const writes = [];

		if (importedData.layout) {
			state.layoutMap = importedData.layout;
			writes.push(StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, importedData.layout));
		}
		if (importedData.theme) {
			state.isDarkMode = importedData.theme === 'dark';
			writes.push(StorageManager.set(CONFIG.STORAGE_KEYS.THEME, importedData.theme));
		}
		if (importedData.settings) {
			writes.push(StorageManager.set(CONFIG.STORAGE_KEYS.SETTINGS, importedData.settings));
		}
		if (typeof importedData.zoomLevel === 'number') {
			state.zoomLevel = Math.max(75, Math.min(125, importedData.zoomLevel));
			writes.push(StorageManager.set(CONFIG.STORAGE_KEYS.ZOOM_LEVEL, state.zoomLevel));
		}
		if (typeof importedData.backgroundBlur === 'number') {
			state.backgroundBlur = Math.max(0, Math.min(10, importedData.backgroundBlur));
			writes.push(StorageManager.set(CONFIG.STORAGE_KEYS.BACKGROUND_BLUR, state.backgroundBlur));
		}
		if (importedData.searchMode) {
			state.searchMode = importedData.searchMode;
			writes.push(StorageManager.set(CONFIG.STORAGE_KEYS.SEARCH_MODE, importedData.searchMode));
		}
		if (importedData.selectedFont) {
			writes.push(StorageManager.set(FontManager.STORAGE_KEY, importedData.selectedFont));
		}
		if (importedData.dimensions) {
			writes.push(StorageManager.set(DimensionsManager.STORAGE_KEY, importedData.dimensions));
		}
		if (importedData.selectedCity) {
			writes.push(StorageManager.set(CONFIG.STORAGE_KEYS.SELECTED_CITY, importedData.selectedCity));
		}
		if (importedData.customUrls) {
			writes.push(StorageManager.set(CONFIG.STORAGE_KEYS.CUSTOM_URLS, importedData.customUrls));
		}
		// ⭐ background عمداً ذخیره/اعمال نمی‌شود

		await Promise.all(writes);

		// ---- اعمال مجدد همه‌چیز روی برنامه زنده ----
		ThemeManager.applyTheme();
		await FontManager.init();
		await DimensionsManager.init();
		// ⭐ BackgroundManager.initBackground() صدا زده نمی‌شود تا پس‌زمینه فعلی کاربر دست‌نخورده بماند

		ZoomManager.applyZoom();
		ZoomManager.updateZoomDisplay();

		OverlayManager.applyBlur();
		await EventManager.applySearchMode();

		// رفرش آب‌وهوا اگر شهر تغییر کرده باشد
		if (importedData.selectedCity) {
			setTimeout(() => {
				if (typeof Renderer !== 'undefined' && Renderer.refreshWeather) {
					Renderer.refreshWeather();
				}
			}, 300);
		}
	}

	// ============================================================
	// ⭐ خروجی همه تنظیمات (بدون پس‌زمینه)
	// ============================================================
	static async exportSettings() {
		const [
			layout, settings, theme, customUrls,
			selectedCity, zoomLevel, backgroundBlur, searchMode,
			selectedFont, dimensions
		] = await Promise.all([
			StorageManager.get(CONFIG.STORAGE_KEYS.LAYOUT),
			StorageManager.get(CONFIG.STORAGE_KEYS.SETTINGS),
			StorageManager.get(CONFIG.STORAGE_KEYS.THEME),
			StorageManager.get(CONFIG.STORAGE_KEYS.CUSTOM_URLS),
			StorageManager.get(CONFIG.STORAGE_KEYS.SELECTED_CITY),
			StorageManager.get(CONFIG.STORAGE_KEYS.ZOOM_LEVEL),
			StorageManager.get(CONFIG.STORAGE_KEYS.BACKGROUND_BLUR),
			StorageManager.get(CONFIG.STORAGE_KEYS.SEARCH_MODE),
			StorageManager.get(FontManager.STORAGE_KEY),
			StorageManager.get(DimensionsManager.STORAGE_KEY)
		]);

		const exportData = {
			version: '2.0',
			exportedAt: new Date().toISOString(),
			layout: layout || state.layoutMap || {},
			theme: theme || null,
			settings: settings || null,
			zoomLevel: (typeof zoomLevel === 'number') ? zoomLevel : state.zoomLevel,
			backgroundBlur: (typeof backgroundBlur === 'number') ? backgroundBlur : state.backgroundBlur,
			searchMode: searchMode || state.searchMode,
			selectedFont: selectedFont || null,
			dimensions: dimensions || null,
			selectedCity: selectedCity || null,
			customUrls: customUrls || null
			// ⭐ background حذف شد تا فایل سنگین نشود
		};

		this.downloadFile(JSON.stringify(exportData, null, 2), 'layout_export.json', 'application/json');
	}

	static async importSettings(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = async (event) => {
				try {
					const importedData = JSON.parse(event.target.result);
					await this.applySettingsData(importedData);
					await Renderer.renderDashboard();
					resolve(true);
				} catch (error) {
					reject(error);
				}
			};
			reader.onerror = reject;
			reader.readAsText(file);
		});
	}

	static async importSettingsOnline(silent = false) {
		const importedData = await this.fetchJsonFromUrl(CONFIG.ONLINE.SETTINGS_URL);
		if (!importedData) return false;
		try {
			await this.applySettingsData(importedData);
			return true;
		} catch (error) {
			console.error('خطا:', error);
			return false;
		}
	}

	static async importSettingsLocal(silent = false) {
		try {
			const localUrl = chrome.runtime.getURL('data/settings.json');
			const response = await fetch(localUrl);
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			const importedData = await response.json();
			await this.applySettingsData(importedData);
			return true;
		} catch (error) {
			console.error('❌ خطا:', error);
			return false;
		}
	}

	// -------- combinedLocalImport / combinedOnlineImport --------
	static async combinedLocalImport(skipConfirm = true) {
		const bookmarksOk = await this.importBookmarksLocal(skipConfirm);
		if (bookmarksOk) {
			const settingsOk = await this.importSettingsLocal(skipConfirm);
			if (settingsOk) {
				if (state.layoutMap['زمان و آب و هوا']) state.layoutMap['زمان و آب و هوا'].mode = 'full';
				else state.layoutMap['زمان و آب و هوا'] = { col: 9, row: 1, w: 4, h: 3, view: 'list', mode: 'full' };
				await StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
				await Renderer.renderDashboard();
			}
		}
	}
	static async combinedOnlineImport(skipConfirm = false) {
		const bookmarksOk = await this.importBookmarksOnline(skipConfirm);
		if (bookmarksOk) {
			const settingsOk = await this.importSettingsOnline(skipConfirm);
			if (settingsOk) await Renderer.renderDashboard();
		}
	}

	// -------- export/import بوکمارک‌ها --------
	static async exportBookmarks() {
		const exportData = await BookmarkManager.exportBookmarks();
		if (!exportData) { alert('خطا در export'); return; }
		this.downloadFile(JSON.stringify(exportData, null, 2), 'bookmarks_export.json', 'application/json');
	}
	static async importBookmarks(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = async (event) => {
				try {
					const importedData = JSON.parse(event.target.result);
					if (!Array.isArray(importedData.bookmarks) && !Array.isArray(importedData)) throw new Error('فرمت نامعتبر');
					const success = await BookmarkManager.importBookmarks(importedData, true);
					if (success) { await Renderer.renderDashboard(); resolve(true); }
					else reject(new Error('خطا در import'));
				} catch (error) { reject(error); }
			};
			reader.onerror = reject;
			reader.readAsText(file);
		});
	}

	static downloadFile(data, filename, type) {
		const blob = new Blob([data], { type });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url; a.download = filename;
		document.body.appendChild(a); a.click();
		document.body.removeChild(a); URL.revokeObjectURL(url);
	}
}


// ==================== Renderer ====================
class Renderer {
    static async renderDashboard() {
        const container = document.getElementById('grid-container');
        if (!container) return;

        // ⭐ قبل از پاک کردن، search container را به والد اصلی برگردان
        const searchContainer = document.getElementById('search-container');
        const searchWrapper = document.querySelector('.search-top-wrapper');
        if (searchContainer && searchWrapper && searchContainer.parentElement !== searchWrapper) {
            searchWrapper.appendChild(searchContainer);
        }

        container.innerHTML = '';
        document.body.classList.toggle('editing-mode', state.isEditMode);
        document.body.classList.toggle('compact-mode', state.isCompactMode);

        if (state.bookmarks.length === 0) {
            container.innerHTML += `
                <div class="empty-state">
                    <h3>📚 بوکمارکی یافت نشد</h3>
                    <p>برای شروع، دکمه ویرایش را فشار داده و بوکمارک جدید اضافه کنید.</p>
                    <button id="add-first-bookmark" class="btn-success">افزودن اولین بوکمارک</button>
                </div>
            `;
            const addBtn = container.querySelector('#add-first-bookmark');
            if (addBtn) addBtn.addEventListener('click', () => document.getElementById('edit-mode-btn').click());
            return;
        }

        const categorizedBookmarks = this.categorizeBookmarks(state.bookmarks);

        // ⭐ اگر حالت جستجو "کارت" است، ابتدا کارت جستجو را بساز
        if (state.searchMode === 'card') {
            this.createSearchCard(container);
        }

        this.createDateTimeCard(container);
        Object.entries(categorizedBookmarks).forEach(([category, items], index) => {
            const layout = state.layoutMap[category] || {
                col: (index % 3) * 8 + 1,
                row: Math.floor(index / 3) * 6 + 2,
                w: 8, h: 6, view: "list"
            };
            state.layoutMap[category] = layout;
            this.createCard(category, items, layout, container);
        });
        StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
        if (state.searchTerm) this.applySearchFilter(state.searchTerm);
    }


static createSearchCard(container) {
    const category = 'جستجو';
    const layout = state.layoutMap[category] || { col: 1, row: 1, w: 8, h: 3, view: 'list' };

    // ⭐ ارتفاع از DimensionsManager
    const searchDim = DimensionsManager.config.find(d => d.key === 'searchCardHeight');
    const searchHeight = searchDim ? DimensionsManager.getValue(searchDim) : 57;
    const h = Math.max(1, Math.ceil(searchHeight / 20));

    layout.h = h;
    state.layoutMap[category] = layout;

    const card = document.createElement('div');
    card.className = 'bookmark-card search-card';
    card.dataset.category = category;
    card.style.gridColumnStart = layout.col;
    card.style.gridRowStart = layout.row;

    const actualWidthInPixels =
        (layout.w * CONFIG.GRID_CELL_SIZE) +
        ((layout.w - 1) * CONFIG.GRID_GAP) +
        CONFIG.HORIZONTAL_PIXEL_OFFSET;

    card.style.width = `${actualWidthInPixels}px`;
    card.style.gridColumnEnd = `span ${layout.w}`;
    card.style.gridRowEnd = `span ${h}`;
    // ⭐ ارتفاع از CSS var می‌آید، دیگر دستی ست نکن

    card.innerHTML = `
        <button class="card-btn btn-drag visible-on-edit"
                type="button"
                title="جابه‌جایی جستجو"
                aria-label="جابه‌جایی جستجو">::</button>
        <div class="card-content search-card-content"></div>
        <div class="resize-handle visible-on-edit"></div>
    `;

    container.appendChild(card);

    const searchContainer = document.getElementById('search-container');
    const searchCardContent = card.querySelector('.search-card-content');
    if (searchContainer && searchCardContent) {
        searchCardContent.appendChild(searchContainer);
        searchContainer.classList.remove('hidden');
        searchContainer.style.display = 'flex';
    }

    // Drag
    const dragBtn = card.querySelector('.btn-drag');
    if (dragBtn) {
        dragBtn.addEventListener('mousedown', e => {
            DragResizeManager.startDrag(e, card);
        });
    }

    // Resize (فقط عرض)
    const resizeEl = card.querySelector('.resize-handle');
    if (resizeEl) {
        resizeEl.addEventListener('mousedown', e => {
            if (e.button !== 0 || !state.isEditMode) return;
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX;
            const startW = parseInt((card.style.gridColumnEnd || 'span 8').split(' ')[1]) || 8;

            const onMove = (ev) => {
                const dx = ev.clientX - startX;
                const dW = Math.round(dx / (CONFIG.GRID_CELL_SIZE + CONFIG.GRID_GAP));
                const newW = Math.max(4, startW - dW);
                card.style.gridColumnEnd = `span ${newW}`;
                const w = (newW * CONFIG.GRID_CELL_SIZE) +
                          ((newW - 1) * CONFIG.GRID_GAP) +
                          CONFIG.HORIZONTAL_PIXEL_OFFSET;
                card.style.width = `${w}px`;
            };

            const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                const colEnd = card.style.gridColumnEnd;
                const newW = colEnd ? parseInt(colEnd.split(' ')[1]) : 8;
                if (state.layoutMap[category]) {
                    state.layoutMap[category].w = newW;
                }
                StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }
}


static createDateTimeCard(container) {
    const category = 'زمان و آب و هوا';
    const layout = state.layoutMap[category] || {
        col: 9, row: 1, w: 4, h: 7, view: 'list', mode: 'full'
    };
    if (!layout.mode) layout.mode = 'full';
    layout.h = Math.max(7, layout.h || 0);
    state.layoutMap[category] = layout;
    if (layout.mode === 'hidden') return;

    const card = document.createElement('div');
    card.className = 'bookmark-card datetime-weather-card';
    if (layout.mode !== 'full') card.classList.add('time-only');
    card.dataset.category = category;
    card.style.gridColumnStart = layout.col;
    card.style.gridRowStart = layout.row;

    const actualWidthInPixels =
        (layout.w * CONFIG.GRID_CELL_SIZE) +
        ((layout.w - 1) * CONFIG.GRID_GAP) +
        CONFIG.HORIZONTAL_PIXEL_OFFSET;

    card.style.width = `${actualWidthInPixels}px`;
    card.style.gridColumnEnd = `span ${layout.w}`;
    card.style.gridRowEnd = `span ${layout.h}`;

    let contentHtml = '';

    if (layout.mode === 'full') {
        contentHtml = `
            <button class="card-btn btn-drag visible-on-edit"
                    type="button"
                    title="جابه‌جایی کارت"
                    aria-label="جابه‌جایی کارت">::</button>

            <div class="card-content datetime-weather-content">
                <div class="weather-clock-widget">
                    <div class="weather-clock-layout">

                        <!-- ستون آب‌وهوا -->
                        <div class="weather-panel-column">
                            <div class="weather-city-line">
                                <span class="weather-city-pin" aria-hidden="true">⌖</span>
                                <span id="weather-location" class="weather-city-name">تهران</span>
                                <button class="city-change-btn visible-on-edit"
                                        id="weather-city-change-btn"
                                        type="button"
                                        title="تغییر شهر"
                                        aria-label="تغییر شهر">↻</button>
                            </div>

                            <div class="weather-temperature-row">
                                <div class="weather-temperature-group">
                                    <span id="weather-temp">--</span>
                                    <span class="weather-temperature-unit">°C</span>
                                </div>
                                <div class="weather-icon-orb">
                                    <span id="weather-icon">🌤️</span>
                                </div>
                            </div>

                            <div class="weather-meta-row">
                                <div class="weather-condition-pill">
                                    <span class="weather-condition-mark"></span>
                                    <span id="weather-desc">---</span>
                                </div>
                                <div class="weather-wind-strip">
                                    <span class="weather-wind-icon" aria-hidden="true">≈</span>
                                    <span class="weather-wind-label">باد</span>
                                    <strong id="weather-wind">-- ک.م/س</strong>
                                </div>
                            </div>
                        </div>

                        <!-- ستون ساعت -->
                        <div class="clock-panel-column">
                            <div class="clock-panel-eyebrow">
                                <span class="clock-panel-dot"></span>
                                <span>اکنون</span>
                            </div>

                            <div class="digital-time" id="digital-time">00:00</div>

                            <div class="clock-panel-divider"></div>

                            <div class="clock-date-row">
                                <div class="digital-date" id="digital-date">یکشنبه ۱ فروردین</div>
                                <a class="clock-panel-footer"
                                   href="https://www.bahesab.ir/time/calendar/"
                                   target="_blank"
                                   rel="noopener noreferrer"
                                   title="باز کردن تقویم شمسی">
                                    <span class="clock-footer-symbol">◇</span>
                                    <span>تقویم شمسی</span>
                                </a>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <div class="resize-handle visible-on-edit"></div>
        `;
    } else {
        contentHtml = `
            <button class="card-btn btn-drag visible-on-edit"
                    type="button"
                    title="جابه‌جایی کارت"
                    aria-label="جابه‌جایی کارت">::</button>

            <div class="card-content datetime-weather-content">
                <div class="weather-clock-widget is-clock-only">
                    <div class="clock-only-face">
                        <div class="clock-panel-eyebrow">
                            <span class="clock-panel-dot"></span>
                            <span>زمان فعلی</span>
                        </div>
                        <div class="digital-time" id="digital-time">00:00</div>
                        <div class="clock-date-row">
                            <div class="digital-date" id="digital-date">یکشنبه ۱ فروردین</div>
                            <a class="clock-panel-footer"
                               href="https://www.bahesab.ir/time/calendar/"
                               target="_blank"
                               rel="noopener noreferrer"
                               title="باز کردن تقویم شمسی">
                                <span class="clock-footer-symbol">◇</span>
                                <span>تقویم شمسی</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <div class="resize-handle visible-on-edit"></div>
        `;
    }

    card.innerHTML = contentHtml;
    container.appendChild(card);

    const dragBtn = card.querySelector('.btn-drag');
    const resizeEl = card.querySelector('.resize-handle');
    if (dragBtn) dragBtn.addEventListener('mousedown', e => DragResizeManager.startDrag(e, card));
    if (resizeEl) resizeEl.addEventListener('mousedown', e => DragResizeManager.startResize(e, card));

    this.loadCombinedStyles();
    this.initDigitalClock();

    if (layout.mode === 'full') {
        setTimeout(() => {
            this.initCombinedWeather();
            const cityChangeBtn = card.querySelector('#weather-city-change-btn');
            if (cityChangeBtn) {
                cityChangeBtn.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.openCitySelectorModal();
                });
            }
        }, 100);
    }
}


static loadCombinedStyles() {
    let style = document.getElementById('combined-styles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'combined-styles';
        document.head.appendChild(style);
    }

    const cutiveUrl = chrome.runtime.getURL('font/Cutive-Regular.ttf');

    style.textContent = `
        /* ===== فونت Cutive برای ساعت و دما ===== */
        @font-face {
            font-family: "Cutive";
            src: url("${cutiveUrl}") format("truetype");
            font-style: normal;
            font-weight: 400;
            font-display: swap;
        }

        .datetime-weather-content {
            width: 100%;
            height: 100% !important;
            min-width: 0;
            min-height: 0;
            padding: 0 !important;
            box-sizing: border-box;
            container-type: inline-size;
        }

        /* ===== ویجت ===== */
        .weather-clock-widget {
            --wc-clock-color: #1a2a52;
            --wc-temp-color: #1a2a52;

            position: relative;
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            overflow: hidden;
            padding: 10px 14px;
            border-radius: inherit;
            color: var(--text-color);
            background: transparent;
            font-family: var(--font-ui);
        }

        [data-theme="dark"] .weather-clock-widget {
            --wc-clock-color: #a8d8ff;
            --wc-temp-color: #a8d8ff;
        }

        .weather-clock-widget * {
            font-family: inherit;
        }

        /* فقط ساعت و دما → Cutive */
        .weather-clock-widget .digital-time,
        .weather-clock-widget #weather-temp {
            font-family: 'Cutive', 'Segoe UI', Tahoma, monospace, sans-serif !important;
            font-weight: 400 !important;
        }

        /* ===== چیدمان دو ستونی ===== */
        .weather-clock-layout {
            position: relative;
            display: grid;
            grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr);
            flex: 1 1 auto;
            height: 100%;
            min-height: 0;
            gap: 12px;
            direction: rtl;
        }

        .weather-panel-column {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-width: 0;
            padding-left: 12px;
            border-left: 1px solid var(--border-color);
            direction: rtl;
            gap: 6px;
        }

        /* ===== شهر ===== */
        .weather-city-line {
            display: flex;
            align-items: center;
            gap: 5px;
            min-width: 0;
        }
        .weather-city-pin {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 18px;
            width: 18px;
            height: 18px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--surface-muted);
            color: var(--primary-color);
            font-size: 13px;
            line-height: 1;
        }
        .weather-city-name {
            min-width: 0;
            overflow: hidden;
            color: var(--text-color);
            font-size: 12px;
            font-weight: 750;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .datetime-weather-card .weather-city-line .city-change-btn {
            display: none;
            flex: 0 0 22px;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            margin-right: auto;
            padding: 0;
            border: 1px solid var(--border-color);
            border-radius: 7px;
            background: var(--surface-muted);
            color: var(--text-color);
            font-size: 14px;
            opacity: 0;
            visibility: hidden;
            cursor: pointer;
            transition: background .2s ease, transform .2s ease;
        }
        .editing-mode .datetime-weather-card .weather-city-line .city-change-btn.visible-on-edit {
            display: inline-flex !important;
            opacity: 1;
            visibility: visible;
        }
        .datetime-weather-card .weather-city-line .city-change-btn:hover {
            background: var(--primary-soft);
            transform: rotate(30deg);
        }

        /* ===== دما + آیکون ===== */
        .weather-temperature-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            min-width: 0;
            direction: ltr;
        }
        .weather-temperature-group {
            display: flex;
            align-items: flex-start;
            gap: 2px;
            flex: 1 1 auto;
            min-width: 0;
            white-space: nowrap;
        }
        .weather-temperature-group #weather-temp {
            font-size: clamp(30px, 3.4vw, 40px);
            letter-spacing: 0;
            line-height: 1;
            color: var(--wc-temp-color);
            transition: color .3s ease;
        }
        .weather-temperature-unit {
            margin-top: 4px;
            color: var(--muted-color);
            font-size: 11px;
            font-weight: 600;
        }
        .weather-icon-orb {
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 44px;
            width: 44px;
            height: 44px;
            box-sizing: border-box;
            border: 1px solid var(--border-color);
            border-radius: 14px;
            background: var(--surface-muted);
            font-size: 24px;
        }

        /* ===== آفتابی + باد کنار هم ===== */
        .weather-meta-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
            min-width: 0;
            max-width: 100%;
        }

        .weather-condition-pill,
        .weather-wind-strip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            max-width: 100%;
            padding: 3px 9px;
            overflow: hidden;
            box-sizing: border-box;
            border: 1px solid var(--border-color);
            border-radius: 30px;
            background: var(--surface-muted);
            color: var(--text-color);
            font-size: 10px;
            font-weight: 600;
            white-space: nowrap;
        }

        .weather-condition-mark {
            flex: 0 0 5px;
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: var(--success-color);
        }
        .weather-condition-pill #weather-desc {
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .weather-wind-icon {
            color: var(--primary-color);
            font-size: 13px;
            line-height: 1;
            flex-shrink: 0;
        }
        .weather-wind-label {
            color: var(--muted-color);
            font-size: 10px;
        }
        .weather-wind-strip #weather-wind {
            color: var(--text-color);
            font-size: 10px;
            font-weight: 700;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* ===== ساعت ===== */
        .clock-panel-column {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-width: 0;
            padding: 2px 0;
            direction: rtl;
        }
        .clock-panel-eyebrow {
            display: flex;
            align-items: center;
            gap: 5px;
            color: var(--muted-color);
            font-size: 10px;
            font-weight: 500;
        }
        .clock-panel-dot {
            flex: 0 0 5px;
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: var(--primary-color);
        }
        .weather-clock-widget .digital-time {
            width: 100%;
            margin: 4px 0 5px;
            color: var(--wc-clock-color) !important;
            font-size: clamp(26px, 3.2vw, 36px) !important;
            letter-spacing: -0.5px;
            line-height: 1.1;
            text-align: left !important;
            direction: ltr;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
            unicode-bidi: plaintext;
            transition: color .3s ease;
        }
        .clock-panel-divider {
            width: 100%;
            height: 1px;
            margin-bottom: 6px;
            background: var(--border-color);
        }

        /* ===== تاریخ + تقویم در یک خط ===== */
        .clock-date-row {
            display: flex;
            align-items: center;
            gap: 6px;
            width: 100%;
            min-width: 0;
        }
        .clock-date-row .digital-date {
            flex: 1 1 auto;
            min-width: 0;
            color: var(--muted-color) !important;
            font-size: 11px !important;
            font-weight: 500;
            line-height: 1.5;
            text-align: right !important;
            direction: rtl;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
		.clock-date-row .clock-panel-footer {
			flex: 0 0 auto;
			display: inline-flex;
			align-items: center;
			gap: 4px;
			margin-top: 0 !important;
			padding: 3px 8px;
			border: 1px solid var(--primary-color);
			border-radius: 7px;
			background: var(--primary-soft);
			color: var(--primary-color);
			font-size: 9.5px;
			font-weight: 700;
			text-decoration: none;
			cursor: pointer;
			white-space: nowrap;
			transition: background .2s ease, color .2s ease, transform .1s ease, box-shadow .2s ease;
		}
		.clock-date-row .clock-panel-footer:hover {
			background: var(--primary-color);
			color: #fff;
			border-color: var(--primary-color);
			text-decoration: none;
			transform: translateY(-1px);
			box-shadow: 0 3px 8px rgba(91, 92, 226, .25);
		}
		.clock-date-row .clock-panel-footer:hover .clock-footer-symbol {
			color: #fff;
		}
        .clock-footer-symbol {
            color: var(--primary-color);
            font-size: 10px;
			transition: color .2s ease;
        }

        /* ===== حالت فقط ساعت ===== */
        .weather-clock-widget.is-clock-only {
            padding: 12px 16px;
        }
        .is-clock-only .clock-only-face {
            display: flex;
            flex: 1 1 auto;
            flex-direction: column;
            align-items: flex-start;
            justify-content: center;
            min-height: 0;
            gap: 6px;
            direction: rtl;
        }
        .is-clock-only .digital-time {
            margin: 0 !important;
            font-size: clamp(32px, 4vw, 44px) !important;
        }
        .is-clock-only .clock-date-row {
            margin-top: 2px;
        }

        /* ===== کارت باریک ===== */
        @container (max-width: 340px) {
            .weather-clock-widget { padding: 8px 12px; }
            .weather-clock-layout { gap: 9px; }
            .weather-panel-column { padding-left: 9px; }
            .weather-temperature-group #weather-temp { font-size: 26px; }
            .weather-icon-orb {
                flex-basis: 38px;
                width: 38px;
                height: 38px;
                border-radius: 12px;
                font-size: 20px;
            }
            .weather-clock-widget .digital-time {
                font-size: clamp(20px, 7cqw, 28px) !important;
            }
            .weather-meta-row { gap: 4px; }
        }
    `;
}

static initDigitalClock() {
    const persianMonths = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
    const persianDays = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
    const toPersianDigits = (num) => {
        const pd = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        return num.toString().replace(/\d/g, d => pd[d]);
    };
    const updateDigitalClock = () => {
        const now = new Date();
        const jalali = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());

        // ⭐ ساعت با اعداد لاتین (برای فونت Cutive)
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        // تاریخ با اعداد فارسی (چون ماه/روز فارسیه)
        const dateStr = `${persianDays[now.getDay()]} ${toPersianDigits(jalali[2])} ${persianMonths[jalali[1] - 1]}`;

        const timeEl = document.getElementById('digital-time');
        const dateEl = document.getElementById('digital-date');
        if (timeEl) timeEl.textContent = timeStr;
        if (dateEl) dateEl.textContent = dateStr;
    };
    updateDigitalClock();
    setInterval(updateDigitalClock, 60000);
}


    static async initCombinedWeather() {
        try {
            const savedCity = await StorageManager.get(CONFIG.STORAGE_KEYS.SELECTED_CITY);
            const locEl = document.getElementById('weather-location');
            if (locEl) locEl.textContent = savedCity ? savedCity.name : 'تهران';
            const weatherData = await WeatherManager.getWeather();
            const tempEl = document.getElementById('weather-temp');
            if (tempEl) tempEl.textContent = weatherData.temperature;
            const iconEl = document.getElementById('weather-icon');
            if (iconEl) iconEl.textContent = WeatherManager.getWeatherIcon(weatherData.condition);
            const descEl = document.getElementById('weather-desc');
            if (descEl) descEl.textContent = weatherData.condition;
            const windEl = document.getElementById('weather-wind');
            if (windEl) windEl.textContent = `${weatherData.windSpeed} ک.م/ساعت`;
            setTimeout(() => this.initCombinedWeather(), 10 * 60 * 1000);
        } catch (error) {
            const fallback = WeatherManager.getFallbackWeather();
            const els = {
                'weather-temp': fallback.temperature,
                'weather-desc': fallback.condition,
                'weather-wind': `${fallback.windSpeed} ک.م/ساعت`,
                'weather-location': 'تهران',
                'weather-icon': WeatherManager.getWeatherIcon(fallback.condition)
            };
            Object.entries(els).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            });
        }
    }

    static async refreshWeather() {
        try {
            const weatherData = await WeatherManager.getWeather();
            const els = {
                'weather-temp': weatherData.temperature,
                'weather-desc': weatherData.condition,
                'weather-wind': `${weatherData.windSpeed} ک.م/ساعت`,
                'weather-icon': WeatherManager.getWeatherIcon(weatherData.condition)
            };
            Object.entries(els).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            });
        } catch (error) {
            const fallback = WeatherManager.getFallbackWeather();
            const els = {
                'weather-temp': fallback.temperature,
                'weather-desc': fallback.condition,
                'weather-wind': `${fallback.windSpeed} ک.م/ساعت`,
                'weather-icon': WeatherManager.getWeatherIcon(fallback.condition)
            };
            Object.entries(els).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            });
        }
    }

    static categorizeBookmarks(bookmarks) {
        const categories = {};
        if (!Array.isArray(bookmarks)) {
            if (bookmarks.bookmarks && Array.isArray(bookmarks.bookmarks)) bookmarks = bookmarks.bookmarks;
            else if (typeof bookmarks === 'object') bookmarks = Object.values(bookmarks);
            else return { 'سایر': [] };
        }
        bookmarks.forEach(item => {
            if (!item || !item.title) return;
            const isFolder = item.children && !item.url;
            if (isFolder) {
                const categoryName = item.title;
                categories[categoryName] = item.children || [];
                if (item.children) {
                    item.children.forEach(child => {
                        child._parentCategory = categoryName;
                        child._parentId = item.id;
                    });
                }
            } else if (item.url) {
                const category = item.category || 'سایر';
                if (!categories[category]) categories[category] = [];
                categories[category].push(item);
            }
        });
        if (Object.keys(categories).length === 0) categories['سایر'] = [];
        return categories;
    }

    static createCard(category, items, layout, container) {
        const card = document.createElement('div');
        card.className = 'bookmark-card';
        card.dataset.category = category;
        card.style.gridColumnStart = layout.col;
        card.style.gridRowStart = layout.row;
        const actualWidthInPixels = (layout.w * CONFIG.GRID_CELL_SIZE) + ((layout.w - 1) * CONFIG.GRID_GAP) + CONFIG.HORIZONTAL_PIXEL_OFFSET;
        card.style.width = `${actualWidthInPixels}px`;
        card.style.gridColumnEnd = `span ${layout.w}`;
        card.style.gridRowEnd = `span ${layout.h}`;
        card.innerHTML = `
            <div class="card-header">
                <div class="card-title">${category}</div>
                <button class="card-btn btn-drag visible-on-edit">::</button>
            </div>
            <div class="card-breadcrumbs"><span class="crumb">خانه</span></div>
            <div class="card-content"><div class="bookmark-tiles"></div></div>
            <div class="resize-handle visible-on-edit"></div>
        `;
        const titleEl = card.querySelector('.card-title');
        const dragBtn = card.querySelector('.btn-drag');
        const resizeEl = card.querySelector('.resize-handle');
        if (titleEl) {
            titleEl.addEventListener('click', () => {
                if (state.isEditMode) {
                    const newName = prompt("نام جدید:", category);
                    if (newName && newName !== category) {
                        delete state.layoutMap[category];
                        state.layoutMap[newName] = layout;
                        state.bookmarks.forEach(bm => { if (bm.category === category) bm.category = newName; });
                        this.renderDashboard();
                    }
                }
            });
        }
        if (dragBtn) dragBtn.addEventListener('mousedown', (e) => DragResizeManager.startDrag(e, card));
        if (resizeEl) resizeEl.addEventListener('mousedown', (e) => DragResizeManager.startResize(e, card));
        this.renderCardContent(card, items, layout.view || "list");
        container.appendChild(card);
    }

    static async renderCardContent(cardEl, items, viewMode) {
        const tilesContainer = cardEl.querySelector('.bookmark-tiles');
        const breadcrumbs = cardEl.querySelector('.card-breadcrumbs');
        if (!tilesContainer) return;
        tilesContainer.innerHTML = '';
        tilesContainer.classList.toggle("view-grid", viewMode === "grid");
        tilesContainer.classList.toggle("view-list", viewMode === "list");
        const category = cardEl.dataset.category;
        const currentPath = state.currentPaths[category] || [];
        this.renderBreadcrumbs(breadcrumbs, category, currentPath, items);
        if (state.isEditMode && breadcrumbs) this.addControlButtons(breadcrumbs, category, currentPath);
        try {
            const currentLevelItems = this.getCurrentLevelItems(category, items, currentPath);
            if (!currentLevelItems || currentLevelItems.length === 0) {
                tilesContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #666;"><p>📂 این پوشه خالی است</p></div>`;
                return;
            }
            for (const item of currentLevelItems) {
                const tile = await this.createTile(item, viewMode, category, currentPath);
                if (tile) tilesContainer.appendChild(tile);
            }
        } catch (error) {
            console.error('❌ خطا:', error);
            tilesContainer.innerHTML = `<div class="error-message"><p>خطا در بارگذاری</p><button onclick="location.reload()">بارگذاری مجدد</button></div>`;
        }
    }

    static getCurrentLevelItems(category, items, currentPath) {
        if (!currentPath || currentPath.length === 0) return items;
        let currentLevel = items;
        for (let i = 0; i < currentPath.length; i++) {
            const folderId = currentPath[i];
            const nextFolder = currentLevel.find(item => item.id === folderId && (item.type === 'folder' || item.children) && !item.url);
            if (!nextFolder) return [];
            if (i === currentPath.length - 1) return nextFolder.children || [];
            currentLevel = nextFolder.children || [];
        }
        return currentLevel;
    }

    static renderBreadcrumbs(breadcrumbsEl, category, currentPath, allItems) {
        if (!breadcrumbsEl) return;
        breadcrumbsEl.innerHTML = '';
        const context = { category, navigate: this.navigateToPath.bind(this) };
        breadcrumbsEl.appendChild(this.createBreadcrumbButton('خانه', [], context));
        if (currentPath && currentPath.length > 0) {
            let accumulatedPath = [];
            let currentItems = allItems;
            for (let i = 0; i < currentPath.length; i++) {
                const folderId = currentPath[i];
                const sep = document.createElement('span');
                sep.textContent = '›';
                sep.style.margin = '0 8px';
                sep.style.color = '#ff0000';
                breadcrumbsEl.appendChild(sep);
                let folderName = `پوشه ${i + 1}`;
                if (currentItems && Array.isArray(currentItems)) {
                    const folder = currentItems.find(item => item && item.id === folderId);
                    if (folder && folder.title) folderName = folder.title;
                }
                accumulatedPath = currentPath.slice(0, i + 1);
                breadcrumbsEl.appendChild(this.createBreadcrumbButton(folderName, accumulatedPath, context));
                if (currentItems && Array.isArray(currentItems)) {
                    const folder = currentItems.find(item => item && item.id === folderId);
                    if (folder && folder.children) currentItems = folder.children;
                }
            }
        }
    }

    static createBreadcrumbButton(text, path, context) {
        const button = document.createElement('button');
        button.textContent = text;
        button.className = 'crumb';
        Object.assign(button.style, {
            background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer',
            padding: '2px 8px', margin: '0 2px', fontSize: '14px',
            fontFamily: '"Vazirmatn", Tahoma, sans-serif', fontWeight: '400', textDecoration: 'underline'
        });
        button.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (context.navigate) context.navigate(context.category, path);
        });
        return button;
    }

    static navigateToPath(category, newPath) {
        state.currentPaths[category] = newPath;
        this.updateCard(category);
    }

    static async updateCard(category) {
        const container = document.getElementById('grid-container');
        if (!container) return;
        let targetCard = null;
        for (const card of container.querySelectorAll('.bookmark-card')) {
            if (card.dataset.category === category) { targetCard = card; break; }
        }
        if (!targetCard) { this.renderDashboard(); return; }
        const items = this.categorizeBookmarks(state.bookmarks)[category] || [];
        const layout = state.layoutMap[category] || { view: 'list' };
        await this.renderCardContent(targetCard, items, layout.view);
    }

    static async createTile(item, viewMode, category, currentPath) {
        try {
            const isFolder = item.children && !item.url;
            const tile = document.createElement(isFolder ? "div" : "a");
            tile.className = "tile";
            tile.dataset.id = item.id;
            tile.dataset.category = category;
            if (isFolder) {
                tile.classList.add("tile-folder");
                tile.addEventListener("click", (e) => {
                    e.preventDefault();
                    if (!state.isEditMode) {
                        this.navigateToPath(category, [...(currentPath || []), item.id]);
                    }
                });
            } else if (item.url) {
                tile.href = item.url;
                tile.target = "_self";
            }
            tile.classList.toggle("tile-grid-mode", viewMode === "grid");
            const img = document.createElement("img");
            img.className = "tile-icon";
            if (isFolder) {
                img.src = CONFIG.FOLDER_ICON_PATH;
            } else if (item.url) {
                img.src = CONFIG.FALLBACK_ICON_PATH;
                FaviconManager.resolveFavicon(item.url).then(icon => {
                    if (icon && icon !== CONFIG.FALLBACK_ICON_PATH) {
                        const testImg = new Image();
                        testImg.onload = () => { img.src = icon; };
                        testImg.src = icon;
                    } else {
                        const customIcon = state.customIcons?.[item.url];
                        if (customIcon) {
                            const testImg = new Image();
                            testImg.onload = () => { img.src = customIcon; };
                            testImg.src = customIcon;
                        }
                    }
                }).catch(() => {});
                img.onerror = function() {
                    if (this.src !== CONFIG.FALLBACK_ICON_PATH) this.src = CONFIG.FALLBACK_ICON_PATH;
                    this.onerror = null;
                };
            } else {
                img.src = CONFIG.FALLBACK_ICON_PATH;
            }
            const nameDiv = document.createElement("div");
            nameDiv.className = "tile-name";
            nameDiv.textContent = item.title;
            nameDiv.title = item.description || item.title;
            tile.appendChild(img);
            tile.appendChild(nameDiv);
            return tile;
        } catch (error) { console.error('خطا در createTile:', error, item); return null; }
    }

    static addControlButtons(breadcrumbs, category, currentPath) {
        if (!breadcrumbs) return;
        breadcrumbs.querySelectorAll('.card-control-btn').forEach(btn => btn.remove());
        if (!state.isEditMode) return;
        const viewBtn = document.createElement('button');
        viewBtn.className = "card-control-btn btn-view-crumb";
        viewBtn.innerHTML = "👁️";
        viewBtn.title = "تغییر حالت نمایش";
        viewBtn.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            const layout = state.layoutMap[category];
            if (layout) {
                layout.view = layout.view === "grid" ? "list" : "grid";
                StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
                this.renderDashboard();
            }
        });
        breadcrumbs.appendChild(viewBtn);
        if (currentPath && currentPath.length > 0) {
            const backBtn = document.createElement('button');
            backBtn.className = "card-control-btn btn-back-crumb";
            backBtn.innerHTML = "↩️";
            backBtn.title = "برگشت";
            backBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                this.navigateToPath(category, currentPath.slice(0, -1));
            });
            breadcrumbs.appendChild(backBtn);
        }
    }

    static applySearchFilter(searchTerm) {
        const tiles = document.querySelectorAll('.tile');
        if (!searchTerm || searchTerm.trim() === '') {
            tiles.forEach(tile => tile.classList.remove('filtered-out', 'highlighted'));
            return;
        }
        tiles.forEach(tile => {
            const title = tile.querySelector('.tile-name')?.textContent.toLowerCase() || '';
            const matches = title.includes(searchTerm);
            tile.classList.toggle('filtered-out', !matches);
            tile.classList.toggle('highlighted', matches);
        });
    }

    static openCitySelectorModal() {
        let modal = document.getElementById('global-city-selector');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'global-city-selector';
            modal.className = 'city-selector-modal';
            modal.innerHTML = `
                <div class="city-selector-overlay"></div>
                <div class="city-selector-content">
                    <div class="city-selector-header">
                        <h3>🌍 انتخاب شهر</h3>
                        <button class="close-city-selector" id="close-global-city-selector">×</button>
                    </div>
                    <div class="city-input-container">
                        <input type="text" id="global-city-search-input" class="city-search-input" placeholder="نام شهر را وارد کنید" autocomplete="off">
                        <div class="city-suggestions" id="global-city-suggestions"></div>
                    </div>
                    <div class="city-selector-buttons">
                        <button id="global-confirm-city-btn" class="btn-primary">تأیید</button>
                        <button id="global-cancel-city-btn" class="btn-secondary">انصراف</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            this.addCityModalStyles();
            this.setupCityModalEvents();
        }
        modal.classList.remove('hidden');
        setTimeout(() => {
            const searchInput = document.getElementById('global-city-search-input');
            if (searchInput) searchInput.focus();
        }, 100);
    }

    static addCityModalStyles() {
        if (document.getElementById('city-modal-styles')) return;
        const style = document.createElement('style');
        style.id = 'city-modal-styles';
        style.textContent = `
            .city-selector-modal { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 1000; }
            .city-selector-modal.hidden { display: none; }
            .city-selector-overlay { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(3px); }
            .city-selector-content { position: relative; background: white; border-radius: 16px; padding: 25px; width: 90%; max-width: 500px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); z-index: 1001; direction: rtl; }
            [data-theme="dark"] .city-selector-content { background: #1f2937; color: #f9fafb; }
            .city-selector-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #e5e7eb; }
            .city-selector-header h3 { margin: 0; font-family: 'Vazirmatn', sans-serif; font-size: 1.4rem; color: #374151; }
            .close-city-selector { background: none; border: none; font-size: 1.8rem; cursor: pointer; color: #6b7280; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
            .city-input-container { margin-bottom: 20px; position: relative; }
            .city-search-input { width: 100%; padding: 12px 16px; border: 2px solid #e5e7eb; border-radius: 10px; font-family: 'Vazirmatn', sans-serif; font-size: 1rem; box-sizing: border-box; direction: rtl; }
            [data-theme="dark"] .city-search-input { background: #374151; border-color: #4b5563; color: #f9fafb; }
            .city-suggestions { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e5e7eb; border-radius: 8px; max-height: 250px; overflow-y: auto; display: none; z-index: 1002; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); direction: rtl; }
            [data-theme="dark"] .city-suggestions { background: #374151; border-color: #4b5563; }
            .city-suggestion { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f3f4f6; font-family: 'Vazirmatn', sans-serif; text-align: right; }
            .city-suggestion:hover { background: #f3f4f6; }
            .city-selector-buttons { display: flex; gap: 12px; justify-content: flex-end; }
            .btn-primary { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-family: 'Vazirmatn', sans-serif; font-weight: 600; }
            .btn-secondary { background: #6b7280; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-family: 'Vazirmatn', sans-serif; font-weight: 600; }
        `;
        document.head.appendChild(style);
    }

    static setupCityModalEvents() {
        const modal = document.getElementById('global-city-selector');
        const citySearchInput = document.getElementById('global-city-search-input');
        const citySuggestions = document.getElementById('global-city-suggestions');
        const confirmBtn = document.getElementById('global-confirm-city-btn');
        const cancelBtn = document.getElementById('global-cancel-city-btn');
        const closeBtn = document.getElementById('close-global-city-selector');
        const overlay = modal?.querySelector('.city-selector-overlay');
        if (!modal) return;
        let selectedCity = null;
        const closeModal = () => {
            modal.classList.add('hidden');
            if (citySearchInput) citySearchInput.value = '';
            if (citySuggestions) { citySuggestions.innerHTML = ''; citySuggestions.style.display = 'none'; }
            selectedCity = null;
        };
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        if (overlay) overlay.addEventListener('click', closeModal);
        let searchTimeout;
        if (citySearchInput) {
            citySearchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                const query = e.target.value.trim();
                if (query.length < 2) {
                    if (citySuggestions) { citySuggestions.innerHTML = ''; citySuggestions.style.display = 'none'; }
                    return;
                }
                searchTimeout = setTimeout(async () => { await this.searchCities(query, citySuggestions); }, 500);
            });
        }
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                const cityName = citySearchInput ? citySearchInput.value.trim() : '';
                if (!cityName) { alert('لطفاً نام شهر را وارد کنید'); return; }
                try {
                    let cityToSave = selectedCity;
                    if (!cityToSave) {
                        const cities = await this.searchCitiesAPI(cityName);
                        if (cities && cities.length > 0) {
                            cityToSave = { name: cities[0].name, coordinates: `${cities[0].lat},${cities[0].lon}`, fullName: cities[0].display_name };
                        } else { alert('شهر "' + cityName + '" پیدا نشد.'); return; }
                    }
                    await StorageManager.set(CONFIG.STORAGE_KEYS.SELECTED_CITY, cityToSave);
                    const locEl = document.getElementById('weather-location');
                    if (locEl) locEl.textContent = cityToSave.name;
                    closeModal();
                    await this.refreshWeather();
                } catch (error) { alert('خطا در ذخیره شهر: ' + error.message); }
            });
        }
        if (citySuggestions) {
            citySuggestions.addEventListener('click', (e) => {
                const suggestion = e.target.closest('.city-suggestion');
                if (suggestion && suggestion.dataset.city) {
                    try {
                        const cityData = JSON.parse(suggestion.dataset.city);
                        selectedCity = { name: cityData.display_name.split(',')[0], coordinates: `${cityData.lat},${cityData.lon}`, fullName: cityData.display_name };
                        if (citySearchInput) citySearchInput.value = selectedCity.name;
                        citySuggestions.innerHTML = '';
                        citySuggestions.style.display = 'none';
                    } catch (error) { console.error(error); }
                }
            });
        }
    }

    static async searchCities(query, suggestionsContainer) {
        try {
            const cities = await this.searchCitiesAPI(query);
            suggestionsContainer.innerHTML = '';
            if (cities.length === 0) {
                suggestionsContainer.innerHTML = '<div class="city-suggestion">شهری یافت نشد</div>';
                suggestionsContainer.style.display = 'block';
                return;
            }
            cities.forEach(city => {
                const div = document.createElement('div');
                div.className = 'city-suggestion';
                div.textContent = city.display_name.split(',').slice(0, 2).join(', ');
                div.dataset.city = JSON.stringify({ display_name: city.display_name, lat: city.lat, lon: city.lon });
                suggestionsContainer.appendChild(div);
            });
            suggestionsContainer.style.display = 'block';
        } catch (error) {
            suggestionsContainer.innerHTML = '<div class="city-suggestion">خطا در جستجو</div>';
            suggestionsContainer.style.display = 'block';
        }
    }

	static async searchCitiesAPI(query) {
		if (!query || query.trim().length < 2) return [];
		try {
			const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=fa&format=json&country=IR`;
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			const data = await response.json();
			if (!data.results || !Array.isArray(data.results)) return [];
			return data.results.map(city => ({
				name: city.name,
				lat: city.latitude,
				lon: city.longitude,
				display_name: city.name + (city.admin1 ? `، ${city.admin1}` : '') + (city.country ? `، ${city.country}` : '')
			}));
		} catch (error) { console.error('خطا در جستجوی شهر:', error); return []; }
	}
}

// ==================== Search Manager ====================
class SearchManager {
    static flattenBookmarks(items, path = []) {
        let results = [];
        if (!items || !Array.isArray(items)) return results;
        for (const item of items) {
            results.push({ ...item, _path: path });
            if (item.children && Array.isArray(item.children) && item.children.length > 0) {
                results = results.concat(this.flattenBookmarks(item.children, [...path, item.title]));
            }
        }
        return results;
    }

    static searchAllBookmarks(searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            return { results: [], total: 0, folders: 0, bookmarks: 0 };
        }
        const allItems = this.flattenBookmarks(state.bookmarks);
        const term = searchTerm.toLowerCase().trim();
        const results = allItems.filter(item => {
            const title = (item.title || '').toLowerCase();
            const url = (item.url || '').toLowerCase();
            return title.includes(term) || url.includes(term);
        });
        return {
            results,
            total: results.length,
            folders: results.filter(item => !item.url && item.children).length,
            bookmarks: results.filter(item => item.url && !item.children).length
        };
    }

    static getReferenceRect() {
        // اولویت ۱: کارت جستجو (حالت card)
        const searchCard = document.querySelector('.search-card');
        if (searchCard) {
            return searchCard.getBoundingClientRect();
        }
        // اولویت ۲: خود سرچ‌باکس (حالت شناور)
        const searchContainer = document.getElementById('search-container');
        if (searchContainer && searchContainer.style.display !== 'none' && !searchContainer.classList.contains('hidden')) {
            return searchContainer.getBoundingClientRect();
        }
        // اولویت ۳: wrapper شناور
        const searchWrapper = document.querySelector('.search-top-wrapper');
        if (searchWrapper && searchWrapper.style.display !== 'none') {
            return searchWrapper.getBoundingClientRect();
        }
        return null;
    }

    static showSearchResults(searchTerm, results) {
        const existing = document.getElementById('search-results-modal');
        if (existing) existing.remove();

        const rect = this.getReferenceRect();
        if (!rect) return;

        const bookmarksOnly = results.results.filter(item => item.url && !item.children);

        const modal = document.createElement('div');
        modal.id = 'search-results-modal';

        const overlay = document.createElement('div');
        overlay.className = 'search-results-overlay';
        overlay.onclick = () => modal.remove();

        const panel = document.createElement('div');
        panel.className = 'search-results-panel';
        panel.style.top = `${rect.bottom + 6}px`;
        panel.style.left = `${rect.left}px`;
        panel.style.width = `${rect.width}px`;

        // Header
        const header = document.createElement('div');
        header.className = 'search-results-header';

        const titleEl = document.createElement('span');
        titleEl.className = 'sr-header-title';
        titleEl.textContent = `🔍 نتایج برای "${searchTerm}"`;

        const countEl = document.createElement('span');
        countEl.className = 'sr-header-count';
        countEl.textContent = `${bookmarksOnly.length} مورد`;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'sr-close';
        closeBtn.setAttribute('aria-label', 'بستن');
        closeBtn.textContent = '×';
        closeBtn.onclick = () => modal.remove();

        header.appendChild(titleEl);
        header.appendChild(countEl);
        header.appendChild(closeBtn);

        // Body
        const body = document.createElement('div');
        body.className = 'search-results-body';

        if (bookmarksOnly.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'sr-empty';
            empty.textContent = `❌ چیزی برای "${searchTerm}" پیدا نشد`;
            body.appendChild(empty);
        } else {
            bookmarksOnly.slice(0, 30).forEach(item => {
                const link = document.createElement('a');
                link.className = 'search-result-item';
                link.href = item.url;
                link.target = '_self';

                const icon = document.createElement('span');
                icon.className = 'sr-item-icon';
                icon.textContent = '🔗';

                const info = document.createElement('div');
                info.className = 'sr-item-info';

                const title = document.createElement('div');
                title.className = 'sr-item-title';
                title.textContent = item.title || 'بی‌نام';
                info.appendChild(title);

                // مسیر (breadcrumb) — اگه بوکمارک داخل پوشه باشه
                if (item._path && item._path.length > 0) {
                    const pathEl = document.createElement('div');
                    pathEl.className = 'sr-item-path';
                    pathEl.textContent = item._path.join(' › ');
                    info.appendChild(pathEl);
                }

                link.appendChild(icon);
                link.appendChild(info);
                body.appendChild(link);
            });
        }

        panel.appendChild(header);
        panel.appendChild(body);
        modal.appendChild(overlay);
        modal.appendChild(panel);
        document.body.appendChild(modal);
    }

    static escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}


// ==================== Event Manager ====================
class EventManager {
static setup() {
const imageCompressorBtn = document.getElementById("image-compressor-btn");
if (imageCompressorBtn) imageCompressorBtn.addEventListener("click", () => {
	chrome.tabs.update({ url: chrome.runtime.getURL("Image_Compressor/Image_Compressor.html") });
});

const perspectiveCropBtn = document.getElementById("perspective-crop-btn");
if (perspectiveCropBtn) perspectiveCropBtn.addEventListener("click", () => {
	chrome.tabs.update({ url: chrome.runtime.getURL("PerspectiveCrop/index.html") });
});

const pdfBtn = document.getElementById("pdf-btn");
if (pdfBtn) pdfBtn.addEventListener("click", () => {
	chrome.tabs.update({ url: chrome.runtime.getURL("Image_to_pdf/Image_to_pdf.html") });
});

const removeBgBtn = document.getElementById("remove-bg-btn");
if (removeBgBtn) removeBgBtn.addEventListener("click", () => {
	window.location.href = "https://www.remove.bg/upload";
});

const imageToTextBtn = document.getElementById("image-to-text-btn");
if (imageToTextBtn) imageToTextBtn.addEventListener("click", () => {
	window.location.href = "https://images.google.com";
});

const pdfEditorBtn = document.getElementById("pdf-editor-btn");
if (pdfEditorBtn) pdfEditorBtn.addEventListener("click", () => {
	window.location.href = "https://www.ilovepdf.com";
});

const persianCalendarBtn = document.getElementById("persian-calendar-btn");
if (persianCalendarBtn) persianCalendarBtn.addEventListener("click", () => {
	window.location.href = "https://www.bahesab.ir/time/calendar/";
});

const historyBtn = document.getElementById("history-btn");
if (historyBtn) historyBtn.addEventListener("click", () => {
	chrome.tabs.update({ url: "chrome://history" });
});

const downloadsBtn = document.getElementById("downloads-btn");
if (downloadsBtn) downloadsBtn.addEventListener("click", () => {
	chrome.tabs.update({ url: "chrome://downloads" });
});

const passwordBtn = document.getElementById("password-manager-btn");
if (passwordBtn) passwordBtn.addEventListener("click", () => {
	chrome.tabs.update({ url: "chrome://password-manager" });
});

const bookmarksBtn = document.getElementById("bookmarks-btn");
if (bookmarksBtn) bookmarksBtn.addEventListener("click", () => {
	chrome.tabs.update({ url: chrome.runtime.getURL("bookmark_manager/index.html") });
});

const extensionsBtn = document.getElementById("extensions-btn");
if (extensionsBtn) extensionsBtn.addEventListener("click", () => {
	chrome.tabs.update({ url: "chrome://extensions" });
});
    const editModeBtn = document.getElementById('edit-mode-btn');
    if (editModeBtn) {
        editModeBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            state.isEditMode = !state.isEditMode;
            const subControls = document.getElementById('sub-controls');
            editModeBtn.textContent = state.isEditMode ? '✅' : '✏️';
            editModeBtn.title = state.isEditMode ? 'خروج از حالت ویرایش' : 'حالت ویرایش';
            if (subControls) {
                if (state.isEditMode) {
                    subControls.classList.remove('hidden-controls');
                    subControls.classList.add('visible-controls');
                } else {
                    subControls.classList.remove('visible-controls');
                    subControls.classList.add('hidden-controls');
                }
            }
            Renderer.renderDashboard();
        });
    }

    const refreshBtn = document.getElementById('refresh-bookmarks-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', async () => {
        if (!confirm('آیا از به‌روزرسانی بوکمارک‌ها اطمینان دارید؟')) return;
        try {
            await BookmarkManager.loadBookmarks();
            await Renderer.renderDashboard();
            alert('بوکمارک‌ها به‌روزرسانی شدند.');
        } catch (error) { alert('خطا: ' + error.message); }
    });

    const themeBtn = document.getElementById('toggle-theme-btn');
    if (themeBtn) themeBtn.addEventListener('click', () => { ThemeManager.toggleTheme(); });

	// ========== Search ==========
	const searchBtn = document.getElementById('search-btn');
	const closeSearchMainBtn = document.getElementById('close-search-btn');
	const searchContainer = document.getElementById('search-container');
	const searchInput = document.getElementById('bookmark-search');
	if (searchBtn && closeSearchMainBtn && searchContainer && searchInput) {
		const openSearch = () => {
			searchContainer.style.display = 'flex';
			searchContainer.classList.remove('hidden');
			searchBtn.style.display = 'none';
			closeSearchMainBtn.style.display = 'flex';
			setTimeout(() => searchInput.focus(), 100);
		};
		const closeSearch = () => {
			searchContainer.style.display = 'none';
			searchContainer.classList.add('hidden');
			searchBtn.style.display = 'flex';
			closeSearchMainBtn.style.display = 'none';
			searchInput.value = '';
			const modal = document.getElementById('search-results-modal');
			if (modal) modal.remove();
			if (typeof Renderer !== 'undefined' && Renderer.applySearchFilter) Renderer.applySearchFilter('');
		};
		searchBtn.addEventListener('click', openSearch);
		closeSearchMainBtn.addEventListener('click', closeSearch);

		let searchTimeout;
		searchInput.addEventListener('input', (e) => {
			clearTimeout(searchTimeout);
			const term = e.target.value.trim();
			const existingModal = document.getElementById('search-results-modal');
			if (existingModal) existingModal.remove();
			if (term.length === 0) {
				if (typeof Renderer !== 'undefined' && Renderer.applySearchFilter) Renderer.applySearchFilter('');
				return;
			}
			searchTimeout = setTimeout(() => {
				if (typeof SearchManager !== 'undefined') {
					const results = SearchManager.searchAllBookmarks(term);
					SearchManager.showSearchResults(term, results);
				}
			}, 300);
		});
		document.addEventListener('keydown', (e) => {
			// فقط در حالت شناور، escape جستجو را می‌بندد
			if (e.key === 'Escape' && state.searchMode === 'floating' && searchContainer.style.display === 'flex') closeSearch();
		});
	}

    const bgBtn = document.getElementById('set-background-btn');
    if (bgBtn) bgBtn.addEventListener('click', () => {
        const bgInput = document.getElementById('background-file-input');
        if (bgInput) bgInput.click();
    });

    const combinedOnlineImportBtn = document.getElementById('combined-online-import-btn');
    if (combinedOnlineImportBtn) combinedOnlineImportBtn.addEventListener('click', (e) => {
        if (!confirm('آیا مطمئن هستید؟ این عملیات، بوکمارک‌ها و چیدمان فعلی شما را با نسخه آنلاین جایگزین می‌کند.')) return;
        e.preventDefault(); e.stopPropagation();
        ImportExportManager.combinedOnlineImport();
    });

    const exportBookmarksBtn = document.getElementById('export-bookmarks-btn');
    if (exportBookmarksBtn) exportBookmarksBtn.addEventListener('click', () => { ImportExportManager.exportBookmarks(); });

    const importBookmarksBtn = document.getElementById('import-bookmarks-btn');
    if (importBookmarksBtn) importBookmarksBtn.addEventListener('click', () => {
        const importInput = document.getElementById('import-bookmarks-file');
        if (importInput) importInput.click();
    });

    const exportSettingsBtn = document.getElementById('export-settings-btn');
    if (exportSettingsBtn) exportSettingsBtn.addEventListener('click', () => { ImportExportManager.exportSettings(); });

    const importSettingsBtn = document.getElementById('import-settings-btn');
    if (importSettingsBtn) importSettingsBtn.addEventListener('click', () => {
        const importInput = document.getElementById('import-settings-file');
        if (importInput) importInput.click();
    });

    const importBookmarksFile = document.getElementById('import-bookmarks-file');
    if (importBookmarksFile) importBookmarksFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (confirm('آیا از وارد کردن بوکمارک‌ها اطمینان دارید؟')) {
            try {
                await ImportExportManager.importBookmarks(file);
                alert('بوکمارک‌ها با موفقیت وارد شدند.');
            } catch (error) { alert('خطا: ' + error.message); }
        }
        e.target.value = '';
    });

    const importSettingsFile = document.getElementById('import-settings-file');
    if (importSettingsFile) importSettingsFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (confirm('آیا از وارد کردن تنظیمات اطمینان دارید؟')) {
            try {
                await ImportExportManager.importSettings(file);
                alert('تنظیمات با موفقیت وارد شدند.');
            } catch (error) { alert('خطا: ' + error.message); }
        }
        e.target.value = '';
    });

    const backgroundFileInput = document.getElementById('background-file-input');
    if (backgroundFileInput) backgroundFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => { BackgroundManager.setBackground(event.target.result); };
        reader.readAsDataURL(file);
        e.target.value = '';
    });

    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
        document.getElementById('bookmark-modal')?.classList.add('hidden');
    });

    const bookmarkForm = document.getElementById('bookmark-form');
    if (bookmarkForm) bookmarkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            title: document.getElementById('bookmark-name')?.value || '',
            type: document.getElementById('bookmark-type')?.value || 'bookmark',
            url: document.getElementById('bookmark-url')?.value || '',
            category: document.getElementById('bookmark-category')?.value || 'سایر',
            tags: document.getElementById('bookmark-tags')?.value?.split(',').map(t => t.trim()).filter(t => t) || [],
            description: document.getElementById('bookmark-description')?.value || ''
        };
        const modal = document.getElementById('bookmark-modal');
        const currentPath = modal?.dataset.currentPath ? JSON.parse(modal.dataset.currentPath) : [];
        const itemId = document.getElementById('editing-item-id')?.value;
        if (currentPath && currentPath.length > 0) formData.parentPath = currentPath;
        try {
            if (itemId) await BookmarkManager.updateUserBookmark(itemId, formData);
            else await BookmarkManager.addUserBookmark(formData);
            if (modal) modal.classList.add('hidden');
            await Renderer.renderDashboard();
        } catch (error) { alert('خطا: ' + error.message); }
    });

    const deleteBtn = document.getElementById('delete-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
        const itemId = document.getElementById('editing-item-id')?.value;
        if (confirm('آیا از حذف این آیتم اطمینان دارید؟')) {
            try {
                await BookmarkManager.deleteUserBookmark(itemId);
                document.getElementById('bookmark-modal')?.classList.add('hidden');
                await Renderer.renderDashboard();
            } catch (error) { alert('خطا: ' + error.message); }
        }
    });

    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) clearCacheBtn.addEventListener('click', async () => {
        if (confirm('آیا از پاک کردن کش اطمینان دارید؟')) {
            await FaviconManager.clearCache();
            alert('کش پاک شد.');
        }
    });

    const resetAllBtn = document.getElementById('reset-all-btn');
    if (resetAllBtn) resetAllBtn.addEventListener('click', async () => {
        if (confirm('آیا از بازنشانی همه تنظیمات اطمینان دارید؟')) {
            await StorageManager.clearAll();
            location.reload();
        }
    });

    const telegramBox = document.getElementById('custom-text-box');
    if (telegramBox) {
        telegramBox.style.cursor = 'pointer';
        telegramBox.addEventListener('click', (e) => {
            e.preventDefault();
            window.open('https://t.me/ali73jn', '_blank');
        });
    }

    // Weather mode toggle
    const toggleWeatherBtn = document.getElementById('toggle-weather-mode');
    if (toggleWeatherBtn) toggleWeatherBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const existingMenu = document.getElementById('weather-mode-menu');
        if (existingMenu) { existingMenu.remove(); return; }
        const menu = document.createElement('div');
        menu.id = 'weather-mode-menu';
        menu.className = 'weather-mode-menu';
        menu.innerHTML = `
            <div class="weather-mode-header">
                <span>حالت نمایش کارت زمان و آب و هوا</span>
                <button class="close-weather-menu">×</button>
            </div>
            <div class="weather-mode-options">
                <button data-mode="full" class="weather-mode-option">🌤️ کامل</button>
                <button data-mode="timeonly" class="weather-mode-option">⏰ فقط ساعت</button>
                <button data-mode="hidden" class="weather-mode-option">🙈 مخفی</button>
            </div>
        `;
        const btnRect = toggleWeatherBtn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.bottom = `${window.innerHeight - btnRect.top + 10}px`;
        menu.style.right = `${window.innerWidth - btnRect.right}px`;
        document.body.appendChild(menu);
        menu.querySelector('.close-weather-menu').addEventListener('click', () => menu.remove());
        menu.querySelectorAll('.weather-mode-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                const category = 'زمان و آب و هوا';
                let layout = state.layoutMap[category] || { col: 9, row: 1, w: 4, h: 3, view: 'list' };
                layout.mode = opt.dataset.mode;
                state.layoutMap[category] = layout;
                await StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
                Renderer.renderDashboard();
                menu.remove();
            });
        });
        const handleOutside = (ev) => {
            if (!menu.contains(ev.target) && ev.target !== toggleWeatherBtn) {
                menu.remove();
                document.removeEventListener('click', handleOutside);
            }
        };
        setTimeout(() => document.addEventListener('click', handleOutside), 10);
    });

    // ========== Font & Dimensions buttons ==========
    const fontSettingsBtn = document.getElementById('font-settings-btn');
    if (fontSettingsBtn) fontSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        FontManager.showModal();
    });

    const dimensionsBtn = document.getElementById('dimensions-btn');
    if (dimensionsBtn) dimensionsBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        DimensionsManager.showModal();
    });

    // ========== Search mode toggle button ==========
    const searchModeBtn = document.getElementById('search-mode-btn');
    if (searchModeBtn) {
        searchModeBtn.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            state.searchMode = state.searchMode === 'floating' ? 'card' : 'floating';
            await StorageManager.set(CONFIG.STORAGE_KEYS.SEARCH_MODE, state.searchMode);
            await EventManager.applySearchMode();
            await Renderer.renderDashboard();
        });
    }

    const closeFontBtn = document.getElementById('close-font-btn');
    if (closeFontBtn) closeFontBtn.addEventListener('click', () => {
        document.getElementById('font-modal').classList.add('hidden');
    });

    const closeDimsBtn = document.getElementById('close-dimensions-btn');
    if (closeDimsBtn) closeDimsBtn.addEventListener('click', () => {
        document.getElementById('dimensions-modal').classList.add('hidden');
    });

    const resetDimsBtn = document.getElementById('reset-dimensions-btn');
    if (resetDimsBtn) resetDimsBtn.addEventListener('click', async () => {
        if (confirm('آیا همه ابعاد به حالت پیش‌فرض بازگردانده شوند؟')) {
            await DimensionsManager.reset();
            DimensionsManager.showModal();
        }
    });

    ['font-modal', 'dimensions-modal'].forEach(id => {
        const m = document.getElementById(id);
        if (m) m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
    });

    // Zoom & Blur
    if (!window._zoomListenersSetup) {
        ZoomManager.setupEventListeners();
        window._zoomListenersSetup = true;
        OverlayManager.setupEventListeners();
    }
}

    // ⭐ اعمال حالت جستجو (شناور یا کارت)
    static async applySearchMode() {
        const searchWrapper = document.querySelector('.search-top-wrapper');
        const searchContainer = document.getElementById('search-container');
        const searchBtn = document.getElementById('search-btn');
        const closeSearchBtn = document.getElementById('close-search-btn');

        if (state.searchMode === 'card') {
            if (searchWrapper) searchWrapper.style.display = 'none';
            if (searchContainer) {
                searchContainer.classList.remove('hidden');
                searchContainer.style.display = 'flex';
            }
        } else {
            // بازگشت به والد اصلی (در صورت نیاز)
            if (searchContainer && searchWrapper && searchContainer.parentElement !== searchWrapper) {
                searchWrapper.appendChild(searchContainer);
            }
            if (searchWrapper) searchWrapper.style.display = 'flex';
            if (searchContainer) {
                searchContainer.classList.add('hidden');
                searchContainer.style.display = 'none';
            }
            if (searchBtn) searchBtn.style.display = 'flex';
            if (closeSearchBtn) closeSearchBtn.style.display = 'none';
        }
    }
}

// ==================== Initialize ====================
class App {
    static async init() {
        try {
            console.log('راه‌اندازی برنامه...');

            await ThemeManager.init();
            await FontManager.init();
            await DimensionsManager.init();
            await BackgroundManager.initBackground();

            state.layoutMap = await StorageManager.get(CONFIG.STORAGE_KEYS.LAYOUT) || {};
            state.currentPaths = {};
            state.searchMode = (await StorageManager.get(CONFIG.STORAGE_KEYS.SEARCH_MODE)) || 'floating';

            await ZoomManager.loadZoom();
            await OverlayManager.loadBlur();
            await BookmarkManager.initRootFolder();
            await BookmarkManager.loadBookmarks();
            EventManager.setup();
            await EventManager.applySearchMode();

            setTimeout(() => {
                ZoomManager.applyZoom();
                ZoomManager.updateZoomDisplay();
            }, 200);

            const firstRun = !(await StorageManager.get(CONFIG.STORAGE_KEYS.FIRST_RUN));
            if (firstRun) {
                await StorageManager.set(CONFIG.STORAGE_KEYS.FIRST_RUN, true);
                const defaultBgPath = chrome.runtime.getURL('icons/wallpaper.jpg');
                await BackgroundManager.setBackground(defaultBgPath);
                setTimeout(() => { ImportExportManager.combinedLocalImport(true); }, 1000);
                this.showWelcomeMessage();
            }

            await Renderer.renderDashboard();
        } catch (error) {
            console.error('❌ خطا در راه‌اندازی:', error);
            const container = document.getElementById('grid-container');
            if (container) {
                container.innerHTML = `<div class="error-state"><h3>❌ خطا در راه‌اندازی</h3><p>${error.message}</p></div>`;
            }
        }
    }

    static showWelcomeMessage() {
        setTimeout(() => {
            const welcomeHTML = `
                <div class="welcome-overlay" id="welcome-overlay">
                    <div class="welcome-modal">
                        <div class="welcome-header">
                            <div class="welcome-icon">🎉</div>
                            <h2>به همیار کافینت خوش آمدید!</h2>
                        </div>
                        <div class="welcome-body">
                            <div class="welcome-tip">
                                <div class="tip-icon">✨</div>
                                <div class="tip-content">
                                    <p class="tip-title">شروع سفارشی‌سازی</p>
                                    <p class="tip-text">بعد از اولین ورود، روی دکمه <strong> ✏️ ویرایش </strong> کلیک کنید و تنظیمات را به سلیقه خود اصلاح کنید.</p>
                                </div>
                            </div>
                            <div class="welcome-features">
                                <div class="feature-item"><span class="feature-icon">🔍</span><span>تنظیم <strong>میزان زوم</strong></span></div>
                                <div class="feature-item"><span class="feature-icon">🎨</span><span>انتخاب <strong>تصویر زمینه</strong></span></div>
                                <div class="feature-item"><span class="feature-icon">📐</span><span>چیدمان <strong>ویجت‌ها</strong></span></div>
                                <div class="feature-item"><span class="feature-icon">🎯</span><span>سازماندهی <strong>بوکمارک‌ها</strong></span></div>
                            </div>
                            <div class="welcome-note">
                                <p>💡 <strong>نکته:</strong> می‌توانید همیشه از منوی ✏️ ویرایش این موارد را تغییر دهید.</p>
                            </div>
                        </div>
                        <div class="welcome-footer">
                            <button class="welcome-btn" id="welcome-close">ورود به همیار کافینت</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', welcomeHTML);
            document.getElementById('welcome-close').addEventListener('click', function() {
                document.getElementById('welcome-overlay').remove();
                localStorage.setItem('cafinet_welcome_seen', 'true');
            });
            document.getElementById('welcome-overlay').addEventListener('click', function(e) {
                if (e.target.id === 'welcome-overlay') {
                    this.remove();
                    localStorage.setItem('cafinet_welcome_seen', 'true');
                }
            });
        }, 1000);
    }
}

// ==================== Bootstrap ====================
document.addEventListener('DOMContentLoaded', () => {
    App.init();
    const updateOnlineStatus = () => {
        const indicator = document.getElementById('offline-indicator');
        if (indicator) indicator.classList.toggle('hidden', navigator.onLine);
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
});

(() => {
    const selector = '#dimensions-modal .dim-slider';

    function updateSlider(slider) {
        const min = Number(slider.min || 0);
        const max = Number(slider.max || 100);
        const value = Number(slider.value || 0);
        const progress = max > min
            ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
            : 0;

        // ⭐ وسط = ۵۰٪ (چون رنج از -۱۰۰ تا +۱۰۰ هست)
        const center = 50;
        const fillStart = Math.min(center, progress);
        const fillEnd = Math.max(center, progress);

        slider.style.setProperty('--slider-progress', `${progress}%`);
        slider.style.setProperty('--slider-fill-start', `${fillStart}%`);
        slider.style.setProperty('--slider-fill-end', `${fillEnd}%`);
    }

    function updateAll(root) {
        if (root.matches?.(selector)) updateSlider(root);
        root.querySelectorAll?.(selector).forEach(updateSlider);
    }

    document.addEventListener('input', event => {
        if (event.target.matches(selector)) updateSlider(event.target);
    }, true);

    document.addEventListener('click', event => {
        const button = event.target.closest('#dimensions-modal .dim-step');
        if (!button) return;

        requestAnimationFrame(() => {
            const row = button.closest('.dim-row');
            row?.querySelectorAll(selector).forEach(updateSlider);
        });
    }, true);

    updateAll(document);

    new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) updateAll(node);
            });
        });
    }).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();