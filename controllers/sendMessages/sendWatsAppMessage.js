const fs = require('fs');
const axios = require('axios');

async function sendWhatsAppMessage(phone, pdfPath, invoice, deceased) {
  try {
    // Read PDF from disk
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');

    const payload = {
      phone,
      filename: `Invoice-${invoice.invoice_number}.pdf`,
      mimeType: 'application/pdf',
      file: pdfBase64,
      caption: `Invoice for ${deceased.full_name}: KES ${invoice.amount}`,
    };

    const response = await axios.post(
      process.env.WHATSAPP_GATEWAY_URL,
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data;
  } catch (err) {
    console.error(
      'WhatsApp sending failed:',
      err.response ? err.response.data : err.message,
    );
    throw new Error(
      err.response ? JSON.stringify(err.response.data) : err.message,
    );
  }
}

module.exports = { sendWhatsAppMessage };
