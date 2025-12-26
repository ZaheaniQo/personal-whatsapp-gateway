const { verifyToken } = require('../auth/jwt');
const { getUserById } = require('../db/repositories/usersRepository');

async function requireAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'AUTH_REQUIRED' });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'INVALID_TOKEN' });
    }

    const userId = payload?.sub;
    const user = userId ? await getUserById(userId) : null;
    if (!user) {
      return res.status(403).json({ error: 'USER_DISABLED' });
    }

    req.user = { id: user.id, mobile: user.mobile };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  requireAuth,
};
