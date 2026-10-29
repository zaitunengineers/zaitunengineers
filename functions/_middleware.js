// Runs before every request: address lock, login gate, request-forgery check, security headers.

import { getSession } from '../lib/auth.js';
import { err, allowedOrigin, PROD_ORIGIN } from '../lib/http.js';

const PUBLIC_API = new Set(['/api/health', '/api/setup', '/api/login']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function withHeaders(res, path) {
  const r = new Response(res.body, res);
  const h = r.headers;
  h.set('Content-Security-Policy', CSP);
  h.set('Strict-Transport-Security', 'max-age=31536000');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'no-referrer');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  h.set('X-Robots-Tag', 'noindex, nofollow');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (path.startsWith('/api/') || path === '/app' || path.startsWith('/app/')) {
    h.set('Cache-Control', 'no-store');
  }
  return r;
}

function redirect(location, status) {
  return new Response(null, { status, headers: { Location: location } });
}

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const host = url.hostname;

  // The pages.dev address always forwards to the real address.
  if (host === 'zaitun-billing.pages.dev' || host.endsWith('.zaitun-billing.pages.dev')) {
    return withHeaders(redirect(`${PROD_ORIGIN}${path}${url.search}`, 301), path);
  }

  const isApi = path.startsWith('/api/');
  const isApp = path === '/app' || path.startsWith('/app/');
  const isLoginPage = path === '/' || path === '/index.html';

  // Request forgery: changes must come from our own pages.
  if (isApi && !SAFE_METHODS.has(request.method)) {
    if (request.headers.get('Origin') !== allowedOrigin(env)) {
      return withHeaders(err('Forbidden.', 403), path);
    }
  }

  let session = null;
  if (isApi || isApp || isLoginPage) {
    try {
      session = await getSession(env, request);
    } catch (e) {
      if (isApi && !PUBLIC_API.has(path)) {
        console.error('session check failed:', e && e.message);
        return withHeaders(err('Something went wrong. Please try again.', 500), path);
      }
    }
  }
  data.session = session;

  if (isApi) {
    if (!PUBLIC_API.has(path) && !session) {
      return withHeaders(err('Please sign in.', 401), path);
    }
  } else if (isApp && !session) {
    return withHeaders(redirect('/', 302), path);
  } else if (isLoginPage && session) {
    return withHeaders(redirect('/app/', 302), path);
  }

  const res = await next();
  // An address under /api/ that no endpoint answers: say so in JSON, never show a page.
  if (isApi && res.status === 404 && (res.headers.get('Content-Type') || '').includes('text/html')) {
    return withHeaders(err('Not found.', 404), path);
  }
  return withHeaders(res, path);
}
