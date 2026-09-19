// functions/api/lessons/[id]/progress/reset.js
//
// POST /api/lessons/:id/progress/reset → 이 교재의 내 진도율을 처음 상태로 되돌린다.
//
// 학생이 같은 단원을 다시 공부하고 싶을 때 쓰는 기능.
// 진도율만 초기화하며, 북마크(저장한 문장·단어)는 건드리지 않는다 — 진도와 북마크는
// 목적이 다르고, 다시 공부한다고 해서 저장해둔 것까지 지우길 원하지는 않기 때문.

import { requireAnyUser, jsonResponse } from '../../../../_lib/auth.js';
import { checkLessonAccess } from '../../../../_lib/lessons.js';

const EMPTY = { textDone: false, vocabDone: false, grammarDone: false, quizDone: false };

export async function onRequestPost(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const lessonId = Number(context.params.id);
  const access = await checkLessonAccess(db, lessonId, user);
  if (access instanceof Response) return access;

  if (user.role !== 'student') {
    return jsonResponse({ progress: EMPTY, percent: 0, tracked: false });
  }

  // 행을 남겨두고 0으로 되돌리는 대신 삭제한다. 진도율 조회 시 행이 없으면
  // 모두 미완료로 취급하므로 결과는 같고, 불필요한 행이 쌓이지 않는다.
  await db.prepare(
    `DELETE FROM progress WHERE student_id = ? AND lesson_id = ?`
  ).bind(user.id, lessonId).run();

  return jsonResponse({ progress: EMPTY, percent: 0, tracked: true, reset: true });
}
