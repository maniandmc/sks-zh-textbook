// functions/api/bookmarks/index.js
//
// GET    /api/bookmarks                     → 내 북마크 전체 (문장/단어 내용 포함)
// POST   /api/bookmarks { type, refId }     → 북마크 추가 (이미 있으면 제거 = 토글)
// DELETE /api/bookmarks { type, refId }     → 북마크 명시적 제거
//
// 북마크는 학생 개인 데이터다. 교사 계정은 북마크를 쓰지 않으므로 빈 목록을 돌려준다.

import { requireAnyUser, jsonResponse, errorResponse } from '../../_lib/auth.js';
import { getLessonRow, getLessonPermission } from '../../_lib/lessons.js';

export async function onRequestGet(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  if (user.role !== 'student') {
    return jsonResponse({ sentences: [], words: [] });
  }

  const [sentenceRows, wordRows] = await Promise.all([
    db.prepare(
      `SELECT b.ref_id AS id, b.lesson_id, s.chinese, s.pinyin, s.translation,
              l.title AS lesson_title
       FROM bookmarks b
       JOIN sentences s ON s.id = b.ref_id
       JOIN lessons l ON l.id = b.lesson_id
       WHERE b.student_id = ? AND b.type = 'sentence'
       ORDER BY b.created_at DESC`
    ).bind(user.id).all(),
    db.prepare(
      `SELECT b.ref_id AS id, b.lesson_id, v.word, v.pinyin, v.part_of_speech,
              v.meaning, l.title AS lesson_title
       FROM bookmarks b
       JOIN vocabulary v ON v.id = b.ref_id
       JOIN lessons l ON l.id = b.lesson_id
       WHERE b.student_id = ? AND b.type = 'word'
       ORDER BY b.created_at DESC`
    ).bind(user.id).all(),
  ]);

  return jsonResponse({
    sentences: sentenceRows.results.map(r => ({
      id: r.id, lessonId: r.lesson_id, lessonTitle: r.lesson_title,
      chinese: r.chinese, pinyin: r.pinyin, translation: r.translation,
    })),
    words: wordRows.results.map(r => ({
      id: r.id, lessonId: r.lesson_id, lessonTitle: r.lesson_title,
      word: r.word, pinyin: r.pinyin,
      partOfSpeech: r.part_of_speech, meaning: r.meaning,
    })),
  });
}

export async function onRequestPost(context) {
  return toggleBookmark(context, 'toggle');
}

export async function onRequestDelete(context) {
  return toggleBookmark(context, 'remove');
}

async function toggleBookmark(context, mode) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  if (user.role !== 'student') {
    return errorResponse('학생 계정만 북마크를 사용할 수 있습니다', 403);
  }

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return errorResponse('요청 형식이 올바르지 않습니다', 400);
  }

  const type = body.type;
  const refId = Number(body.refId);

  if (!['sentence', 'word'].includes(type) || !Number.isInteger(refId)) {
    return errorResponse('북마크 대상이 올바르지 않습니다', 400);
  }

  // 참조 대상이 실제로 존재하는지, 그리고 그 교재를 읽을 권한이 있는지 확인한다.
  // (남의 개인 교재 항목을 북마크하는 것을 막기 위함)
  const table = type === 'sentence' ? 'sentences' : 'vocabulary';
  const item = await db.prepare(
    `SELECT lesson_id FROM ${table} WHERE id = ?`
  ).bind(refId).first();

  if (!item) return errorResponse('대상을 찾을 수 없습니다', 404);

  const lesson = await getLessonRow(db, item.lesson_id);
  const permission = await getLessonPermission(db, lesson, user);
  if (!permission.canRead) return errorResponse('대상을 찾을 수 없습니다', 404);

  const existing = await db.prepare(
    `SELECT id FROM bookmarks WHERE student_id = ? AND type = ? AND ref_id = ?`
  ).bind(user.id, type, refId).first();

  if (existing) {
    await db.prepare(`DELETE FROM bookmarks WHERE id = ?`).bind(existing.id).run();
    return jsonResponse({ saved: false, type, refId });
  }

  if (mode === 'remove') {
    // 이미 없는 상태 — 멱등하게 처리
    return jsonResponse({ saved: false, type, refId });
  }

  await db.prepare(
    `INSERT INTO bookmarks (student_id, type, ref_id, lesson_id) VALUES (?, ?, ?, ?)`
  ).bind(user.id, type, refId, item.lesson_id).run();

  return jsonResponse({ saved: true, type, refId }, { status: 201 });
}
