// 최초 1회 실행: 상단 [▷ 실행] (setup 선택)
function setup() { return setupImpl_(); }

// 웹앱 진입점 + 화면에서 호출하는 API
function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.boot = JSON.stringify({ url: ScriptApp.getService().getUrl() });
  try { var u = ScriptApp.getService().getUrl(); if (u && props_().getProperty('WEBAPP_URL') !== u) props_().setProperty('WEBAPP_URL', u); } catch (err) {}
  return t.evaluate()
    .setTitle(settings_().libraryName)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setFaviconUrl('https://www.gstatic.com/images/icons/material/system/2x/menu_book_black_24dp.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// GitHub Pages 등 외부 화면에서 쓰는 JSON API (POST, Content-Type: text/plain → CORS 사전요청 없이 호출)
function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = rpc(String(body.name || ''), body.args || [], body.token || '');
  } catch (err) {
    out = JSON.stringify({ ok: false, error: '요청 형식이 올바르지 않습니다.' });
  }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

// 사용자 기능
var PUBLIC_API = {
  config: function () {
    var s = settings_();
    return { libraryName: s.libraryName, location: s.location, managerName: s.managerName, managerPhone: s.managerPhone, managerEmail: s.managerEmail,
      loanDays: s.loanDays, extendDays: s.extendDays, maxExtensions: s.maxExtensions, maxLoansPerUser: s.maxLoansPerUser, notice: s.notice, today: today_() };
  },
  catalog: function () { return catalog_(); },
  title: function (key) { return titleDetail_(key); },
  whoami: function (empNo) { return whoAmI_(empNo); },
  me: function (empNo) { return myPage_(empNo); },
  apply: function (key, empNo) { return withLock_(function () { return applyLoan_(key, empNo); }); },
  returnBook: function (loanId, empNo) { return withLock_(function () { return requestReturn_(loanId, empNo); }); },
  pickup: function (ids, empNo) { return withLock_(function () { return confirmPickup_(ids, empNo); }); },
  returnBooks: function (ids, empNo) { return withLock_(function () { return [].concat(ids).map(function (id) { return requestReturn_(id, empNo); }).length; }); },
  review: function (key, empNo, text) { return withLock_(function () { return writeReview_(key, empNo, text); }); },
  extend: function (loanId, empNo) { return withLock_(function () { return requestExtend_(loanId, empNo); }); },
  reserve: function (key, empNo) { return withLock_(function () { return reserve_(key, empNo); }); },
  cancelReservation: function (id, empNo) { return withLock_(function () { return cancelReservation_(id, empNo, false); }); },
  recommendOptions: function () { return recommendOptions_(); },
  recommend: function (input) { return recommend_(input); },
  logSearch: function (q, count) { return logCatalogSearch_(q, count); },
  wishBoard: function () { return wishBoard_(); },
  submitRequest: function (input, empNo, force) { return withLock_(function () { return submitRequest_(input, empNo, force); }); },
  vote: function (roundId, ids, empNo) { return withLock_(function () { return vote_(roundId, ids, empNo); }); },
  myBallot: function (roundId, empNo) { return myBallot_(roundId, empNo); },
  login: function (password, name) {
    var pw = props_().getProperty('ADMIN_PASSWORD') || INITIAL_ADMIN_PASSWORD;
    if (String(password) !== pw) { Utilities.sleep(800); throw new AppError('비밀번호가 올바르지 않습니다.'); }
    var token = Utilities.getUuid();
    CacheService.getScriptCache().put('adm_' + token, String(name || '관리자').trim() || '관리자', 21600);
    return { token: token, isInitialPassword: pw === INITIAL_ADMIN_PASSWORD };
  },
};

// 관리자 기능 (토큰 필요)
var ADMIN_API = {
  dashboard: function () { return dashboard_(); },
  lookup: function (input) { return { results: searchBooks_(input), providers: providers_() }; },
  classify: function (input) { return classify_(input); },
  addBooks: function (input) { return withLock_(function () { return { created: addBooks_(input) }; }); },
  books: function (q) { return adminBooks_(q); },
  updateBook: function (code, patch) { return withLock_(function () { return updateBook_(code, patch); }); },
  loans: function (status, q) { return adminLoans_(status, q); },
  createLoan: function (code, empNo, date) { return withLock_(function () { return adminCreateLoan_(code, empNo, date); }); },
  confirmReturn: function (ids) { return withLock_(function () { return confirmReturn_(ids, CURRENT_ADMIN); }); },
  reviews: function () { return adminReviews_(); },
  hideReview: function (id, hide) { return withLock_(function () { return hideReview_(id, hide); }); },
  markPickup: function (ids) { return withLock_(function () { return adminPickup_(ids); }); },
  extendLoan: function (id, approve) { return withLock_(function () { return adminExtend_(id, approve); }); },
  setLoanStatus: function (id, status) { return withLock_(function () { return setLoanStatus_(id, status); }); },
  updateLoan: function (id, patch) { return withLock_(function () { return updateLoan_(id, patch); }); },
  cancelReservation: function (id) { return withLock_(function () { return cancelReservation_(id, null, true); }); },
  mailPreview: function () { return runReminders_(true, true); },
  mailRun: function () { return withLock_(function () { return runReminders_(true, false); }); },
  mailTest: function (to) { return sendMail_({ type: '테스트', to: to, subject: '[' + settings_().libraryName + '] 테스트 메일', html: layout_('메일 발송 테스트', '<p>이 메일이 보이면 자동 발송이 정상입니다.</p>') }); },
  mailLog: function () { return tail_('mailLog', 200).reverse().map(function (m) { return { at: m.at, type: m.type, to: m.to.map(maskEmail_), subject: m.subject, status: m.status, error: m.error }; }); },
  mailBody: function (at, subject) { var m = tail_('mailLog', 400).filter(function (x) { return x.at === at && x.subject === subject; })[0]; return m ? m.html : ''; },
  categories: function () {
    var counts = {}; rows_('books').forEach(function (b) { counts[b.catCode] = (counts[b.catCode] || 0) + 1; });
    return { categories: categories_(), counts: counts };
  },
  nextCategoryCode: function (g) { return nextCategoryCode_(g); },
  addCategory: function (code, name, kw) { return withLock_(function () { return addCategory_(code, name, kw); }); },
  setCategoryView: function (code, view) { return withLock_(function () { return setCategoryView_(code, view); }); },
  updateCategory: function (code, kw) { return withLock_(function () { return updateCategory_(code, kw); }); },
  settings: function () {
    var k = apiKeys_();
    return { settings: settings_(), providers: providers_(), keys: { kakao: k.kakao ? '설정됨' : '', nl: k.nl ? '설정됨' : '', naverId: k.naverId ? '설정됨' : '' },
      dbUrl: db_().getUrl(), storage: props_().getProperty('STORAGE_INFO') || '', quota: mailQuota_(), webUrl: props_().getProperty('WEBAPP_URL') || '' };
  },
  saveSettings: function (s) {
    var cur = settings_();
    Object.keys(s).forEach(function (k) { if (k === 'mail') Object.keys(s.mail).forEach(function (m) { cur.mail[m] = s.mail[m]; }); else if (k in DEFAULT_SETTINGS) cur[k] = s[k]; });
    saveSettings_(cur);
    if (s.mail && s.mail.sendHour !== undefined) installTriggers_();
    return cur;
  },
  saveKeys: function (keys) {
    var map = { kakao: 'KAKAO_REST_KEY', nl: 'NL_CERT_KEY', naverId: 'NAVER_CLIENT_ID', naverSecret: 'NAVER_CLIENT_SECRET' };
    Object.keys(map).forEach(function (k) { if (keys[k]) props_().setProperty(map[k], String(keys[k]).trim()); });
    return providers_();
  },
  changePassword: function (pw) { if (!pw || String(pw).length < 8) throw new AppError('비밀번호는 8자 이상으로 정해 주세요.'); props_().setProperty('ADMIN_PASSWORD', String(pw)); return { ok: true }; },
  employeesInfo: function () {
    var emps = rows_('employees');
    return { count: emps.length, noEmail: emps.filter(function (e) { return !e.email; }).length, url: db_().getUrl() ? db_().getUrl() + '#gid=' + db_().getSheetByName('사원명부').getSheetId() : '' };
  },
  matchEmployees: function () { return withLock_(function () { return matchEmployees_(); }); },
  importEmployees: function (rows) { return withLock_(function () { return importEmployees_(rows); }); },
  migrate: function (overwrite) { return withLock_(function () { return migrateFromOldSheet_(!!overwrite); }); },
  syncStatus: function () { return sheetSyncStatus_(); },
  setSync: function (on) { return setSheetSync_(!!on); },
  syncNow: function () { return sheetSyncJob(); },
  wishAdmin: function () { return adminWish_(); },
  updateRequest: function (id, patch) { return withLock_(function () { return updateRequest_(id, patch); }); },
  createRound: function (input) { return withLock_(function () { return createRound_(input, CURRENT_ADMIN); }); },
  closeRound: function (id) { return withLock_(function () { return closeRound_(id); }); },
  insights: function (days) { return insights_(days); },
  dataCheck: function () { return dataCheck_(); },
  fixStale: function (ids) { return withLock_(function () { return fixStale_(ids, CURRENT_ADMIN + '(데이터 점검)'); }); },
  exportData: function (kind) { return exportData_(kind); },
  fillCovers: function () { return withLock_(function () { return fillCovers_(120); }); },
};

var CURRENT_ADMIN = '관리자';

// 화면 → 서버 단일 진입점. 결과는 JSON 문자열로 돌려줌
function rpc(name, args, token) {
  try {
    args = args || [];
    var admin = null;
    if (ADMIN_API[name]) {
      admin = token && CacheService.getScriptCache().get('adm_' + token);
      if (!admin) throw new AppError('관리자 로그인이 필요합니다.');
      CURRENT_ADMIN = admin;
      return JSON.stringify({ ok: true, data: ADMIN_API[name].apply(null, args) });
    }
    if (!PUBLIC_API[name]) throw new AppError('없는 기능입니다: ' + name);
    return JSON.stringify({ ok: true, data: PUBLIC_API[name].apply(null, args) });
  } catch (e) {
    if (!e.app) console.error(name, e && e.stack || e);
    return JSON.stringify({ ok: false, error: e.app ? e.message : '처리 중 오류가 발생했습니다. (' + (e && e.message) + ')', auth: /로그인이 필요/.test(e.message || '') });
  }
}
