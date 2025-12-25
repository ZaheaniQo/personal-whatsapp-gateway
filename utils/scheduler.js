const schedule = require('node-schedule');
const fs = require('fs');

function startScheduler(logFile) {
  schedule.scheduleJob('0 3 1 * *', () => {
    fs.truncate(logFile, 0, () => {});
    console.log("🧹 تم تفريغ سجل الإرسال الشهري");
  });
}

module.exports = {
  startScheduler,
};
