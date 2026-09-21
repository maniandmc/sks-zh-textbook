'use strict';

/* ============================================================
   views.js — 홈 화면 / 북마크 화면
   ============================================================ */

const Views = (() => {

  const ANNOUNCEMENT_LABELS = { notice: '공지사항', update: '업데이트 소식' };
  const ANNOUNCEMENT_EMPTY_TEXT = {
    notice: '아직 등록된 공지사항이 없습니다',
    update: '아직 등록된 업데이트 소식이 없습니다',
  };

  function formatAnnouncementDate(datetime) {
    // "2026-09-21 13:05:12" (D1의 datetime('now') 포맷) → "2026.09.21"
    return String(datetime).slice(0, 10).replace(/-/g, '.');
  }

  async function renderHome(container) {
    const meta = await App.getLessonsMeta();
    const user = App.getCurrentUser();
    const isTeacher = !!user && user.role === 'teacher';

    let announcements = [];
    try {
      const resp = await Api.announcements.list();
      announcements = resp.announcements;
    } catch (e) {
      // 공지사항을 못 불러와도 나머지 홈 화면은 그대로 보여준다.
    }

    const announcementsHTML = renderAnnouncementsSection(announcements, isTeacher);
    const refresh = () => renderHome(container);

    if (meta.lessons.length === 0) {
      container.innerHTML = `
        <div class="content-inner">
          <div class="home-hero">
            <h1>SKS <span class="zh">中文学习馆</span></h1>
            <p>상해한국학교 중국어 온라인 교재 시스템</p>
          </div>
          ${announcementsHTML}
          <div class="empty-state">
            ${App.ICONS.book}
            <p>아직 볼 수 있는 교재가 없습니다.${meta.role === 'student' ? ' 선생님께 클래스 참여 코드를 받아보세요.' : ' 클래스를 만들고 단원을 추가해보세요.'}</p>
          </div>
        </div>
      `;
      wireAnnouncementActions(container, announcements, isTeacher, refresh);
      return;
    }

    await App.preloadProgress(meta.lessons.map(l => l.id));

    let lastId = App.getLastLessonId();
    if (!lastId || !meta.lessons.some(l => l.id === lastId)) {
      lastId = meta.lessons[0].id;
    }
    const lastLesson = await App.getLesson(lastId);
    const pct = App.getLessonPercent(lastId);

    const lessonCards = meta.lessons.map((l) => {
      const p = App.getLessonPercent(l.id);
      return `
        <button class="lesson-card" onclick="App.navigate('reader', {lessonId:${l.id}})">
          <p class="lc-num zh">${l.title}</p>
          <p class="lc-title zh">${l.chineseTitle}</p>
          <div class="lc-progress-row">
            <div class="progress-bar-track" style="flex:1"><div class="progress-bar-fill" style="width:${p}%"></div></div>
            <span class="lc-percent">${p}%</span>
          </div>
        </button>
      `;
    });

    container.innerHTML = `
      <div class="content-inner">
        <div class="home-hero">
          <h1>SKS <span class="zh">中文学习馆</span></h1>
          <p>상해한국학교 중국어 온라인 교재 시스템</p>
        </div>

        ${announcementsHTML}

        <div class="continue-card">
          <p class="cc-label zh">현재 학습 · ${lastLesson.title}</p>
          <p class="cc-title zh">${lastLesson.chineseTitle}</p>
          <p class="cc-sub">${lastLesson.koreanTitle}</p>
          <div class="cc-progress-row">
            <div class="progress-bar-track" style="flex:1"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
            <span class="cc-percent">${pct}%</span>
          </div>
          <button class="btn-primary" onclick="App.navigate('reader', {lessonId:${lastId}})">
            계속 공부하기 ${App.ICONS.chevronRight}
          </button>
        </div>

        <p class="section-heading">전체 단원</p>
        <div class="lesson-grid">
          ${lessonCards.join('')}
        </div>
      </div>
    `;
    wireAnnouncementActions(container, announcements, isTeacher, refresh);
  }

  /* ---------------- 공지사항 / 업데이트 소식 ---------------- */

  function renderAnnouncementsSection(announcements, isTeacher) {
    const notices = announcements.filter(a => a.category === 'notice');
    const updates = announcements.filter(a => a.category === 'update');
    return `
      <div class="announcements-grid">
        ${renderAnnouncementColumn('notice', notices, isTeacher)}
        ${renderAnnouncementColumn('update', updates, isTeacher)}
      </div>
    `;
  }

  function renderAnnouncementColumn(category, items, isTeacher) {
    const label = ANNOUNCEMENT_LABELS[category];
    const rows = items.map(a => renderAnnouncementRow(a, isTeacher)).join('');
    return `
      <div class="announcement-col">
        <div class="announcement-col-header">
          <p class="section-heading">${label}</p>
          ${isTeacher ? `<button class="icon-text-btn" data-add-announcement="${category}">+ 추가</button>` : ''}
        </div>
        <div class="admin-list" data-announcement-list="${category}">
          ${rows || `<p class="admin-empty-row">${ANNOUNCEMENT_EMPTY_TEXT[category]}</p>`}
        </div>
        <div data-announcement-form-host="${category}"></div>
      </div>
    `;
  }

  function renderAnnouncementRow(a, isTeacher) {
    return `
      <div class="admin-row" data-announcement-row="${a.id}">
        <div class="admin-row-main">
          <p class="admin-row-zh">${App.escapeHTML(a.title)}</p>
          <p class="admin-row-sub" style="white-space:pre-line;">${App.escapeHTML(a.content)}</p>
          <p class="admin-row-sub" style="opacity:.65;">${App.escapeHTML(a.authorName)} · ${formatAnnouncementDate(a.createdAt)}</p>
        </div>
        ${isTeacher ? `
          <div class="admin-row-actions">
            <button class="icon-text-btn" data-edit-announcement="${a.id}">수정</button>
            <button class="icon-text-btn danger" data-delete-announcement="${a.id}">삭제</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  function wireAnnouncementActions(container, announcements, isTeacher, refresh) {
    if (!isTeacher) return;

    container.querySelectorAll('[data-add-announcement]').forEach(btn => {
      btn.addEventListener('click', () => {
        const category = btn.dataset.addAnnouncement;
        const host = container.querySelector(`[data-announcement-form-host="${category}"]`);
        renderAnnouncementForm(host, category, null, refresh);
      });
    });

    container.querySelectorAll('[data-edit-announcement]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.editAnnouncement);
        const announcement = announcements.find(a => a.id === id);
        if (!announcement) return;
        const host = container.querySelector(`[data-announcement-form-host="${announcement.category}"]`);
        renderAnnouncementForm(host, announcement.category, announcement, refresh);
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

  function renderAnnouncementForm(host, category, announcement, onDone) {
    const isEdit = !!announcement;
    const label = ANNOUNCEMENT_LABELS[category];
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

  async function renderBookmarks(container) {
    const bookmarks = await App.getBookmarkedItems();
    const sentenceItems = bookmarks.sentences;
    const wordItems = bookmarks.words;

    const isEmpty = wordItems.length === 0 && sentenceItems.length === 0;

    if (isEmpty) {
      container.innerHTML = `
        <div class="content-inner">
          <div class="page-header">
            <h1>북마크</h1>
            <p>저장한 단어와 문장을 모아볼 수 있어요.</p>
          </div>
          <div class="empty-state">
            ${App.ICONS.bookmark}
            <p>아직 저장한 단어나 문장이 없습니다.</p>
          </div>
        </div>
      `;
      return;
    }

    const sentenceHTML = sentenceItems.map(s => `
      <div class="sentence-block" style="cursor:default;" onclick="App.navigate('reader', {lessonId:${s.lessonId}, tab:'text'})">
        <div class="sb-chinese zh">${s.chinese}</div>
        <div class="sb-translation show">${s.translation}</div>
        <div class="ln-progress" style="margin-top:6px;color:var(--color-text-tertiary);font-size:12px;">${s.lessonTitle}</div>
      </div>
    `).join('');

    const wordHTML = wordItems.map(v => `
      <div class="vocab-card">
        <div class="vc-left">
          <div class="vc-word zh">${v.word}</div>
          <div class="vc-pinyin">${v.pinyin} · ${v.lessonTitle}</div>
        </div>
        <div class="vc-meaning">
          ${v.meaning}
          <span class="vc-pos">${v.partOfSpeech}</span>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="content-inner">
        <div class="page-header">
          <h1>북마크</h1>
          <p>저장한 단어와 문장을 모아볼 수 있어요.</p>
        </div>

        ${sentenceItems.length ? `
          <p class="section-heading">저장한 문장 (${sentenceItems.length})</p>
          <div class="passage" style="margin-bottom:30px;">${sentenceHTML}</div>
        ` : ''}

        ${wordItems.length ? `
          <p class="section-heading">저장한 단어 (${wordItems.length})</p>
          <div class="vocab-cards" style="display:flex;">${wordHTML}</div>
        ` : ''}
      </div>
    `;
  }

  return { renderHome, renderBookmarks };
})();
