const { test: base, expect } = require('@playwright/test');
const firebaseTestConfig = {
  projectId: 'demo-hidayah-fm',
  authHost: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  databaseHost: process.env.FIREBASE_DATABASE_EMULATOR_HOST
};
if (!/^127\.0\.0\.1:\d+$/.test(firebaseTestConfig.authHost || '') || !/^127\.0\.0\.1:\d+$/.test(firebaseTestConfig.databaseHost || '')) throw new Error('Static browser tests require loopback Firebase emulators. Run npm run test:e2e.');
async function installEmulators(context) {
  await context.addInitScript(config => { window.__HFM_TEST_FIREBASE__ = config; }, firebaseTestConfig);
}
const test = base.extend({
  context: async ({ context }, use) => {
    await installEmulators(context);
    const apiRequests = [];
    context.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
    await use(context);
    expect(apiRequests, 'The static app must never request a Node /api endpoint').toEqual([]);
  }
});
async function service(page, endpoint, method = 'GET', body) {
  return page.evaluate(async ({ endpoint, method, body }) => {
    const { api } = await import('/js/client.js');
    try { return { ok: true, body: await api(endpoint, method, body) }; }
    catch (error) { return { ok: false, status: error.status, error: error.message }; }
  }, { endpoint, method, body });
}
module.exports = { test, expect, installEmulators, firebaseTestConfig, service };
