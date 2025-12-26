const express = require('express');
const bcrypt = require('bcrypt');
const { signToken } = require('./jwt');
const {
  createUser,
  getUserByMobile,
  countUsers,
} = require('../db/repositories/usersRepository');
const { requireAuth } = require('../middleware/requireAuth');

const SALT_ROUNDS = 10;

function sanitizeMobile(mobile) {
  return String(mobile || '').replace(/\D/g, '');
}

function createAuthRoutes() {
  const router = express.Router();

  router.post('/login', async (req, res, next) => {
    try {
      const mobile = sanitizeMobile(req.body.mobile || req.body.phone);
      const password = String(req.body.password || '');
      if (!mobile || !password) {
        return res.status(400).json({ error: 'MOBILE_AND_PASSWORD_REQUIRED' });
      }

      const user = await getUserByMobile(mobile);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      }

      const token = signToken({ sub: user.id, mobile: user.mobile });
      return res.json({
        token,
        user: { id: user.id, mobile: user.mobile },
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/bootstrap', async (req, res, next) => {
    try {
      const totalUsers = await countUsers();
      if (totalUsers > 0) {
        return res.status(403).json({ error: 'BOOTSTRAP_DISABLED' });
      }

      const mobile = sanitizeMobile(process.env.ADMIN_BOOTSTRAP_MOBILE);
      const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || '');
      if (!mobile || !password) {
        return res.status(400).json({ error: 'BOOTSTRAP_ENV_MISSING' });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await createUser({ mobile, passwordHash });
      return res.json({ ok: true, user: { id: user.id, mobile: user.mobile } });
    } catch (err) {
      return next(err);
    }
  });

  router.use(requireAuth);

  router.post('/logout', (req, res) => {
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}

module.exports = {
  createAuthRoutes,
};
