'use strict';

/* ============================================================
   api.js — 백엔드(Cloudflare Pages Functions) 호출용 fetch 래퍼

   모든 요청에 credentials: 'same-origin'을 붙여 세션 쿠키가
   함께 전송되도록 하고, 실패 응답은 ApiError로 통일해서 던진다.
   401(세션 만료/미로그인)을 받으면 ctb:unauthorized 이벤트를 쏘아
   app.js가 로그인 화면으로 되돌릴 수 있게 한다.
   ============================================================ */

const Api = (() => {

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }

  async function request(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(path, opts);
    } catch (e) {
      throw new ApiError('네트워크에 연결할 수 없습니다', 0);
    }

    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    if (!res.ok) {
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('ctb:unauthorized'));
      }
      throw new ApiError((data && data.error) || '요청을 처리하지 못했습니다', res.status);
    }
    return data;
  }

  const get = (path) => request('GET', path);
  const post = (path, body) => request('POST', path, body === undefined ? {} : body);
  const put = (path, body) => request('PUT', path, body === undefined ? {} : body);
  const del = (path, body) => request('DELETE', path, body);

  return {
    ApiError,

    auth: {
      login: (username, password) => post('/api/auth/login', { username, password }),
      logout: () => post('/api/auth/logout'),
      me: () => get('/api/auth/me'),
    },

    teacher: {
      listStudents: () => get('/api/teacher/students'),
      createStudent: (data) => post('/api/teacher/students', data),
    },

    classes: {
      list: () => get('/api/classes'),
      create: (name) => post('/api/classes', { name }),
      join: (joinCode) => post('/api/classes/join', { joinCode }),
      students: (classId) => get(`/api/classes/${classId}/students`),
    },

    lessons: {
      list: (params) => {
        const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
        return get(`/api/lessons${qs}`);
      },
      get: (id) => get(`/api/lessons/${id}`),
      create: (data) => post('/api/lessons', data),
      update: (id, data) => put(`/api/lessons/${id}`, data),
      remove: (id) => del(`/api/lessons/${id}`),
      copy: (id, data) => post(`/api/lessons/${id}/copy`, data || {}),
    },

    items: {
      create: (lessonId, type, data) => post(`/api/lessons/${lessonId}/${type}`, data),
      update: (lessonId, type, itemId, data) => put(`/api/lessons/${lessonId}/${type}/${itemId}`, data),
      remove: (lessonId, type, itemId) => del(`/api/lessons/${lessonId}/${type}/${itemId}`),
    },

    progress: {
      get: (lessonId) => get(`/api/lessons/${lessonId}/progress`),
      update: (lessonId, data) => put(`/api/lessons/${lessonId}/progress`, data),
      reset: (lessonId) => post(`/api/lessons/${lessonId}/progress/reset`),
    },

    bookmarks: {
      list: () => get('/api/bookmarks'),
      toggle: (type, refId) => post('/api/bookmarks', { type, refId }),
      remove: (type, refId) => del('/api/bookmarks', { type, refId }),
    },
  };
})();
