'use strict';

/* ============================================================
   landing.js — index.html(로그인 전 첫 화면) 전용
   공지사항/업데이트 소식을 읽기 전용으로 보여준다. 이 페이지는
   로그인 여부와 무관하게 누구나 보는 화면이라 App/Api 모듈을
   불러오지 않고, fetch만으로 가볍게 처리한다.
   ============================================================ */

(function () {

  const LABELS = { notice: '공지사항', update: '업데이트 소식' };
  const MAX_PER_CATEGORY = 3;

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatDate(datetime) {
    // "2026-09-21 13:05:12" (D1의 datetime('now') 포맷) → "2026.09.21"
    return String(datetime).slice(0, 10).replace(/-/g, '.');
  }

  function renderColumn(category, items) {
    const rows = items.slice(0, MAX_PER_CATEGORY).map(a => `
      <div class="admin-row">
        <div class="admin-row-main">
          <p class="admin-row-zh">${escapeHTML(a.title)}</p>
          <p class="admin-row-sub" style="white-space:pre-line;">${escapeHTML(a.content)}</p>
          <p class="admin-row-sub" style="opacity:.65;">${escapeHTML(a.authorName)} · ${formatDate(a.createdAt)}</p>
        </div>
      </div>
    `).join('');

    return `
      <div class="announcement-col">
        <div class="announcement-col-header">
          <p class="section-heading">${LABELS[category]}</p>
        </div>
        <div class="admin-list">${rows}</div>
      </div>
    `;
  }

  async function init() {
    const host = document.getElementById('landing-announcements');
    if (!host) return;

    let announcements = [];
    try {
      const res = await fetch('/api/announcements', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      announcements = data.announcements || [];
    } catch (e) {
      return; // 공지사항을 못 불러와도 랜딩 화면 자체는 그대로 보여준다
    }

    const notices = announcements.filter(a => a.category === 'notice');
    const updates = announcements.filter(a => a.category === 'update');
    if (notices.length === 0 && updates.length === 0) return;

    const columns = [];
    if (notices.length) columns.push(renderColumn('notice', notices));
    if (updates.length) columns.push(renderColumn('update', updates));

    host.innerHTML = `<div class="announcements-grid">${columns.join('')}</div>`;
  }

  init();
})();
