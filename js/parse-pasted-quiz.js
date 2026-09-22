'use strict';

/* ============================================================
   parse-pasted-quiz.js — AI가 만들어준 연습문제 텍스트를 파싱하는 순수 함수.
   UI와 완전히 분리되어 있어 브라우저(<script> 전역)와 Node(단위 테스트,
   scripts/test-parse-pasted-quiz.js) 양쪽에서 그대로 쓸 수 있다.

   기대하는 입력 형식 (문제 사이는 빈 줄로 구분):
     질문: 문제 내용
     A: 보기1
     B: 보기2
     C: 보기3
     D: 보기4
     정답: A
     해설: 해설 내용

   "Q:"(질문 대신), "설명:"(해설 대신), 소문자 라벨, 정답에 글자 대신
   보기 원문을 그대로 적은 경우까지 관대하게 인식한다.
   ============================================================ */

const ParsePastedQuiz = (() => {

  const LABEL_QUESTION = /^(?:질문|Q)\s*[:.)]?\s*/i;
  const LABEL_ANSWER = /^정답\s*[:.)]?\s*/;
  const LABEL_EXPLANATION = /^(?:해설|설명)\s*[:.)]?\s*/;
  const OPTION_KEYS = ['A', 'B', 'C', 'D'];
  const LABEL_OPTION = {
    A: /^A\s*[:.)]?\s*/i,
    B: /^B\s*[:.)]?\s*/i,
    C: /^C\s*[:.)]?\s*/i,
    D: /^D\s*[:.)]?\s*/i,
  };

  /**
   * 붙여넣은 텍스트를 문제 배열로 변환한다.
   * 반환값:
   *   - questions: { question, options:[4], answerIndex(0~3, 못 찾으면 -1), explanation } 배열
   *   - looksLikeQuizFormat: 라벨(질문/A~D/정답/해설)을 하나라도 인식했는지
   */
  function parsePastedQuiz(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return { questions: [], looksLikeQuizFormat: true };
    }

    const blocks = text
      .replace(/\r\n/g, '\n')
      .split(/\n\s*\n+/)
      .map(b => b.trim())
      .filter(Boolean);

    const questions = blocks.map(parseBlock).filter(Boolean);
    const looksLikeQuizFormat = questions.length > 0 || !text.trim();

    return { questions, looksLikeQuizFormat };
  }

  function parseBlock(block) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let question = '';
    const options = { A: '', B: '', C: '', D: '' };
    let answerRaw = '';
    let explanation = '';
    let current = null; // 'question' | 'A' | 'B' | 'C' | 'D' | 'answer' | 'explanation'
    let sawAnyLabel = false;

    for (const line of lines) {
      if (LABEL_QUESTION.test(line)) {
        question = line.replace(LABEL_QUESTION, '').trim();
        current = 'question';
        sawAnyLabel = true;
        continue;
      }

      const optionKey = OPTION_KEYS.find(key => LABEL_OPTION[key].test(line));
      if (optionKey) {
        options[optionKey] = line.replace(LABEL_OPTION[optionKey], '').trim();
        current = optionKey;
        sawAnyLabel = true;
        continue;
      }

      if (LABEL_ANSWER.test(line)) {
        answerRaw = line.replace(LABEL_ANSWER, '').trim();
        current = 'answer';
        sawAnyLabel = true;
        continue;
      }

      if (LABEL_EXPLANATION.test(line)) {
        explanation = line.replace(LABEL_EXPLANATION, '').trim();
        current = 'explanation';
        sawAnyLabel = true;
        continue;
      }

      // 라벨 없이 이어지는 줄(긴 질문/해설 등) — 직전 라벨에 이어붙인다.
      if (current === 'question') question += '\n' + line;
      else if (current === 'explanation') explanation += '\n' + line;
      else if (current && OPTION_KEYS.includes(current)) options[current] += ' ' + line;
    }

    if (!sawAnyLabel) return null; // 이 블록에서 알아볼 수 있는 내용이 전혀 없음

    const optionList = OPTION_KEYS.map(key => options[key].trim());

    return {
      question: question.trim(),
      options: optionList,
      answerIndex: resolveAnswerIndex(answerRaw, optionList),
      explanation: explanation.trim(),
    };
  }

  /** "A", "a)", 또는 보기 원문 그대로 적힌 정답 표기를 0~3 인덱스로 변환한다. 못 찾으면 -1. */
  function resolveAnswerIndex(answerRaw, optionList) {
    const letterMatch = answerRaw.trim().match(/^([A-Da-d])(?![A-Za-z])/);
    if (letterMatch) {
      return OPTION_KEYS.indexOf(letterMatch[1].toUpperCase());
    }
    const normalized = answerRaw.trim().toLowerCase();
    if (!normalized) return -1;
    return optionList.findIndex(o => o.trim().toLowerCase() === normalized);
  }

  return { parsePastedQuiz };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ParsePastedQuiz;
}
