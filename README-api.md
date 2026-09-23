# API 레퍼런스

Cloudflare Pages Functions로 구현된 서버 API 목록입니다.
모든 응답은 JSON이며, 인증은 로그인 시 발급되는 `ctb_session` HttpOnly 쿠키로 유지됩니다.
프론트엔드에서 호출할 때는 `fetch(url, { credentials: 'same-origin' })`로 쿠키가 함께
전송되도록 해야 합니다.

## 권한 모델 (핵심)

| 교재 종류 | 담당 교사 | 소속 학생 | 그 외 |
|---|---|---|---|
| 클래스 교재 (`ownerType: 'class'`) | 읽기 O / 쓰기 O | 읽기 O / 쓰기 X | 접근 불가 |
| 개인 교재 (`ownerType: 'student'`) | 접근 불가 | 본인만 읽기 O / 쓰기 O | 접근 불가 |

- 접근 권한이 아예 없는 교재는 **403이 아니라 404**로 응답합니다 (교재 존재 자체를 숨김).
- 읽기는 되지만 쓰기가 안 되는 경우에만 403을 반환합니다.
- 교사는 **남의 개인 교재를 볼 수 없습니다** (학생의 사적 공간 보호).

---

## 인증

### `POST /api/auth/login`
```json
요청: { "username": "teacher1", "password": "..." }
응답: { "id": 1, "username": "teacher1", "role": "teacher", "displayName": "김선생" }
```
실패 시 401. 아이디가 없든 비밀번호가 틀리든 **동일한 메시지**를 반환합니다(계정 존재 여부 노출 방지).

### `POST /api/auth/logout`
```json
응답: { "ok": true }
```

### `GET /api/auth/me`
```json
응답: { "user": { "id": 1, "username": "...", "role": "teacher", "displayName": "..." } }
미로그인 시: { "user": null }   ← 401이 아니라 200입니다
```

---

## 교사 전용

### `POST /api/teacher/students`
학생 계정 생성. 학생은 스스로 가입하지 않습니다.
```json
요청: { "username": "student1", "password": "1234", "displayName": "홍길동" }
응답: { "id": 2, "username": "student1", "displayName": "홍길동", "role": "student" }
```
아이디 중복 시 409.

### `GET /api/teacher/students`
내가 만든 학생 계정 목록.

---

## 클래스

### `GET /api/classes`
교사면 담당 클래스(+학생 수), 학생이면 가입한 클래스(+담당 교사명) 목록.

### `POST /api/classes` (교사)
```json
요청: { "name": "중국어 1반" }
응답: { "id": 1, "name": "중국어 1반", "joinCode": "G49QBH", "studentCount": 0 }
```

### `POST /api/classes/join` (학생)
```json
요청: { "joinCode": "G49QBH" }
응답: { "id": 1, "name": "중국어 1반" }
```
잘못된 코드 404, 이미 가입 409. 한 학생이 **여러 클래스에 동시 가입 가능**합니다.

### `GET /api/classes/:id/students` (담당 교사만)
해당 클래스 학생 명단. 남의 클래스 조회 시 403.

### `DELETE /api/classes/:id/students/:studentId` (담당 교사만)
클래스에서 학생 제거(학생 계정 자체는 삭제되지 않음). 남의 클래스 403.

### `PUT /api/classes/:id` (담당 교사만)
```json
요청: { "name": "중국어 1반 (개편)" }
응답: { "id": 1, "name": "중국어 1반 (개편)" }
```

### `DELETE /api/classes/:id` (담당 교사만)
클래스와 그 클래스 소유의 모든 단원(문장/단어/문법/문제/진도율/북마크 포함)을 함께 삭제합니다.
가입한 학생들의 계정 자체는 삭제되지 않고, 클래스 멤버십만 사라집니다. 되돌릴 수 없습니다.

---

## 교재

### `GET /api/lessons`
접근 가능한 교재를 **소유 범위별로 그룹핑**해서 반환합니다.
```json
{
  "role": "student",
  "groups": [
    { "ownerType": "class", "ownerId": 1, "name": "중국어 1반",
      "canWrite": false, "lessons": [ { "id": 1, "title": "第一课", ... } ] },
    { "ownerType": "student", "ownerId": 2, "name": "내 교재",
      "canWrite": true, "lessons": [ ... ] }
  ]
}
```
`?ownerType=class&ownerId=1`로 특정 범위만 조회 가능.
`canWrite`로 화면에서 편집 UI 노출 여부를 판단하면 됩니다.

### `POST /api/lessons`
```json
요청: { "ownerType": "class", "ownerId": 1,
        "title": "第一课", "chineseTitle": "...", "koreanTitle": "..." }
```
쓰기 권한 없는 범위면 403.

### `GET /api/lessons/:id`
교재 전체 내용. 기존 `data/lesson01.json`과 **거의 동일한 구조**라 프론트 연동이 쉽습니다.
```json
{
  "canWrite": true,
  "lesson": {
    "id": 1, "ownerType": "class", "ownerId": 1,
    "title": "第一课", "chineseTitle": "...", "koreanTitle": "...",
    "copiedFromLessonId": null,
    "sentences":  [ { "id": 1, "chinese": "...", "pinyin": "...", "translation": "..." } ],
    "vocabulary": [ { "id": 1, "word": "家庭", "pinyin": "...", "partOfSpeech": "명사",
                      "meaning": "...", "example": "..." } ],
    "grammar":    [ { "id": 1, "number": "01", "title": "...", "description": "...",
                      "example": "...", "translation": "..." } ],
    "quiz":       [ { "id": 1, "question": "...", "options": ["..."],
                      "answerIndex": 1, "explanation": "..." } ]
  }
}
```
기존 localStorage 버전과의 차이: 각 항목의 `id`가 문자열이 아니라 **DB의 정수 ID**입니다.

### `PUT /api/lessons/:id`
```json
요청: { "title": "...", "chineseTitle": "...", "koreanTitle": "..." }
```

### `DELETE /api/lessons/:id`
하위 항목(문장/단어/문법/문제)과 관련 진도율·북마크가 함께 삭제됩니다(CASCADE).

### `POST /api/lessons/:id/copy` (학생 전용) ★
읽기 권한이 있는 교재를 **내 개인 교재로 복사**합니다.
```json
요청(선택): { "title": "...", "koreanTitle": "..." }   // 생략 시 원본 제목 + " (내 사본)"
응답: { "id": 2, "ownerType": "student", "ownerId": 2,
        "copiedFromLessonId": 1,
        "counts": { "sentences": 6, "vocabulary": 10, "grammar": 3, "quiz": 4 } }
```
**스냅샷 복사**입니다. 복사 후 원본이 수정되어도 복사본은 영향받지 않고, 그 반대도 마찬가지입니다.
`copiedFromLessonId`는 출처 기록용일 뿐 동기화에 쓰이지 않습니다.

---

## 교재 하위 항목

네 종류 모두 경로와 메서드 패턴이 같습니다. `<type>`은 `sentences` / `vocabulary` / `grammar` / `quiz`.

```
POST   /api/lessons/:id/<type>           항목 추가
PUT    /api/lessons/:id/<type>/:itemId   항목 수정
DELETE /api/lessons/:id/<type>/:itemId   항목 삭제
```

모두 해당 교재의 **쓰기 권한**이 필요합니다. 요청 바디:

| type | 필드 |
|---|---|
| `sentences` | `chinese`, `pinyin`, `translation` |
| `vocabulary` | `word`, `pinyin`, `partOfSpeech`, `meaning`, `example`(선택) |
| `grammar` | `title`, `description`, `example`, `translation` |
| `quiz` | `question`, `options`(배열, 2개 이상), `answerIndex`, `explanation` |

- 같은 단원 내 **단어 중복은 409**로 거부됩니다.
- `answerIndex`가 보기 범위를 벗어나면 400.
- 다른 교재에 속한 항목 ID를 넘기면 404 (교차 조작 방지).
- 문장·단어를 삭제하면 그것을 가리키던 **북마크도 자동 정리**됩니다.

---

## 진도율 (학생)

### `GET /api/lessons/:id/progress`
```json
{ "progress": { "textDone": true, "vocabDone": true,
                "grammarDone": false, "quizDone": false },
  "percent": 50, "tracked": true }
```
교사가 호출하면 `tracked: false`와 빈 진도를 반환합니다(오류 아님).

### `PUT /api/lessons/:id/progress`
```json
요청: { "textDone": true, "vocabDone": true }   // 전달한 필드만 갱신, 나머지는 유지
```

### `POST /api/lessons/:id/progress/reset` ★
이 교재의 내 진도율을 처음 상태로 되돌립니다.
```json
응답: { "progress": {...전부 false}, "percent": 0, "tracked": true, "reset": true }
```
**북마크는 지우지 않습니다** — 다시 공부한다고 저장해둔 문장까지 잃을 이유는 없기 때문입니다.

---

## 북마크 (학생)

### `GET /api/bookmarks`
```json
{ "sentences": [ { "id": 1, "lessonId": 1, "lessonTitle": "第一课",
                   "chinese": "...", "pinyin": "...", "translation": "..." } ],
  "words":     [ { "id": 1, "lessonId": 1, "lessonTitle": "第一课",
                   "word": "家庭", "pinyin": "...", "partOfSpeech": "...", "meaning": "..." } ] }
```

### `POST /api/bookmarks` — 토글
```json
요청: { "type": "sentence", "refId": 1 }    // type: "sentence" | "word"
응답: { "saved": true,  "type": "sentence", "refId": 1 }   // 추가됨
      { "saved": false, "type": "sentence", "refId": 1 }   // 이미 있어서 해제됨
```

### `DELETE /api/bookmarks` — 명시적 제거 (멱등)

읽기 권한이 없는 교재의 항목은 북마크할 수 없습니다(404).

---

## 오류 응답 형식

```json
{ "error": "사람이 읽을 수 있는 한국어 메시지" }
```

| 상태 | 의미 |
|---|---|
| 400 | 입력값 오류 |
| 401 | 미로그인 |
| 403 | 로그인했으나 권한 없음 (읽기는 되지만 쓰기 불가 등) |
| 404 | 대상 없음 **또는 접근 권한 자체가 없음** |
| 409 | 중복 (아이디, 단어, 클래스 재가입 등) |
