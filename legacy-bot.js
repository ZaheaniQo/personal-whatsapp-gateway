/******************************************************************************************
 * 🤖 WhatsApp Automation Bot — Professional Edition
 * 👨‍💻 Developer: Dr. Yasser Al-Zahrani
 * 🧠 Environment: Ubuntu Server + Node.js + PM2 + Chrome Headless
 * ⚙️ Features: Auto-Reconnect, Smart Routing, Base64 Support, Logs, Error Resilience
 ******************************************************************************************/

// =============== 🛡️ Global Error Protection ===============
process.on('uncaughtException', (err) => console.error('🚨 Uncaught Exception:', err));
process.on('unhandledRejection', (err) => console.error('🚨 Unhandled Rejection:', err));

// =============== 📦 Dependencies ===============
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');

const app = express();
app.use(bodyParser.json({ limit: '100mb' })); // رفع الحد للملفات الكبيرة

const PORT = 4000;
const SESSION_DIR = path.join(__dirname, '.wwebjs_auth');
const LOG_FILE = path.join(__dirname, 'send_log.txt');

// =============== 🧹 Maintenance Tasks ===============
schedule.scheduleJob('0 3 1 * *', () => {
  fs.truncate(LOG_FILE, 0, () => {});
  console.log('🧹 تم تفريغ سجل الإرسال الشهري');
});

// =============== 🤖 WhatsApp Client Setup ===============
let client;
let initializing = false;

function startClient() {
  if (initializing) return;
  initializing = true;

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
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
    console.log('📌 امسح رمز الـQR لتسجيل الدخول:');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => console.log('🔐 تم تسجيل الدخول بنجاح!'));
  client.on('ready', () => {
    console.log('✅ WhatsApp Client جاهز للعمل!');
    console.log(`🌍 API يعمل على http://0.0.0.0:${PORT}`);
    initializing = false;
  });

  client.on('auth_failure', async () => {
    console.error('❌ فشل المصادقة، سيتم حذف الجلسة وإعادة التشغيل...');
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    setTimeout(startClient, 4000);
  });

  client.on('disconnected', (reason) => {
    console.warn(`⚠️ تم فقد الاتصال (${reason})، إعادة الاتصال بعد 5 ثوانٍ...`);
    setTimeout(startClient, 5000);
  });

  client.on('error', (err) => {
    console.error('❗ حدث خطأ في WhatsApp Client:', err);
    setTimeout(startClient, 5000);
  });

  client.initialize().catch((e) => {
    console.error('❌ فشل في تهيئة WhatsApp Client:', e);
    setTimeout(startClient, 5000);
  });
}

// =============== 🌐 REST API Endpoints ===============

// 🔹 فحص الحالة
app.get('/', (_, res) => res.send('✅ WhatsApp Bot API is running.'));

// 🔹 إرسال رسالة نصية
app.post('/sendMessage', async (req, res) => {
  try {
    let { number, message } = req.body;
    if (!number || !message)
      return res.status(400).json({ error: '❗ Missing number or message' });

    if (!number.endsWith('@c.us')) number = number.replace(/\D/g, '') + '@c.us';
    await client.sendMessage(number, message);

    fs.appendFileSync(LOG_FILE, `💬 ${new Date().toISOString()} | ${number} | ${message}\n`);
    console.log(`💬 تم إرسال الرسالة إلى ${number}`);
    res.json({ success: true, message: '✅ Message sent successfully' });
  } catch (error) {
    console.error('❌ فشل الإرسال:', error.message);
    res.status(500).json({ error: '❌ فشل إرسال الرسالة', details: error.message });
  }
});

// 🔹 إرسال ملف من السيرفر
app.post('/sendFile', async (req, res) => {
  try {
    let { number, filePath, caption } = req.body;
    if (!number || !filePath)
      return res.status(400).json({ error: '❗ Missing number or filePath' });

    if (!number.endsWith('@c.us')) number = number.replace(/\D/g, '') + '@c.us';
    const media = MessageMedia.fromFilePath(filePath);
    await client.sendMessage(number, media, { caption: caption || '' });

    fs.appendFileSync(LOG_FILE, `📎 ${new Date().toISOString()} | ${number} | File: ${filePath}\n`);
    res.json({ success: true, message: '✅ File sent successfully' });
  } catch (error) {
    console.error('❌ فشل إرسال الملف:', error.message);
    res.status(500).json({ error: '❌ فشل إرسال الملف', details: error.message });
  }
});

// 🔹 الإرسال الذكي — يدعم النصوص + Base64 + وسائط
app.post('/sendSmart', async (req, res) => {
  try {
    const start = Date.now();
    let { number, message, data, filename, mimetype } = req.body;

    if (!number)
      return res.status(400).json({ error: '❗ رقم الجوال مفقود' });

    if (!number.endsWith('@c.us')) number = number.replace(/\D/g, '') + '@c.us';

    // الحالة 1: نص فقط
    if (message && !data) {
      await client.sendMessage(number, message);
      fs.appendFileSync(LOG_FILE, `💬 ${new Date().toISOString()} | ${number} | ${message}\n`);
      console.log(`💬 تم إرسال نص فقط إلى ${number}`);
      return res.json({ success: true, message: '✅ نص أُرسل بنجاح' });
    }

    // الحالة 2: مرفق Base64 مع أو بدون نص
    if (data) {
      const ext = mimetype?.split('/')[1] || 'pdf';
      const tempFile = path.join('/tmp', filename || `attachment.${ext}`);
      const buffer = Buffer.from(data, 'base64');
      fs.writeFileSync(tempFile, buffer);

      const media = MessageMedia.fromFilePath(tempFile);
      await client.sendMessage(number, media, { caption: message || '' });

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      fs.appendFileSync(
        LOG_FILE,
        `📎 ${new Date().toISOString()} | ${number} | File: ${filename || 'attachment'} | Size: ${(buffer.length / 1024 / 1024).toFixed(2)}MB | Time: ${duration}s\n`
      );

      fs.unlinkSync(tempFile);
      console.log(`📎 أُرسل مرفق (${ext}) إلى ${number} خلال ${duration}s`);
      return res.json({ success: true, message: '✅ تم إرسال المرفق بنجاح' });
    }

    // لا نص ولا مرفق
    return res.status(400).json({ error: '❗ لا توجد بيانات للإرسال' });
  } catch (error) {
    console.error('❌ فشل الإرسال الذكي:', error);
    res.status(500).json({ error: '❌ فشل الإرسال الذكي', details: error.message });
  }
});

// 🔹 إرسال جماعي
app.post('/broadcast', async (req, res) => {
  try {
    const { numbers, message } = req.body;
    if (!Array.isArray(numbers) || !message)
      return res.status(400).json({ error: '❗ Missing numbers array or message' });

    for (let num of numbers) {
      const chatId = num.endsWith('@c.us') ? num : num.replace(/\D/g, '') + '@c.us';
      await client.sendMessage(chatId, message);
      fs.appendFileSync(LOG_FILE, `📢 ${new Date().toISOString()} | ${chatId} | ${message}\n`);
    }

    res.json({ success: true, message: '✅ Broadcast sent to all recipients' });
  } catch (error) {
    console.error('❌ فشل الإرسال الجماعي:', error.message);
    res.status(500).json({ error: '❌ فشل الإرسال الجماعي', details: error.message });
  }
});

// =============== 🚀 Start Server & Client ===============
app.listen(PORT, () => console.log(`🌐 API يعمل على المنفذ ${PORT}`));
startClient();
