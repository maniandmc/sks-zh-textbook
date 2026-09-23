// functions/api/classes/[id]/index.js
// PUT    /api/classes/:id  { name } → 클래스 이름 변경 (담당 교사만 가능)
// DELETE /api/classes/:id  → 클래스 삭제 (담당 교사만 가능, 단원/학생 명단도 함께 삭제)

import { requireTeacher, jsonResponse, errorResponse } from '../../../_lib/auth.js';

async function loadOwnedClass(db, classId, teacher) {
  const cls = await db.prepare(
    `SELECT id, teacher_id FROM classes WHERE id = ?`
  ).bind(classId).first();

  if (!cls) return { error: errorResponse('클래스를 찾을 수 없습니다', 404) };
  if (cls.teacher_id !== teacher.id) return { error: errorResponse('이 클래스에 대한 권한이 없습니다', 403) };
  return { cls };
}

export async function onRequestPut(context) {
  const authResult = await requireTeacher(context);
  if (authResult instanceof Response) return authResult;
  const teacher = authResult;
  const db = context.env.DB;

  const classId = Number(context.params.id);
  if (!Number.isInteger(classId)) return errorResponse('잘못된 요청입니다', 400);

  const { error } = await loadOwnedClass(db, classId, teacher);
  if (error) return error;

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

  await db.prepare(`UPDATE classes SET name = ? WHERE id = ?`).bind(name, classId).run();
  return jsonResponse({ id: classId, name });
}

export async function onRequestDelete(context) {
  const authResult = await requireTeacher(context);
  if (authResult instanceof Response) return authResult;
  const teacher = authResult;
  const db = context.env.DB;

  const classId = Number(context.params.id);
  if (!Number.isInteger(classId)) return errorResponse('잘못된 요청입니다', 400);

  const { error } = await loadOwnedClass(db, classId, teacher);
  if (error) return error;

  // lessons.owner_id는 class/student를 함께 가리키는 다형 참조라 FK cascade가 걸려있지 않으므로
  // 여기서 직접 지운다. (문장/단어/문법/문제/진도율/북마크는 lessons 삭제 시
  // ON DELETE CASCADE로 함께 삭제된다.) class_members는 classes에 대한 FK가 있어 자동으로 삭제된다.
  await db.prepare(`DELETE FROM lessons WHERE owner_type = 'class' AND owner_id = ?`).bind(classId).run();
  await db.prepare(`DELETE FROM classes WHERE id = ?`).bind(classId).run();

  return jsonResponse({ ok: true, deletedId: classId });
}
