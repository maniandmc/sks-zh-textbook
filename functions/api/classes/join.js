// functions/api/classes/join.js
// POST /api/classes/join  { joinCode } → 학생이 참여 코드로 클래스 가입

import { requireAnyUser, jsonResponse, errorResponse } from '../../_lib/auth.js';

export async function onRequestPost(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  if (user.role !== 'student') {
    return errorResponse('학생 계정만 클래스에 가입할 수 있습니다', 403);
  }

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return errorResponse('요청 형식이 올바르지 않습니다', 400);
  }

  const joinCode = (body.joinCode || '').trim().toUpperCase();
  if (!joinCode) {
    return errorResponse('참여 코드를 입력해주세요', 400);
  }

  const cls = await context.env.DB.prepare(
    `SELECT id, name FROM classes WHERE join_code = ?`
  ).bind(joinCode).first();

  if (!cls) {
    return errorResponse('유효하지 않은 참여 코드입니다', 404);
  }

  const already = await context.env.DB.prepare(
    `SELECT 1 FROM class_members WHERE class_id = ? AND student_id = ?`
  ).bind(cls.id, user.id).first();

  if (already) {
    return errorResponse('이미 가입한 클래스입니다', 409);
  }

  await context.env.DB.prepare(
    `INSERT INTO class_members (class_id, student_id) VALUES (?, ?)`
  ).bind(cls.id, user.id).run();

  return jsonResponse({ id: cls.id, name: cls.name }, { status: 201 });
}
