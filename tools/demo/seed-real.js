// 데모 데이터: 오스템문고 실제 장서·대출 현황(구글 시트 기준). 다른 이용자 이름은 가명, 본인(29011301 장유영)만 실명.
// 희망도서·투표·검색 기록은 기능을 보여주기 위한 예시입니다.
(function () {
  INITIAL_ADMIN_PASSWORD = 'demo1234';
  OLD_SHEET_ID = 'DEMO_OLD';
  var M = window.__mock;
  if (window.__demoLoad()) { _tables = {}; _cats = null; _empMap = null; return; }
  var old = new M.Spreadsheet('DEMO_OLD', '기존 시트'); old.sheets = []; M.files.DEMO_OLD = old;
  setupImpl_();
  var db = M.files.DEMO_DB;
  var lost = {};
  window.__LOANS.rows.forEach(function (r) { if (r[12] === '분실') lost[r[1]] = 1; });
  var bh = db.getSheetByName('도서').data[0];
  var bcol = function (h) { return bh.indexOf(h); };
  db.getSheetByName('도서').data = [bh].concat(window.__BOOKS.map(function (b) {
    var row = bh.map(function () { return ''; });
    [['도서코드', b[0]], ['분류번호', b[1]], ['구매번호', b[2]], ['권번호', b[3]], ['도서명', b[4]], ['저자', b[5]], ['출판사', b[6]], ['ISBN', b[7]], ['대출횟수', b[8]], ['상태', lost[b[0]] ? '분실' : '']]
      .forEach(function (kv) { row[bcol(kv[0])] = kv[1]; });
    return row;
  }));
  var lh = db.getSheetByName('대출').data[0], src = window.__LOANS;
  db.getSheetByName('대출').data = [lh].concat(src.rows.map(function (r) {
    var row = lh.map(function () { return ''; });
    src.header.forEach(function (h, i) { var j = lh.indexOf(h); if (j >= 0) row[j] = r[i]; });
    row[lh.indexOf('ID')] = 'L' + r[0] + '_' + r[1];
    row[lh.indexOf('등록경로')] = 'sheet';
    return row;
  }));
  var PEOPLE = [['29011301', '장유영', '인재개발팀'], ['D1001', '김하늘', '국내영업1팀'], ['D1002', '이도윤', '해외영업팀'], ['D1003', '박서연', '고객서비스팀'], ['D1004', '최민준', '마케팅기획팀'], ['D1005', '정유나', '연구개발1팀'],
    ['D1007', '오세린', '구매팀'], ['D1009', '서다은', '인재개발팀'], ['D1011', '강보라', '경영기획팀']];
  db.getSheetByName('사원명부').data = [['사번', '성명', '소속', '이메일']].concat(PEOPLE.map(function (p) { return [p[0], p[1], p[2], 'demo-' + p[0].toLowerCase() + '@example.com']; }));
  _tables = {}; _cats = null; _empMap = null;
  // 기존 시트에서 반납 처리가 빠진 기록은 [데이터 점검]과 같은 방식으로 정리
  var stale = dataCheck_().stale.map(function (l) { return l.id; });
  _tables = {}; fixStale_(stale, '데이터 점검'); _tables = {};
  var today = today_();
  // 희망도서 · 진행 중 투표 (예시)
  var R = [['양자컴퓨터 쉽게 이해하기', '김양자', 'D1005', 'R&D 신기술 스터디용'], ['ESG 경영 실무', '박지속', 'D1011', 'ESG 보고서 준비에 필요해요'], ['비즈니스 중국어 회화', '왕이', 'D1002', '중국 법인 출장 대비'],
    ['처음 팀장이 된 당신에게', '이리더', 'D1009', '신임 팀장 교육 교재로'], ['유튜브 마케팅 실전', '최콘텐', 'D1004', '제품 홍보 채널 운영'], ['클레임 응대의 기술', '정상담', 'D1003', '고객 불만 응대 사례 공부']];
  save_('requests', R.map(function (r, i) { return { id: 'req' + i, createdAt: today + 'T09:0' + i + ':00', title: r[0], author: r[1], publisher: '', reason: r[3], empNo: r[2], status: '접수', roundId: '', votes: 0, adminMemo: '', bookCode: '', decidedAt: '' }; }));
  _tables = {};
  createRound_({ title: today.slice(0, 7).replace('-', '년 ') + '월 희망도서 투표', candidates: ['req0', 'req1', 'req2', 'req3', 'req4'], endDate: addDays_(today, 6), maxVotes: 3, buyCount: 3 }, '데모');
  _tables = {};
  var rid = rows_('rounds')[0].id;
  [['D1001', ['req3', 'req1']], ['D1003', ['req3']], ['D1004', ['req4', 'req3']], ['D1005', ['req0', 'req1']], ['D1007', ['req1']], ['D1009', ['req3', 'req0', 'req1']], ['D1011', ['req1', 'req4']]]
    .forEach(function (v) { _tables = {}; vote_(rid, v[1], v[0]); });
  _tables = {};
  [['recommend', 'rnd', '', '양자컴퓨터 반도체', 0], ['search', '', '', '양자컴퓨터', 0], ['recommend', 'rnd', 'ai', '양자컴퓨터', 1], ['search', '', '', 'ESG', 0], ['recommend', 'support', '', 'ESG 지속가능', 1], ['search', '', '', 'ESG 보고서', 0],
    ['search', '', '', '중국어', 1], ['recommend', 'gsales', '', '중국어 회화', 1], ['search', '', '', '중국어', 1], ['recommend', 'cs', 'people', '클레임 응대', 2], ['search', '', '', '클레임', 0], ['recommend', 'cs', '', '클레임', 2],
    ['recommend', 'support', 'leader', '', 14], ['recommend', 'dsales', 'speak', '협상', 9], ['recommend', 'mkt', 'trend', '유튜브', 2], ['search', '', '', '유튜브', 0], ['recommend', 'prod', 'think', '', 11], ['recommend', 'scm', 'data', '엑셀', 7],
    ['recommend', 'support', 'ai', '', 16], ['recommend', 'support', 'report', '', 10], ['recommend', 'dsales', 'leader', '', 14], ['search', '', '', '메타버스', 1], ['search', '', '', '메타버스', 1]]
    .forEach(function (x) { logSearch_({ source: x[0], job: x[1], situations: x[2] ? [x[2]] : [], terms: x[3] ? x[3].split(' ') : [], hits: x[4] }); });
  _tables = {}; _cats = null; _empMap = null;
  window.__demoSave();
})();
