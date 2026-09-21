// functions/_lib/hsk-units.js
//
// HSK 독해 단원 접근 권한 판단과 조회/직렬화를 한 곳에 모은 모듈.
// lessons.js의 class 소유 규칙과 완전히 같다 (HSK 단원은 항상 클래스 소유,
// 학생 개인 단원 개념은 없음):
//   담당 교사        → 읽기 O, 쓰기 O
//   그 클래스 학생   → 읽기 O, 쓰기 X
//   그 외            → 접근 불가

import { requireAnyUser, jsonResponse, errorResponse } from './auth.js';

// 부분 제목/지시문은 고정 문구라 DB에 저장하지 않고 여기 둔다.
export const PART_INSTRUCTIONS = {
  1: '第46-60题：请选出正确答案。',
  2: '第61-70题：请选出与试题内容一致的一项。',
  3: '第71-90题：请选出正确答案。',
};

export async function getUnitRow(db, unitId) {
  return db.prepare(
    `SELECT id, class_id, title, sort_order, created_at, updated_at
     FROM hsk_units WHERE id = ?`
  ).bind(unitId).first();
}

export async function getUnitPermission(db, unit, user) {
  if (!unit || !user) return { canRead: false, canWrite: false };

  const cls = await db.prepare(
    `SELECT id, teacher_id FROM classes WHERE id = ?`
  ).bind(unit.class_id).first();

  if (!cls) return { canRead: false, canWrite: false };

  if (user.role === 'teacher') {
    const isOwnClass = cls.teacher_id === user.id;
    return { canRead: isOwnClass, canWrite: isOwnClass };
  }

  const membership = await db.prepare(
    `SELECT 1 FROM class_members WHERE class_id = ? AND student_id = ?`
  ).bind(cls.id, user.id).first();

  return { canRead: !!membership, canWrite: false };
}

export async function checkUnitAccess(db, unitId, user, { write = false } = {}) {
  if (!Number.isInteger(unitId)) {
    return errorResponse('잘못된 단원 ID입니다', 400);
  }

  const unit = await getUnitRow(db, unitId);
  if (!unit) return errorResponse('단원을 찾을 수 없습니다', 404);

  const permission = await getUnitPermission(db, unit, user);

  if (!permission.canRead) return errorResponse('단원을 찾을 수 없습니다', 404);
  if (write && !permission.canWrite) {
    return errorResponse('이 단원을 수정할 권한이 없습니다', 403);
  }

  return { unit, permission };
}

/**
 * 클래스에 단원을 만들 권한이 있는지 확인한다 (담당 교사만).
 */
export async function canCreateUnitIn(db, classId, user) {
  if (user.role !== 'teacher') return false;
  const cls = await db.prepare(`SELECT teacher_id FROM classes WHERE id = ?`).bind(classId).first();
  return !!cls && cls.teacher_id === user.id;
}

/**
 * 단원이 아직 없어도(단원 목록 조회 시) 클래스 자체에 대한 읽기/쓰기 권한을 판정한다.
 */
export async function getClassPermission(db, classId, user) {
  const cls = await db.prepare(`SELECT id, teacher_id FROM classes WHERE id = ?`).bind(classId).first();
  if (!cls) return { canRead: false, canWrite: false };

  if (user.role === 'teacher') {
    const isOwnClass = cls.teacher_id === user.id;
    return { canRead: isOwnClass, canWrite: isOwnClass };
  }

  const membership = await db.prepare(
    `SELECT 1 FROM class_members WHERE class_id = ? AND student_id = ?`
  ).bind(cls.id, user.id).first();
  return { canRead: !!membership, canWrite: false };
}

/**
 * 그룹이 속한 단원을 찾아 함께 반환한다 (그룹/문제 CRUD의 권한 확인에 사용).
 */
export async function getGroupWithUnit(db, groupId) {
  const group = await db.prepare(
    `SELECT id, unit_id, part, range, passage, image_url, sort_order
     FROM hsk_reading_groups WHERE id = ?`
  ).bind(groupId).first();
  if (!group) return null;
  const unit = await getUnitRow(db, group.unit_id);
  return { group, unit };
}

/**
 * 문제가 속한 그룹/단원을 찾아 함께 반환한다.
 */
export async function getQuestionWithGroupAndUnit(db, questionId) {
  const question = await db.prepare(
    `SELECT id, group_id, no, text, option_a, option_b, option_c, option_d, sort_order
     FROM hsk_reading_questions WHERE id = ?`
  ).bind(questionId).first();
  if (!question) return null;
  const groupWithUnit = await getGroupWithUnit(db, question.group_id);
  if (!groupWithUnit) return null;
  return { question, group: groupWithUnit.group, unit: groupWithUnit.unit };
}

export async function touchUnit(db, unitId) {
  await db.prepare(`UPDATE hsk_units SET updated_at = datetime('now') WHERE id = ?`).bind(unitId).run();
}

export async function nextGroupSortOrder(db, unitId) {
  const row = await db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM hsk_reading_groups WHERE unit_id = ?`
  ).bind(unitId).first();
  return row ? row.next : 0;
}

export async function nextQuestionSortOrder(db, groupId) {
  const row = await db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM hsk_reading_questions WHERE group_id = ?`
  ).bind(groupId).first();
  return row ? row.next : 0;
}

/**
 * 단원 전체를 HskReading.render()가 바로 받을 수 있는 형태로 직렬화한다.
 *   [{ part, instruction, groups: [{ id, range, passage, image, questions: [{ id, no, text, options }] }] }]
 * 그룹/문제가 하나도 없는 부분은 아예 빼서 빈 페이지가 나오지 않게 한다.
 */
export async function serializeUnitFull(db, unit, { includeAnswers = false } = {}) {
  const { results: groupRows } = await db.prepare(
    `SELECT id, part, range, passage, image_url, sort_order
     FROM hsk_reading_groups WHERE unit_id = ? ORDER BY part ASC, sort_order ASC, id ASC`
  ).bind(unit.id).all();

  const { results: questionRows } = await db.prepare(
    `SELECT q.id, q.group_id, q.no, q.text, q.option_a, q.option_b, q.option_c, q.option_d, q.answer_index, q.sort_order
     FROM hsk_reading_questions q
     JOIN hsk_reading_groups g ON g.id = q.group_id
     WHERE g.unit_id = ?
     ORDER BY q.sort_order ASC, q.id ASC`
  ).bind(unit.id).all();

  // 학생에게는 정답을 절대 내려주지 않는다 (답이 API 응답에 아예 없어야 개발자 도구로도 안 보임).
  const questionsByGroup = new Map();
  for (const q of questionRows) {
    if (!questionsByGroup.has(q.group_id)) questionsByGroup.set(q.group_id, []);
    questionsByGroup.get(q.group_id).push({
      id: q.id,
      no: q.no,
      text: q.text || undefined,
      options: [q.option_a, q.option_b, q.option_c, q.option_d],
      ...(includeAnswers ? { answerIndex: q.answer_index } : {}),
    });
  }

  const groupsByPart = new Map();
  for (const g of groupRows) {
    if (!groupsByPart.has(g.part)) groupsByPart.set(g.part, []);
    groupsByPart.get(g.part).push({
      id: g.id,
      part: g.part,
      range: g.range,
      passage: g.passage,
      image: g.image_url || undefined,
      questions: questionsByGroup.get(g.id) || [],
    });
  }

  const parts = [];
  for (const part of [1, 2, 3]) {
    if (!groupsByPart.has(part)) continue;
    parts.push({
      part,
      instruction: PART_INSTRUCTIONS[part],
      groups: groupsByPart.get(part),
    });
  }

  return {
    id: unit.id,
    classId: unit.class_id,
    title: unit.title,
    updatedAt: unit.updated_at,
    parts,
  };
}

function groupRowToJson(row) {
  return {
    id: row.id,
    part: row.part,
    range: row.range,
    passage: row.passage,
    image: row.image_url || undefined,
  };
}

function questionRowToJson(row) {
  return {
    id: row.id,
    no: row.no,
    text: row.text || undefined,
    options: [row.option_a, row.option_b, row.option_c, row.option_d],
    answerIndex: row.answer_index,
  };
}

function validateGroupBody(body) {
  const part = Number(body.part);
  if (![1, 2, 3].includes(part)) return '부분(1/2/3)을 올바르게 선택해주세요';
  if (!body.range || !String(body.range).trim()) return '문제 번호(예: 46-48)를 입력해주세요';
  if (!body.passage || !String(body.passage).trim()) return '지문을 입력해주세요';
  return null;
}

function groupBodyToRow(body) {
  return {
    part: Number(body.part),
    range: String(body.range).trim(),
    passage: String(body.passage).trim(),
    image_url: body.image ? String(body.image).trim() : null,
  };
}

function validateQuestionBody(body) {
  if (!Number.isInteger(Number(body.no))) return '문제 번호를 입력해주세요';
  for (const key of ['optionA', 'optionB', 'optionC', 'optionD']) {
    if (!body[key] || !String(body[key]).trim()) return '보기 A~D를 모두 입력해주세요';
  }
  if (![0, 1, 2, 3].includes(Number(body.answerIndex))) return '정답을 선택해주세요';
  return null;
}

function questionBodyToRow(body) {
  return {
    no: Number(body.no),
    text: body.text ? String(body.text).trim() : null,
    option_a: String(body.optionA).trim(),
    option_b: String(body.optionB).trim(),
    option_c: String(body.optionC).trim(),
    option_d: String(body.optionD).trim(),
    answer_index: Number(body.answerIndex),
  };
}

async function parseJsonBody(request) {
  try {
    return { body: await request.json() };
  } catch (e) {
    return { error: errorResponse('요청 형식이 올바르지 않습니다', 400) };
  }
}

/* ---------------- 그룹(지문 묶음) CRUD ---------------- */

export async function handleCreateGroup(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const unitId = Number(context.params.id);
  const access = await checkUnitAccess(db, unitId, user, { write: true });
  if (access instanceof Response) return access;

  const { body, error } = await parseJsonBody(context.request);
  if (error) return error;

  const invalid = validateGroupBody(body);
  if (invalid) return errorResponse(invalid, 400);

  const row = groupBodyToRow(body);
  const sortOrder = await nextGroupSortOrder(db, unitId);

  const result = await db.prepare(
    `INSERT INTO hsk_reading_groups (unit_id, part, range, passage, image_url, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(unitId, row.part, row.range, row.passage, row.image_url, sortOrder).run();

  await touchUnit(db, unitId);

  const created = await db.prepare(`SELECT * FROM hsk_reading_groups WHERE id = ?`).bind(result.meta.last_row_id).first();
  return jsonResponse(groupRowToJson(created), { status: 201 });
}

export async function handleUpdateGroup(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const unitId = Number(context.params.id);
  const groupId = Number(context.params.groupId);
  if (!Number.isInteger(groupId)) return errorResponse('잘못된 그룹 ID입니다', 400);

  const access = await checkUnitAccess(db, unitId, user, { write: true });
  if (access instanceof Response) return access;

  const existing = await db.prepare(
    `SELECT id FROM hsk_reading_groups WHERE id = ? AND unit_id = ?`
  ).bind(groupId, unitId).first();
  if (!existing) return errorResponse('그룹을 찾을 수 없습니다', 404);

  const { body, error } = await parseJsonBody(context.request);
  if (error) return error;

  const invalid = validateGroupBody(body);
  if (invalid) return errorResponse(invalid, 400);

  const row = groupBodyToRow(body);
  await db.prepare(
    `UPDATE hsk_reading_groups SET part = ?, range = ?, passage = ?, image_url = ?, updated_at = datetime('now')
     WHERE id = ? AND unit_id = ?`
  ).bind(row.part, row.range, row.passage, row.image_url, groupId, unitId).run();

  await touchUnit(db, unitId);

  const updated = await db.prepare(`SELECT * FROM hsk_reading_groups WHERE id = ?`).bind(groupId).first();
  return jsonResponse(groupRowToJson(updated));
}

export async function handleDeleteGroup(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const unitId = Number(context.params.id);
  const groupId = Number(context.params.groupId);
  if (!Number.isInteger(groupId)) return errorResponse('잘못된 그룹 ID입니다', 400);

  const access = await checkUnitAccess(db, unitId, user, { write: true });
  if (access instanceof Response) return access;

  const existing = await db.prepare(
    `SELECT id FROM hsk_reading_groups WHERE id = ? AND unit_id = ?`
  ).bind(groupId, unitId).first();
  if (!existing) return errorResponse('그룹을 찾을 수 없습니다', 404);

  await db.prepare(`DELETE FROM hsk_reading_groups WHERE id = ? AND unit_id = ?`).bind(groupId, unitId).run();
  await touchUnit(db, unitId);

  return jsonResponse({ success: true });
}

/* ---------------- 문제 CRUD ---------------- */

export async function handleCreateQuestion(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const unitId = Number(context.params.id);
  const groupId = Number(context.params.groupId);
  if (!Number.isInteger(groupId)) return errorResponse('잘못된 그룹 ID입니다', 400);

  const access = await checkUnitAccess(db, unitId, user, { write: true });
  if (access instanceof Response) return access;

  const group = await db.prepare(
    `SELECT id FROM hsk_reading_groups WHERE id = ? AND unit_id = ?`
  ).bind(groupId, unitId).first();
  if (!group) return errorResponse('그룹을 찾을 수 없습니다', 404);

  const { body, error } = await parseJsonBody(context.request);
  if (error) return error;

  const invalid = validateQuestionBody(body);
  if (invalid) return errorResponse(invalid, 400);

  const row = questionBodyToRow(body);
  const sortOrder = await nextQuestionSortOrder(db, groupId);

  const result = await db.prepare(
    `INSERT INTO hsk_reading_questions (group_id, no, text, option_a, option_b, option_c, option_d, answer_index, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(groupId, row.no, row.text, row.option_a, row.option_b, row.option_c, row.option_d, row.answer_index, sortOrder).run();

  await touchUnit(db, unitId);

  const created = await db.prepare(`SELECT * FROM hsk_reading_questions WHERE id = ?`).bind(result.meta.last_row_id).first();
  return jsonResponse(questionRowToJson(created), { status: 201 });
}

export async function handleUpdateQuestion(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const unitId = Number(context.params.id);
  const groupId = Number(context.params.groupId);
  const questionId = Number(context.params.questionId);
  if (!Number.isInteger(groupId) || !Number.isInteger(questionId)) {
    return errorResponse('잘못된 요청입니다', 400);
  }

  const access = await checkUnitAccess(db, unitId, user, { write: true });
  if (access instanceof Response) return access;

  const group = await db.prepare(
    `SELECT id FROM hsk_reading_groups WHERE id = ? AND unit_id = ?`
  ).bind(groupId, unitId).first();
  if (!group) return errorResponse('그룹을 찾을 수 없습니다', 404);

  const existing = await db.prepare(
    `SELECT id FROM hsk_reading_questions WHERE id = ? AND group_id = ?`
  ).bind(questionId, groupId).first();
  if (!existing) return errorResponse('문제를 찾을 수 없습니다', 404);

  const { body, error } = await parseJsonBody(context.request);
  if (error) return error;

  const invalid = validateQuestionBody(body);
  if (invalid) return errorResponse(invalid, 400);

  const row = questionBodyToRow(body);
  await db.prepare(
    `UPDATE hsk_reading_questions
     SET no = ?, text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, answer_index = ?, updated_at = datetime('now')
     WHERE id = ? AND group_id = ?`
  ).bind(row.no, row.text, row.option_a, row.option_b, row.option_c, row.option_d, row.answer_index, questionId, groupId).run();

  await touchUnit(db, unitId);

  const updated = await db.prepare(`SELECT * FROM hsk_reading_questions WHERE id = ?`).bind(questionId).first();
  return jsonResponse(questionRowToJson(updated));
}

export async function handleDeleteQuestion(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const unitId = Number(context.params.id);
  const groupId = Number(context.params.groupId);
  const questionId = Number(context.params.questionId);
  if (!Number.isInteger(groupId) || !Number.isInteger(questionId)) {
    return errorResponse('잘못된 요청입니다', 400);
  }

  const access = await checkUnitAccess(db, unitId, user, { write: true });
  if (access instanceof Response) return access;

  const existing = await db.prepare(
    `SELECT q.id FROM hsk_reading_questions q
     JOIN hsk_reading_groups g ON g.id = q.group_id
     WHERE q.id = ? AND q.group_id = ? AND g.unit_id = ?`
  ).bind(questionId, groupId, unitId).first();
  if (!existing) return errorResponse('문제를 찾을 수 없습니다', 404);

  await db.prepare(`DELETE FROM hsk_reading_questions WHERE id = ? AND group_id = ?`).bind(questionId, groupId).run();
  await touchUnit(db, unitId);

  return jsonResponse({ success: true });
}
