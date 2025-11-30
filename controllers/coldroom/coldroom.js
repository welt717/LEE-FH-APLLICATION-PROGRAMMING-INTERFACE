const asyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');

// Assign a cold room to a deceased
const assignColdRoom = asyncHandler(async (req, res) => {
  const { deceased_id, cold_room_number, tray_number } = req.body;

  // Validate required fields
  if (!deceased_id || !cold_room_number || !tray_number) {
    return res
      .status(400)
      .json({
        error: 'deceased_id, cold_room_number, and tray_number are required.',
      });
  }

  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Start transaction
    await safeQuery('START TRANSACTION');

    // 1️⃣ Insert / update cold room assignment
    // Assuming table `cold_room_assignments` exists with columns:
    // id (auto), deceased_id, cold_room_number, tray_number, date_assigned
    const upsertSql = `
      INSERT INTO cold_room_assignments (deceased_id, cold_room_number, tray_number, date_assigned)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        cold_room_number = VALUES(cold_room_number),
        tray_number = VALUES(tray_number),
        date_assigned = VALUES(date_assigned)
    `;
    await safeQuery(upsertSql, [
      deceased_id,
      cold_room_number,
      tray_number,
      now,
    ]);

    // 2️⃣ Update deceased status to "UnderCare"
    await safeQuery(
      `UPDATE deceased SET status = ?, updated_at = ? WHERE deceased_id = ?`,
      ['UnderCare', now, deceased_id],
    );

    // Commit transaction
    await safeQuery('COMMIT');

    res.status(200).json({
      message: `Cold room assigned successfully to deceased ${deceased_id} and status set to UnderCare.`,
      data: { deceased_id, cold_room_number, tray_number, date_assigned: now },
    });
  } catch (err) {
    // Rollback transaction on error
    await safeQuery('ROLLBACK');
    console.error('[COLD ROOM] Error assigning cold room:', err.message, err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

module.exports = {
  assignColdRoom,
};
