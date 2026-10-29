// Public Firebase web configuration. No administrator credentials belong here.
export const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyCwmgRS0lPGpU5dIqBp4Kdh_VtVb3VntGA',
  authDomain: 'hidayah-fm.firebaseapp.com',
  projectId: 'hidayah-fm',
  databaseURL: 'https://hidayah-fm-default-rtdb.firebaseio.com',
  storageBucket: 'hidayah-fm.firebasestorage.app',
  messagingSenderId: '700184701839',
  appId: '1:700184701839:web:d035ad8630cc41d3f9b9fa'
});

// Tests can use isolated emulators only from a loopback page. A hosted site
// cannot enable them through a query parameter, saved preference or this global.
const test = globalThis.__HFM_TEST_FIREBASE__;
const loopback = ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const localHost = value => typeof value === 'string' && /^(?:127\.0\.0\.1|localhost):\d{2,5}$/.test(value);
export const emulators = loopback && test?.projectId === 'demo-hidayah-fm' && localHost(test.authHost) && localHost(test.databaseHost)
  ? Object.freeze({ ...test }) : null;

export function firebaseEmailActionURL(mode, oobCode) {
  if (!['verifyEmail','recoverEmail'].includes(mode) || typeof oobCode !== 'string' || !oobCode || oobCode.length > 2048 || /\s/.test(oobCode)) throw new Error('Open a valid account action link from your email.');
  const url = new URL('/__/auth/action', 'https://' + firebaseConfig.authDomain);
  url.search = new URLSearchParams({ mode, oobCode, apiKey: firebaseConfig.apiKey }).toString();
  return url.href;
}
