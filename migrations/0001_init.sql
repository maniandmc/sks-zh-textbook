-- ============================================================
-- migrations/0001_init.sql
-- 1단계: 인증 + 클래스 스키마
-- (교재/문장/단어/문법/문제/진도율/북마크는 2단계에서 추가)
-- ============================================================

-- 사용자: 교사 또는 학생. 학생은 교사가 만들어준 계정으로 로그인.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  display_name  TEXT NOT NULL,
  created_by    INTEGER REFERENCES users(id), -- 학생 계정을 만든 교사 (교사 본인은 NULL)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 클래스: 교사가 생성. join_code로 학생이 가입.
CREATE TABLE IF NOT EXISTS classes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  join_code  TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 클래스 멤버십: 학생 1명이 여러 클래스에 동시 소속 가능 (N:M)
CREATE TABLE IF NOT EXISTS class_members (
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, student_id)
);

-- 세션: 쿠키 기반 로그인 유지. (JWT 대신 단순 세션 테이블 — 무료 티어에서 충분히 가볍고, 즉시 로그아웃/폐기가 쉬움)
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_class_members_student ON class_members(student_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);
