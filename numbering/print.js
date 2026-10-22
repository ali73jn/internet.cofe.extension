(async function () {
  const content = document.getElementById('content');

  const { printHtml, printProfile } = await chrome.storage.local.get([
    'printHtml',
    'printProfile'
  ]);

  if (!printHtml && !printProfile) {
    content.innerHTML =
      '<p style="text-align:center;padding:40px;color:#888;">داده‌ای برای نمایش وجود ندارد.</p>';
    return;
  }

  let html = '';

  // هدر پروفایل
  if (printProfile && (printProfile.name || printProfile.avatar)) {
    html += `
      <div class="profile-header">
        ${printProfile.avatar
          ? `<img class="profile-avatar" src="${printProfile.avatar}" alt="avatar">`
          : ''}
        <div class="profile-info">
          <div class="profile-name">${printProfile.name || ''}</div>
          ${printProfile.role
            ? `<div class="profile-role">${printProfile.role}</div>`
            : ''}
        </div>
      </div>
    `;
  }

  // جدول
  if (printHtml) {
    html += `<div class="table-wrap">${printHtml}</div>`;
  }

  content.innerHTML = html;

  document.getElementById('printBtn').addEventListener('click', () => window.print());

  setTimeout(() => {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => window.print());
    } else {
      window.print();
    }
  }, 500);
})();