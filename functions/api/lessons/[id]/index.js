// functions/api/lessons/[id]/index.js
//
// GET    /api/lessons/:id  → 교재 전체 내용(문장/단어/문법/문제 포함)
// PUT    /api/lessons/:id  { title, chineseTitle, koreanTitle } → 교재 정보 수정
// DELETE /api/lessons/:id  → 교재 삭제 (하위 항목은 ON DELETE CASCADE로 함께 삭제)

import { requireAnyUser, jsonResponse, errorResponse } from '../../../_lib/auth.js';
import { checkLessonAccess, serializeLessonFull } from '../../../_lib/lessons.js';

export async function onRequestGet(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const lessonId = Number(context.params.id);
  const access = await checkLessonAccess(db, lessonId, user);
  if (access instanceof Response) return access;

  const data = await serializeLessonFull(db, access.lesson);
  return jsonResponse({ lesson: data, canWrite: access.permission.canWrite });
}

export async function onRequestPut(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const lessonId = Number(context.params.id);
  const access = await checkLessonAccess(db, lessonId, user, { write: true });
  if (access instanceof Response) return access;

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return errorResponse('요청 형식이 올바르지 않습니다', 400);
  }

  const title = (body.title || '').trim();
  const chineseTitle = (body.chineseTitle || '').trim();
  const koreanTitle = (body.koreanTitle || '').trim();

  if (!title || !chineseTitle || !koreanTitle) {
    return errorResponse('단원 번호, 중국어 제목, 한국어 제목을 모두 입력해주세요', 400);
  }

  await db.prepare(
    `UPDATE lessons SET title = ?, chinese_title = ?, korean_title = ?,
                        updated_at = datetime('now')
     WHERE id = ?`
  ).bind(title, chineseTitle, koreanTitle, lessonId).run();

  return jsonResponse({ id: lessonId, title, chineseTitle, koreanTitle });
}

export async function onRequestDelete(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const lessonId = Number(context.params.id);
  const access = await checkLessonAccess(db, lessonId, user, { write: true });
  if (access instanceof Response) return access;

  await db.prepare(`DELETE FROM lessons WHERE id = ?`).bind(lessonId).run();
  return jsonResponse({ ok: true, deletedId: lessonId });
}
