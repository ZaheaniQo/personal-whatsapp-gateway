const express = require('express');
const path = require('path');
const { createRoutes } = require('./routes');
const { createDashboardRoutes } = require('./dashboardRoutes');
const { createOpsRoutes } = require('./opsRoutes');
const { createMediaRoutes } = require('./mediaRoutes');
const { createAuthMiddleware } = require('../security/auth');
const { createRateLimitMiddleware } = require('../security/rateLimit');

function createServer() {
  const app = express();
  app.use(express.json({ limit: '100mb' }));
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && req.path.startsWith('/dashboard')) {
      return res.status(400).json({ error: 'INVALID_JSON' });
    }
    return next(err);
  });

  app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard')));
  app.use(createAuthMiddleware());
  app.use(createRateLimitMiddleware());
  app.use('/dashboard', createDashboardRoutes());
  app.use('/ops', createOpsRoutes());
  app.use('/media', createMediaRoutes());
  app.use('/', createRoutes());

  return app;
}

module.exports = {
  createServer,
};
