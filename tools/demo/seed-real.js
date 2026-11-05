// 데모 데이터: 「2026 오스템문고 대출현황」 시트 원본(2026-11-05). 공개 페이지라 다른 이용자 이름만 가운데 글자를 가림(김*원), 본인(29011301 장유영)은 실명.
// 희망도서는 실제 신청 2건. 예시 데이터는 넣지 않습니다.
(function () {
  INITIAL_ADMIN_PASSWORD = 'demo1234';
  OLD_SHEET_ID = 'DEMO_OLD';
  var M = window.__mock;
  if (window.__demoLoad()) { _tables = {}; _cats = null; _empMap = null; return; }
  // 기존 「2026 오스템문고 대출현황」 시트를 그대로 넣고, 실제 서비스와 같은 이관(setup)을 실행
  var O = window.__OLD, old = new M.Spreadsheet('DEMO_OLD', '2026 오스템문고 대출현황');
  old.sheets = [new M.Sheet('오스템도서분류', window.__CATS, 1), new M.Sheet('도서목록', O.books, 2), new M.Sheet('대출현황', O.loans, 3)];
  M.files.DEMO_OLD = old;
  setupImpl_();
  var db = M.files.DEMO_DB;
  var PEOPLE = [['29011301', '장유영', '인재개발팀']];
  db.getSheetByName('사원명부').data = [['사번', '성명', '소속', '이메일']].concat(PEOPLE.map(function (p) { return [p[0], p[1], p[2], 'demo-' + p[0].toLowerCase() + '@example.com']; }));
  _tables = {}; _cats = null; _empMap = null;
  _tables = {}; _cats = null; _empMap = null; matchEmployees_(); _tables = {};
  var today = today_();
  // 희망도서: 실제 신청 2건 → 구매 투표 진행
  save_('requests', [
    { id: 'req-ga4', createdAt: nowIso_(), title: '모두의 구글 애널리틱스 4', author: '김도연', publisher: '길벗', reason: '', empNo: '29011301', status: '접수', roundId: '', votes: 0, adminMemo: '', bookCode: '', decidedAt: '' },
    { id: 'req-ax', createdAt: nowIso_(), title: '인간과 봇이 협력하는 AX경영', author: '', publisher: '', reason: 'AI 해커톤을 계기로 부서마다 AX 전환을 고민하고 있어요. 사람과 AI가 일을 어떻게 나눠 맡을지 함께 읽고 이야기 나누기 좋은 책이라 추천합니다.', empNo: '29011301', status: '접수', roundId: '', votes: 0, adminMemo: '', bookCode: '', decidedAt: '' }]);
  _tables = {};
  createRound_({ title: today.slice(0, 7).replace('-', '년 ') + '월 희망도서 투표', candidates: ['req-ga4', 'req-ax'], endDate: addDays_(today, 7), maxVotes: 1, buyCount: 1 }, '장유영');
  _tables = {}; _cats = null; _empMap = null;
  window.__demoSave();
})();
