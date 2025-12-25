const WINDOW_MS = 60 * 1000;
const LIMIT = 60;
const requestsByIp = new Map();

function normalizeIp(ip) {
  if (!ip) {
    return 'unknown';
  }

  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }

  return ip;
}

function createRateLimitMiddleware() {
  return (req, res, next) => {
    const now = Date.now();
    const ip = normalizeIp(req.ip);
    const entry = requestsByIp.get(ip);

    if (!entry || now >= entry.resetTime) {
      requestsByIp.set(ip, { count: 1, resetTime: now + WINDOW_MS });
      return next();
    }

    if (entry.count >= LIMIT) {
      return res.status(429).json({ error: 'Too Many Requests' });
    }

    entry.count += 1;
    return next();
  };
}

module.exports = {
  createRateLimitMiddleware,
};
