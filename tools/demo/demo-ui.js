// 데모 안내 띠 + 화면 전환 + 초기화
(function () {
  var admin = window.APP_MODE === 'admin';
  var css = document.createElement('style');
  css.textContent = '.mockbar{background:#2b2118;color:#fff3ea;font-size:13px}.mockbar-in{max-width:1240px;margin:0 auto;padding:8px 20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.mockbar b{color:#ffb08a;letter-spacing:.04em}.mockbar .sw{margin-left:auto;display:inline-flex;gap:2px;background:rgba(255,255,255,.1);border-radius:8px;padding:2px}.mockbar .sw button{border:0;background:none;color:#fff3ea;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:13px}.mockbar .sw button.on{background:#d9480f;color:#fff;font-weight:700}@media (max-width:600px){.mockbar-in{padding:8px 16px}.mockbar .sw{margin-left:0}}';
  document.head.appendChild(css);
  var bar = document.createElement('div');
  bar.className = 'mockbar';
  bar.innerHTML = '<div class="mockbar-in"><b>DEMO</b><span>' + (admin ? '관리자 비밀번호 demo1234 · 실제 장서·대출 현황(10/27 기준), 다른 이용자 이름은 가명' : '내 사번 29011301 · 실제 장서·대출 현황(10/27 기준), 다른 이용자 이름은 가명') + '</span>'
    + '<div class="sw"><button type="button" data-go="user" class="' + (admin ? '' : 'on') + '">사용자 페이지</button><button type="button" data-go="admin" class="' + (admin ? 'on' : '') + '">관리자 페이지</button><button type="button" data-go="reset" title="데모 데이터를 처음 상태로">초기화</button></div></div>';
  document.body.insertBefore(bar, document.body.firstChild);
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]'); if (!b) return;
    var go = b.getAttribute('data-go');
    if (go === 'reset') return window.__demoReset();
    if (window.__SINGLE_PAGE) { location.hash = go === 'admin' ? '#admin' : '#user'; location.reload(); }
    else location.href = go === 'admin' ? 'admin.html' : './';
  });
})();
