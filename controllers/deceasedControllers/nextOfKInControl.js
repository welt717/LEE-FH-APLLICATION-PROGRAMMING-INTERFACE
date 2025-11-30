// controllers/nextOfKinController.js
const asyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');

// ----------------- WhatsApp Notification Helper -----------------
const createWhatsAppNotificationForKin = async (deceased_id, kin_id) => {
  // Check if notification already exists
  const exists = await safeQuery(
    `SELECT id FROM deceased_whatsapp_notifications WHERE deceased_id = ? AND next_of_kin_id = ?`,
    [deceased_id, kin_id],
  );

  if (!exists.length) {
    await safeQuery(
      `INSERT INTO deceased_whatsapp_notifications (deceased_id, next_of_kin_id, stage, sent)
       VALUES (?, ?, 'registration', FALSE)`, // <-- Changed 'initial' to 'registration'
      [deceased_id, kin_id],
    );
    console.log(`📩 WhatsApp notification queued for next-of-kin ${kin_id}`);
  }
};

// ----------------- Register Next of Kin -----------------
const nextOfKinRegister = asyncHandler(async (req, res) => {
  const { deceased_id, full_name, relationship, contact, email } = req.body;

  if (!deceased_id || !full_name || !relationship || !contact) {
    return res.status(400).json({
      message:
        'Fields deceased_id, full_name, relationship, and contact are required',
    });
  }

  try {
    const insertQuery = `
      INSERT INTO next_of_kin (deceased_id, full_name, relationship, contact, email, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const result = await safeQuery(insertQuery, [
      deceased_id,
      full_name,
      relationship,
      contact,
      email || null,
      getKenyaTimeISO(),
    ]);

    const kin_id = result.insertId;

    // Queue WhatsApp notification for this kin
    await createWhatsAppNotificationForKin(deceased_id, kin_id);

    res.status(201).json({
      message: 'Next of kin registered successfully',
      kin_id: kin_id,
    });
  } catch (error) {
    console.error('Error inserting next of kin:', error.message);
    res.status(500).json({
      message: 'Failed to register next of kin',
      error: error.message,
    });
  }
});

// ----------------- Fetch Next of Kin By Deceased ID -----------------
const getNextOfKinByDeceasedId = asyncHandler(async (req, res) => {
  const { deceased_id } = req.query;
  if (!deceased_id) {
    return res.status(400).json({ message: 'deceased_id is required' });
  }

  try {
    const rows = await safeQuery(
      `SELECT id, full_name, relationship, contact, email, created_at 
       FROM next_of_kin WHERE deceased_id = ?`,
      [deceased_id],
    );

    res.status(200).json({
      message: 'Next of kin fetched successfully',
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error('Error fetching next of kin:', error.message);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message,
    });
  }
});

module.exports = { nextOfKinRegister, getNextOfKinByDeceasedId };
