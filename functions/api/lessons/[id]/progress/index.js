// functions/api/lessons/[id]/progress/index.js
//
// GET /api/lessons/:id/progress → 현재 학생의 이 교재 진도율
// PUT /api/lessons/:id/progress { textDone, vocabDone, grammarDone, quizDone }
//     → 진도율 갱신 (전달된 필드만 반영)
//
// 진도율은 "학습한 사람" 기준이므로 학생 계정에만 의미가 있다.
// 교사가 호출하면 자기 진도를 기록하는 대신 빈 값을 돌려준다(오류로 처리하지 않음 —
// 교사도 교재를 열어볼 수 있고, 그때 화면이 깨지면 안 되기 때문).

import { requireAnyUser, jsonResponse, errorResponse } from '../../../../_lib/auth.js';
import { checkLessonAccess } from '../../../../_lib/lessons.js';

const EMPTY = { textDone: false, vocabDone: false, grammarDone: false, quizDone: false };

export async function onRequestGet(context) {
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

  const row = await db.prepare(
    `SELECT text_done, vocab_done, grammar_done, quiz_done, updated_at
     FROM progress WHERE student_id = ? AND lesson_id = ?`
  ).bind(user.id, lessonId).first();

  const progress = row ? {
    textDone: !!row.text_done,
    vocabDone: !!row.vocab_done,
    grammarDone: !!row.grammar_done,
    quizDone: !!row.quiz_done,
  } : { ...EMPTY };

  return jsonResponse({ progress, percent: toPercent(progress), tracked: true });
}

export async function onRequestPut(context) {
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

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return errorResponse('요청 형식이 올바르지 않습니다', 400);
  }

  const current = await db.prepare(
    `SELECT text_done, vocab_done, grammar_done, quiz_done
     FROM progress WHERE student_id = ? AND lesson_id = ?`
  ).bind(user.id, lessonId).first();

  // 전달되지 않은 필드는 기존 값을 유지한다.
  const merged = {
    text: pick(body.textDone, current ? !!current.text_done : false),
    vocab: pick(body.vocabDone, current ? !!current.vocab_done : false),
    grammar: pick(body.grammarDone, current ? !!current.grammar_done : false),
    quiz: pick(body.quizDone, current ? !!current.quiz_done : false),
  };

  await db.prepare(
    `INSERT INTO progress (student_id, lesson_id, text_done, vocab_done, grammar_done, quiz_done, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (student_id, lesson_id) DO UPDATE SET
       text_done = excluded.text_done,
       vocab_done = excluded.vocab_done,
       grammar_done = excluded.grammar_done,
       quiz_done = excluded.quiz_done,
       updated_at = datetime('now')`
  ).bind(
    user.id, lessonId,
    merged.text ? 1 : 0, merged.vocab ? 1 : 0,
    merged.grammar ? 1 : 0, merged.quiz ? 1 : 0
  ).run();

  const progress = {
    textDone: merged.text, vocabDone: merged.vocab,
    grammarDone: merged.grammar, quizDone: merged.quiz,
  };

  return jsonResponse({ progress, percent: toPercent(progress), tracked: true });
}

function pick(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function toPercent(p) {
  const done = [p.textDone, p.vocabDone, p.grammarDone, p.quizDone].filter(Boolean).length;
  return Math.round((done / 4) * 100);
}
