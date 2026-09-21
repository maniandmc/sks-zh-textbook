// functions/api/hsk-units/[id]/index.js
//
// GET    /api/hsk-units/:id → 단원 상세 (그룹/문제 포함, HskReading.render 형태로 직렬화)
// PUT    /api/hsk-units/:id { title } → 제목 수정 (담당 교사만)
// DELETE /api/hsk-units/:id → 단원 삭제 (담당 교사만)

import { requireAnyUser, jsonResponse, errorResponse } from '../../../_lib/auth.js';
import { checkUnitAccess, serializeUnitFull } from '../../../_lib/hsk-units.js';

export async function onRequestGet(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const unitId = Number(context.params.id);
  const access = await checkUnitAccess(db, unitId, user);
  if (access instanceof Response) return access;

  const full = await serializeUnitFull(db, access.unit, { includeAnswers: access.permission.canWrite });
  return jsonResponse({ ...full, canWrite: access.permission.canWrite });
}

export async function onRequestPut(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const unitId = Number(context.params.id);
  const access = await checkUnitAccess(db, unitId, user, { write: true });
  if (access instanceof Response) return access;

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return errorResponse('요청 형식이 올바르지 않습니다', 400);
  }

  const title = (body.title || '').trim();
  if (!title) return errorResponse('단원 이름을 입력해주세요', 400);

  await db.prepare(
    `UPDATE hsk_units SET title = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(title, unitId).run();

  return jsonResponse({ id: unitId, title });
}

export async function onRequestDelete(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const unitId = Number(context.params.id);
  const access = await checkUnitAccess(db, unitId, user, { write: true });
  if (access instanceof Response) return access;

  await db.prepare(`DELETE FROM hsk_units WHERE id = ?`).bind(unitId).run();

  return jsonResponse({ success: true });
}
