// utilities/whatsapp.js
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const sandboxNumber = 'whatsapp:+14155238886'; // Twilio sandbox

const client = twilio(accountSid, authToken);

async function sendWhatsAppNotification(to, message) {
  try {
    const msg = await client.messages.create({
      from: sandboxNumber,
      to: `whatsapp:${to}`,
      body: message,
    });
    console.log('📩 WhatsApp message sent (sandbox):', msg.sid);
    return msg;
  } catch (err) {
    console.error('Twilio WhatsApp error:', err.message);
    throw err;
  }
}

module.exports = { sendWhatsAppNotification };
