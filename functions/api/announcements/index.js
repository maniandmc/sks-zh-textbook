// functions/api/announcements/index.js
//
// GET  /api/announcements   → 전역 공지사항/업데이트 소식 목록
//   로그인 여부와 무관하게 누구나 조회 가능 — index.html(로그인 전 첫 화면)에서도
//   그대로 보여주기 위함. 민감한 정보가 아니므로 공개해도 문제 없다.
// POST /api/announcements { category, title, content } → 새 글 작성 (교사 전용)

import { requireTeacher, jsonResponse, errorResponse } from '../../_lib/auth.js';

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

export async function onRequestGet(context) {
  const db = context.env.DB;

  const { results } = await db.prepare(
    `SELECT a.id, a.category, a.title, a.content, a.created_at, a.updated_at,
            u.display_name AS author_name
     FROM announcements a JOIN users u ON u.id = a.author_id
     ORDER BY a.created_at DESC
     LIMIT 100`
  ).all();

  return jsonResponse({ announcements: results.map(rowToJson) });
}

export async function onRequestPost(context) {
  const authResult = await requireTeacher(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return errorResponse('요청 형식이 올바르지 않습니다', 400);
  }

  const invalid = validateBody(body);
  if (invalid) return errorResponse(invalid, 400);

  const result = await db.prepare(
    `INSERT INTO announcements (category, title, content, author_id) VALUES (?, ?, ?, ?)`
  ).bind(body.category, String(body.title).trim(), String(body.content).trim(), user.id).run();

  const created = await db.prepare(
    `SELECT a.id, a.category, a.title, a.content, a.created_at, a.updated_at,
            u.display_name AS author_name
     FROM announcements a JOIN users u ON u.id = a.author_id
     WHERE a.id = ?`
  ).bind(result.meta.last_row_id).first();

  return jsonResponse(rowToJson(created), { status: 201 });
}
