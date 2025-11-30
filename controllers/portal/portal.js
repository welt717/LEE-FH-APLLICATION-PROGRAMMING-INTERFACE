const asyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');
const fs = require('fs');
const path = require('path');
// -----------------------------------
// Login / Portal Access
// -----------------------------------
const getPortalDeceasedById = asyncHandler(async (req, res) => {
  const { identifier } = req.body;

  if (!identifier) {
    return res.status(400).json({
      message: 'Identifier is required (phone number or admission number).',
    });
  }

  // Detect input type
  const isPhone = /^[0-9]{10,15}$/.test(identifier);
  const isAdm = /^[A-Z0-9-]{3,20}$/i.test(identifier);

  if (!isPhone && !isAdm) {
    return res.status(400).json({
      message: 'Use a valid phone number (10–15 digits) or admission number.',
    });
  }

  let deceased_id = null;
  let deceasedRows = [];

  // -------------------------------
  // 1️⃣ ADMISSION NUMBER LOGIN
  // -------------------------------
  if (isAdm) {
    deceased_id = identifier.toUpperCase();

    deceasedRows = await safeQuery(
      `SELECT d.*, p.status AS portal_status
       FROM deceased d
       LEFT JOIN portal_tracking p ON d.deceased_id = p.deceased_id
       WHERE d.deceased_id = ?`,
      [deceased_id],
    );
  }

  // -------------------------------
  // 2️⃣ PHONE NUMBER LOGIN (find most recent kin)
  // -------------------------------
  if (isPhone) {
    deceasedRows = await safeQuery(
      `SELECT d.*, p.status AS portal_status
       FROM deceased d
       LEFT JOIN portal_tracking p ON d.deceased_id = p.deceased_id
       WHERE EXISTS (
         SELECT 1 FROM next_of_kin k
         WHERE k.deceased_id = d.deceased_id
         AND k.contact = ?
       )
       ORDER BY d.date_admitted DESC
       LIMIT 1`,
      [identifier],
    );

    if (deceasedRows.length > 0) {
      deceased_id = deceasedRows[0].deceased_id;
    }
  }

  if (!deceasedRows.length) {
    return res.status(404).json({
      message: 'No deceased found matching this identifier.',
    });
  }

  const deceased = deceasedRows[0];

  // Block completed records
  if (deceased.portal_status === 'completed' || deceased.has_certificate) {
    return res.status(403).json({
      message: 'Access denied. This record is already completed.',
    });
  }

  // Limit concurrent logins to 2
  const activeSessions = await safeQuery(
    `SELECT COUNT(*) AS count FROM portal_sessions 
     WHERE deceased_id = ? AND active = TRUE`,
    [deceased_id],
  );

  if (activeSessions[0].count >= 2) {
    return res.status(403).json({
      message: 'Too many people are viewing this profile right now.',
    });
  }

  // -------------------------------
  //  Get MOST RECENT next-of-kin for display
  // -------------------------------
  const [kin] = await safeQuery(
    `SELECT full_name, relationship, contact
     FROM next_of_kin
     WHERE deceased_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [deceased_id],
  );

  // Register a session (no name needed)
  await safeQuery(
    `INSERT INTO portal_sessions (deceased_id, logged_in_at)
     VALUES (?, ?)`,
    [deceased_id, getKenyaTimeISO()],
  );

  // Fetch full deceased portal profile
  const rows = await safeQuery(
    `SELECT d.deceased_id, d.full_name AS deceased_name, d.date_of_death,
            d.cause_of_death, d.total_mortuary_charge, d.coffin_status,
            d.dispatch_date, d.date_admitted,
            TIMESTAMPDIFF(DAY, d.date_admitted, NOW()) AS days_in_morgue,
            p.status AS portal_status, p.remarks AS portal_remarks,
            a.findings AS autopsy_findings
     FROM deceased d
     LEFT JOIN portal_tracking p ON d.deceased_id = p.deceased_id
     LEFT JOIN postmortem a ON d.deceased_id = a.deceased_id
     WHERE d.deceased_id = ?
     LIMIT 1`,
    [deceased_id],
  );

  const rec = rows[0];
  const [mort] = await safeQuery(
    `SELECT name, phone, address FROM mortuaries LIMIT 1`,
  );

  // -------------------------------
  //  SEND PORTAL DATA
  // -------------------------------
  res.status(200).json({
    message: 'Access granted.',
    deceased: {
      deceased_id: rec.deceased_id,
      deceased_name: rec.deceased_name,
      date_of_death: rec.date_of_death,
      cause_of_death: rec.cause_of_death,
      total_mortuary_charge: rec.total_mortuary_charge,
      coffin_status: rec.coffin_status,
      date_admitted: rec.date_admitted,
      dispatch_date: rec.dispatch_date,
      days_in_morgue: rec.days_in_morgue,
      status: rec.portal_status || 'pending',
      remarks: rec.portal_remarks || null,
      kin: {
        full_name: kin?.full_name || 'Next-of-kin not recorded',
        relationship: kin?.relationship || null,
        contact: kin?.contact || identifier,
      },
      autopsy_findings: rec.autopsy_findings || 'N/A',
      mortuary: {
        name: mort?.name || 'N/A',
        phone: mort?.phone || 'N/A',
        address: mort?.address || 'N/A',
      },
    },
  });
});

// ------------------- Download Autopsy PDF -------------------
const downloadAutopsyPDF = asyncHandler(async (req, res) => {
  const { deceased_id, next_of_kin_name } = req.body;

  if (!deceased_id || !next_of_kin_name)
    return res.status(400).json({ message: 'Required fields missing' });

  const kinCheck = await safeQuery(
    `SELECT full_name FROM next_of_kin WHERE deceased_id = ? AND LOWER(full_name) = LOWER(?)`,
    [deceased_id, next_of_kin_name],
  );
  if (!kinCheck.length)
    return res.status(403).json({ message: 'Access denied' });

  const pdfPath = path.join(
    __dirname,
    `../../private/autopsy_reports/${deceased_id}.pdf`,
  );
  if (!fs.existsSync(pdfPath))
    return res.status(404).json({ message: 'Autopsy report not found' });

  res.download(pdfPath, `${deceased_id}_autopsy.pdf`);
});

// ------------------- Fetch Minister Records -------------------
const getMinisterDeceasedRecords = asyncHandler(async (req, res) => {
  const rows = await safeQuery(
    `SELECT d.deceased_id, d.full_name, d.date_of_death, d.cause_of_death, 
            p.status, p.remarks, d.created_at
     FROM deceased d
     LEFT JOIN portal_tracking p ON d.deceased_id = p.deceased_id
     WHERE (p.status IS NULL OR p.status != 'completed')
       AND (d.has_certificate IS NULL OR d.has_certificate = 0)
     ORDER BY d.created_at DESC`,
  );

  if (!rows.length)
    return res
      .status(404)
      .json({ message: 'No deceased records for ministers' });

  res.status(200).json({ count: rows.length, deceased: rows });
});

module.exports = {
  getPortalDeceasedById,
  downloadAutopsyPDF,
  getMinisterDeceasedRecords,
};
