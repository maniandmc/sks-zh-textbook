-- ============================================================
-- migrations/0005_hsk_explanation.sql
-- 5단계: HSK 독해 문제에 해설(explanation) 추가
--
-- 학생/교사 모두 시험지 화면에서 보기를 클릭해 정답과 해설을 바로
-- 확인할 수 있게 되면서, 정답(answer_index)도 이제 두 역할 모두에게
-- 내려준다 (기존 quiz_questions의 "즉시 확인" 방식과 동일한 모델).
-- ============================================================

ALTER TABLE hsk_reading_questions ADD COLUMN explanation TEXT;
