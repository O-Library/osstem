#!/usr/bin/env python3
"""[반영!] 처리: 원본 시트에서 받은 도서목록·대출현황 JSON으로 데모 데이터 갱신 → 빌드 → 테스트 → 배포.
사용: python3 refresh.py <도서목록.json> <대출현황.json> [기준일 YYYY-MM-DD]
"""
import json, re, subprocess, sys, datetime
books_f, loans_f = sys.argv[1], sys.argv[2]
day = sys.argv[3] if len(sys.argv) > 3 else datetime.date.today().isoformat()
nb = json.load(open(books_f))['values']; nl = json.load(open(loans_f))['values']
oldp = '/home/claude/osstem-mockup/old.json'
old = json.load(open(oldp))

def mask(n):  # 장유영 외 이름은 가운데를 가림
    m = re.match(r'^(\s*)([가-힣ㄱ-ㅎㅏ-ㅣ]{2,4})(\(.*\))?(\s*)$', n)
    if not m or m.group(2) == '장유영': return n
    b = m.group(2); mb = b[0] + '*' if len(b) == 2 else b[0] + '*' * (len(b) - 2) + b[-1]
    return m.group(1) + mb + (m.group(3) or '') + m.group(4)

loans = []
for r in nl:
    r = list(r)
    if r and str(r[0]).isdigit():
        for i in (4, 8):
            if i < len(r): r[i] = mask(r[i])
        # 미반납('*') 줄의 반납확인일은 시트 수식(오늘+1)이라 비움
        if len(r) > 7 and r[7] >= day and (len(r) < 9 or not r[8].strip() or r[8].strip().startswith('*')): r[7] = ''
        while len(r) > 1 and r[-1] == '': r.pop()
    loans.append(r)
oc = {r[5] for r in old['books'] if len(r) > 5 and r[5]}; nc = {r[5]: r for r in nb if len(r) > 5 and r[5]}
newbooks = [(k, nc[k][6] if len(nc[k]) > 6 else '') for k in nc if k not in oc]
on = {r[0] for r in old['loans'] if r and str(r[0]).isdigit()}
newloans = [r for r in loans if r and str(r[0]).isdigit() and r[0] not in on and len(r) > 2 and r[1]]
changed = sum(1 for a, b in zip(old['loans'], loans) if a != b) - len(newloans)
json.dump({'books': nb, 'loans': loans}, open(oldp, 'w'), ensure_ascii=False)

def sh(c): print('$', c); subprocess.run(c, shell=True, check=True)
mb = open('/home/claude/osstem-mockup/mock-browser.js').read()
v = int(re.search(r"osstem-demo-v(\d+)", mb).group(1))
open('/home/claude/osstem-mockup/mock-browser.js', 'w').write(mb.replace(f'osstem-demo-v{v}', f'osstem-demo-v{v+1}'))
sr = '/home/claude/osstem-mockup/seed-real.js'; s = open(sr).read()
open(sr, 'w').write(re.sub(r'시트 원본\(\d{4}-\d{2}-\d{2}\)', f'시트 원본({day})', s))
sh('bash /home/claude/rebuild.sh | tail -1')
sh('cd /home/claude/osstem-gas-test && node test.js | tail -1 && node test_new.js | grep -c PASSED')
sh('cp /home/claude/osstem-deploy/Code.gs /home/claude/osstem-server/app/Code.gs && cp /home/claude/osstem/src/Index.html /home/claude/osstem-server/src/Index.html && cd /home/claude/osstem-server && node tools/build-pages.js > /dev/null')
sh("cd /home/claude && rm -f osstem-library-server.zip && zip -qr osstem-library-server.zip osstem-server -x 'osstem-server/node_modules/*' 'osstem-server/data/*'")
msg = f"[반영] {day} 원본 시트 기준 데이터 갱신\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01QppbGXxUWde3bhGozUET5g"
open('/tmp/refresh-msg.txt', 'w').write(msg)
sh("cp /home/claude/osstem-gas/*.gs /home/claude/osstem-gas/Index.html /home/claude/osstem/workspace/osstem-gas/ && cp /home/claude/osstem-mockup/{build-demo.py,mock-browser.js,seed-real.js,old.json} /home/claude/osstem/workspace/osstem-mockup/ && cp /home/claude/rebuild.sh /home/claude/refresh.py /home/claude/osstem/workspace/")
sh("cd /home/claude/osstem && git add -A && (git diff --cached --quiet || git commit -qF /tmp/refresh-msg.txt) && git push -q origin HEAD 2>&1 | grep -iv 'moved\\|location\\|O-Library/osstem.git' || true")
print(json.dumps({'day': day, 'books': len(nc), 'newBooks': newbooks, 'newLoans': [(r[0], r[2], r[5] if len(r) > 5 else '') for r in newloans], 'changedLoans': changed}, ensure_ascii=False))
