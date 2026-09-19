// functions/api/auth/logout.js
// POST /api/auth/logout → 현재 세션을 DB에서 삭제하고 쿠키 제거

import { getSessionTokenFromRequest, sessionCookieHeader, jsonResponse } from '../../_lib/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const token = getSessionTokenFromRequest(request);

  if (token) {
    await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
  }

  return jsonResponse(
    { ok: true },
    { headers: { 'Set-Cookie': sessionCookieHeader(null, { clear: true }) } }
  );
}
