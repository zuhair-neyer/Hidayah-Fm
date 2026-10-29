const { test, expect } = require('./static-fixtures.cjs');
const AxeBuilder = require('@axe-core/playwright').default;
const path = require('node:path');
const evidence = path.resolve(__dirname, '../work/password-reset-evidence');
const oldPassword = 'old-browser-reset-password';
const newPassword = 'new-browser-reset-password';
const emulator = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Reset browser tests require both Firebase emulators.');

async function auth(request, action, data) {
  const response = await request.post(emulator + '/identitytoolkit.googleapis.com/v1/accounts:' + action + '?key=emulator-test-key', { data });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function fixture(request) {
  const email = `reset-browser-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  await auth(request, 'signUp', { email, password: oldPassword, displayName: 'Reset Tester', returnSecureToken: true });
  await auth(request, 'sendOobCode', { requestType: 'PASSWORD_RESET', email });
  const response = await request.get(emulator + '/emulator/v1/projects/demo-hidayah-fm/oobCodes');
  expect(response.ok()).toBeTruthy();
  const code = (await response.json()).oobCodes.filter(item => item.email === email && item.requestType === 'PASSWORD_RESET').at(-1);
  expect(code).toBeTruthy();
  return { email, oobCode: code.oobCode };
}
async function login(page, email, password) {
  await page.goto('/#/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.locator('[name=password]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.welcome')).toBeVisible();
}

test('custom reset page validates confirmation, toggles visibility, resets and returns to sign in', async ({ page, request }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const { email, oobCode } = await fixture(request);
  await page.goto('/reset-password.html?mode=resetPassword&oobCode=' + encodeURIComponent(oobCode) + '&continueUrl=https%3A%2F%2Fexample.invalid%2F');
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword + '-mismatch');
  await page.getByRole('button', { name: 'Save new password', exact: true }).click();
  await expect(page.locator('[role=alert]')).toContainText(/match/i);
  await expect(page).toHaveURL(/oobCode=/);
  const show = page.getByRole('button', { name: /show.*password/i }).first();
  await show.click();
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: /hide.*password/i }).first().click();
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: path.join(evidence, 'new-password-' + info.project.name + '.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save new password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Password updated', exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/oobCode=|continueUrl=/);
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to sign in', exact: true }).click();
  await expect(page).toHaveURL(/#\/login$/);
  await login(page, email, newPassword);
  expect(errors).toEqual([]);
});

test('missing, invalid and expired reset links allow recovery without exposing the app', async ({ page }) => {
  await page.goto('/reset-password.html');
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send reset link', exact: true })).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await page.goto('/reset-password.html?mode=resetPassword&oobCode=not-a-valid-reset-code');
  await expect(page.getByText(/invalid|expired/i).first()).toBeVisible();
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
  await page.route('**/identitytoolkit.googleapis.com/v1/accounts:resetPassword?*', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'EXPIRED_OOB_CODE' } }) }));
  await page.goto('/reset-password.html?mode=resetPassword&oobCode=expired-code-fixture');
  await expect(page.getByText(/expired/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send reset link', exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('a failed save keeps the password form available for retry', async ({ page, request }) => {
  const { oobCode } = await fixture(request);
  await page.goto('/reset-password.html?mode=resetPassword&oobCode=' + encodeURIComponent(oobCode));
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
  await page.route('**/identitytoolkit.googleapis.com/v1/accounts:resetPassword?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'INTERNAL_ERROR' } }) }), { times: 1 });
  await page.getByRole('button', { name: 'Save new password', exact: true }).click();
  await expect(page.locator('[role=alert]')).toContainText('Please try again');
  await expect(page.getByRole('button', { name: 'Save new password', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/oobCode=/);
  await page.getByRole('button', { name: 'Save new password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Password updated', exact: true })).toBeVisible();
});

test('non-reset email actions use only the configured Firebase destination', async ({ page }) => {
  await page.goto('/reset-password.html?mode=verifyEmail&oobCode=verification-fixture&apiKey=untrusted&continueUrl=https%3A%2F%2Fexample.invalid');
  await expect(page.getByRole('link', { name: 'Continue securely with Firebase', exact: true })).toBeVisible();
  const fallback = await page.getByRole('link', { name: 'Continue securely with Firebase', exact: true }).getAttribute('href');
  const destination = new URL(fallback);
  expect(destination.origin).toBe('https://hidayah-fm.firebaseapp.com');
  expect(destination.pathname).toBe('/__/auth/action');
  expect(destination.searchParams.get('mode')).toBe('verifyEmail');
  expect(destination.searchParams.get('apiKey')).not.toBe('untrusted');
  expect(destination.searchParams.has('continueUrl')).toBeFalsy();
  const invalid = await page.evaluate(async () => { const {firebaseEmailActionURL}=await import('/js/firebase-config.js');try{firebaseEmailActionURL('resetPassword','fixture');return false;}catch{return true;} });
  expect(invalid).toBeTruthy();
});

test('both devotional catalogues display all sixty recordings', async ({ page, request }) => {
  const { email } = await fixture(request);
  await login(page, email, oldPassword);
  for (const type of ['nasheed', 'naat']) {
    await page.goto('/#/tracks?type=' + type);
    await expect(page.locator('.track-card')).toHaveCount(60);
    await expect(page.locator('.track-card').last().getByRole('button', { name: /^Open source for |^Play / })).toBeVisible();
  }
});
