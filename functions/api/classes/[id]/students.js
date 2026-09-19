// functions/api/classes/[id]/students.js
// GET /api/classes/:id/students → 해당 클래스의 학생 명단 (담당 교사만 조회 가능)

import { requireTeacher, jsonResponse, errorResponse } from '../../../_lib/auth.js';

export async function onRequestGet(context) {
  const authResult = await requireTeacher(context);
  if (authResult instanceof Response) return authResult;
  const teacher = authResult;

  const classId = Number(context.params.id);
  if (!Number.isInteger(classId)) {
    return errorResponse('잘못된 클래스 ID입니다', 400);
  }

  const cls = await context.env.DB.prepare(
    `SELECT id, name, teacher_id, join_code FROM classes WHERE id = ?`
  ).bind(classId).first();

  if (!cls) return errorResponse('클래스를 찾을 수 없습니다', 404);
  if (cls.teacher_id !== teacher.id) return errorResponse('이 클래스에 대한 권한이 없습니다', 403);

  const { results } = await context.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, m.joined_at
     FROM class_members m JOIN users u ON u.id = m.student_id
     WHERE m.class_id = ?
     ORDER BY m.joined_at ASC`
  ).bind(classId).all();

  return jsonResponse({
    class: { id: cls.id, name: cls.name, joinCode: cls.join_code },
    students: results,
  });
}
