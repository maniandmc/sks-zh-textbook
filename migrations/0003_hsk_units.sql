-- ============================================================
-- migrations/0003_hsk_units.sql
-- 3단계: HSK 독해 단원 스키마
--
-- 클래스는 기존 classes/class_members 테이블을 그대로 재사용한다
-- (중국어 교재와 같은 클래스). HSK 단원은 항상 클래스 소유이며
-- (개인 교재 개념 없음), 권한 규칙은 lessons의 class 소유 규칙과 같다:
--   담당 교사        → 읽기 O, 쓰기 O
--   그 클래스 학생   → 읽기 O, 쓰기 X
-- ============================================================

-- HSK 단원 (예: "1단원", "2024년 3월 모의고사")
CREATE TABLE IF NOT EXISTS hsk_units (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hsk_units_class ON hsk_units(class_id, sort_order);

-- 독해 부분(제1/2/3부분) 안의 묶음 하나 (예: "46-48", "61", "71-74")
-- 부분 제목/지시문("第一部分", "第46-60题：...")은 고정 문구라 코드에 두고,
-- 여기에는 실제로 바뀌는 지문/이미지/보기만 저장한다.
CREATE TABLE IF NOT EXISTS hsk_reading_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id    INTEGER NOT NULL REFERENCES hsk_units(id) ON DELETE CASCADE,
  part       INTEGER NOT NULL CHECK (part IN (1, 2, 3)),
  range      TEXT NOT NULL,           -- 예: "46-48", "61", "71-74"
  passage    TEXT NOT NULL,
  image_url  TEXT,                    -- 제3부분 삽화 (선택)
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hsk_groups_unit ON hsk_reading_groups(unit_id, part, sort_order);

-- 그룹 안의 문제 하나 (4지선다 고정)
CREATE TABLE IF NOT EXISTS hsk_reading_questions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   INTEGER NOT NULL REFERENCES hsk_reading_groups(id) ON DELETE CASCADE,
  no         INTEGER NOT NULL,        -- 문제 번호 (예: 46)
  text       TEXT,                    -- 문항 지시문 (제1/2부분은 보통 비워둠)
  option_a   TEXT NOT NULL,
  option_b   TEXT NOT NULL,
  option_c   TEXT NOT NULL,
  option_d   TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hsk_questions_group ON hsk_reading_questions(group_id, sort_order);
