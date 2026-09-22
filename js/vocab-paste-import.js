'use strict';

/* ============================================================
   vocab-paste-import.js — 표 붙여넣기로 단어 일괄 추가 (교재 관리 전용)

   엑셀/구글 시트/한셀에서 복사한 표를 붙여넣으면(1단계) 자동으로
   파싱해서 미리보기(2단계)에서 체크·인라인 수정·삭제한 뒤,
   선택된 항목만 현재 단원의 단어장에 일괄 추가한다.

   파싱 로직은 js/parse-pasted-table.js(순수 함수)에 분리되어 있다.
   저장은 기존 App.addVocabWord()를 순차 호출해서 쓰므로, 서버 쪽
   검증(단어 필수, 길이 제한, 단원 내 중복 방지)이 항목마다 그대로 적용된다.
   ============================================================ */

const VocabPasteImport = (() => {

  const MAX_ROWS = 500;

  let state = null; // { lessonId, existingWordsLower: Set, rows: [...], onImported, overlayEl }
  let rowSeq = 0;

  /* ---------------- 공개 API ---------------- */

  function open(lessonId, existingVocabulary, onImported) {
    if (state) close(); // 혹시 이미 열려있으면 정리 후 새로 시작

    state = {
      lessonId,
      existingWordsLower: new Set((existingVocabulary || []).map(w => w.trim().toLowerCase()).filter(Boolean)),
      rows: [],
      onImported,
      overlayEl: null,
    };

    const overlay = document.createElement('div');
    overlay.className = 'vpi-overlay';
    document.body.appendChild(overlay);
    state.overlayEl = overlay;

    document.addEventListener('keydown', onKeyDown);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

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

  const VOCAB_PASTE_AI_PROMPT = `너는 지금부터 중국어 지문(또는 단어 목록)에서 학습할 만한 단어를 뽑아,
우리 학습 사이트의 "단어 표 붙여넣기" 화면에 붙여넣을 수 있는 표 형식으로
정리하는 역할이야. 아래 규칙을 반드시 지켜줘.

1. 단어마다 아래 다섯 개 항목을 순서대로 만들어줘:
   단어(간체) / 병음(성조 포함) / 품사(한국어로 짧게: 명사/동사/형용사/부사 등) /
   뜻(한국어) / 예문(그 단어가 들어간 중국어 문장. 지문에 있으면 원문 그대로,
   없으면 자연스러운 예문을 새로 만들어줘)

2. 각 항목은 반드시 탭(Tab) 문자로 구분해서 한 단어당 한 줄로 출력해줘.
   줄 안에 탭이 아닌 다른 구분자(쉼표, 세미콜론 등)는 쓰지 마.

3. 첫 줄에는 제목 줄을 "단어	병음	품사	뜻	예문"처럼 탭으로 구분해서
   넣어줘 (화면에서 자동으로 인식해서 제외하니 넣어도 상관없어).

4. 이미 나온 단어(중복)는 한 번만 넣어줘.

5. 예문을 새로 만들 수 없을 만큼 정보가 부족하면 그 칸은 비워둬도 돼
   (단어와 뜻만은 반드시 채워야 해).`;

  function showVocabPasteGuide() {
    const overlay = document.createElement('div');
    overlay.className = 'vpi-overlay';
    overlay.innerHTML = `
      <div class="vpi-panel">
        <div class="vpi-header">
          <p class="vpi-title">단어 붙여넣기 가이드</p>
          <button class="vpi-close" id="vocab-guide-close" aria-label="닫기">&times;</button>
        </div>
        <div class="vpi-body">
          <p class="vpi-hint-text" style="margin-bottom:16px;">
            엑셀·구글 시트·한셀에서 <strong>단어·병음·품사·뜻·예문</strong> 순서로 된
            표를 선택해 복사한 뒤, 붙여넣기 칸에 그대로 붙여넣으세요 (단어만 필수,
            나머지 칸은 비워도 됩니다). 첫 줄이 "단어/병음/품사/뜻/예문" 같은 제목
            줄이면 자동으로 인식해서 제외합니다. 붙여넣은 뒤 다음 화면에서 항목별로
            체크·수정·삭제한 다음 등록하면 됩니다.
          </p>
          <p class="section-heading" style="font-size:13.5px;">AI에게 단어표 만들어달라고 요청하기</p>
          <p class="vpi-hint-text" style="margin-bottom:10px;">
            중국어 지문이나 단어 목록이 있다면, AI(Claude, ChatGPT 등)에게 아래
            프롬프트와 함께 주면 이 화면에 바로 붙여넣을 수 있는 표를 만들어줍니다.
          </p>
          <div class="admin-field">
            <textarea id="vocab-guide-prompt" rows="10" readonly>${App.escapeHTML(VOCAB_PASTE_AI_PROMPT)}</textarea>
          </div>
          <p class="vpi-hint-text" style="margin-top:8px;">
            AI 답변을 그대로 복사해서 붙여넣기 칸에 붙여넣으면 됩니다 (AI가 탭으로
            구분된 표를 만들어주면 바로 인식됩니다).
          </p>
          <div class="admin-form-actions" style="margin-top:16px;">
            <button class="btn-primary" id="vocab-guide-copy">프롬프트 복사</button>
            <button class="btn-secondary" id="vocab-guide-close-2">닫기</button>
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
        e.stopPropagation(); // 부모 모달(단어 붙여넣기)까지 함께 닫히지 않도록
        closeGuide();
      }
    }
    document.addEventListener('keydown', onGuideKeyDown, true);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeGuide(); });
    overlay.querySelector('#vocab-guide-close').addEventListener('click', closeGuide);
    overlay.querySelector('#vocab-guide-close-2').addEventListener('click', closeGuide);
    overlay.querySelector('#vocab-guide-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(VOCAB_PASTE_AI_PROMPT);
        App.showToast('프롬프트를 복사했습니다');
      } catch (e) {
        const textarea = overlay.querySelector('#vocab-guide-prompt');
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
      <div class="vpi-panel" role="dialog" aria-modal="true" aria-label="단어 표 붙여넣기">
        <div class="vpi-header">
          <p class="vpi-title">${App.ICONS.plus} 단어 표 붙여넣기</p>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="icon-text-btn" id="vpi-guide-btn">가이드 보기</button>
            <button class="vpi-close" id="vpi-close" aria-label="닫기">×</button>
          </div>
        </div>
        <div class="vpi-body">
          <div class="vpi-format-hint">
            <table class="vpi-hint-table">
              <thead>
                <tr><th>단어</th><th>병음</th><th>품사</th><th>뜻</th><th>예문</th></tr>
              </thead>
              <tbody>
                <tr><td class="zh">论语</td><td>Lúnyǔ</td><td>명사</td><td>논어</td><td class="zh">《论语》是中国古代的重要著作。</td></tr>
              </tbody>
            </table>
            <p class="vpi-hint-text">엑셀·구글 시트·한셀에서 이 순서(단어·병음·품사·뜻·예문)로 된 범위를 선택해 <strong>Ctrl+C</strong>로 복사한 뒤, 아래 칸을 클릭하고 <strong>Ctrl+V</strong>로 붙여넣으세요.</p>
          </div>
          <textarea
            class="vpi-paste-area"
            id="vpi-paste-area"
            aria-label="단어 표 붙여넣기 영역"
            placeholder="단어, 병음, 품사, 뜻, 예문 칸을 Ctrl+V로 붙여넣으세요. (병음, 품사, 예문은 생략 가능)"
          ></textarea>
          <p class="vpi-paste-status" id="vpi-paste-status"></p>
        </div>
        <div class="vpi-footer">
          <button class="btn-secondary" id="vpi-cancel">취소</button>
          <button class="btn-primary" id="vpi-next" disabled>다음</button>
        </div>
      </div>
    `;

    const textarea = overlay.querySelector('#vpi-paste-area');
    const statusEl = overlay.querySelector('#vpi-paste-status');
    const nextBtn = overlay.querySelector('#vpi-next');

    // 이전 단계에서 돌아온 경우 붙여넣은 내용을 유지한다.
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
      const { words, looksLikeTable } = ParsePastedTable.parsePastedTable(text);
      textarea.classList.add('pasted');
      if (!looksLikeTable) {
        statusEl.textContent = `표 형식이 아닌 것 같아요. 엑셀에서 열을 선택해 복사해 주세요. (단어 ${words.length}개로 인식됨)`;
        statusEl.className = 'vpi-paste-status warn';
      } else {
        statusEl.textContent = `${words.length}행을 인식했어요.`;
        statusEl.className = 'vpi-paste-status';
      }
      nextBtn.disabled = words.length === 0;
    }

    textarea.addEventListener('input', updatePasteStatus);
    textarea.addEventListener('paste', () => setTimeout(updatePasteStatus, 0));
    textarea.focus();

    overlay.querySelector('#vpi-guide-btn').addEventListener('click', showVocabPasteGuide);
    overlay.querySelector('#vpi-close').addEventListener('click', close);
    overlay.querySelector('#vpi-cancel').addEventListener('click', close);
    nextBtn.addEventListener('click', () => {
      const { words } = ParsePastedTable.parsePastedTable(textarea.value);
      if (words.length === 0) return;
      goToPreview(words);
    });
  }

  /* ---------------- 파싱 결과 → 행 상태로 변환 ---------------- */

  function goToPreview(words) {
    let truncated = false;
    let limited = words;
    if (words.length > MAX_ROWS) {
      limited = words.slice(0, MAX_ROWS);
      truncated = true;
    }

    state.rows = limited.map(w => ({
      id: ++rowSeq,
      word: w.word,
      pinyin: w.pinyin,
      partOfSpeech: w.partOfSpeech,
      meaning: w.meaning,
      example: w.example,
      checked: true,
    }));

    applyDefaultChecks();

    if (truncated) {
      App.showToast(`한 번에 최대 ${MAX_ROWS}개까지 가능해서 앞의 ${MAX_ROWS}개만 불러왔어요`);
    }

    renderPreviewStep();
  }

  /* 빈 단어 / 이미 존재하는 단어는 기본 체크 해제 */
  function applyDefaultChecks() {
    state.rows.forEach(row => {
      const word = row.word.trim();
      if (!word) {
        row.checked = false;
      } else if (state.existingWordsLower.has(word.toLowerCase())) {
        row.checked = false;
      }
    });
  }

  function computeMeta() {
    const countByWord = new Map();
    state.rows.forEach(row => {
      const key = row.word.trim().toLowerCase();
      if (!key) return;
      countByWord.set(key, (countByWord.get(key) || 0) + 1);
    });

    const meta = new Map();
    state.rows.forEach(row => {
      const key = row.word.trim().toLowerCase();
      meta.set(row.id, {
        emptyWord: !key,
        duplicateInBatch: !!key && countByWord.get(key) > 1,
        alreadyExists: !!key && state.existingWordsLower.has(key),
      });
    });
    return meta;
  }

  /* ---------------- 2단계: 미리보기 화면 ---------------- */

  function renderPreviewStep() {
    const overlay = state.overlayEl;
    overlay.innerHTML = `
      <div class="vpi-panel vpi-panel-preview" role="dialog" aria-modal="true" aria-label="붙여넣은 단어 미리보기">
        <div class="vpi-header">
          <p class="vpi-title">미리보기</p>
          <button class="vpi-close" id="vpi-close" aria-label="닫기">×</button>
        </div>
        <p class="vpi-summary" id="vpi-summary"></p>
        <div class="vpi-list-head">
          <span class="vpi-col-check"><input type="checkbox" id="vpi-check-all" aria-label="전체 선택"></span>
          <span class="vpi-col-word">단어</span>
          <span class="vpi-col-pinyin">병음</span>
          <span class="vpi-col-pos">품사</span>
          <span class="vpi-col-meaning">뜻</span>
          <span class="vpi-col-example">예문</span>
          <span class="vpi-col-delete"></span>
        </div>
        <div class="vpi-list" id="vpi-list"></div>
        <div class="vpi-footer">
          <button class="btn-secondary" id="vpi-back">이전</button>
          <button class="btn-success" id="vpi-save" disabled>0개 단어 추가</button>
        </div>
      </div>
    `;

    overlay.querySelector('#vpi-close').addEventListener('click', close);
    overlay.querySelector('#vpi-back').addEventListener('click', renderPasteStep);
    overlay.querySelector('#vpi-check-all').addEventListener('change', (e) => {
      state.rows.forEach(row => { row.checked = e.target.checked; });
      renderRows();
      updateSummary();
    });
    overlay.querySelector('#vpi-save').addEventListener('click', save);

    renderRows();
    updateSummary();
  }

  function renderRows() {
    const listEl = state.overlayEl.querySelector('#vpi-list');
    const meta = computeMeta();

    listEl.innerHTML = state.rows.map(row => `
      <div class="vpi-row" data-row-id="${row.id}">
        <div class="vpi-row-main">
          <span class="vpi-col-check"><input type="checkbox" class="vpi-row-check" data-field="checked"></span>
          <span class="vpi-col-word"><span class="vpi-field-label">단어</span><input type="text" class="vpi-input zh" data-field="word" placeholder="단어"></span>
          <span class="vpi-col-pinyin"><span class="vpi-field-label">병음</span><input type="text" class="vpi-input" data-field="pinyin" placeholder="병음"></span>
          <span class="vpi-col-pos"><span class="vpi-field-label">품사</span><input type="text" class="vpi-input" data-field="partOfSpeech" placeholder="품사"></span>
          <span class="vpi-col-meaning"><span class="vpi-field-label">뜻</span><input type="text" class="vpi-input" data-field="meaning" placeholder="뜻"></span>
          <span class="vpi-col-example"><span class="vpi-field-label">예문</span><textarea class="vpi-input zh" data-field="example" rows="1" placeholder="예문"></textarea></span>
          <span class="vpi-col-delete"><button class="vpi-row-delete" data-action="delete" aria-label="이 단어 삭제" title="삭제">${App.ICONS.trash}</button></span>
        </div>
        <div class="vpi-row-meta"></div>
      </div>
    `).join('');

    // 값은 속성이 아니라 프로퍼티로 채운다 (따옴표 등 특수문자가 있어도 안전).
    listEl.querySelectorAll('.vpi-row').forEach(rowEl => {
      const id = Number(rowEl.dataset.rowId);
      const row = state.rows.find(r => r.id === id);
      if (!row) return;

      rowEl.querySelector('[data-field="checked"]').checked = row.checked;
      rowEl.querySelector('[data-field="word"]').value = row.word;
      rowEl.querySelector('[data-field="pinyin"]').value = row.pinyin;
      rowEl.querySelector('[data-field="partOfSpeech"]').value = row.partOfSpeech;
      rowEl.querySelector('[data-field="meaning"]').value = row.meaning;
      rowEl.querySelector('[data-field="example"]').value = row.example;

      rowEl.querySelector('[data-field="checked"]').addEventListener('change', (e) => {
        row.checked = e.target.checked;
        updateSummary();
      });
      ['pinyin', 'partOfSpeech', 'meaning', 'example'].forEach(field => {
        rowEl.querySelector(`[data-field="${field}"]`).addEventListener('input', (e) => {
          row[field] = e.target.value;
        });
      });
      const wordInput = rowEl.querySelector('[data-field="word"]');
      wordInput.addEventListener('input', (e) => {
        row.word = e.target.value;
        refreshRowMeta(); // 단어가 바뀌면 중복/기존 여부가 달라질 수 있음
      });

      rowEl.querySelector('[data-action="delete"]').addEventListener('click', () => {
        state.rows = state.rows.filter(r => r.id !== id);
        renderRows();
        updateSummary();
      });
    });

    applyRowMeta(meta);
  }

  /* 구조(입력칸)는 그대로 두고 경고/배지/체크박스 disabled만 갱신 — 포커스 유지 목적 */
  function refreshRowMeta() {
    applyRowMeta(computeMeta());
  }

  function applyRowMeta(meta) {
    const listEl = state.overlayEl.querySelector('#vpi-list');
    listEl.querySelectorAll('.vpi-row').forEach(rowEl => {
      const id = Number(rowEl.dataset.rowId);
      const m = meta.get(id);
      const metaEl = rowEl.querySelector('.vpi-row-meta');
      if (!m) { metaEl.innerHTML = ''; return; }

      rowEl.classList.toggle('vpi-row-warn', m.emptyWord);

      const badges = [];
      if (m.duplicateInBatch) badges.push('<span class="vpi-badge vpi-badge-dup">중복</span>');
      if (m.alreadyExists) badges.push('<span class="vpi-badge vpi-badge-exists">이미 있음</span>');

      metaEl.innerHTML = `
        ${m.emptyWord ? '<span class="vpi-warn-text">단어가 비어 있어요</span>' : ''}
        ${badges.join('')}
      `;
    });
  }

  function updateSummary() {
    const total = state.rows.length;
    const checked = state.rows.filter(r => r.checked).length;
    state.overlayEl.querySelector('#vpi-summary').textContent = `총 ${total}개 중 ${checked}개 선택됨`;

    const saveBtn = state.overlayEl.querySelector('#vpi-save');
    saveBtn.textContent = `${checked}개 단어 추가`;
    saveBtn.disabled = checked === 0;

    const checkAll = state.overlayEl.querySelector('#vpi-check-all');
    if (checkAll) checkAll.checked = total > 0 && checked === total;
  }

  /* ---------------- 저장 ---------------- */

  async function save() {
    const saveBtn = state.overlayEl.querySelector('#vpi-save');
    if (saveBtn.disabled) return;

    const toSave = state.rows.filter(r => r.checked && r.word.trim());
    if (toSave.length === 0) {
      App.showToast('단어를 입력해주세요');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';

    const succeededIds = [];
    for (const row of toSave) {
      try {
        await App.addVocabWord(state.lessonId, {
          word: row.word.trim(),
          pinyin: row.pinyin.trim(),
          partOfSpeech: row.partOfSpeech.trim(),
          meaning: row.meaning.trim(),
          example: row.example.trim(),
        });
        succeededIds.push(row.id);
        state.existingWordsLower.add(row.word.trim().toLowerCase());
      } catch (e) {
        // 실패한 항목은 미리보기에 남겨서 사용자가 고쳐서 재시도할 수 있게 한다.
        // (오류 토스트는 App.addVocabWord 내부에서 이미 표시됨)
      }
    }

    if (succeededIds.length > 0) {
      App.showToast(`${succeededIds.length}개 단어가 추가되었어요`);
      state.rows = state.rows.filter(r => !succeededIds.includes(r.id));
      if (state.onImported) await state.onImported();
    }

    if (!state) return; // save 도중 사용자가 모달을 닫았을 수 있음

    if (state.rows.length === 0) {
      close();
      return;
    }

    // 실패했거나 체크 해제됐던 항목만 남아 미리보기를 다시 그림
    // (updateSummary()가 남은 항목 수 기준으로 버튼 텍스트/활성화 상태를 다시 계산함)
    renderRows();
    updateSummary();
  }

  return { open, close };
})();
