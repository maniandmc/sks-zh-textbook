// functions/api/auth/login.js
// POST /api/auth/login  { username, password } → 세션 쿠키 발급

import {
  verifyPassword, generateSessionToken, sessionExpiryDate,
  sessionCookieHeader, jsonResponse, errorResponse,
} from '../../_lib/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return errorResponse('요청 형식이 올바르지 않습니다', 400);
  }

  const username = (body.username || '').trim();
  const password = body.password || '';

  if (!username || !password) {
    return errorResponse('아이디와 비밀번호를 입력해주세요', 400);
  }

  const user = await env.DB.prepare(
    `SELECT id, username, password_hash, role, display_name FROM users WHERE username = ?`
  ).bind(username).first();

  // 사용자 존재 여부를 노출하지 않기 위해 동일한 오류 메시지 사용
  if (!user) {
    return errorResponse('아이디 또는 비밀번호가 올바르지 않습니다', 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return errorResponse('아이디 또는 비밀번호가 올바르지 않습니다', 401);
  }

  const token = generateSessionToken();
  const expiresAt = sessionExpiryDate();

  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`
  ).bind(token, user.id, expiresAt).run();

  return jsonResponse(
    { id: user.id, username: user.username, role: user.role, displayName: user.display_name },
    { headers: { 'Set-Cookie': sessionCookieHeader(token) } }
  );
}
