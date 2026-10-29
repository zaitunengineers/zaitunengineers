import { api, ApiError } from '/assets/js/api.js';
import { wireEye, setButtonLoading, strengthMeter } from '/assets/js/ui.js';

const form = document.getElementById('setup-form');
const setupKey = document.getElementById('setupKey');
const username = document.getElementById('username');
const password = document.getElementById('password');
const confirm = document.getElementById('confirm');
const submit = document.getElementById('submit');
const errorBox = document.getElementById('error');

wireEye(setupKey, document.getElementById('eye-key'));
wireEye(password, document.getElementById('eye-pw'));

const meter = strengthMeter();
document.getElementById('meter').append(meter.el);
password.addEventListener('input', () => meter.update(password.value));

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  errorBox.scrollIntoView({ block: 'nearest' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  if (!setupKey.value || !username.value.trim() || !password.value) {
    showError('Fill in every box.');
    return;
  }
  if (password.value !== confirm.value) {
    showError('The two passwords are not the same.');
    confirm.focus();
    return;
  }
  setButtonLoading(submit, true, 'Saving');
  try {
    const res = await api(
      'POST',
      '/api/setup',
      { setupKey: setupKey.value, username: username.value.trim(), password: password.value },
      { noRedirect: true }
    );
    document.getElementById('setup-card').hidden = true;
    document.getElementById('done-text').textContent =
      res.mode === 'reset'
        ? 'Your username and password were reset. All other logins were signed out.'
        : 'Your owner account was created. You can sign in now.';
    document.getElementById('done-card').hidden = false;
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    setButtonLoading(submit, false, 'Create account');
  }
});
