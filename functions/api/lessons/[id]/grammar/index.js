// functions/api/lessons/[id]/grammar/index.js
// POST /api/lessons/:id/grammar → 항목 추가
// 실제 처리는 _lib/lesson-items.js의 공통 핸들러가 담당한다.

import { handleCreateItem } from '../../../../_lib/lesson-items.js';

export async function onRequestPost(context) {
  return handleCreateItem(context, 'grammar');
}
