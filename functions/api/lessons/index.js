// functions/api/lessons/index.js
//
// GET  /api/lessons
//   로그인 사용자가 접근 가능한 교재 목록을 소유 범위별로 묶어서 반환한다.
//     교사: 자기가 담당하는 클래스별 교재 + 없음(교사는 개인 교재 개념 없음)
//     학생: 가입한 클래스별 교재(읽기 전용) + 자기 개인 교재(편집 가능)
//   쿼리로 좁히기: ?ownerType=class&ownerId=3  또는  ?ownerType=student&ownerId=<본인id>
//
// POST /api/lessons  { ownerType, ownerId, title, chineseTitle, koreanTitle }
//   교재 생성. 쓰기 권한이 있는 소유 범위에만 만들 수 있다.

import { requireAnyUser, jsonResponse, errorResponse } from '../../_lib/auth.js';
import { canCreateLessonIn, nextSortOrder } from '../../_lib/lessons.js';

export async function onRequestGet(context) {
  const authResult = await requireAnyUser(context);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const db = context.env.DB;

  const url = new URL(context.request.url);
  const filterOwnerType = url.searchParams.get('ownerType');
  const filterOwnerId = url.searchParams.get('ownerId')
    ? Number(url.searchParams.get('ownerId')) : null;

  // 사용자가 접근 가능한 (ownerType, ownerId) 범위를 먼저 구한다.
  const scopes = [];

  if (user.role === 'teacher') {
    const { results: classes } = await db.prepare(
      `SELECT id, name FROM classes WHERE teacher_id = ? ORDER BY created_at DESC`
    ).bind(user.id).all();
    classes.forEach(c => scopes.push({
      ownerType: 'class', ownerId: c.id, name: c.name, canWrite: true,
    }));
  } else {
    const { results: classes } = await db.prepare(
      `SELECT c.id, c.name FROM class_members m
       JOIN classes c ON c.id = m.class_id
       WHERE m.student_id = ? ORDER BY m.joined_at DESC`
    ).bind(user.id).all();
    classes.forEach(c => scopes.push({
      ownerType: 'class', ownerId: c.id, name: c.name, canWrite: false,
    }));
    // 학생 본인의 개인 교재 영역
    scopes.push({ ownerType: 'student', ownerId: user.id, name: '내 교재', canWrite: true });
  }

  const targetScopes = scopes.filter(s =>
    (!filterOwnerType || s.ownerType === filterOwnerType) &&
    (filterOwnerId === null || s.ownerId === filterOwnerId)
  );

  const groups = [];
  for (const scope of targetScopes) {
    const { results } = await db.prepare(
      `SELECT id, title, chinese_title, korean_title, sort_order, updated_at
       FROM lessons WHERE owner_type = ? AND owner_id = ?
       ORDER BY sort_order ASC, id ASC`
    ).bind(scope.ownerType, scope.ownerId).all();

    groups.push({
      ownerType: scope.ownerType,
      ownerId: scope.ownerId,
      name: scope.name,
      canWrite: scope.canWrite,
      lessons: results.map(l => ({
        id: l.id,
        title: l.title,
        chineseTitle: l.chinese_title,
        koreanTitle: l.korean_title,
        updatedAt: l.updated_at,
      })),
    });
  }

  return jsonResponse({ groups, role: user.role });
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

  const ownerType = body.ownerType;
  const ownerId = Number(body.ownerId);
  const title = (body.title || '').trim();
  const chineseTitle = (body.chineseTitle || '').trim();
  const koreanTitle = (body.koreanTitle || '').trim();

  if (!['class', 'student'].includes(ownerType) || !Number.isInteger(ownerId)) {
    return errorResponse('소유 범위가 올바르지 않습니다', 400);
  }
  if (!title || !chineseTitle || !koreanTitle) {
    return errorResponse('단원 번호, 중국어 제목, 한국어 제목을 모두 입력해주세요', 400);
  }

  const allowed = await canCreateLessonIn(db, ownerType, ownerId, user);
  if (!allowed) {
    return errorResponse('이 위치에 교재를 만들 권한이 없습니다', 403);
  }

  const sortOrder = await nextLessonSortOrder(db, ownerType, ownerId);

  const result = await db.prepare(
    `INSERT INTO lessons (owner_type, owner_id, title, chinese_title, korean_title, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(ownerType, ownerId, title, chineseTitle, koreanTitle, sortOrder).run();

  return jsonResponse({
    id: result.meta.last_row_id,
    ownerType, ownerId, title, chineseTitle, koreanTitle,
    sentences: [], vocabulary: [], grammar: [], quiz: [],
  }, { status: 201 });
}

async function nextLessonSortOrder(db, ownerType, ownerId) {
  const row = await db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM lessons
     WHERE owner_type = ? AND owner_id = ?`
  ).bind(ownerType, ownerId).first();
  return row ? row.next : 0;
}
