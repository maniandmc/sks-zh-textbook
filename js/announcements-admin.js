'use strict';

/* ============================================================
   announcements-admin.js — 공지사항 / 업데이트 소식 관리 화면 (교사 전용)
   랜딩 화면(index.html)과 홈 화면 어디서든 볼 수 있는 전역 게시판의
   내용을 이 화면에서만 추가·수정·삭제한다.
   ============================================================ */

const AnnouncementsAdmin = (() => {

  const LABELS = { notice: '공지사항', update: '업데이트 소식' };
  const EMPTY_TEXT = {
    notice: '아직 등록된 공지사항이 없습니다',
    update: '아직 등록된 업데이트 소식이 없습니다',
  };

  function formatDate(datetime) {
    // "2026-09-21 13:05:12" (D1의 datetime('now') 포맷) → "2026.09.21"
    return String(datetime).slice(0, 10).replace(/-/g, '.');
  }

  async function render(container) {
    let announcements = [];
    try {
      const resp = await Api.announcements.list();
      announcements = resp.announcements;
    } catch (e) {
      container.innerHTML = `<div class="content-inner"><p class="vocab-empty">공지사항을 불러오지 못했습니다</p></div>`;
      return;
    }

    const notices = announcements.filter(a => a.category === 'notice');
    const updates = announcements.filter(a => a.category === 'update');

    container.innerHTML = `
      <div class="content-inner" style="max-width:920px;">
        <div class="page-header">
          <h1>공지사항 관리</h1>
          <p>랜딩 화면(로그인 전 첫 화면)에 표시되는 공지사항과 업데이트 소식을 관리합니다.</p>
        </div>
        <div class="announcements-grid">
          ${renderColumn('notice', notices)}
          ${renderColumn('update', updates)}
        </div>
      </div>
    `;

    wireActions(container, announcements, () => render(container));
  }

  function renderColumn(category, items) {
    const label = LABELS[category];
    const rows = items.map(a => renderRow(a)).join('');
    return `
      <div class="announcement-col">
        <div class="announcement-col-header">
          <p class="section-heading">${label}</p>
          <button class="icon-text-btn" data-add-announcement="${category}">+ 추가</button>
        </div>
        <div class="admin-list" data-announcement-list="${category}">
          ${rows || `<p class="admin-empty-row">${EMPTY_TEXT[category]}</p>`}
        </div>
        <div data-announcement-form-host="${category}"></div>
      </div>
    `;
  }

  function renderRow(a) {
    return `
      <div class="admin-row" data-announcement-row="${a.id}">
        <div class="admin-row-main">
          <p class="admin-row-zh">${App.escapeHTML(a.title)}</p>
          <p class="admin-row-sub" style="white-space:pre-line;">${App.escapeHTML(a.content)}</p>
          <p class="admin-row-sub" style="opacity:.65;">${App.escapeHTML(a.authorName)} · ${formatDate(a.createdAt)}</p>
        </div>
        <div class="admin-row-actions">
          <button class="icon-text-btn" data-edit-announcement="${a.id}">수정</button>
          <button class="icon-text-btn danger" data-delete-announcement="${a.id}">삭제</button>
        </div>
      </div>
    `;
  }

  function wireActions(container, announcements, refresh) {
    container.querySelectorAll('[data-add-announcement]').forEach(btn => {
      btn.addEventListener('click', () => {
        const category = btn.dataset.addAnnouncement;
        const host = container.querySelector(`[data-announcement-form-host="${category}"]`);
        renderForm(host, category, null, refresh);
      });
    });

    container.querySelectorAll('[data-edit-announcement]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.editAnnouncement);
        const announcement = announcements.find(a => a.id === id);
        if (!announcement) return;
        const host = container.querySelector(`[data-announcement-form-host="${announcement.category}"]`);
        renderForm(host, announcement.category, announcement, refresh);
      });
    });

    container.querySelectorAll('[data-delete-announcement]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('이 글을 삭제하시겠습니까?')) return;
        try {
          await Api.announcements.remove(Number(btn.dataset.deleteAnnouncement));
        } catch (e) {
          App.showToast(e.message);
          return;
        }
        App.showToast('삭제했습니다');
        refresh();
      });
    });
  }

  function renderForm(host, category, announcement, onDone) {
    const isEdit = !!announcement;
    const label = LABELS[category];
    host.innerHTML = `
      <div class="admin-card">
        <p class="section-heading">${isEdit ? `${label} 수정` : `새 ${label}`}</p>
        <div class="admin-field">
          <label for="ann-title-input">제목</label>
          <input type="text" id="ann-title-input" value="${announcement ? App.escapeHTML(announcement.title) : ''}">
        </div>
        <div class="admin-field">
          <label for="ann-content-input">내용</label>
          <textarea id="ann-content-input" rows="4">${announcement ? App.escapeHTML(announcement.content) : ''}</textarea>
        </div>
        <p class="login-error" id="ann-form-error"></p>
        <div class="admin-form-actions">
          <button class="btn-primary" id="ann-form-save">${isEdit ? '저장' : '추가'}</button>
          <button class="btn-secondary" id="ann-form-cancel">취소</button>
        </div>
      </div>
    `;

    host.querySelector('#ann-form-cancel').addEventListener('click', () => { host.innerHTML = ''; });
    host.querySelector('#ann-form-save').addEventListener('click', async () => {
      const title = host.querySelector('#ann-title-input').value.trim();
      const content = host.querySelector('#ann-content-input').value.trim();
      const errorEl = host.querySelector('#ann-form-error');
      if (!title || !content) {
        errorEl.textContent = '제목과 내용을 모두 입력해주세요';
        return;
      }
      try {
        if (isEdit) {
          await Api.announcements.update(announcement.id, { category, title, content });
          App.showToast('수정했습니다');
        } else {
          await Api.announcements.create({ category, title, content });
          App.showToast('등록했습니다');
        }
      } catch (e) {
        errorEl.textContent = e.message || '저장에 실패했습니다';
        return;
      }
      await onDone();
    });
  }

  return { render };
})();
