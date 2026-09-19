# 교사 계정 만들기 (최초 계정 / 이후 계정 공통)

이 프로젝트는 "학생은 가입하지 않고, 교사가 계정을 만들어 아이디·비밀번호를 알려주는"
방식입니다. 그런데 그 교사 계정 자체는 누가 만드는가 — 하는 문제가 남는데,
**최초 교사 계정은 wrangler CLI로 직접 D1에 심습니다.** (2단계 이후에는 이미 있는
교사가 웹 화면에서 다른 교사를 초대하는 기능을 추가할 수도 있지만, 지금은 범위 밖입니다.)

## 1. 비밀번호 해시 생성

`functions/_lib/auth.js`의 해시 방식(PBKDF2)과 동일하게 아래 Node 스크립트로 해시를 만듭니다.
(Workers 런타임과 Node는 둘 다 Web Crypto의 PBKDF2를 지원하므로 결과가 호환됩니다.)

```bash
node scripts/hash-password.js "원하는비밀번호"
```

출력된 해시 문자열(`pbkdf2$100000$...$...`)을 복사해둡니다.

## 2. D1에 교사 계정 삽입

```bash
npx wrangler d1 execute chinese-textbook-db --remote --command \
  "INSERT INTO users (username, password_hash, role, display_name) VALUES ('teacher1', '여기에_해시_붙여넣기', 'teacher', '김선생');"
```

로컬 개발 DB에도 똑같이 넣고 싶다면 `--remote`를 빼고 실행하면 로컬 D1(`.wrangler/state`)에 들어갑니다.

## 3. 로그인 확인

배포된 사이트(또는 `wrangler pages dev`로 띄운 로컬 사이트)에서 방금 만든
아이디/비밀번호로 로그인해봅니다.

## 이후 학생 계정 만들기

한 번 교사로 로그인하면, 그 다음부터는 CLI가 아니라 **웹 화면에서**
"학생 계정 만들기" 기능(`POST /api/teacher/students`)을 통해 학생 계정을 발급합니다.
이 문서의 CLI 방식은 최초 교사 계정 하나를 만들 때만 필요합니다.
