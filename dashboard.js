// ==================== تنظیمات اصلی ====================
const CONFIG = {
    // مسیرهای لوکال
    FALLBACK_ICON_PATH: "icons/default_icon.png",
    FOLDER_ICON_PATH: "icons/folder.png",
    DEFAULT_BG_IMAGE_PATH: "icons/default_bg.jpg",
    ICONS_JSON_URL: "data/icons.json",
    // تنظیمات گرید
    GRID_CELL_SIZE: 20,
    GRID_GAP: 0,
    HORIZONTAL_PIXEL_OFFSET: 0,
	
    // کلیدهای storage
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
        FIRST_RUN: 'netcofe_first_run'
    },
	
		ONLINE: {
        BOOKMARKS_URL: "https://raw.githubusercontent.com/ali73jn/extension/refs/heads/main/bookmarks.json",
        SETTINGS_URL: "https://raw.githubusercontent.com/ali73jn/extension/refs/heads/main/settings.json" 
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
    
    const persianDays = [
        'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه',
        'پنجشنبه', 'جمعه', 'شنبه'
    ];
    
    const dayOfWeek = now.getDay();
    
    let hours = now.getHours();
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();
    
    const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const toPersianDigits = (num) => {
        return num.toString().replace(/\d/g, d => persianDigits[d]);
    };
    
    const persianDateNumeric = `${toPersianDigits(jalali[0])}/${toPersianDigits(jalali[1])}/${toPersianDigits(jalali[2])}`;
    
    return {
        date: persianDateNumeric,
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
    netcofeRootId: null
};

// ==================== مدیریت ذخیره‌سازی (با chrome.storage) ====================
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




// ==================== مدیریت بوکمارک‌ها (با chrome.bookmarks) ====================
class BookmarkManager {
    static ROOT_FOLDER_NAME = "netcofe";

	static async initRootFolder() {
		try {
			// شناسه نوار بوکمارک (محلی که کاربر می‌بیند)
			const BOOKMARKS_BAR_ID = "1";
			
			// ① همه فرزندان مستقیم نوار بوکمارک را بگیر
			const children = await chrome.bookmarks.getChildren(BOOKMARKS_BAR_ID);
			
			// ② آیا پوشه netcofe قبلاً در نوار بوکمارک وجود دارد؟
			const existingFolder = children.find(child => !child.url && child.title === this.ROOT_FOLDER_NAME);
			
			if (existingFolder) {
				state.netcofeRootId = existingFolder.id;
				console.log('✅ پوشه netcofe در نوار بوکمارک پیدا شد:', existingFolder.id);
			} else {
				// ③ وجود ندارد → در نوار بوکمارک بساز
				const created = await chrome.bookmarks.create({
					parentId: BOOKMARKS_BAR_ID,
					title: this.ROOT_FOLDER_NAME
				});
				state.netcofeRootId = created.id;
				console.log('✅ پوشه netcofe در نوار بوکمارک ساخته شد:', created.id);
			}
			return state.netcofeRootId;
		} catch (error) {
			console.error('❌ خطا در ایجاد پوشه root:', error);
			return null;
		}
	}

    static async loadBookmarks() {
        try {
            if (!state.netcofeRootId) {
                await this.initRootFolder();
            }

            state.currentPaths = await StorageManager.get(CONFIG.STORAGE_KEYS.CURRENT_PATHS) || {};

            const tree = await chrome.bookmarks.getSubTree(state.netcofeRootId);
            const rootChildren = tree[0].children || [];

            // بارگذاری آیکون‌های سفارشی (بدون پیش‌لود)
            await this.loadCustomIcons();

            state.bookmarks = this.convertChromeBookmarks(rootChildren);
            console.log('بوکمارک‌های نهایی:', state.bookmarks.length);
            return state.bookmarks;
        } catch (error) {
            console.error('خطا در بارگذاری بوکمارک‌ها:', error);
            state.bookmarks = await this.getDefaultBookmarks();
            return state.bookmarks;
        }
    }

    // ✅ بارگذاری آیکون‌های سفارشی از JSON (بدون پیش‌لود)
    static async loadCustomIcons() {
        try {
            // بررسی کش محلی JSON (24 ساعت)
            const cached = await StorageManager.get('custom_icons_cache');
            const now = Date.now();

            if (cached && cached.timestamp && (now - cached.timestamp) < 24 * 60 * 60 * 1000) {
                state.customIcons = cached.data || {};
                console.log('✅ آیکون‌های سفارشی از کش بارگذاری شدند');
                return;
            }

            // تلاش برای دریافت از شبکه
            const customUrls = await StorageManager.get(CONFIG.STORAGE_KEYS.CUSTOM_URLS) || {};
            const iconsUrl = customUrls.icons || CONFIG.ICONS_JSON_URL;
            const response = await fetch(iconsUrl);

            if (response.ok) {
                state.customIcons = await response.json();
                await StorageManager.set('custom_icons_cache', {
                    data: state.customIcons,
                    timestamp: now
                });
                console.log('✅ آیکون‌های سفارشی از اینترنت دریافت و کش شدند');
            } else {
                console.warn('⚠️ دریافت آیکون‌ها ناموفق بود.');
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
            const convertedNode = {
                id: node.id,
                title: node.title,
                url: node.url || undefined
            };

            if (node.children && node.children.length > 0) {
                convertedNode.children = this.convertChromeBookmarks(node.children);
            }
            converted.push(convertedNode);
        }
        return converted;
    }

    static async getDefaultBookmarks() {
        return [
            {
                id: 'default_google',
                title: 'گوگل',
                url: 'https://google.com',
                type: 'bookmark',
                children: []
            },
            {
                id: 'default_github',
                title: 'GitHub',
                url: 'https://github.com',
                type: 'bookmark',
                children: []
            }
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
                await chrome.bookmarks.create({
                    parentId: targetParentId,
                    ...newBookmark
                });
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
                if (folder && folder[0]) {
                    currentParentId = folder[0].id;
                } else {
                    currentParentId = rootFolderId;
                    break;
                }
            } catch {
                currentParentId = rootFolderId;
                break;
            }
        }

        await chrome.bookmarks.create({
            parentId: currentParentId,
            ...bookmark
        });
    }

    static async updateUserBookmark(id, updates) {
        try {
            await chrome.bookmarks.update(id, {
                title: updates.title,
                url: updates.url || undefined
            });
            await this.loadBookmarks();
            return true;
        } catch (error) {
            console.error('خطا در به‌روزرسانی بوکمارک:', error);
            return false;
        }
    }

    static async deleteUserBookmark(id) {
        try {
            await chrome.bookmarks.removeTree(id);
            await this.loadBookmarks();
            return true;
        } catch (error) {
            console.error('خطا در حذف بوکمارک:', error);
            return false;
        }
    }

    // ==================== IMPORT/EXPORT SYSTEM ====================
    static async exportBookmarks() {
        try {
            if (!state.netcofeRootId) return null;

            const tree = await chrome.bookmarks.getSubTree(state.netcofeRootId);
            const exportData = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                bookmarks: tree[0].children || []
            };
            return exportData;
        } catch (error) {
            console.error('خطا در export بوکمارک‌ها:', error);
            return null;
        }
    }

    static async importBookmarks(importedData, replaceExisting = true) {
        try {
            if (!state.netcofeRootId) await this.initRootFolder();

            if (replaceExisting) {
                const existing = await chrome.bookmarks.getChildren(state.netcofeRootId);
                for (const child of existing) {
                    await chrome.bookmarks.removeTree(child.id);
                }
            }

            const bookmarksToImport = importedData.bookmarks || importedData;

            const createNodes = async (parentId, nodes) => {
                for (const node of nodes) {
                    const newNode = await chrome.bookmarks.create({
                        parentId: parentId,
                        title: node.title,
                        url: node.url || undefined
                    });
                    if (node.children && node.children.length > 0) {
                        await createNodes(newNode.id, node.children);
                    }
                }
            };

            await createNodes(state.netcofeRootId, bookmarksToImport);
            await this.loadBookmarks();
            return true;
        } catch (error) {
            console.error('خطا در import بوکمارک‌ها:', error);
            return false;
        }
    }

    static downloadFile(data, filename, type) {
        const blob = new Blob([data], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// ==================== سیستم پیشرفته Favicon ====================
class FaviconManager {
    static FAVICON_CACHE_KEY = CONFIG.STORAGE_KEYS.FAVICON_CACHE;
    static CUSTOM_ICON_CACHE_KEY = 'custom_icon_cache_v1';

    // ---------- کش فاویکوین ----------
    static async getCache() {
        const res = await chrome.storage.local.get(this.FAVICON_CACHE_KEY);
        return res[this.FAVICON_CACHE_KEY] || {};
    }

    static async saveCache(cache) {
        await chrome.storage.local.set({ [this.FAVICON_CACHE_KEY]: cache });
    }

    // ---------- کش آیکون سفارشی ----------
    static async getCustomIconCache() {
        const res = await chrome.storage.local.get(this.CUSTOM_ICON_CACHE_KEY);
        return res[this.CUSTOM_ICON_CACHE_KEY] || {};
    }

    static async saveCustomIconCache(cache) {
        await chrome.storage.local.set({ [this.CUSTOM_ICON_CACHE_KEY]: cache });
    }

    // ---------- کمکی: حذف www از URL ----------
    static stripWww(url) {
        if (!url) return url;
        return url.replace(/^https?:\/\/www\./i, 'https://');
    }

    // ---------- کمکی: استخراج Origin بدون www ----------
    static extractOrigin(url) {
        if (!url) return null;
        try {
            const normalized = this.stripWww(url);
            return new URL(normalized).origin;
        } catch {
            return null;
        }
    }

    // ---------- کمکی: بررسی مسیر محلی ----------
    static isLocalPath(path) {
        if (!path) return false;
        return (
            path.startsWith('./') ||
            path.startsWith('/') ||
            !path.includes('://') ||
            path.startsWith('file://')
        );
    }

    // ---------- کمکی: تبدیل مسیر محلی به URL کامل ----------
    static resolveLocalPath(relativePath) {
        if (!relativePath) return relativePath;
        try {
            if (relativePath.startsWith('./')) {
                const extensionBase = chrome.runtime.getURL('/');
                return extensionBase + relativePath.substring(2);
            }
            return relativePath;
        } catch {
            return relativePath;
        }
    }

    // ---------- بررسی سلامت تصویر ----------
    static loadImageSafe(src, timeout = 3000) {
        return new Promise(resolve => {
            const img = new Image();
            let done = false;
            const finish = ok => {
                if (!done) {
                    done = true;
                    resolve(ok);
                }
            };
            img.onload = () => {
                if (img.naturalWidth > 1 && img.naturalHeight > 1) {
                    finish(true);
                } else {
                    finish(false);
                }
            };
            img.onerror = () => finish(false);
            img.src = src;
            setTimeout(() => finish(false), timeout);
        });
    }

    // ---------- تلاش مستقیم ----------
    static async tryDirectIcon(iconUrl) {
        try {
            const ok = await this.loadImageSafe(iconUrl);
            return ok ? iconUrl : null;
        } catch {
            return null;
        }
    }

    // ---------- تبدیل Blob به Base64 ----------
    static blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // ---------- لود مستقیم آیکون محلی (بدون کش) ----------
    static async loadLocalIconDirect(iconUrl) {
        try {
            const response = await fetch(iconUrl);
            if (!response.ok) return null;

            const blob = await response.blob();
            if (blob.size === 0) return null;

            const base64 = await this.blobToBase64(blob);
            return base64;
        } catch {
            return null;
        }
    }

    // ---------- ذخیره فاویکوین در کش (Base64) ----------
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
        } catch {
            return null;
        }
    }

    // ---------- کش آیکون سفارشی ریموت ----------
    static async cacheCustomIcon(url, imageUrl) {
        try {
            const cache = await this.getCustomIconCache();
            const origin = this.extractOrigin(url);
            const cacheKey = origin || url;
            const now = Date.now();

            // آیکون محلی → کش نمی‌کنیم (resolveFavicon مستقیم لود می‌کنه)
            if (this.isLocalPath(imageUrl)) {
                return null;
            }

            // کش معتبر داره؟
            if (cache[cacheKey] && cache[cacheKey].timestamp > now - 7 * 24 * 60 * 60 * 1000) {
                return cache[cacheKey].data;
            }

            // دانلود
            const response = await fetch(imageUrl);
            if (!response.ok) return null;

            const blob = await response.blob();
            if (blob.size === 0) return null;

            const base64 = await this.blobToBase64(blob);

            cache[cacheKey] = {
                data: base64,
                timestamp: now
            };

            await this.saveCustomIconCache(cache);
            return base64;
        } catch {
            return null;
        }
    }

    // ---------- دریافت آیکون سفارشی کش‌شده ----------
    static async getCustomIconCached(url) {
        try {
            const cache = await this.getCustomIconCache();
            const now = Date.now();
            const origin = this.extractOrigin(url);

            if (!origin) return null;

            // ① origin رو چک کن
            if (cache[origin] && cache[origin].timestamp > now - 7 * 24 * 60 * 60 * 1000) {
                return cache[origin].data;
            }

            // ② www اضافه شده رو هم چک کن (backup)
            const withWww = origin.replace(/^https?:\/\//, 'https://www.');
            if (cache[withWww] && cache[withWww].timestamp > now - 7 * 24 * 60 * 60 * 1000) {
                return cache[withWww].data;
            }

            return null;
        } catch {
            return null;
        }
    }

    // ---------- استخراج آیکون از HTML ----------
    static async tryHtmlIcon(url) {
        try {
            const response = await fetch(url, {
                redirect: "follow",
                credentials: "omit",
                mode: "cors"
            });
            if (!response.ok) return null;

            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, "text/html");
            const links = doc.querySelectorAll("link[rel]");

            for (const link of links) {
                const rel = link.getAttribute("rel").toLowerCase();
                if (rel.includes("icon")) {
                    const href = link.getAttribute("href");
                    if (href) {
                        return new URL(href, url).href;
                    }
                }
            }
        } catch {
            return null;
        }
        return null;
    }

    // ========================================================
    // ========== resolveFavicon - ترتیب جدید ==========
    // ① کش → ② JSON سفارشی → ③ فال‌بک‌ها → ④ فال‌بک قطعی
    // ========================================================
    static async resolveFavicon(url) {
        // ① فال‌بک برای URLهای نامعتبر
        if (!url || !url.startsWith("http")) {
            return CONFIG.FAVORITE_ICON_PATH;
        }

        const origin = this.extractOrigin(url);
        if (!origin) {
            return CONFIG.FAVORITE_ICON_PATH;
        }

        const domain = new URL(url).hostname;

        // ② بررسی کش فاویکوین (کش‌های قدیمی)
        try {
            const cache = await this.getCache();
            if (cache[url]) {
                const ok = await this.loadImageSafe(cache[url]);
                if (ok) return cache[url];
                delete cache[url];
            }
        } catch (e) {
            // ادامه بده
        }

        // ========================================
        // ③ بررسی JSON سفارشی (بدون کش - سریع‌ترین)
        // ========================================
        if (state.customIcons && state.customIcons[origin]) {
            const iconPath = state.customIcons[origin];

            // آیکون محلی → مستقیم لود بدون کش
            if (this.isLocalPath(iconPath)) {
                const iconUrl = this.resolveLocalPath(iconPath);
                const base64 = await this.loadLocalIconDirect(iconUrl);
                if (base64) return base64;
            }
            // آیکون ریموت → اول کش رو چک کن
            else {
                const cached = await this.getCustomIconCached(origin);
                if (cached) return cached;

                // اگه کش نبود، دانلود و کش کن
                const base64 = await this.cacheCustomIcon(origin, iconPath);
                if (base64) return base64;
            }
        }

        // ========================================
        // ④ روش‌های فال‌بک (فاویکوین، duckduckgo، google)
        // ========================================

        // الف) آدرس‌های مستقیم
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

        // ب) استخراج از HTML
        const htmlIcon = await this.tryHtmlIcon(url);
        if (htmlIcon) {
            const base64 = await this.cacheIcon(url, htmlIcon, await this.getCache());
            if (base64) return base64;
        }

        // ⑤ هیچکدام → فال‌بک قطعی
        return CONFIG.FALLBACK_ICON_PATH;
    }

    // ---------- پاک کردن کش ----------
    static async clearCache() {
        await chrome.storage.local.remove(this.FAVICON_CACHE_KEY);
        await chrome.storage.local.remove(this.CUSTOM_ICON_CACHE_KEY);
    }
}








// ==================== مدیریت زوم ====================
class ZoomManager {
    static MIN_ZOOM = 75;
    static MAX_ZOOM = 125;
    static ZOOM_STEP = 1;

    static async loadZoom() {
        const savedZoom = await StorageManager.get(CONFIG.STORAGE_KEYS.ZOOM_LEVEL);
        
        if (savedZoom !== null && savedZoom >= 75 && savedZoom <= 125) {
            state.zoomLevel = savedZoom;
            console.log('زوم بارگذاری شد:', state.zoomLevel + '%');
        } else {
            const isMobile = this.isMobileDevice();
            
            if (isMobile) {
                state.zoomLevel = 100;
                console.log('موبایل تشخیص داده شد، زوم پیش‌فرض 100%');
            } else {
                state.zoomLevel = 100;
                console.log('دسکتاپ تشخیص داده شد، زوم پیش‌فرض 92%');
            }
            
            await this.saveZoom();
        }
    }

    static isMobileDevice() {
        return window.innerWidth <= 768 || 'ontouchstart' in window;
    }

    static applyZoom() {
        const zoomPercent = state.zoomLevel;
        const zoomWrapper = document.getElementById('zoom-wrapper');
        
        console.log('اعمال زوم:', zoomPercent + '%');
        
        if (zoomWrapper) {
            zoomWrapper.className = zoomWrapper.className.replace(/\bscale-\d+\b/g, '');
            
            const scaleClass = `scale-${zoomPercent}`;
            zoomWrapper.classList.add(scaleClass);
            
            zoomWrapper.style.zoom = `${zoomPercent}%`;
            
            if (zoomWrapper.style.zoom === undefined) {
                const scale = zoomPercent / 100;
                zoomWrapper.style.transform = `scale(${scale})`;
                zoomWrapper.style.transformOrigin = 'top center';
            }
            
            zoomWrapper.style.marginTop = '20px';
            zoomWrapper.style.marginBottom = '20px';
            
            if (zoomPercent < 100) {
                const scale = zoomPercent / 100;
                const scaledHeight = zoomWrapper.scrollHeight * scale;
                const viewportHeight = window.innerHeight;
                
                if (scaledHeight < viewportHeight - 100) {
                    const extraSpace = (viewportHeight - scaledHeight) / 2;
                    zoomWrapper.style.marginTop = `${extraSpace}px`;
                    zoomWrapper.style.marginBottom = `${extraSpace}px`;
                }
            }
            
            console.log('زوم اعمال شد:', zoomPercent + '%');
        }
    }

    static updateZoomDisplay() {
        const display = document.getElementById('zoom-level-display');
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        const zoomInBtn = document.getElementById('zoom-in-btn');
        
        if (display) {
            display.textContent = `${state.zoomLevel}%`;
        }
        
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
                e.preventDefault();
                e.stopPropagation();
                
                if (state.zoomLevel > this.MIN_ZOOM) {
                    state.zoomLevel -= this.ZOOM_STEP;
                    this.applyZoom();
                    this.saveZoom();
                    this.updateZoomDisplay();
                }
            });
            
            zoomInBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (state.zoomLevel < this.MAX_ZOOM) {
                    state.zoomLevel += this.ZOOM_STEP;
                    this.applyZoom();
                    this.saveZoom();
                    this.updateZoomDisplay();
                }
            });
            
            document.addEventListener('keydown', (e) => {
                if (state.isEditMode) {
                    if (e.ctrlKey && e.key === '-') {
                        e.preventDefault();
                        zoomOutBtn.click();
                    } else if (e.ctrlKey && e.key === '=' || e.ctrlKey && e.key === '+') {
                        e.preventDefault();
                        zoomInBtn.click();
                    } else if (e.ctrlKey && e.key === '0') {
                        e.preventDefault();
                        state.zoomLevel = 100;
                        this.applyZoom();
                        this.saveZoom();
                        this.updateZoomDisplay();
                    }
                }
            });
        }
    }

    static async saveZoom() {
        await StorageManager.set(CONFIG.STORAGE_KEYS.ZOOM_LEVEL, state.zoomLevel);
    }
}

// ==================== مدیریت لایه بلور پس‌زمینه ====================
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
		
		// اگر وجود نداشت، ایجاد کن
		if (!overlayElement) {
			overlayElement = document.createElement('div');
			overlayElement.id = 'background-overlay';
			document.body.appendChild(overlayElement);
		}
		
		// تنظیم استایل‌های اجباری (هر بار برای اطمینان)
		overlayElement.style.position = 'fixed';
		overlayElement.style.top = '0';
		overlayElement.style.left = '0';
		overlayElement.style.right = '0';
		overlayElement.style.bottom = '0';
		overlayElement.style.width = '100vw';
		overlayElement.style.height = '100vh';
		overlayElement.style.pointerEvents = 'none';
		overlayElement.style.zIndex = '1';
		
		// اعمال بلور
		let blurValue = state.backgroundBlur;
		const actualBlur = blurValue * 1.5;
		
		overlayElement.style.backdropFilter = `blur(${actualBlur}px)`;
		overlayElement.style.webkitBackdropFilter = `blur(${actualBlur}px)`;
		
		const opacity = Math.min(blurValue / 15, 0.1);
		overlayElement.style.backgroundColor = `rgba(255, 255, 255, ${opacity})`;
		
		console.log('بلور اعمال شد:', {
			مقدار_ورودی: blurValue.toFixed(1) + 'px',
			مقدار_واقعی: actualBlur.toFixed(1) + 'px'
		});
	}
    static async saveBlur() {
        await StorageManager.set(CONFIG.STORAGE_KEYS.BACKGROUND_BLUR, state.backgroundBlur);
    }

    static increaseBlur() {
        if (state.backgroundBlur < 10) {
            state.backgroundBlur = Math.min(10, state.backgroundBlur + 0.1);
            state.backgroundBlur = Math.round(state.backgroundBlur * 10) / 10;
            this.applyBlur();
            this.saveBlur();
        }
    }

    static decreaseBlur() {
        if (state.backgroundBlur > 0) {
            state.backgroundBlur = Math.max(0, state.backgroundBlur - 0.1);
            state.backgroundBlur = Math.round(state.backgroundBlur * 10) / 10;
            this.applyBlur();
            this.saveBlur();
        }
    }

    static setupEventListeners() {
        const blurBtn = document.getElementById('overlay-blur-btn');
        if (blurBtn) {
            blurBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showBlurControlMenu(e);
            });
        }
    }

    static showBlurControlMenu(event) {
        const existingMenu = document.getElementById('blur-control-menu');
        if (existingMenu) {
            existingMenu.remove();
            return;
        }

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
                <div class="blur-description">
                    <small>مقدار واقعی: ${state.backgroundBlur.toFixed(1)}px</small>
                </div>
            </div>
            <div class="blur-slider-container">
                <input type="range" id="blur-intensity-slider" 
                       min="0" max="100" step="1" 
                       value="${displayValue}">
                <div class="blur-value-display">
                    <span id="blur-intensity-value">${displayValue}%</span>
                </div>
            </div>
            <div class="blur-scale">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
            </div>
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

        if (slider) {
            slider.addEventListener('input', (e) => {
                const displayValue = parseInt(e.target.value);
                state.backgroundBlur = displayValue / 10;
                valueDisplay.textContent = `${displayValue}%`;
                this.applyBlur();
                this.updateBlurPreview();
                
                const description = document.querySelector('.blur-description small');
                if (description) {
                    description.textContent = `مقدار واقعی: ${state.backgroundBlur.toFixed(1)}px`;
                }
            });

            slider.addEventListener('change', () => {
                this.saveBlur();
            });
        }

        if (decreaseBtn) {
            decreaseBtn.addEventListener('click', () => {
                this.decreaseBlur();
                const displayValue = Math.round(state.backgroundBlur * 10);
                if (slider && valueDisplay) {
                    slider.value = displayValue;
                    valueDisplay.textContent = `${displayValue}%`;
                    this.updateBlurPreview();
                    
                    const description = document.querySelector('.blur-description small');
                    if (description) {
                        description.textContent = `مقدار واقعی: ${state.backgroundBlur.toFixed(1)}px`;
                    }
                }
            });
        }

        if (increaseBtn) {
            increaseBtn.addEventListener('click', () => {
                this.increaseBlur();
                const displayValue = Math.round(state.backgroundBlur * 10);
                if (slider && valueDisplay) {
                    slider.value = displayValue;
                    valueDisplay.textContent = `${displayValue}%`;
                    this.updateBlurPreview();
                    
                    const description = document.querySelector('.blur-description small');
                    if (description) {
                        description.textContent = `مقدار واقعی: ${state.backgroundBlur.toFixed(1)}px`;
                    }
                }
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                state.backgroundBlur = 0;
                this.applyBlur();
                this.saveBlur();
                if (slider && valueDisplay) {
                    slider.value = 0;
                    valueDisplay.textContent = '0%';
                    this.updateBlurPreview();
                    
                    const description = document.querySelector('.blur-description small');
                    if (description) {
                        description.textContent = `مقدار واقعی: ${state.backgroundBlur.toFixed(1)}px`;
                    }
                }
            });
        }

        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const displayValue = parseInt(btn.dataset.value);
                state.backgroundBlur = displayValue / 10;
                this.applyBlur();
                this.saveBlur();
                if (slider && valueDisplay) {
                    slider.value = displayValue;
                    valueDisplay.textContent = `${displayValue}%`;
                    this.updateBlurPreview();
                    
                    const description = document.querySelector('.blur-description small');
                    if (description) {
                        description.textContent = `مقدار واقعی: ${state.backgroundBlur.toFixed(1)}px`;
                    }
                }
            });
        });

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                menu.remove();
            });
        }

        document.addEventListener('click', (e) => {
            if (menu && !menu.contains(e.target) && 
                !e.target.closest('#overlay-blur-btn')) {
                menu.remove();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menu) {
                menu.remove();
            }
        });
    }
}

// ==================== سیستم آب و هوا ====================
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
            
            if (!response.ok) throw new Error('خطا در دریافت اطلاعات آب و هوا');
            
            const data = await response.json();
            return this.formatWeatherData(data);
            
        } catch (error) {
            //console.error('خطا در دریافت آب و هوا:', error);
            return this.getFallbackWeather();
        }
    }

    static formatWeatherData(data) {
        const current = data.current_weather;
        
        const weatherCodes = {
            0: 'آفتابی',
            1: 'آفتابی',
            2: 'نیمه ابری',
            3: 'ابری',
            45: 'مه',
            48: 'مه',
            51: 'نمنم باران',
            53: 'باران ملایم',
            55: 'باران شدید',
            61: 'باران ملایم',
            63: 'باران',
            65: 'باران شدید',
            71: 'بارش برف ملایم',
            73: 'بارش برف',
            75: 'بارش برف شدید',
            80: 'رگبار باران',
            81: 'رگبار شدید',
            82: 'رگبار سیل‌آسا',
            95: 'رعد و برق',
            96: 'رعد و برق با باران',
            99: 'رعد و برق شدید'
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
        return {
            temperature: 22,
            condition: 'آفتابی',
            windSpeed: 5,
            isDay: true,
            isFallback: true
        };
    }

    static getWeatherIcon(condition) {
        const icons = {
            'آفتابی': '☀️',
            'نیمه ابری': '⛅',
            'ابری': '☁️',
            'مه': '🌫️',
            'باران': '🌧️',
            'باران ملایم': '🌦️',
            'باران شدید': '⛈️',
            'برف': '❄️',
            'رعد و برق': '⚡',
            'نامشخص': '🌈'
        };
        
        return icons[condition] || '🌈';
    }
}

// ==================== مدیریت تم و ظاهر ====================
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
                if (settings.autoDarkMode) {
                    state.isDarkMode = e.matches;
                    this.applyTheme();
                }
            });
        }
    }

    static toggleTheme() {
        state.isDarkMode = !state.isDarkMode;
        this.applyTheme();
        return state.isDarkMode;
    }
}

// ==================== مدیریت پس‌زمینه ====================
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
            
            if (bgData) {
                bgElement.style.backgroundImage = `url(${bgData})`;
                console.log('بک‌گراند اعمال شد از storage');
            } else {
                bgElement.style.backgroundImage = `url(${CONFIG.DEFAULT_BG_IMAGE_PATH})`;
                console.log('بک‌گراند پیش‌فرض اعمال شد');
            }
        } else {
            console.warn('عنصر fixed-background پیدا نشد!');
        }
    }

    static async setBackground(imageData) {
        await StorageManager.set(CONFIG.STORAGE_KEYS.BACKGROUND, imageData);
        
        const bgElement = document.getElementById('fixed-background');
        if (bgElement) {
            bgElement.style.backgroundImage = `url(${imageData})`;
        } else {
            this.initBackground();
        }
    }

    static async resetBackground() {
        await StorageManager.remove(CONFIG.STORAGE_KEYS.BACKGROUND);
        
        const bgElement = document.getElementById('fixed-background');
        if (bgElement) {
            bgElement.style.backgroundImage = `url(${CONFIG.DEFAULT_BG_IMAGE_PATH})`;
        } else {
            this.initBackground();
        }
    }
}


// ==================== Drag & Resize System ====================
class DragResizeManager {
    static startDrag(e, card) {
        if (e.button !== 0 || !state.isEditMode) return;
        e.preventDefault();
        
        state.dragInfo = {
            card: card,
            startX: e.clientX,
            startY: e.clientY,
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
        
        const newCol = Math.max(1, state.dragInfo.startCol - dCol);
        const newRow = Math.max(1, state.dragInfo.startRow + dRow);
        
        state.dragInfo.card.style.gridColumnStart = newCol;
        state.dragInfo.card.style.gridRowStart = newRow;
    }

    static stopDrag() {
        if (state.dragInfo) {
            state.dragInfo.card.classList.remove('dragging');
            
            // 🔴 **تغییر این خط - از id به category**
            const category = state.dragInfo.card.dataset.category;
            
            if (state.layoutMap[category]) {
                state.layoutMap[category].col = parseInt(state.dragInfo.card.style.gridColumnStart) || 1;
                state.layoutMap[category].row = parseInt(state.dragInfo.card.style.gridRowStart) || 1;
                StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
            }
            
            // حذف event listeners
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
        e.preventDefault();
        e.stopPropagation();
        
        const colEnd = card.style.gridColumnEnd;
        const rowEnd = card.style.gridRowEnd;
        
        state.resizeInfo = {
            card: card,
            startX: e.clientX,
            startY: e.clientY,
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
        
        const actualWidthInPixels = (newW * CONFIG.GRID_CELL_SIZE) + 
                                   ((newW - 1) * CONFIG.GRID_GAP) + 
                                   CONFIG.HORIZONTAL_PIXEL_OFFSET;
        state.resizeInfo.card.style.width = `${actualWidthInPixels}px`;
    }

    static stopResize() {
        if (state.resizeInfo) {
            // 🔴 **تغییر این خط - از id به category**
            const category = state.resizeInfo.card.dataset.category;
            
            if (state.layoutMap[category]) {
                const colEnd = state.resizeInfo.card.style.gridColumnEnd;
                const rowEnd = state.resizeInfo.card.style.gridRowEnd;
                
                state.layoutMap[category].w = colEnd ? parseInt(colEnd.split(' ')[1]) : 8;
                state.layoutMap[category].h = rowEnd ? parseInt(rowEnd.split(' ')[1]) : 6;
                StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
            }
            
            // حذف event listeners
            if (state.resizeInfo.onResize && state.resizeInfo.stopResize) {
                window.removeEventListener('mousemove', state.resizeInfo.onResize);
                window.removeEventListener('mouseup', state.resizeInfo.stopResize);
            }
        }
        
        state.resizeInfo = null;
    }
}



// ==================== Import/Export System (فقط چیدمان) ====================
class ImportExportManager {
	
	
		// ==================== دریافت آنلاین (مثل افزونه قدیمی) ====================
	static async fetchJsonFromUrl(url) {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			return await response.json();
		} catch (e) {
			console.error("❌ خطا در دریافت از URL:", url, e);
			alert(`خطا در دریافت داده از ${url}. لطفا لینک را چک کنید.`);
			return null;
		}
	}

	// ---------- ایمپورت بوکمارک‌ها از لینک آنلاین (بدون alert) ----------
	static async importBookmarksOnline(silent = false) {
		const importedData = await this.fetchJsonFromUrl(CONFIG.ONLINE.BOOKMARKS_URL);
		if (!importedData) return false;

		try {
			const bookmarksArray = importedData.bookmarks || importedData;
			if (!Array.isArray(bookmarksArray)) {
				throw new Error('فرمت فایل نامعتبر است');
			}

			const success = await BookmarkManager.importBookmarks(bookmarksArray, true);
			if (success && !silent) {
			}
			return success;
		} catch (error) {
			console.error('خطا در ایمپورت بوکمارک‌های آنلاین:', error);
			return false;
		}
	}

	// ---------- ایمپورت تنظیمات (چیدمان) از لینک آنلاین (بدون alert) ----------
	static async importSettingsOnline(silent = false) {
		const importedData = await this.fetchJsonFromUrl(CONFIG.ONLINE.SETTINGS_URL);
		if (!importedData) return false;

		try {
			let layout = null;
			if (importedData.layout) {
				layout = importedData.layout;
			} else if (importedData && typeof importedData === 'object' && !importedData.bookmarks) {
				layout = importedData;
			}

			if (!layout) {
				throw new Error('اطلاعات چیدمان در فایل یافت نشد');
			}

			state.layoutMap = layout;
			await StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
			
			if (!silent) {
			}
			return true;
		} catch (error) {
			console.error('خطا در ایمپورت تنظیمات آنلاین:', error);
			return false;
		}
	}
	
	// ---------- ایمپورت بوکمارک‌ها از فایل محلی (درون extension) ----------
	static async importBookmarksLocal(silent = false) {
		try {
			const localUrl = chrome.runtime.getURL('data/bookmarks.json');
			const response = await fetch(localUrl);
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			const importedData = await response.json();
			
			const bookmarksArray = importedData.bookmarks || importedData;
			if (!Array.isArray(bookmarksArray)) {
				throw new Error('فرمت فایل bookmarks.json نامعتبر است');
			}
			
			const success = await BookmarkManager.importBookmarks(bookmarksArray, true);
			if (success && !silent) {
				console.log('✅ بوکمارک‌ها از فایل محلی با موفقیت ایمپورت شدند');
			}
			return success;
		} catch (error) {
			console.error('❌ خطا در ایمپورت بوکمارک‌های محلی:', error);
			return false;
		}
	}

	// ---------- ایمپورت تنظیمات (چیدمان) از فایل محلی ----------
	static async importSettingsLocal(silent = false) {
		try {
			const localUrl = chrome.runtime.getURL('data/settings.json');
			const response = await fetch(localUrl);
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			const importedData = await response.json();
			
			// استخراج layout
			let layout = null;
			if (importedData.layout) {
				layout = importedData.layout;
			} else if (importedData && typeof importedData === 'object' && !importedData.bookmarks) {
				layout = importedData;
			}
			
			if (!layout) {
				throw new Error('اطلاعات چیدمان در فایل settings.json یافت نشد');
			}
			
			state.layoutMap = layout;
			await StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
			if (!silent) {
				console.log('✅ تنظیمات چیدمان از فایل محلی با موفقیت ایمپورت شدند');
			}
			return true;
		} catch (error) {
			console.error('❌ خطا در ایمپورت تنظیمات محلی:', error);
			return false;
		}
	}

	static async combinedLocalImport(skipConfirm = true) {
		console.log('📥 شروع دریافت بوکمارک‌ها از فایل محلی...');
		const bookmarksOk = await this.importBookmarksLocal(skipConfirm);
		if (bookmarksOk) {
			console.log('📥 دریافت تنظیمات چیدمان از فایل محلی...');
			const settingsOk = await this.importSettingsLocal(skipConfirm);
			if (settingsOk) {
				// تضمین حالت کامل برای کارت زمان و آب و هوا
				if (state.layoutMap['زمان و آب و هوا']) {
					state.layoutMap['زمان و آب و هوا'].mode = 'full';
				} else {
					state.layoutMap['زمان و آب و هوا'] = {
						col: 9, row: 1, w: 4, h: 3, view: 'list', mode: 'full'
					};
				}
				await StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
				console.log('✅ حالت کارت زمان و آب و هوا به "full" تنظیم شد');
				await Renderer.renderDashboard();
			} else {
				console.warn('⚠️ بوکمارک‌ها دریافت شدند، اما تنظیمات با خطا مواجه شد.');
			}
		} else {
			console.error('❌ عملیات دریافت بوکمارک‌های محلی ناموفق بود.');
		}
	}	
	

	// ---------- عملیات ترکیبی (با قابلیت اسکیپ تأیید) ----------
	static async combinedOnlineImport(skipConfirm = false) {
		//if (!state.isEditMode && !skipConfirm) {
		//	alert('لطفاً ابتدا حالت ویرایش را فعال کنید.');
		//	return;
		//}

		//if (!skipConfirm) {
		//	if (!confirm('آیا مطمئن هستید؟ این عملیات، بوکمارک‌ها و چیدمان فعلی شما را با نسخه آنلاین جایگزین می‌کند.')) {
		//		return;
		//	}
		//}

		//console.log('📥 شروع دریافت آنلاین بوکمارک‌ها...');
		const bookmarksOk = await this.importBookmarksOnline(skipConfirm);

		if (bookmarksOk) {
			//console.log('📥 دریافت تنظیمات چیدمان...');
			const settingsOk = await this.importSettingsOnline(skipConfirm);
			
			if (settingsOk) {
				//console.log('✅ عملیات دریافت آنلاین کامل با موفقیت انجام شد.');
				await Renderer.renderDashboard();
			} else {
				console.warn('⚠️ بوکمارک‌ها دریافت شدند، اما تنظیمات با خطا مواجه شد.');
			}
		} else {
			console.error('❌ عملیات دریافت بوکمارک‌ها ناموفق بود.');
		}
	}
	// ---------- ایمپورت تنظیمات (چیدمان) از لینک آنلاین ----------
	static async importSettingsOnline() {
		const importedData = await this.fetchJsonFromUrl(CONFIG.ONLINE.SETTINGS_URL);
		if (!importedData) return false;

		try {
			// استخراج layout از داده‌های دریافتی (پشتیبانی از فرمت‌های مختلف)
			let layout = null;
			if (importedData.layout) {
				layout = importedData.layout;  // فرمت جدید { layout: {...} }
			} else if (importedData && typeof importedData === 'object' && !importedData.bookmarks) {
				layout = importedData;        // فرمت قدیم (خود شیء layout)
			}

			if (!layout) {
				throw new Error('اطلاعات چیدمان در فایل یافت نشد');
			}

			// اعمال layout
			state.layoutMap = layout;
			await StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
			
			//alert('✅ تنظیمات چیدمان با موفقیت دریافت و اعمال شد.');
			return true;
		} catch (error) {
			console.error('خطا در ایمپورت تنظیمات آنلاین:', error);
			alert('خطا در ایمپورت تنظیمات: ' + error.message);
		}
		return false;
	}

	// ---------- عملیات ترکیبی: دریافت همزمان بوکمارک و تنظیمات ----------
	static async combinedOnlineImport() {
		//if (!state.isEditMode) {
		//	alert('لطفاً ابتدا حالت ویرایش را فعال کنید.');
		//	return;
		//}

		//const confirmMsg = 'آیا مطمئن هستید؟ این عملیات، بوکمارک‌ها و چیدمان فعلی شما را با نسخه آنلاین جایگزین می‌کند.';
		//if (!confirm(confirmMsg)) return;

		//alert('شروع عملیات: دریافت بوکمارک‌ها...');
		const bookmarksOk = await this.importBookmarksOnline();

		if (bookmarksOk) {
		//	alert('دریافت تنظیمات چیدمان...');
			const settingsOk = await this.importSettingsOnline();
			
			if (settingsOk) {
		//		alert('✅ عملیات دریافت آنلاین کامل با موفقیت انجام شد.');
				await Renderer.renderDashboard();
			} else {
				alert('⚠️ بوکمارک‌ها دریافت شدند، اما تنظیمات با خطا مواجه شد.');
			}
		} else {
			alert('❌ عملیات دریافت بوکمارک‌ها ناموفق بود.');
		}
	}


    // ---------- اکسپورت بوکمارک‌ها (بدون تغییر) ----------
    static async exportBookmarks() {
        const exportData = await BookmarkManager.exportBookmarks();
        if (!exportData) {
            alert('خطا در export بوکمارک‌ها');
            return;
        }
        const dataStr = JSON.stringify(exportData, null, 2);
        this.downloadFile(dataStr, 'bookmarks_export.json', 'application/json');
    }

    // ---------- ایمپورت بوکمارک‌ها (بدون تغییر) ----------
    static async importBookmarks(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    if (!Array.isArray(importedData.bookmarks) && !Array.isArray(importedData)) {
                        throw new Error('فرمت فایل نامعتبر است');
                    }
                    const success = await BookmarkManager.importBookmarks(importedData, true);
                    if (success) {
                        await Renderer.renderDashboard();
                        resolve(true);
                    } else {
                        reject(new Error('خطا در import بوکمارک‌ها'));
                    }
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    // ---------- اکسپورت تنظیمات (فقط چیدمان) ----------
    static async exportSettings() {
        // فقط layoutMap را استخراج کن
        const layoutData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            layout: state.layoutMap || {}
        };
        
        const dataStr = JSON.stringify(layoutData, null, 2);
        this.downloadFile(dataStr, 'layout_export.json', 'application/json');
    }

    // ---------- ایمپورت تنظیمات (فقط چیدمان) ----------
    static async importSettings(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    
                    // پشتیبانی از فرمت قدیم و جدید
                    let importedLayout = null;
                    if (importedData.layout) {
                        // فرمت جدید (فقط چیدمان)
                        importedLayout = importedData.layout;
                    } else if (importedData && typeof importedData === 'object' && !importedData.bookmarks) {
                        // فرمت قدیم (کل شیء تنظیمات) – فقط بخش layout را بردار
                        importedLayout = importedData.layout || importedData;
                    }

                    if (!importedLayout) {
                        throw new Error('فرمت فایل نامعتبر است - اطلاعات چیدمان یافت نشد');
                    }

                    // اعمال چیدمان جدید
                    state.layoutMap = importedLayout;
                    await StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
                    
                    // ❌ سایر تنظیمات (theme, background, customUrls, settings, currentPaths) نادیده گرفته می‌شوند
                    
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

    static downloadFile(data, filename, type) {
        const blob = new Blob([data], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}



// ==================== رندرینگ و DOM ====================
class Renderer {
    static async renderDashboard() {
        const container = document.getElementById('grid-container');
        if (!container) return;
        
        container.innerHTML = '';
        document.body.classList.toggle('editing-mode', state.isEditMode);
        document.body.classList.toggle('compact-mode', state.isCompactMode);
        
        console.log('رندر کردن داشبورد با', state.bookmarks.length, 'بوکمارک');
        
        // اگر بوکمارکی نداریم، پیام نشان می‌دهیم
        if (state.bookmarks.length === 0) {
            container.innerHTML += `
                <div class="empty-state">
                    <h3>📚 بوکمارکی یافت نشد</h3>
                    <p>برای شروع، دکمه ویرایش را فشار داده و بوکمارک جدید اضافه کنید.</p>
                    <button id="add-first-bookmark" class="btn-success">افزودن اولین بوکمارک</button>
                </div>
            `;
            
            const addBtn = container.querySelector('#add-first-bookmark');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    document.getElementById('edit-mode-btn').click();
                });
            }
            
            return;
        }
        
        // ساختاردهی بوکمارک‌ها بر اساس دسته‌بندی
        const categorizedBookmarks = this.categorizeBookmarks(state.bookmarks);
        console.log('دسته‌بندی‌ها:', Object.keys(categorizedBookmarks));
        
        // ایجاد کارت ساعت و آب‌وهوا
        this.createDateTimeCard(container);
        
        // ایجاد کارت برای هر دسته‌بندی
        Object.entries(categorizedBookmarks).forEach(([category, items], index) => {
            const layout = state.layoutMap[category] || { 
                col: (index % 3) * 8 + 1, 
                row: Math.floor(index / 3) * 6 + 2,
                w: 8, 
                h: 6,
                view: "list"
            };
            
            state.layoutMap[category] = layout;
            this.createCard(category, items, layout, container);
        });
        
        // ذخیره layout جدید
        StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
        
        // اعمال فیلتر جستجو
        if (state.searchTerm) {
            this.applySearchFilter(state.searchTerm);
        }
    }

    // ========== ایجاد کارت زمان و آب‌وهوا ==========
	static createDateTimeCard(container) {
		const category = 'زمان و آب و هوا';
		const layout = state.layoutMap[category] || { 
			col: 9,  // سمت راست
			row: 1,
			w: 4, 
			h: 3,
			view: "list",
			mode: "full"   // حالت پیش‌فرض: full
		};
		
		state.layoutMap[category] = layout;
		
		// اگر حالت مخفی است، هیچ کارتی نساز
		if (layout.mode === 'hidden') {
			return;
		}
		
		const card = document.createElement('div');
		card.className = 'bookmark-card datetime-weather-card';
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
		
		// تعیین محتوای کارت بر اساس حالت
		let contentHtml = '';
		if (layout.mode === 'full') {
			contentHtml = `
				<div class="card-header">
					<div class="card-title">${category}</div>
					<button class="card-btn btn-drag visible-on-edit">::</button>
				</div>
				<div class="card-content datetime-weather-content">
					<div class="combined-layout">
						<div class="weather-column">
							<div class="weather-section">
								<div class="weather-row">
									<div class="weather-label">دما:</div>
									<div class="weather-value">
										<span class="weather-unit">°C</span>
										<span id="weather-temp">--</span>
									</div>
								</div>
								<div class="weather-row">
									<div class="weather-label">وضعیت:</div>
									<div class="weather-value">
										<span id="weather-icon">🌤️</span>
										<span id="weather-desc">---</span>
									</div>
								</div>
								<div class="weather-row">
									<div class="weather-label">باد:</div>
									<div class="weather-value" id="weather-wind">-- ک.م/ساعت</div>
								</div>
								<div class="weather-row">
									<div class="weather-label">شهر:</div>
									<div class="weather-value">
										<span id="weather-location">تهران</span>
										<button class="city-change-btn visible-on-edit" id="weather-city-change-btn" title="تغییر شهر">🔄</button>
									</div>
								</div>
							</div>
						</div>
						<div class="time-column">
							<div class="time-section">
								<div class="digital-time" id="digital-time">۰۰:۰۰</div>
								<div class="digital-date" id="digital-date">یکشنبه ۱ فروردین</div>
							</div>
						</div>
					</div>
				</div>
				<div class="resize-handle visible-on-edit"></div>
			`;
		} else { // mode === 'timeonly'
			contentHtml = `
				<div class="card-header">
					<div class="card-title">${category}</div>
					<button class="card-btn btn-drag visible-on-edit">::</button>
				</div>
				<div class="card-content datetime-weather-content" style="padding: 15px;">
					<div class="time-column" style="width: 100%; text-align: right;">
						<div class="time-section">
							<div class="digital-time" id="digital-time" style="font-size: 3rem; text-align: left;">۰۰:۰۰</div>
							<div class="digital-date" id="digital-date" style="font-size: 1.3rem; text-align: right;">یکشنبه ۱ فروردین</div>
						</div>
					</div>
				</div>
				<div class="resize-handle visible-on-edit"></div>
			`;
		}
		
		card.innerHTML = contentHtml;
		
		// رویدادهای درگ و ریسایز
		const dragBtn = card.querySelector('.btn-drag');
		const resizeEl = card.querySelector('.resize-handle');
		if (dragBtn) {
			dragBtn.addEventListener('mousedown', (e) => DragResizeManager.startDrag(e, card));
		}
		if (resizeEl) {
			resizeEl.addEventListener('mousedown', (e) => DragResizeManager.startResize(e, card));
		}
		
		container.appendChild(card);
		
		// راه‌اندازی ساعت (در هر دو حالت)
		this.initDigitalClock();
		
		// فقط در حالت full آب و هوا را به‌روز کن
		if (layout.mode === 'full') {
			// اطمینان از وجود المنت‌ها قبل از فراخوانی
			setTimeout(() => {
				this.initCombinedWeather();
				const cityChangeBtn = card.querySelector('#weather-city-change-btn');
				if (cityChangeBtn) {
					cityChangeBtn.addEventListener('click', (e) => {
						e.preventDefault();
						e.stopPropagation();
						this.openCitySelectorModal();
					});
				}
			}, 100);
		} else {
			// در حالت timeonly، مطمئن شو که المنت‌های آب و هوا وجود ندارند (فعلاً نیازی نیست)
			// فقط ساعت را داریم که قبلاً شروع شده
		}
		
		// استایل‌های ترکیبی را یک بار اضافه کن (اگر قبلاً اضافه نشده)
		this.loadCombinedStyles();
	}



    static loadCombinedStyles() {
        if (document.getElementById('combined-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'combined-styles';
        style.textContent = `
            .datetime-weather-content {
                height: 100%;
                padding: 15px;
                box-sizing: border-box;
            }
            .time-section, .weather-section {
                margin-top: -18px !important;
            }
            
            .combined-layout {
                display: flex;
                height: 100%;
                gap: 35px;
                justify-content: space-between;
                direction: ltr;
            }
            
            .time-column {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                justify-content: flex-start;
                direction: ltr;
            }
            
            .weather-column {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                justify-content: flex-start;
                direction: rtl;
            }
            
            .time-section {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                text-align: left;
                width: 100%;
            }
            
            .digital-time {
                font-size: 2.8rem;
                font-weight: 700;
                color: #3b82f6;
                line-height: 1;
                margin-bottom: 5px;
                letter-spacing: 1px;
                direction: ltr;
                text-align: left;
                font-family: 'Vazirmatn', 'Segoe UI', Tahoma, sans-serif;
                unicode-bidi: plaintext;
            }
            
            .digital-date {
                font-size: 1.3rem;
                font-weight: 500;
                color: #6b7280;
                font-family: 'Vazirmatn', 'Segoe UI', Tahoma, sans-serif;
                direction: rtl;
                text-align: right;
                width: 100%;
            }
            
            .weather-section {
                display: flex;
                flex-direction: column;
                gap: 8px;
                width: 100%;
                text-align: right;
            }
            
            .weather-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 4px 0;
                border-bottom: 1px solid #f1f1f1;
                direction: rtl;
            }
            
            .weather-row:last-child {
                border-bottom: none;
            }
            
            .weather-label {
                font-size: 0.9rem;
                color: #6b7280;
                font-weight: 500;
                min-width: 60px;
                text-align: right;
            }
            
            .weather-value {
                font-size: 1rem;
                color: #374151;
                display: flex;
                align-items: center;
                gap: 5px;
                text-align: right;
            }
            
            .weather-unit {
                font-size: 0.9rem;
                color: #374151;
            }
            
            .city-change-btn {
                background: none;
                border: none;
                cursor: pointer;
                font-size: 0.8rem;
                color: #6b7280;
                padding: 2px 6px;
                border-radius: 3px;
                transition: all 0.2s;
                opacity: 0;
                visibility: hidden;
                display: inline-flex;
                align-items: center;
                gap: 3px;
            }
            
            .visible-on-edit.city-change-btn {
                opacity: 1;
                visibility: visible;
            }
            
            .city-change-btn:hover {
                background-color: #f3f4f6;
                color: #3b82f6;
            }
            
            [data-theme="dark"] .digital-time {
                color: #60a5fa;
            }
            
            [data-theme="dark"] .weather-row {
                border-bottom-color: #4b5563;
            }
            
            [data-theme="dark"] .weather-label {
                color: #d1d5db;
            }
            
            [data-theme="dark"] .weather-value {
                color: #f3f4f6;
            }
        `;
        document.head.appendChild(style);
    }

    // ========== راه‌اندازی ساعت دیجیتال ==========
    static initDigitalClock() {
        const persianMonths = [
            'فروردین', 'اردیبهشت', 'خرداد', 
            'تیر', 'مرداد', 'شهریور', 
            'مهر', 'آبان', 'آذر', 
            'دی', 'بهمن', 'اسفند'
        ];
        
        const persianDays = [
            'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه',
            'پنجشنبه', 'جمعه', 'شنبه'
        ];
        
        const toPersianDigits = (num) => {
            const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
            return num.toString().replace(/\d/g, d => persianDigits[d]);
        };
        
        const updateDigitalClock = () => {
            const now = new Date();
            const jalali = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
            
            let hours = now.getHours();
            let minutes = now.getMinutes();
            
            const timeStr = `${toPersianDigits(hours.toString().padStart(2, '0'))}:${toPersianDigits(minutes.toString().padStart(2, '0'))}`;
            
            const dayOfWeek = now.getDay();
            const dayName = persianDays[dayOfWeek];
            const monthName = persianMonths[jalali[1] - 1];
            const dateStr = `${dayName} ${toPersianDigits(jalali[2])} ${monthName}`;
            
            const timeElement = document.getElementById('digital-time');
            const dateElement = document.getElementById('digital-date');
            
            if (timeElement) timeElement.textContent = timeStr;
            if (dateElement) dateElement.textContent = dateStr;
        };
        
        updateDigitalClock();
        setInterval(updateDigitalClock, 60000);
        
        const now = new Date();
        const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
        
        setTimeout(() => {
            updateDigitalClock();
            setInterval(updateDigitalClock, 60000);
        }, msUntilNextMinute);
    }

    static async initCombinedWeather() {
        try {
            const savedCity = await StorageManager.get(CONFIG.STORAGE_KEYS.SELECTED_CITY);
            const cityName = savedCity ? savedCity.name : 'تهران';
            
            document.getElementById('weather-location').textContent = cityName;
            
            const weatherData = await WeatherManager.getWeather();
            
            document.getElementById('weather-temp').textContent = weatherData.temperature;
            document.getElementById('weather-icon').textContent = WeatherManager.getWeatherIcon(weatherData.condition);
            document.getElementById('weather-desc').textContent = weatherData.condition;
            document.getElementById('weather-wind').textContent = `${weatherData.windSpeed} ک.م/ساعت`;
            
            setTimeout(() => this.initCombinedWeather(), 10 * 60 * 1000);
            
        } catch (error) {
            console.error('خطا در دریافت آب و هوا:', error);
            
            const fallback = WeatherManager.getFallbackWeather();
            document.getElementById('weather-temp').textContent = fallback.temperature;
            document.getElementById('weather-icon').textContent = WeatherManager.getWeatherIcon(fallback.condition);
            document.getElementById('weather-desc').textContent = fallback.condition;
            document.getElementById('weather-wind').textContent = `${fallback.windSpeed} ک.م/ساعت`;
            document.getElementById('weather-location').textContent = 'تهران';
        }
    }

    // ========== به‌روزرسانی آب‌وهوا ==========
    static async refreshWeather() {
        try {
            const weatherData = await WeatherManager.getWeather();
            
            document.getElementById('weather-temp').textContent = weatherData.temperature;
            document.getElementById('weather-icon').textContent = WeatherManager.getWeatherIcon(weatherData.condition);
            document.getElementById('weather-desc').textContent = weatherData.condition;
            document.getElementById('weather-wind').textContent = `${weatherData.windSpeed} ک.م/ساعت`;
            
        } catch (error) {
            console.error('خطا در دریافت آب و هوا:', error);
            
            const fallback = WeatherManager.getFallbackWeather();
            document.getElementById('weather-temp').textContent = fallback.temperature;
            document.getElementById('weather-icon').textContent = WeatherManager.getWeatherIcon(fallback.condition);
            document.getElementById('weather-desc').textContent = fallback.condition;
            document.getElementById('weather-wind').textContent = `${fallback.windSpeed} ک.م/ساعت`;
        }
    }

// ========== دسته‌بندی بوکمارک‌ها ==========
static categorizeBookmarks(bookmarks) {
    console.log('🔍 شروع دسته‌بندی بوکمارک‌ها:', bookmarks);
    
    const categories = {};
    
    if (!Array.isArray(bookmarks)) {
        console.warn('⚠️ bookmarks آرایه نیست، تلاش برای تبدیل...');
        if (bookmarks.bookmarks && Array.isArray(bookmarks.bookmarks)) {
            bookmarks = bookmarks.bookmarks;
        } else if (typeof bookmarks === 'object') {
            bookmarks = Object.values(bookmarks);
        } else {
            console.error('❌ فرمت bookmarks نامعتبر است');
            return { 'سایر': [] };
        }
    }
    
    console.log(`📊 تعداد بوکمارک‌ها برای دسته‌بندی: ${bookmarks.length}`);
    
    // فقط پوشه‌ها (folders) را به عنوان دسته‌بندی در نظر بگیر
    bookmarks.forEach(item => {
        if (!item || !item.title) return;
        
        // 🔴 شرط اصلاح شده: فقط آیتم‌هایی که type === 'folder' باشند یا children داشته باشند
        // ولی url نداشته باشند (یعنی پوشه هستند)
        const isFolder = item.children && !item.url;
        
        if (isFolder) {
            const categoryName = item.title;
            console.log(`➕ ایجاد دسته‌بندی (پوشه): "${categoryName}"`);
            
            categories[categoryName] = item.children || [];
            
            // ذخیره اطلاعات والد برای children
            if (item.children) {
                item.children.forEach(child => {
                    child._parentCategory = categoryName;
                    child._parentId = item.id;
                });
            }
        } else if (item.url) {
            // 🔴 این یک بوکمارک است (نه پوشه)
            // آن را در دسته‌بندی "سایر" قرار بده
            const category = item.category || 'سایر';
            if (!categories[category]) {
                categories[category] = [];
            }
            
            // 🔴 مهم: فقط خود بوکمارک را اضافه کن، نه به عنوان children
            categories[category].push(item);
            console.log(`🔗 اضافه کردن بوکمارک به "سایر": "${item.title}"`);
        }
    });
    
    console.log('✅ دسته‌بندی‌های ایجاد شده:', Object.keys(categories));
    
    // اگر هیچ دسته‌بندی ایجاد نشد
    if (Object.keys(categories).length === 0) {
        console.warn('⚠️ هیچ دسته‌بندی ایجاد نشد، ایجاد دسته‌بندی پیش‌فرض');
        categories['سایر'] = [];
    }
    
    return categories;
}



    // ========== ایجاد کارت بوکمارک‌ها ==========
    static createCard(category, items, layout, container) {
        const card = document.createElement('div');
        card.className = 'bookmark-card';
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
        
        card.innerHTML = `
            <div class="card-header">
                <div class="card-title">${category}</div>
                <button class="card-btn btn-drag visible-on-edit">::</button>
            </div>
            <div class="card-breadcrumbs">
                <span class="crumb">خانه</span>
            </div>
            <div class="card-content">
                <div class="bookmark-tiles"></div>
            </div>
            <div class="resize-handle visible-on-edit"></div>
        `;
        
        // ویرایش نام دسته‌بندی
        const titleEl = card.querySelector('.card-title');
        const dragBtn = card.querySelector('.btn-drag');
        const resizeEl = card.querySelector('.resize-handle');
        
        if (titleEl) {
            titleEl.addEventListener('click', () => {
                if (state.isEditMode) {
                    const newName = prompt("نام جدید دسته‌بندی:", category);
                    if (newName && newName !== category) {
                        delete state.layoutMap[category];
                        state.layoutMap[newName] = layout;
                        
                        state.bookmarks.forEach(bm => {
                            if (bm.category === category) {
                                bm.category = newName;
                            }
                        });
                        
                        this.renderDashboard();
                    }
                }
            });
        }
        
        if (dragBtn) {
            dragBtn.addEventListener('mousedown', (e) => DragResizeManager.startDrag(e, card));
        }
        
        if (resizeEl) {
            resizeEl.addEventListener('mousedown', (e) => DragResizeManager.startResize(e, card));
        }
        
        this.renderCardContent(card, items, layout.view || "list");
        container.appendChild(card);
    }

    // ========== رندر محتوای کارت ==========
    static async renderCardContent(cardEl, items, viewMode) {
        const tilesContainer = cardEl.querySelector('.bookmark-tiles');
        const breadcrumbs = cardEl.querySelector('.card-breadcrumbs');
        
        if (!tilesContainer) return;
        
        tilesContainer.innerHTML = '';
        tilesContainer.classList.toggle("view-grid", viewMode === "grid");
        tilesContainer.classList.toggle("view-list", viewMode === "list");
        
        const category = cardEl.dataset.category;
        const currentPath = state.currentPaths[category] || [];
        
        console.log('🎨 رندر کارت:', {
            category: category,
            path: currentPath,
            totalItems: items.length
        });
        
        this.renderBreadcrumbs(breadcrumbs, category, currentPath, items);
        
        if (state.isEditMode && breadcrumbs) {
            this.addControlButtons(breadcrumbs, category, currentPath);
        }
        
        try {
            const currentLevelItems = this.getCurrentLevelItems(category, items, currentPath);
            console.log(`📝 ${currentLevelItems?.length || 0} آیتم برای نمایش`);
            
            if (!currentLevelItems || currentLevelItems.length === 0) {
                tilesContainer.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #666;">
                        <p>📂 این پوشه خالی است</p>
                    </div>
                `;
                return;
            }
            
            for (const item of currentLevelItems) {
                const tile = await this.createTile(item, viewMode, category, currentPath);
                if (tile) {
                    tilesContainer.appendChild(tile);
                }
            }
        } catch (error) {
            console.error('❌ خطا در رندر کارت:', error);
            tilesContainer.innerHTML = `
                <div class="error-message">
                    <p>خطا در بارگذاری محتوا</p>
                    <button onclick="location.reload()">بارگذاری مجدد</button>
                </div>
            `;
        }
    }

// ========== دریافت آیتم‌های سطح فعلی ==========
static getCurrentLevelItems(category, items, currentPath) {
    console.log('🔍 دریافت آیتم‌های سطح:', {
        category: category,
        currentPath: currentPath,
        itemsCount: items.length
    });
    
    // اگر در ریشه هستیم، همان items را برگردان
    if (!currentPath || currentPath.length === 0) {
        console.log('📁 حالت ریشه - نمایش تمام آیتم‌ها');
        return items;
    }
    
    console.log('📂 حالت داخل پوشه - مسیر:', currentPath);
    
    // حرکت در مسیر پوشه‌های تو در تو
    let currentLevel = items;
    
    for (let i = 0; i < currentPath.length; i++) {
        const folderId = currentPath[i];
        console.log(`   ↪️ سطح ${i + 1}: جستجوی پوشه ${folderId}`);
        
        // 🔴 اصلاح شرط: پوشه باید children داشته باشد
        const nextFolder = currentLevel.find(item => 
            item.id === folderId && (item.type === 'folder' || item.children) && !item.url
        );
        
        if (!nextFolder) {
            console.error(`❌ پوشه ${folderId} پیدا نشد`);
            return [];
        }
        
        // اگر آخرین سطح مسیر هستیم
        if (i === currentPath.length - 1) {
            console.log('✅ آخرین سطح مسیر رسیدیم');
            return nextFolder.children || [];
        }
        
        // به سطح بعد برو
        currentLevel = nextFolder.children || [];
    }
    
    return currentLevel;
}




    // ========== رندر Breadcrumbs ==========
    static renderBreadcrumbs(breadcrumbsEl, category, currentPath, allItems) {
        console.log('🔄 شروع Breadcrumb...');
        
        if (!breadcrumbsEl) {
            console.warn('Breadcrumbs element پیدا نشد');
            return;
        }
        
        breadcrumbsEl.innerHTML = '';
        
        const context = {
            category: category,
            navigate: this.navigateToPath.bind(this)
        };
        
        const homeBtn = this.createBreadcrumbButton('خانه', [], context);
        breadcrumbsEl.appendChild(homeBtn);
        
        if (currentPath && currentPath.length > 0) {
            console.log('🗺️ ساختن مسیر Breadcrumb:', currentPath);
            
            let accumulatedPath = [];
            let currentItems = allItems;
            
            for (let i = 0; i < currentPath.length; i++) {
                const folderId = currentPath[i];
                
                const separator = document.createElement('span');
                separator.textContent = '›';
                separator.style.margin = '0 8px';
                separator.style.color = '#ff0000';
                breadcrumbsEl.appendChild(separator);
                
                let folderName = `پوشه ${i + 1}`;
                if (currentItems && Array.isArray(currentItems)) {
                    const folder = currentItems.find(item => item && item.id === folderId);
                    if (folder && folder.title) {
                        folderName = folder.title;
                    }
                }
                
                accumulatedPath = currentPath.slice(0, i + 1);
                const folderBtn = this.createBreadcrumbButton(folderName, accumulatedPath, context);
                breadcrumbsEl.appendChild(folderBtn);
                
                if (currentItems && Array.isArray(currentItems)) {
                    const folder = currentItems.find(item => item && item.id === folderId);
                    if (folder && folder.children) {
                        currentItems = folder.children;
                    }
                }
            }
        }
        
        console.log('✅ Breadcrumb ساخته شد');
    }

    // ========== ایجاد دکمه‌های Breadcrumb ==========
    static createBreadcrumbButton(text, path, context) {
        const button = document.createElement('button');
        button.textContent = text;
        button.className = 'crumb';
        
        Object.assign(button.style, {
            background: 'none',
            border: 'none',
            color: '#3b82f6',
            cursor: 'pointer',
            padding: '2px 8px',
            margin: '0 2px',
            fontSize: '14px',
            fontFamily: '"Vazirmatn", Tahoma, sans-serif',
            fontWeight: '400',
            textDecoration: 'underline'
        });
        
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log(`📍 کلیک Breadcrumb: "${text}" ->`, path);
            
            if (context.navigate) {
                context.navigate(context.category, path);
            } else {
                console.error('تابع navigate وجود ندارد');
            }
        });
        
        return button;
    }

// ========== ناوبری به مسیر ==========
static navigateToPath(category, newPath) {
    console.log('========== ناوبری ==========');
    console.log('دسته‌بندی:', category);
    console.log('مسیر جدید:', newPath);
    console.log('مسیر قبلی:', state.currentPaths[category]);
    
    state.currentPaths[category] = newPath;
    //StorageManager.set(CONFIG.STORAGE_KEYS.CURRENT_PATHS, state.currentPaths);
    
    // ❌ قدیم: this.renderDashboard();
    // ✅ جدید: فقط کارت مربوطه را آپدیت کن
    this.updateCard(category);
}

// ========== آپدیت فقط یک کارت ==========
static async updateCard(category) {
    const container = document.getElementById('grid-container');
    if (!container) return;
    
    // کارت مربوط به این دسته‌بندی را پیدا کن
    const cards = container.querySelectorAll('.bookmark-card');
    let targetCard = null;
    for (let card of cards) {
        if (card.dataset.category === category) {
            targetCard = card;
            break;
        }
    }
    
    if (!targetCard) {
        // اگر کارت پیدا نشد (مثلاً کارت ساعت و آب‌وهوا)، کل داشبورد رندر شود
        this.renderDashboard();
        return;
    }
    
    // آیتم‌های این دسته‌بندی را از state.bookmarks استخراج کن
    const categorized = this.categorizeBookmarks(state.bookmarks);
    const items = categorized[category] || [];
    
    const layout = state.layoutMap[category] || { view: 'list' };
    
    // فقط محتوای کارت را رندر کن (بدون تغییر هدر و سایز)
    await this.renderCardContent(targetCard, items, layout.view);
}

// ========== ایجاد Tile ==========
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
                    const newPath = [...(currentPath || []), item.id];
                    this.navigateToPath(category, newPath);
                }
            });
		} else if (item.url) {
			tile.href = item.url;
			tile.target = "_self"; // باز شدن در همین تب
		}
        
        tile.classList.toggle("tile-grid-mode", viewMode === "grid");
        
        // ---------- آیکون هوشمند (با اولویت جدید) ----------
        const img = document.createElement("img");
        img.className = "tile-icon";
        
        if (isFolder) {
            img.src = CONFIG.FOLDER_ICON_PATH;
        } else if (item.url) {
            // همیشه با فال‌بک شروع کن
            img.src = CONFIG.FALLBACK_ICON_PATH;
            
            // 🥇 مرحله 1: سیستم سه‌مرحله‌ای
            FaviconManager.resolveFavicon(item.url).then(icon => {
                if (icon && icon !== CONFIG.FALLBACK_ICON_PATH) {
                    // امتحان کن ببینم لود میشه؟
                    const testImg = new Image();
                    testImg.onload = () => { img.src = icon; };
                    testImg.src = icon;
                } else {
                    // 🥈 مرحله 2: آیکون سفارشی
                    const customIcon = state.customIcons?.[item.url];
                    if (customIcon) {
                        const testImg = new Image();
                        testImg.onload = () => { img.src = customIcon; };
                        testImg.src = customIcon;
                    }
                    // 🥉 مرحله 3: اگر هیچکدام نبود، همان فال‌بک می‌ماند
                }
            }).catch(() => {
                // در صورت خطا، آیکون سفارشی را امتحان کن
                const customIcon = state.customIcons?.[item.url];
                if (customIcon) {
                    const testImg = new Image();
                    testImg.onload = () => { img.src = customIcon; };
                    testImg.src = customIcon;
                }
            });
            
            // 🔥 تور ایمنی: اگر هر عکسی لود نشد، فال‌بک بذار
            img.onerror = function() {
                if (this.src !== CONFIG.FALLBACK_ICON_PATH) {
                    this.src = CONFIG.FALLBACK_ICON_PATH;
                }
                this.onerror = null;
            };
        } else {
            img.src = CONFIG.FALLBACK_ICON_PATH;
        }
        
        // ---------- نام ----------
        const nameDiv = document.createElement("div");
        nameDiv.className = "tile-name";
        nameDiv.textContent = item.title;
        nameDiv.title = item.description || item.title;
        
        tile.appendChild(img);
        tile.appendChild(nameDiv);
        
        return tile;
    } catch (error) {
        console.error('خطا در ایجاد tile:', error, item);
        return null;
    }
}



    // ========== افزودن دکمه‌های کنترل ==========
    static addControlButtons(breadcrumbs, category, currentPath) {
        if (!breadcrumbs) return;
        
        console.log('اضافه کردن دکمه‌های کنترل برای:', category);
        
        breadcrumbs.querySelectorAll('.card-control-btn').forEach(btn => btn.remove());
        
        if (!state.isEditMode) return;
        
        // دکمه تغییر حالت نمایش
        const viewBtn = document.createElement('button');
        viewBtn.className = "card-control-btn btn-view-crumb";
        viewBtn.innerHTML = "👁️";
        viewBtn.title = "تغییر حالت نمایش";
        
        viewBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('کلیک روی تغییر حالت نمایش');
            
            const layout = state.layoutMap[category];
            if (layout) {
                layout.view = layout.view === "grid" ? "list" : "grid";
                StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
                this.renderDashboard();
            }
        });
        
        breadcrumbs.appendChild(viewBtn);
        
        // دکمه برگشت (اگر در پوشه‌ای هستیم)
        if (currentPath && currentPath.length > 0) {
            const backBtn = document.createElement('button');
            backBtn.className = "card-control-btn btn-back-crumb";
            backBtn.innerHTML = "↩️";
            backBtn.title = "برگشت به سطح قبل";
            
            backBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('کلیک روی برگشت');
                
                const newPath = currentPath.slice(0, -1);
                this.navigateToPath(category, newPath);
            });
            
            breadcrumbs.appendChild(backBtn);
        }
        
        console.log('تعداد دکمه‌های اضافه شده:', breadcrumbs.querySelectorAll('.card-control-btn').length);
    }

    // ========== اعمال فیلتر جستجو ==========
    static applySearchFilter(searchTerm) {
        const tiles = document.querySelectorAll('.tile');
        
        if (!searchTerm || searchTerm.trim() === '') {
            tiles.forEach(tile => {
                tile.classList.remove('filtered-out');
                tile.classList.remove('highlighted');
            });
            return;
        }
        
        tiles.forEach(tile => {
            const title = tile.querySelector('.tile-name')?.textContent.toLowerCase() || '';
            const matches = title.includes(searchTerm);
            
            tile.classList.toggle('filtered-out', !matches);
            tile.classList.toggle('highlighted', matches);
        });
    }

    // ========== باز کردن مودال انتخاب شهر ==========
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
                        <input type="text" 
                               id="global-city-search-input" 
                               class="city-search-input" 
                               placeholder="نام شهر را وارد کنید (مثال: تهران، مشهد، اصفهان...)"
                               autocomplete="off">
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
            if (searchInput) {
                searchInput.focus();
                const savedCity = StorageManager.get('netcofe_selected_city');
                if (savedCity) {
                    searchInput.value = savedCity.name;
                }
            }
        }, 100);
    }

    static addCityModalStyles() {
        if (document.getElementById('city-modal-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'city-modal-styles';
        style.textContent = `
            .city-selector-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }
            
            .city-selector-modal.hidden {
                display: none;
            }
            
            .city-selector-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(3px);
            }
            
            .city-selector-content {
                position: relative;
                background: white;
                border-radius: 16px;
                padding: 25px;
                width: 90%;
                max-width: 500px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                z-index: 1001;
                direction: rtl;
            }
            
            [data-theme="dark"] .city-selector-content {
                background: #1f2937;
                color: #f9fafb;
            }
            
            .city-selector-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 1px solid #e5e7eb;
            }
            
            [data-theme="dark"] .city-selector-header {
                border-bottom-color: #4b5563;
            }
            
            .city-selector-header h3 {
                margin: 0;
                font-family: 'Vazirmatn', sans-serif;
                font-size: 1.4rem;
                color: #374151;
            }
            
            [data-theme="dark"] .city-selector-header h3 {
                color: #f9fafb;
            }
            
            .close-city-selector {
                background: none;
                border: none;
                font-size: 1.8rem;
                cursor: pointer;
                color: #6b7280;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: background 0.2s;
            }
            
            .close-city-selector:hover {
                background: #f3f4f6;
                color: #374151;
            }
            
            [data-theme="dark"] .close-city-selector:hover {
                background: #4b5563;
                color: #f9fafb;
            }
            
            .city-input-container {
                margin-bottom: 20px;
                position: relative;
            }
            
            .city-search-input {
                width: 100%;
                padding: 12px 16px;
                border: 2px solid #e5e7eb;
                border-radius: 10px;
                font-family: 'Vazirmatn', sans-serif;
                font-size: 1rem;
                box-sizing: border-box;
                direction: rtl;
                transition: border-color 0.2s;
            }
            
            .city-search-input:focus {
                outline: none;
                border-color: #3b82f6;
            }
            
            [data-theme="dark"] .city-search-input {
                background: #374151;
                border-color: #4b5563;
                color: #f9fafb;
            }
            
            .city-suggestions {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: white;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                max-height: 250px;
                overflow-y: auto;
                display: none;
                z-index: 1002;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                direction: rtl;
            }
            
            [data-theme="dark"] .city-suggestions {
                background: #374151;
                border-color: #4b5563;
            }
            
            .city-suggestion {
                padding: 12px 16px;
                cursor: pointer;
                border-bottom: 1px solid #f3f4f6;
                font-family: 'Vazirmatn', sans-serif;
                text-align: right;
                transition: background 0.2s;
            }
            
            .city-suggestion:hover {
                background: #f3f4f6;
            }
            
            [data-theme="dark"] .city-suggestion:hover {
                background: #4b5563;
            }
            
            .city-suggestion:last-child {
                border-bottom: none;
            }
            
            .city-selector-buttons {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
            }
            
            .btn-primary {
                background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-family: 'Vazirmatn', sans-serif;
                font-weight: 600;
                transition: all 0.2s;
            }
            
            .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
            }
            
            .btn-secondary {
                background: #6b7280;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-family: 'Vazirmatn', sans-serif;
                font-weight: 600;
                transition: all 0.2s;
            }
            
            .btn-secondary:hover {
                background: #4b5563;
            }
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
        const overlay = modal.querySelector('.city-selector-overlay');
        
        if (!modal) return;
        
        let selectedCity = null;
        
        const closeModal = () => {
            modal.classList.add('hidden');
            if (citySearchInput) citySearchInput.value = '';
            if (citySuggestions) {
                citySuggestions.innerHTML = '';
                citySuggestions.style.display = 'none';
            }
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
                    if (citySuggestions) {
                        citySuggestions.innerHTML = '';
                        citySuggestions.style.display = 'none';
                    }
                    return;
                }
                
                searchTimeout = setTimeout(async () => {
                    await this.searchCities(query, citySuggestions);
                }, 500);
            });
        }
        
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                const cityName = citySearchInput ? citySearchInput.value.trim() : '';
                
                if (!cityName) {
                    alert('لطفاً نام شهر را وارد کنید');
                    return;
                }
                
                try {
                    let cityToSave = selectedCity;
                    
                    if (!cityToSave) {
                        const cities = await this.searchCitiesAPI(cityName);
                        if (cities && cities.length > 0) {
                            cityToSave = {
                                name: cities[0].name,
                                coordinates: `${cities[0].lat},${cities[0].lon}`,
                                fullName: cities[0].display_name
                            };
                        } else {
                            alert('شهر "' + cityName + '" پیدا نشد.');
                            return;
                        }
                    }
                    
                    await StorageManager.set(CONFIG.STORAGE_KEYS.SELECTED_CITY, cityToSave);
                    
                    const [lat, lon] = cityToSave.coordinates.split(',').map(Number);
                    WeatherManager.userCoordinates = { latitude: lat, longitude: lon };
                    
                    document.getElementById('weather-location').textContent = cityToSave.name;
                    
                    closeModal();
                    
                    await this.refreshWeather();
                    
                } catch (error) {
                    console.error('خطا در ذخیره شهر:', error);
                    alert('خطا در ذخیره شهر: ' + error.message);
                }
            });
        }
        
        if (citySuggestions) {
            citySuggestions.addEventListener('click', (e) => {
                const suggestion = e.target.closest('.city-suggestion');
                if (suggestion && suggestion.dataset.city) {
                    try {
                        const cityData = JSON.parse(suggestion.dataset.city);
                        
                        selectedCity = {
                            name: cityData.display_name.split(',')[0],
                            coordinates: `${cityData.lat},${cityData.lon}`,
                            fullName: cityData.display_name
                        };
                        
                        if (citySearchInput) {
                            citySearchInput.value = selectedCity.name;
                        }
                        
                        citySuggestions.innerHTML = '';
                        citySuggestions.style.display = 'none';
                    } catch (error) {
                        console.error('خطا در پردازش شهر:', error);
                    }
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
                const displayParts = city.display_name.split(',').slice(0, 2).join(', ');
                div.textContent = displayParts;
                div.dataset.city = JSON.stringify({
                    display_name: city.display_name,
                    lat: city.lat,
                    lon: city.lon
                });
                suggestionsContainer.appendChild(div);
            });
            
            suggestionsContainer.style.display = 'block';
            
        } catch (error) {
            console.error('خطا در جستجوی شهرها:', error);
            suggestionsContainer.innerHTML = '<div class="city-suggestion">خطا در جستجو</div>';
            suggestionsContainer.style.display = 'block';
        }
    }

	static async searchCitiesAPI(query) {
		if (!query || query.trim().length < 2) return [];
		try {
			// استفاده از Geocoding API خود Open-Meteo (پایدار و کامل برای ایران)
			const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=fa&format=json&country=IR`;
			const response = await fetch(url);
			
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			
			const data = await response.json();
			
			if (!data.results || !Array.isArray(data.results)) {
				return [];
			}
			
			// تبدیل به فرمت مورد نیاز
			const cities = data.results.map(city => ({
				name: city.name,  // نام فارسی (اگر موجود باشد، وگرنه انگلیسی)
				lat: city.latitude,
				lon: city.longitude,
				display_name: city.name + (city.admin1 ? `، ${city.admin1}` : '') + (city.country ? `، ${city.country}` : '')
			}));
			
			return cities;
		} catch (error) {
			console.error('خطا در جستجوی شهر (Open-Meteo Geocoding):', error);
			return [];
		}
	}
}

// ==================== سیستم جستجوی کامل (نسخه نهایی) ====================
class SearchManager {
    static flattenBookmarks(items) {
        let results = [];
        if (!items || !Array.isArray(items)) return results;
        for (const item of items) {
            results.push(item);
            if (item.children && Array.isArray(item.children) && item.children.length > 0) {
                results = results.concat(this.flattenBookmarks(item.children));
            }
        }
        return results;
    }

    static searchAllBookmarks(searchTerm) {
        console.log('🔎 جستجو برای:', searchTerm);
        if (!searchTerm || searchTerm.trim() === '') {
            return { results: [], total: 0, folders: 0, bookmarks: 0 };
        }

        const allItems = this.flattenBookmarks(state.bookmarks);
        console.log('📊 تمام آیتم‌ها:', allItems.map(i => ({ title: i.title, url: i.url })));

        const term = searchTerm.toLowerCase().trim();
        const results = allItems.filter(item => {
            const title = (item.title || '').toLowerCase();
            const url = (item.url || '').toLowerCase();
            return title.includes(term) || url.includes(term);
        });

        console.log(`✅ ${results.length} نتیجه پیدا شد:`, results.map(i => i.title));
        return {
            results,
            total: results.length,
            folders: results.filter(item => !item.url && item.children).length,
            bookmarks: results.filter(item => item.url && !item.children).length
        };
    }

    static showSearchResults(searchTerm, results) {
        // حذف مودال قبلی
        const existing = document.getElementById('search-results-modal');
        if (existing) existing.remove();

        const searchContainer = document.getElementById('search-container');
        const searchInput = document.getElementById('bookmark-search');
        if (!searchContainer || !searchInput) return;

        const containerRect = searchContainer.getBoundingClientRect();

        // فیلتر بوکمارک‌های واقعی (دارای url و بدون children)
        const bookmarksOnly = results.results.filter(item => item.url && !item.children);
        console.log('🔗 بوکمارک‌های قابل نمایش:', bookmarksOnly.map(i => i.title));

        // مودال اصلی
        const modal = document.createElement('div');
        modal.id = 'search-results-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 9999;
            pointer-events: none;
        `;

        // overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: transparent;
            pointer-events: auto;
        `;
        overlay.onclick = () => modal.remove();

        // محتوای مودال
        const content = document.createElement('div');
        content.style.cssText = `
            position: absolute;
            top: ${containerRect.bottom + 5}px;
            left: ${containerRect.left}px;
            width: ${containerRect.width}px;
            max-height: 400px;
            overflow-y: auto;
            background: ${state.isDarkMode ? '#2d3748' : '#fff'};
            border: 1px solid ${state.isDarkMode ? '#4a5568' : '#e0e0e0'};
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            direction: rtl;
            font-family: 'Vazirmatn', Tahoma, sans-serif;
            padding: 8px 0;
            pointer-events: auto;
            color: ${state.isDarkMode ? '#e2e8f0' : '#374151'};
        `;

        // هدر
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            border-bottom: 1px solid ${state.isDarkMode ? '#4a5568' : '#e5e7eb'};
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-weight: 600;
        `;
        header.innerHTML = `<span>🔍 نتایج برای "${this.escapeHTML(searchTerm)}"</span>`;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background: none; border: none; font-size: 20px; cursor: pointer;
            color: ${state.isDarkMode ? '#e2e8f0' : '#6b7280'};
            width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
            border-radius: 50%;
        `;
        closeBtn.onmouseover = () => closeBtn.style.background = state.isDarkMode ? '#4a5568' : '#f3f4f6';
        closeBtn.onmouseout = () => closeBtn.style.background = 'none';
        closeBtn.onclick = () => modal.remove();
        header.appendChild(closeBtn);
        content.appendChild(header);

        // بدنه
        const body = document.createElement('div');
        body.style.padding = '8px 0';

        if (bookmarksOnly.length === 0) {
            const noResult = document.createElement('div');
            noResult.style.cssText = 'padding: 20px 16px; text-align: center; color: #6b7280;';
            noResult.textContent = `❌ هیچ بوکمارکی برای "${searchTerm}" یافت نشد`;
            body.appendChild(noResult);
        } else {
            const categoryDiv = document.createElement('div');
            categoryDiv.style.marginBottom = '12px';
            
            const title = document.createElement('h4');
            title.style.cssText = `
                margin: 0 0 8px 0; padding: 0 16px;
                font-size: 13px; font-weight: 600; color: ${state.isDarkMode ? '#d1d5db' : '#6b7280'};
                display: flex; align-items: center; gap: 6px;
            `;
            title.innerHTML = `🔗 بوکمارک‌ها (${bookmarksOnly.length})`;
            categoryDiv.appendChild(title);

            const itemsDiv = document.createElement('div');
            itemsDiv.style.display = 'flex';
            itemsDiv.style.flexDirection = 'column';
            itemsDiv.style.gap = '4px';

            bookmarksOnly.slice(0, 20).forEach(item => {
                const link = document.createElement('a');
                link.href = item.url;
                link.target = '_self';
                link.style.cssText = `
                    display: flex; align-items: center; padding: 8px 16px;
                    gap: 10px; cursor: pointer; text-decoration: none;
                    color: ${state.isDarkMode ? '#e2e8f0' : '#374151'};
                `;
                link.onmouseover = () => link.style.background = state.isDarkMode ? '#374151' : '#f3f4f6';
                link.onmouseout = () => link.style.background = 'none';

                // آیکون
                const iconSpan = document.createElement('span');
                iconSpan.style.fontSize = '16px';
                iconSpan.textContent = '🔗';
                
                // اطلاعات
                const infoDiv = document.createElement('div');
                infoDiv.style.flex = '1';
                infoDiv.style.minWidth = '0';
                
                const titleSpan = document.createElement('div');
                titleSpan.style.cssText = `
                    font-weight: 500; font-size: 13px; margin-bottom: 2px;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                `;
                titleSpan.textContent = item.title || 'بی‌نام';
                
                infoDiv.appendChild(titleSpan);
                
                if (item.description) {
                    const descDiv = document.createElement('div');
                    descDiv.style.cssText = `
                        font-size: 11px; color: ${state.isDarkMode ? '#9ca3af' : '#6b7280'};
                        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                    `;
                    descDiv.textContent = item.description;
                    infoDiv.appendChild(descDiv);
                }

                link.appendChild(iconSpan);
                link.appendChild(infoDiv);
                itemsDiv.appendChild(link);
            });

            if (bookmarksOnly.length > 20) {
                const more = document.createElement('div');
                more.style.cssText = `
                    padding: 8px 16px; font-size: 12px; color: #6b7280;
                    text-align: center; border-top: 1px solid ${state.isDarkMode ? '#4a5568' : '#e5e7eb'};
                    margin-top: 8px;
                `;
                more.textContent = `+${bookmarksOnly.length - 20} مورد دیگر...`;
                itemsDiv.appendChild(more);
            }

            categoryDiv.appendChild(itemsDiv);
            body.appendChild(categoryDiv);
        }

        content.appendChild(body);
        modal.appendChild(overlay);
        modal.appendChild(content);
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
// ==================== Event Handlers ====================
class EventManager {
static setup() {
    console.log('تنظیم رویدادها...');
    
    const editModeBtn = document.getElementById('edit-mode-btn');
    if (editModeBtn) {
        editModeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
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
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            if (!confirm('آیا از به‌روزرسانی بوکمارک‌ها اطمینان دارید؟')) return;
            try {
                await BookmarkManager.loadBookmarks();
                await Renderer.renderDashboard();
                alert('بوکمارک‌ها با موفقیت به‌روزرسانی شدند.');
            } catch (error) {
                alert('خطا در به‌روزرسانی بوکمارک‌ها: ' + error.message);
            }
        });
    }
    
    const globalCityChangeBtn = document.getElementById('global-city-change-btn');
    if (globalCityChangeBtn) {
        globalCityChangeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            Renderer.openCitySelectorModal();
        });
    }
    
    const themeBtn = document.getElementById('toggle-theme-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            ThemeManager.toggleTheme();
        });
    }
    
	// ========== سیستم جستجوی جدید (بالا سمت راست) ==========
const searchBtn = document.getElementById('search-btn');
const closeSearchMainBtn = document.getElementById('close-search-btn');
const searchContainer = document.getElementById('search-container');
const searchInput = document.getElementById('bookmark-search');

if (searchBtn && closeSearchMainBtn && searchContainer && searchInput) {
    // غیرفعال کردن دکمه بستن قدیمی داخل کادر
    const oldCloseBtn = document.getElementById('close-search');
    if (oldCloseBtn) oldCloseBtn.style.display = 'none';
    
    // اطمینان از وضعیت اولیه
    searchContainer.style.display = 'none';
    searchContainer.classList.add('hidden');
    closeSearchMainBtn.style.display = 'none';
    searchBtn.style.display = 'flex';
    
    // رویداد باز کردن جستجو
    const openSearch = () => {
        searchContainer.style.display = 'flex';
        searchContainer.classList.remove('hidden');
        searchBtn.style.display = 'none';
        closeSearchMainBtn.style.display = 'flex';
        setTimeout(() => searchInput.focus(), 100);
    };
    
    // رویداد بستن جستجو
    const closeSearch = () => {
        searchContainer.style.display = 'none';
        searchContainer.classList.add('hidden');
        searchBtn.style.display = 'flex';
        closeSearchMainBtn.style.display = 'none';
        searchInput.value = '';
        
        // حذف مودال نتایج
        const modal = document.getElementById('search-results-modal');
        if (modal) modal.remove();
        
        // پاک کردن فیلتر جستجو
        if (typeof Renderer !== 'undefined' && Renderer.applySearchFilter) {
            Renderer.applySearchFilter('');
        }
    };
    
    // اتصال رویدادها
    searchBtn.addEventListener('click', openSearch);
    closeSearchMainBtn.addEventListener('click', closeSearch);
    
    // جستجو هنگام تایپ
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const term = e.target.value.trim();
        
        const existingModal = document.getElementById('search-results-modal');
        if (existingModal) existingModal.remove();
        
        if (term.length === 0) {
            if (typeof Renderer !== 'undefined' && Renderer.applySearchFilter) {
                Renderer.applySearchFilter('');
            }
            return;
        }
        
        searchTimeout = setTimeout(() => {
            if (typeof SearchManager !== 'undefined') {
                const results = SearchManager.searchAllBookmarks(term);
                SearchManager.showSearchResults(term, results);
            }
        }, 300);
    });
    
    // بستن با کلید Escape
    const handleEscape = (e) => {
        if (e.key === 'Escape' && searchContainer.style.display === 'flex') {
            closeSearch();
        }
    };
    document.addEventListener('keydown', handleEscape);
    
    console.log('✅ سیستم جستجوی جدید راه‌اندازی شد');
} else {
    console.error('❌ عناصر جستجو پیدا نشدند:', {
        searchBtn: !!searchBtn,
        closeSearchMainBtn: !!closeSearchMainBtn,
        searchContainer: !!searchContainer,
        searchInput: !!searchInput
    });
}
    
    const bgBtn = document.getElementById('set-background-btn');
    if (bgBtn) {
        bgBtn.addEventListener('click', () => {
            const bgInput = document.getElementById('background-file-input');
            if (bgInput) bgInput.click();
        });
    }
    
    const combinedOnlineImportBtn = document.getElementById('combined-online-import-btn');
    if (combinedOnlineImportBtn) {
        combinedOnlineImportBtn.addEventListener('click', (e) => {
            const confirmMsg = 'آیا مطمئن هستید؟ این عملیات، بوکمارک‌ها و چیدمان فعلی شما را با نسخه آنلاین جایگزین می‌کند.';
            if (!confirm(confirmMsg)) return;
            e.preventDefault();
            e.stopPropagation();
            ImportExportManager.combinedOnlineImport();
        });
    }
    
    const exportBookmarksBtn = document.getElementById('export-bookmarks-btn');
    if (exportBookmarksBtn) {
        exportBookmarksBtn.addEventListener('click', () => {
            ImportExportManager.exportBookmarks();
        });
    }
    
    const importBookmarksBtn = document.getElementById('import-bookmarks-btn');
    if (importBookmarksBtn) {
        importBookmarksBtn.addEventListener('click', () => {
            const importInput = document.getElementById('import-bookmarks-file');
            if (importInput) importInput.click();
        });
    }
    
    const exportSettingsBtn = document.getElementById('export-settings-btn');
    if (exportSettingsBtn) {
        exportSettingsBtn.addEventListener('click', () => {
            ImportExportManager.exportSettings();
        });
    }
    
    const importSettingsBtn = document.getElementById('import-settings-btn');
    if (importSettingsBtn) {
        importSettingsBtn.addEventListener('click', () => {
            const importInput = document.getElementById('import-settings-file');
            if (importInput) importInput.click();
        });
    }
    
    const importBookmarksFile = document.getElementById('import-bookmarks-file');
    if (importBookmarksFile) {
        importBookmarksFile.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (confirm('آیا از وارد کردن بوکمارک‌ها اطمینان دارید؟')) {
                try {
                    await ImportExportManager.importBookmarks(file);
                    alert('بوکمارک‌ها با موفقیت وارد شدند.');
                } catch (error) {
                    alert('خطا در وارد کردن بوکمارک‌ها: ' + error.message);
                }
            }
            e.target.value = '';
        });
    }
    
    const importSettingsFile = document.getElementById('import-settings-file');
    if (importSettingsFile) {
        importSettingsFile.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (confirm('آیا از وارد کردن تنظیمات اطمینان دارید؟')) {
                try {
                    await ImportExportManager.importSettings(file);
                    alert('تنظیمات با موفقیت وارد شدند.');
                } catch (error) {
                    alert('خطا در وارد کردن تنظیمات: ' + error.message);
                }
            }
            e.target.value = '';
        });
    }
    
    const backgroundFileInput = document.getElementById('background-file-input');
    if (backgroundFileInput) {
        backgroundFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                BackgroundManager.setBackground(event.target.result);
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        });
    }
    
    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            const modal = document.getElementById('bookmark-modal');
            if (modal) modal.classList.add('hidden');
        });
    }
    
    const bookmarkForm = document.getElementById('bookmark-form');
    if (bookmarkForm) {
        bookmarkForm.addEventListener('submit', async (e) => {
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
                if (itemId) {
                    await BookmarkManager.updateUserBookmark(itemId, formData);
                } else {
                    await BookmarkManager.addUserBookmark(formData);
                }
                if (modal) modal.classList.add('hidden');
                await Renderer.renderDashboard();
            } catch (error) {
                alert('خطا در ذخیره بوکمارک: ' + error.message);
            }
        });
    }
    
    const deleteBtn = document.getElementById('delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            const itemId = document.getElementById('editing-item-id')?.value;
            if (confirm('آیا از حذف این آیتم اطمینان دارید؟')) {
                try {
                    await BookmarkManager.deleteUserBookmark(itemId);
                    const modal = document.getElementById('bookmark-modal');
                    if (modal) modal.classList.add('hidden');
                    await Renderer.renderDashboard();
                } catch (error) {
                    alert('خطا در حذف بوکمارک: ' + error.message);
                }
            }
        });
    }
    
    const bookmarkType = document.getElementById('bookmark-type');
    if (bookmarkType) {
        bookmarkType.addEventListener('change', () => {
            Renderer.updateModalFields();
        });
    }
    
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.classList.remove('hidden');
            this.loadSettingsForm();
        });
    }
    
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.classList.add('hidden');
        });
    }
    
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            await this.saveSettings();
            const modal = document.getElementById('settings-modal');
            if (modal) modal.classList.add('hidden');
        });
    }
    
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', async () => {
            if (confirm('آیا از پاک کردن کش اطمینان دارید؟')) {
                await FaviconManager.clearCache();
                alert('کش با موفقیت پاک شد.');
            }
        });
    }
    
    const resetAllBtn = document.getElementById('reset-all-btn');
    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', async () => {
            if (confirm('آیا از بازنشانی همه تنظیمات اطمینان دارید؟ این عمل قابل بازگشت نیست.')) {
                await StorageManager.clearAll();
                location.reload();
            }
        });
    }
    
    // ========== کادر متن تلگرام ==========
    const telegramBox = document.getElementById('custom-text-box');
    if (telegramBox) {
        telegramBox.style.cursor = 'pointer';
        telegramBox.addEventListener('click', (e) => {
            e.preventDefault();
            window.open('https://t.me/ali73jn', '_blank');
        });
    }
    
    // ========== دکمه تغییر حالت کارت زمان و آب و هوا (منوی انتخاب) ==========
    const toggleWeatherBtn = document.getElementById('toggle-weather-mode');
    if (toggleWeatherBtn) {
        toggleWeatherBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const existingMenu = document.getElementById('weather-mode-menu');
            if (existingMenu) {
                existingMenu.remove();
                return;
            }
            const menu = document.createElement('div');
            menu.id = 'weather-mode-menu';
            menu.className = 'weather-mode-menu';
            menu.innerHTML = `
                <div class="weather-mode-header">
                    <span>حالت نمایش کارت زمان و آب و هوا</span>
                    <button class="close-weather-menu">×</button>
                </div>
                <div class="weather-mode-options">
                    <button data-mode="full" class="weather-mode-option">🌤️ کامل (آب و هوا + ساعت)</button>
                    <button data-mode="timeonly" class="weather-mode-option">⏰ فقط ساعت و تاریخ</button>
                    <button data-mode="hidden" class="weather-mode-option">🙈 مخفی کردن کارت</button>
                </div>
            `;
            const btnRect = toggleWeatherBtn.getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.bottom = `${window.innerHeight - btnRect.top + 10}px`;
            menu.style.right = `${window.innerWidth - btnRect.right}px`;
            document.body.appendChild(menu);
            const closeMenu = () => menu.remove();
            const closeBtn = menu.querySelector('.close-weather-menu');
            if (closeBtn) closeBtn.addEventListener('click', closeMenu);
            const options = menu.querySelectorAll('.weather-mode-option');
            options.forEach(opt => {
                opt.addEventListener('click', async () => {
                    const mode = opt.dataset.mode;
                    const category = 'زمان و آب و هوا';
                    let layout = state.layoutMap[category] || { col: 9, row: 1, w: 4, h: 3, view: 'list' };
                    layout.mode = mode;
                    state.layoutMap[category] = layout;
                    await StorageManager.set(CONFIG.STORAGE_KEYS.LAYOUT, state.layoutMap);
                    Renderer.renderDashboard();
                    menu.remove();
                });
            });
            const handleOutsideClick = (event) => {
                if (!menu.contains(event.target) && event.target !== toggleWeatherBtn) {
                    menu.remove();
                    document.removeEventListener('click', handleOutsideClick);
                }
            };
            setTimeout(() => document.addEventListener('click', handleOutsideClick), 10);
        });
    }
    
    // کنترل‌های زوم و بلور
    if (!window._zoomListenersSetup) {
        ZoomManager.setupEventListeners();
        window._zoomListenersSetup = true;
        OverlayManager.setupEventListeners();
    }
}


    static async loadSettingsForm() {
        const settings = await StorageManager.get(CONFIG.STORAGE_KEYS.SETTINGS) || {};
        const customUrls = await StorageManager.get(CONFIG.STORAGE_KEYS.CUSTOM_URLS) || {};
        
        const autoDarkMode = document.getElementById('auto-dark-mode');
        const compactView = document.getElementById('compact-view');
        const bookmarksJsonUrl = document.getElementById('bookmarks-json-url');
        
        if (autoDarkMode) autoDarkMode.checked = settings.autoDarkMode || false;
        if (compactView) compactView.checked = settings.compactView || false;
        if (bookmarksJsonUrl) bookmarksJsonUrl.value = customUrls.bookmarks || '';
    }
    
    static async saveSettings() {
        const autoDarkMode = document.getElementById('auto-dark-mode');
        const compactView = document.getElementById('compact-view');
        const bookmarksJsonUrl = document.getElementById('bookmarks-json-url');
        
        const settings = {
            autoDarkMode: autoDarkMode?.checked || false,
            compactView: compactView?.checked || false
        };
        
        const customUrls = {
            bookmarks: bookmarksJsonUrl?.value || ''
        };
        
        await StorageManager.set(CONFIG.STORAGE_KEYS.SETTINGS, settings);
        await StorageManager.set(CONFIG.STORAGE_KEYS.CUSTOM_URLS, customUrls);
        
        state.isCompactMode = settings.compactView;
        await Renderer.renderDashboard();
        
        alert('تنظیمات با موفقیت ذخیره شدند.');
    }
}

// ==================== Initialize Application ====================
class App {
    static async init() {
        try {
            console.log('راه‌اندازی برنامه...');
            
            await ThemeManager.init();
            await BackgroundManager.initBackground();
            
            state.layoutMap = await StorageManager.get(CONFIG.STORAGE_KEYS.LAYOUT) || {};
            state.currentPaths = {};
            
            await ZoomManager.loadZoom();
            await OverlayManager.loadBlur();
            await BookmarkManager.initRootFolder();
            await BookmarkManager.loadBookmarks();
            EventManager.setup();
            
            setTimeout(() => {
                ZoomManager.applyZoom();
                ZoomManager.updateZoomDisplay();
            }, 200);
            
            const firstRun = !(await StorageManager.get(CONFIG.STORAGE_KEYS.FIRST_RUN));
            if (firstRun) {
                await StorageManager.set(CONFIG.STORAGE_KEYS.FIRST_RUN, true);
				const defaultBgPath = chrome.runtime.getURL('icons/wallpaper.jpg');
				await BackgroundManager.setBackground(defaultBgPath);
				//await BackgroundManager.setBackground('icons/wallpaper.jpg');
				setTimeout(() => {
					ImportExportManager.combinedLocalImport(true); // skipConfirm = true
				}, 1000);
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
                                    <p class="tip-text">بعد از اولین ورود به افزونه لطفا برای تنظیم محیط کاری به سلیقه خودتان، روی دکمه <strong> ✏️ ویرایش </strong> کلیک کنید و موارد زیر را به سلیقه خود اصلاح کنید.</p>
                                </div>
                            </div>
                            
                            <div class="welcome-features">
                                <div class="feature-item">
                                    <span class="feature-icon">🔍</span>
                                    <span>تنظیم <strong>میزان زوم</strong> صفحه</span>
                                </div>
                                <div class="feature-item">
                                    <span class="feature-icon">🎨</span>
                                    <span>انتخاب <strong>تصویر زمینه</strong> دلخواه</span>
                                </div>
                                <div class="feature-item">
                                    <span class="feature-icon">📐</span>
                                    <span>چیدمان <strong>ویجت‌ها و ابزارها</strong></span>
                                </div>
                                <div class="feature-item">
                                    <span class="feature-icon">🎯</span>
                                    <span>سازماندهی <strong>بوکمارک‌های</strong> پرکاربرد</span>
                                </div>
                            </div>
                            
                            <div class="welcome-note">
                                <p>💡 <strong>نکته:</strong> می‌توانید همیشه از منوی   ✏️ ویرایش  ، این موارد را تغییر دهید.</p>
                            </div>
                        </div>
                        
                        <div class="welcome-footer">
                            <button class="welcome-btn" id="welcome-close">
                                ورود به همیار کافینت
                            </button>
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

// ==================== راه‌اندازی برنامه ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM آماده است.');
    App.init();
    
    const updateOnlineStatus = () => {
        const indicator = document.getElementById('offline-indicator');
        if (indicator) {
            indicator.classList.toggle('hidden', navigator.onLine);
        }
    };
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
});