const moment = require('moment'); // for formatting date/time

const generateEmailHTML = ({
  kinName,
  deceasedName,
  updateTitle,
  updateMessage,
  mortuaryName = 'Sunrise Memorial Mortuary',
  managerName = 'Peter Mumo',
}) => {
  const currentDateTime = moment().format('dddd, MMMM Do YYYY [at] h:mm A');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
      <h2 style="color: #2c3e50;">${updateTitle}</h2>

      <p style="font-size: 16px; color: #333;">
        Dear <strong>${kinName}</strong>,
      </p>

      <p style="font-size: 15px; color: #333;">
        This is an automated update regarding your loved one,
        <strong>${deceasedName}</strong>.
      </p>

      <div style="background-color: #f4f6f8; padding: 15px; border-left: 4px solid #3498db; margin: 20px 0;">
        ${updateMessage}
      </div>

      <p style="font-size: 14px; color: #555;">
        Date & Time of Update: <strong>${currentDateTime}</strong>
      </p>

      <p style="font-size: 14px; color: #555; margin-top: 40px;">
        Kind regards,<br/>
        <strong>${managerName}</strong><br/>
        Manager, ${mortuaryName}
      </p>

      <hr style="margin: 30px 0;" />

      <p style="font-size: 12px; color: #999; text-align: center;">
        This is an automated message from ${mortuaryName}. Please do not reply directly to this email.
      </p>
    </div>
  `;
};
