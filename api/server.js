const express = require('express');
const path = require('path');
const { createRoutes } = require('./routes');
const { createDashboardRoutes } = require('./dashboardRoutes');
const { createOpsRoutes } = require('./opsRoutes');
const { createMediaRoutes } = require('./mediaRoutes');
const { createAuthMiddleware } = require('../security/auth');
const { createRateLimitMiddleware } = require('../security/rateLimit');
const { initDb } = require('../db');
const { createAuthRoutes } = require('../auth/authRoutes');
const { createInstancesRoutes } = require('../instances/instancesRoutes');
const { createCampaignRoutes } = require('../campaigns/campaignRoutes');
const { createEventsRoutes } = require('../events/eventsRoutes');
const { createUiRoutes } = require('../dashboard/uiRoutes');
const { requireAuth } = require('../middleware/requireAuth');
const { errorHandler } = require('../middleware/errorHandler');
const instanceManager = require('../instances/instanceManager');
const queueEngine = require('../queue/queueEngine');

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
  app.use(createUiRoutes());
  app.use(createRateLimitMiddleware());
  initDb()
    .then(() => instanceManager.initializeExistingInstances())
    .then(() => queueEngine.start())
    .catch((err) => {
      console.error('App DB init failed:', err.message);
    });

  app.use('/auth', createAuthMiddleware(), createAuthRoutes());
  app.use('/app/instances', requireAuth, createInstancesRoutes());
  app.use('/app/campaigns', requireAuth, createCampaignRoutes());
  app.use('/app/events', requireAuth, createEventsRoutes());
  app.use('/dashboard', createAuthMiddleware(), createDashboardRoutes());
  app.use('/ops', createAuthMiddleware(), createOpsRoutes());
  app.use('/media', createAuthMiddleware(), createMediaRoutes());
  app.use('/', createAuthMiddleware(), createRoutes());
  app.use(errorHandler);

  return app;
}

module.exports = {
  createServer,
};
