// functions/api/classes/index.js
// GET  /api/classes  → 로그인 사용자가 속한(학생) 또는 가르치는(교사) 클래스 목록
// POST /api/classes  { name } → 클래스 생성 (교사 전용)

import { requireAnyUser, requireTeacher, generateJoinCode, jsonResponse, errorResponse } from '../../_lib/auth.js';

export async function onRequestGet(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  if (user.role === 'teacher') {
    const { results } = await context.env.DB.prepare(
      `SELECT c.id, c.name, c.join_code, c.created_at,
              (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS student_count
       FROM classes c
       WHERE c.teacher_id = ?
       ORDER BY c.created_at DESC`
    ).bind(user.id).all();
    return jsonResponse({ classes: results, role: 'teacher' });
  }

  // 학생: 자신이 가입한 클래스 목록 + 담당 교사 이름
  const { results } = await context.env.DB.prepare(
    `SELECT c.id, c.name, u.display_name AS teacher_name, m.joined_at
     FROM class_members m
     JOIN classes c ON c.id = m.class_id
     JOIN users u ON u.id = c.teacher_id
     WHERE m.student_id = ?
     ORDER BY m.joined_at DESC`
  ).bind(user.id).all();
  return jsonResponse({ classes: results, role: 'student' });
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

  const name = (body.name || '').trim();
  if (!name) {
    return errorResponse('클래스 이름을 입력해주세요', 400);
  }

  // join_code 중복 가능성은 낮지만, 혹시를 대비해 재시도 루프
  let joinCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateJoinCode();
    const dup = await context.env.DB.prepare(`SELECT 1 FROM classes WHERE join_code = ?`).bind(candidate).first();
    if (!dup) { joinCode = candidate; break; }
  }
  if (!joinCode) {
    return errorResponse('참여 코드 생성에 실패했습니다. 다시 시도해주세요', 500);
  }

  const result = await context.env.DB.prepare(
    `INSERT INTO classes (name, teacher_id, join_code) VALUES (?, ?, ?)`
  ).bind(name, teacher.id, joinCode).run();

  return jsonResponse({
    id: result.meta.last_row_id,
    name,
    joinCode,
    studentCount: 0,
  }, { status: 201 });
}
