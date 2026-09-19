// functions/api/auth/me.js
// GET /api/auth/me → 현재 세션의 로그인 사용자 정보 (없으면 user: null)
//
// 프론트엔드가 페이지를 새로 열 때마다 이 엔드포인트로 로그인 상태를 확인한다.
// 401을 던지지 않고 200 + null로 응답하는 이유: "로그인 안 된 상태"는 오류가
// 아니라 정상적으로 있을 수 있는 상태이기 때문 (첫 방문, 로그아웃 후 등).

import { requireUser, jsonResponse } from '../../_lib/auth.js';

export async function onRequestGet(context) {
  const user = await requireUser(context);
  return jsonResponse({ user });
}
