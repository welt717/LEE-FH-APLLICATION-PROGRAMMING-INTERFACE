import nodemailer from 'nodemailer';

export const sendNextOfKinEmail = async (nextOfKin, deceased) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"RestPoint Portal" <${process.env.EMAIL_USER}>`,
    to: nextOfKin.email,
    subject: `Access to RestPoint Portal for ${deceased.full_name}`,
    html: `
      <p>Hello ${nextOfKin.full_name},</p>
      <p>You have been linked to the deceased <b>${deceased.full_name}</b> in our system.</p>
      <p>You can now access the portal using your email: <b>${nextOfKin.email}</b></p>
      <p><a href="https://portal.restpoint.com/login">Go to Portal</a></p>
      <p>Regards,<br>RestPoint Team</p>
    `,
  };

  await transporter.sendMail(mailOptions);
};
