'use strict';

/* ============================================================
   hsk-reading-auth.js — HSK 독해 페이지 로그인 처리
   중국어 교재(textbook.html)와 완전히 같은 계정/세션을 쓴다
   (js/api.js의 Api.auth.* 가 같은 쿠키 기반 세션을 공유한다).
   ============================================================ */

(function () {

  function showLogin(message) {
    document.getElementById('login-screen').classList.add('show');
    document.getElementById('hsk-header').style.display = 'none';
    document.getElementById('hsk-app-root').style.display = 'none';
    document.getElementById('hsk-exam-nav').style.display = 'none';
    document.getElementById('hsk-toolbar').style.display = 'none';
    document.getElementById('exam-root').style.display = 'none';
    const errorEl = document.getElementById('login-error');
    if (errorEl) errorEl.textContent = message || '';
  }

  function showApp(user) {
    document.getElementById('login-screen').classList.remove('show');
    document.getElementById('hsk-header').style.display = '';

    const roleLabel = user.role === 'teacher' ? '교사' : '학생';
    document.getElementById('header-user-info').textContent = `${user.displayName} · ${roleLabel}`;

    HskApp.start(user);
  }

  function wireLoginForm() {
    const form = document.getElementById('login-form');
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
      try {
        const user = await Api.auth.login(username, password);
        document.getElementById('login-password').value = '';
        showApp(user);
      } catch (err) {
        errorEl.textContent = err.message || '로그인에 실패했습니다';
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function wirePrintButton() {
    document.getElementById('hsk-print-btn').addEventListener('click', () => window.print());
  }

  function wireHomeButton() {
    document.getElementById('hsk-home-btn').addEventListener('click', () => {
      location.href = 'index.html';
    });
  }

  function wireLogoutButton() {
    document.getElementById('hsk-logout-btn').addEventListener('click', async () => {
      if (!confirm('로그아웃하시겠습니까?')) return;
      try { await Api.auth.logout(); } catch (e) { /* 세션이 이미 없어도 로그아웃 진행 */ }
      showLogin();
    });
  }

  async function init() {
    wireLoginForm();
    wirePrintButton();
    wireHomeButton();
    wireLogoutButton();

    let me;
    try {
      me = await Api.auth.me();
    } catch (e) {
      me = { user: null };
    }

    if (me.user) {
      showApp(me.user);
    } else {
      showLogin();
    }
  }

  init();
})();
