const express = require('express');
const path = require('path');

function createUiRoutes() {
  const router = express.Router();
  const baseDir = path.join(__dirname);

  router.get('/login', (req, res) => {
    res.sendFile(path.join(baseDir, 'login.html'));
  });

  router.get('/dashboard', (req, res) => {
    res.sendFile(path.join(baseDir, 'index.html'));
  });

  router.get('/instances', (req, res) => {
    res.sendFile(path.join(baseDir, 'instances.html'));
  });

  router.get('/campaigns', (req, res) => {
    res.sendFile(path.join(baseDir, 'campaigns.html'));
  });

  router.get('/ops-ui', (req, res) => {
    res.sendFile(path.join(baseDir, 'ops.html'));
  });

  return router;
}

module.exports = {
  createUiRoutes,
};
