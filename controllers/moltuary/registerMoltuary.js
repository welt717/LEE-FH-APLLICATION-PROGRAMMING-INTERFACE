// controllers/deceasedControllers/deceasedControl.js
const asyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');

// Generate a unique mortuary ID
const generateMortuaryId = (name) => {
  const firstName = name.split(' ')[0].toUpperCase();
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${firstName}-${randomPart}`;
};

// ----------------- Register Mortuary -----------------
const registerMortuary = asyncHandler(async (req, res) => {
  const { name, branch, address, phone, hours } = req.body;

  if (!name || !branch || !address) {
    return res.status(400).json({
      message: 'Name, branch, and address are required',
    });
  }

  const mortuary_id = generateMortuaryId(name);
  const created_at = getKenyaTimeISO();
  const updated_at = created_at;

  const sql = `
    INSERT INTO mortuaries 
      (mortuary_id, name, branch, address, phone, hours, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    await safeQuery(sql, [
      mortuary_id,
      name,
      branch,
      address,
      phone ?? null,
      hours ?? null,
      created_at,
      updated_at,
    ]);

    return res.status(201).json({
      message: 'Mortuary registered successfully',
      data: {
        mortuary_id,
        name,
        branch,
        address,
        phone,
        hours,
        created_at,
        updated_at,
      },
    });
  } catch (err) {
    console.error('Error registering mortuary:', err.message);
    return res
      .status(500)
      .json({ message: 'Database error', error: err.message });
  }
});

// ----------------- Get All Mortuaries -----------------
const getMortuaryIds = asyncHandler(async (req, res) => {
  const sql = `
    SELECT mortuary_id, name, branch, address, phone, hours, created_at, updated_at
    FROM mortuaries
    ORDER BY created_at DESC
  `;

  try {
    const rows = await safeQuery(sql);
    return res.status(200).json({ count: rows.length, mortuaries: rows });
  } catch (err) {
    console.error('Error fetching mortuaries:', err.message);
    return res
      .status(500)
      .json({ message: 'Database error', error: err.message });
  }
});

// ----------------- Get Latest Mortuary -----------------
const getLatestMortuary = asyncHandler(async (req, res) => {
  const sql = `
    SELECT mortuary_id, name, branch, address, phone, hours, created_at, updated_at
    FROM mortuaries
    ORDER BY created_at DESC
    LIMIT 1
  `;

  try {
    const rows = await safeQuery(sql);
    if (!rows.length) {
      return res.status(404).json({ message: 'No mortuary found' });
    }
    return res.status(200).json({ mortuary: rows[0] });
  } catch (err) {
    console.error('Error fetching latest mortuary:', err.message);
    return res
      .status(500)
      .json({ message: 'Database error', error: err.message });
  }
});

module.exports = {
  registerMortuary,
  getMortuaryIds,
  getLatestMortuary,
};
