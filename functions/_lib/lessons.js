// functions/_lib/lessons.js
//
// 교재(단원) 접근 권한 판단과 조회/직렬화를 한 곳에 모은 모듈.
//
// 권한 규칙 (요구사항):
//   - 클래스 교재 (owner_type='class')
//       · 담당 교사        → 읽기 O, 쓰기 O
//       · 그 클래스 학생   → 읽기 O, 쓰기 X
//       · 그 외            → 접근 불가
//   - 개인 교재 (owner_type='student')
//       · 본인            → 읽기 O, 쓰기 O
//       · 그 외            → 접근 불가 (교사도 남의 개인 교재는 못 봄)
//
// 모든 교재 관련 API는 반드시 이 모듈의 checkLessonAccess()를 통과해야 한다.

import { errorResponse } from './auth.js';

/**
 * 교재 1건을 조회한다. 없으면 null.
 */
export async function getLessonRow(db, lessonId) {
  return db.prepare(
    `SELECT id, owner_type, owner_id, title, chinese_title, korean_title,
            sort_order, copied_from_lesson_id, created_at, updated_at
     FROM lessons WHERE id = ?`
  ).bind(lessonId).first();
}

/**
 * 사용자가 해당 교재에 대해 갖는 권한을 판정한다.
 * 반환: { canRead: boolean, canWrite: boolean }
 */
export async function getLessonPermission(db, lesson, user) {
  if (!lesson || !user) return { canRead: false, canWrite: false };

  if (lesson.owner_type === 'student') {
    const isOwner = lesson.owner_id === user.id;
    return { canRead: isOwner, canWrite: isOwner };
  }

  // owner_type === 'class'
  const cls = await db.prepare(
    `SELECT id, teacher_id FROM classes WHERE id = ?`
  ).bind(lesson.owner_id).first();

  if (!cls) return { canRead: false, canWrite: false };

  if (user.role === 'teacher') {
    const isOwnClass = cls.teacher_id === user.id;
    return { canRead: isOwnClass, canWrite: isOwnClass };
  }

  // 학생: 해당 클래스에 가입되어 있으면 읽기만 가능
  const membership = await db.prepare(
    `SELECT 1 FROM class_members WHERE class_id = ? AND student_id = ?`
  ).bind(cls.id, user.id).first();

  return { canRead: !!membership, canWrite: false };
}

/**
 * 교재 접근 권한을 확인하는 표준 진입점.
 * 성공 시 { lesson, permission }을 반환하고, 실패 시 Response를 반환한다.
 *
 *   const access = await checkLessonAccess(env.DB, lessonId, user, { write: true });
 *   if (access instanceof Response) return access;
 *   const { lesson } = access;
 */
export async function checkLessonAccess(db, lessonId, user, { write = false } = {}) {
  if (!Number.isInteger(lessonId)) {
    return errorResponse('잘못된 교재 ID입니다', 400);
  }

  const lesson = await getLessonRow(db, lessonId);
  if (!lesson) return errorResponse('교재를 찾을 수 없습니다', 404);

  const permission = await getLessonPermission(db, lesson, user);

  // 읽기 권한조차 없으면 존재 여부를 숨기기 위해 404로 응답한다.
  if (!permission.canRead) return errorResponse('교재를 찾을 수 없습니다', 404);
  if (write && !permission.canWrite) {
    return errorResponse('이 교재를 수정할 권한이 없습니다', 403);
  }

  return { lesson, permission };
}

/**
 * 사용자가 쓰기 권한을 갖는 소유 범위(scope)인지 확인한다.
 * 교재를 새로 만들 때(아직 lesson row가 없을 때) 사용한다.
 *   scope 예: { ownerType: 'class', ownerId: 3 }
 */
export async function canCreateLessonIn(db, ownerType, ownerId, user) {
  if (ownerType === 'student') {
    return ownerId === user.id; // 자기 개인 교재에만 생성 가능
  }
  if (ownerType === 'class') {
    if (user.role !== 'teacher') return false;
    const cls = await db.prepare(
      `SELECT teacher_id FROM classes WHERE id = ?`
    ).bind(ownerId).first();
    return !!cls && cls.teacher_id === user.id;
  }
  return false;
}

/**
 * 교재의 전체 내용(문장/단어/문법/문제)을 읽어 프론트엔드가 쓰던 JSON 형태로 직렬화한다.
 * 기존 프론트 코드(data/lesson01.json 구조)와 키 이름을 맞춰두면 3단계 연동이 쉬워진다.
 */
export async function serializeLessonFull(db, lesson) {
  const [sentences, vocabulary, grammar, quiz] = await Promise.all([
    db.prepare(
      `SELECT id, chinese, pinyin, translation FROM sentences
       WHERE lesson_id = ? ORDER BY sort_order ASC, id ASC`
    ).bind(lesson.id).all(),
    db.prepare(
      `SELECT id, word, pinyin, part_of_speech, meaning, example FROM vocabulary
       WHERE lesson_id = ? ORDER BY sort_order ASC, id ASC`
    ).bind(lesson.id).all(),
    db.prepare(
      `SELECT id, title, description, example, translation FROM grammar_points
       WHERE lesson_id = ? ORDER BY sort_order ASC, id ASC`
    ).bind(lesson.id).all(),
    db.prepare(
      `SELECT id, question, options_json, answer_index, explanation FROM quiz_questions
       WHERE lesson_id = ? ORDER BY sort_order ASC, id ASC`
    ).bind(lesson.id).all(),
  ]);

  return {
    id: lesson.id,
    ownerType: lesson.owner_type,
    ownerId: lesson.owner_id,
    title: lesson.title,
    chineseTitle: lesson.chinese_title,
    koreanTitle: lesson.korean_title,
    copiedFromLessonId: lesson.copied_from_lesson_id,
    sentences: sentences.results.map(s => ({
      id: s.id,
      chinese: s.chinese,
      pinyin: s.pinyin,
      translation: s.translation,
    })),
    vocabulary: vocabulary.results.map(v => ({
      id: v.id,
      word: v.word,
      pinyin: v.pinyin,
      partOfSpeech: v.part_of_speech,
      meaning: v.meaning,
      example: v.example || '',
    })),
    grammar: grammar.results.map((g, i) => ({
      id: g.id,
      number: String(i + 1).padStart(2, '0'),
      title: g.title,
      description: g.description,
      example: g.example,
      translation: g.translation,
    })),
    quiz: quiz.results.map(q => ({
      id: q.id,
      question: q.question,
      options: safeParseOptions(q.options_json),
      answerIndex: q.answer_index,
      explanation: q.explanation,
    })),
  };
}

function safeParseOptions(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * 교재의 updated_at을 현재 시각으로 갱신한다. (하위 항목 변경 시 호출)
 */
export async function touchLesson(db, lessonId) {
  await db.prepare(
    `UPDATE lessons SET updated_at = datetime('now') WHERE id = ?`
  ).bind(lessonId).run();
}

/**
 * 특정 테이블에서 해당 교재의 다음 정렬 순서값을 구한다.
 */
export async function nextSortOrder(db, table, lessonId) {
  // table은 내부 코드에서만 넘기는 고정 문자열이므로 SQL 주입 위험 없음
  const row = await db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM ${table} WHERE lesson_id = ?`
  ).bind(lessonId).first();
  return row ? row.next : 0;
}
