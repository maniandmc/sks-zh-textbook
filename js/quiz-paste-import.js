'use strict';

/* ============================================================
   quiz-paste-import.js — AI로 만든 연습문제를 일괄 추가 (교재 관리 전용)

   붙여넣으면(1단계) 자동으로 파싱해서 미리보기(2단계)에서 문제별로
   체크·수정(질문/보기/정답/해설)·삭제한 뒤, 선택된 문제만 현재
   단원의 연습문제로 일괄 추가한다.

   파싱 로직은 js/parse-pasted-quiz.js(순수 함수)에 분리되어 있다.
   저장은 기존 App.addQuiz()를 순차 호출해서 쓰므로, 서버 쪽 검증이
   문제마다 그대로 적용된다. vocab-paste-import.js와 같은 vpi-* 모달
   스타일을 그대로 재사용한다.
   ============================================================ */

const QuizPasteImport = (() => {

  const MAX_ROWS = 100;
  const OPTION_LABELS = ['A', 'B', 'C', 'D'];

  const QUIZ_AI_PROMPT = `너는 지금부터 중국어 학습용 4지선다 연습문제를 만드는 역할이야. 아래 규칙을
반드시 지켜줘.

1. 내가 준 지문·단어·문법 내용이 있으면 그 내용을 바탕으로, 없으면 일반적인
   중국어 학습 내용을 바탕으로 4지선다 문제를 원하는 개수만큼 만들어줘.
   지문에 없는 내용을 지어내지 마.

2. 문제마다 아래 형식을 정확히 지켜서 출력해줘. 문제와 문제 사이는 반드시
   빈 줄 하나로 구분해줘.

질문: (문제 내용)
A: (보기1)
B: (보기2)
C: (보기3)
D: (보기4)
정답: (A~D 중 하나의 알파벳만. 보기 내용을 다시 옮겨 적지 마)
해설: (왜 그 보기가 정답인지, 학생이 바로 이해할 수 있게 한국어로 설명)

3. 보기 4개는 모두 채워야 하고, 서로 겹치지 않게 만들어줘.`;

  let state = null; // { lessonId, rows: [...], onImported, overlayEl }
  let rowSeq = 0;

  /* ---------------- 공개 API ---------------- */

  function open(lessonId, onImported) {
    if (state) close();

    state = { lessonId, rows: [], onImported, overlayEl: null };

    const overlay = document.createElement('div');
    overlay.className = 'vpi-overlay';
    document.body.appendChild(overlay);
    state.overlayEl = overlay;

    document.addEventListener('keydown', onKeyDown);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    renderPasteStep();
  }

  function close() {
    if (!state) return;
    document.removeEventListener('keydown', onKeyDown);
    if (state.overlayEl && state.overlayEl.parentNode) {
      state.overlayEl.parentNode.removeChild(state.overlayEl);
    }
    state = null;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') close();
  }

  /* ---------------- 가이드 모달 ---------------- */

  function showQuizGuide() {
    const overlay = document.createElement('div');
    overlay.className = 'vpi-overlay';
    overlay.innerHTML = `
      <div class="vpi-panel">
        <div class="vpi-header">
          <p class="vpi-title">문제 붙여넣기 가이드</p>
          <button class="vpi-close" id="quiz-guide-close" aria-label="닫기">&times;</button>
        </div>
        <div class="vpi-body">
          <p class="vpi-hint-text" style="margin-bottom:16px;">
            문제 하나당 <strong>질문 / A~D 보기 / 정답 / 해설</strong> 여섯 줄로 적고,
            문제와 문제 사이는 빈 줄로 구분해서 붙여넣으세요. 정답은 A~D 알파벳으로
            적어도 되고, 보기 내용을 그대로 적어도 자동으로 알아봅니다.
          </p>
          <div class="admin-field">
            <textarea rows="7" readonly>질문: "家庭"의 뜻은?
A: 학교
B: 가정
C: 회사
D: 병원
정답: B
해설: 家庭은 가정, 가족을 뜻한다.</textarea>
          </div>
          <p class="section-heading" style="font-size:13.5px;margin-top:16px;">AI에게 문제 만들어달라고 요청하기</p>
          <p class="vpi-hint-text" style="margin-bottom:10px;">
            수업 지문이나 단어 목록을 AI(Claude, ChatGPT 등)에게 아래 프롬프트와 함께
            주면, 이 화면에 바로 붙여넣을 수 있는 형식으로 문제를 만들어줍니다.
          </p>
          <div class="admin-field">
            <textarea id="quiz-guide-prompt" rows="10" readonly>${App.escapeHTML(QUIZ_AI_PROMPT)}</textarea>
          </div>
          <p class="vpi-hint-text" style="margin-top:8px;">
            AI 답변을 그대로 복사해서 붙여넣기 칸에 붙여넣고 "다음"을 누르면,
            문제별로 확인·수정한 뒤 등록할 수 있습니다.
          </p>
          <div class="admin-form-actions" style="margin-top:16px;">
            <button class="btn-primary" id="quiz-guide-copy">프롬프트 복사</button>
            <button class="btn-secondary" id="quiz-guide-close-2">닫기</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const closeGuide = () => {
      document.removeEventListener('keydown', onGuideKeyDown, true);
      overlay.remove();
    };
    function onGuideKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation(); // 부모 모달(문제 붙여넣기)까지 함께 닫히지 않도록
        closeGuide();
      }
    }
    document.addEventListener('keydown', onGuideKeyDown, true);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeGuide(); });
    overlay.querySelector('#quiz-guide-close').addEventListener('click', closeGuide);
    overlay.querySelector('#quiz-guide-close-2').addEventListener('click', closeGuide);
    overlay.querySelector('#quiz-guide-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(QUIZ_AI_PROMPT);
        App.showToast('프롬프트를 복사했습니다');
      } catch (e) {
        const textarea = overlay.querySelector('#quiz-guide-prompt');
        textarea.focus();
        textarea.select();
        App.showToast('자동 복사에 실패했습니다. 직접 선택해서 복사해주세요');
      }
    });
  }

  /* ---------------- 1단계: 붙여넣기 화면 ---------------- */

  function renderPasteStep() {
    const overlay = state.overlayEl;
    overlay.innerHTML = `
      <div class="vpi-panel" role="dialog" aria-modal="true" aria-label="문제 붙여넣기">
        <div class="vpi-header">
          <p class="vpi-title">${App.ICONS.plus} 문제 일괄 추가</p>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="icon-text-btn" id="qpi-guide-btn">가이드 보기</button>
            <button class="vpi-close" id="qpi-close" aria-label="닫기">×</button>
          </div>
        </div>
        <div class="vpi-body">
          <div class="vpi-format-hint">
            <p class="vpi-hint-text">문제 하나당 "질문 / A / B / C / D / 정답 / 해설" 줄을 쓰고, 문제 사이는 빈 줄로 구분해서 붙여넣으세요. AI로 문제를 만드는 방법은 <strong>가이드 보기</strong>를 확인하세요.</p>
          </div>
          <textarea
            class="vpi-paste-area"
            id="qpi-paste-area"
            aria-label="문제 붙여넣기 영역"
            placeholder="질문: &quot;家庭&quot;의 뜻은?&#10;A: 학교&#10;B: 가정&#10;C: 회사&#10;D: 병원&#10;정답: B&#10;해설: 家庭은 가정, 가족을 뜻한다."
          ></textarea>
          <p class="vpi-paste-status" id="qpi-paste-status"></p>
        </div>
        <div class="vpi-footer">
          <button class="btn-secondary" id="qpi-cancel">취소</button>
          <button class="btn-primary" id="qpi-next" disabled>다음</button>
        </div>
      </div>
    `;

    const textarea = overlay.querySelector('#qpi-paste-area');
    const statusEl = overlay.querySelector('#qpi-paste-status');
    const nextBtn = overlay.querySelector('#qpi-next');

    if (state.pastedText) {
      textarea.value = state.pastedText;
      updatePasteStatus();
    }

    function updatePasteStatus() {
      const text = textarea.value;
      state.pastedText = text;
      if (!text.trim()) {
        statusEl.innerHTML = '';
        statusEl.className = 'vpi-paste-status';
        textarea.classList.remove('pasted');
        nextBtn.disabled = true;
        return;
      }
      const { questions } = ParsePastedQuiz.parsePastedQuiz(text);
      textarea.classList.add('pasted');
      if (questions.length === 0) {
        statusEl.textContent = '문제를 인식하지 못했어요. "질문:", "A:" 같은 라벨이 있는지 확인해주세요.';
        statusEl.className = 'vpi-paste-status warn';
      } else {
        statusEl.textContent = `${questions.length}개 문제를 인식했어요.`;
        statusEl.className = 'vpi-paste-status';
      }
      nextBtn.disabled = questions.length === 0;
    }

    textarea.addEventListener('input', updatePasteStatus);
    textarea.addEventListener('paste', () => setTimeout(updatePasteStatus, 0));
    textarea.focus();

    overlay.querySelector('#qpi-guide-btn').addEventListener('click', showQuizGuide);
    overlay.querySelector('#qpi-close').addEventListener('click', close);
    overlay.querySelector('#qpi-cancel').addEventListener('click', close);
    nextBtn.addEventListener('click', () => {
      const { questions } = ParsePastedQuiz.parsePastedQuiz(textarea.value);
      if (questions.length === 0) return;
      goToPreview(questions);
    });
  }

  /* ---------------- 파싱 결과 → 행 상태로 변환 ---------------- */

  function goToPreview(questions) {
    let truncated = false;
    let limited = questions;
    if (questions.length > MAX_ROWS) {
      limited = questions.slice(0, MAX_ROWS);
      truncated = true;
    }

    state.rows = limited.map(q => ({
      id: ++rowSeq,
      question: q.question,
      options: q.options.slice(),
      answerIndex: q.answerIndex,
      explanation: q.explanation,
      checked: true,
    }));

    applyDefaultChecks();

    if (truncated) {
      App.showToast(`한 번에 최대 ${MAX_ROWS}개까지 가능해서 앞의 ${MAX_ROWS}개만 불러왔어요`);
    }

    renderPreviewStep();
  }

  /* 문제/보기가 비어있거나 정답을 못 찾은 항목은 기본 체크 해제 */
  function applyDefaultChecks() {
    state.rows.forEach(row => {
      const meta = rowMeta(row);
      if (!meta.valid) row.checked = false;
    });
  }

  function rowMeta(row) {
    const emptyQuestion = !row.question.trim();
    const emptyOption = row.options.some(o => !o.trim());
    const invalidAnswer = !Number.isInteger(row.answerIndex) || row.answerIndex < 0 || row.answerIndex > 3;
    const emptyExplanation = !row.explanation.trim();
    return {
      emptyQuestion, emptyOption, invalidAnswer, emptyExplanation,
      valid: !emptyQuestion && !emptyOption && !invalidAnswer && !emptyExplanation,
    };
  }

  /* ---------------- 2단계: 미리보기 화면 ---------------- */

  function renderPreviewStep() {
    const overlay = state.overlayEl;
    overlay.innerHTML = `
      <div class="vpi-panel vpi-panel-preview" role="dialog" aria-modal="true" aria-label="붙여넣은 문제 미리보기">
        <div class="vpi-header">
          <p class="vpi-title">미리보기</p>
          <button class="vpi-close" id="qpi-close" aria-label="닫기">×</button>
        </div>
        <p class="vpi-summary" id="qpi-summary"></p>
        <div class="vpi-list" id="qpi-list"></div>
        <div class="vpi-footer">
          <button class="btn-secondary" id="qpi-back">이전</button>
          <button class="btn-success" id="qpi-save" disabled>0개 문제 추가</button>
        </div>
      </div>
    `;

    overlay.querySelector('#qpi-close').addEventListener('click', close);
    overlay.querySelector('#qpi-back').addEventListener('click', renderPasteStep);
    overlay.querySelector('#qpi-save').addEventListener('click', save);

    renderRows();
    updateSummary();
  }

  function renderRows() {
    const listEl = state.overlayEl.querySelector('#qpi-list');

    listEl.innerHTML = state.rows.map((row, i) => `
      <div class="admin-card" data-row-id="${row.id}">
        <div class="admin-lesson-header-row" style="margin-bottom:10px;">
          <label style="display:flex;align-items:center;gap:8px;font-weight:700;">
            <input type="checkbox" data-field="checked"> 문제 ${i + 1}
          </label>
          <button class="icon-text-btn danger" data-action="delete">삭제</button>
        </div>
        <p class="vpi-warn-text" data-role="warning" style="display:none;"></p>
        <div class="admin-field">
          <label>질문</label>
          <textarea data-field="question" rows="2"></textarea>
        </div>
        <div class="admin-field">
          <label>보기 (정답 앞의 라디오 버튼을 선택하세요)</label>
          <div class="admin-quiz-options">
            ${OPTION_LABELS.map((label, idx) => `
              <div class="admin-quiz-option-row">
                <input type="radio" name="qpi-answer-${row.id}" data-answer-index="${idx}">
                <input type="text" class="qf-opt-input" data-option-index="${idx}" placeholder="보기 ${label}">
              </div>
            `).join('')}
          </div>
        </div>
        <div class="admin-field">
          <label>해설</label>
          <textarea data-field="explanation" rows="2"></textarea>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-row-id]').forEach(rowEl => {
      const id = Number(rowEl.dataset.rowId);
      const row = state.rows.find(r => r.id === id);
      if (!row) return;

      rowEl.querySelector('[data-field="checked"]').checked = row.checked;
      rowEl.querySelector('[data-field="question"]').value = row.question;
      rowEl.querySelector('[data-field="explanation"]').value = row.explanation;
      rowEl.querySelectorAll('[data-option-index]').forEach(input => {
        input.value = row.options[Number(input.dataset.optionIndex)];
      });
      const answerRadio = rowEl.querySelector(`[data-answer-index="${row.answerIndex}"]`);
      if (answerRadio) answerRadio.checked = true;

      rowEl.querySelector('[data-field="checked"]').addEventListener('change', (e) => {
        row.checked = e.target.checked;
        updateSummary();
      });
      rowEl.querySelector('[data-field="question"]').addEventListener('input', (e) => {
        row.question = e.target.value;
        refreshRowWarning(rowEl, row);
      });
      rowEl.querySelector('[data-field="explanation"]').addEventListener('input', (e) => {
        row.explanation = e.target.value;
        refreshRowWarning(rowEl, row);
      });
      rowEl.querySelectorAll('[data-option-index]').forEach(input => {
        input.addEventListener('input', (e) => {
          row.options[Number(e.target.dataset.optionIndex)] = e.target.value;
          refreshRowWarning(rowEl, row);
        });
      });
      rowEl.querySelectorAll('[data-answer-index]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          if (e.target.checked) {
            row.answerIndex = Number(e.target.dataset.answerIndex);
            refreshRowWarning(rowEl, row);
          }
        });
      });

      rowEl.querySelector('[data-action="delete"]').addEventListener('click', () => {
        state.rows = state.rows.filter(r => r.id !== id);
        renderRows();
        updateSummary();
      });

      refreshRowWarning(rowEl, row);
    });
  }

  function refreshRowWarning(rowEl, row) {
    const meta = rowMeta(row);
    const warnEl = rowEl.querySelector('[data-role="warning"]');
    const messages = [];
    if (meta.emptyQuestion) messages.push('질문이 비어 있어요');
    if (meta.emptyOption) messages.push('보기를 모두 채워주세요');
    if (meta.invalidAnswer) messages.push('정답을 선택해주세요');
    if (meta.emptyExplanation) messages.push('해설이 비어 있어요');

    if (messages.length > 0) {
      warnEl.textContent = messages.join(' · ');
      warnEl.style.display = '';
    } else {
      warnEl.style.display = 'none';
    }
  }

  function updateSummary() {
    const total = state.rows.length;
    const checked = state.rows.filter(r => r.checked).length;
    state.overlayEl.querySelector('#qpi-summary').textContent = `총 ${total}개 중 ${checked}개 선택됨`;

    const saveBtn = state.overlayEl.querySelector('#qpi-save');
    saveBtn.textContent = `${checked}개 문제 추가`;
    saveBtn.disabled = checked === 0;
  }

  /* ---------------- 저장 ---------------- */

  async function save() {
    const saveBtn = state.overlayEl.querySelector('#qpi-save');
    if (saveBtn.disabled) return;

    const toSave = state.rows.filter(r => r.checked && rowMeta(r).valid);
    if (toSave.length === 0) {
      App.showToast('저장할 수 있는 문제가 없어요. 경고 표시를 확인해주세요');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';

    const succeededIds = [];
    for (const row of toSave) {
      try {
        await App.addQuiz(state.lessonId, {
          question: row.question.trim(),
          options: row.options.map(o => o.trim()),
          answerIndex: row.answerIndex,
          explanation: row.explanation.trim(),
        });
        succeededIds.push(row.id);
      } catch (e) {
        // 실패한 항목은 미리보기에 남겨서 사용자가 고쳐서 재시도할 수 있게 한다.
        // (오류 토스트는 App.addQuiz 내부에서 이미 표시됨)
      }
    }

    if (succeededIds.length > 0) {
      App.showToast(`${succeededIds.length}개 문제가 추가되었어요`);
      state.rows = state.rows.filter(r => !succeededIds.includes(r.id));
      if (state.onImported) await state.onImported();
    }

    if (!state) return; // save 도중 사용자가 모달을 닫았을 수 있음

    if (state.rows.length === 0) {
      close();
      return;
    }

    renderRows();
    updateSummary();
  }

  return { open, close };
})();
