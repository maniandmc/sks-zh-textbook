// functions/api/classes/[id]/students/[studentId].js
// DELETE /api/classes/:id/students/:studentId → 클래스에서 학생 제거 (담당 교사만 가능)

import { requireTeacher, jsonResponse, errorResponse } from '../../../../_lib/auth.js';

export async function onRequestDelete(context) {
  const authResult = await requireTeacher(context);
  if (authResult instanceof Response) return authResult;
  const teacher = authResult;

  const classId = Number(context.params.id);
  const studentId = Number(context.params.studentId);
  if (!Number.isInteger(classId) || !Number.isInteger(studentId)) {
    return errorResponse('잘못된 요청입니다', 400);
  }

  const cls = await context.env.DB.prepare(
    `SELECT id, teacher_id FROM classes WHERE id = ?`
  ).bind(classId).first();

  if (!cls) return errorResponse('클래스를 찾을 수 없습니다', 404);
  if (cls.teacher_id !== teacher.id) return errorResponse('이 클래스에 대한 권한이 없습니다', 403);

  const result = await context.env.DB.prepare(
    `DELETE FROM class_members WHERE class_id = ? AND student_id = ?`
  ).bind(classId, studentId).run();

  if (result.meta.changes === 0) {
    return errorResponse('이 클래스에 가입한 학생이 아닙니다', 404);
  }

  return jsonResponse({ success: true });
}
