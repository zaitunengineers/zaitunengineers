// Small helpers for JSON requests and replies.

export const PROD_ORIGIN = 'https://billing.zaitunengineers.com';

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function err(message, status = 400, extra = null) {
  return json({ error: message, ...(extra || {}) }, status);
}

// Wraps an endpoint so any problem becomes a clean JSON answer.
// Unknown problems never leak details to the browser.
export const guard = (fn) => async (context) => {
  try {
    return await fn(context);
  } catch (e) {
    if (e instanceof HttpError) {
      return err(e.message, e.status, e.extra);
    }
    console.error('api error:', e && e.message ? e.message : 'unknown');
    return err('Something went wrong. Please try again.', 500);
  }
};

export async function readJson(request, limit = 1_000_000) {
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!type.includes('application/json')) throw new HttpError(415, 'Send JSON.');
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > limit) throw new HttpError(413, 'That request is too large.');
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, 'That request is too large.');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'That request was not valid JSON.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'That request was not valid.');
  }
  return parsed;
}

export function getIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

export function allowedOrigin(env) {
  return (env && env.APP_ORIGIN) || PROD_ORIGIN;
}
