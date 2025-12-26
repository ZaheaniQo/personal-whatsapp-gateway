const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { MessageMedia } = require('whatsapp-web.js');
const { getClient } = require('../engine/whatsappClient');

function getUploadRoot() {
  if (process.env.UPLOAD_DIR) {
    return process.env.UPLOAD_DIR;
  }
  const preferred = path.join(path.sep, 'data', 'uploads');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch (err) {
    const fallback = path.join(__dirname, '..', 'data', 'uploads');
    ensureDir(fallback);
    return fallback;
  }
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function safeFileName(name) {
  const base = path.basename(name || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || 'file';
}

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function buildStoredPath(originalName) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const filename = `${randomId()}_${safeFileName(originalName)}`;
  return {
    subdir: month,
    filename,
  };
}

function resolveStoredPath(fileIdOrPath) {
  const uploadRoot = path.resolve(getUploadRoot());
  const resolved = path.resolve(uploadRoot, fileIdOrPath);
  if (resolved !== uploadRoot && !resolved.startsWith(uploadRoot + path.sep)) {
    return null;
  }
  return resolved;
}

function maxUploadBytes() {
  const mb = Number.parseInt(process.env.MAX_UPLOAD_MB, 10);
  return (Number.isFinite(mb) ? mb : 20) * 1024 * 1024;
}

function maxUrlBytes() {
  const mb = Number.parseInt(process.env.URL_MAX_MB, 10);
  return (Number.isFinite(mb) ? mb : 20) * 1024 * 1024;
}

function allowUrlDownloads() {
  return String(process.env.ALLOW_URL_DOWNLOADS || '').toLowerCase() === 'true';
}

function downloadToTemp(url, instanceId = 'default') {
  const uploadRoot = path.resolve(getUploadRoot());
  const tempDir = path.join(uploadRoot, 'tmp');
  ensureDir(tempDir);

  const tempName = `${randomId()}_download`;
  const tempPath = path.join(tempDir, tempName);
  const limit = maxUrlBytes();

  return new Promise((resolve, reject) => {
    const client = url.startsWith('https://') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`Download failed with status ${res.statusCode}`));
      }

      const contentLength = Number.parseInt(res.headers['content-length'] || '0', 10);
      if (contentLength && contentLength > limit) {
        res.resume();
        return reject(new Error('URL payload exceeds size limit'));
      }

      const file = fs.createWriteStream(tempPath);
      let received = 0;

      res.on('data', (chunk) => {
        received += chunk.length;
        if (received > limit) {
          req.destroy();
          file.destroy();
          fs.rmSync(tempPath, { force: true });
          reject(new Error('URL payload exceeds size limit'));
        }
      });

      res.pipe(file);
      file.on('finish', () => {
        resolve({
          path: tempPath,
          sizeBytes: received,
          mimetype: res.headers['content-type'] || null,
        });
      });
      file.on('error', (err) => {
        reject(err);
      });
    });

    req.on('error', reject);
  });
}

async function sendMediaFromPath({ number, filePath, caption, instanceId = 'default' }) {
  const media = MessageMedia.fromFilePath(filePath);
  await getClient().sendMessage(number, media, { caption: caption || '' });
  let sizeBytes = null;
  try {
    sizeBytes = fs.statSync(filePath).size;
  } catch (err) {
    sizeBytes = null;
  }
  return {
    mediaType: media.mimetype || null,
    sizeBytes,
  };
}

module.exports = {
  getUploadRoot,
  ensureDir,
  safeFileName,
  buildStoredPath,
  resolveStoredPath,
  maxUploadBytes,
  maxUrlBytes,
  allowUrlDownloads,
  downloadToTemp,
  sendMediaFromPath,
};
