const https = require('https');

function fetchJson(urlStr, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(urlStr, { headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
        catch(e) { reject(new Error('파싱 실패')); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(new Error('뉴스 조회 타임아웃')); });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { query } = req.query;
  if (!query) { res.status(400).json({ error: 'query required' }); return; }

  const CLIENT_ID     = 'P0_j6iyVF0OyP9hEHKeg';
  const CLIENT_SECRET = 'N7LtaY_qTL';

  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=15&sort=date`;

  try {
    const data = await fetchJson(url, {
      'X-Naver-Client-Id':     CLIENT_ID,
      'X-Naver-Client-Secret': CLIENT_SECRET,
    });
    // 같은 기업을 다시 열면 엣지 캐시에서 즉시 응답한다 (뉴스는 5분이면 충분히 최신).
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};