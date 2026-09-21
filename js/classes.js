'use strict';

/* ============================================================
   classes.js — 클래스 화면
   - 학생: 참여 코드로 클래스 가입, 내 클래스 목록
   - 교사: 클래스 생성(참여 코드 발급), 클래스별 학생 명단,
           학생 계정 발급
   ============================================================ */

const Classes = (() => {

  async function render(container) {
    const user = App.getCurrentUser();
    if (user.role === 'teacher') {
      await renderTeacherView(container);
    } else {
      await renderStudentView(container);
    }
  }

  /* ================= 학생 화면 ================= */

  async function renderStudentView(container) {
    let classes = [];
    try {
      const resp = await Api.classes.list();
      classes = resp.classes;
    } catch (e) {
      App.showToast(e.message);
    }

    container.innerHTML = `
      <div class="content-inner">
        <div class="page-header">
          <h1>내 클래스</h1>
          <p>선생님께 받은 참여 코드를 입력해 클래스에 가입하세요.</p>
        </div>

        <div class="admin-card">
          <p class="section-heading">참여 코드로 가입</p>
          <div class="inline-form-row">
            <input type="text" id="join-code-input" class="join-code-input" placeholder="예: QMN2NG" maxlength="6">
            <button class="btn-primary" id="join-code-btn">가입</button>
          </div>
        </div>

        <p class="section-heading">가입한 클래스 (${classes.length})</p>
        <div class="admin-list">
          ${classes.length ? classes.map(renderStudentClassRow).join('') : emptyRow('아직 가입한 클래스가 없습니다')}
        </div>
      </div>
    `;

    const input = container.querySelector('#join-code-input');
    container.querySelector('#join-code-btn').addEventListener('click', () => joinClass(container, input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinClass(container, input);
    });
  }

  function renderStudentClassRow(c) {
    return `
      <div class="admin-row">
        <div class="admin-row-main">
          <p class="admin-row-zh">${App.escapeHTML(c.name)}</p>
          <p class="admin-row-sub">담당 교사: ${App.escapeHTML(c.teacher_name)}</p>
        </div>
      </div>
    `;
  }

  async function joinClass(container, input) {
    const joinCode = input.value.trim();
    if (!joinCode) {
      App.showToast('참여 코드를 입력해주세요');
      return;
    }
    try {
      const cls = await Api.classes.join(joinCode);
      App.showToast(`"${cls.name}" 클래스에 가입했습니다`);
    } catch (e) {
      App.showToast(e.message);
      return;
    }
    // 새로 가입한 클래스의 교재가 보이도록 목록 캐시 갱신
    App.invalidateCache();
    App.renderSidebarLessonList();
    await renderStudentView(container);
  }

  /* ================= 교사 화면 ================= */

  async function renderTeacherView(container) {
    let classes = [];
    let students = [];
    try {
      const [classResp, studentResp] = await Promise.all([
        Api.classes.list(),
        Api.teacher.listStudents(),
      ]);
      classes = classResp.classes;
      students = studentResp.students;
    } catch (e) {
      App.showToast(e.message);
    }

    container.innerHTML = `
      <div class="content-inner">
        <div class="page-header">
          <h1>클래스 관리</h1>
          <p>클래스를 만들어 참여 코드를 학생에게 알려주고, 학생 계정을 발급하세요.</p>
        </div>

        <div class="admin-card">
          <p class="section-heading">새 클래스 만들기</p>
          <div class="inline-form-row">
            <input type="text" id="new-class-name" placeholder="예: 중국어 1반">
            <button class="btn-primary" id="create-class-btn">만들기</button>
          </div>
        </div>

        <p class="section-heading">내 클래스 (${classes.length})</p>
        <div class="admin-list" id="teacher-classes-list">
          ${classes.length ? classes.map(renderTeacherClassCard).join('') : emptyRow('아직 만든 클래스가 없습니다')}
        </div>

        <div class="admin-card" style="margin-top:28px;">
          <p class="section-heading">학생 계정 만들기</p>
          <div class="admin-field-row">
            <div class="admin-field">
              <label>아이디</label>
              <input type="text" id="new-student-username" placeholder="영문/숫자 3~30자">
            </div>
            <div class="admin-field">
              <label>비밀번호</label>
              <input type="password" id="new-student-password" placeholder="4자 이상">
            </div>
          </div>
          <div class="admin-field">
            <label>이름</label>
            <input type="text" id="new-student-name" placeholder="홍길동">
          </div>
          <div class="admin-form-actions">
            <button class="btn-primary" id="create-student-btn">계정 만들기</button>
          </div>
        </div>

        <p class="section-heading">내가 만든 학생 계정 (${students.length})</p>
        <div class="admin-list">
          ${students.length ? students.map(renderStudentAccountRow).join('') : emptyRow('아직 만든 학생 계정이 없습니다')}
        </div>
      </div>
    `;

    container.querySelector('#create-class-btn').addEventListener('click', () => createClass(container));
    container.querySelector('#new-class-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createClass(container);
    });

    container.querySelector('#create-student-btn').addEventListener('click', () => createStudent(container));

    container.querySelectorAll('[data-action="toggle-roster"]').forEach(btn => {
      btn.addEventListener('click', () => toggleRoster(btn, Number(btn.dataset.classId)));
    });

    container.querySelectorAll('[data-action="reset-password"]').forEach(btn => {
      const studentId = Number(btn.dataset.studentId);
      const student = students.find(s => s.id === studentId);
      if (student) btn.addEventListener('click', () => toggleResetPasswordForm(student));
    });
  }

  function renderTeacherClassCard(c) {
    return `
      <div class="admin-card class-card">
        <div class="admin-lesson-header-row">
          <div>
            <p class="section-heading" style="margin:0 0 4px;">${App.escapeHTML(c.name)}</p>
            <p class="admin-row-sub">학생 ${c.student_count}명</p>
          </div>
          <div class="admin-lesson-header-actions">
            <span class="join-code-badge" title="참여 코드">${c.join_code}</span>
            <button class="icon-text-btn" data-action="toggle-roster" data-class-id="${c.id}">명단 보기</button>
          </div>
        </div>
        <div class="class-roster" id="roster-${c.id}"></div>
      </div>
    `;
  }

  function renderStudentAccountRow(s) {
    return `
      <div class="admin-row">
        <div class="admin-row-main">
          <p class="admin-row-zh">${App.escapeHTML(s.display_name)} <span class="admin-row-sub" style="display:inline;">@${App.escapeHTML(s.username)}</span></p>
        </div>
        <div class="admin-row-actions">
          <button class="icon-text-btn" data-action="reset-password" data-student-id="${s.id}">비밀번호 재설정</button>
        </div>
      </div>
      <div class="admin-inline-form" id="reset-pw-form-${s.id}"></div>
    `;
  }

  async function createClass(container) {
    const input = container.querySelector('#new-class-name');
    const name = input.value.trim();
    if (!name) {
      App.showToast('클래스 이름을 입력해주세요');
      return;
    }
    try {
      const cls = await Api.classes.create(name);
      App.showToast(`"${cls.name}" 클래스를 만들었습니다 (참여 코드: ${cls.joinCode})`);
    } catch (e) {
      App.showToast(e.message);
      return;
    }
    await renderTeacherView(container);
  }

  async function createStudent(container) {
    const username = container.querySelector('#new-student-username').value.trim();
    const password = container.querySelector('#new-student-password').value;
    const displayName = container.querySelector('#new-student-name').value.trim();

    if (!username || !password || !displayName) {
      App.showToast('아이디, 비밀번호, 이름을 모두 입력해주세요');
      return;
    }

    try {
      await Api.teacher.createStudent({ username, password, displayName });
      App.showToast(`"${displayName}"(${username}) 계정을 만들었습니다. 아이디/비밀번호를 학생에게 전달해주세요.`);
    } catch (e) {
      App.showToast(e.message);
      return;
    }
    await renderTeacherView(container);
  }

  async function toggleRoster(btn, classId) {
    const rosterEl = document.getElementById(`roster-${classId}`);
    if (!rosterEl) return;

    if (rosterEl.classList.contains('show')) {
      rosterEl.classList.remove('show');
      rosterEl.innerHTML = '';
      btn.textContent = '명단 보기';
      return;
    }

    rosterEl.classList.add('show');
    btn.textContent = '명단 닫기';
    await loadRoster(classId);
  }

  async function loadRoster(classId) {
    const rosterEl = document.getElementById(`roster-${classId}`);
    if (!rosterEl) return;

    rosterEl.innerHTML = `<p class="admin-empty-row">불러오는 중...</p>`;

    try {
      const { students } = await Api.classes.students(classId);
      rosterEl.innerHTML = students.length
        ? `<div class="admin-list">${students.map(s => `
            <div class="admin-row">
              <div class="admin-row-main">
                <p class="admin-row-zh">${App.escapeHTML(s.display_name)} <span class="admin-row-sub" style="display:inline;">@${App.escapeHTML(s.username)}</span></p>
              </div>
              <div class="admin-row-actions">
                <button class="icon-text-btn danger" data-action="remove-from-class" data-student-id="${s.id}" data-student-name="${App.escapeHTML(s.display_name)}">클래스에서 제거</button>
              </div>
            </div>
          `).join('')}</div>`
        : emptyRow('아직 가입한 학생이 없습니다');

      rosterEl.querySelectorAll('[data-action="remove-from-class"]').forEach(removeBtn => {
        removeBtn.addEventListener('click', () => removeStudentFromClass(
          classId,
          Number(removeBtn.dataset.studentId),
          removeBtn.dataset.studentName,
        ));
      });
    } catch (e) {
      rosterEl.innerHTML = `<p class="admin-empty-row">${App.escapeHTML(e.message)}</p>`;
    }
  }

  async function removeStudentFromClass(classId, studentId, studentName) {
    if (!confirm(`"${studentName}" 학생을 이 클래스에서 제거하시겠습니까?`)) return;

    try {
      await Api.classes.removeStudent(classId, studentId);
      App.showToast(`"${studentName}" 학생을 클래스에서 제거했습니다`);
    } catch (e) {
      App.showToast(e.message);
      return;
    }

    await loadRoster(classId);

    const card = document.getElementById(`roster-${classId}`)?.closest('.class-card');
    const countEl = card ? card.querySelector('.admin-row-sub') : null;
    if (countEl) {
      const current = Number(countEl.textContent.replace(/[^0-9]/g, '')) || 0;
      countEl.textContent = `학생 ${Math.max(0, current - 1)}명`;
    }
  }

  function toggleResetPasswordForm(student) {
    const formEl = document.getElementById(`reset-pw-form-${student.id}`);
    if (!formEl) return;

    if (formEl.classList.contains('show')) {
      formEl.classList.remove('show');
      formEl.innerHTML = '';
      return;
    }

    formEl.classList.add('show');
    formEl.innerHTML = `
      <div class="inline-form-row">
        <input type="password" id="reset-pw-input-${student.id}" placeholder="새 비밀번호 (4자 이상)">
        <button class="btn-primary" id="reset-pw-save-${student.id}">재설정</button>
        <button class="btn-secondary" id="reset-pw-cancel-${student.id}">취소</button>
      </div>
    `;

    const input = formEl.querySelector(`#reset-pw-input-${student.id}`);
    input.focus();

    const close = () => {
      formEl.classList.remove('show');
      formEl.innerHTML = '';
    };

    formEl.querySelector(`#reset-pw-cancel-${student.id}`).addEventListener('click', close);

    const submit = async () => {
      const newPassword = input.value;
      if (newPassword.length < 4) {
        App.showToast('비밀번호는 4자 이상이어야 합니다');
        return;
      }
      try {
        await Api.teacher.resetStudentPassword(student.id, newPassword);
        App.showToast(`"${student.display_name}" 학생의 비밀번호를 재설정했습니다`);
      } catch (e) {
        App.showToast(e.message);
        return;
      }
      close();
    };

    formEl.querySelector(`#reset-pw-save-${student.id}`).addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  /* ---------------- 공통 ---------------- */

  function emptyRow(message) {
    return `<div class="admin-empty-row">${message}</div>`;
  }

  return { render };
})();
