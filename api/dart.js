const https = require('https');
const zlib = require('zlib');

function fetchBuffer(urlStr, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('리다이렉트 초과'));
    https.get(urlStr, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if ([301,302,303,307].includes(res.statusCode) && res.headers.location) {
        let loc = res.headers.location;
        if (!loc.startsWith('http')) loc = 'https://opendart.fss.or.kr' + loc;
        res.resume();
        return resolve(fetchBuffer(loc, redirects + 1));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { endpoint, ...params } = req.query;
  if (!endpoint) { res.status(400).json({ error: 'endpoint required' }); return; }

  const KEY = '6674f9aa0d9358b2693ab0dd6131773721c26a63';
  const qs = new URLSearchParams({ crtfc_key: KEY });
  for (const [k,v] of Object.entries(params)) if (v) qs.set(k, v);
  const dartUrl = 'https://opendart.fss.or.kr/api/' + endpoint + '?' + qs.toString();

  try {
    const buffer = await fetchBuffer(dartUrl);
    const body = buffer.toString('utf-8');
    const data = JSON.parse(body);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    if (data.status === '013') { res.status(200).json({ status: '000', list: [] }); return; }
    if (data.status && data.status !== '000') {
      res.status(400).json({ error: data.message, dart_status: data.status });
      return;
    }
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};