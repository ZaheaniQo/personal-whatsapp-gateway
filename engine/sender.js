const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const { getClient } = require('./whatsappClient');
const { LOG_FILE } = require('../utils/logger');
const stateStore = require('../ops/stateStore');

function appendOpsLog(entry) {
  try {
    stateStore.appendLog(entry);
  } catch (err) {
    // Best-effort logging; do not impact send behavior.
  }
}

async function sendMessage(req, res) {
  try {
    let { number, message } = req.body;
    if (!number || !message)
      return res.status(400).json({ error: "❗ Missing number or message" });

    if (!number.endsWith('@c.us')) number = number.replace(/\D/g, '') + '@c.us';
    await getClient().sendMessage(number, message);
    appendOpsLog({
      ts: Date.now(),
      type: 'send',
      to: number,
      textPreview: message,
      hasMedia: false,
      result: 'success',
    });

    fs.appendFileSync(LOG_FILE, `💬 ${new Date().toISOString()} | ${number} | ${message}\n`);
    console.log(`💬 تم إرسال الرسالة إلى ${number}`);
    res.json({ success: true, message: "✅ Message sent successfully" });
  } catch (error) {
    appendOpsLog({
      ts: Date.now(),
      type: 'error',
      to: req?.body?.number || null,
      textPreview: req?.body?.message || null,
      hasMedia: false,
      result: 'error',
      error: error.message,
    });
    console.error("❌ فشل الإرسال:", error.message);
    res.status(500).json({ error: "❌ فشل إرسال الرسالة", details: error.message });
  }
}

async function sendFile(req, res) {
  try {
    let { number, filePath, caption } = req.body;
    if (!number || !filePath)
      return res.status(400).json({ error: "❗ Missing number or filePath" });

    if (!number.endsWith('@c.us')) number = number.replace(/\D/g, '') + '@c.us';
    const media = MessageMedia.fromFilePath(filePath);
    await getClient().sendMessage(number, media, { caption: caption || '' });
    let fileSizeBytes = null;
    try {
      fileSizeBytes = fs.statSync(filePath).size;
    } catch (err) {
      fileSizeBytes = null;
    }
    appendOpsLog({
      ts: Date.now(),
      type: 'send',
      to: number,
      textPreview: caption || filePath,
      hasMedia: true,
      mediaType: media.mimetype || null,
      sizeBytes: fileSizeBytes,
      result: 'success',
    });

    fs.appendFileSync(LOG_FILE, `📎 ${new Date().toISOString()} | ${number} | File: ${filePath}\n`);
    res.json({ success: true, message: "✅ File sent successfully" });
  } catch (error) {
    appendOpsLog({
      ts: Date.now(),
      type: 'error',
      to: req?.body?.number || null,
      textPreview: req?.body?.caption || req?.body?.filePath || null,
      hasMedia: true,
      mediaType: null,
      sizeBytes: null,
      result: 'error',
      error: error.message,
    });
    console.error("❌ فشل إرسال الملف:", error.message);
    res.status(500).json({ error: "❌ فشل إرسال الملف", details: error.message });
  }
}

async function sendSmart(req, res) {
  try {
    const start = Date.now();
    let { number, message, data, filename, mimetype } = req.body;

    if (!number) {
      return res.status(400).json({ error: "┐?? رقم الهاتف مطلوب" });
    }

    if (!number.endsWith('@c.us')) number = number.replace(/\D/g, '') + '@c.us';

    const hasMessage = typeof message === 'string' && message.trim() !== '';
    const hasData = typeof data === 'string' && data.trim() !== '';
    const hasMimetype = typeof mimetype === 'string' && mimetype.trim() !== '';

    if (hasData && !hasMimetype) {
      return res.status(400).json({ error: "┐?? نوع الملف مطلوب عند ارسال بيانات" });
    }

    if (!hasMessage && !hasData) {
      return res.status(400).json({ error: "┐?? لا يوجد محتوى صالح للإرسال" });
    }

    if (hasData) {
      const media = new MessageMedia(mimetype, data, filename);
      await getClient().sendMessage(number, media, { caption: hasMessage ? message : "" });
      appendOpsLog({
        ts: Date.now(),
        type: 'send',
        to: number,
        textPreview: message || filename || null,
        hasMedia: true,
        mediaType: mimetype || null,
        sizeBytes: null,
        result: 'success',
      });

      const tookMs = Date.now() - start;
      fs.appendFileSync(
        LOG_FILE,
        `Я??? ${new Date().toISOString()} | ${number} | Media: ${mimetype}${filename ? ` | ${filename}` : ''} | ${tookMs}ms\n`
      );
      console.log(`Я??? Media sent to ${number} in ${tookMs}ms`);
      return res.json({ success: true, type: "media", mimetype, tookMs });
    }

    await getClient().sendMessage(number, message);
    appendOpsLog({
      ts: Date.now(),
      type: 'send',
      to: number,
      textPreview: message,
      hasMedia: false,
      result: 'success',
    });
    const tookMs = Date.now() - start;
    fs.appendFileSync(LOG_FILE, `Я??? ${new Date().toISOString()} | ${number} | ${message}\n`);
    console.log(`Я??? Text sent to ${number} in ${tookMs}ms`);
    return res.json({ success: true, type: "text", tookMs });
  } catch (error) {
    appendOpsLog({
      ts: Date.now(),
      type: 'error',
      to: req?.body?.number || null,
      textPreview: req?.body?.message || req?.body?.filename || null,
      hasMedia: Boolean(req?.body?.data),
      mediaType: req?.body?.mimetype || null,
      sizeBytes: null,
      result: 'error',
      error: error.message,
    });
    console.error("┐?? Б?А?Б? А?Б?А?А?А?А?Б? А?Б?АЬБ?Б?:", error);
    res.status(500).json({ error: "┐?? حدث خطأ أثناء إرسال الرسالة", details: error.message });
  }
}

async function broadcast(req, res) {
  try {
    const { numbers, message } = req.body;
    if (!Array.isArray(numbers) || !message)
      return res.status(400).json({ error: "❗ Missing numbers array or message" });

    for (let num of numbers) {
      const chatId = num.endsWith('@c.us') ? num : num.replace(/\D/g, '') + '@c.us';
      await getClient().sendMessage(chatId, message);
      appendOpsLog({
        ts: Date.now(),
        type: 'send',
        to: chatId,
        textPreview: message,
        hasMedia: false,
        result: 'success',
      });
      fs.appendFileSync(LOG_FILE, `📢 ${new Date().toISOString()} | ${chatId} | ${message}\n`);
    }

    res.json({ success: true, message: "✅ Broadcast sent to all recipients" });
  } catch (error) {
    appendOpsLog({
      ts: Date.now(),
      type: 'error',
      to: null,
      textPreview: req?.body?.message || null,
      hasMedia: false,
      result: 'error',
      error: error.message,
    });
    console.error("❌ فشل الإرسال الجماعي:", error.message);
    res.status(500).json({ error: "❌ فشل الإرسال الجماعي", details: error.message });
  }
}

module.exports = {
  sendMessage,
  sendFile,
  sendSmart,
  broadcast,
};
