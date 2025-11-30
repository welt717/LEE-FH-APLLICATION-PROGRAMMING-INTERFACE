// controllers/burialNotificationController.js
const asyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');

// Generate unique notification number
function generateNotificationNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomDigits = Math.floor(1000 + Math.random() * 9000);
  return `BN-${date}-${randomDigits}`;
}

// ----------------- Generate or Fetch Detailed Burial Notification -----------------
const handleBurialNotification = asyncHandler(async (req, res) => {
  const { deceased_id } = req.query;
  if (!deceased_id)
    return res
      .status(400)
      .json({ message: 'deceased_id query parameter is required' });

  // Fetch deceased info
  const deceasedRows = await safeQuery(
    `SELECT * FROM deceased WHERE deceased_id = ?`,
    [deceased_id],
  );
  if (!deceasedRows.length)
    return res.status(404).json({ message: 'Deceased not found' });
  const deceased = deceasedRows[0];

  // Fetch the single mortuary details
  const mortuariesRows = await safeQuery(
    `SELECT mortuary_id, name, address, phone, hours FROM mortuaries LIMIT 1`,
  );
  const mortuaryDetails = mortuariesRows.length
    ? mortuariesRows[0]
    : {
        mortuary_id: 'UNKNOWN',
        name: 'Unknown',
        address: 'Unknown',
        phone: 'Unknown',
        hours: 'Unknown',
      };

  // Check if burial notification already exists
  let notificationRows = await safeQuery(
    `SELECT * FROM burial_notifications WHERE deceased_id = ? LIMIT 1`,
    [deceased_id],
  );

  // Generate notification if it doesn't exist
  if (!notificationRows.length) {
    const notification_number = generateNotificationNumber();
    const issued_at = getKenyaTimeISO();
    const result = await safeQuery(
      `INSERT INTO burial_notifications (deceased_id, notification_number, issued_at) VALUES (?, ?, ?)`,
      [deceased_id, notification_number, issued_at],
    );
    notificationRows = await safeQuery(
      `SELECT * FROM burial_notifications WHERE id = ?`,
      [result.insertId],
    );
  }

  const bn = notificationRows[0];

  // Fetch all next-of-kin for this deceased
  const nextOfKinRows = await safeQuery(
    `SELECT full_name, relationship, contact, email FROM next_of_kin WHERE deceased_id = ?`,
    [deceased_id],
  );

  // Format response with full mortuary details
  const data = {
    notification_number: bn.notification_number,
    issued_at: bn.issued_at,
    status: bn.status,
    deceased: {
      full_name: deceased.full_name,
      gender: deceased.gender,
      date_of_birth: deceased.date_of_birth,
      date_of_death: deceased.date_of_death,
      cause_of_death: deceased.cause_of_death,
      place_of_death: deceased.place_of_death,
      county: deceased.county,
      location: deceased.location,
      admission_number: deceased.admission_number,
      date_admitted: deceased.date_admitted,
      date_registered: deceased.date_registered,
      mortuary: mortuaryDetails,
    },
    next_of_kin: nextOfKinRows.length ? nextOfKinRows : [],
  };

  res.status(200).json({
    message: 'Burial notification generated/fetched successfully',
    data,
  });
});

module.exports = { handleBurialNotification };
