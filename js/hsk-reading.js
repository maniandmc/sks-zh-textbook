'use strict';

/* ============================================================
   hsk-reading.js — HSK 5급 독해 레이아웃 프로토타입 렌더러
   데이터(js/hsk-reading-data.js)를 읽어 A4 시험지 형태의 DOM을 그린다.
   내용이 아니라 "표현 형식"이 목적이므로, 렌더링 로직과 데이터를
   완전히 분리해 두었다 — 내용을 바꿀 때는 데이터 파일만 교체하면 된다.
   ============================================================ */

const HskReading = (() => {

  const PART_TITLES = { 1: '第一部分', 2: '第二部分', 3: '第三部分' };
  const BASE_PAGE_NUMBER = 120;

  // 보기 4개 중 하나라도 이 길이를 넘으면 4열 대신 2열로 줄바꿈한다.
  const OPTION_WRAP_THRESHOLD = 6;

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // **굵게** 마크다운만 <strong>으로 변환한다 (이스케이프된 텍스트 위에서 동작).
  function applyBold(escapedText) {
    return escapedText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  // 한 줄짜리 텍스트(문항 지시문, 보기 등): 이스케이프 + 굵게만 처리.
  function formatInline(raw) {
    return applyBold(escapeHTML(raw));
  }

  // 지문: 이스케이프 + 굵게 + {번호} 빈칸 처리 + 문단 나누기(첫 줄 들여쓰기 적용).
  function formatPassage(raw) {
    const paragraphs = String(raw == null ? '' : raw).split('\n');
    return paragraphs
      .map(p => {
        let html = applyBold(escapeHTML(p));
        html = html.replace(/\{(\d+)\}/g, (_, n) => `<span class="blank">${n}</span>`);
        return `<p class="passage-text">${html}</p>`;
      })
      .join('');
  }

  function plainLength(raw) {
    return String(raw == null ? '' : raw).replace(/\*\*/g, '').length;
  }

  // 보기를 클릭하면 바로 정답·해설을 확인할 수 있다 (연습문제 퀴즈와 같은 방식).
  // 클릭 판정을 위해 각 보기에 문제 id/보기 순번/정답 순번을 data 속성으로 심어둔다.
  function renderOptionRow(question, extraClass) {
    const options = question.options;
    const wrap = options.some(o => plainLength(o) > OPTION_WRAP_THRESHOLD);
    const cls = `option-row ${wrap ? 'option-row-2col' : 'option-row-4col'} ${extraClass || ''}`;
    const labels = ['A', 'B', 'C', 'D'];
    const items = options
      .map((o, i) => `
        <div class="option-item" data-question-id="${question.id}" data-option-index="${i}" data-answer-index="${question.answerIndex}">
          <span class="option-label">${labels[i]}</span>
          <span class="option-text">${formatInline(o)}</span>
        </div>
      `)
      .join('');
    return `<div class="${cls}">${items}</div>`;
  }

  function renderOptionList(question) {
    const options = question.options;
    const labels = ['A', 'B', 'C', 'D'];
    return `
      <div class="option-list">
        ${options.map((o, i) => `
          <div class="option-item" data-question-id="${question.id}" data-option-index="${i}" data-answer-index="${question.answerIndex}">
            <span class="option-label">${labels[i]}</span>
            <span class="option-text">${formatInline(o)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderExplanation(question) {
    return `
      <div class="explanation" data-explanation-for="${question.id}">
        <span class="explanation-label">해설</span> ${formatInline(question.explanation || '')}
      </div>
    `;
  }

  /* ---------------- 제1부분: 빈칸 채우기 ---------------- */

  function renderPart1Group(group) {
    const questionsHTML = group.questions.map(q => `
      <div class="p1-question-wrap">
        <div class="p1-question">
          <span class="q-num">${q.no}.</span>
          ${renderOptionRow(q)}
        </div>
        ${renderExplanation(q)}
      </div>
    `).join('');

    return `
      <div class="question-group">
        <p class="group-range">${escapeHTML(group.range)}.</p>
        <div class="passage-block">${formatPassage(group.passage)}</div>
        <div class="p1-question-list">${questionsHTML}</div>
      </div>
    `;
  }

  /* ---------------- 제2부분: 일치하는 내용 고르기 ---------------- */

  function renderPart2Group(group) {
    // 그룹을 만든 직후 문제를 아직 추가하지 않은 상태(편집 중)일 수 있으므로,
    // 문제가 없으면 보기 목록 없이 지문만 보여준다.
    const q = group.questions[0];
    return `
      <div class="question-group question-group-single">
        <span class="q-num">${escapeHTML(group.range)}.</span>
        <div class="passage-block passage-block-inline">${formatPassage(group.passage)}</div>
        ${q ? renderOptionList(q) + renderExplanation(q) : ''}
      </div>
    `;
  }

  /* ---------------- 제3부분: 장문 독해 ---------------- */

  function renderPart3Group(group) {
    const imageHTML = group.image
      ? `<img class="passage-image" src="${escapeHTML(group.image)}" alt="지문 삽화">`
      : '';

    const questionsHTML = group.questions.map(q => `
      <div class="p3-question">
        <p class="p3-question-text"><span class="q-num">${q.no}.</span> ${formatInline(q.text || '')}</p>
        ${renderOptionRow(q, 'option-row-grid')}
        ${renderExplanation(q)}
      </div>
    `).join('');

    return `
      <div class="question-group">
        <p class="group-range">${escapeHTML(group.range)}.</p>
        <div class="passage-block passage-with-image">
          ${imageHTML}
          ${formatPassage(group.passage)}
        </div>
        <div class="p3-question-list">${questionsHTML}</div>
      </div>
    `;
  }

  const GROUP_RENDERERS = { 1: renderPart1Group, 2: renderPart2Group, 3: renderPart3Group };

  /* ---------------- 페이지(부분) 단위 렌더링 ---------------- */

  function renderPartPage(partData, pageNumber) {
    const renderGroup = GROUP_RENDERERS[partData.part];
    const groupsHTML = partData.groups.map(renderGroup).join('');

    return `
      <section class="exam-page">
        <h1 class="section-title">二、阅读</h1>
        <h2 class="part-title">${escapeHTML(PART_TITLES[partData.part] || '')}</h2>
        <p class="instruction">${formatInline(partData.instruction)}</p>
        ${groupsHTML}
        <div class="page-number">- ${pageNumber} -</div>
      </section>
    `;
  }

  // 보기를 클릭하면 그 문제의 모든 보기를 잠그고, 정답을 표시하고, 해설을 펼친다.
  // 문제 하나당 한 번만 답을 확인할 수 있다 (다시 클릭해도 바뀌지 않음).
  function wireInteractivity(container) {
    const itemsByQuestion = new Map();
    container.querySelectorAll('[data-question-id]').forEach(item => {
      const qid = item.dataset.questionId;
      if (!itemsByQuestion.has(qid)) itemsByQuestion.set(qid, []);
      itemsByQuestion.get(qid).push(item);
    });

    itemsByQuestion.forEach((items, qid) => {
      let answered = false;
      items.forEach(item => {
        item.addEventListener('click', () => {
          if (answered) return;
          answered = true;
          const selectedIndex = Number(item.dataset.optionIndex);
          const answerIndex = Number(item.dataset.answerIndex);
          items.forEach(it => {
            it.classList.add('answered');
            const idx = Number(it.dataset.optionIndex);
            if (idx === answerIndex) it.classList.add('correct');
            else if (idx === selectedIndex) it.classList.add('wrong');
          });
          const explanationEl = container.querySelector(`[data-explanation-for="${qid}"]`);
          if (explanationEl) explanationEl.classList.add('show');
        });
      });
    });
  }

  function render(container, data) {
    container.innerHTML = data
      .map((partData, i) => renderPartPage(partData, BASE_PAGE_NUMBER + i))
      .join('');
    wireInteractivity(container);
  }

  return { render };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HskReading;
}
