// functions/api/hsk-units/[id]/groups/[groupId]/questions/[questionId]/index.js
// PUT    /api/hsk-units/:id/groups/:groupId/questions/:questionId → 문제 수정 (담당 교사만)
// DELETE /api/hsk-units/:id/groups/:groupId/questions/:questionId → 문제 삭제 (담당 교사만)

import { handleUpdateQuestion, handleDeleteQuestion } from '../../../../../../../_lib/hsk-units.js';

export async function onRequestPut(context) {
  return handleUpdateQuestion(context);
}

export async function onRequestDelete(context) {
  return handleDeleteQuestion(context);
}
