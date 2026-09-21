-- ============================================================
-- migrations/0006_announcements.sql
-- 6단계: 홈 화면 공지사항 / 업데이트 소식
--
-- 클래스와 무관하게 로그인한 모든 사용자(교사·학생)에게 보이는
-- 전역 게시판. 이 시스템에는 별도의 "관리자" 역할이 없으므로,
-- 작성/수정/삭제는 교사 역할 전체에게 허용한다 (교사라면 누구든
-- 다른 교사가 올린 글도 수정·삭제할 수 있음 — 학교 전체가 함께
-- 쓰는 공용 게시판이기 때문).
-- ============================================================

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  category   TEXT NOT NULL CHECK (category IN ('notice', 'update')), -- notice=공지사항, update=업데이트 소식
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  author_id  INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_announcements_category ON announcements(category, created_at DESC);
