// 목업 전용: Google Apps Script 서버 환경을 브라우저 안에서 흉내 냅니다 (구글 시트 → 메모리).
(function () {
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d, tz, f) {
    var k = new Date(d.getTime() + 9 * 3600e3);
    var map = { yyyy: k.getUTCFullYear(), MM: pad(k.getUTCMonth() + 1), dd: pad(k.getUTCDate()), HH: pad(k.getUTCHours()), mm: pad(k.getUTCMinutes()), ss: pad(k.getUTCSeconds()) };
    if (f === 'H') return String(k.getUTCHours());
    return f.replace(/'T'/, 'T').replace(/yyyy|MM|dd|HH|mm|ss/g, function (m) { return map[m]; });
  }
  function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  Range.prototype.getValues = function () { var out = []; for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); out.push(row); } return out; };
  Range.prototype.setValues = function (v) { var self = this; v.forEach(function (row, i) { row.forEach(function (x, j) { self.sh.set(self.r + i, self.c + j, x); }); }); return this; };
  Range.prototype.setValue = function (x) { this.sh.set(this.r, this.c, x); return this; };
  ['setFontWeight', 'setBackground', 'setNumberFormat', 'setFontColor'].forEach(function (k) { Range.prototype[k] = function () { return this; }; });
  function Sheet(name, data, id) { this.name = name; this.data = data || []; this.id = id; }
  Sheet.prototype.get = function (r, c) { var row = this.data[r - 1]; var v = row ? row[c - 1] : undefined; return v === undefined || v === null ? '' : v; };
  Sheet.prototype.set = function (r, c, v) { while (this.data.length < r) this.data.push([]); var row = this.data[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; };
  Sheet.prototype.getLastRow = function () { for (var i = this.data.length; i > 0; i--) if (this.data[i - 1].some(function (x) { return x !== '' && x != null; })) return i; return 0; };
  Sheet.prototype.getLastColumn = function () { return this.data.reduce(function (m, r) { var l = 0; r.forEach(function (x, i) { if (x !== '' && x != null) l = i + 1; }); return Math.max(m, l); }, 0); };
  Sheet.prototype.getMaxRows = function () { return Math.max(1000, this.data.length); };
  Sheet.prototype.getDataRange = function () { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); };
  Sheet.prototype.getRange = function (a, b, c, d) { if (typeof a === 'string') { var m = a.match(/([A-Z]+)(\d+)/); return new Range(this, Number(m[2]), m[1].charCodeAt(0) - 64, 1, 1); } return new Range(this, a, b, c || 1, d || 1); };
  Sheet.prototype.appendRow = function (row) { var r = this.getLastRow() + 1, self = this; row.forEach(function (v, i) { self.set(r, i + 1, v); }); return this; };
  Sheet.prototype.getName = function () { return this.name; };
  Sheet.prototype.getSheetId = function () { return this.id; };
  Sheet.prototype.setFrozenRows = function () {};
  function Spreadsheet(id, name) { this.id = id; this.name = name; this.sheets = [new Sheet('시트1', [], 0)]; }
  Spreadsheet.prototype.getSheetByName = function (n) { return this.sheets.filter(function (s) { return s.name === n; })[0] || null; };
  Spreadsheet.prototype.insertSheet = function (n) { var s = new Sheet(n, [], this.sheets.length + 100); this.sheets.push(s); return s; };
  Spreadsheet.prototype.getSheets = function () { return this.sheets; };
  Spreadsheet.prototype.deleteSheet = function (s) { this.sheets = this.sheets.filter(function (x) { return x !== s; }); };
  Spreadsheet.prototype.getId = function () { return this.id; };
  Spreadsheet.prototype.getUrl = function () { return 'https:\/\/docs.google.com/spreadsheets/d/' + this.id; };
  Spreadsheet.prototype.setSpreadsheetTimeZone = function () {};

  var files = {}, props = {}, cache = {}, triggers = [];
  window.__mock = { files: files, props: props, sent: [], Spreadsheet: Spreadsheet, Sheet: Sheet };
  window.SpreadsheetApp = {
    openById: function (id) { if (!files[id]) throw new Error('no file ' + id); return files[id]; },
    create: function (name) { var id = 'DEMO_DB'; files[id] = new Spreadsheet(id, name); return files[id]; },
    flush: function () {},
  };
  window.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return k in props ? props[k] : null; }, setProperty: function (k, v) { props[k] = String(v); } }; } };
  window.CacheService = { getScriptCache: function () { return {
    get: function (k) { return k in cache ? cache[k] : null; }, put: function (k, v) { cache[k] = String(v); },
    putAll: function (m) { for (var k in m) cache[k] = String(m[k]); },
    getAll: function (ks) { var o = {}; ks.forEach(function (k) { if (k in cache) o[k] = cache[k]; }); return o; }, remove: function (k) { delete cache[k]; } }; } };
  window.LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
  window.Utilities = { formatDate: fmtDate, getUuid: function () { return (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); }, sleep: function () {} };
  window.MailApp = { sendEmail: function (o) { window.__mock.sent.push(o); }, getRemainingDailyQuota: function () { return 1500 - window.__mock.sent.length; } };
  window.UrlFetchApp = { fetchAll: function () { throw new Error('목업에서는 외부 조회를 하지 않습니다'); } };
  window.ScriptApp = {
    getProjectTriggers: function () { return triggers; }, deleteTrigger: function (t) { triggers.splice(triggers.indexOf(t), 1); },
    newTrigger: function (fn) { var t = { getHandlerFunction: function () { return fn; } }; var c = {}; ['timeBased', 'atHour', 'nearMinute', 'everyDays', 'everyMinutes', 'inTimezone'].forEach(function (k) { c[k] = function () { return c; }; }); c.create = function () { triggers.push(t); return t; }; return c; },
    getService: function () { return { getUrl: function () { return ''; } }; },
  };
  window.HtmlService = {};
  window.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: function (t) { return { t: t, setMimeType: function () { return this; } }; } };
  window.Logger = { log: function () {} };
  // 화면 → 서버 호출을 메모리 안에서 처리 (google.script.run 흉내)
  function Runner(ok, fail) { this.ok = ok; this.fail = fail; }
  Runner.prototype.withSuccessHandler = function (f) { return new Runner(f, this.fail); };
  Runner.prototype.withFailureHandler = function (f) { return new Runner(this.ok, f); };
  Runner.prototype.rpc = function (name, args, token) {
    var self = this;
    setTimeout(function () { try { _tables = {}; _cats = null; _empMap = null; var out = window.rpc(name, args, token); window.__demoSave(); self.ok && self.ok(out); } catch (e) { console.error(e); self.fail && self.fail(e); } }, 120);
  };
  window.google = { script: { run: new Runner() } };
  // 데모 상태를 이 브라우저에 저장 → 사용자/관리자 화면을 오가도 같은 데이터
  var KEY = 'osstem-demo-v7';
  window.__demoSave = function () {
    try { var db = files.DEMO_DB; if (!db) return; localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), props: props, sheets: db.sheets.map(function (sh) { return { name: sh.name, id: sh.id, data: sh.data }; }) })); } catch (e) {}
  };
  window.__demoLoad = function () {
    try { var raw = localStorage.getItem(KEY); if (!raw) return false; var o = JSON.parse(raw); var db = new Spreadsheet('DEMO_DB', '오스템문고 시스템 DB'); db.sheets = o.sheets.map(function (x) { return new Sheet(x.name, x.data, x.id); }); files.DEMO_DB = db; Object.keys(o.props).forEach(function (k) { props[k] = o.props[k]; }); return true; } catch (e) { return false; }
  };
  window.__demoReset = function () { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };
})();
