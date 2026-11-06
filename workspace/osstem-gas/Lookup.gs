// 도서정보 조회 + 실제 표지 이미지
// 키 없이: Google Books + 교보문고 표지(ISBN) / 키가 있으면: 카카오·국립중앙도서관·네이버 추가 (관리 › 설정에서 입력)
function apiKeys_() {
  var p = props_();
  return { kakao: p.getProperty('KAKAO_REST_KEY') || '', nl: p.getProperty('NL_CERT_KEY') || '', naverId: p.getProperty('NAVER_CLIENT_ID') || '', naverSecret: p.getProperty('NAVER_CLIENT_SECRET') || '' };
}
function providers_() { var k = apiKeys_(); return { kakao: !!k.kakao, nl: !!k.nl, naver: !!(k.naverId && k.naverSecret), google: true }; }

function stripTags_(s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(); }
function isbn13_(s) { var parts = String(s || '').split(/\s+/).map(function (x) { return x.replace(/[^0-9Xx]/g, ''); }); return parts.filter(function (p) { return p.length === 13; })[0] || parts.filter(function (p) { return p.length === 10; })[0] || ''; }

// 여러 요청을 병렬로 보내고 JSON 파싱
function fetchJsonAll_(reqs) {
  if (!reqs.length) return [];
  var res;
  try { res = UrlFetchApp.fetchAll(reqs.map(function (r) { return { url: r.url, headers: r.headers || {}, muteHttpExceptions: true }; })); } catch (e) { return reqs.map(function () { return null; }); }
  return res.map(function (x) { try { return x.getResponseCode() === 200 ? JSON.parse(x.getContentText()) : null; } catch (e) { return null; } });
}

function parseKakao_(j) { return ((j && j.documents) || []).map(function (d) { return { source: 'kakao', title: d.title, author: (d.authors || []).join(', '), publisher: d.publisher, isbn: isbn13_(d.isbn), pubDate: String(d.datetime || '').slice(0, 10), cover: d.thumbnail, description: stripTags_(d.contents) }; }); }
function parseNl_(j) { return ((j && j.docs) || []).map(function (d) { return { source: 'nl', title: d.TITLE, author: d.AUTHOR, publisher: d.PUBLISHER, isbn: d.EA_ISBN, pubDate: String(d.PUBLISH_PREDATE || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'), cover: d.TITLE_URL, description: '', kdc: d.KDC || kdcFromAddCode_(d.EA_ADD_CODE) }; }); }
function parseNaver_(j) { return ((j && j.items) || []).map(function (d) { return { source: 'naver', title: stripTags_(d.title), author: stripTags_(d.author).replace(/\^/g, ', '), publisher: stripTags_(d.publisher), isbn: isbn13_(d.isbn), pubDate: String(d.pubdate || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'), cover: d.image, description: stripTags_(d.description) }; }); }
function parseGoogle_(j) {
  return ((j && j.items) || []).map(function (it) {
    var v = it.volumeInfo || {};
    var id13 = (v.industryIdentifiers || []).filter(function (x) { return x.type === 'ISBN_13'; })[0];
    return { source: 'google', title: [v.title, v.subtitle].filter(Boolean).join(': '), author: (v.authors || []).join(', '), publisher: v.publisher || '', isbn: id13 ? id13.identifier : '', pubDate: v.publishedDate || '', cover: String((v.imageLinks || {}).thumbnail || '').replace('http://', 'https://'), description: v.description || '', categories: v.categories || [] };
  });
}

function bookRequests_(input) {
  var k = apiKeys_();
  var isbn = String(input.isbn || '').replace(/\D/g, '');
  var q = isbn.length >= 10 ? isbn : [input.title, input.author].filter(Boolean).join(' ');
  var reqs = [];
  if (k.kakao) reqs.push({ p: parseKakao_, url: 'https://dapi.kakao.com/v3/search/book?size=10&target=' + (isbn.length >= 10 ? 'isbn' : 'title') + '&query=' + encodeURIComponent(isbn.length >= 10 ? isbn : input.title), headers: { Authorization: 'KakaoAK ' + k.kakao } });
  if (k.nl) reqs.push({ p: parseNl_, url: 'https://www.nl.go.kr/seoji/SearchApi.do?cert_key=' + encodeURIComponent(k.nl) + '&result_style=json&page_no=1&page_size=10&' + (isbn.length >= 10 ? 'isbn=' + isbn : 'title=' + encodeURIComponent(input.title)) });
  if (k.naverId && k.naverSecret) reqs.push({ p: parseNaver_, url: 'https://openapi.naver.com/v1/search/book.json?display=10&query=' + encodeURIComponent(q), headers: { 'X-Naver-Client-Id': k.naverId, 'X-Naver-Client-Secret': k.naverSecret } });
  reqs.push({ p: parseGoogle_, url: 'https://www.googleapis.com/books/v1/volumes?maxResults=10&q=' + encodeURIComponent(isbn.length >= 10 ? 'isbn:' + isbn : 'intitle:' + input.title + (input.author ? ' inauthor:' + String(input.author).split(',')[0] : '')) });
  return reqs;
}

function searchBooks_(input) {
  var reqs = bookRequests_(input);
  var out = fetchJsonAll_(reqs);
  var all = [];
  out.forEach(function (j, i) { all = all.concat(reqs[i].p(j)); });
  // ISBN 기준으로 합치기 (빈 필드는 다른 출처로 채움)
  var map = {}, order = [];
  all.forEach(function (r) {
    var key = r.isbn || r.title;
    if (!map[key]) { map[key] = r; order.push(key); }
    else Object.keys(r).forEach(function (f) { if (!map[key][f] && r[f]) map[key][f] = r[f]; });
  });
  var n = function (s) { return String(s || '').replace(/\s/g, '').toLowerCase(); };
  var score = function (r) { return (input.author && n(r.author).indexOf(n(input.author).slice(0, 3)) >= 0 ? 2 : 0) + (input.publisher && n(r.publisher).indexOf(n(input.publisher)) >= 0 ? 2 : 0) + (n(r.title) === n(input.title) ? 3 : 0) + (r.source === 'kakao' ? 1 : 0); };
  var list = order.map(function (k) { return map[k]; });
  list.forEach(function (r) { if (r.isbn && (!r.cover || r.source === 'google')) r.coverCandidate = kyoboCover_(r.isbn); });
  return list.sort(function (a, b) { return score(b) - score(a); });
}

// 원본 시트에 바코드(ISBN)가 없는 책: 제목·출판사·저자로 찾아서 확실할 때만 ISBN·표지를 채움
//   (카카오·네이버·국립중앙도서관 키가 있을 때 정확도가 높고, 없으면 Google Books만 사용)
function fillByTitle_(limit) {
  var books = rows_('books').filter(function (b) { return !b.isbn && !b.cover && !b.coverCheckedAt && b.status !== 'discarded' && b.title; });
  var byTitle = {}; books.forEach(function (b) { var k = titleKey_(b); (byTitle[k] = byTitle[k] || []).push(b); });
  var keys = Object.keys(byTitle).slice(0, limit || 20);
  var n = function (s) { return String(s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^0-9a-z가-힣]/g, ''); };
  var found = 0, changed = [], stamp = today_();
  keys.forEach(function (k) {
    var b0 = byTitle[k][0], hit = null;
    try {
      var main = String(b0.title).split(/[:：]/)[0];
      hit = searchBooks_({ title: main, author: String(b0.author || '').split(/[,\s]/)[0], publisher: b0.publisher }).filter(function (r) {
        var sc = 0;
        if (n(r.title).indexOf(n(main)) === 0) sc += 3;
        if (b0.publisher && n(r.publisher).indexOf(n(b0.publisher).slice(0, 2)) >= 0) sc += 2;
        if (b0.author && n(r.author).indexOf(n(String(b0.author).split(/[,\s]/)[0])) >= 0) sc += 2;
        return r.isbn && String(r.isbn).length === 13 && sc >= 5; // 제목 + (출판사 또는 저자)가 맞아야 채움
      })[0] || null;
    } catch (e) { hit = null; }
    byTitle[k].forEach(function (b) {
      if (hit) { b.isbn = hit.isbn; b.cover = hit.cover && hit.source !== 'google' ? hit.cover : kyoboCover_(hit.isbn); if (!b.description && hit.description) b.description = String(hit.description).slice(0, 3000); }
      b.coverCheckedAt = stamp; changed.push(b);
    });
    if (hit) found++;
  });
  save_('books', changed);
  return { checked: keys.length, found: found, remaining: Object.keys(byTitle).length - keys.length };
}

function kyoboCover_(isbn) { return 'https://contents.kyobobook.co.kr/sih/fit-in/458x0/pdt/' + isbn + '.jpg'; }
function links_(isbn, title) {
  return { kyobo: 'https://search.kyobobook.co.kr/search?keyword=' + encodeURIComponent(isbn || title), nl: 'https://www.nl.go.kr/NL/contents/search.do?srchTarget=total&kwd=' + encodeURIComponent(isbn || title) };
}

// 이미지 URL이 실제 이미지인지 확인 (교보 → 카카오/구글 순)
function isImage_(resp) {
  if (!resp || resp.getResponseCode() !== 200) return false;
  var h = resp.getHeaders(); var ct = String(h['Content-Type'] || h['content-type'] || '');
  return /^image\//.test(ct) && resp.getBlob().getBytes().length > 2000;
}

// 표지가 비어 있는 도서를 묶음으로 확인해 표지URL 저장 (매일 자동 + 관리자 버튼)
function fillCovers_(limit) {
  var books = rows_('books').filter(function (b) { return b.isbn && !b.cover && !b.coverCheckedAt && b.status !== 'discarded'; });
  var byIsbn = {}; books.forEach(function (b) { (byIsbn[b.isbn] = byIsbn[b.isbn] || []).push(b); });
  var isbns = Object.keys(byIsbn).slice(0, limit || 120);
  var noIsbn = fillByTitle_(20);
  if (!isbns.length) return { checked: noIsbn.checked, found: noIsbn.found, remaining: noIsbn.remaining, isbnFilled: noIsbn.found };
  var resp;
  try { resp = UrlFetchApp.fetchAll(isbns.map(function (i) { return { url: kyoboCover_(i), muteHttpExceptions: true, followRedirects: true }; })); } catch (e) { resp = []; }
  var found = 0, missing = [];
  isbns.forEach(function (isbn, i) {
    if (isImage_(resp[i])) { byIsbn[isbn].forEach(function (b) { b.cover = kyoboCover_(isbn); }); found++; }
    else missing.push(isbn);
  });
  // 교보에 없으면 카카오(키 있을 때) → Google Books 표지
  if (missing.length) {
    var k = apiKeys_();
    var reqs = missing.map(function (isbn) {
      return k.kakao ? { url: 'https://dapi.kakao.com/v3/search/book?target=isbn&query=' + isbn, headers: { Authorization: 'KakaoAK ' + k.kakao }, p: parseKakao_ }
        : { url: 'https://www.googleapis.com/books/v1/volumes?q=isbn:' + isbn, p: parseGoogle_ };
    });
    var js = fetchJsonAll_(reqs);
    missing.forEach(function (isbn, i) {
      var r = reqs[i].p(js[i])[0];
      if (r && r.cover) { byIsbn[isbn].forEach(function (b) { b.cover = r.cover; if (!b.description && r.description) b.description = String(r.description).slice(0, 3000); }); found++; }
    });
  }
  var stamp = today_();
  var changed = [];
  isbns.forEach(function (isbn) { byIsbn[isbn].forEach(function (b) { b.coverCheckedAt = stamp; changed.push(b); }); });
  save_('books', changed);
  var remaining = Object.keys(byIsbn).length - isbns.length;
  return { checked: isbns.length + noIsbn.checked, found: found + noIsbn.found, remaining: remaining + noIsbn.remaining, isbnFilled: noIsbn.found };
}

// 상세 화면에서 소개글이 없으면 1회 조회해 저장
function enrichOnce_(books) {
  var first = books[0];
  if (!first.isbn || first.description || books.some(function (b) { return /^info:/.test(b.kdc); })) return;
  var reqs = bookRequests_({ isbn: first.isbn });
  var js = fetchJsonAll_(reqs);
  var all = []; js.forEach(function (j, i) { all = all.concat(reqs[i].p(j)); });
  var info = {}; all.forEach(function (r) { ['cover', 'description', 'pubDate', 'kdc'].forEach(function (f) { if (!info[f] && r[f]) info[f] = r[f]; }); });
  books.forEach(function (b) {
    if (!b.cover && info.cover) b.cover = info.cover;
    if (!b.description && info.description) b.description = String(info.description).slice(0, 3000);
    if (!b.pubDate && info.pubDate) b.pubDate = info.pubDate;
    b.kdc = 'info:' + (info.kdc || b.kdc || '');
  });
  save_('books', books);
}
