// functions/_lib/lesson-items.js
//
// 문장 / 단어 / 문법 / 문제는 "교재에 속한 항목"이라는 점에서 처리 흐름이 같다.
//   1) 로그인 확인 → 2) 교재 쓰기 권한 확인 → 3) 입력값 검증 → 4) INSERT/UPDATE/DELETE
//      → 5) 교재 updated_at 갱신 → 6) JSON 응답
// 이 공통 흐름을 한 곳에 모아두고, 각 항목 타입은 "설정"만 제공하도록 한다.

import { requireAnyUser, jsonResponse, errorResponse } from './auth.js';
import { checkLessonAccess, touchLesson, nextSortOrder } from './lessons.js';

/**
 * 항목 타입별 설정.
 *   table:    DB 테이블명
 *   fields:   { 요청바디키: DB컬럼명 } 매핑
 *   required: 필수 입력 키 목록
 *   validate: (body) => 오류메시지 | null   (선택적 추가 검증)
 *   toRow:    (body) => { 컬럼명: 값 }      (기본 매핑으로 부족할 때)
 *   toJson:   (row)  => 응답용 객체
 */
export const ITEM_TYPES = {
  sentence: {
    table: 'sentences',
    required: ['chinese', 'pinyin', 'translation'],
    toRow: (b) => ({
      chinese: b.chinese.trim(),
      pinyin: b.pinyin.trim(),
      translation: b.translation.trim(),
    }),
    selectColumns: 'id, chinese, pinyin, translation',
    toJson: (r) => ({
      id: r.id, chinese: r.chinese, pinyin: r.pinyin, translation: r.translation,
    }),
  },

  vocabulary: {
    table: 'vocabulary',
    // 단어(word)만 필수. 나머지는 표 붙여넣기 일괄 추가에서 비어 있을 수 있음.
    required: ['word'],
    validate: (b) => {
      if (b.word.trim().length > 100) return '단어는 100자 이내로 입력해주세요';
      if ((b.pinyin || '').length > 200) return '병음은 200자 이내로 입력해주세요';
      if ((b.partOfSpeech || '').length > 50) return '품사는 50자 이내로 입력해주세요';
      if ((b.meaning || '').length > 500) return '뜻은 500자 이내로 입력해주세요';
      if ((b.example || '').length > 1000) return '예문은 1000자 이내로 입력해주세요';
      return null;
    },
    toRow: (b) => ({
      word: b.word.trim(),
      pinyin: (b.pinyin || '').trim(),
      part_of_speech: (b.partOfSpeech || '').trim(),
      meaning: (b.meaning || '').trim(),
      example: (b.example || '').trim(),
    }),
    selectColumns: 'id, word, pinyin, part_of_speech, meaning, example',
    toJson: (r) => ({
      id: r.id, word: r.word, pinyin: r.pinyin,
      partOfSpeech: r.part_of_speech, meaning: r.meaning, example: r.example || '',
    }),
    // 같은 단원 내 단어 중복 방지 (UNIQUE 제약과 함께 친절한 메시지 제공)
    beforeInsert: async (db, lessonId, row) => {
      const dup = await db.prepare(
        `SELECT 1 FROM vocabulary WHERE lesson_id = ? AND word = ?`
      ).bind(lessonId, row.word).first();
      return dup ? '이미 등록된 단어입니다' : null;
    },
    beforeUpdate: async (db, lessonId, row, itemId) => {
      const dup = await db.prepare(
        `SELECT 1 FROM vocabulary WHERE lesson_id = ? AND word = ? AND id != ?`
      ).bind(lessonId, row.word, itemId).first();
      return dup ? '이미 등록된 단어입니다' : null;
    },
  },

  grammar: {
    table: 'grammar_points',
    required: ['title', 'description', 'example', 'translation'],
    toRow: (b) => ({
      title: b.title.trim(),
      description: b.description.trim(),
      example: b.example.trim(),
      translation: b.translation.trim(),
    }),
    selectColumns: 'id, title, description, example, translation',
    toJson: (r) => ({
      id: r.id, title: r.title, description: r.description,
      example: r.example, translation: r.translation,
    }),
  },

  quiz: {
    table: 'quiz_questions',
    required: ['question', 'options', 'explanation'],
    validate: (b) => {
      if (!Array.isArray(b.options) || b.options.length < 2) {
        return '보기는 2개 이상이어야 합니다';
      }
      if (b.options.some(o => typeof o !== 'string' || !o.trim())) {
        return '모든 보기를 입력해주세요';
      }
      const idx = Number(b.answerIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= b.options.length) {
        return '정답 번호가 올바르지 않습니다';
      }
      return null;
    },
    toRow: (b) => ({
      question: b.question.trim(),
      options_json: JSON.stringify(b.options.map(o => o.trim())),
      answer_index: Number(b.answerIndex),
      explanation: b.explanation.trim(),
    }),
    selectColumns: 'id, question, options_json, answer_index, explanation',
    toJson: (r) => ({
      id: r.id,
      question: r.question,
      options: safeParse(r.options_json),
      answerIndex: r.answer_index,
      explanation: r.explanation,
    }),
  },
};

function safeParse(json) {
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p : [];
  } catch (e) {
    return [];
  }
}

function validateBody(config, body) {
  for (const key of config.required) {
    const value = body[key];
    if (value === undefined || value === null) return `${key} 값이 필요합니다`;
    if (typeof value === 'string' && !value.trim()) return '모든 항목을 입력해주세요';
  }
  if (config.validate) {
    const msg = config.validate(body);
    if (msg) return msg;
  }
  return null;
}

/**
 * 항목 추가: POST /api/lessons/:id/<type>
 */
export async function handleCreateItem(context, typeKey) {
  const config = ITEM_TYPES[typeKey];
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

  const invalid = validateBody(config, body);
  if (invalid) return errorResponse(invalid, 400);

  const row = config.toRow(body);

  if (config.beforeInsert) {
    const conflict = await config.beforeInsert(db, lessonId, row);
    if (conflict) return errorResponse(conflict, 409);
  }

  const sortOrder = await nextSortOrder(db, config.table, lessonId);
  const columns = ['lesson_id', ...Object.keys(row), 'sort_order'];
  const placeholders = columns.map(() => '?').join(', ');
  const values = [lessonId, ...Object.values(row), sortOrder];

  const result = await db.prepare(
    `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${placeholders})`
  ).bind(...values).run();

  await touchLesson(db, lessonId);

  const created = await db.prepare(
    `SELECT ${config.selectColumns} FROM ${config.table} WHERE id = ?`
  ).bind(result.meta.last_row_id).first();

  return jsonResponse(config.toJson(created), { status: 201 });
}

/**
 * 항목 수정: PUT /api/lessons/:id/<type>/:itemId
 */
export async function handleUpdateItem(context, typeKey) {
  const config = ITEM_TYPES[typeKey];
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const lessonId = Number(context.params.id);
  const itemId = Number(context.params.itemId);
  if (!Number.isInteger(itemId)) return errorResponse('잘못된 항목 ID입니다', 400);

  const access = await checkLessonAccess(db, lessonId, user, { write: true });
  if (access instanceof Response) return access;

  // 항목이 정말 이 교재에 속하는지 확인 (다른 교재 항목을 건드리지 못하게)
  const existing = await db.prepare(
    `SELECT id FROM ${config.table} WHERE id = ? AND lesson_id = ?`
  ).bind(itemId, lessonId).first();
  if (!existing) return errorResponse('항목을 찾을 수 없습니다', 404);

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return errorResponse('요청 형식이 올바르지 않습니다', 400);
  }

  const invalid = validateBody(config, body);
  if (invalid) return errorResponse(invalid, 400);

  const row = config.toRow(body);

  if (config.beforeUpdate) {
    const conflict = await config.beforeUpdate(db, lessonId, row, itemId);
    if (conflict) return errorResponse(conflict, 409);
  }

  const setClause = Object.keys(row).map(c => `${c} = ?`).join(', ');
  await db.prepare(
    `UPDATE ${config.table} SET ${setClause} WHERE id = ? AND lesson_id = ?`
  ).bind(...Object.values(row), itemId, lessonId).run();

  await touchLesson(db, lessonId);

  const updated = await db.prepare(
    `SELECT ${config.selectColumns} FROM ${config.table} WHERE id = ?`
  ).bind(itemId).first();

  return jsonResponse(config.toJson(updated));
}

/**
 * 항목 삭제: DELETE /api/lessons/:id/<type>/:itemId
 */
export async function handleDeleteItem(context, typeKey) {
  const config = ITEM_TYPES[typeKey];
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const lessonId = Number(context.params.id);
  const itemId = Number(context.params.itemId);
  if (!Number.isInteger(itemId)) return errorResponse('잘못된 항목 ID입니다', 400);

  const access = await checkLessonAccess(db, lessonId, user, { write: true });
  if (access instanceof Response) return access;

  const existing = await db.prepare(
    `SELECT id FROM ${config.table} WHERE id = ? AND lesson_id = ?`
  ).bind(itemId, lessonId).first();
  if (!existing) return errorResponse('항목을 찾을 수 없습니다', 404);

  await db.prepare(
    `DELETE FROM ${config.table} WHERE id = ? AND lesson_id = ?`
  ).bind(itemId, lessonId).run();

  // 문장/단어를 지우면 그것을 가리키던 북마크도 함께 정리한다.
  if (typeKey === 'sentence') {
    await db.prepare(`DELETE FROM bookmarks WHERE type = 'sentence' AND ref_id = ?`).bind(itemId).run();
  } else if (typeKey === 'vocabulary') {
    await db.prepare(`DELETE FROM bookmarks WHERE type = 'word' AND ref_id = ?`).bind(itemId).run();
  }

  await touchLesson(db, lessonId);

  return jsonResponse({ ok: true, deletedId: itemId });
}
