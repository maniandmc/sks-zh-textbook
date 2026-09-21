// functions/api/hsk-units/[id]/groups/index.js
// POST /api/hsk-units/:id/groups → 지문 그룹 추가 (담당 교사만)

import { handleCreateGroup } from '../../../../_lib/hsk-units.js';

export async function onRequestPost(context) {
  return handleCreateGroup(context);
}
