'use strict';

/* ============================================================
   reader.js — 교재 화면: 본문 / 원문 / 단어 / 문법 / 연습문제 탭
   ============================================================ */

const Reader = (() => {

  let currentLesson = null;
  let currentTab = 'text';
  let selectedSentenceId = null;

  async function render(container, lessonId, tab = 'text') {
    currentLesson = await App.getLesson(lessonId);
    currentTab = tab;
    selectedSentenceId = null;

    if (!currentLesson) {
      container.innerHTML = `<div class="content-inner"><p>단원을 불러올 수 없습니다.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="content-inner">
        <div class="reader-header">
          <div class="reader-header-top">
            <div>
              <h2 class="zh">${currentLesson.chineseTitle}</h2>
              <p class="rh-korean">${currentLesson.koreanTitle}</p>
            </div>
            ${currentLesson.canWrite ? `<button class="icon-text-btn" id="btn-goto-admin">편집하기</button>` : ''}
          </div>
        </div>

        <div class="tab-row">
          <button class="tab-btn ${tab === 'text' ? 'active' : ''}" data-tab="text">본문</button>
          <button class="tab-btn ${tab === 'raw' ? 'active' : ''}" data-tab="raw">원문</button>
          <button class="tab-btn ${tab === 'vocab' ? 'active' : ''}" data-tab="vocab">단어</button>
          <button class="tab-btn ${tab === 'grammar' ? 'active' : ''}" data-tab="grammar">문법</button>
          <button class="tab-btn ${tab === 'quiz' ? 'active' : ''}" data-tab="quiz">연습문제</button>
        </div>

        <div class="tab-panel ${tab === 'text' ? 'active' : ''}" id="tab-text"></div>
        <div class="tab-panel ${tab === 'raw' ? 'active' : ''}" id="tab-raw"></div>
        <div class="tab-panel ${tab === 'vocab' ? 'active' : ''}" id="tab-vocab"></div>
        <div class="tab-panel ${tab === 'grammar' ? 'active' : ''}" id="tab-grammar"></div>
        <div class="tab-panel ${tab === 'quiz' ? 'active' : ''}" id="tab-quiz"></div>
      </div>
    `;

    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    const gotoAdminBtn = container.querySelector('#btn-goto-admin');
    if (gotoAdminBtn) {
      gotoAdminBtn.addEventListener('click', () => App.navigate('admin', { lessonId: currentLesson.id }));
    }

    renderTabContent(tab);
  }

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    renderTabContent(tab);
    App.renderInfoPanel(currentLesson); // 단원 메뉴 active 갱신 목적
  }

  function renderTabContent(tab) {
    if (tab === 'text') renderTextTab();
    else if (tab === 'raw') renderRawTab();
    else if (tab === 'vocab') Vocabulary.renderLessonVocab(document.getElementById('tab-vocab'), currentLesson);
    else if (tab === 'grammar') renderGrammarTab();
    else if (tab === 'quiz') renderQuizTab();
  }

  /* ================= 본문 탭 ================= */

  function renderTextTab() {
    const el = document.getElementById('tab-text');
    const toggles = App.getDisplayToggles();
    const bookmarks = App.getBookmarks();

    // 문장별 상세 패널은 DOM에 새로 만들어 붙이는 방식이라 전체 다시 그리기 시 함께 사라진다.
    // 선택 상태만 남아 있으면 같은 문장을 다시 클릭했을 때 접힘으로 오인해 아무 반응이 없으므로 여기서 같이 초기화한다.
    selectedSentenceId = null;

    const sentencesHTML = currentLesson.sentences.map(s => {
      const isBookmarked = bookmarks.sentences.includes(s.id);
      return `
        <div class="sentence-block ${isBookmarked ? 'bookmarked' : ''}" data-sentence-id="${s.id}">
          <div class="sb-chinese zh">${s.chinese}</div>
          <div class="sb-pinyin ${toggles.pinyin ? 'show' : ''}">${s.pinyin}</div>
          <div class="sb-translation ${toggles.translation ? 'show' : ''}">${s.translation}</div>
        </div>
      `;
    }).join('');

    el.innerHTML = `
      <div class="reader-toolbar">
        <button class="toggle-chip ${toggles.pinyin ? 'active' : ''}" id="toggle-pinyin">拼音</button>
        <button class="toggle-chip ${toggles.translation ? 'active' : ''}" id="toggle-translation">번역</button>
        <button class="toggle-chip" id="btn-read-all">${App.ICONS.volume} 전체 듣기</button>
      </div>
      <div class="passage">${sentencesHTML}</div>
    `;

    el.querySelector('#toggle-pinyin').addEventListener('click', () => {
      const t = App.getDisplayToggles();
      App.setDisplayToggle('pinyin', !t.pinyin);
      renderTextTab();
    });
    el.querySelector('#toggle-translation').addEventListener('click', () => {
      const t = App.getDisplayToggles();
      App.setDisplayToggle('translation', !t.translation);
      renderTextTab();
    });
    el.querySelector('#btn-read-all').addEventListener('click', () => {
      const fullText = currentLesson.sentences.map(s => s.chinese).join('');
      App.speak(fullText);
    });

    el.querySelectorAll('.sentence-block').forEach(block => {
      block.addEventListener('click', () => selectSentence(Number(block.dataset.sentenceId)));
    });

    // 본문을 한 번이라도 열람하면 진행률 '완료' 처리
    App.setLessonProgressField(currentLesson.id, 'text', true);
    App.renderInfoPanel(currentLesson);
    App.renderSidebarLessonList();
  }

  function selectSentence(sentenceId) {
    const sentence = currentLesson.sentences.find(s => s.id === sentenceId);
    if (!sentence) return;

    // 이전에 열려 있던 상세 패널은 어느 문장 블록에 있든 제거한다.
    document.querySelectorAll('.sentence-detail').forEach(d => d.remove());

    if (selectedSentenceId === sentenceId) {
      // 이미 펼쳐진 문장을 다시 클릭하면 접는다.
      selectedSentenceId = null;
      document.querySelectorAll('.sentence-block').forEach(b => b.classList.remove('selected'));
      return;
    }
    selectedSentenceId = sentenceId;

    document.querySelectorAll('.sentence-block').forEach(b => {
      b.classList.toggle('selected', Number(b.dataset.sentenceId) === sentenceId);
    });

    const block = document.querySelector(`.sentence-block[data-sentence-id="${sentenceId}"]`);
    if (!block) return;

    // 拼音/번역 보기가 이미 켜져 있으면 문장 블록에 그대로 보이므로, 상세 패널에서는 중복 표시하지 않는다.
    const toggles = App.getDisplayToggles();
    const isSaved = App.isBookmarked('sentences', sentenceId);
    const detail = document.createElement('div');
    detail.className = 'sentence-detail show';
    detail.innerHTML = `
      ${toggles.pinyin ? '' : `<p class="sd-pinyin">${sentence.pinyin}</p>`}
      ${toggles.translation ? '' : `<p class="sd-kr">${sentence.translation}</p>`}
      <div class="sd-actions">
        <button class="action-chip" id="btn-speak-sentence">${App.ICONS.volume} 문장 듣기</button>
        <button class="action-chip ${isSaved ? 'saved' : ''}" id="btn-save-sentence">
          ${isSaved ? App.ICONS.starFilled : App.ICONS.star} ${isSaved ? '저장됨' : '문장 저장'}
        </button>
      </div>
    `;
    detail.addEventListener('click', (e) => e.stopPropagation());
    block.appendChild(detail);

    detail.querySelector('#btn-speak-sentence').addEventListener('click', () => App.speak(sentence.chinese));
    detail.querySelector('#btn-save-sentence').addEventListener('click', async () => {
      let nowSaved;
      try {
        nowSaved = await App.toggleBookmark('sentences', sentenceId);
      } catch (err) { return; }
      App.showToast(nowSaved ? '문장을 저장했습니다' : '저장을 취소했습니다');
      renderTextTab();
      selectedSentenceId = null;
      selectSentence(sentenceId);
    });

    if (typeof detail.scrollIntoView === 'function') {
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /* ================= 원문 탭: 拼音·번역·편집 없이 원문만 이어서 보여준다 ================= */

  function renderRawTab() {
    const el = document.getElementById('tab-raw');
    const fullText = currentLesson.sentences.map(s => s.chinese).join('');
    el.innerHTML = `<div class="raw-passage zh">${fullText}</div>`;

    // 원문도 본문과 같은 내용을 보여주는 것이므로 '본문 읽음' 진행률을 함께 표시한다.
    App.setLessonProgressField(currentLesson.id, 'text', true);
    App.renderInfoPanel(currentLesson);
    App.renderSidebarLessonList();
  }

  /* ================= 문법 탭 ================= */

  function renderGrammarTab() {
    const el = document.getElementById('tab-grammar');
    const cards = currentLesson.grammar.map(g => `
      <div class="grammar-card" data-grammar-id="${g.id}">
        <p class="gc-number">${g.number}</p>
        <p class="gc-title">${g.title}</p>
        <p class="gc-desc">${g.description}</p>
        <div class="gc-example-box">
          <p class="gc-example-zh zh">${g.example}</p>
          <p class="gc-example-kr">${g.translation}</p>
        </div>
      </div>
    `).join('');

    el.innerHTML = `<div class="grammar-list">${cards}</div>`;

    App.setLessonProgressField(currentLesson.id, 'grammar', true);
    App.renderInfoPanel(currentLesson);
    App.renderSidebarLessonList();
  }

  /* ================= 연습문제 탭 ================= */

  function renderQuizTab() {
    const el = document.getElementById('tab-quiz');
    const cards = currentLesson.quiz.map((q, i) => `
      <div class="quiz-card" data-quiz-id="${q.id}">
        <p class="qc-label">QUIZ ${String(i + 1).padStart(2, '0')}</p>
        <p class="qc-question">${q.question}</p>
        <div class="quiz-options">
          ${q.options.map((opt, oi) => `
            <button class="quiz-option" data-option-index="${oi}">
              <span class="qo-dot"></span>
              <span>${opt}</span>
            </button>
          `).join('')}
        </div>
        <button class="quiz-check-btn" disabled>정답 확인</button>
        <div class="quiz-result"></div>
      </div>
    `).join('');

    el.innerHTML = `<div class="quiz-list">${cards}</div>`;

    el.querySelectorAll('.quiz-card').forEach((card, qi) => {
      const quiz = currentLesson.quiz[qi];
      let selected = null;
      const checkBtn = card.querySelector('.quiz-check-btn');
      const options = card.querySelectorAll('.quiz-option');
      const resultEl = card.querySelector('.quiz-result');

      options.forEach((opt, oi) => {
        opt.addEventListener('click', () => {
          if (opt.classList.contains('disabled')) return;
          selected = oi;
          options.forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          checkBtn.disabled = false;
        });
      });

      checkBtn.addEventListener('click', () => {
        if (selected === null) return;
        const isCorrect = selected === quiz.answerIndex;
        options.forEach((o, oi) => {
          o.classList.add('disabled');
          if (oi === quiz.answerIndex) o.classList.add('correct');
          else if (oi === selected && !isCorrect) o.classList.add('wrong');
        });
        checkBtn.disabled = true;
        resultEl.classList.add('show', isCorrect ? 'correct' : 'wrong');
        resultEl.innerHTML = isCorrect
          ? `✓ 정답입니다!<span class="qr-hint">${quiz.explanation}</span>`
          : `✕ 다시 생각해 보세요.<span class="qr-hint">${quiz.explanation}</span>`;

        checkAllQuizCompleted();
      });
    });

    checkAllQuizCompleted(true);
  }

  function checkAllQuizCompleted(silent = false) {
    const cards = document.querySelectorAll('#tab-quiz .quiz-card');
    let allAnswered = true;
    cards.forEach(card => {
      if (!card.querySelector('.quiz-result.show')) allAnswered = false;
    });
    if (allAnswered && cards.length > 0) {
      App.setLessonProgressField(currentLesson.id, 'quiz', true);
      if (!silent) {
        App.showToast('연습문제를 모두 완료했습니다!');
      }
      App.renderInfoPanel(currentLesson);
      App.renderSidebarLessonList();
    }
  }

  return { render, switchTab };
})();
