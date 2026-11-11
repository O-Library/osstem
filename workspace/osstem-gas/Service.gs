// 업무 로직: 도서·대출·반납·연장·예약 (사번 기반)
var OPEN = ['active', 'returning'];
function titleKey_(b) { return b.catCode + '-' + b.purchaseNo; }

// ─── 사원 ───────────────────────────────────────────
var _empMap = null;
function empMap_() {
  if (_empMap) return _empMap;
  _empMap = {};
  rows_('employees').forEach(function (e) { var k = normEmp_(e.empNo); if (k) _empMap[k] = e; });
  return _empMap;
}
function employee_(empNo) {
  var k = normEmp_(empNo);
  if (!k) throw new AppError('사번을 입력해 주세요.');
  var e = empMap_()[k];
  if (!e) throw new AppError('사원명부에 없는 사번입니다. 사번을 확인하시거나 담당자에게 문의해 주세요.');
  return { empNo: k, name: String(e.name).trim(), team: String(e.team).trim(), email: String(e.email).trim().toLowerCase() };
}
function emailOf_(l) { var e = l.empNo && empMap_()[normEmp_(l.empNo)]; return (e && e.email) || l.email || ''; }

// ─── 상태 계산 ──────────────────────────────────────
function loanView_(l) {
  var t = today_();
  var v = {}; Object.keys(l).forEach(function (k) { if (k !== '_r') v[k] = l[k]; });
  v.dday = l.dueDate ? diffDays_(l.dueDate, t) : null;
  v.overdue = l.status === 'active' && v.dday !== null && v.dday < 0;
  v.overdueDays = v.overdue ? -v.dday : 0;
  // 수령: 시트에서 옮겨 온 대출은 이미 가져간 것으로 봄. 사이트 신청은 [수령했어요]·서고 QR·담당자 처리로 확인
  var picked = !!l.pickedUpAt || l.createdBy === 'sheet' || !l.pickupDate;
  v.waitingPickup = l.status === 'active' && !picked;
  v.pickupReady = v.waitingPickup && t >= l.pickupDate;
  v.uncollected = v.pickupReady && diffDays_(t, l.pickupDate) >= (Number(settings_().pickupHoldDays) || 5);
  if (v.waitingPickup) { v.overdue = false; v.overdueDays = 0; }
  // 소속·이름은 사원명부(현재 기준)를 우선 표시. 대출 당시 소속은 teamAtLoan으로 보존
  var e = l.empNo && empMap_()[normEmp_(l.empNo)];
  if (e) {
    var tn = String(e.team || '').trim(), nn = String(e.name || '').trim();
    if (nn) v.name = nn;
    if (tn && tn !== String(l.team || '').trim()) { v.teamAtLoan = l.team; v.team = tn; }
  }
  v.statusLabel = { active: v.overdue ? '연체 ' + v.overdueDays + '일' : v.uncollected ? '장기 미수령' : v.pickupReady ? '수령 가능' : v.waitingPickup ? '준비 중' : '대출중', returning: '반납확인중', returned: '반납완료', cancelled: '취소', lost: '분실' }[l.status] || l.status;
  return v;
}
function openByCode_() { var m = {}; rows_('loans').forEach(function (l) { if (OPEN.indexOf(l.status) >= 0) m[l.bookCode] = l; }); return m; }
function bookState_(b, open) {
  if (b.status === 'lost') return '분실';
  if (b.status === 'discarded') return '폐기';
  var l = open[b.code];
  if (!l) return '대출가능';
  return l.status === 'returning' ? '반납확인중' : '대출중';
}

// ─── 카탈로그 (전체를 한 번에 내려주고 검색은 브라우저에서) ──
function catalog_() {
  var cache = CacheService.getScriptCache();
  var hit = cacheGet_(cache, 'catalog_v2');
  if (hit) return hit;
  var open = openByCode_();
  var waiting = {};
  rows_('reservations').forEach(function (r) { if (r.status === 'waiting') waiting[r.key] = (waiting[r.key] || 0) + 1; });
  var newSince = addDays_(today_(), -settings_().newBookDays);
  var map = {}, order = [];
  rows_('books').forEach(function (b) {
    if (b.status === 'discarded' || !b.code) return;
    var k = titleKey_(b);
    if (!map[k]) {
      map[k] = { key: k, title: b.title, author: b.author, publisher: b.publisher, isbn: b.isbn, cover: b.cover || '', catCode: b.catCode,
        catName: catName_(b.catCode), group: groupOf_(b.catCode), copies: 0, available: 0, loanCount: 0, createdAt: b.createdAt || '', earliestDue: '', codes: [] };
      order.push(k);
    }
    var t = map[k];
    t.codes.push(b.code);
    if (!t.isbn && b.isbn) t.isbn = b.isbn;
    if (b.status === 'lost') return;
    t.copies++;
    t.loanCount += Number(b.loanCount) || 0;
    if (!t.cover && b.cover) t.cover = b.cover;
    if ((b.createdAt || '') > t.createdAt) t.createdAt = b.createdAt;
    var st = bookState_(b, open);
    if (st === '대출가능') t.available++;
    else { var l = open[b.code]; if (l && (!t.earliestDue || l.dueDate < t.earliestDue)) t.earliestDue = l.dueDate; }
  });
  var list = order.map(function (k) { var t = map[k]; t.isNew = !!t.createdAt && t.createdAt.slice(0, 10) >= newSince; t.waiting = waiting[k] || 0; return t; })
    .filter(function (t) { return t.copies > 0; });
  var out = { items: list, groups: categories_().map(function (c) { return { code: c.code, name: c.name, group: c.group, isGroup: c.isGroup, view: c.view }; }) };
  cachePut_(cache, 'catalog_v2', out, 600);
  return out;
}

// 100KB 제한을 넘는 값을 여러 조각으로 캐시
function cachePut_(cache, key, obj, ttl) {
  try {
    var s = JSON.stringify(obj), size = 90000, n = Math.ceil(s.length / size), m = {};
    for (var i = 0; i < n; i++) m[key + '_' + i] = s.slice(i * size, (i + 1) * size);
    m[key] = String(n);
    cache.putAll(m, ttl);
  } catch (e) {}
}
function cacheGet_(cache, key) {
  try {
    var n = Number(cache.get(key)); if (!n) return null;
    var keys = []; for (var i = 0; i < n; i++) keys.push(key + '_' + i);
    var parts = cache.getAll(keys); var s = '';
    for (var j = 0; j < n; j++) { if (parts[keys[j]] == null) return null; s += parts[keys[j]]; }
    return JSON.parse(s);
  } catch (e) { return null; }
}

function titleDetail_(key) {
  var books = rows_('books').filter(function (b) { return titleKey_(b) === key && b.status !== 'discarded'; });
  if (!books.length) throw new AppError('도서를 찾을 수 없습니다.');
  try { enrichOnce_(books); } catch (e) {}
  var open = openByCode_();
  var first = books[0];
  var pick = function (f) { var b = books.filter(function (x) { return x[f]; })[0]; return b ? b[f] : ''; };
  var copies = books.map(function (b) { var l = open[b.code]; return { code: b.code, status: bookState_(b, open), dueDate: l ? l.dueDate : '' }; });
  return {
    key: key, title: first.title, author: first.author, publisher: first.publisher, isbn: pick('isbn'), cover: pick('cover'), description: pick('description'),
    pubDate: pick('pubDate'), catCode: first.catCode, catName: catName_(first.catCode), groupName: groupName_(first.catCode), group: groupOf_(first.catCode),
    copies: copies, available: copies.filter(function (c) { return c.status === '대출가능'; }).length,
    waiting: rows_('reservations').filter(function (r) { return r.key === key && r.status === 'waiting'; }).length,
    loanCount: books.reduce(function (s, b) { return s + (Number(b.loanCount) || 0); }, 0), links: links_(pick('isbn'), first.title),
    together: alsoBorrowed_(key),
  };
}

// 이 책을 빌린 사람들이 함께 많이 빌린 책 (대출 기록만으로 셈, 누가 빌렸는지는 내보내지 않음)
function alsoBorrowed_(key) {
  try {
    var loans = rows_('loans').filter(function (l) { return l.status !== 'cancelled' && l.status !== 'rejected'; });
    var who = function (l) { return l.empNo || (l.name ? l.name + '|' + l.team : ''); };
    var readers = {};
    loans.forEach(function (l) { if (l.titleKey === key && who(l)) readers[who(l)] = 1; });
    var n = {}, people = {};
    loans.forEach(function (l) {
      var w = who(l); if (!w || !readers[w] || l.titleKey === key) return;
      var k2 = w + '#' + l.titleKey; if (people[k2]) return; people[k2] = 1;
      n[l.titleKey] = (n[l.titleKey] || 0) + 1;
    });
    var items = catalog_().items, byKey = {}; items.forEach(function (t) { byKey[t.key] = t; });
    return Object.keys(n).filter(function (k) { return n[k] >= 2 && byKey[k]; })
      .sort(function (a, b) { return n[b] - n[a] || (byKey[b].loanCount - byKey[a].loanCount); }).slice(0, 4)
      .map(function (k) { var t = byKey[k]; return { key: k, title: t.title, author: t.author, isbn: t.isbn, cover: t.cover, catName: t.catName, available: t.available, copies: t.copies, earliestDue: t.earliestDue }; });
  } catch (e) { return []; }
}

// ─── 사번 확인 (신청 전 본인 확인용) ─────────────────
function whoAmI_(empNo) {
  var e = employee_(empNo);
  return { empNo: e.empNo, name: e.name, team: e.team, emailMasked: maskEmail_(e.email), hasEmail: !!e.email };
}

// ─── 대출 신청 ──────────────────────────────────────
function nextLoanNo_() { return rows_('loans').reduce(function (m, l) { return Math.max(m, Number(l.no) || 0); }, 0) + 1; }

function createLoan_(book, who, appliedDate, by) {
  var s = settings_();
  var pickup = nextBizDay_(appliedDate, s.holidays);
  var loan = {
    id: uid_(), no: nextLoanNo_(), bookCode: book.code, titleKey: titleKey_(book), bookTitle: book.title,
    empNo: who.empNo, name: who.name, team: who.team, email: who.email, appliedAt: nowIso_(),
    loanDate: appliedDate, pickupDate: pickup, dueDate: toBizDay_(addDays_(pickup, s.loanDays), s.holidays),
    status: 'active', extensions: [], extensionRequest: null, memo: '', createdBy: by,
  };
  book.loanCount = (Number(book.loanCount) || 0) + 1;
  save_('loans', loan);
  save_('books', book);
  return loan;
}

function applyLoan_(key, empNo) {
  var who = employee_(empNo);
  var s = settings_();
  var mine = rows_('loans').filter(function (l) { return normEmp_(l.empNo) === who.empNo && OPEN.indexOf(l.status) >= 0; }).map(loanView_);
  if (s.blockWhenOverdue && mine.some(function (l) { return l.overdue; })) throw new AppError('연체 중인 도서가 있어 신규 대출이 제한됩니다. 먼저 반납해 주세요.');
  if (mine.length >= s.maxLoansPerUser) throw new AppError('1인당 최대 ' + s.maxLoansPerUser + '권까지 대출할 수 있습니다.');
  if (mine.some(function (l) { return l.titleKey === key; })) throw new AppError('이미 대출 중인 도서입니다.');
  var open = openByCode_();
  var book = rows_('books').filter(function (b) { return titleKey_(b) === key; })
    .sort(function (a, b) { return Number(a.copyNo) - Number(b.copyNo); })
    .filter(function (b) { return bookState_(b, open) === '대출가능'; })[0];
  if (!book) throw new AppError('지금은 대출 가능한 권이 없습니다. 예약을 이용해 주세요.');
  var queue = rows_('reservations').filter(function (r) { return r.key === key && r.status === 'waiting'; }).sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
  if (queue.length && normEmp_(queue[0].empNo) !== who.empNo) throw new AppError('예약 대기자가 있는 도서입니다. 예약을 이용해 주세요.');
  if (queue.length) { queue[0].status = 'fulfilled'; save_('reservations', queue[0]); }
  var loan = createLoan_(book, who, today_(), 'user');
  notify_('applied', [loan]);
  return loanView_(loan);
}

// ─── 내 대출 (사번 조회) ─────────────────────────────
function myPage_(empNo) {
  var who = employee_(empNo);
  var loans = rows_('loans').filter(function (l) { return normEmp_(l.empNo) === who.empNo; }).map(loanView_)
    .sort(function (a, b) { return (b.appliedAt || b.loanDate) > (a.appliedAt || a.loanDate) ? 1 : -1; });
  var active = loans.filter(function (l) { return OPEN.indexOf(l.status) >= 0; });
  var cat = catalog_().items;
  var myRes = rows_('reservations').filter(function (r) { return normEmp_(r.empNo) === who.empNo && r.status === 'waiting'; }).map(function (r) {
    var q = rows_('reservations').filter(function (x) { return x.key === r.key && x.status === 'waiting'; }).sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    var t = cat.filter(function (x) { return x.key === r.key; })[0];
    return { id: r.id, key: r.key, title: r.title, createdAt: r.createdAt, rank: q.map(function (x) { return x.id; }).indexOf(r.id) + 1, availableNow: !!(t && t.available > 0 && q[0].id === r.id), cover: t ? t.cover : '', isbn: t ? t.isbn : '', catCode: t ? t.catCode : '' };
  });
  var bookMap = {}; cat.forEach(function (t) { bookMap[t.key] = t; });
  loans.forEach(function (l) { var t = bookMap[l.titleKey]; l.cover = t ? t.cover : ''; l.isbn = t ? t.isbn : ''; l.email = ''; });
  var alerts = [];
  active.forEach(function (l) {
    if (l.overdue) alerts.push({ level: 'danger', text: '「' + l.bookTitle + '」 반납예정일(' + pretty_(l.dueDate) + ')이 ' + l.overdueDays + '일 지났습니다. 빠른 반납 부탁드립니다.' });
    else if (l.status === 'active' && l.dday <= 3) alerts.push({ level: 'warn', text: '「' + l.bookTitle + '」 반납예정일이 ' + (l.dday === 0 ? '오늘' : l.dday + '일 후') + '(' + pretty_(l.dueDate) + ')입니다.' });
    if (l.waitingPickup && !l.pickupReady) alerts.push({ level: 'info', text: '「' + l.bookTitle + '」 ' + pretty_(l.pickupDate) + ' 14:00 이후 대출도서 칸에서 수령하세요.' });
    else if (l.pickupReady) alerts.push({ level: 'info', text: '「' + l.bookTitle + '」 대출도서 칸에 준비돼 있어요. 가져가신 뒤 [수령했어요]를 눌러 주세요.' });
    if (l.extensionRequest && l.extensionRequest.status === 'pending') alerts.push({ level: 'info', text: '「' + l.bookTitle + '」 연장 신청이 담당자 승인 대기 중입니다.' });
  });
  myRes.forEach(function (r) { if (r.availableNow) alerts.push({ level: 'success', text: '예약하신 「' + r.title + '」을(를) 지금 대출 신청할 수 있습니다.', key: r.key }); });
  return { me: { empNo: who.empNo, name: who.name, team: who.team, emailMasked: maskEmail_(who.email) }, active: active, history: loans.filter(function (l) { return OPEN.indexOf(l.status) < 0; }).slice(0, 30), reservations: myRes, alerts: alerts };
}

function ownLoan_(loanId, empNo) {
  var who = employee_(empNo);
  var l = rows_('loans').filter(function (x) { return x.id === loanId; })[0];
  if (!l || normEmp_(l.empNo) !== who.empNo) throw new AppError('대출 정보를 찾을 수 없습니다.');
  return l;
}

// 수령 확인: 이용자 본인([수령했어요]·서고 QR) 또는 담당자
function confirmPickup_(ids, empNo) {
  var done = [];
  [].concat(ids).forEach(function (id) {
    var l = ownLoan_(id, empNo);
    if (l.status !== 'active' || !loanView_(l).waitingPickup) return;
    l.pickedUpAt = nowIso_(); done.push(l);
  });
  save_('loans', done);
  return { count: done.length };
}
function adminPickup_(ids) {
  var done = rows_('loans').filter(function (l) { return ids.indexOf(l.id) >= 0 && l.status === 'active' && !l.pickedUpAt; });
  done.forEach(function (l) { l.pickedUpAt = nowIso_(); });
  save_('loans', done);
  return { count: done.length };
}

function requestReturn_(loanId, empNo) {
  var l = ownLoan_(loanId, empNo);
  if (l.status !== 'active') throw new AppError('반납 등록할 수 없는 상태입니다.');
  if (!l.pickedUpAt) l.pickedUpAt = nowIso_();
  l.status = 'returning';
  l.returnRequestedAt = nowIso_();
  save_('loans', l);
  if (settings_().autoConfirmReturn) confirmReturn_([l.id], '자동확인');
  return loanView_(l);
}

function canExtend_(l) {
  var s = settings_(), v = loanView_(l);
  if (l.status !== 'active') return '대출 중인 도서만 연장할 수 있습니다.';
  if (v.overdue) return '연체된 도서는 연장할 수 없습니다. 반납 후 다시 신청해 주세요.';
  if ((l.extensions || []).length >= s.maxExtensions) return '연장은 ' + s.maxExtensions + '회까지 가능합니다. 더 필요하시면 반납 후 다시 신청해 주세요.';
  if (rows_('reservations').some(function (r) { return r.key === l.titleKey && r.status === 'waiting'; })) return '예약 대기자가 있어 연장할 수 없습니다.';
  return null;
}
function doExtend_(l, by) {
  var s = settings_();
  var nd = toBizDay_(addDays_(l.dueDate, s.extendDays), s.holidays);
  l.extensions = (l.extensions || []).concat([{ at: nowIso_(), from: l.dueDate, to: nd, by: by }]);
  l.dueDate = nd;
  if (l.extensionRequest) l.extensionRequest = { at: l.extensionRequest.at, status: 'approved' };
}
function requestExtend_(loanId, empNo) {
  var l = ownLoan_(loanId, empNo);
  var why = canExtend_(l);
  if (why) throw new AppError(why);
  if (l.extensionRequest && l.extensionRequest.status === 'pending') throw new AppError('이미 연장 신청 중입니다.');
  l.extensionRequest = { at: nowIso_(), status: 'pending' };
  if (settings_().autoApproveExtension) {
    doExtend_(l, 'auto');
    save_('loans', l);
    notify_('extended', [l]);
    var v = loanView_(l); v.autoApproved = true; return v;
  }
  save_('loans', l);
  return loanView_(l);
}

function reserve_(key, empNo) {
  var who = employee_(empNo);
  var t = catalog_().items.filter(function (x) { return x.key === key; })[0];
  if (!t) throw new AppError('도서를 찾을 수 없습니다.');
  if (t.available > 0 && !t.waiting) throw new AppError('지금 바로 대출 신청할 수 있는 도서입니다.');
  if (rows_('loans').some(function (l) { return normEmp_(l.empNo) === who.empNo && l.titleKey === key && OPEN.indexOf(l.status) >= 0; })) throw new AppError('이미 대출 중인 도서입니다.');
  if (rows_('reservations').some(function (r) { return normEmp_(r.empNo) === who.empNo && r.key === key && r.status === 'waiting'; })) throw new AppError('이미 예약한 도서입니다.');
  var r = { id: uid_(), key: key, title: t.title, empNo: who.empNo, name: who.name, team: who.team, email: who.email, createdAt: nowIso_(), status: 'waiting', notifiedAt: '' };
  save_('reservations', r);
  return { id: r.id, title: r.title, rank: rows_('reservations').filter(function (x) { return x.key === key && x.status === 'waiting'; }).length };
}

function cancelReservation_(id, empNo, admin) {
  var r = rows_('reservations').filter(function (x) { return x.id === id; })[0];
  if (!r || (!admin && normEmp_(r.empNo) !== employee_(empNo).empNo)) throw new AppError('예약 정보를 찾을 수 없습니다.');
  r.status = 'cancelled';
  save_('reservations', r);
  return { ok: true };
}

// ─── 관리자 ─────────────────────────────────────────
function confirmReturn_(ids, adminName) {
  var done = [];
  rows_('loans').forEach(function (l) {
    if (ids.indexOf(l.id) >= 0 && OPEN.indexOf(l.status) >= 0) { l.status = 'returned'; l.returnedAt = today_(); l.returnedBy = adminName || '관리자'; done.push(l); }
  });
  save_('loans', done);
  var keys = {}; done.forEach(function (l) { keys[l.titleKey] = 1; });
  Object.keys(keys).forEach(function (k) {
    var q = rows_('reservations').filter(function (r) { return r.key === k && r.status === 'waiting'; }).sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    if (q.length && !q[0].notifiedAt) { q[0].notifiedAt = nowIso_(); save_('reservations', q[0]); notify_('reservationReady', [], { reservation: q[0] }); }
  });
  return { count: done.length };
}

function findLoan_(id) { var l = rows_('loans').filter(function (x) { return x.id === id; })[0]; if (!l) throw new AppError('대출 정보를 찾을 수 없습니다.'); return l; }

function adminExtend_(id, approve) {
  var l = findLoan_(id);
  if (!approve) {
    if (l.extensionRequest) l.extensionRequest = { at: l.extensionRequest.at, status: 'rejected' };
    save_('loans', l); notify_('extensionRejected', [l]); return loanView_(l);
  }
  if (l.status !== 'active') throw new AppError('대출 중인 도서만 연장할 수 있습니다.');
  doExtend_(l, 'admin'); save_('loans', l); notify_('extended', [l]);
  return loanView_(l);
}

function setLoanStatus_(id, status) {
  var l = findLoan_(id);
  l.status = status; save_('loans', l);
  if (status === 'lost') { var b = rows_('books').filter(function (x) { return x.code === l.bookCode; })[0]; if (b) { b.status = 'lost'; save_('books', b); } }
  return loanView_(l);
}

function updateLoan_(id, patch) {
  var l = findLoan_(id);
  if (patch.empNo !== undefined) {
    var e = employee_(patch.empNo);
    l.empNo = e.empNo; l.name = e.name; l.team = e.team; l.email = e.email;
  }
  ['dueDate', 'memo'].forEach(function (k) { if (patch[k] !== undefined) l[k] = patch[k]; });
  save_('loans', l);
  return loanView_(l);
}

function adminCreateLoan_(code, empNo, appliedDate) {
  var who = employee_(empNo);
  var b = rows_('books').filter(function (x) { return x.code === code; })[0];
  if (!b) throw new AppError('도서코드를 찾을 수 없습니다.');
  if (openByCode_()[code]) throw new AppError('이미 대출 중인 권입니다.');
  var l = createLoan_(b, who, appliedDate || today_(), 'admin');
  notify_('applied', [l]);
  return loanView_(l);
}

function adminLoans_(status, q) {
  var list = rows_('loans').map(loanView_);
  if (status === 'open') list = list.filter(function (l) { return OPEN.indexOf(l.status) >= 0; });
  else if (status === 'overdue') list = list.filter(function (l) { return l.overdue; });
  else if (status === 'pickup') list = list.filter(function (l) { return l.waitingPickup; }).sort(function (a, b) { return (b.uncollected ? 1 : 0) - (a.uncollected ? 1 : 0); });
  else if (status === 'noemp') list = list.filter(function (l) { return OPEN.indexOf(l.status) >= 0 && !emailOf_(l); });
  else if (status !== 'all') list = list.filter(function (l) { return l.status === status; });
  if (q) { q = String(q).toLowerCase(); list = list.filter(function (l) { return [l.bookCode, l.bookTitle, l.name, l.team, l.empNo].join(' ').toLowerCase().indexOf(q) >= 0; }); }
  list.forEach(function (l) { l.mail = emailOf_(l); });
  return list.sort(function (a, b) { return (Number(b.no) || 0) - (Number(a.no) || 0); }).slice(0, 400);
}

function dashboard_() {
  var loans = rows_('loans').map(loanView_);
  var open = loans.filter(function (l) { return OPEN.indexOf(l.status) >= 0; });
  open.forEach(function (l) { l.mail = emailOf_(l); });
  var t = today_();
  var books = rows_('books').filter(function (b) { return b.status !== 'discarded'; });
  var titles = {}; books.forEach(function (b) { titles[titleKey_(b)] = 1; });
  var months = [];
  for (var i = 11; i >= 0; i--) { var d = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1 - i, 1)); months.push(d.toISOString().slice(0, 7)); }
  var monthly = months.map(function (m) { return { month: m, count: loans.filter(function (l) { return String(l.loanDate).slice(0, 7) === m && l.status !== 'cancelled'; }).length }; });
  var popular = catalog_().items.slice().sort(function (a, b) { return b.loanCount - a.loanCount; }).slice(0, 8).map(function (x) { return { title: x.title, count: x.loanCount }; });
  var dueSoon = open.filter(function (l) { return l.status === 'active' && !l.overdue && l.dday <= 3; });
  return {
    today: t,
    counts: {
      books: books.length, titles: Object.keys(titles).length, open: open.filter(function (l) { return l.status === 'active'; }).length,
      overdue: open.filter(function (l) { return l.overdue; }).length, dueSoon: dueSoon.length,
      returning: open.filter(function (l) { return l.status === 'returning'; }).length,
      pickupWaiting: open.filter(function (l) { return l.waitingPickup; }).length, uncollected: open.filter(function (l) { return l.uncollected; }).length,
      extensionPending: open.filter(function (l) { return l.extensionRequest && l.extensionRequest.status === 'pending'; }).length,
      noEmail: open.filter(function (l) { return !l.mail; }).length,
      thisMonth: loans.filter(function (l) { return String(l.loanDate).slice(0, 7) === t.slice(0, 7) && l.status !== 'cancelled'; }).length,
      employees: rows_('employees').length,
      noCover: books.filter(function (b) { return !b.cover; }).length,
    },
    overdue: open.filter(function (l) { return l.overdue; }).sort(function (a, b) { return a.dday - b.dday; }),
    dueSoon: dueSoon.sort(function (a, b) { return a.dday - b.dday; }),
    returning: open.filter(function (l) { return l.status === 'returning'; }),
    extensionRequests: open.filter(function (l) { return l.extensionRequest && l.extensionRequest.status === 'pending'; }),
    reservations: rows_('reservations').filter(function (r) { return r.status === 'waiting'; }).map(function (r) { return { id: r.id, title: r.title, name: r.name, team: r.team, createdAt: r.createdAt }; }),
    monthly: monthly, popular: popular,
    mail: { enabled: settings_().mail.enabled, sendHour: settings_().mail.sendHour, lastRun: meta_('lastMailRun') || '', quota: mailQuota_(), triggerOk: triggerInstalled_() },
  };
}

function addBooks_(input) {
  if (!input.title || !String(input.title).trim()) throw new AppError('도서명을 입력해 주세요.');
  var cat = leafCategories_().filter(function (c) { return c.code === String(input.catCode); })[0];
  if (!cat) throw new AppError('분류를 선택해 주세요.');
  var n = Math.max(1, Math.min(20, Number(input.count) || 1));
  var codes = nextCode_(cat.code, input, n).codes;
  var now = nowIso_();
  var isbn = String(input.isbn || '').replace(/\D/g, '');
  var created = codes.map(function (c) {
    return { code: c.code, catCode: c.catCode, purchaseNo: c.purchaseNo, copyNo: c.copyNo, title: String(input.title).trim(), author: input.author || '', publisher: input.publisher || '',
      isbn: isbn, cover: input.cover || '', description: String(input.description || '').slice(0, 3000), pubDate: input.pubDate || '', kdc: input.kdc || '',
      status: 'active', loanCount: 0, createdAt: now, coverCheckedAt: input.cover ? today_() : '' };
  });
  var after = sheetAfter_(created[0].code);
  save_('books', created);
  var fulfilled = 0;
  try { fulfilled = fulfillRequests_(created); } catch (e) { console.error('fulfillRequests', e); }
  var rows = created.map(sheetRow_);
  return created.map(function (b, i) { return { code: b.code, title: b.title, fulfilled: fulfilled, after: after, sheetRow: rows[i] }; });
}

// 원본 「도서목록」 시트에 붙여넣을 한 줄 (A~S). 수식은 도서코드·바코드를 직접 넣어 어느 행에 붙여도 동작
function codeSortKey_(code) { return String(code).split('-').map(function (x) { return ('00000' + x).slice(-5); }).join('-'); }
function sheetAfter_(code) {
  var k = codeSortKey_(code), best = '';
  rows_('books').forEach(function (b) { var bk = codeSortKey_(b.code); if (bk < k && bk > codeSortKey_(best || '0')) best = b.code; });
  return best;
}
function sheetRow_(b) {
  var q = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
  var code = q(b.code), bc = b.isbn ? b.isbn : '';
  return [b.catCode, b.purchaseNo, b.copyNo, groupName_(b.catCode), catName_(b.catCode), b.code, b.title,
    '=COUNTIF(F:F,' + code + ')', b.publisher, b.author,
    '=iferror(if(today()>vlookup(' + code + ",'대출현황'!B:H,7,false),\"대출가능\",if(today()>=vlookup(" + code + ",'대출현황'!B:G,5,false),\"불가-대출중\",\"불가-예약됨\")),\"대출가능\")",
    "=if(today()>maxifs('대출현황'!G:G,'대출현황'!B:B," + code + '),"대출가능","대출중")',
    "=if(today()>=maxifs('대출현황'!H:H,'대출현황'!B:B," + code + '),"대출가능","대출중")',
    bc,
    bc ? '=hyperlink("http://www.kyobobook.co.kr/product/detailViewKor.laf?mallGb=KOR&ejkGb=KOR&barcode=' + bc + '","이동")' : '',
    '', '(' + b.code + ') ' + catName_(b.catCode) + ' > ' + b.title,
    "=COUNTIF('대출현황'!B:B," + code + ')',
    bc ? '=hyperlink("http://www.nl.go.kr/nl/search/search.jsp?img=n&hanja=&sort=&desc=desc&all=on&topF1=cheonggu&kwd=' + bc + '","이동")' : ''];
}

function updateBook_(code, patch) {
  var b = rows_('books').filter(function (x) { return x.code === code; })[0];
  if (!b) throw new AppError('도서를 찾을 수 없습니다.');
  ['title', 'author', 'publisher', 'isbn', 'cover', 'status'].forEach(function (k) { if (patch[k] !== undefined) b[k] = k === 'isbn' ? String(patch[k]).replace(/\D/g, '') : patch[k]; });
  if (patch.isbn !== undefined && !patch.cover) { b.cover = ''; b.coverCheckedAt = ''; }
  save_('books', b);
  return { ok: true };
}

function adminBooks_(q) {
  var open = openByCode_();
  var list = rows_('books');
  if (q) { q = String(q).toLowerCase(); list = list.filter(function (b) { return [b.code, b.title, b.author, b.publisher, b.isbn].join(' ').toLowerCase().indexOf(q) >= 0; }); }
  return list.slice().sort(function (a, b) { return (b.createdAt || '') > (a.createdAt || '') ? 1 : (b.createdAt || '') < (a.createdAt || '') ? -1 : a.code.localeCompare(b.code, undefined, { numeric: true }); })
    .slice(0, 300).map(function (b) { return { code: b.code, title: b.title, author: b.author, publisher: b.publisher, isbn: b.isbn, cover: b.cover, status: b.status, loanCount: b.loanCount, catName: catName_(b.catCode), groupName: groupName_(b.catCode), state: bookState_(b, open) }; });
}

function addCategory_(code, name, keywords) {
  code = String(code || '').trim();
  if (!/^\d{3,4}$/.test(code)) throw new AppError('분류번호는 3~4자리 숫자입니다.');
  if (categories_().some(function (c) { return c.code === code; })) throw new AppError('이미 있는 분류번호입니다.');
  save_('categories', { code: code, name: String(name).trim(), keywords: String(keywords || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String) });
  _cats = null;
  return { ok: true };
}
function updateCategory_(code, keywords) {
  var c = rows_('categories').filter(function (x) { return x.code === code; })[0];
  if (!c) throw new AppError('분류를 찾을 수 없습니다.');
  c.keywords = String(keywords || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
  save_('categories', c);
  return { ok: true };
}
function nextCategoryCode_(group) {
  var sibs = categories_().filter(function (c) { return c.group === String(group) && !c.isGroup; }).map(function (c) { return Number(c.code); });
  return String((sibs.length ? Math.max.apply(null, sibs) : Number(group)) + 1);
}

// ─── 데이터 점검 ─────────────────────────────────────
// 원본 시트에서 반납 처리가 누락된 기록: 같은 권(도서코드)을 이후에 다른 사람이 빌린 기록이 있는데 아직 '대출중'으로 남은 경우
function laterLoans_(l, loans) {
  return loans.filter(function (x) {
    return x !== l && x.bookCode === l.bookCode && x.status !== 'cancelled' &&
      (String(x.loanDate) > String(l.loanDate) || (String(x.loanDate) === String(l.loanDate) && Number(x.no) > Number(l.no)));
  }).sort(function (a, b) { return String(a.loanDate).localeCompare(String(b.loanDate)); });
}
function dataCheck_() {
  var loans = rows_('loans');
  var open = loans.filter(function (l) { return OPEN.indexOf(l.status) >= 0; });
  var stale = [];
  open.forEach(function (l) {
    var later = laterLoans_(l, loans);
    if (later.length) { var v = loanView_(l); v.later = later.slice(0, 3).map(function (x) { return { no: x.no, name: x.name, loanDate: x.loanDate, status: loanView_(x).statusLabel }; }); stale.push(v); }
  });
  var byCode = {};
  open.forEach(function (l) { (byCode[l.bookCode] = byCode[l.bookCode] || []).push(l); });
  var dup = Object.keys(byCode).filter(function (k) { return byCode[k].length > 1; }).map(function (k) { return { bookCode: k, loans: byCode[k].map(loanView_) }; });
  var noEmp = open.filter(function (l) { return !l.empNo; }).map(loanView_);
  return { stale: stale, dup: dup, noEmp: noEmp, openCount: open.length };
}
function fixStale_(ids, admin) {
  var loans = rows_('loans'), done = [];
  [].concat(ids).forEach(function (id) {
    var l = loans.filter(function (x) { return x.id === id; })[0];
    if (!l || OPEN.indexOf(l.status) < 0) return;
    var later = laterLoans_(l, loans);
    if (!later.length) return;
    l.status = 'returned';
    l.returnedAt = later[0].loanDate || today_();
    l.returnedBy = admin || '자동정리';
    l.memo = [l.memo, '[' + today_() + ' 데이터 점검: 이후 ' + later[0].name + '님 대출(' + later[0].loanDate + ') 기록이 있어 반납 처리]'].filter(String).join(' ');
    done.push(l);
  });
  save_('loans', done);
  return { fixed: done.length };
}

// ─── 내보내기 (CSV) ──────────────────────────────────
function csv_(rows) {
  return rows.map(function (r) { return r.map(function (c) { c = c == null ? '' : String(c); return /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
}
function exportData_(kind) {
  var t = today_();
  if (kind === 'books') {
    var open = openByCode_();
    var rows = [['도서코드', '분류번호', '분류명', '구매번호', '도서번호', '도서명', '저자', '출판사', 'ISBN', '상태', '현재 대출자', '반납예정일', '누적 대출횟수', '등록일']];
    rows_('books').forEach(function (b) {
      var st = bookState_(b, open), l = open[b.code], v = l ? loanView_(l) : null;
      rows.push([b.code, b.catCode, catName_(b.catCode), b.purchaseNo, b.copyNo, b.title, b.author, b.publisher, b.isbn, v && v.overdue ? '연체' : st, v ? v.name + ' (' + v.team + ')' : '', v ? v.dueDate : '', b.loanCount, String(b.createdAt || '').slice(0, 10)]);
    });
    return { name: '오스템문고_도서목록_' + t + '.csv', csv: csv_(rows), count: rows.length - 1 };
  }
  if (kind === 'loans') {
    var rows2 = [['번호', '도서코드', '도서명', '사번', '성명', '현재 소속', '대출 당시 소속', '대출일', '수령일', '반납예정일', '상태', '연체일수', '반납확인일', '반납확인자', '연장횟수', '메모']];
    rows_('loans').map(loanView_).sort(function (a, b) { return (Number(a.no) || 0) - (Number(b.no) || 0); }).forEach(function (v) {
      rows2.push([v.no, v.bookCode, v.bookTitle, v.empNo, v.name, v.team, v.teamAtLoan || v.team, v.loanDate, v.pickupDate, v.dueDate, v.statusLabel, v.overdueDays || '', v.returnedAt, v.returnedBy, (v.extensions || []).length || '', v.memo]);
    });
    return { name: '오스템문고_대출기록_' + t + '.csv', csv: csv_(rows2), count: rows2.length - 1 };
  }
  throw new AppError('알 수 없는 내보내기 종류입니다.');
}
