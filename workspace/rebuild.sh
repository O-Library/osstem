#!/bin/bash
# Index.html/서버 코드를 고친 뒤 모든 결과물을 다시 만든다
set -e
cd /home/claude/osstem-gas && python3 - <<'PY'
order=['Util.gs','Db.gs','Categories.gs','Classifier.gs','Lookup.gs','Service.gs','Mail.gs','Setup.gs','Recommend.gs','Requests.gs','Insights.gs','Code.gs']
code=open('Code.gs').read()
head="// 최초 1회 실행: 상단 [▷ 실행] (setup 선택) \nfunction setup() { return setupImpl_(); }\n"
body=code.replace("// 최초 1회 실행: 상단 [▷ 실행] (setup 선택)\nfunction setup() { return setupImpl_(); }\n","",1)
open('/home/claude/osstem-deploy/Code.gs','w').write(head+''.join("\n// ===== %s =====\n%s"%(f, body if f=='Code.gs' else open(f).read()) for f in order))
PY
cp Index.html /home/claude/osstem-deploy/Index.html
cd /home/claude/osstem && cp ../osstem-gas/Index.html src/Index.html && cp ../osstem-mockup/{mock-browser.js,seed-real.js,build-demo.py} tools/demo/ && node tools/build.js && python3 ../osstem-mockup/build-demo.py
python3 - <<'PY'
import re
demo=open('/home/claude/osstem/docs/demo.js').read()
for mode,name in [('user','osstem-library-user.html'),('admin','osstem-library-admin.html')]:
    src=open(f"/home/claude/osstem/docs/{'index' if mode=='user' else 'admin'}.html").read()
    a=src.index('<script src="config.js'); b=src.index('</script>',a)+9
    src=src[:a]+"<script>window.API_MODE='demo';window.USER_URL='osstem-library-user.html';</script>"+src[b:]
    a=src.index("<script>if (window.API_MODE === 'demo')"); b=src.index('</script>',src.index('document.write',a)+40)+9
    src=src[:a]+'<script>'+demo+'</script>'+src[b:]
    assert 'demo.js?v' not in src and 'config.js?v' not in src
    open('/home/claude/osstem-deploy/'+name,'w').write(src)
PY
node -e "new Function(require('fs').readFileSync('/home/claude/osstem-deploy/Code.gs','utf8'));const s=require('fs').readFileSync('/home/claude/osstem-gas/Index.html','utf8');const re=/<script>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(s)))new Function(m[1].replace('<?!= boot ?>','{}'));console.log('syntax ok')"
