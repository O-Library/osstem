// ─────────────────────────────────────────────────────
// 시트 기반 저장소: "오스템문고 시스템 DB" 스프레드시트의 탭 = 테이블
// ─────────────────────────────────────────────────────
var TABLES = {
  books: { sheet: '도서', cols: [
    ['code', '도서코드'], ['catCode', '분류번호'], ['purchaseNo', '구매번호'], ['copyNo', '권번호'], ['title', '도서명'], ['author', '저자'],
    ['publisher', '출판사'], ['isbn', 'ISBN'], ['cover', '표지URL'], ['description', '소개'], ['pubDate', '출간일'], ['kdc', 'KDC'],
    ['status', '상태'], ['loanCount', '대출횟수'], ['createdAt', '등록일'], ['coverCheckedAt', '표지확인일']] },
  loans: { sheet: '대출', cols: [
    ['id', 'ID'], ['no', '번호'], ['bookCode', '도서코드'], ['titleKey', '책키'], ['bookTitle', '도서명'], ['empNo', '사번'], ['name', '성명'],
    ['team', '소속'], ['email', '이메일'], ['appliedAt', '신청일시'], ['loanDate', '대출일'], ['pickupDate', '수령일'], ['pickedUpAt', '수령확인일시'], ['dueDate', '반납예정일'],
    ['status', '상태'], ['returnRequestedAt', '반납신청일시'], ['returnedAt', '반납확인일'], ['returnedBy', '반납확인자'],
    ['extensions', '연장이력'], ['extensionRequest', '연장신청'], ['memo', '메모'], ['createdBy', '등록경로']] },
  reservations: { sheet: '예약', cols: [
    ['id', 'ID'], ['key', '책키'], ['title', '도서명'], ['empNo', '사번'], ['name', '성명'], ['team', '소속'], ['email', '이메일'],
    ['createdAt', '예약일시'], ['status', '상태'], ['notifiedAt', '알림일시']] },
  employees: { sheet: '사원명부', cols: [['empNo', '사번'], ['name', '성명'], ['team', '소속'], ['email', '이메일'], ['note', '비고']] },
  categories: { sheet: '분류', cols: [['code', '분류번호'], ['name', '분류명'], ['keywords', '키워드']] },
  mailLog: { sheet: '메일발송기록', cols: [
    ['at', '일시'], ['type', '종류'], ['to', '받는사람'], ['cc', '참조'], ['subject', '제목'], ['status', '결과'], ['error', '오류'],
    ['keys', '중복방지키'], ['html', '본문']] },
  // 익명 검색·추천 기록 (사번·이름 없음)
  searchLog: { sheet: '검색기록', cols: [['at', '일시'], ['source', '구분'], ['job', '직무그룹'], ['situations', '고민상황'], ['terms', '키워드'], ['hits', '관련보유도서수'], ['topScore', '최고점수']] },
  // 희망도서 신청 · 구매 투표
  requests: { sheet: '희망도서', cols: [
    ['id', 'ID'], ['createdAt', '신청일시'], ['title', '도서명'], ['author', '저자'], ['publisher', '출판사'], ['reason', '신청이유'],
    ['empNo', '신청자사번'], ['status', '상태'], ['roundId', '투표ID'], ['votes', '득표'], ['adminMemo', '담당자메모'], ['bookCode', '등록도서코드'], ['decidedAt', '처리일시']] },
  rounds: { sheet: '구매투표', cols: [
    ['id', 'ID'], ['title', '투표명'], ['startDate', '시작일'], ['endDate', '마감일'], ['maxVotes', '1인투표수'], ['buyCount', '구매권수'],
    ['candidates', '후보'], ['status', '상태'], ['createdAt', '생성일시'], ['createdBy', '생성자'], ['result', '결과']] },
  ballots: { sheet: '투표기록', cols: [['roundId', '투표ID'], ['empNo', '사번'], ['choices', '선택'], ['at', '일시']] },
};
var JSON_FIELDS = { extensions: 1, extensionRequest: 1, candidates: 1, choices: 1, result: 1 };
var STATUS_KO = { active: '대출중', returning: '반납확인중', returned: '반납완료', cancelled: '취소', lost: '분실', discarded: '폐기', waiting: '대기', fulfilled: '대출완료' };
var STATUS_EN = {}; Object.keys(STATUS_KO).forEach(function (k) { STATUS_EN[STATUS_KO[k]] = k; });

var _ss = null;
var _tables = {};

function props_() { return PropertiesService.getScriptProperties(); }

function db_() {
  if (_ss) return _ss;
  var id = props_().getProperty('DB_ID');
  if (!id) throw new AppError('아직 초기 설정(setup)이 실행되지 않았습니다. 관리자에게 문의하세요.');
  _ss = SpreadsheetApp.openById(id);
  return _ss;
}

function cellOut_(key, v) {
  if (v instanceof Date) {
    var hasTime = v.getHours() || v.getMinutes() || v.getSeconds();
    return Utilities.formatDate(v, TZ, hasTime ? "yyyy-MM-dd'T'HH:mm:ss" : 'yyyy-MM-dd');
  }
  if (JSON_FIELDS[key]) { var arr = key === 'extensions' || key === 'candidates' || key === 'choices'; if (v === '' || v == null) return arr ? [] : null; try { return JSON.parse(v); } catch (e) { return arr ? [] : null; } }
  if (key === 'status' && STATUS_EN[v]) return STATUS_EN[v];
  if (key === 'keywords') return String(v || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
  if (key === 'keys') return String(v || '').split(' ').filter(String);
  if (key === 'votes' || key === 'hits' || key === 'maxVotes' || key === 'buyCount') return v === '' ? 0 : Number(v);
  if (key === 'loanCount' || key === 'no') return v === '' ? (key === 'no' ? null : 0) : Number(v);
  if (key === 'to' || key === 'cc') return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  return v === null || v === undefined ? '' : String(v);
}

function cellIn_(key, v) {
  if (v === null || v === undefined) return '';
  if (JSON_FIELDS[key]) return (Array.isArray(v) && !v.length) || v === '' ? '' : JSON.stringify(v);
  if (key === 'status' && STATUS_KO[v]) return STATUS_KO[v];
  if (key === 'keywords') return (v || []).join(', ');
  if (key === 'keys') return (v || []).join(' ');
  if (key === 'to' || key === 'cc') return (v || []).join(', ');
  if (key === 'html') return String(v).slice(0, 20000);
  return v;
}

function table_(name) {
  if (_tables[name]) return _tables[name];
  var def = TABLES[name];
  var sh = db_().getSheetByName(def.sheet);
  if (!sh) sh = ensureSheet_(db_(), def); // 새 기능의 탭은 처음 쓸 때 자동 생성
  var values = sh.getDataRange().getValues();
  var header = values[0] || [];
  var idx = def.cols.map(function (c) { return header.indexOf(c[1]); });
  // 새 버전에서 늘어난 칸은 기존 탭 오른쪽 끝에 머리글을 붙여 둠
  var miss = def.cols.filter(function (c, i) { return idx[i] < 0; });
  if (miss.length && header.length) {
    header = header.concat(miss.map(function (c) { return c[1]; }));
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    idx = def.cols.map(function (c) { return header.indexOf(c[1]); });
  }
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.join('') === '') continue;
    var o = { _r: r + 1 };
    def.cols.forEach(function (c, i) { o[c[0]] = idx[i] >= 0 ? cellOut_(c[0], row[idx[i]]) : cellOut_(c[0], ''); });
    rows.push(o);
  }
  _tables[name] = { def: def, sheet: sh, rows: rows, idx: idx, width: header.length };
  return _tables[name];
}

function rows_(name) { return table_(name).rows; }

function toRow_(t, o) {
  var arr = [];
  for (var i = 0; i < t.width; i++) arr.push('');
  t.def.cols.forEach(function (c, i) { if (t.idx[i] >= 0) arr[t.idx[i]] = cellIn_(c[0], o[c[0]]); });
  return arr;
}

// 행 저장: _r 이 있으면 덮어쓰기, 없으면 추가
function save_(name, objs) {
  objs = [].concat(objs).filter(Boolean);
  if (!objs.length) return;
  var t = table_(name);
  var fresh = objs.filter(function (o) { return !o._r; });
  var old = objs.filter(function (o) { return o._r; });
  if (old.length > 25) {
    // 많이 바뀌면 전체를 한 번에 기록
    var maxR = t.rows.reduce(function (m, o) { return Math.max(m, o._r || 0); }, 1);
    var blank = toRow_(t, {}).map(function () { return ''; });
    var all = [];
    for (var r = 2; r <= maxR; r++) all.push(blank.slice());
    t.rows.forEach(function (o) { if (o._r) all[o._r - 2] = toRow_(t, o); });
    if (all.length) t.sheet.getRange(2, 1, all.length, t.width).setValues(all);
  } else {
    old.forEach(function (o) { t.sheet.getRange(o._r, 1, 1, t.width).setValues([toRow_(t, o)]); });
  }
  if (fresh.length) {
    var start = Math.max(t.sheet.getLastRow(), 1) + 1;
    t.sheet.getRange(start, 1, fresh.length, t.width).setValues(fresh.map(function (o) { return toRow_(t, o); }));
    fresh.forEach(function (o, i) { o._r = start + i; if (t.rows.indexOf(o) < 0) t.rows.push(o); });
  }
  bumpVersion_();
}

function bumpVersion_() { try { CacheService.getScriptCache().remove('catalog_v2'); } catch (e) {} }

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { _tables = {}; return fn(); } finally { SpreadsheetApp.flush(); lock.releaseLock(); }
}

// ─── 설정 (스크립트 속성에 JSON 저장) ───────────────
var DEFAULT_SETTINGS = {
  libraryName: '오스템문고',
  location: 'EAST동 9층 스마트 오피스존 (인사본부 방향 중앙복도)',
  managerName: '인재개발팀 장유영 사원',
  managerPhone: '070-8644-7372',
  managerEmail: 'yuyoung2@osstem.com',
  loanDays: 21, pickupHoldDays: 5, extendDays: 7, maxExtensions: 1, maxLoansPerUser: 5,
  blockWhenOverdue: true, autoApproveExtension: true, autoConfirmReturn: false, newBookDays: 60,
  mail: { enabled: true, sendHour: 9, dueSoonDays: [3, 0], overdueRepeatDays: 3, adminDigest: true, ccAdminOnOverdue: false },
  holidays: [
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-01', '2026-05-05', '2026-05-24', '2026-05-25',
    '2026-06-03', '2026-06-06', '2026-08-15', '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
    '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-03-01', '2027-05-01', '2027-05-05', '2027-05-13', '2027-06-06',
    '2027-08-15', '2027-08-16', '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-04', '2027-10-09', '2027-10-11', '2027-12-25', '2027-12-27'],
  notice: '',
};
var _settings = null;
function settings_() {
  if (_settings) return _settings;
  var raw = props_().getProperty('SETTINGS');
  var s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (raw) { var o = JSON.parse(raw); Object.keys(o).forEach(function (k) { if (k === 'mail') Object.keys(o.mail).forEach(function (m) { s.mail[m] = o.mail[m]; }); else s[k] = o[k]; }); }
  _settings = s;
  return s;
}
function saveSettings_(s) { props_().setProperty('SETTINGS', JSON.stringify(s)); _settings = s; bumpVersion_(); }
function meta_(k, v) { if (v === undefined) return props_().getProperty('META_' + k); props_().setProperty('META_' + k, String(v)); }

// 큰 탭(메일발송기록)은 필요한 열만 / 마지막 N행만 읽기
function columns_(name, keys) {
  var def = TABLES[name];
  var sh = db_().getSheetByName(def.sheet);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var cols = keys.map(function (k) { var h = def.cols.filter(function (c) { return c[0] === k; })[0][1]; return header.indexOf(h); });
  var data = cols.map(function (ci) { return ci < 0 ? null : sh.getRange(2, ci + 1, last - 1, 1).getValues(); });
  var out = [];
  for (var r = 0; r < last - 1; r++) { var o = {}; keys.forEach(function (k, i) { o[k] = cellOut_(k, data[i] ? data[i][r][0] : ''); }); out.push(o); }
  return out;
}
function tail_(name, n) {
  var def = TABLES[name];
  var sh = db_().getSheetByName(def.sheet);
  var last = sh.getLastRow(), width = sh.getLastColumn();
  if (last < 2) return [];
  var header = sh.getRange(1, 1, 1, width).getValues()[0];
  var start = Math.max(2, last - n + 1);
  return sh.getRange(start, 1, last - start + 1, width).getValues().map(function (row) {
    var o = {}; def.cols.forEach(function (c) { var i = header.indexOf(c[1]); o[c[0]] = cellOut_(c[0], i >= 0 ? row[i] : ''); }); return o;
  });
}
