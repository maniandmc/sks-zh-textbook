// functions/api/teacher/students/[id]/reset-password.js
// POST /api/teacher/students/:id/reset-password  { newPassword }
//
// 교사가 자신이 만든 학생 계정의 비밀번호를 재설정한다. 학생이 비밀번호를
// 잊어버렸을 때 쓰는 용도. 비밀번호를 바꾸면 그 학생의 기존 로그인 세션은
// 전부 무효화한다(누군가 그 계정으로 이미 로그인해 있었다면 다시 로그인해야 함).

import { requireTeacher, hashPassword, jsonResponse, errorResponse } from '../../../../_lib/auth.js';

export async function onRequestPost(context) {
  const authResult = await requireTeacher(context);
  if (authResult instanceof Response) return authResult;
  const teacher = authResult;
  const db = context.env.DB;

  const studentId = Number(context.params.id);
  if (!Number.isInteger(studentId)) {
    return errorResponse('잘못된 학생 ID입니다', 400);
  }

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return errorResponse('요청 형식이 올바르지 않습니다', 400);
  }

  const newPassword = body.newPassword || '';
  if (newPassword.length < 4) {
    return errorResponse('비밀번호는 4자 이상이어야 합니다', 400);
  }

  // 이 교사가 만든 학생 계정인지 확인 (남의 학생 계정은 재설정 불가)
  const student = await db.prepare(
    `SELECT id, display_name FROM users WHERE id = ? AND role = 'student' AND created_by = ?`
  ).bind(studentId, teacher.id).first();

  if (!student) {
    return errorResponse('학생을 찾을 수 없습니다', 404);
  }

  const passwordHash = await hashPassword(newPassword);

  await db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`)
    .bind(passwordHash, studentId).run();
  await db.prepare(`DELETE FROM sessions WHERE user_id = ?`)
    .bind(studentId).run();

  return jsonResponse({ ok: true, id: studentId, displayName: student.display_name });
}
