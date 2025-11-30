// helpers/sendEmail.js
const nodemailer = require('nodemailer');
require('dotenv').config(); // Ensure .env is loaded

const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // SSL
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"RestPoint Mortuary" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });

    console.log(`✅ Email sent to: ${to} | Message ID: ${info.messageId}`);
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
  }
};

module.exports = sendEmail;
