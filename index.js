// =============== Global Error Protection ===============
process.on('uncaughtException', (err) => console.error("🚨 Uncaught Exception:", err));
process.on('unhandledRejection', (err) => console.error("🚨 Unhandled Rejection:", err));

const path = require('path');
const { createServer } = require('./api/server');
const { startScheduler } = require('./utils/scheduler');
const { LOG_FILE } = require('./utils/logger');
const whatsappClient = require('./engine/whatsappClient');

const PORT = 4000;
const SESSION_DIR = path.join('/data', '.wwebjs_auth');

// =============== Maintenance Tasks ===============
startScheduler(LOG_FILE);

// =============== WhatsApp Client Setup ===============
whatsappClient.configure({ sessionDir: SESSION_DIR, port: PORT });

// =============== Start Server & Client ===============
const app = createServer();
app.listen(PORT, () => console.log(`🌐 API يعمل على المنفذ ${PORT}`));
whatsappClient.startClient();
