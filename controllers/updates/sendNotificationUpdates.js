// controllers/notifications/deceasedWhatsAppNotifications.js
const asyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { sendWhatsAppNotification } = require('../../utilities/watsApp/send');
const { generateMessage } = require('../../utilities/openAi/generateMessage');

const sendDeceasedWhatsAppNotifications = asyncHandler(async () => {
  // Fetch pending notifications
  const pendingNotifications = await safeQuery(`
    SELECT dn.id, dn.stage, d.full_name AS deceased_name, d.cause_of_death,
           nk.full_name AS kin_name, nk.contact, nk.relationship AS kin_relationship
    FROM deceased_whatsapp_notifications dn
    JOIN deceased d ON dn.deceased_id = d.deceased_id
    JOIN next_of_kin nk ON dn.next_of_kin_id = nk.id
    LEFT JOIN burial_notifications bn ON bn.deceased_id = d.deceased_id
    WHERE dn.sent = FALSE
  `);

  for (const notif of pendingNotifications) {
    try {
      // Since mortuary_id is not available, just pass a default value or fetch differently if needed
      const mortuaryInfo = 'the mortuary';

      // Generate empathetic, personalized message
      const message = await generateMessage({
        stage: notif.stage,
        deceased: notif.deceased_name,
        kin: notif.kin_name,
        kinRelationship: notif.kin_relationship,
        causeOfDeath: notif.cause_of_death || 'unspecified',
        mortuary: mortuaryInfo,
      });

      // Send WhatsApp message
      await sendWhatsAppNotification(notif.contact, message);

      // Mark notification as sent
      await safeQuery(
        `UPDATE deceased_whatsapp_notifications SET sent = TRUE WHERE id = ?`,
        [notif.id],
      );

      console.log(
        `WhatsApp notification sent for stage "${notif.stage}" to ${notif.kin_name}`,
      );
    } catch (error) {
      console.error(
        `Failed to send WhatsApp message to ${notif.kin_name}:`,
        error.message,
      );
    }
  }
});

module.exports = { sendDeceasedWhatsAppNotifications };
