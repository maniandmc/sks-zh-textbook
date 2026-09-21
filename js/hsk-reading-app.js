'use strict';

/* ============================================================
   hsk-reading-app.js — HSK 독해 페이지의 클래스/단원 탐색 + 편집
   화면 흐름: 클래스 목록 → (그 클래스의) 단원 목록 → 단원 보기
             (교사는 단원 보기에서 "편집"으로 그룹/문제를 관리)
   실제 시험지 렌더링은 hsk-reading.js의 HskReading.render()를 그대로 재사용한다.
   ============================================================ */

const HskApp = (() => {

  let currentUser = null;
  let currentClass = null;
  let currentUnitId = null;

  // HSK 2.0 5급 독해의 고정 구성: 단어 빈칸 고르기 → 내용일치 → 독해.
  const PART_LABELS = { 1: '단어 빈칸 고르기', 2: '내용일치', 3: '독해' };
  const PART_RANGE_HINTS = {
    1: '예: 46-48 (46~60번, 지문 하나에 문제 3개씩)',
    2: '예: 61 (61~70번, 지문 하나에 문제 1개)',
    3: '예: 71-74 (71~90번, 지문 하나에 문제 4개)',
  };

  function appRoot() { return document.getElementById('hsk-app-root'); }
  function examNav() { return document.getElementById('hsk-exam-nav'); }
  function examRoot() { return document.getElementById('exam-root'); }
  function toolbar() { return document.getElementById('hsk-toolbar'); }

  function showAppScreen() {
    appRoot().style.display = '';
    examNav().style.display = 'none';
    toolbar().style.display = 'none';
    examRoot().style.display = 'none';
  }

  function showExamScreen() {
    appRoot().style.display = 'none';
    examNav().style.display = '';
    toolbar().style.display = '';
    examRoot().style.display = '';
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function start(user) {
    currentUser = user;
    showClassList();
  }

  /* ================= 화면 1: 클래스 목록 ================= */

  async function showClassList() {
    showAppScreen();
    const root = appRoot();
    root.innerHTML = `<div class="content-inner"><p class="vocab-empty">불러오는 중...</p></div>`;

    let data;
    try {
      data = await Api.classes.list();
    } catch (err) {
      root.innerHTML = `<div class="content-inner"><p class="vocab-empty">클래스 목록을 불러오지 못했습니다</p></div>`;
      return;
    }

    const isTeacher = data.role === 'teacher';
    const rows = data.classes.map(c => `
      <div class="admin-row hsk-clickable-row" data-class-id="${c.id}">
        <div class="admin-row-main">
          <p class="admin-row-zh">${escapeHTML(c.name)}</p>
          <p class="admin-row-sub">${isTeacher
            ? `참여 코드: ${escapeHTML(c.join_code)} · 학생 ${c.student_count}명`
            : `담당 교사: ${escapeHTML(c.teacher_name)}`}</p>
        </div>
      </div>
    `).join('');

    root.innerHTML = `
      <div class="content-inner">
        <div class="page-header">
          <h1>HSK 독해</h1>
          <p>클래스를 선택하면 그 클래스의 HSK 단원을 볼 수 있습니다.</p>
        </div>
        <div class="admin-list">${rows || '<p class="vocab-empty">아직 클래스가 없습니다</p>'}</div>
        ${isTeacher ? `
          <div class="admin-add-btn-row">
            <button class="btn-primary admin-add-btn" id="btn-add-class">+ 새 클래스</button>
          </div>
          <div id="class-form-host"></div>
        ` : ''}
      </div>
    `;

    root.querySelectorAll('[data-class-id]').forEach(row => {
      row.addEventListener('click', () => {
        const cls = data.classes.find(c => c.id === Number(row.dataset.classId));
        showUnitList(cls, isTeacher);
      });
    });

    const addBtn = root.querySelector('#btn-add-class');
    if (addBtn) {
      addBtn.addEventListener('click', () => renderClassForm(root.querySelector('#class-form-host')));
    }
  }

  function renderClassForm(host) {
    host.innerHTML = `
      <div class="admin-card">
        <div class="admin-field">
          <label for="class-name-input">클래스 이름</label>
          <input type="text" id="class-name-input" placeholder="예: HSK5 반">
        </div>
        <p class="login-error" id="class-form-error"></p>
        <div class="admin-form-actions">
          <button class="btn-primary" id="class-form-save">만들기</button>
          <button class="btn-secondary" id="class-form-cancel">취소</button>
        </div>
      </div>
    `;
    host.querySelector('#class-form-cancel').addEventListener('click', () => { host.innerHTML = ''; });
    host.querySelector('#class-form-save').addEventListener('click', async () => {
      const name = host.querySelector('#class-name-input').value.trim();
      const errorEl = host.querySelector('#class-form-error');
      if (!name) { errorEl.textContent = '클래스 이름을 입력해주세요'; return; }
      try {
        await Api.classes.create(name);
      } catch (err) {
        errorEl.textContent = err.message || '클래스 생성에 실패했습니다';
        return;
      }
      showClassList();
    });
  }

  /* ================= 화면 2: 단원 목록 ================= */

  async function showUnitList(cls) {
    currentClass = cls;
    showAppScreen();
    const root = appRoot();
    root.innerHTML = `<div class="content-inner"><p class="vocab-empty">불러오는 중...</p></div>`;

    let data;
    try {
      data = await Api.hskUnits.list(cls.id);
    } catch (err) {
      root.innerHTML = `<div class="content-inner"><p class="vocab-empty">단원 목록을 불러오지 못했습니다</p></div>`;
      return;
    }

    const rows = data.units.map(u => `
      <div class="admin-row">
        <div class="admin-row-main hsk-clickable-row" data-unit-id="${u.id}">
          <p class="admin-row-zh">${escapeHTML(u.title)}</p>
        </div>
        ${data.canWrite ? `
          <div class="admin-row-actions">
            <button class="icon-text-btn" data-rename-id="${u.id}">이름 변경</button>
            <button class="icon-text-btn danger" data-delete-id="${u.id}">삭제</button>
          </div>
        ` : ''}
      </div>
    `).join('');

    root.innerHTML = `
      <div class="content-inner">
        <button class="icon-text-btn" id="btn-back-to-classes">← 클래스 목록</button>
        <div class="page-header">
          <h1>${escapeHTML(cls.name)} — HSK 단원</h1>
        </div>
        <div class="admin-list">${rows || '<p class="vocab-empty">아직 단원이 없습니다</p>'}</div>
        ${data.canWrite ? `
          <div class="admin-add-btn-row">
            <button class="btn-primary admin-add-btn" id="btn-add-unit">+ 새 단원</button>
          </div>
          <div id="unit-form-host"></div>
        ` : ''}
      </div>
    `;

    root.querySelector('#btn-back-to-classes').addEventListener('click', showClassList);

    root.querySelectorAll('[data-unit-id]').forEach(el => {
      el.addEventListener('click', () => showUnitView(Number(el.dataset.unitId)));
    });

    root.querySelectorAll('[data-rename-id]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const unit = data.units.find(u => u.id === Number(btn.dataset.renameId));
        const nextTitle = prompt('새 단원 이름을 입력해주세요', unit.title);
        if (!nextTitle || !nextTitle.trim()) return;
        try {
          await Api.hskUnits.update(unit.id, nextTitle.trim());
        } catch (err) {
          alert(err.message || '이름 변경에 실패했습니다');
          return;
        }
        showUnitList(cls);
      });
    });

    root.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const unit = data.units.find(u => u.id === Number(btn.dataset.deleteId));
        if (!confirm(`"${unit.title}" 단원을 삭제하시겠습니까? 안의 모든 문제도 함께 삭제됩니다.`)) return;
        try {
          await Api.hskUnits.remove(unit.id);
        } catch (err) {
          alert(err.message || '삭제에 실패했습니다');
          return;
        }
        showUnitList(cls);
      });
    });

    const addBtn = root.querySelector('#btn-add-unit');
    if (addBtn) {
      addBtn.addEventListener('click', () => renderUnitForm(root.querySelector('#unit-form-host'), cls));
    }
  }

  function renderUnitForm(host, cls) {
    host.innerHTML = `
      <div class="admin-card">
        <div class="admin-field">
          <label for="unit-title-input">단원 이름</label>
          <input type="text" id="unit-title-input" placeholder="예: 1단원">
        </div>
        <p class="login-error" id="unit-form-error"></p>
        <div class="admin-form-actions">
          <button class="btn-primary" id="unit-form-save">만들기</button>
          <button class="btn-secondary" id="unit-form-cancel">취소</button>
        </div>
      </div>
    `;
    host.querySelector('#unit-form-cancel').addEventListener('click', () => { host.innerHTML = ''; });
    host.querySelector('#unit-form-save').addEventListener('click', async () => {
      const title = host.querySelector('#unit-title-input').value.trim();
      const errorEl = host.querySelector('#unit-form-error');
      if (!title) { errorEl.textContent = '단원 이름을 입력해주세요'; return; }
      try {
        await Api.hskUnits.create(cls.id, title);
      } catch (err) {
        errorEl.textContent = err.message || '단원 생성에 실패했습니다';
        return;
      }
      showUnitList(cls);
    });
  }

  /* ================= 화면 3: 단원 보기 (실제 시험지) ================= */

  async function showUnitView(unitId) {
    currentUnitId = unitId;
    let unit;
    try {
      unit = await Api.hskUnits.get(unitId);
    } catch (err) {
      alert(err.message || '단원을 불러오지 못했습니다');
      showUnitList(currentClass);
      return;
    }

    showExamScreen();
    examNav().innerHTML = `
      <div class="hsk-exam-nav-inner">
        <button class="icon-text-btn" id="btn-back-to-units">← 단원 목록</button>
        <span class="hsk-exam-nav-title">${escapeHTML(unit.title)}</span>
        ${unit.canWrite ? `<button class="icon-text-btn" id="btn-edit-unit">편집</button>` : '<span></span>'}
      </div>
    `;
    document.getElementById('btn-back-to-units').addEventListener('click', () => showUnitList(currentClass));
    if (unit.canWrite) {
      document.getElementById('btn-edit-unit').addEventListener('click', () => showUnitEdit(unitId));
    }

    if (unit.parts.length === 0) {
      examRoot().innerHTML = `<p class="hsk-exam-empty">아직 등록된 문제가 없습니다.</p>`;
    } else {
      HskReading.render(examRoot(), unit.parts);
    }
  }

  /* ================= 화면 4: 단원 편집 (교사) ================= */

  async function showUnitEdit(unitId) {
    currentUnitId = unitId;
    showAppScreen();
    const root = appRoot();
    root.innerHTML = `<div class="content-inner"><p class="vocab-empty">불러오는 중...</p></div>`;

    let unit;
    try {
      unit = await Api.hskUnits.get(unitId);
    } catch (err) {
      root.innerHTML = `<div class="content-inner"><p class="vocab-empty">단원을 불러오지 못했습니다</p></div>`;
      return;
    }

    if (!unit.canWrite) {
      showUnitView(unitId);
      return;
    }

    // HSK 5급 독해는 항상 이 3부분으로 구성되므로, 아직 그룹이 없어도 3개 섹션을 고정으로 보여준다.
    const partsByNumber = new Map(unit.parts.map(p => [p.part, p]));
    const sectionsHTML = [1, 2, 3]
      .map(partNum => partsByNumber.get(partNum) || { part: partNum, groups: [] })
      .map(renderPartSection)
      .join('');

    root.innerHTML = `
      <div class="content-inner">
        <button class="icon-text-btn" id="btn-back-to-view">← 미리보기로</button>
        <div class="page-header">
          <h1>${escapeHTML(unit.title)} 편집</h1>
          <p>HSK 5급 독해는 <strong>단어 빈칸 고르기 → 내용일치 → 독해</strong> 세 부분으로 고정되어 있습니다. 각 부분 아래에서 지문 그룹과 문제를 추가하세요.</p>
        </div>
        <div id="groups-container">${sectionsHTML}</div>
      </div>
    `;

    root.querySelector('#btn-back-to-view').addEventListener('click', () => showUnitView(unitId));
    wireGroupAndQuestionActions(root, unit);
    wireAddGroupButtons(root, unitId);
  }

  function renderPartSection(partData) {
    const groupsHTML = partData.groups.map(g => renderGroupCard(g, partData.part)).join('');
    const label = PART_LABELS[partData.part];
    return `
      <div class="hsk-part-section">
        <h2 class="hsk-part-section-title">제${partData.part}부분 — ${escapeHTML(label)}</h2>
        ${groupsHTML || '<p class="vocab-empty">아직 등록된 그룹이 없습니다</p>'}
        <div class="admin-add-btn-row">
          <button class="icon-text-btn" data-add-group-part="${partData.part}">+ ${escapeHTML(label)}에 그룹 추가</button>
        </div>
        <div id="group-form-host-part-${partData.part}"></div>
      </div>
    `;
  }

  function wireAddGroupButtons(root, unitId) {
    root.querySelectorAll('[data-add-group-part]').forEach(btn => {
      btn.addEventListener('click', () => {
        const part = Number(btn.dataset.addGroupPart);
        renderGroupForm(document.getElementById(`group-form-host-part-${part}`), unitId, null, part);
      });
    });
  }

  function renderGroupCard(group, part) {
    const questionsHTML = group.questions.map(q => `
      <div class="admin-row">
        <div class="admin-row-main">
          <p class="admin-row-sub"><strong>${q.no}.</strong> ${escapeHTML(q.text || '')} ${q.options.map((o, i) => `${'ABCD'[i]}.${escapeHTML(o)}${i === q.answerIndex ? ' ✓' : ''}`).join('  ')}</p>
        </div>
        <div class="admin-row-actions">
          <button class="icon-text-btn" data-edit-question="${q.id}" data-group-id="${group.id}">수정</button>
          <button class="icon-text-btn danger" data-delete-question="${q.id}" data-group-id="${group.id}">삭제</button>
        </div>
      </div>
    `).join('');

    return `
      <div class="admin-card" data-group-card="${group.id}">
        <div class="admin-lesson-header-row">
          <div class="admin-row-main">
            <p class="admin-row-zh">${escapeHTML(group.range)}.</p>
            <p class="admin-row-sub">${escapeHTML(group.passage)}</p>
          </div>
          <div class="admin-lesson-header-actions">
            <button class="icon-text-btn" data-edit-group="${group.id}" data-part="${part}">수정</button>
            <button class="icon-text-btn danger" data-delete-group="${group.id}">삭제</button>
          </div>
        </div>
        <div class="admin-list" style="margin-top:12px;">${questionsHTML}</div>
        <div class="admin-add-btn-row">
          <button class="icon-text-btn" data-add-question="${group.id}">+ 문제 추가</button>
        </div>
        <div id="question-form-host-${group.id}"></div>
      </div>
    `;
  }

  function wireGroupAndQuestionActions(root, unit) {
    root.querySelectorAll('[data-edit-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        const groupId = Number(btn.dataset.editGroup);
        const part = Number(btn.dataset.part);
        const group = unit.parts.find(p => p.part === part).groups.find(g => g.id === groupId);
        const card = root.querySelector(`[data-group-card="${groupId}"]`);
        renderGroupForm(card, unit.id, group, part);
      });
    });

    root.querySelectorAll('[data-delete-group]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('이 그룹(지문)을 삭제하시겠습니까? 안의 문제도 함께 삭제됩니다.')) return;
        try {
          await Api.hskUnits.removeGroup(unit.id, Number(btn.dataset.deleteGroup));
        } catch (err) {
          alert(err.message || '삭제에 실패했습니다');
          return;
        }
        showUnitEdit(unit.id);
      });
    });

    root.querySelectorAll('[data-add-question]').forEach(btn => {
      btn.addEventListener('click', () => {
        const groupId = Number(btn.dataset.addQuestion);
        renderQuestionForm(document.getElementById(`question-form-host-${groupId}`), unit.id, groupId, null);
      });
    });

    root.querySelectorAll('[data-edit-question]').forEach(btn => {
      btn.addEventListener('click', () => {
        const groupId = Number(btn.dataset.groupId);
        const questionId = Number(btn.dataset.editQuestion);
        const group = findGroupById(unit, groupId);
        const question = group.questions.find(q => q.id === questionId);
        renderQuestionForm(document.getElementById(`question-form-host-${groupId}`), unit.id, groupId, question);
      });
    });

    root.querySelectorAll('[data-delete-question]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('이 문제를 삭제하시겠습니까?')) return;
        const groupId = Number(btn.dataset.groupId);
        try {
          await Api.hskUnits.removeQuestion(unit.id, groupId, Number(btn.dataset.deleteQuestion));
        } catch (err) {
          alert(err.message || '삭제에 실패했습니다');
          return;
        }
        showUnitEdit(unit.id);
      });
    });
  }

  function findGroupById(unit, groupId) {
    for (const p of unit.parts) {
      const g = p.groups.find(g => g.id === groupId);
      if (g) return g;
    }
    return null;
  }

  function renderGroupForm(host, unitId, group, fixedPart) {
    const isEdit = !!group;
    const part = fixedPart;
    host.innerHTML = `
      <div class="admin-card">
        <p class="admin-row-sub">부분: <strong>제${part}부분 — ${escapeHTML(PART_LABELS[part])}</strong></p>
        <div class="admin-field">
          <label for="group-range-input">문제 번호 (${escapeHTML(PART_RANGE_HINTS[part])})</label>
          <input type="text" id="group-range-input" value="${group ? escapeHTML(group.range) : ''}">
        </div>
        <div class="admin-field">
          <label for="group-passage-input">지문 (빈칸은 {46} 처럼 중괄호로 표시)</label>
          <textarea id="group-passage-input" rows="5">${group ? escapeHTML(group.passage) : ''}</textarea>
        </div>
        ${part === 3 ? `
          <div class="admin-field">
            <label for="group-image-input">삽화 이미지 URL (선택)</label>
            <input type="text" id="group-image-input" value="${group && group.image ? escapeHTML(group.image) : ''}">
          </div>
        ` : ''}
        <p class="login-error" id="group-form-error"></p>
        <div class="admin-form-actions">
          <button class="btn-primary" id="group-form-save">${isEdit ? '저장' : '추가'}</button>
          <button class="btn-secondary" id="group-form-cancel">취소</button>
        </div>
      </div>
    `;
    host.querySelector('#group-form-cancel').addEventListener('click', () => showUnitEdit(unitId));
    host.querySelector('#group-form-save').addEventListener('click', async () => {
      const errorEl = host.querySelector('#group-form-error');
      const imageInput = host.querySelector('#group-image-input');
      const data = {
        part,
        range: host.querySelector('#group-range-input').value.trim(),
        passage: host.querySelector('#group-passage-input').value.trim(),
        image: imageInput ? imageInput.value.trim() : '',
      };
      try {
        if (isEdit) {
          await Api.hskUnits.updateGroup(unitId, group.id, data);
        } else {
          await Api.hskUnits.createGroup(unitId, data);
        }
      } catch (err) {
        errorEl.textContent = err.message || '저장에 실패했습니다';
        return;
      }
      showUnitEdit(unitId);
    });
  }

  function renderQuestionForm(host, unitId, groupId, question) {
    const isEdit = !!question;
    const opts = question ? question.options : ['', '', '', ''];
    const answerIndex = question ? question.answerIndex : null;
    const labels = ['A', 'B', 'C', 'D'];
    host.innerHTML = `
      <div class="admin-card">
        <div class="admin-field-row">
          <div class="admin-field">
            <label for="q-no-input">문제 번호</label>
            <input type="text" id="q-no-input" value="${question ? question.no : ''}">
          </div>
          <div class="admin-field">
            <label for="q-text-input">문항 지시문 (선택)</label>
            <input type="text" id="q-text-input" value="${question && question.text ? escapeHTML(question.text) : ''}">
          </div>
        </div>
        <div class="admin-field">
          <label>보기 (정답 앞의 라디오 버튼을 선택하세요)</label>
          <div class="admin-quiz-options">
            ${labels.map((label, i) => `
              <div class="admin-quiz-option-row">
                <input type="radio" name="q-answer" value="${i}" ${answerIndex === i ? 'checked' : ''}>
                <input type="text" class="qf-opt-input" id="q-opt-${label.toLowerCase()}" value="${escapeHTML(opts[i] || '')}" placeholder="보기 ${label}">
              </div>
            `).join('')}
          </div>
        </div>
        <p class="login-error" id="q-form-error"></p>
        <div class="admin-form-actions">
          <button class="btn-primary" id="q-form-save">${isEdit ? '저장' : '추가'}</button>
          <button class="btn-secondary" id="q-form-cancel">취소</button>
        </div>
      </div>
    `;
    host.querySelector('#q-form-cancel').addEventListener('click', () => showUnitEdit(unitId));
    host.querySelector('#q-form-save').addEventListener('click', async () => {
      const errorEl = host.querySelector('#q-form-error');
      const answerRadio = host.querySelector('input[name="q-answer"]:checked');
      if (!answerRadio) {
        errorEl.textContent = '정답을 선택해주세요';
        return;
      }
      const data = {
        no: host.querySelector('#q-no-input').value.trim(),
        text: host.querySelector('#q-text-input').value.trim(),
        optionA: host.querySelector('#q-opt-a').value.trim(),
        optionB: host.querySelector('#q-opt-b').value.trim(),
        optionC: host.querySelector('#q-opt-c').value.trim(),
        optionD: host.querySelector('#q-opt-d').value.trim(),
        answerIndex: Number(answerRadio.value),
      };
      try {
        if (isEdit) {
          await Api.hskUnits.updateQuestion(unitId, groupId, question.id, data);
        } else {
          await Api.hskUnits.createQuestion(unitId, groupId, data);
        }
      } catch (err) {
        errorEl.textContent = err.message || '저장에 실패했습니다';
        return;
      }
      showUnitEdit(unitId);
    });
  }

  return { start };
})();
