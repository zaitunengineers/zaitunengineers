import { api, ApiError } from '/assets/js/api.js';
import { wireEye, setButtonLoading } from '/assets/js/ui.js';

const form = document.getElementById('login-form');
const username = document.getElementById('username');
const password = document.getElementById('password');
const submit = document.getElementById('submit');
const errorBox = document.getElementById('error');
const notice = document.getElementById('notice');

wireEye(password, document.getElementById('eye'));

const params = new URLSearchParams(location.search);
if (params.get('timeout')) {
  notice.textContent = 'You were signed out after 30 minutes of inactivity.';
  notice.hidden = false;
} else if (params.get('expired')) {
  notice.textContent = 'Your session ended. Please sign in again.';
  notice.hidden = false;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  if (!username.value.trim() || !password.value) {
    showError('Enter your username and password.');
    (username.value.trim() ? password : username).focus();
    return;
  }
  setButtonLoading(submit, true, 'Signing in');
  try {
    await api('POST', '/api/login', { username: username.value.trim(), password: password.value }, { noRedirect: true });
    location.replace('/app/');
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    password.value = '';
    password.focus();
    setButtonLoading(submit, false, 'Sign in');
  }
});
