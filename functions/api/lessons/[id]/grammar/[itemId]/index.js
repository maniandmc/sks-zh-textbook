// functions/api/lessons/[id]/grammar/[itemId]/index.js
// PUT    /api/lessons/:id/grammar/:itemId → 항목 수정
// DELETE /api/lessons/:id/grammar/:itemId → 항목 삭제

import { handleUpdateItem, handleDeleteItem } from '../../../../../_lib/lesson-items.js';

export async function onRequestPut(context) {
  return handleUpdateItem(context, 'grammar');
}

export async function onRequestDelete(context) {
  return handleDeleteItem(context, 'grammar');
}
