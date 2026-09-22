'use strict';

/* ============================================================
   app.js — 앱 코어: 로그인/세션, 데이터 로딩(API), 상태, 라우팅,
   홈 화면, 사이드바, 테마, 진행률, 북마크, 전역 검색 오버레이
   ============================================================ */

const App = (() => {

  const EMPTY_PROGRESS_RAW = { textDone: false, vocabDone: false, grammarDone: false, quizDone: false };
  const PROGRESS_FIELD_MAP = { text: 'textDone', vocab: 'vocabDone', grammar: 'grammarDone', quiz: 'quizDone' };

  /* ---------------- 상태 ---------------- */
  const state = {
    currentUser: null,
    lessonsMeta: null,      // { lessons: [...flat], groups: [...], role }
    lessonCache: {},        // { lessonId: lessonData }
    progressCache: {},      // { lessonId: { progress, percent, tracked } }
    bookmarksCache: null,   // { sentences: [...], words: [...] }
    currentLessonId: null,
    currentView: 'home',    // home | reader | vocabulary | bookmarks | admin
    currentTab: 'text',     // text | raw | vocab | grammar | quiz (reader 내부)
  };

  const STORAGE_KEYS = {
    theme: 'ctb_theme_v1',
    toggles: 'ctb_toggles_v1',
    editMode: 'ctb_edit_mode_v1',
  };

  /* ---------------- API 에러 → 토스트 공통화 ---------------- */

  async function apiCall(promise) {
    try {
      return await promise;
    } catch (e) {
      showToast(e && e.message ? e.message : '오류가 발생했습니다');
      throw e;
    }
  }

  /* ---------------- 교재 데이터 로딩 (서버 API) ---------------- */

  async function getLessonsMeta() {
    if (state.lessonsMeta) return state.lessonsMeta;
    const { groups, role } = await apiCall(Api.lessons.list());
    const lessons = groups.flatMap(g => g.lessons.map(l => ({
      ...l,
      ownerType: g.ownerType,
      ownerId: g.ownerId,
      groupName: g.name,
      canWrite: g.canWrite,
    })));
    state.lessonsMeta = { lessons, groups, role };
    return state.lessonsMeta;
  }

  async function getLesson(lessonId) {
    if (state.lessonCache[lessonId]) return state.lessonCache[lessonId];

    const [lessonResp] = await Promise.all([
      apiCall(Api.lessons.get(lessonId)),
      ensureProgress(lessonId),
    ]);
    const lesson = { ...lessonResp.lesson, canWrite: lessonResp.canWrite };
    state.lessonCache[lessonId] = lesson;
    return lesson;
  }

  async function getAllLessons() {
    const meta = await getLessonsMeta();
    return Promise.all(meta.lessons.map(l => getLesson(l.id)));
  }

  function invalidateCache() {
    state.lessonsMeta = null;
    state.lessonCache = {};
  }

  /* ---------------- 단원 관리 (교재 관리 화면) ---------------- */

  async function addLesson({ title, chineseTitle, koreanTitle, ownerType, ownerId }) {
    const created = await apiCall(Api.lessons.create({ title, chineseTitle, koreanTitle, ownerType, ownerId }));
    invalidateCache();
    return created.id;
  }

  async function updateLessonMeta(lessonId, { title, chineseTitle, koreanTitle }) {
    await apiCall(Api.lessons.update(lessonId, { title, chineseTitle, koreanTitle }));
    invalidateCache();
  }

  async function deleteLesson(lessonId) {
    await apiCall(Api.lessons.remove(lessonId));
    delete state.progressCache[lessonId];
    invalidateCache();
  }

  async function copyLessonToMine(lessonId) {
    const result = await apiCall(Api.lessons.copy(lessonId));
    invalidateCache();
    return result;
  }

  async function resetLessonProgress(lessonId) {
    const resp = await apiCall(Api.progress.reset(lessonId));
    state.progressCache[lessonId] = resp;
  }

  /* ---------------- 문장 ---------------- */

  async function addSentence(lessonId, sentence) {
    const created = await apiCall(Api.items.create(lessonId, 'sentences', sentence));
    delete state.lessonCache[lessonId];
    return created.id;
  }

  async function updateSentence(lessonId, sentenceId, fields) {
    await apiCall(Api.items.update(lessonId, 'sentences', sentenceId, fields));
    delete state.lessonCache[lessonId];
  }

  async function deleteSentence(lessonId, sentenceId) {
    await apiCall(Api.items.remove(lessonId, 'sentences', sentenceId));
    delete state.lessonCache[lessonId];
    if (state.currentUser && state.currentUser.role === 'student') {
      await ensureBookmarks(true);
    }
  }

  /* ---------------- 단어 ---------------- */

  async function addVocabWord(lessonId, word) {
    const created = await apiCall(Api.items.create(lessonId, 'vocabulary', word));
    delete state.lessonCache[lessonId];
    return created.id;
  }

  async function updateVocabWord(lessonId, wordId, fields) {
    await apiCall(Api.items.update(lessonId, 'vocabulary', wordId, fields));
    delete state.lessonCache[lessonId];
  }

  async function deleteVocabWord(lessonId, wordId) {
    await apiCall(Api.items.remove(lessonId, 'vocabulary', wordId));
    delete state.lessonCache[lessonId];
    if (state.currentUser && state.currentUser.role === 'student') {
      await ensureBookmarks(true);
    }
  }

  /* ---------------- 문법 ---------------- */

  async function addGrammar(lessonId, grammar) {
    await apiCall(Api.items.create(lessonId, 'grammar', grammar));
    delete state.lessonCache[lessonId];
  }

  async function updateGrammar(lessonId, grammarId, fields) {
    await apiCall(Api.items.update(lessonId, 'grammar', grammarId, fields));
    delete state.lessonCache[lessonId];
  }

  async function deleteGrammar(lessonId, grammarId) {
    await apiCall(Api.items.remove(lessonId, 'grammar', grammarId));
    delete state.lessonCache[lessonId];
  }

  /* ---------------- 연습문제 ---------------- */

  async function addQuiz(lessonId, quiz) {
    await apiCall(Api.items.create(lessonId, 'quiz', quiz));
    delete state.lessonCache[lessonId];
  }

  async function updateQuiz(lessonId, quizId, fields) {
    await apiCall(Api.items.update(lessonId, 'quiz', quizId, fields));
    delete state.lessonCache[lessonId];
  }

  async function deleteQuiz(lessonId, quizId) {
    await apiCall(Api.items.remove(lessonId, 'quiz', quizId));
    delete state.lessonCache[lessonId];
  }

  /* ---------------- 내보내기 (JSON 다운로드, 백업용) ---------------- */

  function downloadJSON(filename, dataObj) {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportLesson(lessonId) {
    const lesson = await getLesson(lessonId);
    downloadJSON(`lesson${String(lessonId).padStart(2, '0')}.json`, lesson);
  }

  async function exportAll() {
    const meta = await getLessonsMeta();
    for (const l of meta.lessons) {
      await exportLesson(l.id);
    }
  }

  /* ---------------- localStorage 유틸 (환경설정 전용) ---------------- */

  function readStore(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('localStorage 저장 실패', e);
    }
  }

  /* ---------------- 진행률 (서버, 학생 계정 기준) ---------------- */

  async function ensureProgress(lessonId, forceRefresh = false) {
    if (!forceRefresh && state.progressCache[lessonId]) return state.progressCache[lessonId];
    try {
      const resp = await Api.progress.get(lessonId);
      state.progressCache[lessonId] = resp;
      return resp;
    } catch (e) {
      const fallback = { progress: { ...EMPTY_PROGRESS_RAW }, percent: 0, tracked: false };
      state.progressCache[lessonId] = fallback;
      return fallback;
    }
  }

  async function preloadProgress(lessonIds) {
    await Promise.all(lessonIds.map(id => ensureProgress(id)));
  }

  function getLessonProgress(lessonId) {
    const cached = state.progressCache[lessonId];
    const p = cached ? cached.progress : EMPTY_PROGRESS_RAW;
    return { text: p.textDone, vocab: p.vocabDone, grammar: p.grammarDone, quiz: p.quizDone };
  }

  function getLessonPercent(lessonId) {
    const cached = state.progressCache[lessonId];
    return cached ? cached.percent : 0;
  }

  function setLessonProgressField(lessonId, field, value) {
    const current = state.progressCache[lessonId];
    // 교사 등 진행률이 추적되지 않는 사용자는 서버에 기록할 것이 없다 (조회 시 tracked:false).
    if (current && !current.tracked) return;

    const apiField = PROGRESS_FIELD_MAP[field];
    const base = current || { progress: { ...EMPTY_PROGRESS_RAW }, percent: 0, tracked: true };
    const updatedRaw = { ...base.progress, [apiField]: value };
    const done = Object.values(updatedRaw).filter(Boolean).length;
    state.progressCache[lessonId] = { progress: updatedRaw, percent: Math.round((done / 4) * 100), tracked: base.tracked };

    apiCall(Api.progress.update(lessonId, { [apiField]: value })).catch(() => {});
  }

  function getLastLessonId() {
    if (!state.currentUser) return null;
    return readStore(`ctb_last_lesson_${state.currentUser.id}`, null);
  }

  function setLastLessonId(id) {
    if (!state.currentUser) return;
    writeStore(`ctb_last_lesson_${state.currentUser.id}`, id);
  }

  /* ---------------- 북마크 (서버, 학생 계정 전용) ---------------- */

  async function ensureBookmarks(forceRefresh = false) {
    if (!forceRefresh && state.bookmarksCache) return state.bookmarksCache;
    try {
      state.bookmarksCache = await Api.bookmarks.list();
    } catch (e) {
      state.bookmarksCache = { sentences: [], words: [] };
    }
    return state.bookmarksCache;
  }

  function getBookmarks() {
    const raw = state.bookmarksCache || { sentences: [], words: [] };
    return {
      sentences: raw.sentences.map(s => s.id),
      words: raw.words.map(w => w.id),
    };
  }

  function getBookmarkedItems() {
    return state.bookmarksCache || { sentences: [], words: [] };
  }

  async function toggleBookmark(type, id) {
    const apiType = type === 'sentences' ? 'sentence' : 'word';
    const result = await apiCall(Api.bookmarks.toggle(apiType, id));
    await ensureBookmarks(true);
    return result.saved;
  }

  function isBookmarked(type, id) {
    return getBookmarks()[type].includes(id);
  }

  /* ---------------- 테마 ---------------- */

  function initTheme() {
    const saved = readStore(STORAGE_KEYS.theme, 'light');
    applyTheme(saved);
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    writeStore(STORAGE_KEYS.theme, theme);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(isDark ? 'light' : 'dark');
  }

  /* ---------------- 표시 토글 (병음/번역) : 전역 기억 ---------------- */

  function getDisplayToggles() {
    return readStore(STORAGE_KEYS.toggles, { pinyin: false, translation: false });
  }

  function setDisplayToggle(key, value) {
    const t = getDisplayToggles();
    t[key] = value;
    writeStore(STORAGE_KEYS.toggles, t);
  }

  /* ---------------- 편집 모드 (학습 화면 인라인 편집) ---------------- */

  function getEditMode() {
    return readStore(STORAGE_KEYS.editMode, false);
  }

  function setEditMode(value) {
    writeStore(STORAGE_KEYS.editMode, value);
    updateEditModeButton();
    document.body.classList.toggle('edit-mode-on', value);
    rerenderCurrentView();
  }

  function toggleEditMode() {
    setEditMode(!getEditMode());
    showToast(getEditMode() ? '편집 모드를 켰습니다' : '편집 모드를 껐습니다');
  }

  function updateEditModeButton() {
    const btn = document.getElementById('edit-mode-toggle-btn');
    if (!btn) return;
    const on = getEditMode();
    btn.classList.toggle('active', on);
    btn.innerHTML = ICONS.edit;
    btn.setAttribute('aria-label', on ? '편집 모드 끄기' : '편집 모드 켜기');
  }

  async function rerenderCurrentView() {
    const opts = {};
    if (state.currentLessonId) {
      opts.lessonId = state.currentLessonId;
      opts.tab = state.currentTab;
    }
    await navigate(state.currentView, opts);
  }

  /* ---------------- 아이콘 (인라인 SVG, stroke 기반) ---------------- */

  const ICONS = {
    home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/></svg>`,
    vocab: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h13v16l-3-2-3 2-3-2-3 2z"/><path d="M9 8h7M9 11.5h7"/></svg>`,
    bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg>`,
    bookmarkFilled: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`,
    starFilled: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
    sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>`,
    moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>`,
    volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>`,
    chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>`,
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`,
    inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 12h4l1.5 3h5L16 12h4"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`,
    logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
    users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
    megaphone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>`,
  };

  /* ---------------- Toast ---------------- */

  let toastTimer = null;
  function showToast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  /* ---------------- 오디오(TTS) ---------------- */

  function speak(text) {
    if (!('speechSynthesis' in window)) {
      showToast('이 브라우저는 음성 재생을 지원하지 않습니다');
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 0.92;
    window.speechSynthesis.speak(utter);
  }

  /* ---------------- 사이드바 (모바일) ---------------- */

  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-backdrop').classList.add('show');
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.remove('show');
  }

  /* ---------------- 라우팅 ---------------- */

  async function navigate(view, opts = {}) {
    if (view === 'admin' && !state.currentUser) {
      view = 'home';
    }
    if (view === 'announcements' && (!state.currentUser || state.currentUser.role !== 'teacher')) {
      view = 'home';
    }
    state.currentView = view;
    closeSidebar();

    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });

    const main = document.getElementById('main-content');

    if (view === 'home') {
      state.currentLessonId = null;
      renderLessonSidebarActive(null);
      await Views.renderHome(main);
      renderInfoPanel(null);
    } else if (view === 'reader') {
      state.currentLessonId = opts.lessonId;
      setLastLessonId(opts.lessonId);
      renderLessonSidebarActive(opts.lessonId);
      await Reader.render(main, opts.lessonId, opts.tab || 'text');
      const lesson = await getLesson(opts.lessonId);
      renderInfoPanel(lesson);
    } else if (view === 'vocabulary') {
      state.currentLessonId = null;
      renderLessonSidebarActive(null);
      await Vocabulary.renderGlobalVocab(main);
      renderInfoPanel(null);
    } else if (view === 'bookmarks') {
      state.currentLessonId = null;
      renderLessonSidebarActive(null);
      await Views.renderBookmarks(main);
      renderInfoPanel(null);
    } else if (view === 'classes') {
      state.currentLessonId = null;
      renderLessonSidebarActive(null);
      await Classes.render(main);
      renderInfoPanel(null);
    } else if (view === 'admin') {
      state.currentLessonId = null;
      renderLessonSidebarActive(null);
      await Admin.render(main, opts.lessonId || null);
      renderInfoPanel(null);
    } else if (view === 'announcements') {
      state.currentLessonId = null;
      renderLessonSidebarActive(null);
      await AnnouncementsAdmin.render(main);
      renderInfoPanel(null);
    }

    main.scrollTop = 0;
  }

  function renderLessonSidebarActive(lessonId) {
    document.querySelectorAll('.lesson-nav-item').forEach(el => {
      el.classList.toggle('active', Number(el.dataset.lessonId) === lessonId);
    });
  }

  /* ---------------- 사이드바: 단원 목록 렌더 ---------------- */

  async function renderSidebarLessonList() {
    const meta = await getLessonsMeta();
    const container = document.getElementById('sidebar-lesson-list');
    if (!container) return;

    await preloadProgress(meta.lessons.map(l => l.id));

    const groupsWithLessons = meta.groups.filter(g => g.lessons.length > 0);

    if (groupsWithLessons.length === 0) {
      container.innerHTML = `<p class="sidebar-empty-hint">아직 볼 수 있는 교재가 없습니다</p>`;
      return;
    }

    container.innerHTML = groupsWithLessons.map(g => `
      <div class="sidebar-group">
        <p class="sidebar-group-label">
          <span>${escapeHTML(g.name)}</span>
          ${!g.canWrite ? `<span class="sidebar-group-readonly" title="읽기 전용">${ICONS.lock}</span>` : ''}
        </p>
        ${g.lessons.map(l => {
          const pct = getLessonPercent(l.id);
          return `
            <button class="lesson-nav-item" data-lesson-id="${l.id}" onclick="App.navigate('reader', {lessonId: ${l.id}})">
              <span class="ln-title zh">${l.title}</span>
              <span class="ln-progress">${pct}%</span>
            </button>
          `;
        }).join('')}
      </div>
    `).join('');
  }

  /* ---------------- 오른쪽 정보 패널 ---------------- */

  function renderInfoPanel(lesson) {
    const panel = document.getElementById('info-panel');
    if (!panel) return;

    if (!lesson) {
      panel.innerHTML = `
        <div class="panel-section">
          <p class="panel-title">안내</p>
          <p style="font-size:13px;color:var(--color-text-secondary);line-height:1.6;">
            단원을 선택하면 현재 학습 정보가 여기에 표시됩니다.
          </p>
        </div>
      `;
      return;
    }

    const p = getLessonProgress(lesson.id);
    const pct = getLessonPercent(lesson.id);
    const user = state.currentUser;
    const progressTracked = state.progressCache[lesson.id] && state.progressCache[lesson.id].tracked;
    const showCopyBtn = user && user.role === 'student' && lesson.ownerType === 'class';
    const showResetBtn = user && user.role === 'student' && progressTracked;

    const statusRow = (label, key) => {
      const done = p[key];
      const cls = done ? 'done' : 'todo';
      const text = done ? '완료' : '미학습';
      return `
        <div class="panel-progress-row">
          <span>${label}</span>
          <span class="status-dot ${cls}">${text}</span>
        </div>
      `;
    };

    panel.innerHTML = `
      <div class="panel-section">
        <p class="panel-title">현재 단원</p>
        <div class="panel-lesson-card">
          <p class="pl-title zh">${lesson.title}</p>
          <p class="pl-sub">${lesson.koreanTitle}</p>
          <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
          <div class="progress-text-row"><span>학습 진행률</span><span>${pct}%</span></div>
          ${showCopyBtn ? `<button class="btn-secondary panel-action-btn" id="btn-copy-to-mine">${ICONS.book} 내 교재로 복사</button>` : ''}
        </div>
      </div>
      <div class="panel-section">
        <p class="panel-title">학습 진행률</p>
        ${statusRow('본문', 'text')}
        ${statusRow('단어', 'vocab')}
        ${statusRow('문법', 'grammar')}
        ${statusRow('연습문제', 'quiz')}
        ${showResetBtn ? `<button class="btn-secondary panel-action-btn" id="btn-reset-progress">진도율 초기화</button>` : ''}
      </div>
      <div class="panel-section">
        <p class="panel-title">단원 메뉴</p>
        <div class="lesson-menu-list">
          <button class="lesson-menu-item ${state.currentTab === 'text' ? 'active' : ''}" onclick="App.navigate('reader', {lessonId:${lesson.id}, tab:'text'})">본문</button>
          <button class="lesson-menu-item ${state.currentTab === 'raw' ? 'active' : ''}" onclick="App.navigate('reader', {lessonId:${lesson.id}, tab:'raw'})">원문</button>
          <button class="lesson-menu-item ${state.currentTab === 'vocab' ? 'active' : ''}" onclick="App.navigate('reader', {lessonId:${lesson.id}, tab:'vocab'})">단어</button>
          <button class="lesson-menu-item ${state.currentTab === 'grammar' ? 'active' : ''}" onclick="App.navigate('reader', {lessonId:${lesson.id}, tab:'grammar'})">문법</button>
          <button class="lesson-menu-item ${state.currentTab === 'quiz' ? 'active' : ''}" onclick="App.navigate('reader', {lessonId:${lesson.id}, tab:'quiz'})">연습문제</button>
        </div>
      </div>
    `;

    if (showCopyBtn) {
      panel.querySelector('#btn-copy-to-mine').addEventListener('click', async () => {
        if (!confirm(`"${lesson.title}"을(를) 내 교재로 복사하시겠습니까?`)) return;
        let result;
        try {
          result = await copyLessonToMine(lesson.id);
        } catch (e) { return; }
        showToast('내 교재로 복사했습니다');
        await renderSidebarLessonList();
        await navigate('reader', { lessonId: result.id, tab: 'text' });
      });
    }

    if (showResetBtn) {
      panel.querySelector('#btn-reset-progress').addEventListener('click', async () => {
        if (!confirm('이 단원의 진도율을 초기화하시겠습니까? (저장한 북마크는 유지됩니다)')) return;
        try {
          await resetLessonProgress(lesson.id);
        } catch (e) { return; }
        showToast('진도율을 초기화했습니다');
        renderInfoPanel(lesson);
        await renderSidebarLessonList();
      });
    }
  }

  /* ---------------- 전역 검색 오버레이 ---------------- */

  async function openSearchOverlay() {
    document.getElementById('search-overlay').classList.add('show');
    const input = document.getElementById('search-overlay-input');
    input.value = '';
    input.focus();
    renderSearchResults('');
  }

  function closeSearchOverlay() {
    document.getElementById('search-overlay').classList.remove('show');
  }

  async function renderSearchResults(query) {
    const resultsEl = document.getElementById('search-overlay-results');
    const q = query.trim().toLowerCase();
    if (!q) {
      resultsEl.innerHTML = `<div class="search-overlay-empty">단어(중국어/병음/한국어 뜻)를 입력해 검색하세요</div>`;
      return;
    }

    const lessons = await getAllLessons();
    const meta = await getLessonsMeta();
    const matches = [];

    lessons.forEach((lesson, idx) => {
      if (!lesson) return;
      const lessonTitle = meta.lessons[idx].title;
      lesson.vocabulary.forEach(v => {
        const haystack = [v.word, v.pinyin, v.meaning, v.partOfSpeech, lessonTitle, lesson.koreanTitle]
          .join(' ').toLowerCase();
        const pinyinPlain = v.pinyin.toLowerCase().replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, c => {
          const map = { ā:'a',á:'a',ǎ:'a',à:'a', ē:'e',é:'e',ě:'e',è:'e', ī:'i',í:'i',ǐ:'i',ì:'i', ō:'o',ó:'o',ǒ:'o',ò:'o', ū:'u',ú:'u',ǔ:'u',ù:'u', ǖ:'v',ǘ:'v',ǚ:'v',ǜ:'v' };
          return map[c] || c;
        });
        if (haystack.includes(q) || pinyinPlain.includes(q)) {
          matches.push({ ...v, lessonId: lesson.id, lessonTitle });
        }
      });
    });

    if (matches.length === 0) {
      resultsEl.innerHTML = `<div class="search-overlay-empty">"${escapeHTML(query)}"에 대한 검색 결과가 없습니다</div>`;
      return;
    }

    resultsEl.innerHTML = matches.map(m => `
      <button class="search-result-item" onclick="App.goToWordFromSearch(${m.lessonId}, ${m.id})">
        <span>
          <span class="sr-word zh">${m.word}</span>
          <span class="sr-pinyin">${m.pinyin}</span>
          <div class="sr-meaning">${m.meaning}</div>
        </span>
        <span class="sr-lesson zh">${m.lessonTitle}</span>
      </button>
    `).join('');
  }

  async function goToWordFromSearch(lessonId, wordId) {
    closeSearchOverlay();
    await navigate('reader', { lessonId, tab: 'vocab' });
    setTimeout(() => Vocabulary.showWordDetailById(lessonId, wordId), 60);
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------- 로그인 / 로그아웃 ---------------- */

  function getCurrentUser() {
    return state.currentUser;
  }

  function showLoginScreen(message) {
    const shell = document.getElementById('app-shell');
    if (shell) shell.style.display = 'none';
    document.getElementById('login-screen').classList.add('show');
    const errorEl = document.getElementById('login-error');
    if (errorEl) errorEl.textContent = message || '';
  }

  function hideLoginScreen() {
    document.getElementById('login-screen').classList.remove('show');
    const shell = document.getElementById('app-shell');
    if (shell) shell.style.display = '';
  }

  function renderHeaderUser() {
    const el = document.getElementById('header-user-info');
    if (!el || !state.currentUser) return;
    const roleLabel = state.currentUser.role === 'teacher' ? '교사' : '학생';
    el.textContent = `${state.currentUser.displayName} · ${roleLabel}`;
  }

  async function enterApp(user) {
    state.currentUser = user;
    state.lessonsMeta = null;
    state.lessonCache = {};
    state.progressCache = {};
    state.bookmarksCache = null;

    hideLoginScreen();
    renderHeaderUser();
    document.body.classList.toggle('edit-mode-on', getEditMode());
    updateEditModeButton();

    const adminNavItem = document.querySelector('.nav-item[data-view="admin"]');
    if (adminNavItem) {
      adminNavItem.style.display = '';
      const labelEl = adminNavItem.querySelector('span');
      if (labelEl) labelEl.textContent = user.role === 'teacher' ? '교재 관리' : '내 교재';
    }

    const announcementsNavItem = document.querySelector('.nav-item[data-view="announcements"]');
    if (announcementsNavItem) announcementsNavItem.style.display = user.role === 'teacher' ? '' : 'none';

    if (user.role === 'student') {
      await ensureBookmarks();
    }

    await renderSidebarLessonList();
    await navigate('home');
  }

  function wireLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('login-error');
      const submitBtn = document.getElementById('login-submit');
      errorEl.textContent = '';
      if (!username || !password) {
        errorEl.textContent = '아이디와 비밀번호를 입력해주세요';
        return;
      }
      submitBtn.disabled = true;
      let user;
      try {
        user = await Api.auth.login(username, password);
        document.getElementById('login-password').value = '';
      } catch (err) {
        errorEl.textContent = err.message || '로그인에 실패했습니다';
        submitBtn.disabled = false;
        return;
      }
      try {
        await enterApp(user);
      } catch (err) {
        // 로그인 자체는 성공했으므로, 이 시점의 오류는 로그인 화면(이미 숨겨짐)이
        // 아니라 토스트로 알려야 사용자가 빈 화면만 보는 상황을 피할 수 있다.
        showToast('화면을 불러오지 못했습니다. 새로고침해주세요');
        console.error(err);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function wireLogoutButton() {
    const btn = document.getElementById('logout-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!confirm('로그아웃하시겠습니까?')) return;
      try { await Api.auth.logout(); } catch (e) { /* 세션이 이미 없어도 로그아웃 진행 */ }
      state.currentUser = null;
      invalidateCache();
      state.progressCache = {};
      state.bookmarksCache = null;
      showLoginScreen();
    });
  }

  /* ---------------- 초기화 ---------------- */

  async function init() {
    initTheme();

    document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
    document.getElementById('edit-mode-toggle-btn').addEventListener('click', toggleEditMode);
    document.getElementById('hamburger-btn').addEventListener('click', openSidebar);
    document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);
    document.getElementById('search-overlay-close').addEventListener('click', closeSearchOverlay);
    document.getElementById('search-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'search-overlay') closeSearchOverlay();
    });
    document.getElementById('search-overlay-input').addEventListener('input', (e) => {
      renderSearchResults(e.target.value);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSearchOverlay();
    });

    wireLoginForm();
    wireLogoutButton();
    window.addEventListener('ctb:unauthorized', () => showLoginScreen('세션이 만료되었습니다. 다시 로그인해주세요'));

    let me;
    try {
      me = await Api.auth.me();
    } catch (e) {
      me = { user: null };
    }

    if (!me.user) {
      showLoginScreen();
      return;
    }
    await enterApp(me.user);
  }

  return {
    init, navigate, getLessonsMeta, getLesson, getAllLessons, invalidateCache,
    getLessonProgress, setLessonProgressField, getLessonPercent,
    preloadProgress,
    getLastLessonId, setLastLessonId,
    getBookmarks, getBookmarkedItems, toggleBookmark, isBookmarked,
    getDisplayToggles, setDisplayToggle,
    getEditMode, setEditMode, toggleEditMode,
    getCurrentUser,
    showToast, speak, ICONS, escapeHTML,
    renderSidebarLessonList, renderInfoPanel,
    openSearchOverlay, closeSearchOverlay, goToWordFromSearch,
    closeSidebar,
    // 관리자(편집) 기능
    addLesson, updateLessonMeta, deleteLesson, copyLessonToMine, resetLessonProgress,
    addSentence, updateSentence, deleteSentence,
    addVocabWord, updateVocabWord, deleteVocabWord,
    addGrammar, updateGrammar, deleteGrammar,
    addQuiz, updateQuiz, deleteQuiz,
    exportLesson, exportAll,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
