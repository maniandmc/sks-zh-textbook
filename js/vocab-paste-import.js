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

  /* ---------------- 1단계: 붙여넣기 화면 ---------------- */

  function renderPasteStep() {
    const overlay = state.overlayEl;
    overlay.innerHTML = `
      <div class="vpi-panel" role="dialog" aria-modal="true" aria-label="단어 표 붙여넣기">
        <div class="vpi-header">
          <p class="vpi-title">${App.ICONS.plus} 단어 표 붙여넣기</p>
          <button class="vpi-close" id="vpi-close" aria-label="닫기">×</button>
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
