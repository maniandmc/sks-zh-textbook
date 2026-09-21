// functions/api/hsk-units/[id]/groups/[groupId]/index.js
// PUT    /api/hsk-units/:id/groups/:groupId → 그룹 수정 (담당 교사만)
// DELETE /api/hsk-units/:id/groups/:groupId → 그룹 삭제 (담당 교사만, 문제도 함께 삭제)

import { handleUpdateGroup, handleDeleteGroup } from '../../../../../_lib/hsk-units.js';

export async function onRequestPut(context) {
  return handleUpdateGroup(context);
}

export async function onRequestDelete(context) {
  return handleDeleteGroup(context);
}
