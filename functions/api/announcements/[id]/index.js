// functions/api/announcements/[id]/index.js
//
// PUT    /api/announcements/:id { category, title, content } → 수정 (교사 전용)
// DELETE /api/announcements/:id                              → 삭제 (교사 전용)
//
// 학교 전체가 함께 쓰는 공용 게시판이라, 작성자 본인이 아니어도
// 교사 계정이면 누구나 수정·삭제할 수 있다.

import { requireTeacher, jsonResponse, errorResponse } from '../../../_lib/auth.js';

const CATEGORIES = ['notice', 'update'];

function rowToJson(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    authorName: row.author_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateBody(body) {
  if (!CATEGORIES.includes(body.category)) return '분류가 올바르지 않습니다';
  if (!body.title || !String(body.title).trim()) return '제목을 입력해주세요';
  if (!body.content || !String(body.content).trim()) return '내용을 입력해주세요';
  return null;
}

export async function onRequestPut(context) {
  const authResult = await requireTeacher(context);
  if (authResult instanceof Response) return authResult;
  const db = context.env.DB;

  const id = Number(context.params.id);
  if (!Number.isInteger(id)) return errorResponse('잘못된 ID입니다', 400);

  const existing = await db.prepare(`SELECT id FROM announcements WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse('글을 찾을 수 없습니다', 404);

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return errorResponse('요청 형식이 올바르지 않습니다', 400);
  }

  const invalid = validateBody(body);
  if (invalid) return errorResponse(invalid, 400);

  await db.prepare(
    `UPDATE announcements SET category = ?, title = ?, content = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(body.category, String(body.title).trim(), String(body.content).trim(), id).run();

  const updated = await db.prepare(
    `SELECT a.id, a.category, a.title, a.content, a.created_at, a.updated_at,
            u.display_name AS author_name
     FROM announcements a JOIN users u ON u.id = a.author_id
     WHERE a.id = ?`
  ).bind(id).first();

  return jsonResponse(rowToJson(updated));
}

export async function onRequestDelete(context) {
  const authResult = await requireTeacher(context);
  if (authResult instanceof Response) return authResult;
  const db = context.env.DB;

  const id = Number(context.params.id);
  if (!Number.isInteger(id)) return errorResponse('잘못된 ID입니다', 400);

  const existing = await db.prepare(`SELECT id FROM announcements WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse('글을 찾을 수 없습니다', 404);

  await db.prepare(`DELETE FROM announcements WHERE id = ?`).bind(id).run();

  return jsonResponse({ success: true });
}
