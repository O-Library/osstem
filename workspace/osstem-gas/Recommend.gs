// ─────────────────────────────────────────────────────
// 상황·직무 기반 도서 추천 (개인정보 없음: 사번·이름·교육이력을 받지 않음)
//  입력: 직무 그룹(8개 중 1) + 고민 상황(선택/자유입력) + 관심 키워드
//  출력: 보유 도서 3권 + 추천 이유 + 대출 가능 여부 (대출 중이면 대체 도서)
//  기록: 개인을 알 수 없는 키워드만 '검색기록' 탭에 남겨 운영자 인사이트에 사용
// ─────────────────────────────────────────────────────
var JOB_GROUPS = [
  // 2026 전사 AI 해커톤 업무 그룹 8개 기준
  { id: 'dsales', name: '국내 영업', desc: '국내 영업·영업기획, 온라인몰, 인테리어', kw: ['영업', '세일즈', '협상', '설득', '고객', '화술', '대화', '관계'], cats: ['101', '224', '217', '113', '211'] },
  { id: 'gsales', name: '해외 영업', desc: '해외법인 운영, 해외영업', kw: ['해외', '글로벌', '영어', '협상', '세계', '문화', '영업', '비즈니스'], cats: ['120', '111', '501', '224', '305'] },
  { id: 'cs', name: '고객 서비스', desc: '장비 서비스, 고객상담', kw: ['고객', '서비스', '상담', '응대', '감정', '말투', '불만', '커뮤니케이션'], cats: ['106', '101', '211', '217', '404'] },
  { id: 'mkt', name: '마케팅·홍보', desc: '마케팅, 제품 PM, 학술, 홍보, 디자인', kw: ['마케팅', '브랜드', '브랜딩', '트렌드', '소비', '카피', '콘텐츠', '디자인'], cats: ['114', '140', '113', '133', '216'] },
  { id: 'rnd', name: 'R&D', desc: '연구개발, R&D기획, 인허가, 시험평가', kw: ['연구', '과학', '의료', '치과', '임상', '기술', '혁신', '데이터'], cats: ['1302', '1301', '801', '802', '104'] },
  { id: 'prod', name: '생산', desc: '생산, 품질', kw: ['생산', '품질', '공정', '개선', '문제해결', '현장', '원가', '혁신'], cats: ['119', '104', '219', '127'] },
  { id: 'scm', name: '구매·물류', desc: '구매, 시설, 물류, SCM', kw: ['구매', '물류', 'scm', '협상', '원가', '공급', '재고', '유통'], cats: ['138', '113', '224', '119'] },
  { id: 'support', name: '경영지원·IT', desc: 'IT, 인사, 경영기획, ESG, 재무, 감사, 법무', kw: ['인사', '회계', '재무', '기획', 'it', 'ai', '데이터', '조직', '법률', '전략'], cats: ['108', '131', '132', '135', '103', '1109', '1111', '1007'] },
];

// trig: 이 말이 있으면 그 고민으로 봄 / weak: 다른 고민이 하나도 안 잡힐 때만 봄 (예: '상사', '힘들어요')
var SITUATIONS = [
  { id: 'newbie', label: '신입이라 회사생활이 낯설어요', trig: ['신입', '사회초년생', '초년생', '입사', '막내', '회사생활', '직장생활', '인턴', '첫직장', '일잘러', '일잘하'], kw: ['회사생활', '직장생활', '직장인', '신입', '사회초년생', '처세', '태도', '매너', '센스', '일하는'], cats: ['203', '206', '220', '227', '212'] },
  { id: 'leader', label: '첫 팀장이 됐어요', trig: ['팀장', '리더', '관리자', '파트장', '매니저', '승진', '부하직원', '위임', '팀을이끌'], kw: ['리더', '리더십', '팀장', '코칭', '조직', '위임', '맡기', '피드백', '관리'], cats: ['102', '109', '202', '221'] },
  { id: 'coach', label: '후배를 잘 가르치고 싶어요', trig: ['후배', '가르치', '가르쳐', '코칭', '육성', '온보딩', '사수', '멘토', '피드백'], kw: ['코칭', '피드백', '가르치', '성장', '질문', '리더', '육성', '멘토'], cats: ['202', '221', '102', '109'] },
  { id: 'report', label: '보고·보고서를 잘하고 싶어요', trig: ['보고하', '보고를', '보고가', '보고할', '보고드', '보고서', '중간보고', '문서', '글쓰기', '기획서', '작성', '문장', '결재', '요약', '두괄식'], kw: ['보고', '보고서', '글쓰기', '문장', '설명', '기획', '문서', '논리', '요약', '두괄식', '파워포인트'], cats: ['223', '218', '209', '203', '408', '1103'] },
  { id: 'speak', label: '말하기·발표가 어려워요', trig: ['발표', '말하기', '말을', '말이', '말솜씨', '설명', '프레젠테이션', '피티', '스피치', '말투', '화술', '전달', '앞에서'], kw: ['말하기', '발표', '프레젠테이션', '화술', '대화', '말투', '설명', '전달'], cats: ['217', '207', '211'] },
  { id: 'people', label: '동료·상사와 관계가 힘들어요', trig: ['관계', '갈등', '인간관계', '무례', '눈치', '사이가', '사이도', '싫어하', '싫은사람', '싫은동료', '싫은상사', '미워', '미운', '얄미', '꼴보기', '괴롭', '뒷담', '서운', '따돌', '불편한사람'], weak: ['상사', '동료', '선배', '사람'], kw: ['관계', '대인', '갈등', '감정', '심리', '말투', '무례', '대화', '불편한'], cats: ['210', '404', '211'] },
  { id: 'hr', label: '인사·조직 이슈가 궁금해요', trig: ['인사', 'hr', '채용', '면접', '평가제도', '인사평가', '성과평가', '보상', '연봉', '성과관리', '조직문화', '기업문화', '노무', '근로', '이직률', '퇴사율', '인재', '직무분석', '교육담당', '몰입', '리텐션'], kw: ['인사', '채용', '평가', '보상', '조직문화', '인재', '성과', '동기', '조직', '역량', '직무'], cats: ['108', '135', '109', '117', '1008'] },
  { id: 'sales', label: '영업·고객 만나는 게 힘들어요', trig: ['영업', '거래처', '고객사', '세일즈', '협상', '설득', '계약', '실적', '미팅', '사람대하', '사람상대', '사람만나', '대인'], kw: ['대화', '말투', '설득', '호감', '관계', '서비스', '고객'], cats: ['217', '211', '101', '106', '210'] },
  { id: 'cs', label: '고객 응대가 어려워요', trig: ['고객', '컴플레인', '클레임', '불만', '진상', '응대', '민원', '화를내', '항의'], kw: ['고객', '서비스', '응대', '불만', '감정', '설득', '대화'], cats: ['106', '101', '211', '217'] },
  { id: 'rest', label: '지치고 번아웃이 왔어요', trig: ['번아웃', '지쳐', '지침', '지쳤', '피곤', '우울', '불안', '스트레스', '무기력', '의욕', '잠이안', '불면', '가기싫', '출근하기싫', '하기싫', '퇴사'], weak: ['힘들', '힘든', '버거'], kw: ['번아웃', '마음', '회복', '위로', '쉼', '피곤', '불안', '휴식'], cats: ['404', '701', '222'] },
  { id: 'time', label: '시간 관리·습관을 잡고 싶어요', trig: ['시간관리', '시간', '일정', '미루', '루틴', '습관', '집중', '계획', '바빠', '바쁜'], kw: ['시간', '습관', '루틴', '집중', '계획', '자기관리', '성과'], cats: ['212', '205', '220', '227'] },
  { id: 'health', label: '건강·운동을 챙기고 싶어요', trig: ['건강', '운동', '다이어트', '살빼', '체중', '식단', '수면', '잠을', '허리', '거북목', '스트레칭', '헬스', '요가', '걷기'], kw: ['건강', '운동', '몸', '습관', '식단', '수면', '다이어트'], cats: ['1201', '205'] },
  { id: 'ai', label: 'AI를 업무에 쓰고 싶어요', trig: ['ai', '인공지능', '챗gpt', '지피티', 'gpt', '제미나이', '클로드', '자동화', '프롬프트', '코파일럿'], kw: ['ai', '인공지능', '챗gpt', '제미나이', '클로드', '자동화', '프롬프트'], cats: ['1111', '1104', '1109'] },
  { id: 'data', label: '숫자·데이터에 강해지고 싶어요', trig: ['숫자', '데이터', '통계', '회계', '재무제표', '엑셀', '분석'], kw: ['데이터', '숫자', '통계', '회계', '재무제표', '엑셀', '분석'], cats: ['132', '139', '1105', '1106'] },
  { id: 'think', label: '생각 정리·문제 해결을 잘하고 싶어요', trig: ['생각', '정리', '문제해결', '논리', '사고', '아이디어', '창의'], kw: ['생각', '정리', '문제해결', '사고', '전략', '아이디어', '논리'], cats: ['219', '218', '216'] },
  { id: 'trend', label: '트렌드·시야를 넓히고 싶어요', modifier: true, trig: ['트렌드', '미래', '시야', '교양', '흐름', '변화', '유행', '요즘사람', '소비', '좋아하는지', 'mz', '이슈', '화두', '최신'], kw: ['트렌드', '미래', '경제', '세계', '교양', '변화', '소비', '브랜드'], cats: ['112', '136', '401', '114'] },
  { id: 'money', label: '재테크·경제 공부를 하고 싶어요', trig: ['재테크', '투자', '주식', '돈', '부자', '금융', '경제', '연금', '저축'], kw: ['재테크', '돈', '투자', '부', '경제', '금융', '주식'], cats: ['137', '123', '136'] },
  { id: 'lang', label: '외국어 공부를 하고 싶어요', trig: ['영어', '중국어', '일본어', '외국어', '회화', '토익', '오픽'], kw: ['영어', '중국어', '일본어', '회화', '비즈니스'], cats: ['501', '502', '503'] },
  { id: 'read', label: '가볍게 읽을 책을 찾아요', trig: ['소설', '에세이', '시집', '가볍게', '재밌는', '재미있는', '힐링', '쉬어가', '머리식'], kw: ['소설', '에세이', '이야기'], cats: ['601', '602', '603', '604', '605', '607', '701', '702'] },
];

var STOPWORDS = ['싶어요', '쓰고', '읽고', '하고', '되고', '알고', '배우고', '싶다', '싶은', '어떻게', '방법', '요즘', '너무', '정말', '추천', '관련', '대한', '있는', '하는', '되고', '됐어요', '되었어요', '했어요', '해요', '합니다', '같아요', '고민', '책', '도서', '읽고', '공부', '잘하고', '잘', '좀', '더', '많이', '처음', '새로', '제가', '저는', '우리', '그리고', '그런데', '이번', '이번에', '이제', '지금', '계속', '자꾸', '항상', '것', '게', '때', '때문', '같은', '다른', '해야', '할지', '가기', '하기', '어떻게', '모르겠어요', '싶은데', '너무너무', '진짜', '그냥', '아무것', '추천해', '주세요', '있어서', '많아서', '하는', '대응', '보고', '써', '뭘', '누가', '사이', '잠이', '내면', '싫어', '싫은', '화를', '안좋아요', '못해요', '가장', '궁금', '궁금해요', '이슈', '바꾸고', '알고', '큰', '대하', '만나', '대하는', '만나는', '영업직'];
var ENDINGS = /([가-힣]{2,}요|어야|아야|쳐야|어서|아서|돼요|와요|세요|해야|야지|건지|는지도|는데|어요|아요|여요|해요|워요|려요|에요|예요|네요|고요|지요|죠|습니다|니다|지만|는지|을까|ㄹ까|할까|한데|했는데|겠어요|싶고)$/;
// 고민별로 먼저 권하는 책 (보유 도서 중에서 사람이 고른 목록). 이 책들을 먼저 보여 주고, 모자라면 낱말·분류로 찾은 책으로 채움
var CURATED = {
  newbie: ["눈치껏 못 배웁니다", "사수가 없어도 괜찮습니다", "오피스 문해력", "프로일잘러", "직장생활 정글의 법칙", "회사생활이 힘드냐고 아들러가 물었다", "일의 감각", "보이게 일하라"],
  leader: ["처음 리더가 된 당신에게", "요즘 팀장은 이렇게 일합니다", "리더의 용기", "일을 잘 맡기는 기술", "완벽한 팀", "두려움 없는 조직", "좋은 리더를 넘어 위대한 리더로", "리더 반성문"],
  coach: ["코칭경영의 도", "코칭의정석", "초격차", "일을 잘 맡기는 기술", "가르치기의 결", "리더의 용기"],
  report: ["가장 쉬운 독학 페이퍼로지 보고서 첫걸음", "실무에 바로 쓰는 일잘러의 보고서 작성법", "더 프리젠테이션", "횡설수설하지 않고 정확하게 설명하는 법", "일 잘하는 사람은 단순하게 말합니다", "산으로 가지 않는 정리법", "기획의 정석", "내 문장이 그렇게 이상한가요"],
  speak: ["횡설수설하지 않고 정확하게 설명하는 법", "한석준의 말하기 수업", "생각정리 스피치", "더 프리젠테이션", "어른의 말투", "일 잘하는 사람은 단순하게 말합니다", "말투의 편집"],
  people: ["나는 왜 네 말이 힘들까", "무례한 사람에게 웃으며 대처하는 법", "불편한 사람과 뻔뻔하게 대화하는 법", "사무실의 도른자들", "미움받을 용기", "데일 카네기 인간관계론", "적당히 가까운 사이", "내가 예민한게 아니라 네가 너무한 거야", "그때 이렇게 화냈어야 했는데"],
  sales: ["불편한 사람과 뻔뻔하게 대화하는 법", "끌리는 말투에는 비밀이 있다", "괜히 끌리는 사람들, 호감의 법칙", "대화의 정석", "적을 만들지 않는 대화법", "데일 카네기 인간관계론", "전화는 마케팅이다", "완벽한 서비스는 어떻게 탄생되는가", "어른의 말투"],
  hr: ["2020 HR 메가트렌드", "비즈니스 파트너, HR 애널리틱스", "인재경영, 데이터사이언스를 만나다", "최고의 인재를 찾기 위한 단 하나의 질문", "역량평가 역량면접", "밀레니얼은 어떻게 배우고", "센 세대, 낀 세대", "MZ 익스피리언스", "직무중심 임금관리"],
  cs: ["완벽한 서비스는 어떻게 탄생되는가", "NPS 순추천고객지수", "대화의 정석", "적을 만들지 않는 대화법", "무례한 사람에게 웃으며 대처하는 법", "불편한 사람과 뻔뻔하게 대화하는 법"],
  rest: ["효과 빠른 번아웃 처방전", "나는 도대체 왜 피곤할까", "나를 소모하지 않는 현명한 태도에 관하여", "신영철 박사의 그냥 살자", "하버드 회복탄력성 수업", "기분이 태도가 되지 않게", "우울한 마음도 습관입니다", "하마터면 열심히 살 뻔했다"],
  time: ["아주 작은 습관의 힘", "시간을 찾아드립니다", "생각하는 대로 해내는 시간 연금술사", "미루는 습관 극복하기", "도둑맞은 집중력", "슈퍼모닝", "하루 15분 정리의 힘", "몰입"],
  ai: ["일 잘하는 사람은 이렇게 챗GPT를 씁니다", "된다! 하루 만에 끝내는 챗GPT 활용법", "1400만 직장인을 위한 챗GPT", "챗GPT·퍼플렉시티·클로드", "뚝딱 바로 써먹는 첫 클로드", "된다! 하루 만에 끝내는 제미나이", "비전공자도 이해할 수 있는 AI 지식", "AI 2026 트렌드"],
  data: ["숫자는 거짓말을 한다", "하마터면 회계를 모르고 일할 뻔했다", "만화로 배우는 재무회계", "직장인이여 회계하라", "진짜 쓰는 실무 엑셀", "직장인을 위한 실무 엑셀", "데이터 리터러시", "숫자 감각의 힘"],
  think: ["생각정리스킬", "산으로 가지 않는 정리법", "기획이란 무엇인가", "생각정리 기획력", "스마트한 생각들", "관점을 디자인하라"],
  trend: ["트렌드 코리아 2026", "머니 트렌드 2026", "라이프 트렌드 2026", "시대예보", "AI 2026 트렌드"],
  money: ["부자 아빠 가난한 아빠", "돈의 속성", "돈의 방정식", "존리의 부자되기 습관", "부의 갈림길", "머니 트렌드 2026"],
  lang: ["비즈니스 영어 실수 고침 사전", "거의 모든 행동 표현의 영어"],
  health: ["느리게 나이 드는 습관", "운동말고 움직임 리셋", "50 이후, 건강을 결정하는 7가지 습관", "건강과 다이어트를 동시에"]
};
// 상황을 설명하는 말일 뿐 책 주제가 아닌 단어 (제목에 있어도 점수를 적게)
var CONTEXT_WORDS = ['상사', '동료', '선배', '후배', '사원', '회사', '직장', '업무', '팀', '팀에', '사람', '사람들', '고객', '요즘', '다시', '앞에서', '말을', '일이', '마음'];
var JOSA = ['에서는', '으로는', '에게서', '에게', '에서', '으로', '이랑', '하고', '까지', '부터', '처럼', '이나', '이고', '하는', '해요', '은', '는', '이', '가', '을', '를', '에', '의', '도', '와', '과', '로', '랑', '만'];

function stripJosa_(w) {
  w = String(w || '').trim().toLowerCase();
  for (var i = 0; i < JOSA.length; i++) { var e = JOSA[i]; if (w.length > e.length + 1 && w.slice(-e.length) === e) return w.slice(0, -e.length); }
  return w;
}
function terms_(text) {
  var out = [];
  String(text || '').replace(/[^0-9a-zA-Z가-힣\s]/g, ' ').split(/\s+/).forEach(function (raw) {
    var t = stripJosa_(raw);
    var st = t.replace(/(했는데|하는데|이라서|해서|하면|인데|이라)$/, ''); // 무례해서→무례, 발표하면→발표, 신입인데→신입
    if (st !== t && st.length >= 2) t = st;
    if (ENDINGS.test(t)) return;
    if (t.length > 2 && t.slice(-1) === '들') t = t.slice(0, -1);
    if (t.length >= 2 && STOPWORDS.indexOf(t) < 0 && out.indexOf(t) < 0) out.push(t);
  });
  return out.slice(0, 12);
}
function situationsFrom_(ids, text) {
  var picked = [], t = normStr_(text).replace(/인사이트|인사말|인사성/g, ''), fromText = [];
  var has = function (w) { return t.indexOf(normStr_(w)) >= 0; };
  SITUATIONS.forEach(function (s) {
    if ((ids || []).indexOf(s.id) >= 0) picked.push(s);
    else if (t && s.trig.some(has)) fromText.push(s);
  });
  // '상사·동료'만 나오고 보고·말하기·신입 같은 다른 고민이 있으면 관계 고민으로 보지 않음
  //   예) "상사에게 보고하는 게 어려워요" → 보고 / "상사가 너무 싫어요" → 관계
  if (t && !picked.length && !fromText.length) {
    var w = SITUATIONS.filter(function (s) { return s.weak && s.weak.some(has); });
    if (w.length) fromText.push(w[0]); // '사람이 너무 힘들어요' → 관계 하나만
  }
  fromText.forEach(function (s) { if (picked.indexOf(s) < 0) picked.push(s); });
  return picked;
}

// 제목·분류·소개글로 검색할 수 있는 책 목록 (책키 단위)
function corpus_() {
  var cat = catalog_();
  var desc = {};
  rows_('books').forEach(function (b) { var k = titleKey_(b); if (!desc[k] && b.description) desc[k] = String(b.description); });
  var kwByCat = {};
  categories_().forEach(function (c) { kwByCat[c.code] = (c.keywords || []).map(normStr_); });
  return cat.items.map(function (t) {
    return { t: t, tw: String(t.title || '').toLowerCase().split(/[^0-9a-z가-힣]+/).filter(String), title: normStr_(t.title), catName: normStr_(t.catName), desc: normStr_(desc[t.key] || '').slice(0, 1500), catKw: kwByCat[t.catCode] || [] };
  });
}

function scoreBook_(d, prof) {
  var s = 0, hits = 0, kwHit = false, why = { title: [], desc: [], cat: null, catFrom: '', popular: false };
  prof.terms.forEach(function (term) {
    var n = normStr_(term); if (n.length < 2) return;
    if (CONTEXT_WORDS.indexOf(n) >= 0) { if (d.title.indexOf(n) >= 0) s += 0.3; return; }
    var mine = prof.userTerms.indexOf(term) >= 0;
    // 직접 적은 두 글자 말은 낱말 첫머리에서만 인정 ('화를'이 '대화를'에 걸리지 않게)
    var inTitle = mine && n.length <= 2 ? d.tw.some(function (w) { return w.indexOf(n) === 0; }) : d.title.indexOf(n) >= 0;
    var isKw = prof.kwTerms.indexOf(term) >= 0;
    var m = mine ? 1.5 : 1, counts = mine || !prof.modKw[n]; // 직접 적은 말은 더 무겁게, 트렌드 같은 꾸밈 고민의 낱말은 근거 수에서 뺌
    if (inTitle) { s += 4 * m; if (counts) hits++; if (isKw) kwHit = true; why.title.push(term); }
    else if (d.catName.indexOf(n) >= 0) { s += 2.5 * m; if (counts) hits++; if (isKw) kwHit = true; why.catFrom = why.catFrom || 'term'; }
    else if (!(mine && n.length <= 2) && d.desc.indexOf(n) >= 0) { s += 1.5 * m; if (counts) hits++; if (isKw) kwHit = true; why.desc.push(term); }
    else if (d.catKw.indexOf(n) >= 0) { s += 1.5; }
  });
  var c = prof.cats[d.t.catCode] || prof.cats[d.t.group];
  if (c) { s += c.w; why.cat = c; }
  // 사람이 고른 책은 목록 순서대로 맨 앞에
  var pick; for (var q = 0; q < prof.curated.length; q++) if (d.title.indexOf(prof.curated[q]) === 0) { pick = q; break; }
  if (pick !== undefined) return { d: d, score: 100 - pick + (d.t.available > 0 ? 0.5 : 0), rel: 99, why: why, curated: true };
  // 업무 고민에 육아·가족 책이나 소설이 끼지 않게 (본인이 그런 말을 쓴 경우는 예외)
  if (!prof.allowFamily && (d.t.group === '1500' || /엄마|아빠|딸에게|딸은|아들|육아|아이를|부모/.test(d.t.title))) return null;
  if (!prof.allowFiction && /^6/.test(String(d.t.group)) && prof.sits.length) return null;
  // 적은 고민을 하나도 못 알아들었으면(예: '배고프다') 직무 분야만으로 아무 책이나 추천하지 않음.
  //   이때는 직접 적은 낱말이 책 제목·소개와 두 개 이상 맞거나, 관심 키워드 칸에 적은 말이 맞을 때만 추천
  if (!prof.sits.length && prof.freeText && !kwHit && hits < 2) return null;
  // 고민이 잡혔는데 그 고민 분야 밖의 책이면, 낱말이 두 개 이상 맞을 때만 추천
  if (prof.sits.length && !(c && c.from === 'sit') && hits < 2) return null;
  var rel = s;
  if (rel <= 0) return null;
  s += Math.min(Number(d.t.loanCount) || 0, 30) * 0.05;
  if (d.t.isNew) s += 0.4;
  var yr = String(d.t.title).match(/20(1\d|2\d)/); if (yr) s += Math.max(0, Number(yr[0]) - 2018) * 0.2; // 『트렌드 코리아』 같은 연도판은 최신판 먼저
  why.popular = (Number(d.t.loanCount) || 0) >= 5;
  return { d: d, score: s, rel: rel, why: why };
}

function profile_(input) {
  var job = JOB_GROUPS.filter(function (j) { return j.id === input.job; })[0] || null;
  var free = String(input.situation || '');
  var sits = situationsFrom_(input.situations, free);
  var userTerms = terms_(input.keywords).concat(terms_(free).filter(function (t) { return terms_(input.keywords).indexOf(t) < 0; }))
    .filter(function (t) { return CONTEXT_WORDS.indexOf(normStr_(t)) < 0; });
  var kwTerms = terms_(input.keywords);
  var terms = userTerms.slice();
  sits.forEach(function (s) { s.kw.forEach(function (k) { if (terms.indexOf(k) < 0) terms.push(k); }); });
  var cats = {};
  if (job) job.cats.forEach(function (code) { cats[code] = { w: 1.5, from: 'job', label: job.name }; });
  var main = sits.filter(function (s) { return !s.modifier; });
  // '트렌드'는 다른 고민과 같이 나오면 그 주제의 최신 흐름이라는 뜻 → 분야는 주제 쪽만 ('인사 이슈' → 인사 분야 + 트렌드 낱말)
  (main.length ? main : sits).forEach(function (s) { s.cats.forEach(function (code) { cats[code] = { w: 3, from: 'sit', label: s.label }; }); });
  if (job && !userTerms.length && !sits.length) job.kw.forEach(function (k) { if (terms.indexOf(k) < 0) terms.push(k); });
  var modKw = {};
  if (main.length) sits.forEach(function (s) { if (s.modifier) s.kw.forEach(function (k) { modKw[normStr_(k)] = 1; }); });
  main.forEach(function (s) { s.kw.forEach(function (k) { delete modKw[normStr_(k)]; }); });
  var curated = [];
  // 고민마다 한 권씩 번갈아 순서를 매김 (보고 + 신입이면 보고 1, 신입 1, 보고 2 …)
  var lists = (main.length ? main : sits).map(function (x) { return (CURATED[x.id] || []).map(function (t) { return normStr_(t); }); });
  for (var k = 0; k < 12; k++) lists.forEach(function (l) { if (l[k] !== undefined && curated.indexOf(l[k]) < 0) curated.push(l[k]); });
  var raw = free + ' ' + String(input.keywords || '');
  return { job: job, sits: sits, userTerms: userTerms, kwTerms: kwTerms, freeText: !!free.trim(), terms: terms, cats: cats, modKw: modKw, curated: curated,
    allowFamily: /엄마|아빠|딸|아들|육아|아이|부모|가족|자녀/.test(raw),
    allowFiction: sits.some(function (x) { return x.id === 'read'; }) || /소설/.test(raw) };
}

function reasonOf_(x, prof) {
  var t = x.d.t, parts = [];
  if (x.why.cat && x.why.cat.from === 'sit') parts.push('‘' + x.why.cat.label + '’ 고민에 맞는 「' + t.catName + '」 분야');
  else if (x.why.cat && x.why.cat.from === 'job') parts.push(x.why.cat.label + ' 직무에서 자주 찾는 「' + t.catName + '」 분야');
  if (x.why.title.length) parts.push('제목에 ' + x.why.title.slice(0, 2).map(function (w) { return '‘' + w + '’'; }).join('·') + ' 포함');
  else if (x.why.desc.length) parts.push('책 소개에 ' + x.why.desc.slice(0, 2).map(function (w) { return '‘' + w + '’'; }).join('·') + ' 언급');
  if (x.why.popular) parts.push('사내에서 ' + t.loanCount + '번 대출된 인기 도서');
  else if (t.isNew) parts.push('최근 들어온 신간');
  if (!parts.length) parts.push('「' + t.catName + '」 분야 도서');
  return parts.slice(0, 3).join(' · ');
}

function bookCard_(x, prof) {
  var t = x.d.t;
  return { key: t.key, title: t.title, author: t.author, publisher: t.publisher, isbn: t.isbn, cover: t.cover, catCode: t.catCode, catName: t.catName,
    available: t.available, copies: t.copies, earliestDue: t.earliestDue, waiting: t.waiting, loanCount: t.loanCount, reason: reasonOf_(x, prof) };
}

function recommend_(input) {
  input = input || {};
  var prof = profile_(input);
  if (!prof.job && !prof.terms.length && !String(input.situation || input.keywords || '').trim()) throw new AppError('직무 그룹이나 고민·관심 키워드를 하나 이상 알려 주세요.');
  // 적은 고민을 하나도 알아듣지 못하면(예: '배고프다') 직무만으로 엉뚱한 책을 내밀지 않고 다시 물어봄
  var freeText = String(input.situation || '').trim();
  if (freeText && !String(input.keywords || '').trim() && !prof.sits.length && !(input.situations || []).length) {
    var mine = prof.userTerms.map(normStr_).filter(function (t) { return t.length >= 2; });
    var anyHit = mine.length && corpus_().some(function (d) { return mine.some(function (t) { return d.tw.some(function (w) { return w.indexOf(t) === 0; }) || d.catName.indexOf(t) >= 0; }); });
    if (!anyHit) {
      logSearch_({ source: 'recommend', job: prof.job ? prof.job.id : '', situations: [], terms: prof.userTerms, hits: 0, topScore: 0 });
      return { cards: [], matched: 0, unknown: true, text: freeText.slice(0, 40), understood: { job: prof.job ? prof.job.name : '', situations: [], keywords: prof.userTerms }, weak: false };
    }
  }
  var ranked = corpus_().map(function (d) { return scoreBook_(d, prof); }).filter(Boolean)
    .filter(function (x) { return x.rel >= 2.5; })
    .sort(function (a, b) { return b.score - a.score; });
  var used = {}, seenSeries = {}, cards = [];
  function seriesKey(t) { return normTitle_(t.title).replace(/[0-9]+(권|부|편)?$/, '').replace(/(상|하|上|下)$/, '').slice(0, 6); }
  function free(y) { return !used[y.d.t.key] && !seenSeries[seriesKey(y.d.t)]; }
  function take(y) { used[y.d.t.key] = 1; seenSeries[seriesKey(y.d.t)] = 1; }
  var skip = Math.max(0, Number(input.page) || 0) * 3; // [다른 책 보기]를 누를 때마다 다음 3권
  for (var i = 0; i < ranked.length && cards.length < 3; i++) {
    var x = ranked[i];
    if (!free(x)) continue;
    if (skip > 0) { skip--; take(x); continue; }
    take(x);
    var card = bookCard_(x, prof);
    if (x.d.t.available <= 0) {
      // 대출 중이면 지금 빌릴 수 있는 대체 도서: 같은 소분류 → 같은 대분류 → 같은 키워드 → 그 다음 관련 도서
      var pool = ranked.filter(function (y) { return free(y) && y.d.t.available > 0; });
      var alt = pool.filter(function (y) { return y.d.t.catCode === x.d.t.catCode; })[0]
        || pool.filter(function (y) { return y.d.t.group === x.d.t.group || y.why.title.some(function (w) { return x.why.title.indexOf(w) >= 0; }); })[0]
        || pool[0];
      if (alt) { take(alt); card.alt = bookCard_(alt, prof); }
    }
    cards.push(card);
  }
  logSearch_({ source: 'recommend', job: prof.job ? prof.job.id : '', situations: prof.sits.map(function (s) { return s.id; }), terms: prof.userTerms, hits: ranked.length, topScore: ranked[0] ? Math.round(ranked[0].rel * 10) / 10 : 0 });
  return {
    cards: cards, matched: ranked.length, page: Number(input.page) || 0, more: ranked.length > (Number(input.page) || 0) * 3 + 6,
    understood: { job: prof.job ? prof.job.name : '', situations: prof.sits.map(function (s) { return s.label; }), keywords: prof.userTerms },
    weak: ranked.length < 3,
    unclear: prof.freeText && !prof.sits.length && !cards.length,
  };
}

// ─── 익명 검색기록 ───────────────────────────────────
function logSearch_(o) {
  try {
    var t = table_('searchLog');
    var row = { at: nowIso_(), source: o.source || 'search', job: o.job || '', situations: (o.situations || []).join(' '), terms: (o.terms || []).join(' '), hits: Number(o.hits) || 0, topScore: o.topScore || '' };
    t.sheet.appendRow(toRow_(t, row));
    t.rows.push(row);
  } catch (e) { console.error('logSearch', e); }
}
function logCatalogSearch_(q, count) {
  var terms = terms_(q).filter(function (t) { return !/^\d+(-\d+)*$/.test(t); });
  if (!terms.length) return { ok: true };
  logSearch_({ source: 'search', terms: terms, hits: Math.max(0, Number(count) || 0) });
  return { ok: true };
}

function recommendOptions_() {
  return { jobs: JOB_GROUPS.map(function (j) { return { id: j.id, name: j.name, desc: j.desc }; }), situations: SITUATIONS.map(function (s) { return { id: s.id, label: s.label }; }) };
}
