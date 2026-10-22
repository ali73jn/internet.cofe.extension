// ============================================================
// 🎯 Background مرکزی "همیار کافینت"
// ============================================================

const __netcofeMenuItems = [];

function addNetcofeContextMenu(config, onClickHandler) {
    __netcofeMenuItems.push({ config, onClickHandler });
}

// ⬇️ برای هر پروژه جدید، فقط یک خط اینجا اضافه کن
// ⚠️ حتماً بین هر خط کاما (,) بذار
importScripts(
    'print_help/background.js',
    'save_image_as/background.js',
    'numbering/background.js'
);

function buildNetcofeContextMenus() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'netcofe-parent',
            title: 'همیار کافینت',
            contexts: ['image', 'page', 'selection', 'link']
        });

        __netcofeMenuItems.forEach(({ config }) => {
            try {
                const itemConfig = { ...config };
                if (!itemConfig.parentId) {
                    itemConfig.parentId = 'netcofe-parent';
                }
                chrome.contextMenus.create(itemConfig);
            } catch (e) {
                console.warn('[Netcofe-BG] menu create failed:', config.id, e);
            }
        });
    });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
    __netcofeMenuItems.forEach(({ config, onClickHandler }) => {
        if (info.menuItemId === config.id && typeof onClickHandler === 'function') {
            try {
                onClickHandler(info, tab);
            } catch (e) {
                console.error('[Netcofe-BG] handler error for', config.id, e);
            }
        }
    });
});

chrome.runtime.onInstalled.addListener(buildNetcofeContextMenus);
chrome.runtime.onStartup.addListener(buildNetcofeContextMenus);
buildNetcofeContextMenus();