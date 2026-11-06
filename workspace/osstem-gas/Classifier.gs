// 자동 분류 + 도서코드 생성
// 1) 같은 책(ISBN/제목)이 있으면 같은 소분류·구매번호, 권번호 +1
// 2) 없으면 점수 합산: 기존 장서 제목 유사도 + 같은 저자 + KDC/부가기호 + 분류 키워드
function normStr_(s) { return String(s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^0-9a-z가-힣]/g, ''); }
function normTitle_(s) { return normStr_(String(s || '').split(/[:：\-–]/)[0]); }
function bigrams_(s) { var t = normStr_(s), set = {}; for (var i = 0; i < t.length - 1; i++) set[t.slice(i, i + 2)] = 1; if (t.length === 1) set[t] = 1; return set; }
function sim_(a, b) {
  var ka = Object.keys(a), kb = Object.keys(b);
  if (!ka.length || !kb.length) return 0;
  var inter = 0; ka.forEach(function (x) { if (b[x]) inter++; });
  return inter / Math.sqrt(ka.length * kb.length);
}
function authorKey_(a) { return normStr_(String(a || '').split(/[,/·]| 외| 지음| 저/)[0]); }

function findSameBook_(books, input) {
  var i = String(input.isbn || '').replace(/\D/g, ''), t = normTitle_(input.title);
  return books.filter(function (b) { return b.status !== 'discarded' && ((i && b.isbn === i) || (t && normTitle_(b.title) === t)); });
}

function classify_(input) {
  var leafs = leafCategories_();
  var leafSet = {}; leafs.forEach(function (c) { leafSet[c.code] = c; });
  var books = rows_('books').filter(function (b) { return b.status !== 'discarded'; });
  var scores = {}, reasons = {};
  function add(code, pts, why) { if (!leafSet[code]) return; scores[code] = (scores[code] || 0) + pts; (reasons[code] = reasons[code] || []).push(why); }

  var same = findSameBook_(books, input);
  if (same.length) add(same[0].catCode, 1000, '이미 보유 중인 도서 (' + same[0].code + ') — 같은 분류로 추가 권 등록');

  var q = bigrams_(input.title);
  books.map(function (b) { return { b: b, s: sim_(q, bigrams_(b.title)) }; })
    .filter(function (x) { return x.s > 0.25; }).sort(function (x, y) { return y.s - x.s; }).slice(0, 7)
    .forEach(function (x) { add(x.b.catCode, Math.round(x.s * 30), '제목 유사: 「' + x.b.title + '」'); });

  var ak = authorKey_(input.author);
  if (ak && ak.length >= 2) {
    var seen = {};
    books.filter(function (b) { return authorKey_(b.author) === ak; }).forEach(function (b) {
      if (seen[b.catCode]) return; seen[b.catCode] = 1;
      add(b.catCode, 25, '같은 저자의 보유 도서: 「' + b.title + '」');
    });
  }

  var k = mapKDC_(input.kdc);
  if (k) {
    if (k.leaf) add(k.leaf, 30, '국립중앙도서관 분류(KDC ' + input.kdc + ')');
    if (k.group) leafs.forEach(function (c) { if (c.group === k.group && c.code !== k.leaf) add(c.code, 8, 'KDC 대분류 일치'); });
  }

  var title = String(input.title || '').toLowerCase().replace(/\s/g, '');
  var desc = String(input.description || '').toLowerCase().replace(/\s/g, '').slice(0, 1500);
  leafs.forEach(function (c) {
    (c.keywords || []).forEach(function (kw) {
      var kwn = kw.replace(/\s/g, '');
      if (kwn.length < 2 && !/[a-z]/.test(kwn)) return;
      if (title.indexOf(kwn) >= 0) add(c.code, 12, "제목 키워드 '" + kw + "'");
      else if (desc.indexOf(kwn) >= 0) add(c.code, 3, "소개글 키워드 '" + kw + "'");
    });
  });
  var cats = (input.categories || []).join(' ').toLowerCase();
  [[/business|economics|management/, '130'], [/self-help/, '205'], [/psychology/, '404'], [/philosophy/, '402'], [/history/, '309'], [/science/, '802'], [/computers/, '1109'], [/fiction/, '604'], [/medical/, '1201'], [/family|parenting/, '1500']]
    .forEach(function (p) { if (p[0].test(cats)) add(p[1], 10, "Google Books 분류 '" + input.categories.join(', ') + "'"); });

  var ranked = Object.keys(scores).map(function (code) { return [code, scores[code]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5)
    .map(function (p) {
      var uniq = []; reasons[p[0]].forEach(function (r) { if (uniq.indexOf(r) < 0) uniq.push(r); });
      return { code: p[0], name: leafSet[p[0]].name, groupName: groupName_(p[0]), score: p[1], reasons: uniq.slice(0, 3) };
    });
  var top = ranked.length ? ranked[0].score : 1;
  ranked.forEach(function (r) { r.confidence = Math.round(r.score / top * 100); });
  if (input.forceCat && !ranked.some(function (r) { return r.code === String(input.forceCat); }) && leafSet[input.forceCat]) {
    ranked.push({ code: String(input.forceCat), name: leafSet[input.forceCat].name, groupName: groupName_(input.forceCat), score: 0, confidence: 0, reasons: ['직접 선택'] });
  }
  ranked.forEach(function (r) { r.preview = nextCode_(r.code, input, Number(input.count) || 1); });
  return { candidates: ranked, sameBooks: same.map(function (b) { return { code: b.code, title: b.title }; }) };
}

// 코드: 소분류-구매번호(3자리)-권번호
function nextCode_(catCode, input, count) {
  var inCat = rows_('books').filter(function (b) { return b.catCode === String(catCode); });
  var same = findSameBook_(inCat, input);
  var purchaseNo, start;
  if (same.length) {
    purchaseNo = same[0].purchaseNo;
    start = inCat.filter(function (b) { return b.purchaseNo === purchaseNo; }).reduce(function (m, b) { return Math.max(m, Number(b.copyNo) || 0); }, 0) + 1;
  } else {
    purchaseNo = ('00' + (inCat.reduce(function (m, b) { return Math.max(m, Number(b.purchaseNo) || 0); }, 0) + 1)).slice(-3);
    start = 1;
  }
  var codes = [];
  for (var i = 0; i < (count || 1); i++) codes.push({ catCode: String(catCode), purchaseNo: purchaseNo, copyNo: String(start + i), code: catCode + '-' + purchaseNo + '-' + (start + i) });
  return { codes: codes, isAdditionalCopy: !!same.length };
}
