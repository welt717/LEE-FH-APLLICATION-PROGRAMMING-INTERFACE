// cron/sendNotificationsEmail.js
const cron = require('node-cron');
const sendEmail = require('./sendMail');

const sendNotificationEmail = async () => {
  const subject = '🕊️ Mortuary Notification - Daily Update';
  const html = `
  <div style="font-family: Arial, sans-serif; color: #333;">
    <h2 style="color: #004aad;">Mortuary Services Notification</h2>
    <p>Dear Next of Kin,</p>
    <p>We would like to update you on the status of the mortuary services related to your loved one.</p>
    <div style="background:#f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color:#007bff;">Notification Details:</h3>
      <ul>
        <li><strong>Body Status:</strong> Received</li>
        <li><strong>Mortuary Charges:</strong> $250</li>
        <li><strong>Next Steps:</strong> Await further updates regarding dispatch and autopsy results.</li>
      </ul>
    </div>
    <p>If you have any questions, please contact us at <a href="mailto:support@mortuaryservices.com">support@mortuaryservices.com</a>.</p>
    <p style="font-style: italic; color: #666;">Thank you for your trust.</p>
    <footer style="margin-top: 30px; font-size: 12px; color: #999;">Mortuary Services &copy; 2025</footer>
  </div>
  `;

  await sendEmail({
    to: 'infowelttallis@gmail.com',
    subject,
    text: 'Mortuary Services Notification - Daily Update',
    html,
  });
};

// Schedule: run every day at 8 AM server time
cron.schedule('0 8 * * *', () => {
  console.log(
    `[${new Date().toISOString()}] ⏰ Sending daily notification email...`,
  );
  sendNotificationEmail();
});

module.exports = sendNotificationEmail;
