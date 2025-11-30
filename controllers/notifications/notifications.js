const db = require('../../configurations/sqlConfig/db');
const { safeQuery } = require('../../configurations/sqlConfig/db'); // your safe query wrapper
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps'); // Kenya timezone helper

async function handleDeceasedNotifications() {
  console.log({ message: '📢 Running notifications cron Jobs...' });

  try {
    // Fetch all deceased records (no time filter)
    const newDeceased = await safeQuery(`SELECT * FROM deceased`);
    console.log(`🧾 Found ${newDeceased.length} deceased record(s).`);

    for (const deceased of newDeceased) {
      const {
        deceased_id,
        full_name,
        date_of_birth,
        status,
        total_mortuary_charge,
      } = deceased;
      console.log(
        `⚰️ Processing deceased ID: ${deceased_id} - Name: ${full_name}`,
      );

      // Compose detailed base info string for messages
      const deceasedDetails = `Name: ${full_name}, DOB: ${date_of_birth || 'N/A'}, Status: ${status || 'N/A'}, Mortuary Charge: $${total_mortuary_charge || 0}`;

      // Register New Body Notification
      await insertNotification(
        deceased_id,
        'new_body',
        `New body registered: ID #${deceased_id}. Details: ${deceasedDetails}`,
      );

      // Check Autopsy Record
      const autopsy = await safeQuery(
        `SELECT * FROM postmortem WHERE deceased_id = ?`,
        [deceased_id],
      );
      if (autopsy.length > 0) {
        await insertNotification(
          deceased_id,
          'autopsy_done',
          `Autopsy completed for body ID #${deceased_id}. Details: ${deceasedDetails}`,
        );
      }

      // Check Dispatch Record
      const dispatch = await safeQuery(
        `SELECT * FROM vehicle_dispatch WHERE deceased_id = ?`,
        [deceased_id],
      );
      if (dispatch.length > 0) {
        const { dispatch_date } = dispatch[0];
        await insertNotification(
          deceased_id,
          'dispatch_created',
          `Dispatch date set for body ID #${deceased_id} - ${dispatch_date}. Details: ${deceasedDetails}`,
        );
        await insertNotification(
          deceased_id,
          'body_dispatched',
          `Body ID #${deceased_id} has been dispatched. Details: ${deceasedDetails}`,
        );
      }

      console.log(`---------------------------------------`);
    }

    // Notify balance for all deceased with status = 'Received'
    const receivedDeceased = await safeQuery(`
      SELECT deceased_id, full_name, total_mortuary_charge, date_of_birth, status
      FROM deceased
      WHERE status = 'Received'
    `);

    console.log(
      `💰 Found ${receivedDeceased.length} deceased body(ies) with status 'Received'`,
    );

    for (const person of receivedDeceased) {
      const {
        deceased_id,
        full_name,
        total_mortuary_charge,
        date_of_birth,
        status,
      } = person;
      const balanceMessage = `Balance for ${full_name} (ID #${deceased_id}): $${total_mortuary_charge} remaining in morgue charges. Details: Name: ${full_name}, DOB: ${date_of_birth || 'N/A'}, Status: ${status || 'N/A'}`;
      await insertNotification(deceased_id, 'balance_update', balanceMessage);
    }

    console.log('🎯 Notification cycle complete ✅');
  } catch (error) {
    console.error('❌ Error in notification handler:', error.message);
  }
}

async function insertNotification(deceased_id, type, message) {
  // Check existing notification of the same type for the deceased to avoid duplicates
  const existing = await safeQuery(
    `SELECT * FROM notifications WHERE deceased_id = ? AND type = ?`,
    [deceased_id, type],
  );

  if (existing.length > 0) {
    console.log(`⚠️ Skipped duplicate: ${type} - ID: ${deceased_id}`);
    return;
  }

  // Use your external Kenya timezone timestamp utility
  const formattedDate = getKenyaTimeISO();

  await safeQuery(
    `INSERT INTO notifications (deceased_id, type, message, created_at, is_read)
     VALUES (?, ?, ?, ?, ?)`,
    [deceased_id, type, message, formattedDate, 0],
  );

  console.log(`✅ Registered: ${type} - ID: ${deceased_id}`);
}

async function getAllNotifications(req, res) {
  try {
    const notifications = await safeQuery(`
      SELECT * FROM notifications
      ORDER BY created_at DESC
    `);

    res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  } catch (error) {
    console.error('❌ Failed to fetch notifications:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message,
    });
  }
}

module.exports = {
  getAllNotifications,
  handleDeceasedNotifications,
};
