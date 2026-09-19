#!/usr/bin/env node
// scripts/hash-password.js
//
// 사용법: node scripts/hash-password.js "비밀번호"
//
// functions/_lib/auth.js의 hashPassword()와 정확히 동일한 알고리즘(PBKDF2,
// SHA-256, 100000회 반복)으로 해시를 생성한다. Node 18+ 에는 Web Crypto가
// globalThis.crypto로 내장되어 있어서, 브라우저/Workers용 코드를 그대로 재사용한다.

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password) {
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

const password = process.argv[2];
if (!password) {
  console.error('사용법: node scripts/hash-password.js "비밀번호"');
  process.exit(1);
}

hashPassword(password).then(hash => {
  console.log(hash);
});
