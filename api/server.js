const express = require('express');
const { createRoutes } = require('./routes');
const { createAuthMiddleware } = require('../security/auth');
const { createRateLimitMiddleware } = require('../security/rateLimit');

function createServer() {
  const app = express();
  app.use(express.json({ limit: '100mb' }));

  app.use(createAuthMiddleware());
  app.use(createRateLimitMiddleware());
  app.use('/', createRoutes());

  return app;
}

module.exports = {
  createServer,
};
