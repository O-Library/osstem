// 공통 유틸: 오류, 날짜(Asia/Seoul), 영업일 계산
var TZ = 'Asia/Seoul';

var AppError = function (message) { this.message = message; this.app = true; };
AppError.prototype = Object.create(Error.prototype);

function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function nowIso_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }

var FAKE_TODAY = null; // 테스트용
function today_() { return FAKE_TODAY || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function nowHour_() { return Number(Utilities.formatDate(new Date(), TZ, 'H')); }

function parseD_(d) { var p = d.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
function fmtD_(dt) { return dt.toISOString().slice(0, 10); }
function addDays_(d, n) { var dt = parseD_(d); dt.setUTCDate(dt.getUTCDate() + n); return fmtD_(dt); }
function diffDays_(a, b) { return Math.round((parseD_(a) - parseD_(b)) / 86400000); }
function dow_(d) { return parseD_(d).getUTCDay(); }
function isBizDay_(d, hol) { var w = dow_(d); return w !== 0 && w !== 6 && (hol || []).indexOf(d) < 0; }
function nextBizDay_(d, hol) { var x = addDays_(d, 1); while (!isBizDay_(x, hol)) x = addDays_(x, 1); return x; }
function toBizDay_(d, hol) { var x = d; while (!isBizDay_(x, hol)) x = addDays_(x, 1); return x; }
var DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
function pretty_(d) { if (!d) return ''; var p = d.split('-'); return p[0] + '년 ' + Number(p[1]) + '월 ' + Number(p[2]) + '일(' + DOW_KO[dow_(d)] + ')'; }

function normDate_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var s = String(v).trim();
  var m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}

function normEmp_(v) { return String(v == null ? '' : v).trim().replace(/\s/g, '').toUpperCase(); }
function maskName_(n) { n = String(n || ''); if (n.length <= 1) return n; if (n.length === 2) return n[0] + '*'; return n[0] + '*'.repeat(n.length - 2) + n[n.length - 1]; }
function maskEmail_(e) { e = String(e || ''); var p = e.split('@'); if (p.length < 2) return ''; return p[0].slice(0, 2) + '***@' + p[1]; }
