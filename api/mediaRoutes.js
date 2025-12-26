const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const stateStore = require('../ops/stateStore');
const {
  getUploadRoot,
  ensureDir,
  safeFileName,
  buildStoredPath,
  resolveStoredPath,
  maxUploadBytes,
  allowUrlDownloads,
  downloadToTemp,
  sendMediaFromPath,
} = require('../media/mediaService');

function appendOpsLog(entry) {
  try {
    stateStore.appendLog(entry);
  } catch (err) {
    // Best-effort logging; do not impact endpoint behavior.
  }
}

function createStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadRoot = getUploadRoot();
      const stored = buildStoredPath(file.originalname);
      const subdir = stored.subdir;
      const targetDir = path.join(uploadRoot, subdir);
      ensureDir(targetDir);
      req.uploadMeta = { subdir, uploadRoot, filename: stored.filename };
      cb(null, targetDir);
    },
    filename: (req, file, cb) => {
      const safeName = safeFileName(file.originalname);
      const filename = req.uploadMeta.filename || safeName;
      const fileId = path.join(req.uploadMeta.subdir, filename);
      req.uploadMeta.fileId = fileId;
      cb(null, path.basename(fileId));
    },
  });
}

const upload = multer({
  storage: createStorage(),
  limits: { fileSize: maxUploadBytes() },
});

function createMediaRoutes() {
  const router = express.Router();

  router.post('/upload', (req, res) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        const code = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(code).json({ error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'NO_FILE' });
      }

      const storedPath = req.file.path;
      const fileId = req.uploadMeta?.fileId || path.basename(storedPath);
      const payload = {
        ok: true,
        fileId,
        storedPath,
        mimetype: req.file.mimetype,
        sizeBytes: req.file.size,
      };

      appendOpsLog({
        ts: Date.now(),
        type: 'system',
        to: null,
        textPreview: req.file.originalname,
        hasMedia: true,
        mediaType: req.file.mimetype || null,
        sizeBytes: req.file.size,
        result: 'stored',
      });

      const number = req.body?.number;
      const caption = req.body?.caption || '';
      const instanceId = req.body?.instanceId || 'default';
      if (number) {
        try {
          const normalized = number.endsWith('@c.us') ? number : number.replace(/\D/g, '') + '@c.us';
          await sendMediaFromPath({ number: normalized, filePath: storedPath, caption, instanceId });
          appendOpsLog({
            ts: Date.now(),
            type: 'send',
            to: normalized,
            textPreview: caption || req.file.originalname,
            hasMedia: true,
            mediaType: req.file.mimetype || null,
            sizeBytes: req.file.size,
            result: 'success',
          });
        } catch (sendErr) {
          appendOpsLog({
            ts: Date.now(),
            type: 'error',
            to: number,
            textPreview: caption || req.file.originalname,
            hasMedia: true,
            mediaType: req.file.mimetype || null,
            sizeBytes: req.file.size,
            result: 'error',
            error: sendErr.message,
          });
          return res.status(500).json({ error: 'SEND_FAILED', details: sendErr.message });
        }
      }

      return res.json(payload);
    });
  });

  router.post('/send', express.json({ limit: '2mb' }), async (req, res) => {
    const { number, fileId, path: filePath, url, caption, instanceId } = req.body || {};
    if (!number) {
      return res.status(400).json({ error: 'NUMBER_REQUIRED' });
    }

    const normalized = number.endsWith('@c.us') ? number : number.replace(/\D/g, '') + '@c.us';
    const activeInstanceId = instanceId || 'default';
    let tempPath = null;

    try {
      let resolvedPath = null;
      let mimetype = null;
      let sizeBytes = null;

      if (url) {
        if (!allowUrlDownloads()) {
          return res.status(403).json({ error: 'URL_DOWNLOADS_DISABLED' });
        }
        const download = await downloadToTemp(url, activeInstanceId);
        tempPath = download.path;
        resolvedPath = tempPath;
        mimetype = download.mimetype;
        sizeBytes = download.sizeBytes;
      } else if (fileId || filePath) {
        const candidate = fileId || filePath;
        resolvedPath = resolveStoredPath(candidate);
        if (!resolvedPath) {
          return res.status(400).json({ error: 'INVALID_PATH' });
        }
        if (!fs.existsSync(resolvedPath)) {
          return res.status(404).json({ error: 'FILE_NOT_FOUND' });
        }
        sizeBytes = fs.statSync(resolvedPath).size;
      } else {
        return res.status(400).json({ error: 'NO_MEDIA_SOURCE' });
      }

      const sendResult = await sendMediaFromPath({
        number: normalized,
        filePath: resolvedPath,
        caption,
        instanceId: activeInstanceId,
      });

      mimetype = mimetype || sendResult.mediaType;
      sizeBytes = sizeBytes || sendResult.sizeBytes;

      appendOpsLog({
        ts: Date.now(),
        type: 'send',
        to: normalized,
        textPreview: caption || path.basename(resolvedPath),
        hasMedia: true,
        mediaType: mimetype || null,
        sizeBytes: sizeBytes || null,
        result: 'success',
      });

      if (tempPath) {
        fs.rmSync(tempPath, { force: true });
      }

      return res.json({ ok: true });
    } catch (err) {
      if (tempPath) {
        fs.rmSync(tempPath, { force: true });
      }
      appendOpsLog({
        ts: Date.now(),
        type: 'error',
        to: number,
        textPreview: caption || null,
        hasMedia: true,
        mediaType: null,
        sizeBytes: null,
        result: 'error',
        error: err.message,
      });
      return res.status(500).json({ error: 'SEND_FAILED', details: err.message });
    }
  });

  return router;
}

module.exports = {
  createMediaRoutes,
};
