# 배포 가이드

이 문서는 인증(로그인) + 클래스 + 교재(단원/문장/단어/문법/문제) + 진도율/북마크까지
전부 구현된 현재 버전을 Cloudflare Pages에 배포하는 방법을 다룹니다. 프론트엔드도
전부 이 API에 연동되어 있어, 배포하면 바로 로그인 화면부터 쓸 수 있습니다.

## 1. 로컬에서 미리 확인하기 (권장)

배포 전에 로컬에서 한 번 돌려보면 실수를 줄일 수 있습니다.

```bash
npm install -g wrangler   # 이미 있다면 생략
cd chinese-textbook

# 로컬 D1 데이터베이스에 테이블 생성 (마이그레이션 2개 모두)
npx wrangler d1 execute chinese-textbook-db --local --file=migrations/0001_init.sql
npx wrangler d1 execute chinese-textbook-db --local --file=migrations/0002_lessons.sql
# (또는 한 번에:  npm run db:migrate:local)

# 최초 교사 계정 생성 (비밀번호 해시 만들기)
node scripts/hash-password.js "원하는비밀번호"
# 출력된 pbkdf2$... 문자열을 아래 명령에 붙여넣기
npx wrangler d1 execute chinese-textbook-db --local --command \
  "INSERT INTO users (username, password_hash, role, display_name) VALUES ('teacher1', '<해시>', 'teacher', '내이름');"

# 로컬 서버 실행 (wrangler.toml의 D1 바인딩을 그대로 사용)
npx wrangler pages dev .
```

`http://localhost:8788`에서 `/api/auth/me`, `/api/auth/login` 등이 응답하면 정상입니다.
(참고: `--d1 DB=...` 같은 CLI 플래그를 따로 주지 마세요. `wrangler.toml`에 이미 바인딩이
정의되어 있어서, CLI 플래그를 추가로 주면 **서로 다른 로컬 DB 파일**을 보게 되어
"no such table" 오류가 납니다.)

## 2. Cloudflare에 실제 D1 데이터베이스 만들기

```bash
npx wrangler login              # 브라우저에서 Cloudflare 계정 인증
npx wrangler d1 create chinese-textbook-db
```

실행하면 이런 출력이 나옵니다:

```
✅ Successfully created DB 'chinese-textbook-db'

[[d1_databases]]
binding = "DB"
database_name = "chinese-textbook-db"
database_id = "여기에-실제-UUID가-나옵니다"
```

이 `database_id` 값을 복사해서 **`wrangler.toml`의 `database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"`**
부분을 실제 값으로 바꿔주세요.

## 3. 원격(실제) D1에 마이그레이션 적용 + 교사 계정 생성

```bash
npx wrangler d1 execute chinese-textbook-db --remote --file=migrations/0001_init.sql
npx wrangler d1 execute chinese-textbook-db --remote --file=migrations/0002_lessons.sql
# (또는 한 번에:  npm run db:migrate:remote)

node scripts/hash-password.js "원하는비밀번호"
npx wrangler d1 execute chinese-textbook-db --remote --command \
  "INSERT INTO users (username, password_hash, role, display_name) VALUES ('teacher1', '<해시>', 'teacher', '내이름');"
```

`--local`이 아니라 `--remote`를 쓰는 것에 주의하세요 — 이번엔 실제 클라우드 DB에 적용됩니다.

## 4. Cloudflare Pages 프로젝트 생성 및 배포

**방법 A — Cloudflare 대시보드에서 GitHub 연동 (권장)**
1. 이 프로젝트를 GitHub 저장소로 푸시합니다 (`.wrangler/`는 `.gitignore`로 이미 제외됨).
2. Cloudflare 대시보드 → Workers & Pages → Create → Pages → "Connect to Git"으로 저장소를 선택합니다.
3. 빌드 설정: 빌드 명령어 없음(정적 파일이므로), 출력 디렉토리는 `/` (저장소 루트).
4. 배포 후 프로젝트 설정 → Functions → D1 database bindings에서 `DB` 바인딩을
   2단계에서 만든 `chinese-textbook-db`에 연결합니다. (`wrangler.toml`이 있어도
   Pages 대시보드에서 한 번 더 바인딩을 확인/연결해줘야 하는 경우가 있습니다.)

**방법 B — wrangler CLI로 직접 배포**
```bash
npx wrangler pages deploy . --project-name=chinese-textbook
```
최초 실행 시 프로젝트 생성 여부를 물어봅니다. 이후 배포 시 D1 바인딩은
`wrangler.toml`의 설정을 그대로 따라갑니다.

## 5. 배포 후 확인

배포된 도메인(`https://chinese-textbook.pages.dev` 형태)에서:
- 접속하면 로그인 화면이 뜨는지 확인
- 3단계에서 만든 교사 계정으로 로그인 확인
- 로그인 후 사이드바 "클래스"에서 클래스 생성 → 참여 코드 확인 → "학생 계정 만들기"로
  계정 발급까지 화면에서 바로 되는지 확인
- "교재 관리"에서 단원을 하나 추가하고, 학생 계정으로 로그인해 참여 코드로 가입한 뒤
  그 단원이 보이는지 확인

## 구현된 것

- **인증/클래스**: 로그인/로그아웃, 교사의 학생 계정 생성, 클래스 생성·가입
- **교재**: 단원 CRUD, 문장/단어/문법/문제 CRUD, 권한 체크(클래스 교재는 담당 교사만
  편집·소속 학생은 읽기 전용 / 개인 교재는 본인만), 클래스 교재를 개인 교재로 복사,
  진도율 조회·갱신·초기화, 북마크
- **프론트엔드**: 위 API에 전부 연동된 로그인 화면·클래스 화면·학습 화면·교재 관리
  화면. 사이드바는 클래스별/개인 교재별로 그룹핑되어 표시되고, 쓰기 권한이 없는
  교재는 편집 버튼 자체가 보이지 않습니다.

전체 API 목록과 요청/응답 형식은 `README-api.md`를 참고하세요.
