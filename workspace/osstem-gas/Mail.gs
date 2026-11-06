// 메일: 즉시 안내(신청·연장·예약) + 매일 자동 리마인더(반납예정·연체) + 주간 관리자 요약
function mailQuota_() { try { return MailApp.getRemainingDailyQuota(); } catch (e) { return null; } }

function layout_(title, body, accent) {
  var s = settings_(); accent = accent || '#d9480f';
  var url = props_().getProperty('WEBAPP_URL') || '';
  return '<div style="font-family:\'Noto Sans KR\',\'Malgun Gothic\',\'Apple SD Gothic Neo\',sans-serif;max-width:600px;margin:0 auto;color:#17242c">' +
    '<div style="border:1px solid #e3e8e6;border-top:4px solid ' + accent + ';padding:22px 24px;background:#fff">' +
    '<div style="font-size:13px;color:#7b8a92">' + esc_(s.libraryName) + '</div><h2 style="margin:6px 0 16px;font-size:20px">' + title + '</h2>' + body +
    '<p style="margin-top:24px;font-size:12px;color:#7b8a92;line-height:1.7">📍 ' + esc_(s.location) + '<br>문의: ' + esc_(s.managerName) + (s.managerPhone ? ' · ' + esc_(s.managerPhone) : '') +
    (url ? '<br><a href="' + url + '" style="color:' + accent + ';font-weight:bold">오스템문고 바로가기 (사번으로 내 대출 확인)</a>' : '') + '</p></div></div>';
}
function table_html_(rows, cols) {
  var th = cols.map(function (c) { return '<th style="text-align:left;padding:8px;border-bottom:1px solid #e3e8e6;font-size:12px;color:#7b8a92">' + c[0] + '</th>'; }).join('');
  var tr = rows.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td style="padding:8px;border-bottom:1px solid #f1f3f2;font-size:14px">' + c[1](r) + '</td>'; }).join('') + '</tr>'; }).join('');
  return '<table style="width:100%;border-collapse:collapse"><tr>' + th + '</tr>' + tr + '</table>';
}
function bookCell_(l) { return '<b>' + esc_(l.bookTitle) + '</b> <span style="color:#7b8a92">(' + esc_(l.bookCode) + ')</span>'; }

function sendMail_(o) {
  var s = settings_();
  var to = [].concat(o.to || []).filter(Boolean), cc = [].concat(o.cc || []).filter(Boolean);
  var entry = { at: nowIso_(), type: o.type, to: to, cc: cc, subject: o.subject, status: 'sent', error: '', keys: o.keys || [], html: o.html };
  if (!to.length) { entry.status = '수신자없음'; entry.error = '사원명부에 이메일이 없습니다'; }
  else if (!s.mail.enabled) { entry.status = '발송꺼짐'; }
  else {
    try {
      MailApp.sendEmail({ to: to.join(','), cc: cc.join(','), subject: o.subject, htmlBody: o.html, name: s.libraryName, replyTo: s.managerEmail || undefined });
      entry.status = '발송';
    } catch (e) { entry.status = '실패'; entry.error = String(e.message || e); }
  }
  appendLog_(entry);
  return entry;
}

function notify_(kind, loans, extra) {
  var s = settings_(); var l = loans[0];
  try {
    if (kind === 'applied') {
      sendMail_({ type: '신청확인', to: emailOf_(l), subject: '[' + s.libraryName + '] 대출 신청 완료 – ' + l.bookTitle,
        html: layout_('대출 신청이 접수되었습니다', '<p>' + esc_(l.name) + '님, 아래 도서의 대출 신청이 완료되었습니다.</p>' +
          table_html_([l], [['도서', bookCell_], ['수령', function (x) { return pretty_(x.pickupDate) + ' 14:00~18:00'; }], ['반납예정일', function (x) { return '<b>' + pretty_(x.dueDate) + '</b>'; }]]) +
          '<p style="font-size:14px;line-height:1.8">· ' + esc_(s.location) + ' <b>대출도서 칸</b>에서 직접 수령해 주세요.<br>· 반납할 때는 <b>반납도서 칸</b>에 넣고, 사이트 \'내 대출\'에서 [반납했어요]를 눌러주세요.<br>· 분실 시 실물로 변상합니다.</p>') });
    } else if (kind === 'extended') {
      sendMail_({ type: '연장완료', to: emailOf_(l), subject: '[' + s.libraryName + '] 대출 연장 완료 – ' + l.bookTitle,
        html: layout_('대출 기간이 연장되었습니다', '<p>' + esc_(l.name) + '님, 연장이 완료되었습니다.</p>' + table_html_([l], [['도서', bookCell_], ['새 반납예정일', function (x) { return '<b>' + pretty_(x.dueDate) + '</b>'; }]])) });
    } else if (kind === 'extensionRejected') {
      sendMail_({ type: '연장거절', to: emailOf_(l), subject: '[' + s.libraryName + '] 대출 연장 불가 안내 – ' + l.bookTitle,
        html: layout_('대출 연장이 어렵습니다', '<p>' + esc_(l.name) + '님, 아래 도서는 연장이 어려워 기존 반납예정일까지 반납 부탁드립니다.</p>' + table_html_([l], [['도서', bookCell_], ['반납예정일', function (x) { return '<b>' + pretty_(x.dueDate) + '</b>'; }]]), '#a8660f') });
    } else if (kind === 'reservationReady') {
      var r = extra.reservation;
      var e = empMap_()[normEmp_(r.empNo)];
      sendMail_({ type: '예약도서', to: (e && e.email) || r.email, subject: '[' + s.libraryName + '] 예약 도서 대출 가능 – ' + r.title,
        html: layout_('예약하신 도서를 대출할 수 있습니다', '<p>' + esc_(r.name) + '님, 예약하신 <b>「' + esc_(r.title) + '」</b>이(가) 반납되었습니다.</p><p>사이트에서 대출 신청해 주세요. 1순위 예약자에게 우선권이 있습니다.</p>') });
    }
  } catch (err) { console.error(err); }
}

// 오늘 보낼 리마인더 계산 (이미 보낸 안내는 다시 보내지 않음)
function planReminders_() {
  var s = settings_(), t = today_();
  var sent = {}, lastOver = {};
  columns_('mailLog', ['type', 'status', 'keys']).forEach(function (m) {
    if (m.type !== '반납안내' || (m.status !== '발송')) return;
    (m.keys || []).forEach(function (k) {
      sent[k] = 1;
      var p = k.split('|');
      if (p[1] === 'overdue' && (!lastOver[p[0]] || p[2] > lastOver[p[0]])) lastOver[p[0]] = p[2];
    });
  });
  var th = s.mail.dueSoonDays.map(Number).sort(function (a, b) { return a - b; });
  var byUser = {}, noEmail = [];
  rows_('loans').forEach(function (raw) {
    if (raw.status !== 'active') return;
    var l = loanView_(raw), item = null;
    if (l.overdue) {
      var last = lastOver[l.id];
      if (!last || diffDays_(t, last) >= s.mail.overdueRepeatDays) item = { kind: 'overdue', keys: [l.id + '|overdue|' + t] };
    } else {
      var d = th.filter(function (x) { return l.dday <= x && l.dday >= 0; })[0];
      if (d !== undefined && !sent[l.id + '|due' + d + '|' + l.dueDate]) item = { kind: 'dueSoon', keys: th.filter(function (x) { return x >= d; }).map(function (x) { return l.id + '|due' + x + '|' + l.dueDate; }) };
    }
    if (!item) return;
    var mail = emailOf_(raw);
    if (!mail) { noEmail.push(l); return; }
    var u = byUser[mail] = byUser[mail] || { email: mail, name: l.name, overdue: [], dueSoon: [], keys: [] };
    u[item.kind].push(l); u.keys = u.keys.concat(item.keys);
  });
  return { users: Object.keys(byUser).map(function (k) { return byUser[k]; }), noEmail: noEmail };
}

function runReminders_(force, dryRun) {
  var s = settings_(), t = today_();
  if (!force && !isBizDay_(t, s.holidays)) return { skipped: '휴무일' };
  var plan = planReminders_();
  if (dryRun) return {
    plan: plan.users.map(function (u) { return { name: u.name, email: maskEmail_(u.email), overdue: u.overdue.map(function (l) { return l.bookTitle; }), dueSoon: u.dueSoon.map(function (l) { return l.bookTitle + ' (' + (l.dday === 0 ? '오늘' : 'D-' + l.dday) + ')'; }) }; }),
    noEmail: plan.noEmail.map(function (l) { return l.name + ' · ' + l.bookTitle; }),
  };
  var sent = 0;
  plan.users.forEach(function (u) {
    var over = u.overdue.length > 0, parts = '';
    if (over) parts += '<p style="color:#b8322a"><b>반납예정일이 지난 도서</b>가 있습니다. 반납도서 칸에 반납 후 사이트에서 [반납했어요]를 눌러주세요.</p>' +
      table_html_(u.overdue, [['도서', bookCell_], ['반납예정일', function (x) { return pretty_(x.dueDate); }], ['연체', function (x) { return '<b style="color:#b8322a">' + x.overdueDays + '일</b>'; }]]);
    if (u.dueSoon.length) parts += '<p style="margin-top:16px"><b>반납예정일이 다가온 도서</b>입니다. 더 읽으셔야 하면 사이트에서 ' + s.extendDays + '일 연장을 신청할 수 있습니다.</p>' +
      table_html_(u.dueSoon, [['도서', bookCell_], ['반납예정일', function (x) { return '<b>' + pretty_(x.dueDate) + '</b>'; }], ['남은 기간', function (x) { return x.dday === 0 ? '<b>오늘</b>' : 'D-' + x.dday; }]]);
    var subject = over ? '[' + s.libraryName + '] 연체 도서 반납 요청 (' + u.overdue.length + '권)'
      : '[' + s.libraryName + '] 반납예정일 안내 – ' + u.dueSoon[0].bookTitle + (u.dueSoon.length > 1 ? ' 외 ' + (u.dueSoon.length - 1) + '권' : '');
    var e = sendMail_({ type: '반납안내', to: u.email, cc: over && s.mail.ccAdminOnOverdue && s.managerEmail ? [s.managerEmail] : [], subject: subject, keys: u.keys,
      html: layout_(over ? '연체 도서 반납 요청' : '반납예정일 안내', '<p>' + esc_(u.name) + '님, 안녕하세요.</p>' + parts, over ? '#b8322a' : '#0f5e52') });
    if (e.status === '발송') sent++;
  });
  // 주간 요약: 이번 주 첫 영업일
  var first = isBizDay_(t, s.holidays);
  var w = dow_(t);
  for (var i = 1; i < (w === 0 ? 7 : w) && first; i++) if (isBizDay_(addDays_(t, -i), s.holidays)) first = false;
  if (s.mail.adminDigest && s.managerEmail && (first || force) && meta_('lastDigest') !== t) {
    var d = dashboard_();
    sendMail_({ type: '관리자요약', to: s.managerEmail, subject: '[' + s.libraryName + '] 대출 현황 요약 (' + t + ')',
      html: layout_('관리자 대출 현황 요약', '<p>대출 중 <b>' + d.counts.open + '</b>건 · 연체 <b style="color:#b8322a">' + d.counts.overdue + '</b>건 · 반납확인 대기 <b>' + d.counts.returning + '</b>건 · 연장승인 대기 <b>' + d.counts.extensionPending + '</b>건 · 이메일 없음 <b>' + d.counts.noEmail + '</b>건</p>' +
        (d.overdue.length ? '<h3 style="font-size:15px">연체자</h3>' + table_html_(d.overdue, [['성명', function (x) { return esc_(x.name) + ' <span style="color:#7b8a92">' + esc_(x.team) + '</span>'; }], ['도서', bookCell_], ['연체', function (x) { return x.overdueDays + '일'; }]]) : '')) });
    meta_('lastDigest', t);
  }
  meta_('lastMailRun', nowIso_());
  return { sent: sent, noEmail: plan.noEmail.length };
}

function appendLog_(entry) {
  var def = TABLES.mailLog;
  var sh = db_().getSheetByName(def.sheet);
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = header.map(function (h) { var c = def.cols.filter(function (x) { return x[1] === h; })[0]; return c ? cellIn_(c[0], entry[c[0]]) : ''; });
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}
