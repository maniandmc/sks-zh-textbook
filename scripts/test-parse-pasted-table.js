// scripts/test-parse-pasted-table.js
//
// parsePastedTable()에 대한 단위 테스트. 별도 테스트 프레임워크 없이
// Node 내장 test runner(node:test)만 사용한다.
//
// 실행: npm test  (또는 node --test scripts/test-parse-pasted-table.js)

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePastedTable, tokenizeRows } = require('../js/parse-pasted-table.js');

test('5x5 정상 표: 5개 행이 정확히 파싱된다', () => {
  const text = [
    '论语\tLúnyǔ\t명사\t논어\t《论语》是中国古代的重要著作。',
    '孔子\tKǒngzǐ\t명사\t공자\t孔子是伟大的思想家。',
    '学习\txuéxí\t동사\t학습하다\t我每天学习中文。',
    '朋友\tpéngyou\t명사\t친구\t他是我的好朋友。',
    '家庭\tjiātíng\t명사\t가정\t中国人非常重视家庭。',
  ].join('\n');

  const { words, looksLikeTable } = parsePastedTable(text);
  assert.equal(looksLikeTable, true);
  assert.equal(words.length, 5);
  assert.deepEqual(words[0], {
    word: '论语', pinyin: 'Lúnyǔ', partOfSpeech: '명사',
    meaning: '논어', example: '《论语》是中国古代的重要著作。',
  });
  assert.equal(words[4].word, '家庭');
});

test('헤더 행이 포함되면 자동으로 제외된다 (한글 헤더)', () => {
  const text = '단어\t병음\t품사\t뜻\t예문\n论语\tLúnyǔ\t명사\t논어\t예문1';
  const { words, headerRemoved } = parsePastedTable(text);
  assert.equal(headerRemoved, true);
  assert.equal(words.length, 1);
  assert.equal(words[0].word, '论语');
});

test('헤더 행이 포함되면 자동으로 제외된다 (영문 헤더)', () => {
  const text = 'Word\tPinyin\tPOS\tMeaning\tExample\n你好\tnǐ hǎo\t감탄사\t안녕\t你好！';
  const { words, headerRemoved } = parsePastedTable(text);
  assert.equal(headerRemoved, true);
  assert.equal(words.length, 1);
  assert.equal(words[0].word, '你好');
});

test('병음 이하 열이 없는 1열짜리(단어만) 표도 정상 처리된다', () => {
  const text = '论语\n孔子\n学习';
  const { words, looksLikeTable } = parsePastedTable(text);
  assert.equal(looksLikeTable, false); // 탭이 하나도 없음
  assert.equal(words.length, 3);
  assert.deepEqual(words[0], { word: '论语', pinyin: '', partOfSpeech: '', meaning: '', example: '' });
  assert.equal(words[2].word, '学习');
});

test('2열짜리(단어+병음) 표도 정상 처리된다', () => {
  const text = '论语\tLúnyǔ\n孔子\tKǒngzǐ';
  const { words } = parsePastedTable(text);
  assert.equal(words.length, 2);
  assert.deepEqual(words[0], { word: '论语', pinyin: 'Lúnyǔ', partOfSpeech: '', meaning: '', example: '' });
});

test('따옴표로 감싼 셀 안의 줄바꿈·쉼표·이스케이프된 따옴표가 보존된다', () => {
  const text = '论语\tLúnyǔ\t명사\t논어\t"孔子说：""学而时习之，不亦说乎？""\n这是论语的名句。"';
  const { words } = parsePastedTable(text);
  assert.equal(words.length, 1);
  assert.equal(
    words[0].example,
    '孔子说："学而时习之，不亦说乎？"\n这是论语的名句。'
  );
});

test('Windows 줄바꿈(\\r\\n)도 처리된다', () => {
  const text = '论语\tLúnyǔ\r\n孔子\tKǒngzǐ\r\n';
  const { words } = parsePastedTable(text);
  assert.equal(words.length, 2);
  assert.equal(words[1].word, '孔子');
});

test('완전히 빈 줄은 무시된다', () => {
  const text = '论语\tLúnyǔ\n\n\n孔子\tKǒngzǐ\n';
  const { words } = parsePastedTable(text);
  assert.equal(words.length, 2);
});

test('열이 5개보다 많으면 6열 이후는 무시된다', () => {
  const text = '论语\tLúnyǔ\t명사\t논어\t예문\t여분열\t여분열2';
  const { words } = parsePastedTable(text);
  assert.equal(words.length, 1);
  assert.equal(words[0].example, '예문');
});

test('각 셀의 앞뒤 공백은 trim된다', () => {
  const text = '  论语  \t Lúnyǔ \t 명사 \t 논어 ';
  const { words } = parsePastedTable(text);
  assert.equal(words[0].word, '论语');
  assert.equal(words[0].pinyin, 'Lúnyǔ');
});

test('빈 입력은 빈 배열을 반환한다', () => {
  const { words } = parsePastedTable('');
  assert.equal(words.length, 0);
  const { words: words2 } = parsePastedTable('   \n  \n');
  assert.equal(words2.length, 0);
});

test('tokenizeRows: 탭/줄바꿈 기본 분리가 정확하다', () => {
  const rows = tokenizeRows('a\tb\tc\nd\te\tf');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['d', 'e', 'f']]);
});
