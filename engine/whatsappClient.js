const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const gatewayState = require('./gatewayState');
const stateStore = require('../ops/stateStore');

let client;
let initializing = false;
let sessionDir;
let port;

function configure({ sessionDir: newSessionDir, port: newPort }) {
  sessionDir = newSessionDir;
  port = newPort;
}

function getClient() {
  return client;
}

function startClient() {
  if (initializing) return;
  initializing = true;
  gatewayState.setInitializing();

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionDir }),
    puppeteer: {
      executablePath: '/usr/bin/google-chrome',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-software-rasterizer',
        '--disable-accelerated-2d-canvas',
      ],
    },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 60000,
  });

  client.on('qr', (qr) => {
    console.log("📌 امسح رمز الـQR لتسجيل الدخول:");
    qrcode.generate(qr, { small: true });
    gatewayState.setQr(qr);
    stateStore.setQr(qr);
    stateStore.setStatus({
      status: 'qr',
      lastQrAt: new Date().toISOString(),
    });
  });

  client.on('authenticated', () => {
    console.log("🔐 تم تسجيل الدخول بنجاح!");
    gatewayState.setAuthenticated();
    stateStore.setStatus({
      status: 'authenticated',
      reason: null,
      lastErrorAt: null,
    });
  });
  client.on('ready', () => {
    console.log("✅ WhatsApp Client جاهز للعمل!");
    console.log(`🌍 API يعمل على http://0.0.0.0:${PORT}`);
    initializing = false;
    const phoneNumber = client?.info?.wid?.user || null;
    gatewayState.setReady(phoneNumber);
    stateStore.setStatus({
      status: 'ready',
      phone: phoneNumber,
      lastReadyAt: new Date().toISOString(),
      reason: null,
      lastErrorAt: null,
    });
  });

  client.on('auth_failure', async () => {
    gatewayState.setError('AUTH_FAILURE');
    stateStore.setStatus({
      status: 'error',
      lastErrorAt: new Date().toISOString(),
      reason: 'AUTH_FAILURE',
    });
    console.error("❌ فشل المصادقة، سيتم حذف الجلسة وإعادة التشغيل...");
    fs.rmSync(sessionDir, { recursive: true, force: true });
    setTimeout(startClient, 4000);
  });

  client.on('disconnected', (reason) => {
    gatewayState.setDisconnected(String(reason || 'UNKNOWN'));
    stateStore.setStatus({
      status: 'disconnected',
      lastDisconnectAt: new Date().toISOString(),
      reason: String(reason || 'UNKNOWN'),
    });
    console.warn(`⚠️ تم فقد الاتصال (${reason})، إعادة الاتصال بعد 5 ثوانٍ...`);
    setTimeout(startClient, 5000);
  });

  client.on('error', (err) => {
    gatewayState.setError(err?.message || String(err || 'UNKNOWN'));
    stateStore.setStatus({
      status: 'error',
      lastErrorAt: new Date().toISOString(),
      reason: err?.message || String(err || 'UNKNOWN'),
    });
    console.error("❗ حدث خطأ في WhatsApp Client:", err);
    setTimeout(startClient, 5000);
  });

  client.initialize().catch((e) => {
    gatewayState.setError(e?.message || String(e || 'UNKNOWN'));
    stateStore.setStatus({
      status: 'error',
      lastErrorAt: new Date().toISOString(),
      reason: e?.message || String(e || 'UNKNOWN'),
    });
    console.error("❌ فشل في تهيئة WhatsApp Client:", e);
    setTimeout(startClient, 5000);
  });
}

module.exports = {
  configure,
  getClient,
  startClient,
};
