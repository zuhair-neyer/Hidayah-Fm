const firebase = require('../firebase');
async function requireAuth(req, res, next) {
  if (req.user) return next();
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    req.idToken = header.slice(7);
    req.identity = await firebase.identity(req.idToken);
    req.record = (await firebase.read(req.identity.id, req.idToken)).value;
    if (!req.record?.profile) throw firebase.error('Sign in to finish setting up your account.', 401);
    req.user = req.record.profile;
    next();
  } catch (error) { next(error); }
}
module.exports = { requireAuth, optionalAuth: requireAuth };
