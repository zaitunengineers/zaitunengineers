// One place for talking to the server.

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || null;
  }
}

// opts.noRedirect: do not send the person to the login page on a 401 (used by the login form itself).
export async function api(method, path, body, opts = {}) {
  const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError('Cannot reach the server. Check your internet connection.', 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no JSON body */
  }
  if (res.status === 401 && !opts.noRedirect) {
    location.replace('/?expired=1');
    throw new ApiError('Please sign in again.', 401);
  }
  if (!res.ok) {
    throw new ApiError((data && data.error) || 'Something went wrong. Please try again.', res.status, data);
  }
  return data;
}
