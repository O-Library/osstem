// 화면이 데이터를 가져오는 방식
//  'demo' : 실제 장서·대출 현황 스냅샷으로 브라우저 안에서 동작 (해커톤 시연용, 다른 이용자 이름은 가명)
//  'live' : Google Apps Script 웹앱에 연결 → 「오스템문고 시스템 DB」 구글 시트를 실시간으로 읽고 씀
window.API_MODE = 'demo';
window.API_URL = 'https://script.google.com/macros/s/AKfycbwdZ1hoMsrqEptxTEKCVc_WQpG_lygn06ID7i3cjWMFXvTEWMaqT4zTHHXQBCe5GSQKNg/exec';
window.USER_URL = './';
