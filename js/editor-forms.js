'use strict';

/* ============================================================
   editor-forms.js — 문장 / 단어 / 문법 / 문제 편집 폼 (공용)

   Admin(교재 관리 화면)과 InlineEditor(학습 화면 편집 모드)가
   동일한 폼 마크업·검증·저장 로직을 공유하기 위한 모듈입니다.
   폼을 어디에 그릴지(hostEl)와 저장 후 무엇을 할지(onDone)만
   호출부에서 넘겨주면 됩니다.
   ============================================================ */

const EditorForms = (() => {

  function safeScrollIntoView(el) {
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // 단원 번호(第一课, 第十二课 ...)는 사용자가 직접 입력하지 않고, 같은 소유자(클래스/개인)
  // 안에 이미 있는 단원 수를 세어 자동으로 매긴다.
  const CHINESE_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function toChineseNumeral(n) {
    if (n <= 10) return n === 10 ? '十' : CHINESE_DIGITS[n];
    if (n < 20) return '十' + CHINESE_DIGITS[n % 10];
    if (n < 100) {
      const tens = Math.floor(n / 10);
      const ones = n % 10;
      return CHINESE_DIGITS[tens] + '十' + (ones ? CHINESE_DIGITS[ones] : '');
    }
    return String(n);
  }
  function nextLessonLabel(meta, ownerType, ownerId) {
    const group = meta.groups.find(g => g.ownerType === ownerType && g.ownerId === ownerId);
    const count = group ? group.lessons.length : 0;
    return `第${toChineseNumeral(count + 1)}课`;
  }

  /* ---------------- 문장 폼 ---------------- */

  function renderSentenceForm(hostEl, lessonId, sentence, onDone) {
    hostEl.innerHTML = `
      <div class="admin-card">
        <p class="section-heading">${sentence ? '문장 수정' : '새 문장 추가'}</p>
        <div class="admin-field">
          <label>중국어 문장</label>
          <textarea id="ef-s-chinese" class="zh" rows="2" placeholder="中国人非常重视家庭。">${sentence ? App.escapeHTML(sentence.chinese) : ''}</textarea>
        </div>
        <div class="admin-field">
          <label>병음</label>
          <input type="text" id="ef-s-pinyin" value="${sentence ? App.escapeHTML(sentence.pinyin) : ''}" placeholder="Zhōngguórén fēicháng zhòngshì jiātíng.">
        </div>
        <div class="admin-field">
          <label>한국어 번역</label>
          <textarea id="ef-s-translation" rows="2" placeholder="중국인은 가족을 매우 중요하게 생각한다.">${sentence ? App.escapeHTML(sentence.translation) : ''}</textarea>
        </div>
        <div class="admin-form-actions">
          <button class="btn-primary" id="ef-s-save">저장</button>
          <button class="btn-secondary" id="ef-s-cancel">취소</button>
        </div>
      </div>
    `;

    hostEl.querySelector('#ef-s-cancel').addEventListener('click', () => { hostEl.innerHTML = ''; });
    hostEl.querySelector('#ef-s-save').addEventListener('click', async () => {
      const chinese = hostEl.querySelector('#ef-s-chinese').value.trim();
      const pinyin = hostEl.querySelector('#ef-s-pinyin').value.trim();
      const translation = hostEl.querySelector('#ef-s-translation').value.trim();
      if (!chinese || !pinyin || !translation) {
        App.showToast('모든 항목을 입력해주세요');
        return;
      }
      try {
        if (sentence) {
          await App.updateSentence(lessonId, sentence.id, { chinese, pinyin, translation });
          App.showToast('문장을 수정했습니다');
        } else {
          await App.addSentence(lessonId, { chinese, pinyin, translation });
          App.showToast('문장을 추가했습니다');
        }
      } catch (e) {
        return; // 오류 토스트는 App 계층에서 이미 표시됨
      }
      hostEl.innerHTML = '';
      if (onDone) await onDone();
    });

    safeScrollIntoView(hostEl);
  }

  /* ---------------- 문장 일괄 추가 폼 ---------------- */

  function splitLines(text) {
    return text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
  }

  const BULK_SENTENCE_AI_PROMPT = `너는 지금부터 중국어 지문을 문장 단위로 나누고, 병음과 한국어 번역을 달아서
우리 학습 사이트의 "문장 일괄 추가" 화면에 붙여넣을 수 있는 형식으로
정리하는 역할이야. 아래 규칙을 반드시 지켜줘.

1. 지문을 마침표(。) · 물음표(？) · 느낌표(！) 기준으로 자연스러운
   문장 단위로 나눠줘. 원문을 요약하거나 생략하지 말고, 있는 그대로
   전부 옮겨야 해.

2. 문장 순서는 원문 순서 그대로 유지해줘.

3. 각 문장마다:
   - 중국어 원문 (간체, 원문 그대로)
   - 병음 (성조 표기 포함, 단어 사이 띄어쓰기)
   - 자연스러운 한국어 번역
   을 만들어줘.

4. 결과는 아래처럼 "중국어", "병음", "번역" 세 블록으로 나눠서 출력해줘.
   각 블록 안에서는 문장 하나당 한 줄만 쓰고, 절대 문장 중간에
   줄바꿈하지 마. 세 블록의 줄 수는 반드시 똑같아야 해.

===중국어===
(문장1)
(문장2)
...

===병음===
(문장1 병음)
(문장2 병음)
...

===번역===
(문장1 번역)
(문장2 번역)
...

5. 글자가 흐릿하거나 확실하지 않은 부분은 추측해서 채우지 말고 그 줄에
   "확인 필요"라고 표시해줘.`;

  function showBulkSentenceGuide() {
    const overlay = document.createElement('div');
    overlay.className = 'vpi-overlay';
    overlay.innerHTML = `
      <div class="vpi-panel">
        <div class="vpi-header">
          <p class="vpi-title">문장 붙여넣기 가이드</p>
          <button class="vpi-close" id="bulk-guide-close" aria-label="닫기">&times;</button>
        </div>
        <div class="vpi-body">
          <p class="vpi-hint-text" style="margin-bottom:16px;">
            아래 세 칸에 <strong>중국어·병음·번역을 한 줄에 한 문장씩</strong> 붙여넣으세요.
            세 칸의 줄 수가 정확히 같아야 하고, 같은 줄 번호끼리 한 문장으로 묶입니다.
            문장 하나가 중간에 줄바꿈되면 그 뒤 모든 문장이 밀려서 어긋나니 한 문장은
            반드시 한 줄로만 써주세요. 완전히 빈 줄은 자동으로 무시됩니다.
          </p>
          <p class="section-heading" style="font-size:13.5px;">AI에게 정리해달라고 요청하기</p>
          <p class="vpi-hint-text" style="margin-bottom:10px;">
            중국어 지문(사진 또는 텍스트)이 있다면, 직접 문장을 나누고 병음·번역을
            달지 않아도 됩니다. AI(Claude, ChatGPT 등)에게 지문과 함께 아래 프롬프트를
            그대로 주면 이 화면에 바로 붙여넣을 수 있게 정리해줍니다.
          </p>
          <div class="admin-field">
            <textarea id="bulk-guide-prompt" rows="10" readonly>${App.escapeHTML(BULK_SENTENCE_AI_PROMPT)}</textarea>
          </div>
          <p class="vpi-hint-text" style="margin-top:8px;">
            AI 답변에서 <code>===중국어===</code> ~ <code>===번역===</code> 사이의 내용만
            각각 복사해서 위 세 칸에 붙여넣으면 됩니다.
          </p>
          <div class="admin-form-actions" style="margin-top:16px;">
            <button class="btn-primary" id="bulk-guide-copy">프롬프트 복사</button>
            <button class="btn-secondary" id="bulk-guide-close-2">닫기</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    };
    function onKeyDown(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKeyDown);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#bulk-guide-close').addEventListener('click', close);
    overlay.querySelector('#bulk-guide-close-2').addEventListener('click', close);
    overlay.querySelector('#bulk-guide-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(BULK_SENTENCE_AI_PROMPT);
        App.showToast('프롬프트를 복사했습니다');
      } catch (e) {
        const textarea = overlay.querySelector('#bulk-guide-prompt');
        textarea.focus();
        textarea.select();
        App.showToast('자동 복사에 실패했습니다. 직접 선택해서 복사해주세요');
      }
    });
  }

  function renderBulkSentenceForm(hostEl, lessonId, onDone) {
    hostEl.innerHTML = `
      <div class="admin-card">
        <div class="admin-lesson-header-row">
          <p class="section-heading" style="margin:0;">문장 일괄 추가</p>
          <button class="icon-text-btn" id="ef-bulk-guide-btn">가이드 보기</button>
        </div>
        <p class="admin-row-sub" style="margin-bottom:14px;">중국어·병음·번역을 각각 줄바꿈으로 구분해서 붙여넣으세요. 세 칸의 줄 수가 서로 같아야 하며, 같은 줄 번호끼리 한 문장으로 묶입니다.</p>
        <div class="admin-field">
          <label>중국어 (한 줄에 한 문장)</label>
          <textarea id="ef-bulk-chinese" class="zh" rows="6" placeholder="中国人非常重视家庭。&#10;家庭观念在中国文化中很重要。"></textarea>
        </div>
        <div class="admin-field">
          <label>병음 (한 줄에 한 문장)</label>
          <textarea id="ef-bulk-pinyin" rows="6" placeholder="Zhōngguórén fēicháng zhòngshì jiātíng.&#10;Jiātíng guānniàn zài Zhōngguó wénhuà zhōng hěn zhòngyào."></textarea>
        </div>
        <div class="admin-field">
          <label>한국어 번역 (한 줄에 한 문장)</label>
          <textarea id="ef-bulk-translation" rows="6" placeholder="중국인은 가족을 매우 중요하게 생각한다.&#10;가족관념은 중국 문화에서 매우 중요하다."></textarea>
        </div>
        <div class="admin-form-actions">
          <button class="btn-primary" id="ef-bulk-save">일괄 추가</button>
          <button class="btn-secondary" id="ef-bulk-cancel">취소</button>
        </div>
      </div>
    `;

    hostEl.querySelector('#ef-bulk-guide-btn').addEventListener('click', showBulkSentenceGuide);
    hostEl.querySelector('#ef-bulk-cancel').addEventListener('click', () => { hostEl.innerHTML = ''; });
    hostEl.querySelector('#ef-bulk-save').addEventListener('click', async () => {
      const chineseLines = splitLines(hostEl.querySelector('#ef-bulk-chinese').value);
      const pinyinLines = splitLines(hostEl.querySelector('#ef-bulk-pinyin').value);
      const translationLines = splitLines(hostEl.querySelector('#ef-bulk-translation').value);

      if (chineseLines.length === 0) {
        App.showToast('중국어 문장을 입력해주세요');
        return;
      }
      if (chineseLines.length !== pinyinLines.length || chineseLines.length !== translationLines.length) {
        App.showToast(`줄 수가 서로 다릅니다 (중국어 ${chineseLines.length} / 병음 ${pinyinLines.length} / 번역 ${translationLines.length})`);
        return;
      }

      const saveBtn = hostEl.querySelector('#ef-bulk-save');
      saveBtn.disabled = true;
      let successCount = 0;
      for (let i = 0; i < chineseLines.length; i++) {
        try {
          await App.addSentence(lessonId, {
            chinese: chineseLines[i],
            pinyin: pinyinLines[i],
            translation: translationLines[i],
          });
          successCount++;
        } catch (e) {
          // 개별 실패는 건너뛰고 계속 진행 (App 계층에서 이미 오류 토스트 표시됨)
        }
      }

      hostEl.innerHTML = '';
      App.showToast(`${successCount}/${chineseLines.length}개 문장을 추가했습니다`);
      if (onDone) await onDone();
    });

    safeScrollIntoView(hostEl);
  }

  /* ---------------- 단어 폼 ---------------- */

  function renderVocabForm(hostEl, lessonId, word, onDone) {
    hostEl.innerHTML = `
      <div class="admin-card">
        <p class="section-heading">${word ? '단어 수정' : '새 단어 추가'}</p>
        <div class="admin-field-row">
          <div class="admin-field">
            <label>단어</label>
            <input type="text" id="ef-v-word" class="zh" value="${word ? App.escapeHTML(word.word) : ''}" placeholder="家庭" ${word ? 'disabled' : ''}>
          </div>
          <div class="admin-field">
            <label>병음</label>
            <input type="text" id="ef-v-pinyin" value="${word ? App.escapeHTML(word.pinyin) : ''}" placeholder="jiātíng">
          </div>
        </div>
        <div class="admin-field-row">
          <div class="admin-field">
            <label>품사</label>
            <input type="text" id="ef-v-pos" value="${word ? App.escapeHTML(word.partOfSpeech) : ''}" placeholder="명사">
          </div>
          <div class="admin-field">
            <label>뜻</label>
            <input type="text" id="ef-v-meaning" value="${word ? App.escapeHTML(word.meaning) : ''}" placeholder="가정, 가족">
          </div>
        </div>
        <div class="admin-field">
          <label>예문 (중국어)</label>
          <input type="text" id="ef-v-example" class="zh" value="${word ? App.escapeHTML(word.example || '') : ''}" placeholder="中国人的家庭观念和西方人有一些不同。">
        </div>
        <div class="admin-form-actions">
          <button class="btn-primary" id="ef-v-save">저장</button>
          <button class="btn-secondary" id="ef-v-cancel">취소</button>
        </div>
      </div>
    `;

    hostEl.querySelector('#ef-v-cancel').addEventListener('click', () => { hostEl.innerHTML = ''; });
    hostEl.querySelector('#ef-v-save').addEventListener('click', async () => {
      const wordText = hostEl.querySelector('#ef-v-word').value.trim();
      const pinyin = hostEl.querySelector('#ef-v-pinyin').value.trim();
      const partOfSpeech = hostEl.querySelector('#ef-v-pos').value.trim();
      const meaning = hostEl.querySelector('#ef-v-meaning').value.trim();
      const example = hostEl.querySelector('#ef-v-example').value.trim();

      if (!wordText || !pinyin || !partOfSpeech || !meaning) {
        App.showToast('예문을 제외한 모든 항목을 입력해주세요');
        return;
      }

      try {
        if (word) {
          await App.updateVocabWord(lessonId, word.id, { pinyin, partOfSpeech, meaning, example });
          App.showToast('단어를 수정했습니다');
        } else {
          const lesson = await App.getLesson(lessonId);
          const exists = lesson.vocabulary.some(v => v.word === wordText);
          if (exists) {
            App.showToast('이미 등록된 단어입니다');
            return;
          }
          await App.addVocabWord(lessonId, { word: wordText, pinyin, partOfSpeech, meaning, example });
          App.showToast('단어를 추가했습니다');
        }
      } catch (e) {
        return; // 오류 토스트는 App 계층에서 이미 표시됨
      }
      hostEl.innerHTML = '';
      if (onDone) await onDone();
    });

    safeScrollIntoView(hostEl);
  }

  /* ---------------- 문법 폼 ---------------- */

  function renderGrammarForm(hostEl, lessonId, grammar, onDone) {
    hostEl.innerHTML = `
      <div class="admin-card">
        <p class="section-heading">${grammar ? '문법 수정' : '새 문법 추가'}</p>
        <div class="admin-field">
          <label>제목 (예: "和" — ~와, ~과)</label>
          <input type="text" id="ef-g-title" value="${grammar ? App.escapeHTML(grammar.title) : ''}" placeholder="&quot;和&quot; — ~와, ~과">
        </div>
        <div class="admin-field">
          <label>설명</label>
          <textarea id="ef-g-desc" rows="2" placeholder="두 명사나 대상을 연결할 때 사용하는 표현입니다.">${grammar ? App.escapeHTML(grammar.description) : ''}</textarea>
        </div>
        <div class="admin-field">
          <label>예문 (중국어)</label>
          <input type="text" id="ef-g-example" class="zh" value="${grammar ? App.escapeHTML(grammar.example) : ''}" placeholder="中国人的家庭观念和西方人有一些不同。">
        </div>
        <div class="admin-field">
          <label>예문 번역</label>
          <input type="text" id="ef-g-translation" value="${grammar ? App.escapeHTML(grammar.translation) : ''}" placeholder="중국인의 가족관념은 서양인과 조금 다르다.">
        </div>
        <div class="admin-form-actions">
          <button class="btn-primary" id="ef-g-save">저장</button>
          <button class="btn-secondary" id="ef-g-cancel">취소</button>
        </div>
      </div>
    `;

    hostEl.querySelector('#ef-g-cancel').addEventListener('click', () => { hostEl.innerHTML = ''; });
    hostEl.querySelector('#ef-g-save').addEventListener('click', async () => {
      const title = hostEl.querySelector('#ef-g-title').value.trim();
      const description = hostEl.querySelector('#ef-g-desc').value.trim();
      const example = hostEl.querySelector('#ef-g-example').value.trim();
      const translation = hostEl.querySelector('#ef-g-translation').value.trim();

      if (!title || !description || !example || !translation) {
        App.showToast('모든 항목을 입력해주세요');
        return;
      }

      try {
        if (grammar) {
          await App.updateGrammar(lessonId, grammar.id, { title, description, example, translation });
          App.showToast('문법 항목을 수정했습니다');
        } else {
          await App.addGrammar(lessonId, { title, description, example, translation });
          App.showToast('문법 항목을 추가했습니다');
        }
      } catch (e) {
        return; // 오류 토스트는 App 계층에서 이미 표시됨
      }
      hostEl.innerHTML = '';
      if (onDone) await onDone();
    });

    safeScrollIntoView(hostEl);
  }

  /* ---------------- 문제 폼 ---------------- */

  function renderQuizForm(hostEl, lessonId, quiz, onDone) {
    const options = quiz ? quiz.options : ['', '', '', ''];

    hostEl.innerHTML = `
      <div class="admin-card">
        <p class="section-heading">${quiz ? '문제 수정' : '새 문제 추가'}</p>
        <div class="admin-field">
          <label>질문</label>
          <input type="text" id="ef-q-question" value="${quiz ? App.escapeHTML(quiz.question) : ''}" placeholder="&quot;家庭&quot;의 뜻은?">
        </div>
        <div class="admin-field">
          <label>보기 (정답 앞의 라디오 버튼을 선택하세요)</label>
          <div class="admin-quiz-options">
            ${options.map((opt, i) => `
              <div class="admin-quiz-option-row">
                <input type="radio" name="ef-q-answer" value="${i}" ${quiz && quiz.answerIndex === i ? 'checked' : (!quiz && i === 1 ? 'checked' : '')}>
                <input type="text" class="ef-q-opt-input" data-index="${i}" value="${App.escapeHTML(opt)}" placeholder="보기 ${i + 1}">
              </div>
            `).join('')}
          </div>
        </div>
        <div class="admin-field">
          <label>해설</label>
          <input type="text" id="ef-q-explanation" value="${quiz ? App.escapeHTML(quiz.explanation) : ''}" placeholder="家庭 = 가정, 가족">
        </div>
        <div class="admin-form-actions">
          <button class="btn-primary" id="ef-q-save">저장</button>
          <button class="btn-secondary" id="ef-q-cancel">취소</button>
        </div>
      </div>
    `;

    hostEl.querySelector('#ef-q-cancel').addEventListener('click', () => { hostEl.innerHTML = ''; });
    hostEl.querySelector('#ef-q-save').addEventListener('click', async () => {
      const question = hostEl.querySelector('#ef-q-question').value.trim();
      const explanation = hostEl.querySelector('#ef-q-explanation').value.trim();
      const optInputs = hostEl.querySelectorAll('.ef-q-opt-input');
      const newOptions = Array.from(optInputs).map(inp => inp.value.trim());
      const answerRadio = hostEl.querySelector('input[name="ef-q-answer"]:checked');

      if (!question || !explanation || newOptions.some(o => !o) || !answerRadio) {
        App.showToast('모든 항목을 입력하고 정답을 선택해주세요');
        return;
      }

      const answerIndex = Number(answerRadio.value);
      const data = { question, options: newOptions, answerIndex, explanation };

      try {
        if (quiz) {
          await App.updateQuiz(lessonId, quiz.id, data);
          App.showToast('문제를 수정했습니다');
        } else {
          await App.addQuiz(lessonId, data);
          App.showToast('문제를 추가했습니다');
        }
      } catch (e) {
        return; // 오류 토스트는 App 계층에서 이미 표시됨
      }
      hostEl.innerHTML = '';
      if (onDone) await onDone();
    });

    safeScrollIntoView(hostEl);
  }

  /* ---------------- 단원 정보 폼 (제목류) ---------------- */

  async function renderLessonMetaForm(hostEl, lesson, onDone) {
    // 교사가 새 단원을 만들 때는 담당 클래스 중 하나를 골라야 하지만,
    // 학생은 자기 개인 단원 영역 하나뿐이라 고를 필요가 없다.
    const user = App.getCurrentUser();
    const isTeacher = user && user.role === 'teacher';
    const showClassSelect = !lesson && isTeacher;

    hostEl.innerHTML = `
      <div class="admin-card">
        <p class="section-heading">${lesson ? '단원 정보 수정' : '새 단원 추가'}</p>
        ${showClassSelect ? `
          <div class="admin-field">
            <label>클래스</label>
            <select id="ef-l-class"><option value="">불러오는 중...</option></select>
          </div>
        ` : ''}
        <div class="admin-field">
          <label>중국어 제목</label>
          <input type="text" id="ef-l-chinese" class="zh" value="${lesson ? App.escapeHTML(lesson.chineseTitle) : ''}" placeholder="中国的节日">
        </div>
        <div class="admin-field">
          <label>한국어 제목</label>
          <input type="text" id="ef-l-korean" value="${lesson ? App.escapeHTML(lesson.koreanTitle) : ''}" placeholder="중국의 명절">
        </div>
        <div class="admin-form-actions">
          <button class="btn-primary" id="ef-l-save">저장</button>
          <button class="btn-secondary" id="ef-l-cancel">취소</button>
        </div>
      </div>
    `;

    if (showClassSelect) {
      loadClassOptions(hostEl.querySelector('#ef-l-class'));
    }

    hostEl.querySelector('#ef-l-cancel').addEventListener('click', () => { hostEl.innerHTML = ''; if (onDone) onDone(true); });
    hostEl.querySelector('#ef-l-save').addEventListener('click', async () => {
      const chineseTitle = hostEl.querySelector('#ef-l-chinese').value.trim();
      const koreanTitle = hostEl.querySelector('#ef-l-korean').value.trim();

      if (!chineseTitle || !koreanTitle) {
        App.showToast('모든 항목을 입력해주세요');
        return;
      }

      let newId = null;
      try {
        if (lesson) {
          await App.updateLessonMeta(lesson.id, { title: lesson.title, chineseTitle, koreanTitle });
          App.showToast('단원 정보를 수정했습니다');
        } else if (showClassSelect) {
          const select = hostEl.querySelector('#ef-l-class');
          if (!select || !select.value) {
            App.showToast('먼저 클래스를 만들어야 단원을 추가할 수 있습니다');
            return;
          }
          const ownerId = Number(select.value);
          const meta = await App.getLessonsMeta();
          const title = nextLessonLabel(meta, 'class', ownerId);
          newId = await App.addLesson({ title, chineseTitle, koreanTitle, ownerType: 'class', ownerId });
          App.showToast('새 단원을 추가했습니다');
        } else {
          const meta = await App.getLessonsMeta();
          const title = nextLessonLabel(meta, 'student', user.id);
          newId = await App.addLesson({ title, chineseTitle, koreanTitle, ownerType: 'student', ownerId: user.id });
          App.showToast('새 단원을 추가했습니다');
        }
      } catch (e) {
        return; // 오류 토스트는 App 계층에서 이미 표시됨
      }
      hostEl.innerHTML = '';
      if (onDone) await onDone(false, newId);
    });

    safeScrollIntoView(hostEl);
  }

  async function loadClassOptions(selectEl) {
    try {
      const { classes } = await Api.classes.list();
      if (!classes || classes.length === 0) {
        selectEl.innerHTML = `<option value="">(클래스 없음 — 먼저 클래스를 만들어주세요)</option>`;
        selectEl.disabled = true;
        return;
      }
      selectEl.innerHTML = classes.map(c => `<option value="${c.id}">${App.escapeHTML(c.name)}</option>`).join('');
    } catch (e) {
      selectEl.innerHTML = `<option value="">(클래스 목록을 불러오지 못했습니다)</option>`;
      selectEl.disabled = true;
    }
  }

  return {
    renderSentenceForm, renderBulkSentenceForm, renderVocabForm, renderGrammarForm, renderQuizForm, renderLessonMetaForm,
    safeScrollIntoView,
  };
})();
