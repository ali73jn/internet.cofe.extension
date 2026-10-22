/* ---------- منوی «همیار کافینت → 🖨️ چاپ نوبت‌ها» ---------- */
addNetcofeContextMenu(
    {
        id: 'netcofe-numbering-print',
        title: 'چاپ نوبت‌ها 🖨️',
        contexts: ['image', 'page', 'selection', 'link'],
        documentUrlPatterns: ['*://numbering.epolice.ir/*']
    },
    async (info, tab) => {
        try {
            const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // ---------- 1) پروفایل کاربر ----------
                    let profile = null;
                    const profileEl = document.querySelector('#UserProfileNavItem');
                    if (profileEl) {
                        const img = profileEl.querySelector('img');
                        const labels = profileEl.querySelectorAll('label');
                        profile = {
                            avatar: img ? img.src : '',
                            name: labels[0] ? labels[0].textContent.trim() : '',
                            role: labels[1] ? labels[1].textContent.trim() : ''
                        };
                    }

                    // ---------- 2) کارت جدول ----------
                    let card = null;
                    for (const c of document.querySelectorAll('.MuiCard-root')) {
                        if (c.querySelector('table.DataTable, table.DataTable-Table, .DataTable table')) {
                            card = c;
                            break;
                        }
                    }
                    if (!card) card = document.querySelector('.MuiCard-root');
                    if (!card) return { profile, table: null };

                    const clone = card.cloneNode(true);

                    // ---------- 3) حذف بخش بدهی‌ها / پرداخت‌ها ----------
                    const debtKeywords = [
                        'بدهی', 'پرداخت مالیات', 'خلافی', 'طرح ترافیک',
                        'عوارض سالیانه', 'عوارض آزادراه', 'تسویه'
                    ];
                    clone.querySelectorAll('div, section').forEach((node) => {
                        const txt = (node.textContent || '').trim();
                        if (txt.length < 300 && debtKeywords.some((k) => txt.includes(k))) {
                            node.remove();
                        }
                    });

                    // ---------- 4) حذف دکمه «ثبت نوبت تعویض پلاک» ----------
                    const removeLabels = ['ثبت نوبت تعویض پلاک'];
                    clone.querySelectorAll('button, a, .MuiButtonBase-root, .MuiButton-root').forEach((el) => {
                        const t = (el.textContent || '').trim();
                        if (removeLabels.some((k) => t === k || t.includes(k))) {
                            (el.closest('.Button-Wrapper') || el).remove();
                        }
                    });

                    // ---------- 5) حذف المان‌های اضافی ----------
                    clone.querySelectorAll(
                        '.MuiTouchRipple-root, .DataTable-Toolbar-Icon, .DataTable-Footer, ' +
                        '.DataTable-Body-Row-MoreInfo, .DataTable-Body-Cell-MoreInfo-Icon, ' +
                        '.Button-Wrapper, [data-tooltip]'
                    ).forEach((el) => el.remove());

                    // ---------- 6) بازسازی پلاک ----------
                    clone.querySelectorAll('.platefontInput.readOnly').forEach((plateBox) => {
                        const spans = plateBox.querySelectorAll('span.platefontInput');
                        const letterEl = plateBox.querySelector('p.platefontInput');

                        const province   = spans[0] ? spans[0].textContent.trim() : '';
                        const threeDigit = spans[1] ? spans[1].textContent.trim() : '';
                        const letterTxt  = letterEl ? letterEl.textContent.trim() : '';
                        const twoDigit   = spans[2] ? spans[2].textContent.trim() : '';

                        const flagUrl = chrome.runtime.getURL('numbering/iran.webp');

                        plateBox.innerHTML = `
                            <span class="plate-slot slot-flag">
                              <img src="${flagUrl}" alt="flag" width="18" height="12">
                            </span>
                            <span class="plate-slot slot-two"      data-part="two">${twoDigit}</span>
                            <span class="plate-slot slot-letter"   data-part="letter">${letterTxt}</span>
                            <span class="plate-slot slot-three"    data-part="three">${threeDigit}</span>
                            <span class="plate-slot slot-province" data-part="province">${province}</span>
                        `;
                    });

                    // ---------- 6b) بازسازی پلاک موتورسیکلت ----------
                    clone.querySelectorAll('.motor').forEach((motorBox) => {
                        const digits = motorBox.querySelectorAll('.platefontInput');
                        const threeDigit = digits[0] ? digits[0].textContent.trim() : '';
                        const fiveDigit  = digits[1] ? digits[1].textContent.trim() : '';

                        const flagUrl = chrome.runtime.getURL('numbering/iran.webp');

                        motorBox.classList.add('plate-motor');
                        motorBox.innerHTML = `
                            <div class="motor-row top">
                              <span class="motor-flag">
                                <img src="${flagUrl}" alt="flag" width="18" height="12">
                              </span>
                              <span class="motor-sep"></span>
                              <span class="motor-digits" data-part="three">${threeDigit}</span>
                            </div>
                            <div class="motor-row bottom">
                              <span class="motor-digits" data-part="five">${fiveDigit}</span>
                            </div>
                        `;
                    });

                    // ---------- 7) حذف ستون‌های بی‌مصرف ----------
                    const removeIdx = [11, 10, 9, 5, 4];
                    clone.querySelectorAll('tr').forEach((tr) => {
                        const cells = Array.from(tr.children);
                        removeIdx.forEach((i) => {
                            const c = cells[i - 1];
                            if (c && c.parentNode === tr) tr.removeChild(c);
                        });
                    });

                    return { profile, table: clone.outerHTML };
                }
            });

            if (!result || (!result.table && !result.profile)) {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => alert('کارت جدول نوبت‌ها در این صفحه پیدا نشد.')
                });
                return;
            }

            await chrome.storage.local.set({
                printProfile: result.profile,
                printHtml: result.table,
                printTime: Date.now()
            });

            await chrome.tabs.create({
                url: chrome.runtime.getURL('numbering/print.html')
            });
        } catch (e) {
            console.error('خطا:', e);
        }
    }
);