const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 진단용 GET
  if (req.method === 'GET') {
    res.status(200).json({
      key_exists: !!process.env.ANTHROPIC_API_KEY,
      key_preview: (process.env.ANTHROPIC_API_KEY || '').slice(0, 15) || 'none',
    });
    return;
  }

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const body = req.body || {};
  const { title = '', description = '', corp = '', date = '' } = body;
  if (!title) { res.status(400).json({ error: 'title required' }); return; }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) { res.status(500).json({ error: 'API key not set' }); return; }

  const prompt = `다음 뉴스를 JSON으로 요약하세요.
회사: ${corp}, 제목: ${title}, 내용: ${description}

JSON만 출력:
{"main_content":"핵심내용 3~5문장","implications":"시사점 2~3문장","terms":[{"term":"약어","explanation":"설명"}]}`;

  const payload = JSON.stringify({
    model: 'claude-sonnet-5',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
      };
      const req2 = https.request(options, (res2) => {
        let data = '';
        res2.on('data', c => { data += c; });
        res2.on('end', () => {
          try { resolve({ status: res2.statusCode, body: JSON.parse(data) }); }
          catch(e) { reject(new Error('파싱실패: ' + data.slice(0, 200))); }
        });
      });
      req2.on('error', e => reject(new Error('연결실패: ' + e.message)));
      req2.write(payload);
      req2.end();
    });

    if (result.status !== 200) {
      res.status(500).json({
        error: 'Anthropic 오류',
        status: result.status,
        detail: result.body,
      });
      return;
    }

    const text = result.body.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON없음: ' + text.slice(0, 200));

    res.status(200).json(JSON.parse(match[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
