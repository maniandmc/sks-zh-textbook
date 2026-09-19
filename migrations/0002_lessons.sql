-- ============================================================
-- migrations/0002_lessons.sql
-- 2단계: 교재(단원) 및 학습 데이터 스키마
-- ============================================================

-- 교재(단원).
--   owner_type = 'class'   → owner_id는 classes.id  (담당 교사만 편집, 소속 학생은 읽기 전용)
--   owner_type = 'student' → owner_id는 users.id    (그 학생 본인만 편집 가능한 개인 교재)
CREATE TABLE IF NOT EXISTS lessons (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type     TEXT NOT NULL CHECK (owner_type IN ('class', 'student')),
  owner_id       INTEGER NOT NULL,
  title          TEXT NOT NULL,           -- 예: 第一课
  chinese_title  TEXT NOT NULL,           -- 예: 中国人的家庭观念
  korean_title   TEXT NOT NULL,           -- 예: 중국인의 가족관념
  sort_order     INTEGER NOT NULL DEFAULT 0,
  -- 어떤 교재를 복사해서 만들었는지 기록만 해둔다(추적용).
  -- 복사는 스냅샷이며, 원본이 이후 수정되어도 복사본은 영향받지 않는다.
  copied_from_lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lessons_owner ON lessons(owner_type, owner_id, sort_order);

-- 본문 문장
CREATE TABLE IF NOT EXISTS sentences (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id   INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  chinese     TEXT NOT NULL,
  pinyin      TEXT NOT NULL,
  translation TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sentences_lesson ON sentences(lesson_id, sort_order);

-- 단어
CREATE TABLE IF NOT EXISTS vocabulary (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id       INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  word            TEXT NOT NULL,
  pinyin          TEXT NOT NULL,
  part_of_speech  TEXT NOT NULL,
  meaning         TEXT NOT NULL,
  example         TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  -- 같은 단원 안에서 같은 단어가 중복 등록되지 않도록
  UNIQUE (lesson_id, word)
);

CREATE INDEX IF NOT EXISTS idx_vocabulary_lesson ON vocabulary(lesson_id, sort_order);

-- 문법
CREATE TABLE IF NOT EXISTS grammar_points (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id   INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  example     TEXT NOT NULL,
  translation TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_grammar_lesson ON grammar_points(lesson_id, sort_order);

-- 연습문제. options는 JSON 배열 문자열로 저장한다.
-- (D1은 SQLite이므로 배열 타입이 없고, 보기는 항상 문제와 함께 통째로 읽고 쓰므로
--  별도 테이블로 정규화할 실익이 적다.)
CREATE TABLE IF NOT EXISTS quiz_questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id    INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  question     TEXT NOT NULL,
  options_json TEXT NOT NULL,
  answer_index INTEGER NOT NULL,
  explanation  TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quiz_lesson ON quiz_questions(lesson_id, sort_order);

-- 학습 진도율: 학생별 × 교재별
CREATE TABLE IF NOT EXISTS progress (
  student_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  text_done    INTEGER NOT NULL DEFAULT 0,
  vocab_done   INTEGER NOT NULL DEFAULT 0,
  grammar_done INTEGER NOT NULL DEFAULT 0,
  quiz_done    INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, lesson_id)
);

-- 북마크: 학생별. type='sentence'면 ref_id는 sentences.id, type='word'면 vocabulary.id
CREATE TABLE IF NOT EXISTS bookmarks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('sentence', 'word')),
  ref_id     INTEGER NOT NULL,
  lesson_id  INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, type, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_student ON bookmarks(student_id, type);
