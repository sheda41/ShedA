const https = require('https');

const KEY = process.env.DART_API_KEY || '6674f9aa0d9358b2693ab0dd6131773721c26a63';
const REQ_TIMEOUT = 8000;

function fetchJson(urlStr, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('리다이렉트 초과'));
    const req = https.get(urlStr, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if ([301,302,303,307].includes(res.statusCode) && res.headers.location) {
        let loc = res.headers.location;
        if (!loc.startsWith('http')) loc = 'https://opendart.fss.or.kr' + loc;
        res.resume();
        return resolve(fetchJson(loc, redirects + 1));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
        catch(e) { reject(new Error('파싱 실패')); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(REQ_TIMEOUT, () => { req.destroy(new Error('타임아웃')); });
  });
}

function dartUrl(endpoint, params) {
  const qs = new URLSearchParams({ crtfc_key: KEY });
  for (const [k,v] of Object.entries(params)) if (v) qs.set(k, v);
  return 'https://opendart.fss.or.kr/api/' + endpoint + '?' + qs.toString();
}

// 연결재무제표(CFS) 우선, 없으면 개별재무제표(OFS)로 폴백
async function fetchYear(corpCode, year) {
  const base = { corp_code: corpCode, bsns_year: String(year), reprt_code: '11011' };
  try {
    const d = await fetchJson(dartUrl('fnlttSinglAcntAll.json', { ...base, fs_div: 'CFS' }));
    if (d.status === '000' && d.list && d.list.length) return { year, list: d.list, fsDiv: 'CFS' };
  } catch(e) {}
  try {
    const d = await fetchJson(dartUrl('fnlttSinglAcntAll.json', { ...base, fs_div: 'OFS' }));
    if (d.status === '000' && d.list) return { year, list: d.list, fsDiv: 'OFS' };
  } catch(e) {}
  return { year, list: [], fsDiv: 'OFS' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const corpCode = req.query.corp_code;
  if (!corpCode) { res.status(400).json({ error: 'corp_code required' }); return; }

  const years = String(req.query.years || '')
    .split(',')
    .map(y => parseInt(y, 10))
    .filter(y => y >= 2000 && y <= 2100)
    .slice(0, 10);
  if (!years.length) { res.status(400).json({ error: 'years required' }); return; }

  try {
    // 회사정보 + 전 연도를 서버에서 한 번에 병렬 조회.
    // 브라우저가 요청 1개만 쓰므로 동시연결 한도에 걸리지 않는다.
    const [corpInfo, ...yearResults] = await Promise.all([
      fetchJson(dartUrl('company.json', { corp_code: corpCode })).catch(() => ({})),
      ...years.map(y => fetchYear(corpCode, y)),
    ]);

    // 과거 사업연도 수치는 사실상 불변이므로 엣지에 오래 캐싱한다.
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ corpInfo, years: yearResults });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
