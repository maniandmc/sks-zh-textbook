-- ============================================================
-- migrations/0004_hsk_answer.sql
-- 4단계: HSK 독해 문제에 정답(answer_index) 추가
--
-- quiz_questions.answer_index와 같은 방식(0=A, 1=B, 2=C, 3=D).
-- 기존 문제에는 정답이 없을 수 있으므로 NULL 허용 (nullable) — 새로
-- 등록/수정하는 문제는 관리 화면에서 필수로 받는다.
-- 학생에게는 이 값을 절대 내려주지 않는다 (교사 화면에서만 조회).
-- ============================================================

ALTER TABLE hsk_reading_questions ADD COLUMN answer_index INTEGER;
