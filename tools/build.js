// Apps Script 화면(Index.html) 하나를 원본으로 GitHub Pages용 사용자/관리자 페이지를 만든다.
//   node tools/build.js <Index.html 경로>
const fs = require('fs');
const path = require('path');
const src = process.argv[2] || path.join(__dirname, '..', 'src', 'Index.html');
const html = fs.readFileSync(src, 'utf8');
if (!html.includes('<?!= boot ?>')) throw new Error('Index.html 형식이 예상과 다릅니다');
const page = (mode, title) => html
  .replace('<?!= boot ?>', '{}')
  .replace('<script>var BOOT', `<script src="config.js"></script>\n  <script>window.APP_MODE = '${mode}';</script>\n  <script>if (window.API_MODE === 'demo') document.write('<script src="demo.js"><\\/script>');</script>\n  <script>var BOOT`)
  .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <title>${title}</title>\n  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23d9480f'/%3E%3Cpath d='M8 9h7a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H8zM24 9h-5a3 3 0 0 0-1 .2V24a3 3 0 0 1 2-1h4z' fill='%23fff'/%3E%3C/svg%3E">${mode === 'admin' ? '\n  <meta name="robots" content="noindex">' : ''}`);
const out = path.join(__dirname, '..', 'docs');
fs.writeFileSync(path.join(out, 'index.html'), page('user', '오스템문고'));
fs.writeFileSync(path.join(out, 'admin.html'), page('admin', '오스템문고 관리자'));
console.log('built docs/index.html, docs/admin.html');
