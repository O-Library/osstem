// ─────────────────────────────────────────────────────
// 희망도서 신청 → 구매 투표 → 구매확정 → 입고 시 신청자 알림
//  · 신청·투표는 사번으로 본인 확인(중복 투표 방지·입고 알림용). 화면에는 신청자를 공개하지 않음
// ─────────────────────────────────────────────────────
var REQ_OPEN = ['접수', '투표중', '투표완료', '구매확정'];
var MAX_OPEN_REQUESTS_PER_PERSON = 5;

function ownedMatch_(title, author) {
  var q = bigrams_(title), nt = normTitle_(title), best = null;
  catalog_().items.forEach(function (t) {
    var s = normTitle_(t.title) === nt ? 1 : sim_(q, bigrams_(t.title));
    if (s >= 0.82 && (!best || s > best.s)) best = { s: s, t: t };
  });
  return best ? { key: best.t.key, title: best.t.title, author: best.t.author, available: best.t.available, copies: best.t.copies } : null;
}
function sameRequest_(title) {
  var nt = normTitle_(title), q = bigrams_(title);
  return rows_('requests').filter(function (r) { return REQ_OPEN.indexOf(r.status) >= 0 && (normTitle_(r.title) === nt || sim_(q, bigrams_(r.title)) >= 0.85); })[0] || null;
}

function currentRound_() {
  var t = today_();
  return rows_('rounds').filter(function (r) { return r.status === '진행' && r.startDate <= t && t <= r.endDate; })
    .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })[0] || null;
}
function tally_(roundId) {
  var m = {};
  rows_('ballots').forEach(function (b) { if (b.roundId === roundId) (b.choices || []).forEach(function (id) { m[id] = (m[id] || 0) + 1; }); });
  return m;
}
function voterCount_(roundId) { return rows_('ballots').filter(function (b) { return b.roundId === roundId && (b.choices || []).length; }).length; }

function requestView_(r, admin) {
  var v = { id: r.id, createdAt: String(r.createdAt), title: r.title, author: r.author, publisher: r.publisher, reason: r.reason,
    status: r.status, roundId: r.roundId, votes: r.votes || 0, adminMemo: r.adminMemo, bookCode: r.bookCode };
  if (admin) { var e = r.empNo && empMap_()[normEmp_(r.empNo)]; v.empNo = r.empNo; v.requester = e ? String(e.name).trim() + ' (' + String(e.team).trim() + ')' : r.empNo; }
  return v;
}

function roundView_(r, empNo) {
  if (!r) return null;
  var counts = tally_(r.id);
  var reqs = {}; rows_('requests').forEach(function (x) { reqs[x.id] = x; });
  var v = { id: r.id, title: r.title, startDate: r.startDate, endDate: r.endDate, maxVotes: r.maxVotes || 3, buyCount: r.buyCount || 0, status: r.status,
    daysLeft: r.endDate ? diffDays_(r.endDate, today_()) : null, voters: voterCount_(r.id),
    candidates: (r.candidates || []).filter(function (id) { return reqs[id]; }).map(function (id) { var q = requestView_(reqs[id]); q.count = counts[id] || 0; return q; }) };
  if (r.result) v.result = r.result;
  if (empNo) { var k = normEmp_(empNo); var b = rows_('ballots').filter(function (x) { return x.roundId === r.id && normEmp_(x.empNo) === k; })[0]; v.myChoices = b ? b.choices : []; }
  return v;
}

// ─── 사용자 ──────────────────────────────────────────
function wishBoard_() {
  var round = currentRound_();
  var list = rows_('requests').filter(function (r) { return r.status !== '반려' || diffDays_(today_(), String(r.decidedAt || r.createdAt).slice(0, 10)) <= 60; })
    .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, 200).map(function (r) { return requestView_(r); });
  var last = rows_('rounds').filter(function (r) { return r.status === '마감'; }).sort(function (a, b) { return String(b.endDate).localeCompare(String(a.endDate)); })[0];
  return { round: roundView_(round), lastRound: last ? roundView_(last) : null, requests: list };
}

function submitRequest_(input, empNo, force) {
  var who = employee_(empNo);
  var title = String((input && input.title) || '').trim();
  if (title.length < 2) throw new AppError('도서명을 입력해 주세요.');
  if (!force) {
    var own = ownedMatch_(title, input.author);
    if (own) return { owned: own };
    var dup = sameRequest_(title);
    if (dup) return { duplicate: requestView_(dup) };
  }
  var mine = rows_('requests').filter(function (r) { return normEmp_(r.empNo) === who.empNo && REQ_OPEN.indexOf(r.status) >= 0; });
  if (mine.length >= MAX_OPEN_REQUESTS_PER_PERSON) throw new AppError('진행 중인 신청이 ' + mine.length + '건 있습니다. 처리된 뒤 다시 신청해 주세요. (1인 최대 ' + MAX_OPEN_REQUESTS_PER_PERSON + '건)');
  var r = { id: uid_(), createdAt: nowIso_(), title: title, author: String(input.author || '').trim(), publisher: String(input.publisher || '').trim(),
    reason: String(input.reason || '').trim().slice(0, 500), empNo: who.empNo, status: '접수', roundId: '', votes: 0, adminMemo: '', bookCode: '', decidedAt: '' };
  save_('requests', r);
  return { created: requestView_(r) };
}

function vote_(roundId, ids, empNo) {
  var who = employee_(empNo);
  var r = rows_('rounds').filter(function (x) { return x.id === roundId; })[0];
  var t = today_();
  if (!r || r.status !== '진행' || t < r.startDate || t > r.endDate) throw new AppError('지금은 투표 기간이 아닙니다.');
  ids = [].concat(ids || []).filter(function (id, i, a) { return a.indexOf(id) === i; });
  var max = Number(r.maxVotes) || 3;
  if (ids.length > max) throw new AppError('최대 ' + max + '권까지 고를 수 있습니다.');
  if (ids.some(function (id) { return (r.candidates || []).indexOf(id) < 0; })) throw new AppError('투표 후보가 아닌 도서가 있습니다.');
  var b = rows_('ballots').filter(function (x) { return x.roundId === roundId && normEmp_(x.empNo) === who.empNo; })[0];
  if (!b) b = { roundId: roundId, empNo: who.empNo };
  b.choices = ids; b.at = nowIso_();
  save_('ballots', b);
  syncVotes_(r);
  return roundView_(r, who.empNo);
}
function syncVotes_(r) {
  var counts = tally_(r.id), changed = [];
  rows_('requests').forEach(function (q) { if ((r.candidates || []).indexOf(q.id) >= 0 && (q.votes || 0) !== (counts[q.id] || 0)) { q.votes = counts[q.id] || 0; changed.push(q); } });
  save_('requests', changed);
}
function myBallot_(roundId, empNo) { var r = rows_('rounds').filter(function (x) { return x.id === roundId; })[0]; employee_(empNo); return roundView_(r, empNo); }

// ─── 관리자 ──────────────────────────────────────────
function adminWish_() {
  var reqs = rows_('requests').slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).map(function (r) {
    var v = requestView_(r, true); v.owned = REQ_OPEN.indexOf(r.status) >= 0 ? ownedMatch_(r.title) : null; return v;
  });
  var rounds = rows_('rounds').slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).map(function (r) { return roundView_(r); });
  return { requests: reqs, rounds: rounds };
}
function updateRequest_(id, patch) {
  var r = rows_('requests').filter(function (x) { return x.id === id; })[0];
  if (!r) throw new AppError('신청 정보를 찾을 수 없습니다.');
  if (patch.status && ['접수', '투표중', '투표완료', '구매확정', '구매완료', '반려', '보유중'].indexOf(patch.status) < 0) throw new AppError('알 수 없는 상태입니다.');
  ['status', 'adminMemo', 'title', 'author', 'publisher'].forEach(function (k) { if (patch[k] !== undefined) r[k] = String(patch[k]); });
  if (patch.status) r.decidedAt = nowIso_();
  save_('requests', r);
  return requestView_(r, true);
}
function createRound_(input, admin) {
  var ids = [].concat(input.candidates || []);
  if (ids.length < 1) throw new AppError('투표 후보 도서를 1권 이상 골라 주세요.');
  if (currentRound_()) throw new AppError('이미 진행 중인 투표가 있습니다. 마감한 뒤 새 투표를 만들어 주세요.');
  var reqs = rows_('requests').filter(function (r) { return ids.indexOf(r.id) >= 0; });
  var start = input.startDate || today_(), end = input.endDate || addDays_(start, 7);
  if (end < start) throw new AppError('마감일이 시작일보다 빠릅니다.');
  var r = { id: uid_(), title: String(input.title || '').trim() || (start.slice(0, 7).replace('-', '년 ') + '월 희망도서 투표'), startDate: start, endDate: end,
    maxVotes: Math.max(1, Math.min(10, Number(input.maxVotes) || 1)), buyCount: Number(input.buyCount) || 0, candidates: ids.filter(function (id) { return reqs.some(function (x) { return x.id === id; }); }),
    status: '진행', createdAt: nowIso_(), createdBy: admin || '', result: null };
  save_('rounds', r);
  reqs.forEach(function (x) { x.status = '투표중'; x.roundId = r.id; x.votes = 0; });
  save_('requests', reqs);
  return roundView_(r);
}
function closeRound_(id) {
  var r = rows_('rounds').filter(function (x) { return x.id === id; })[0];
  if (!r) throw new AppError('투표를 찾을 수 없습니다.');
  var counts = tally_(r.id);
  var reqs = rows_('requests').filter(function (x) { return (r.candidates || []).indexOf(x.id) >= 0; });
  reqs.sort(function (a, b) { return (counts[b.id] || 0) - (counts[a.id] || 0) || String(a.createdAt).localeCompare(String(b.createdAt)); });
  // 투표 결과는 구매 심사 참고용: 자동으로 구매확정하지 않고 '투표완료'로 둔다
  reqs.forEach(function (x) {
    x.votes = counts[x.id] || 0;
    if (x.status === '투표중') { x.status = '투표완료'; x.decidedAt = nowIso_(); }
  });
  save_('requests', reqs);
  r.status = '마감';
  r.result = { voters: voterCount_(r.id), ranking: reqs.map(function (x) { return { id: x.id, title: x.title, votes: x.votes, status: x.status }; }), closedAt: nowIso_() };
  save_('rounds', r);
  return roundView_(r);
}
// 투표 마감일이 지난 진행 중 투표는 매일 자동 마감
function autoCloseRounds_() {
  var t = today_(), n = 0;
  rows_('rounds').forEach(function (r) { if (r.status === '진행' && r.endDate && r.endDate < t) { closeRound_(r.id); n++; } });
  return n;
}

// 도서 등록 시: 같은 책을 구매확정·신청한 사람에게 입고 알림
function fulfillRequests_(created) {
  if (!created || !created.length) return 0;
  var b = created[0];
  var nt = normTitle_(b.title), q = bigrams_(b.title);
  var hit = rows_('requests').filter(function (r) { return REQ_OPEN.indexOf(r.status) >= 0 && (normTitle_(r.title) === nt || sim_(q, bigrams_(r.title)) >= 0.85); });
  hit.forEach(function (r) {
    r.status = '구매완료'; r.bookCode = b.code; r.decidedAt = nowIso_();
    var e = r.empNo && empMap_()[normEmp_(r.empNo)];
    if (e && e.email) {
      var s = settings_();
      try {
        sendMail_({ type: '희망도서입고', to: String(e.email).trim(), subject: '[' + s.libraryName + '] 신청하신 「' + b.title + '」이(가) 들어왔어요',
          html: layout_('신청하신 책이 들어왔어요', '<p>' + esc_(String(e.name).trim()) + '님이 신청하신 <b>「' + esc_(b.title) + '」</b>(도서코드 ' + esc_(b.code) + ')이 등록되었습니다.</p><p>사이트에서 바로 대출 신청하실 수 있습니다.' + (props_().getProperty('WEBAPP_URL') ? ' <a href="' + esc_(props_().getProperty('WEBAPP_URL')) + '">오스템문고 바로가기</a>' : '') + '</p>') });
      } catch (err) { console.error('fulfill mail', err); }
    }
  });
  save_('requests', hit);
  return hit.length;
}
