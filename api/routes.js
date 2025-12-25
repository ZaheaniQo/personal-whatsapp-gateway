const express = require('express');
const sender = require('../engine/sender');

function createRoutes() {
  const router = express.Router();

  router.get('/', (_, res) => res.send("✅ WhatsApp Bot API is running."));
  router.post('/sendMessage', sender.sendMessage);
  router.post('/sendFile', sender.sendFile);
  router.post('/sendSmart', sender.sendSmart);
  router.post('/broadcast', sender.broadcast);

  return router;
}

module.exports = {
  createRoutes,
};
