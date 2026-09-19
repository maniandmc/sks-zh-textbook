'use strict';

/* ============================================================
   parse-pasted-table.js — 엑셀/구글 시트/한셀에서 복사한 표(TSV)를
   파싱하는 순수 함수. UI와 완전히 분리되어 있어 브라우저(<script> 전역)와
   Node(단위 테스트, scripts/test-parse-pasted-table.js) 양쪽에서 그대로
   쓸 수 있다.

   열 순서: 단어 / 병음 / 품사 / 뜻 / 예문 (단어만 필수)
   ============================================================ */

const ParsePastedTable = (() => {

  const FIELD_NAMES = ['word', 'pinyin', 'partOfSpeech', 'meaning', 'example'];
  const MAX_COLUMNS = FIELD_NAMES.length;

  // 헤더 행으로 보이는 셀들이 흔히 쓰는 라벨 (한/영 혼용 대비)
  const HEADER_HINTS = [
    '단어', 'word', '한자',
    '병음', 'pinyin',
    '품사', 'pos',
    '뜻', '의미', 'meaning',
    '예문', 'example', 'sentence',
  ];

  /**
   * 탭(\t)을 열 구분자, 줄바꿈을 행 구분자로 하는 텍스트를 2차원 배열로 파싱한다.
   * 엑셀/구글 시트가 셀 안에 탭·줄바꿈·큰따옴표가 있을 때 그 셀을 큰따옴표로
   * 감싸고, 내부의 큰따옴표는 ""로 이스케이프하는 TSV 관례를 그대로 따른다.
   */
  function tokenizeRows(text) {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < normalized.length; i++) {
      const c = normalized[i];

      if (inQuotes) {
        if (c === '"') {
          if (normalized[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cell += c;
        }
        continue;
      }

      if (c === '"' && cell === '') {
        inQuotes = true;
        continue;
      }
      if (c === '\t') {
        row.push(cell);
        cell = '';
        continue;
      }
      if (c === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        continue;
      }
      cell += c;
    }

    row.push(cell);
    rows.push(row);
    return rows;
  }

  function looksLikeHeaderRow(cells) {
    const nonEmpty = cells.map(c => c.trim().toLowerCase()).filter(Boolean);
    if (nonEmpty.length === 0) return false;
    const hits = nonEmpty.filter(c => HEADER_HINTS.some(hint => c === hint || c.includes(hint)));
    return hits.length >= Math.max(1, Math.ceil(nonEmpty.length / 2));
  }

  /**
   * 붙여넣은 텍스트를 { word, pinyin, partOfSpeech, meaning, example } 배열로 변환한다.
   *
   * 반환값:
   *   - words: 파싱된 단어 배열 (원문 그대로 보존, trim만 적용)
   *   - looksLikeTable: 탭이 하나라도 있었는지 (false면 "표 형식이 아닌 것 같다" 안내용)
   *   - headerRemoved: 첫 행을 헤더로 판단해 제외했는지
   */
  function parsePastedTable(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return { words: [], looksLikeTable: true, headerRemoved: false };
    }

    const looksLikeTable = text.includes('\t');

    let rawRows = tokenizeRows(text)
      .map(row => row.map(cell => cell.trim()))
      .filter(row => row.some(cell => cell !== '')); // 완전히 빈 줄 무시

    let headerRemoved = false;
    if (rawRows.length > 0 && looksLikeHeaderRow(rawRows[0])) {
      rawRows = rawRows.slice(1);
      headerRemoved = true;
    }

    const words = rawRows.map(row => {
      const cols = row.slice(0, MAX_COLUMNS); // 6열 이후는 무시
      const entry = {};
      FIELD_NAMES.forEach((name, i) => {
        entry[name] = cols[i] || ''; // 부족한 열은 빈 값
      });
      return entry;
    });

    return { words, looksLikeTable, headerRemoved };
  }

  return { parsePastedTable, tokenizeRows, looksLikeHeaderRow };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ParsePastedTable;
}
