const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function stripCodeFence(value) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
}

async function analyzeDocument(request, env) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: '파일을 선택해 주세요.' }, 400);
  if (!ALLOWED_TYPES.has(file.type)) return json({ error: 'PDF, JPG, PNG, WEBP 파일만 지원해요.' }, 415);
  if (!file.size || file.size > MAX_FILE_SIZE) return json({ error: '파일은 8MB 이하만 업로드할 수 있어요.' }, 413);

  const converted = await env.AI.toMarkdown({
    name: file.name,
    blob: new Blob([await file.arrayBuffer()], { type: file.type }),
  });
  if (!converted || converted.format === 'error' || !converted.data) {
    return json({ error: converted?.error || '문서 내용을 읽지 못했어요.' }, 422);
  }

  const prompt = `당신은 한국어 여행 예약 문서 추출기다. 아래 문서를 읽고 JSON 객체 하나만 반환한다.
종류(kind)는 flight, lodging, reservation, unknown 중 하나다.
모든 날짜는 YYYY-MM-DD, 시간은 HH:MM 24시간제로 정규화한다. 문서에 없는 값은 빈 문자열로 둔다.
추측하지 말고, 예약번호는 memo에도 포함한다.
필드 형식:
{"kind":"","title":"","date":"","time":"","endDate":"","place":"","address":"","memo":"","reservationNumber":"","flight":{"from":"","fromCity":"","depart":"","to":"","toCity":"","arrive":"","flightNumber":""}}

문서:
${converted.data.slice(0, 24000)}`;

  const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      { role: 'system', content: '응답은 설명이나 마크다운 없이 유효한 JSON 객체만 반환한다.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0,
    max_tokens: 900,
    response_format: { type: 'json_object' },
  });

  try {
    const text = typeof result === 'string' ? result : result.response;
    const extracted = typeof text === 'string' ? JSON.parse(stripCodeFence(text)) : text;
    if (!extracted || typeof extracted !== 'object') throw new Error('invalid extraction');
    return json({ extracted });
  } catch {
    return json({ error: '분석 결과를 정리하지 못했어요. 다시 시도해 주세요.' }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/analyze-document') {
      if (request.method !== 'POST') return json({ error: '지원하지 않는 요청이에요.' }, 405);
      try {
        return await analyzeDocument(request, env);
      } catch (error) {
        console.error('document analysis failed', error);
        return json({ error: '문서 분석 중 오류가 발생했어요.' }, 500);
      }
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (url.pathname === '/sw.js') {
      headers.set('Cache-Control', 'no-cache');
      headers.set('Service-Worker-Allowed', '/');
    }
    if (url.pathname === '/manifest.webmanifest') {
      headers.set('Content-Type', 'application/manifest+json; charset=utf-8');
      headers.set('Cache-Control', 'public, max-age=3600');
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
