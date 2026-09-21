// functions/api/hsk-units/[id]/groups/[groupId]/questions/index.js
// POST /api/hsk-units/:id/groups/:groupId/questions → 문제 추가 (담당 교사만)

import { handleCreateQuestion } from '../../../../../../_lib/hsk-units.js';

export async function onRequestPost(context) {
  return handleCreateQuestion(context);
}
