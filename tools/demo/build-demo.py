import json, re, os
M='/home/claude/osstem-mockup'
books=open(f'{M}/books.json').read(); loans=open(f'{M}/loans.json').read()
code=open('/home/claude/osstem-deploy/Code.gs').read()
bundle='\n'.join([
  '// 오스템문고 데모 번들: 서버(Apps Script) 코드를 브라우저 안에서 실행합니다.',
  f'window.__BOOKS = {books};', f'window.__LOANS = {loans};',
  open(f'{M}/mock-browser.js').read(), code, open(f'{M}/seed-real.js').read(), open(f'{M}/demo-ui.js').read()])
open('/home/claude/osstem-web/docs/demo.js','w').write(bundle)
# 아티팩트 단일 페이지
src=open('/home/claude/osstem-gas/Index.html').read()
style=re.search(r'<style>([\s\S]*?)</style>', src).group(1)
body=re.search(r'<body>([\s\S]*?)</body>', src).group(1)
i=body.index('<script>'); markup, scripts = body[:i], body[i:].replace('<?!= boot ?>','{}')
pre='''<script>(function(){var h=location.hash||'';window.APP_MODE=(h.indexOf('#admin')===0||h.indexOf('#/admin')===0)?'admin':'user';window.__SINGLE_PAGE=true;window.USER_URL='#';window.confirm=function(){return true;};})();</script>'''
after='''<script>(function(){var a=document.querySelector('#topnav a[target]');if(a){a.removeAttribute('target');a.onclick=function(e){e.preventDefault();location.hash='#user';location.reload();};}})();</script>'''
out=f'''<title>오스템문고 AI 도서 포털</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>{style}
:root {{ color-scheme: light; }}
</style>
{markup}
{pre}
<script>{bundle}</script>
{scripts}
{after}
'''
open(f'{M}/index.html','w').write(out)
print('demo.js', len(bundle), 'artifact', len(out))
