const cron = require('node-cron');
const { scheduleBackups } = require('../controllers/backups/backup');
const {
  handleDeceasedNotifications,
} = require('../controllers/notifications/notifications');
const startEmailNotificationCron = require('../helpers/sendNotificationEmail');
const {
  sendDeceasedWhatsAppNotifications,
} = require('../controllers/updates/sendNotificationUpdates');
const { safeQuery } = require('../configurations/sqlConfig/db');
const { updateMortuaryCharges } = require('../helpers/aurtoChargeCalculations');

// ----------------- Real-Time Notification Polling -----------------
let lastNotificationTime = new Date(0);

async function logMainServerError(err, context) {
  console.error(`❌ [${context}] Error:`, err);
}

async function initializeLastNotificationTime() {
  try {
    const result = await safeQuery(
      `SELECT created_at FROM notifications ORDER BY created_at DESC LIMIT 1`,
    );
    if (result.length > 0)
      lastNotificationTime = new Date(result[0].created_at);
  } catch (err) {
    logMainServerError(err, 'Failed to initialize last notification time');
  }
}

async function pollNotifications(io) {
  try {
    const timestamp = lastNotificationTime
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');
    const newNotifications = await safeQuery(
      `SELECT * FROM notifications WHERE created_at > '${timestamp}' ORDER BY created_at ASC`,
    );
    if (newNotifications.length > 0) {
      lastNotificationTime = new Date(
        newNotifications[newNotifications.length - 1].created_at,
      );
      newNotifications.forEach((notification) => {
        if (io) {
          io.emit('notification', notification);
          console.log(
            '📢 Broadcasted notification:',
            notification.message || notification,
          );
        }
      });
    }
  } catch (err) {
    logMainServerError(err, 'Error polling notifications');
  }
}

// ----------------- Background Tasks -----------------
async function initBackgroundTasks(io) {
  try {
    await scheduleBackups();
  } catch (err) {
    logMainServerError(err, 'Backup scheduler failed');
  }
  try {
    await handleDeceasedNotifications();
  } catch (err) {
    logMainServerError(err, 'Deceased notifications failed');
  }
  try {
    if (typeof startEmailNotificationCron === 'function')
      startEmailNotificationCron();
  } catch (err) {
    logMainServerError(err, 'Email cron failed');
  }

  cron.schedule('0 0 * * *', async () => {
    console.log(
      'Running deceased WhatsApp notifications cron job:',
      new Date(),
    );
    try {
      await sendDeceasedWhatsAppNotifications();
    } catch (err) {
      logMainServerError(err, 'WhatsApp notification cron failed');
    }
  });

  await initializeLastNotificationTime();
  setInterval(() => pollNotifications(io), 5000);

  // ----------------- Cron for Mortuary Charges -----------------
  cron.schedule('*/5 * * * *', async () => {
    try {
      await updateMortuaryCharges();
    } catch (err) {
      logMainServerError(err, 'Mortuary charge cron failed');
      if (io) {
        io.emit('system_error', {
          message: 'Mortuary charge update failed',
          details: err.message,
        });
      }
    }
  });

  setTimeout(
    async () => {
      try {
        await updateMortuaryCharges();
      } catch (err) {
        logMainServerError(err, 'Initial mortuary charge update failed');
      }
    },
    15 * 60 * 1000,
  );
}

module.exports = { initBackgroundTasks };
