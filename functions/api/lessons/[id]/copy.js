// functions/api/lessons/[id]/copy.js
//
// POST /api/lessons/:id/copy → 읽기 권한이 있는 교재를 "내 개인 교재"로 복사한다.
//
// 복사는 스냅샷이다: 복사 시점의 내용을 그대로 새 교재로 만들고, 이후 원본이
// 수정되어도 복사본은 영향받지 않는다. (copied_from_lesson_id에 출처만 기록)
//
// 학생이 교사의 클래스 교재를 가져와 자기 방식대로 연습문제를 추가하는 용도.
// 교사는 개인 교재 영역이 없으므로 이 API는 학생 전용이다.

import { requireAnyUser, jsonResponse, errorResponse } from '../../../_lib/auth.js';
import { checkLessonAccess } from '../../../_lib/lessons.js';

export async function onRequestPost(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  if (user.role !== 'student') {
    return errorResponse('개인 교재는 학생 계정에서만 만들 수 있습니다', 403);
  }

  const sourceId = Number(context.params.id);
  // 읽기 권한만 있으면 복사 가능 (클래스 교재는 학생에게 읽기 전용이지만 복사는 허용)
  const access = await checkLessonAccess(db, sourceId, user);
  if (access instanceof Response) return access;
  const source = access.lesson;

  // 제목 중복을 피하기 위해 접미사를 붙인다.
  let body = {};
  try {
    body = await context.request.json();
  } catch (e) {
    // 본문 없이 호출해도 되도록 허용
  }
  const newTitle = (body.title || source.title).trim();
  const newKoreanTitle = (body.koreanTitle || `${source.korean_title} (내 사본)`).trim();

  const sortRow = await db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM lessons
     WHERE owner_type = 'student' AND owner_id = ?`
  ).bind(user.id).first();
  const sortOrder = sortRow ? sortRow.next : 0;

  const inserted = await db.prepare(
    `INSERT INTO lessons (owner_type, owner_id, title, chinese_title, korean_title,
                          sort_order, copied_from_lesson_id)
     VALUES ('student', ?, ?, ?, ?, ?, ?)`
  ).bind(user.id, newTitle, source.chinese_title, newKoreanTitle, sortOrder, source.id).run();

  const newLessonId = inserted.meta.last_row_id;

  // 하위 항목 복사.
  // D1은 한 번의 batch로 여러 statement를 원자적으로 실행할 수 있어,
  // 항목 수가 많아도 왕복 횟수를 줄이고 부분 복사 상태를 방지할 수 있다.
  const [sentences, vocabulary, grammar, quiz] = await Promise.all([
    db.prepare(`SELECT chinese, pinyin, translation, sort_order FROM sentences WHERE lesson_id = ? ORDER BY sort_order, id`).bind(sourceId).all(),
    db.prepare(`SELECT word, pinyin, part_of_speech, meaning, example, sort_order FROM vocabulary WHERE lesson_id = ? ORDER BY sort_order, id`).bind(sourceId).all(),
    db.prepare(`SELECT title, description, example, translation, sort_order FROM grammar_points WHERE lesson_id = ? ORDER BY sort_order, id`).bind(sourceId).all(),
    db.prepare(`SELECT question, options_json, answer_index, explanation, sort_order FROM quiz_questions WHERE lesson_id = ? ORDER BY sort_order, id`).bind(sourceId).all(),
  ]);

  const statements = [];

  for (const s of sentences.results) {
    statements.push(db.prepare(
      `INSERT INTO sentences (lesson_id, chinese, pinyin, translation, sort_order) VALUES (?, ?, ?, ?, ?)`
    ).bind(newLessonId, s.chinese, s.pinyin, s.translation, s.sort_order));
  }
  for (const v of vocabulary.results) {
    statements.push(db.prepare(
      `INSERT INTO vocabulary (lesson_id, word, pinyin, part_of_speech, meaning, example, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(newLessonId, v.word, v.pinyin, v.part_of_speech, v.meaning, v.example, v.sort_order));
  }
  for (const g of grammar.results) {
    statements.push(db.prepare(
      `INSERT INTO grammar_points (lesson_id, title, description, example, translation, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(newLessonId, g.title, g.description, g.example, g.translation, g.sort_order));
  }
  for (const q of quiz.results) {
    statements.push(db.prepare(
      `INSERT INTO quiz_questions (lesson_id, question, options_json, answer_index, explanation, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(newLessonId, q.question, q.options_json, q.answer_index, q.explanation, q.sort_order));
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return jsonResponse({
    id: newLessonId,
    ownerType: 'student',
    ownerId: user.id,
    title: newTitle,
    chineseTitle: source.chinese_title,
    koreanTitle: newKoreanTitle,
    copiedFromLessonId: source.id,
    counts: {
      sentences: sentences.results.length,
      vocabulary: vocabulary.results.length,
      grammar: grammar.results.length,
      quiz: quiz.results.length,
    },
  }, { status: 201 });
}
