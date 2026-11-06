// ─────────────────────────────────────────────────────
// 운영자 인사이트: 자주 찾지만 보유가 적은 주제 → 구매 우선순위 제안
// ─────────────────────────────────────────────────────
function ownedForTerm_(corpus, term) {
  var n = normStr_(term); if (n.length < 2) return 0;
  return corpus.filter(function (d) { return d.title.indexOf(n) >= 0 || d.catName.indexOf(n) >= 0 || d.desc.indexOf(n) >= 0; }).length;
}

function insights_(days) {
  days = Math.max(7, Math.min(365, Number(days) || 90));
  var since = addDays_(today_(), -days);
  var logs = rows_('searchLog').filter(function (l) { return String(l.at).slice(0, 10) >= since; });
  var rec = logs.filter(function (l) { return l.source === 'recommend'; }), srch = logs.filter(function (l) { return l.source !== 'recommend'; });

  // 주제(키워드)별 집계
  var topics = {};
  logs.forEach(function (l) {
    String(l.terms || '').split(' ').filter(String).forEach(function (t) {
      var k = stripJosa_(t); if (k.length < 2) return;
      var o = topics[k] = topics[k] || { term: k, count: 0, weak: 0, recommend: 0, search: 0 };
      o.count++; if ((Number(l.hits) || 0) <= 2) o.weak++;
      if (l.source === 'recommend') o.recommend++; else o.search++;
    });
  });
  var corpus = corpus_();
  var reqs = rows_('requests');
  var list = Object.keys(topics).map(function (k) { return topics[k]; }).filter(function (o) { return o.count >= 2; });
  list.forEach(function (o) {
    o.owned = ownedForTerm_(corpus, o.term);
    var n = normStr_(o.term);
    var rel = reqs.filter(function (r) { return normStr_(r.title + ' ' + r.reason).indexOf(n) >= 0; });
    o.requests = rel.length;
    o.votes = rel.reduce(function (s, r) { return s + (Number(r.votes) || 0); }, 0);
    // 수요(검색·추천·신청·득표) 대비 보유가 적을수록 높은 점수
    o.priority = Math.round(((o.count + o.weak) + o.requests * 3 + o.votes * 2) / (1 + o.owned) * 10) / 10;
  });
  var gaps = list.filter(function (o) { return o.owned <= 3; }).sort(function (a, b) { return b.priority - a.priority || b.count - a.count; }).slice(0, 20);

  // 직무·고민 분포
  var jobs = {}, sits = {};
  rec.forEach(function (l) { if (l.job) jobs[l.job] = (jobs[l.job] || 0) + 1; String(l.situations || '').split(' ').filter(String).forEach(function (s) { sits[s] = (sits[s] || 0) + 1; }); });
  var jobName = {}; JOB_GROUPS.forEach(function (j) { jobName[j.id] = j.name; });
  var sitName = {}; SITUATIONS.forEach(function (s) { sitName[s.id] = s.label; });

  // 구매 우선순위 제안: 희망도서(득표·신청) + 수요 높은 미보유 주제
  var wish = reqs.filter(function (r) { return REQ_OPEN.indexOf(r.status) >= 0; }).map(function (r) {
    var n = normStr_(r.title + ' ' + r.reason);
    var demand = list.filter(function (o) { return n.indexOf(normStr_(o.term)) >= 0; }).reduce(function (s, o) { return s + o.count; }, 0);
    return { kind: 'request', id: r.id, title: r.title, author: r.author, status: r.status, votes: Number(r.votes) || 0, demand: demand, score: (Number(r.votes) || 0) * 3 + demand + (r.status === '구매확정' ? 100 : 0) };
  }).sort(function (a, b) { return b.score - a.score; });

  return {
    days: days, since: since,
    totals: { recommend: rec.length, search: srch.length, weakRecommend: rec.filter(function (l) { return (Number(l.hits) || 0) < 3; }).length, zeroSearch: srch.filter(function (l) { return !(Number(l.hits) || 0); }).length,
      requests: reqs.filter(function (r) { return String(r.createdAt).slice(0, 10) >= since; }).length },
    gaps: gaps,
    jobs: Object.keys(jobs).map(function (k) { return { name: jobName[k] || k, count: jobs[k] }; }).sort(function (a, b) { return b.count - a.count; }),
    situations: Object.keys(sits).map(function (k) { return { name: sitName[k] || k, count: sits[k] }; }).sort(function (a, b) { return b.count - a.count; }),
    wish: wish.slice(0, 20),
  };
}
