// AI 없이 규칙 기반으로 뉴스 보고서 재료를 만든다.
// - 핵심내용: 본문에서 중요한 문장을 골라내는 추출 요약 (빈도 기반 스코어링)
// - 시사점  : 기사 안의 전망/예상 문장을 추출 (없는 내용을 지어내지 않는다)
// - 용어    : 사전에 등록된 경제·경영 용어 매칭
// 외부 라이브러리 없이 node 내장 모듈만 사용한다.

const https = require('https');
const http = require('http');

const REQ_TIMEOUT = 7000;

// ── 용어 사전 ──────────────────────────────────────────────
const GLOSSARY = {
  'ROE': '자기자본이익률. 자기자본 대비 순이익 비율로, 주주 자본을 얼마나 효율적으로 굴렸는지 보여준다.',
  'ROA': '총자산이익률. 총자산 대비 순이익 비율로, 자산 활용 효율을 나타낸다.',
  'PER': '주가수익비율. 주가를 주당순이익으로 나눈 값으로, 이익 대비 주가 수준을 가늠한다.',
  'PBR': '주가순자산비율. 주가를 주당순자산으로 나눈 값으로, 순자산 대비 주가 수준을 나타낸다.',
  'EPS': '주당순이익. 순이익을 발행주식수로 나눈 값이다.',
  'EBITDA': '이자·세금·감가상각 차감 전 영업이익. 현금창출력을 가늠하는 지표다.',
  'M&A': '기업의 인수(Acquisition)와 합병(Merger)을 아울러 이르는 말이다.',
  'IPO': '기업공개. 비상장기업이 주식을 증권시장에 처음 상장하는 것이다.',
  'ESG': '환경(Environment)·사회(Social)·지배구조(Governance). 비재무적 경영 성과 기준이다.',
  'CAPEX': '자본적 지출. 설비·시설 등 장기 자산에 투입하는 투자 비용이다.',
  '컨센서스': '증권가 전망치의 평균. 시장이 예상하는 실적 수준을 뜻한다.',
  '어닝서프라이즈': '실적이 시장 예상치를 크게 웃도는 것을 말한다.',
  '어닝쇼크': '실적이 시장 예상치를 크게 밑도는 것을 말한다.',
  '유상증자': '새 주식을 발행해 주주에게 돈을 받고 파는 것으로, 자본을 늘리는 자금조달 방식이다.',
  '무상증자': '잉여금을 자본금으로 옮기며 주주에게 대가 없이 주식을 나눠주는 것이다.',
  '자사주': '회사가 자기 주식을 사들여 보유하는 것으로, 소각하면 주당가치가 올라간다.',
  '공매도': '주식을 빌려서 판 뒤 값이 내리면 되사서 갚아 차익을 내는 거래다.',
  '배당성향': '순이익 중 배당금으로 지급한 비율이다.',
  '영업이익률': '매출액 대비 영업이익 비율로, 본업의 수익성을 나타낸다.',
  '부채비율': '자기자본 대비 부채 비율로, 재무 안정성을 가늠하는 지표다.',
  '유동비율': '유동부채 대비 유동자산 비율로, 단기 지급능력을 나타낸다.',
  '영업활동현금흐름': '영업으로 실제 들어오고 나간 현금의 흐름이다.',
  '연결재무제표': '모회사와 종속회사를 하나의 기업처럼 합쳐 작성한 재무제표다.',
  '별도재무제표': '종속회사를 빼고 해당 회사만 따로 작성한 재무제표다.',
  '감가상각': '설비 등 자산의 가치 감소분을 사용 기간에 걸쳐 비용으로 나눠 반영하는 회계 처리다.',
  '충당금': '앞으로 발생할 것이 확실시되는 손실·비용에 대비해 미리 잡아두는 금액이다.',
  '영업권': '인수 시 순자산 가치를 넘겨 지불한 금액으로, 브랜드·고객망 등 무형의 초과 가치다.',
  '지주회사': '다른 회사 주식을 보유해 지배하는 것을 주된 사업으로 하는 회사다.',
  '캐즘': '신기술이 초기 시장을 지나 대중화로 넘어가기 전 수요가 정체되는 구간을 말한다.',
  '반도체': '전기가 통하는 정도를 조절할 수 있는 물질로 만든 전자부품으로, 전자기기의 핵심 부품이다.',
  'HBM': '고대역폭 메모리. D램을 수직으로 쌓아 데이터 전송 속도를 크게 높인 메모리로 AI 연산에 쓰인다.',
  'AI': '인공지능. 학습과 추론 등 인간의 지적 능력을 컴퓨터로 구현한 기술이다.',
  '파운드리': '반도체 설계를 받아 위탁 생산만 전담하는 사업 방식이다.',
  '팹리스': '생산 설비 없이 반도체 설계만 하는 기업이다.',
  '가이던스': '기업이 직접 제시하는 실적 전망치다.',
  '리쇼어링': '해외로 나간 생산시설을 자국으로 되돌리는 것이다.',
  '레버리지': '빚을 지렛대 삼아 투자 규모를 키우는 것을 말한다.',
  '스팩': '비상장기업 인수합병을 목적으로 설립돼 상장하는 명목회사(SPAC)다.',
  '워크아웃': '채권단 주도로 진행하는 기업 재무구조 개선 작업이다.',
  '실적발표': '기업이 일정 기간의 경영 성과를 공시하는 것이다.',
  '코스피': '유가증권시장. 국내 대표 기업이 상장된 증권시장이다.',
  '코스닥': '기술·성장 기업 중심의 증권시장이다.',
  '시가총액': '주가에 발행주식수를 곱한 값으로, 시장이 매긴 기업 전체 가치다.',
  '기준금리': '중앙은행이 정하는 정책금리로, 시중 금리의 기준이 된다.',
  '환율': '자국 통화와 외국 통화의 교환 비율이다.',
  '관세': '수입품에 매기는 세금이다.',
  '리콜': '제품 결함이 발견돼 제조사가 회수·수리하는 조치다.',
  '특허': '발명에 대해 일정 기간 독점적 권리를 인정받는 제도다.',
};

// 조사/어미를 떼어 단어를 맞춰보기 위한 접미사
const JOSA = ['으로서','으로써','에서는','에게는','이라고','라고','에서','에게','으로','까지','부터','보다','처럼','만큼','와의','과의','들이','들을','은','는','이','가','을','를','의','에','와','과','도','만','로','랑'];

const STOPWORDS = new Set(['그리고','하지만','그러나','이번','관련','대해','통해','있다','했다','한다','된다','밝혔다','말했다','대한','위해','따라','때문','지난','오는','최근','현재','올해','내년','작년','이날','이라고','것으로','수도','우리','자신','경우','정도','가운데','대비','기준','에서','으로']);

// ── HTTP ───────────────────────────────────────────────────
function fetchText(urlStr, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error('리다이렉트 초과'));
    let u;
    try { u = new URL(urlStr); } catch(e) { return reject(new Error('잘못된 주소')); }
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(urlStr, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        const loc = new URL(res.headers.location, urlStr).toString();
        res.resume();
        return resolve(fetchText(loc, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = [];
      let size = 0;
      res.on('data', c => {
        size += c.length;
        if (size > 3 * 1024 * 1024) { req.destroy(); return; }   // 과도한 페이지 방어
        chunks.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(REQ_TIMEOUT, () => req.destroy(new Error('타임아웃')));
  });
}

// ── HTML → 본문 텍스트 ─────────────────────────────────────
function htmlToText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|iframe|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// 언론사마다 구조가 달라 컨테이너 특정은 빗나가기 쉽다.
// 그래서 문장 형태(한국어 종결어미)로 본문을 골라내는 방식을 쓴다.
function articleSentences(text) {
  const raw = text.split(/\n+/);
  const out = [];
  for (const line of raw) {
    for (const s of splitSentences(line)) {
      if (isArticleSentence(s)) out.push(s);
    }
  }
  return out;
}

function splitSentences(text) {
  return text
    .split(/(?<=[다요죠][.!?])\s+|(?<=[.!?])\s+(?=[가-힣A-Z"'“‘])/)
    .map(s => s.trim())
    .filter(Boolean);
}

function isArticleSentence(s) {
  if (s.length < 20 || s.length > 400) return false;
  // 한국어 문장 종결형으로 끝나는 것만 본문으로 본다 (메뉴·버튼 텍스트 제거)
  if (!/[다요죠][.!?]["'”’)]?$/.test(s)) return false;
  const hangul = (s.match(/[가-힣]/g) || []).length;
  if (hangul / s.length < 0.3) return false;
  // 기자 서명, 저작권, 구독 안내 등 상투구 제거
  if (/(무단\s*전재|재배포\s*금지|저작권자|기자\s*=|▶|◀|구독하기|앱\s*다운로드|사진=|제공=)/.test(s)) return false;
  return true;
}

// ── 토큰화 / 스코어링 ──────────────────────────────────────
function normalizeWord(w) {
  if (/^[가-힣]+$/.test(w)) {
    for (const j of JOSA) {
      if (w.length > j.length + 1 && w.endsWith(j)) return w.slice(0, -j.length);
    }
  }
  return w;
}

function tokenize(s) {
  const raw = s.match(/[가-힣]{2,}|[A-Za-z]{2,}|\d+(?:[.,]\d+)*%?/g) || [];
  return raw.map(normalizeWord).filter(w => w.length >= 2 && !STOPWORDS.has(w));
}

function summarize(sentences, corpName, maxN) {
  if (!sentences.length) return [];
  const freq = Object.create(null);
  const tokensPer = sentences.map(s => {
    const t = tokenize(s);
    t.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    return t;
  });

  const scored = sentences.map((s, i) => {
    const words = tokensPer[i];
    if (!words.length) return { i, s, score: -1 };
    const uniq = [...new Set(words)];
    // 중요 단어를 많이 담되 불필요하게 길지 않은 문장을 선호
    let score = uniq.reduce((a, w) => a + freq[w], 0) / Math.sqrt(words.length);
    // 뉴스는 역피라미드 구조라 앞 문장에 핵심이 몰린다
    score *= 1 + Math.max(0, 8 - i) * 0.05;
    if (corpName && s.includes(corpName)) score *= 1.15;
    return { i, s, score };
  });

  return scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxN)
    .sort((a, b) => a.i - b.i)      // 원문 순서를 지켜야 읽힌다
    .map(x => x.s);
}

// 없는 시사점을 지어내지 않고, 기사에 실제로 적힌 전망·예상 문장을 뽑는다.
const FUTURE = /(전망|예상|기대|계획|방침|목표|관측|추진|검토|가능성|우려|될\s*것|할\s*것|보인다|분석된다|평가된다|풀이된다)/;

function findImplications(sentences, used, corpName) {
  const pool = sentences.filter(s => !used.includes(s) && FUTURE.test(s));
  if (!pool.length) return '';
  return summarize(pool, corpName, 2).join(' ');
}

function findTerms(text, maxN) {
  const found = [];
  const seen = new Set();
  for (const [term, explanation] of Object.entries(GLOSSARY)) {
    if (seen.has(term)) continue;
    const pattern = /^[A-Za-z&]+$/.test(term)
      ? new RegExp('(^|[^A-Za-z])' + term.replace(/[&]/g, '\\$&') + '([^A-Za-z]|$)')
      : new RegExp(term);
    if (pattern.test(text)) { found.push({ term, explanation }); seen.add(term); }
    if (found.length >= maxN) break;
  }
  return found;
}

// ── handler ────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const body = req.body || {};
  const { title = '', description = '', corp = '', link = '', naverLink = '' } = body;
  if (!title) { res.status(400).json({ error: 'title required' }); return; }

  // 네이버 뉴스 페이지가 구조가 일정해 성공률이 높으므로 먼저 시도한다.
  const candidates = [naverLink, link].filter(Boolean);
  let sentences = [];
  let sourceUsed = 'description';

  for (const url of candidates) {
    try {
      const html = await fetchText(url);
      const picked = articleSentences(htmlToText(html));
      if (picked.length >= 3) { sentences = picked; sourceUsed = 'article'; break; }
    } catch(e) { /* 다음 후보로 */ }
  }

  // 본문을 못 가져오면 최소한 네이버가 준 발췌라도 쓴다.
  if (!sentences.length) {
    const fallback = splitSentences(String(description).replace(/<[^>]+>/g, ''));
    sentences = fallback.filter(s => s.length >= 10);
  }

  if (!sentences.length) {
    res.status(200).json({
      main_content: String(description).replace(/<[^>]+>/g, '') || title,
      implications: '',
      terms: [],
      source: 'title-only',
    });
    return;
  }

  const main = summarize(sentences, corp, 4);
  const implications = findImplications(sentences, main, corp);
  const haystack = title + ' ' + sentences.join(' ');

  res.status(200).json({
    main_content: main.join(' '),
    implications,
    terms: findTerms(haystack, 4),
    source: sourceUsed,
  });
};
