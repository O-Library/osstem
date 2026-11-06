// ─────────────────────────────────────────────────────
// 최초 1회: 편집기 상단에서 함수 'setup' 선택 → [실행]
//  1) "오스템문고 시스템 DB" 스프레드시트 생성 (탭: 도서·대출·예약·사원명부·분류·메일발송기록)
//  2) 기존 「2026 오스템문고 대출현황」 시트에서 분류·도서목록·대출현황 이관
//  3) 매일 자동 메일·표지 수집 트리거 설치
// ─────────────────────────────────────────────────────
var OLD_SHEET_ID = '1oorSF_POSPop4FwsyZelLp87agbtel4WkPjP-0nvJNw';
var INITIAL_ADMIN_PASSWORD = 'osstem-lib-2026';

function setupImpl_() {
  var p = props_();
  if (!p.getProperty('ADMIN_PASSWORD')) p.setProperty('ADMIN_PASSWORD', INITIAL_ADMIN_PASSWORD);
  var id = p.getProperty('DB_ID');
  var ss;
  if (id) { ss = SpreadsheetApp.openById(id); }
  else {
    ss = SpreadsheetApp.create('오스템문고 시스템 DB');
    p.setProperty('DB_ID', ss.getId());
  }
  _ss = ss;
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(TABLES).forEach(function (k) { ensureSheet_(ss, TABLES[k]); });
  var first = ss.getSheets()[0];
  if (first.getName() === '시트1' || first.getName() === 'Sheet1') { if (ss.getSheets().length > 1) ss.deleteSheet(first); }
  _tables = {};
  if (!rows_('categories').length) save_('categories', defaultCategories_());
  _tables = {}; _cats = null;
  var mig = migrateFromOldSheet_(false);
  installTriggers_();
  Logger.log('완료: DB ' + ss.getUrl());
  Logger.log('이관 결과: ' + JSON.stringify(mig));
  Logger.log('관리자 비밀번호: ' + p.getProperty('ADMIN_PASSWORD'));
  return { dbUrl: ss.getUrl(), migrated: mig };
}

function ensureSheet_(ss, def) {
  var sh = ss.getSheetByName(def.sheet);
  if (!sh) sh = ss.insertSheet(def.sheet);
  var header = def.cols.map(function (c) { return c[1]; });
  var cur = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  if (cur.join('') === '') {
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#ffe8d9');
    sh.setFrozenRows(1);
  } else {
    header.forEach(function (h) { if (cur.indexOf(h) < 0) { sh.getRange(1, sh.getLastColumn() + 1).setValue(h).setFontWeight('bold').setBackground('#ffe8d9'); } });
  }
  sh.getRange(1, 1, sh.getMaxRows(), Math.max(sh.getLastColumn(), header.length)).setNumberFormat('@');
  if (def.sheet === '사원명부' && sh.getLastRow() < 2) {
    sh.getRange('F1').setValue('← 사번·성명·소속·이메일을 붙여넣으세요. 사번으로 대출/조회하고, 알림은 이 이메일로 발송됩니다.').setFontColor('#a8660f');
  }
  return sh;
}

function installTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (['dailyJob', 'coverJob', 'sheetSyncJob'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sheetSyncJob').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('dailyJob').timeBased().atHour(Number(settings_().mail.sendHour) || 9).nearMinute(5).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('coverJob').timeBased().everyMinutes(10).create();
}
function triggerInstalled_() { try { return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'dailyJob'; }); } catch (e) { return null; } }

// 기존 「2026 오스템문고 대출현황」 시트 자동 반영 (5분마다)
// 전환 기간에 구글 폼·시트로 대출/반납을 계속 처리해도 새 대출, 반납, 새 책이 사이트에 따라 들어옴
function sheetSyncJob() {
  var r = withLock_(function () { return migrateFromOldSheet_(false); });
  meta_('SYNC_AT', nowIso_());
  if (r.books || r.loans || r.updated) { meta_('SYNC_CHANGED_AT', nowIso_()); meta_('SYNC_LAST', JSON.stringify(r)); bumpVersion_(); }
  console.log('sheetSyncJob', JSON.stringify(r));
  return r;
}
function sheetSyncStatus_() {
  var on = null;
  try { on = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'sheetSyncJob'; }); } catch (e) {}
  var last = meta_('SYNC_LAST');
  return { on: on, at: meta_('SYNC_AT') || '', changedAt: meta_('SYNC_CHANGED_AT') || '', last: last ? JSON.parse(last) : null };
}
function setSheetSync_(on) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sheetSyncJob') ScriptApp.deleteTrigger(t); });
  if (on) ScriptApp.newTrigger('sheetSyncJob').timeBased().everyMinutes(5).create();
  return sheetSyncStatus_();
}

// 매일 자동 실행: 사원명부 매칭 → 리마인더 메일 → 표지 수집
function dailyJob() {
  withLock_(function () {
    matchEmployees_();
    try { autoCloseRounds_(); } catch (e) { console.error('autoCloseRounds', e); }
    var r = runReminders_(false, false);
    console.log('dailyJob', JSON.stringify(r));
  });
  coverJob();
}

// 표지 수집 (10분마다, 남은 게 없으면 스스로 멈춤)
function coverJob() {
  var r = withLock_(function () { return fillCovers_(120); });
  console.log('coverJob', JSON.stringify(r));
  if (r.remaining === 0 && r.checked === 0) ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'coverJob') ScriptApp.deleteTrigger(t); });
  return r;
}

// 사원명부와 대출/예약 기록 연결 (사번이 비어 있는 이관 기록 → 이름·소속으로 찾기)
function matchEmployees_() {
  var emps = rows_('employees');
  var byName = {};
  emps.forEach(function (e) { var n = String(e.name || '').trim(); if (n) (byName[n] = byName[n] || []).push(e); });
  var changed = [];
  rows_('loans').forEach(function (l) {
    if (l.empNo || !l.name) return;
    var c = byName[String(l.name).trim()] || [];
    if (c.length > 1) c = c.filter(function (e) { return String(e.team).replace(/\s/g, '') === String(l.team).replace(/\s/g, ''); });
    if (c.length === 1) { l.empNo = normEmp_(c[0].empNo); l.email = c[0].email; changed.push(l); }
  });
  save_('loans', changed);
  return { matched: changed.length };
}

// 기존 시트에서 이관 (같은 도서코드/번호는 갱신)
function migrateFromOldSheet_(overwrite) {
  var old = SpreadsheetApp.openById(OLD_SHEET_ID);
  var res = { categories: 0, books: 0, loans: 0 };
  // 분류
  var catSh = old.getSheetByName('오스템도서분류');
  if (catSh) {
    var have = {}; rows_('categories').forEach(function (c) { have[c.code] = c; });
    var add = [];
    catSh.getRange(1, 1, catSh.getLastRow(), 2).getValues().forEach(function (r) {
      var code = String(r[0]).trim(), name = String(r[1]).trim();
      if (!/^\d{3,4}$/.test(code) || !name) return;
      if (have[code]) { if (have[code].name !== name) { have[code].name = name; add.push(have[code]); } }
      else { var c = { code: code, name: name, keywords: [] }; have[code] = c; add.push(c); res.categories++; }
    });
    save_('categories', add); _cats = null;
  }
  // 도서목록
  var bSh = old.getSheetByName('도서목록');
  if (bSh) {
    var v = bSh.getDataRange().getValues();
    var h = headerIdx_(v, '도서명');
    var g = function (r, k) { return h.map[k] === undefined ? '' : r[h.map[k]]; };
    var existing = {}; rows_('books').forEach(function (b) { existing[b.code] = b; });
    var out = [], seen = {};
    v.slice(h.row + 1).forEach(function (r) {
      var title = String(g(r, '도서명')).trim(), cat = String(g(r, '분류번호')).trim(), pno = String(g(r, '구매번호')).trim(), cno = String(g(r, '도서번호')).trim();
      if (!title || !/^\d+$/.test(cat) || !pno || !cno) return;
      if (/^\d+$/.test(pno) && pno.length < 3) pno = ('00' + pno).slice(-3);
      var code = cat + '-' + pno + '-' + cno;
      var isbn = String(g(r, '바코드')).replace(/\D/g, '');
      if (/^97[89]\d{15}$/.test(isbn)) isbn = isbn.slice(0, 13); // 바코드 뒤에 붙은 부가기호 5자리 제거
      var b = existing[code];
      if (seen[code]) return; // 원본 시트에 같은 도서코드가 두 줄 있으면 처음 줄 기준
      seen[code] = 1;
      if (b && !overwrite) {
        // 이미 있는 책: 바코드가 새로 생겼거나, 시트에서 도서명·저자·출판사를 고쳤으면 따라감
        var ch = false, au = String(g(r, '저자')).trim(), pu = String(g(r, '출판사')).trim();
        if (!b.isbn && isbn) { b.isbn = isbn; ch = true; }
        if (b.title !== title) { b.title = title; ch = true; }
        if (au && b.author !== au) { b.author = au; ch = true; }
        if (pu && b.publisher !== pu) { b.publisher = pu; ch = true; }
        if (ch) { out.push(b); res.updated = (res.updated || 0) + 1; }
        return;
      }
      b = b || { code: code, status: 'active', createdAt: '', cover: '', description: '' };
      b.catCode = cat; b.purchaseNo = pno; b.copyNo = cno; b.title = title; b.author = String(g(r, '저자')).trim(); b.publisher = String(g(r, '출판사')).trim(); b.isbn = isbn;
      b.loanCount = Number(g(r, '대출횟수')) || 0;
      existing[code] = b; out.push(b); res.books++;
    });
    save_('books', out);
  }
  // 대출현황
  var lSh = old.getSheetByName('대출현황');
  if (lSh) {
    var lv = lSh.getDataRange().getValues();
    var lh = headerIdx_(lv, '성명');
    var lg = function (r, k) { return lh.map[k] === undefined ? '' : r[lh.map[k]]; };
    var t = today_();
    // 원본 시트에는 같은 번호가 서로 다른 대출에 쓰인 경우가 있어 번호+도서코드로 찾는다
    var byNo = {}; rows_('loans').forEach(function (l) { if (l.no) byNo[l.no + '|' + l.bookCode] = l; });
    var bookMap = {}; rows_('books').forEach(function (b) { bookMap[b.code] = b; });
    var lout = [], lostBooks = [];
    lv.slice(lh.row + 1).forEach(function (r) {
      var code = String(lg(r, '도서코드')).trim(), name = String(lg(r, '성명')).trim();
      if (!code || !name) return;
      var no = Number(lg(r, '번호')) || null;
      var ret = normDate_(lg(r, '반납확인일')), checker = String(lg(r, '반납확인자')).trim(), memo = String(lg(r, '메모')).trim();
      var tag = checker + ' ' + memo, status;
      if (/분실/.test(tag)) status = 'lost';
      else if (/중복/.test(tag)) status = 'cancelled';
      else if (ret && ret <= t && !/^\*/.test(checker)) status = 'returned';
      else if (ret && ret < t) status = 'returned';
      else status = 'active';
      var loanDate = normDate_(lg(r, '대출일'));
      var b = bookMap[code];
      var l = no && byNo[no + '|' + code];
      if (l && !overwrite && l.status !== 'active') return;
      if (l && !overwrite && status === 'active') return;
      l = l || { id: uid_(), no: no, empNo: '', email: '', extensions: [], extensionRequest: null, createdBy: 'sheet' };
      l.bookCode = code; l.titleKey = b ? titleKey_(b) : code.split('-').slice(0, 2).join('-'); l.bookTitle = String(lg(r, '도서명')).trim() || (b ? b.title : '');
      l.team = String(lg(r, '소속')).trim(); l.name = name; l.loanDate = loanDate; l.pickupDate = loanDate ? addDays_(loanDate, 1) : '';
      l.dueDate = normDate_(lg(r, '반납예정일')); l.status = status; l.appliedAt = loanDate;
      l.returnedAt = status === 'returned' ? ret : ''; l.returnedBy = status === 'returned' ? checker : '';
      l.memo = [memo, /^\*/.test(checker) ? checker : ''].filter(String).join(' ');
      lout.push(l); res.loans++;
      if (status === 'lost' && b && b.status !== 'lost') { b.status = 'lost'; lostBooks.push(b); }
    });
    save_('loans', lout);
    save_('books', lostBooks);
  }
  recountLoans_();
  matchEmployees_();
  return res;
}

// 원본 시트에는 '대출횟수' 칸이 없어서, 대출 기록으로 권마다 대출 횟수를 다시 셈 ('많이 읽은 책'·인기순·추천에 사용)
function recountLoans_() {
  var n = {};
  rows_('loans').forEach(function (l) { if (l.status !== 'cancelled' && l.status !== 'rejected' && l.bookCode) n[l.bookCode] = (n[l.bookCode] || 0) + 1; });
  var changed = rows_('books').filter(function (b) { var c = n[b.code] || 0; if ((Number(b.loanCount) || 0) < c) { b.loanCount = c; return true; } return false; });
  save_('books', changed);
  return changed.length;
}

function headerIdx_(values, must) {
  for (var i = 0; i < values.length; i++) {
    var row = values[i].map(function (c) { return String(c).replace(/\s/g, ''); });
    if (row.indexOf(must) >= 0) { var map = {}; row.forEach(function (c, j) { if (c && map[c] === undefined) map[c] = j; }); return { row: i, map: map }; }
  }
  throw new AppError("'" + must + "' 머리글을 찾지 못했습니다.");
}

// 사원명부 통째로 바꾸기 (관리자 화면에서 엑셀 붙여넣기/CSV): rows = [[사번, 성명, 소속, 이메일], ...]
function importEmployees_(rows) {
  rows = (rows || []).map(function (r) { return [normEmp_(r[0]), String(r[1] || '').trim(), String(r[2] || '').trim(), String(r[3] || '').trim()]; })
    .filter(function (r) { return r[0] && r[1] && !/사번|EMP/i.test(r[0]); });
  if (!rows.length) throw new AppError('사번·성명이 있는 행을 찾지 못했습니다. 사번·성명·소속·이메일 4열을 붙여넣어 주세요.');
  var seen = {}, dup = [];
  rows.forEach(function (r) { if (seen[r[0]]) dup.push(r[0]); seen[r[0]] = 1; });
  if (dup.length) throw new AppError('사번이 중복됩니다: ' + dup.slice(0, 5).join(', '));
  var sh = db_().getSheetByName('사원명부');
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 4).setValues(Array.apply(null, Array(last - 1)).map(function () { return ['', '', '', '']; }));
  sh.getRange(2, 1, rows.length, 4).setValues(rows);
  _tables = {}; _empMap = null;
  var m = matchEmployees_();
  return { count: rows.length, noEmail: rows.filter(function (r) { return !r[3]; }).length, matched: m.matched };
}
