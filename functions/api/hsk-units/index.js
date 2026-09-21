// functions/api/hsk-units/index.js
//
// GET  /api/hsk-units?classId=5 → 그 클래스의 HSK 단원 목록 (제목만, 읽기 권한 필요)
// POST /api/hsk-units { classId, title } → 단원 생성 (담당 교사만)

import { requireAnyUser, jsonResponse, errorResponse } from '../../_lib/auth.js';
import { getClassPermission, canCreateUnitIn } from '../../_lib/hsk-units.js';

export async function onRequestGet(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const url = new URL(context.request.url);
  const classId = Number(url.searchParams.get('classId'));
  if (!Number.isInteger(classId)) {
    return errorResponse('classId가 필요합니다', 400);
  }

  const permission = await getClassPermission(db, classId, user);
  if (!permission.canRead) {
    return errorResponse('클래스를 찾을 수 없습니다', 404);
  }

  const { results } = await db.prepare(
    `SELECT id, title, sort_order, updated_at FROM hsk_units
     WHERE class_id = ? ORDER BY sort_order ASC, id ASC`
  ).bind(classId).all();

  return jsonResponse({
    units: results.map(u => ({ id: u.id, title: u.title, updatedAt: u.updated_at })),
    canWrite: permission.canWrite,
  });
}

export async function onRequestPost(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return errorResponse('요청 형식이 올바르지 않습니다', 400);
  }

  const classId = Number(body.classId);
  const title = (body.title || '').trim();
  if (!Number.isInteger(classId)) return errorResponse('classId가 필요합니다', 400);
  if (!title) return errorResponse('단원 이름을 입력해주세요', 400);

  const allowed = await canCreateUnitIn(db, classId, user);
  if (!allowed) return errorResponse('이 클래스에 단원을 만들 권한이 없습니다', 403);

  const sortOrderRow = await db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM hsk_units WHERE class_id = ?`
  ).bind(classId).first();
  const sortOrder = sortOrderRow ? sortOrderRow.next : 0;

  const result = await db.prepare(
    `INSERT INTO hsk_units (class_id, title, sort_order) VALUES (?, ?, ?)`
  ).bind(classId, title, sortOrder).run();

  return jsonResponse({ id: result.meta.last_row_id, title, classId }, { status: 201 });
}
