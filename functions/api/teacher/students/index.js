// functions/api/teacher/students/index.js
// GET  /api/teacher/students  → 이 교사가 만든 학생 계정 목록
// POST /api/teacher/students  { username, password, displayName } → 학생 계정 생성

import { requireTeacher, hashPassword, jsonResponse, errorResponse } from '../../../_lib/auth.js';

export async function onRequestGet(context) {
  const authResult = await requireTeacher(context);
  if (authResult instanceof Response) return authResult;
  const teacher = authResult;

  const { results } = await context.env.DB.prepare(
    `SELECT id, username, display_name, created_at FROM users
     WHERE role = 'student' AND created_by = ?
     ORDER BY created_at DESC`
  ).bind(teacher.id).all();

  return jsonResponse({ students: results });
}

export async function onRequestPost(context) {
  const authResult = await requireTeacher(context);
  if (authResult instanceof Response) return authResult;
  const teacher = authResult;

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return errorResponse('요청 형식이 올바르지 않습니다', 400);
  }

  const username = (body.username || '').trim();
  const password = body.password || '';
  const displayName = (body.displayName || '').trim();

  if (!username || !password || !displayName) {
    return errorResponse('아이디, 비밀번호, 이름을 모두 입력해주세요', 400);
  }
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
    return errorResponse('아이디는 영문/숫자/._- 조합 3~30자로 입력해주세요', 400);
  }
  if (password.length < 4) {
    return errorResponse('비밀번호는 4자 이상이어야 합니다', 400);
  }

  const existing = await context.env.DB.prepare(
    `SELECT id FROM users WHERE username = ?`
  ).bind(username).first();
  if (existing) {
    return errorResponse('이미 사용 중인 아이디입니다', 409);
  }

  const passwordHash = await hashPassword(password);

  const result = await context.env.DB.prepare(
    `INSERT INTO users (username, password_hash, role, display_name, created_by)
     VALUES (?, ?, 'student', ?, ?)`
  ).bind(username, passwordHash, displayName, teacher.id).run();

  return jsonResponse({
    id: result.meta.last_row_id,
    username,
    displayName,
    role: 'student',
  }, { status: 201 });
}
