const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const { getClient } = require('./whatsappClient');
const { LOG_FILE } = require('../utils/logger');

async function sendMessage(req, res) {
  try {
    let { number, message } = req.body;
    if (!number || !message)
      return res.status(400).json({ error: "❗ Missing number or message" });

    if (!number.endsWith('@c.us')) number = number.replace(/\D/g, '') + '@c.us';
    await getClient().sendMessage(number, message);

    fs.appendFileSync(LOG_FILE, `💬 ${new Date().toISOString()} | ${number} | ${message}\n`);
    console.log(`💬 تم إرسال الرسالة إلى ${number}`);
    res.json({ success: true, message: "✅ Message sent successfully" });
  } catch (error) {
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

    fs.appendFileSync(LOG_FILE, `📎 ${new Date().toISOString()} | ${number} | File: ${filePath}\n`);
    res.json({ success: true, message: "✅ File sent successfully" });
  } catch (error) {
    console.error("❌ فشل إرسال الملف:", error.message);
    res.status(500).json({ error: "❌ فشل إرسال الملف", details: error.message });
  }
}

async function sendSmart(req, res) {
  try {
    const start = Date.now();
    let { number, message, data, filename, mimetype } = req.body;

    if (!number)
      return res.status(400).json({ error: "❗ رقم الجوال مفقود" });

    if (!number.endsWith('@c.us')) number = number.replace(/\D/g, '') + '@c.us';

    // ???? 1: ?? ???
    if (message && !data) {
      await getClient().sendMessage(number, message);
      fs.appendFileSync(LOG_FILE, `💬 ${new Date().toISOString()} | ${number} | ${message}\n`);
      console.log(`💬 تم إرسال نص فقط إلى ${number}`);
      return res.json({ success: true, message: "✅ نص أُرسل بنجاح" });
    }

    // ???? 2: ??? Base64 ?? ?? ???? ??
    if (data) {
      const ext = mimetype?.split("/")[1] || "pdf";
      const tempFile = path.join("/tmp", filename || `attachment.${ext}`);
      const buffer = Buffer.from(data, "base64");
      fs.writeFileSync(tempFile, buffer);

      const media = MessageMedia.fromFilePath(tempFile);
      await getClient().sendMessage(number, media, { caption: message || "" });

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      fs.appendFileSync(
        LOG_FILE,
        `📎 ${new Date().toISOString()} | ${number} | File: ${filename || 'attachment'} | Size: ${(buffer.length / 1024 / 1024).toFixed(2)}MB | Time: ${duration}s\n`
      );

      fs.unlinkSync(tempFile);
      console.log(`📎 أُرسل مرفق (${ext}) إلى ${number} خلال ${duration}s`);
      return res.json({ success: true, message: "✅ تم إرسال المرفق بنجاح" });
    }

    // ?? ???? ?? ??? ???
    return res.status(400).json({ error: "❗ رقم الجوال مفقود" });
  } catch (error) {
    console.error("❌ فشل الإرسال الذكي:", error);
    res.status(500).json({ error: "❌ فشل الإرسال الذكي", details: error.message });
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
      fs.appendFileSync(LOG_FILE, `📢 ${new Date().toISOString()} | ${chatId} | ${message}\n`);
    }

    res.json({ success: true, message: "✅ Broadcast sent to all recipients" });
  } catch (error) {
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
