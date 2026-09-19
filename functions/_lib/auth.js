// functions/_lib/auth.js
//
// 비밀번호 해시(PBKDF2, Web Crypto)와 세션 토큰 발급/검증 유틸.
// Cloudflare Pages Functions 런타임(Workers 런타임)에는 Node의 crypto가 아니라
// 표준 Web Crypto API(globalThis.crypto)가 있으므로 그걸 그대로 사용한다.
// bcrypt 등 외부 패키지를 쓰지 않는 이유: Workers 런타임에서 네이티브 모듈이
// 필요한 패키지는 동작하지 않거나 번들 크기가 커지기 때문.

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const SESSION_TOKEN_BYTES = 32;
const SESSION_TTL_DAYS = 30;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * 비밀번호를 PBKDF2로 해시한다. 결과 포맷: "pbkdf2$<iterations>$<salt-hex>$<hash-hex>"
 * salt를 결과 문자열에 함께 저장해두므로, 검증 시 별도 보관이 필요 없다.
 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(derivedBits)}`;
}

/**
 * 저장된 해시와 평문 비밀번호를 비교한다.
 */
export async function verifyPassword(password, storedHash) {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expectedHex = parts[3];

  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const actualHex = toHex(derivedBits);

  // 타이밍 공격 방지를 위한 상수 시간 비교
  if (actualHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) {
    diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 무작위 세션 토큰 문자열 생성 (URL-safe base64)
 */
export function generateSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function sessionExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_TTL_DAYS);
  return d.toISOString();
}

/**
 * 요청의 Cookie 헤더에서 세션 토큰을 꺼낸다.
 */
export function getSessionTokenFromRequest(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)ctb_session=([^;]+)/);
  return match ? match[1] : null;
}

export function sessionCookieHeader(token, { clear = false } = {}) {
  if (clear) {
    return `ctb_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  }
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  return `ctb_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/**
 * 세션 토큰으로 로그인한 사용자를 조회한다. 만료된 세션은 자동으로 정리한다.
 * 반환값: { id, username, role, display_name } | null
 */
export async function getUserFromSession(db, token) {
  if (!token) return null;

  const row = await db.prepare(
    `SELECT s.expires_at, u.id, u.username, u.role, u.display_name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  ).bind(token).first();

  if (!row) return null;

  if (new Date(row.expires_at) < new Date()) {
    // 만료된 세션은 정리하고 로그아웃 취급
    await db.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
    return null;
  }

  return { id: row.id, username: row.username, role: row.role, displayName: row.display_name };
}

/**
 * 요청에서 바로 로그인 사용자를 가져오는 헬퍼. 각 API 핸들러에서 반복되는
 * "쿠키 읽기 → 세션 조회" 과정을 한 줄로 줄여준다.
 */
export async function requireUser(context) {
  const token = getSessionTokenFromRequest(context.request);
  const user = await getUserFromSession(context.env.DB, token);
  return user; // null이면 미로그인
}

export function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(init.headers || {}),
    },
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, { status });
}

/**
 * 6자리 영숫자 참여 코드 생성 (교사가 학생에게 공유). 헷갈리기 쉬운 0/O, 1/I는 제외.
 */
export function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const randomValues = crypto.getRandomValues(new Uint8Array(6));
  for (let i = 0; i < 6; i++) {
    code += chars[randomValues[i] % chars.length];
  }
  return code;
}

/**
 * 로그인 + 역할(교사) 확인을 한 번에 처리하는 헬퍼.
 * 반환값이 Response면 그대로 리턴해서 요청을 중단시키고,
 * 사용자 객체면 정상 진행한다. 각 핸들러에서:
 *
 *   const authResult = await requireTeacher(context);
 *   if (authResult instanceof Response) return authResult;
 *   const teacher = authResult;
 */
export async function requireTeacher(context) {
  const user = await requireUser(context);
  if (!user) return errorResponse('로그인이 필요합니다', 401);
  if (user.role !== 'teacher') return errorResponse('교사 계정만 사용할 수 있습니다', 403);
  return user;
}

export async function requireAnyUser(context) {
  const user = await requireUser(context);
  if (!user) return errorResponse('로그인이 필요합니다', 401);
  return user;
}
