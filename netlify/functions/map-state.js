/**
 * Netlify Serverless Function for Automatic Desktop ⇄ Mobile Map State Sync
 * Endpoint: /.netlify/functions/map-state (or /api/map-state)
 */
let cachedState = null;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const host = (event.headers && (event.headers.host || event.headers.Host)) || 'default-ulp-pnk';
  const topicKey = 'pln_ulppnk_k3_fn_' + String(host).replace(/[^a-zA-Z0-9_-]/g, '_');

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      if (body && (body.b64 || body.reset)) {
        cachedState = body;
        // Also persist to cloud pub/sub cache so cold starts retain state
        try {
          await fetch('https://ntfy.sh/' + topicKey, {
            method: 'POST',
            body: JSON.stringify(body)
          });
        } catch (_) {}
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ok: true, ts: body.ts })
        };
      }
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Invalid payload' }) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
    }
  }

  if (event.httpMethod === 'GET') {
    if (cachedState) {
      return { statusCode: 200, headers, body: JSON.stringify(cachedState) };
    }
    try {
      const res = await fetch('https://ntfy.sh/' + topicKey + '/json?poll=1&since=all');
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split('\n').filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const msg = JSON.parse(lines[i]);
            if (msg && msg.event === 'message' && msg.message) {
              const parsed = JSON.parse(msg.message);
              if (parsed && (parsed.b64 || parsed.reset)) {
                cachedState = parsed;
                return { statusCode: 200, headers, body: JSON.stringify(cachedState) };
              }
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
    return { statusCode: 200, headers, body: JSON.stringify({ empty: true }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
