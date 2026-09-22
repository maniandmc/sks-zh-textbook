// scripts/test-parse-pasted-quiz.js
//
// parsePastedQuiz()에 대한 단위 테스트. 별도 테스트 프레임워크 없이
// Node 내장 test runner(node:test)만 사용한다.
//
// 실행: npm test  (또는 node --test scripts/test-parse-pasted-quiz.js)

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePastedQuiz } = require('../js/parse-pasted-quiz.js');

test('정상적인 문제 2개가 정확히 파싱된다', () => {
  const text = [
    '질문: "家庭"의 뜻은?',
    'A: 학교',
    'B: 가정',
    'C: 회사',
    'D: 병원',
    '정답: B',
    '해설: 家庭은 가정, 가족을 뜻한다.',
    '',
    '질문: "朋友"의 뜻은?',
    'A: 친구',
    'B: 선생님',
    'C: 부모',
    'D: 형제',
    '정답: A',
    '해설: 朋友는 친구를 뜻한다.',
  ].join('\n');

  const { questions } = parsePastedQuiz(text);
  assert.equal(questions.length, 2);
  assert.deepEqual(questions[0], {
    question: '"家庭"의 뜻은?',
    options: ['학교', '가정', '회사', '병원'],
    answerIndex: 1,
    explanation: '家庭은 가정, 가족을 뜻한다.',
  });
  assert.equal(questions[1].answerIndex, 0);
});

test('"Q:"와 "설명:" 라벨도 인식한다', () => {
  const text = [
    'Q: 다음 중 동사는?',
    'A: 家庭',
    'B: 学习',
    'C: 朋友',
    'D: 学校',
    '정답: B',
    '설명: 学习은 동사(배우다)이다.',
  ].join('\n');

  const { questions } = parsePastedQuiz(text);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].question, '다음 중 동사는?');
  assert.equal(questions[0].answerIndex, 1);
  assert.equal(questions[0].explanation, '学习은 동사(배우다)이다.');
});

test('소문자 라벨과 구두점 없는 라벨도 인식한다', () => {
  const text = [
    '질문 문제입니다',
    'a) 보기1',
    'b) 보기2',
    'c) 보기3',
    'd) 보기4',
    '정답 c',
    '해설 이것이 정답인 이유',
  ].join('\n');

  const { questions } = parsePastedQuiz(text);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].answerIndex, 2);
});

test('정답을 글자 대신 보기 원문 그대로 적어도 인식한다', () => {
  const text = [
    '질문: 수도는?',
    'A: 서울',
    'B: 베이징',
    'C: 도쿄',
    'D: 런던',
    '정답: 베이징',
    '해설: 중국의 수도는 베이징이다.',
  ].join('\n');

  const { questions } = parsePastedQuiz(text);
  assert.equal(questions[0].answerIndex, 1);
});

test('정답을 알아볼 수 없으면 -1을 반환한다', () => {
  const text = [
    '질문: 문제',
    'A: 1',
    'B: 2',
    'C: 3',
    'D: 4',
    '정답: 표시 안 됨',
    '해설: -',
  ].join('\n');

  const { questions } = parsePastedQuiz(text);
  assert.equal(questions[0].answerIndex, -1);
});

test('여러 줄에 걸친 질문과 해설이 이어붙여진다', () => {
  const text = [
    '질문: 아래 지문을 읽고 물음에 답하시오.',
    '중국인은 가족을 매우 중요하게 생각한다.',
    'A: 보기1',
    'B: 보기2',
    'C: 보기3',
    'D: 보기4',
    '정답: A',
    '해설: 첫 번째 이유는 다음과 같다.',
    '두 번째 이유는 다음과 같다.',
  ].join('\n');

  const { questions } = parsePastedQuiz(text);
  assert.equal(questions[0].question, '아래 지문을 읽고 물음에 답하시오.\n중국인은 가족을 매우 중요하게 생각한다.');
  assert.equal(questions[0].explanation, '첫 번째 이유는 다음과 같다.\n두 번째 이유는 다음과 같다.');
});

test('문제 사이에 빈 줄이 여러 개 있어도 정상 분리된다', () => {
  const text = [
    '질문: 첫 번째',
    'A: 1', 'B: 2', 'C: 3', 'D: 4',
    '정답: A',
    '해설: 첫 번째 해설',
    '',
    '',
    '',
    '질문: 두 번째',
    'A: 1', 'B: 2', 'C: 3', 'D: 4',
    '정답: B',
    '해설: 두 번째 해설',
  ].join('\n');

  const { questions } = parsePastedQuiz(text);
  assert.equal(questions.length, 2);
  assert.equal(questions[1].question, '두 번째');
});

test('알아볼 수 있는 라벨이 전혀 없는 블록은 무시된다', () => {
  const text = [
    '질문: 유효한 문제',
    'A: 1', 'B: 2', 'C: 3', 'D: 4',
    '정답: A',
    '해설: 이유',
    '',
    '---그냥 구분선---',
  ].join('\n');

  const { questions } = parsePastedQuiz(text);
  assert.equal(questions.length, 1);
});

test('빈 입력은 빈 배열을 반환한다', () => {
  const { questions } = parsePastedQuiz('');
  assert.equal(questions.length, 0);
  const { questions: q2 } = parsePastedQuiz('   \n  \n');
  assert.equal(q2.length, 0);
});
