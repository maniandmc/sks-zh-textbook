'use strict';

/* ============================================================
   vocabulary.js — 단어 탭(표/카드), 단어 상세, 전역 단어장
   ============================================================ */

const Vocabulary = (() => {

  let currentLessonRef = null;
  let selectedWordId = null;

  /* ================= 단원 내 단어 탭 ================= */

  function renderLessonVocab(container, lesson) {
    currentLessonRef = lesson;

    container.innerHTML = `
      <div class="vocab-search">
        ${App.ICONS.search}
        <input type="text" id="lesson-vocab-search" placeholder="단어, 병음, 뜻으로 검색">
      </div>
      <table class="vocab-table" id="lesson-vocab-table">
        <thead>
          <tr><th>단어</th><th>병음</th><th>품사</th><th>뜻</th></tr>
        </thead>
        <tbody></tbody>
      </table>
      <div class="vocab-cards" id="lesson-vocab-cards"></div>
    `;

    renderVocabList(lesson.vocabulary);

    container.querySelector('#lesson-vocab-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const filtered = lesson.vocabulary.filter(v =>
        v.word.toLowerCase().includes(q) ||
        v.pinyin.toLowerCase().includes(q) ||
        v.meaning.toLowerCase().includes(q) ||
        v.partOfSpeech.toLowerCase().includes(q)
      );
      renderVocabList(filtered);
    });

    App.setLessonProgressField(lesson.id, 'vocab', true);
    App.renderInfoPanel(lesson);
    App.renderSidebarLessonList();
  }

  function renderVocabList(list) {
    const tbody = document.querySelector('#lesson-vocab-table tbody');
    const cardsEl = document.getElementById('lesson-vocab-cards');

    // 표/카드를 통째로 다시 그리면 펼쳐져 있던 상세 패널도 함께 사라지므로 선택 상태를 같이 초기화한다.
    selectedWordId = null;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="vocab-empty">검색 결과가 없습니다</td></tr>`;
      cardsEl.innerHTML = `<div class="vocab-empty">검색 결과가 없습니다</div>`;
      return;
    }

    tbody.innerHTML = list.map(v => `
      <tr data-id="${v.id}">
        <td class="vt-word zh">${v.word}</td>
        <td>${v.pinyin}</td>
        <td class="vt-pos">${v.partOfSpeech}</td>
        <td>${v.meaning}</td>
      </tr>
    `).join('');

    cardsEl.innerHTML = list.map(v => `
      <div class="vocab-card" data-id="${v.id}">
        <div class="vc-left">
          <div class="vc-word zh">${v.word}</div>
          <div class="vc-pinyin">${v.pinyin}</div>
        </div>
        <div class="vc-meaning">
          ${v.meaning}
          <span class="vc-pos">${v.partOfSpeech}</span>
        </div>
      </div>
    `).join('');

    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', () => showWordDetail(Number(row.dataset.id)));
    });
    cardsEl.querySelectorAll('.vocab-card').forEach(card => {
      card.addEventListener('click', () => showWordDetail(Number(card.dataset.id)));
    });
  }

  function showWordDetail(id) {
    const v = currentLessonRef.vocabulary.find(item => item.id === id);
    if (!v) return;

    // 이전에 펼쳐져 있던 상세 패널은 표/카드 어디에 있든 제거한다.
    document.querySelectorAll('.word-detail-row').forEach(row => row.remove());
    document.querySelectorAll('.word-detail').forEach(d => d.remove());

    if (selectedWordId === id) {
      // 이미 펼쳐진 단어를 다시 클릭하면 접는다.
      selectedWordId = null;
      document.querySelectorAll('.vocab-table tr[data-id], .vocab-card').forEach(el => el.classList.remove('selected'));
      return;
    }
    selectedWordId = id;

    document.querySelectorAll('.vocab-table tr[data-id], .vocab-card').forEach(el => {
      el.classList.toggle('selected', Number(el.dataset.id) === id);
    });

    const isSaved = App.isBookmarked('words', v.id);
    const exampleHTML = v.example.trim()
      ? `<p class="wd-example-label">예문</p><p class="wd-example zh">${v.example}</p>`
      : '';
    const detailHTML = `
      <div class="wd-actions">
        <button class="action-chip" id="btn-speak-word">${App.ICONS.volume} 발음</button>
        <button class="action-chip ${isSaved ? 'saved' : ''}" id="btn-save-word">
          ${isSaved ? App.ICONS.starFilled : App.ICONS.star} ${isSaved ? '저장됨' : '단어장에 저장'}
        </button>
      </div>
      ${exampleHTML}
    `;

    // 표 행 바로 아래에 상세 패널을 끼워 넣는다 (표는 <tr>만 자식으로 가질 수 있어 행을 하나 더 추가한다).
    const row = document.querySelector(`.vocab-table tr[data-id="${id}"]`);
    let detailInRow = null;
    if (row) {
      const detailRow = document.createElement('tr');
      detailRow.className = 'word-detail-row';
      const cellCount = row.children.length;
      detailRow.innerHTML = `<td colspan="${cellCount}"><div class="word-detail show">${detailHTML}</div></td>`;
      row.insertAdjacentElement('afterend', detailRow);
      detailInRow = detailRow.querySelector('.word-detail');
    }

    // 카드 바로 아래에도 같은 상세 패널을 끼워 넣는다 (모바일 레이아웃에서는 이쪽이 보인다).
    const card = document.querySelector(`.vocab-card[data-id="${id}"]`);
    let detailInCard = null;
    if (card) {
      const detailDiv = document.createElement('div');
      detailDiv.className = 'word-detail show';
      detailDiv.innerHTML = detailHTML;
      card.insertAdjacentElement('afterend', detailDiv);
      detailInCard = detailDiv;
    }

    [detailInRow, detailInCard].filter(Boolean).forEach(detail => {
      detail.querySelector('#btn-speak-word').addEventListener('click', () => App.speak(v.word));
      detail.querySelector('#btn-save-word').addEventListener('click', async () => {
        let nowSaved;
        try {
          nowSaved = await App.toggleBookmark('words', v.id);
        } catch (err) { return; }
        App.showToast(nowSaved ? '단어장에 저장했습니다' : '저장을 취소했습니다');
        selectedWordId = null;
        showWordDetail(id);
      });
    });

    const visibleDetail = (card && card.offsetParent !== null) ? detailInCard : detailInRow;
    if (visibleDetail && typeof visibleDetail.scrollIntoView === 'function') {
      visibleDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  async function showWordDetailById(lessonId, wordId) {
    const lesson = await App.getLesson(lessonId);
    currentLessonRef = lesson;
    showWordDetail(wordId);
  }

  /* ================= 전역 단어장 페이지 ================= */

  async function renderGlobalVocab(container) {
    const lessons = await App.getAllLessons();
    const meta = await App.getLessonsMeta();

    const allWords = [];
    lessons.forEach((lesson, idx) => {
      if (!lesson) return;
      lesson.vocabulary.forEach(v => {
        allWords.push({ ...v, lessonId: lesson.id, lessonTitle: meta.lessons[idx].chineseTitle });
      });
    });

    container.innerHTML = `
      <div class="content-inner">
        <div class="page-header">
          <h1>전체 단어장</h1>
          <p>모든 단원의 단어를 한 번에 검색하고 살펴보세요.</p>
        </div>
        <div class="vocab-search">
          ${App.ICONS.search}
          <input type="text" id="global-vocab-search" placeholder="단어, 병음, 뜻, 품사, 단원으로 검색">
        </div>
        <table class="vocab-table" id="global-vocab-table">
          <thead>
            <tr><th>단어</th><th>병음</th><th>품사</th><th>뜻</th><th>단원</th></tr>
          </thead>
          <tbody></tbody>
        </table>
        <div class="vocab-cards" id="global-vocab-cards"></div>
      </div>
    `;

    renderGlobalList(allWords);

    document.getElementById('global-vocab-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const filtered = allWords.filter(v =>
        v.word.toLowerCase().includes(q) ||
        v.pinyin.toLowerCase().includes(q) ||
        v.meaning.toLowerCase().includes(q) ||
        v.partOfSpeech.toLowerCase().includes(q) ||
        v.lessonTitle.toLowerCase().includes(q)
      );
      renderGlobalList(filtered);
    });
  }

  function renderGlobalList(list) {
    const tbody = document.querySelector('#global-vocab-table tbody');
    const cardsEl = document.getElementById('global-vocab-cards');

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="vocab-empty">검색 결과가 없습니다</td></tr>`;
      cardsEl.innerHTML = `<div class="vocab-empty">검색 결과가 없습니다</div>`;
      return;
    }

    tbody.innerHTML = list.map(v => `
      <tr onclick="App.goToWordFromSearch(${v.lessonId}, ${v.id})">
        <td class="vt-word zh">${v.word}</td>
        <td>${v.pinyin}</td>
        <td class="vt-pos">${v.partOfSpeech}</td>
        <td>${v.meaning}</td>
        <td class="zh" style="color:var(--color-text-tertiary);font-size:13px;">${v.lessonTitle}</td>
      </tr>
    `).join('');

    cardsEl.innerHTML = list.map(v => `
      <div class="vocab-card" onclick="App.goToWordFromSearch(${v.lessonId}, ${v.id})">
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
  }

  return { renderLessonVocab, showWordDetailById, renderGlobalVocab };
})();
