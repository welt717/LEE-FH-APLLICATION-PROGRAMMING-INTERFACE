const cron = require('node-cron');
const updateMortuaryCharges = require('./helpers/aurtoChargeCalculations');

// 🟢 Confirm model load
console.log('✅ Mortuary charge scheduler initialized.');

// ⏱ Schedule job to run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  const timestamp = new Date().toISOString();
  console.log(`🕔 [${timestamp}] Running mortuary charges update...`);

  try {
    await updateMortuaryCharges();
    console.log(
      `✅ [${timestamp}] Mortuary charges update completed successfully.`,
    );
  } catch (err) {
    console.error(
      `❌ [${timestamp}] Failed to update mortuary charges:`,
      err.message,
    );
  }
});
