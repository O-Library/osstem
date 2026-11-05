// 데모 데이터: 오스템문고 실제 장서·대출 현황(구글 시트 기준). 다른 이용자 이름은 가명, 본인(29011301 장유영)만 실명.
// 희망도서는 실제 신청 1건(모두의 구글 애널리틱스 4). 예시 데이터는 넣지 않습니다.
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
  var PEOPLE = [['29011301', '장유영', '인재개발팀']];
  db.getSheetByName('사원명부').data = [['사번', '성명', '소속', '이메일']].concat(PEOPLE.map(function (p) { return [p[0], p[1], p[2], 'demo-' + p[0].toLowerCase() + '@example.com']; }));
  _tables = {}; _cats = null; _empMap = null;
  // 기존 시트에서 반납 처리가 빠진 기록은 [데이터 점검]과 같은 방식으로 정리
  var stale = dataCheck_().stale.map(function (l) { return l.id; });
  _tables = {}; fixStale_(stale, '데이터 점검'); _tables = {};
  var today = today_();
  // 희망도서: 실제로 들어온 신청 1건 → 구매 투표 진행
  save_('requests', [{ id: 'req-ga4', createdAt: nowIso_(), title: '모두의 구글 애널리틱스 4', author: '김도연', publisher: '길벗', reason: '', empNo: '29011301', status: '접수', roundId: '', votes: 0, adminMemo: '', bookCode: '', decidedAt: '' }]);
  _tables = {};
  createRound_({ title: today.slice(0, 7).replace('-', '년 ') + '월 희망도서 투표', candidates: ['req-ga4'], endDate: addDays_(today, 7), maxVotes: 3, buyCount: 1 }, '장유영');
  _tables = {}; _cats = null; _empMap = null;
  window.__demoSave();
})();
