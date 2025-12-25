const DEFAULT_ALLOWED_IPS = ['127.0.0.1', '::1'];

function normalizeIp(ip) {
  if (!ip) {
    return '';
  }

  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }

  return ip;
}

function parseAllowedIps() {
  const envValue = process.env.ALLOWED_IPS;
  if (!envValue) {
    return DEFAULT_ALLOWED_IPS;
  }

  return envValue.split(',').map((value) => value.trim()).filter(Boolean);
}

function createAuthMiddleware() {
  const allowedIps = new Set(parseAllowedIps().map(normalizeIp));

  return (req, res, next) => {
    const ip = normalizeIp(req.ip);
    if (!allowedIps.has(ip)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const expectedKey = process.env.API_KEY;
    const providedKey = req.get('x-api-key');
    if (!expectedKey || !providedKey || providedKey !== expectedKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return next();
  };
}

module.exports = {
  createAuthMiddleware,
};
