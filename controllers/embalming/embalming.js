const asyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ======================== Error Logger ========================
const errorLogPath = path.join(__dirname, '../../logs/error.log');
function logError(err) {
  const logEntry = `[${new Date().toISOString()}] ${err.stack || err}\n`;
  fs.appendFile(errorLogPath, logEntry, (e) => {
    if (e) console.error('Failed to write error log:', e);
  });
}

// Helper: generate short embalming UID (e.g. EMB-4G8Z91)
function generateEmbalmingUID() {
  const shortCode = uuidv4().split('-')[0].toUpperCase();
  return `EMB-${shortCode}`;
}

/* ===========================================================
   REGISTER NEW EMBALMING RECORD
=========================================================== */

const registerEmbalming = asyncHandler(async (req, res) => {
  const {
    deceased_id,
    embalmed_by,
    branch_id,
    height_cm,
    weight_kg,
    embalming_cost,
    start_time,
    end_time,
    notes,
    chemicalUsage = [],
    created_at,
    updated_at,
  } = req.body;

  if (!deceased_id || !embalmed_by || !branch_id) {
    return res.status(400).json({
      success: false,
      message:
        'Missing required fields: deceased_id, embalmed_by, or branch_id',
    });
  }

  try {
    const deceased = await safeQuery(
      'SELECT * FROM deceased WHERE deceased_id = ?',
      [deceased_id],
    );
    if (deceased.length === 0)
      return res
        .status(404)
        .json({ success: false, message: 'Deceased record not found.' });

    const embalming_uid = generateEmbalmingUID();

    const insertQuery = `
      INSERT INTO embalming_records (
        embalming_uid, deceased_id, embalmed_by, branch_id,
        height_cm, weight_kg, embalming_cost,
        start_time, end_time, notes, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertValues = [
      embalming_uid,
      deceased_id,
      embalmed_by,
      branch_id,
      height_cm || null,
      weight_kg || null,
      embalming_cost || null,
      start_time || null,
      end_time || null,
      notes || null,
      created_at || getKenyaTimeISO(),
      updated_at || getKenyaTimeISO(),
    ];

    const result = await safeQuery(insertQuery, insertValues);
    const embalmingRecordId = result.insertId;

    // ✅ Loop only once and handle everything inside
    for (const chem of chemicalUsage) {
      const quantityUsed = chem.amount_used || chem.quantity_used || 0;

      // Insert for main viewing
      await safeQuery(
        `
        INSERT INTO chemical_usage (
          embalming_id, branch_id, chemical_id, chemical_name,
          amount_used, unit, used_by, used_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          embalmingRecordId,
          branch_id,
          chem.chemical_id,
          chem.chemical_name || null,
          quantityUsed,
          chem.unit || 'L',
          embalmed_by,
          getKenyaTimeISO(),
          getKenyaTimeISO(),
        ],
      );

      // Insert analytics record
      await safeQuery(
        `
        INSERT INTO embalming_chemical_usage (
          embalming_id, chemical_id, branch_id,
          quantity_used, unit, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          embalmingRecordId,
          chem.chemical_id,
          branch_id,
          quantityUsed,
          chem.unit || 'L',
          getKenyaTimeISO(),
          getKenyaTimeISO(),
        ],
      );

      // Deduct stock
      const updateStock = await safeQuery(
        `
        UPDATE chemicals
        SET quantity_available = quantity_available - ?
        WHERE id = ? AND branch_id = ? AND quantity_available >= ?
        `,
        [quantityUsed, chem.chemical_id, branch_id, quantityUsed],
      );

      if (updateStock.affectedRows === 0) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for chemical_id ${chem.chemical_id}`,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Embalming record registered successfully.',
      embalming_record_id: embalmingRecordId,
      embalming_uid,
    });
  } catch (error) {
    logError(error);
    console.error(error);
    throw new Error('Failed to register embalming record.');
  }
});

/* ===========================================================
   UPDATE EMBALMING RECORD
=========================================================== */
const updateEmbalming = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    height_cm,
    weight_kg,
    embalming_cost,
    notes,
    start_time,
    end_time,
    updated_at,
  } = req.body;

  const record = await safeQuery(
    'SELECT * FROM embalming_records WHERE id = ?',
    [id],
  );
  if (record.length === 0)
    return res
      .status(404)
      .json({ success: false, message: 'Embalming record not found.' });

  await safeQuery(
    `
      UPDATE embalming_records
      SET height_cm=?, weight_kg=?, embalming_cost=?, notes=?,
      start_time=?, end_time=?, updated_at=?
      WHERE id=?
    `,
    [
      height_cm || null,
      weight_kg || null,
      embalming_cost || null,
      notes || null,
      start_time || null,
      end_time || null,
      updated_at || getKenyaTimeISO(),
      id,
    ],
  );

  res
    .status(200)
    .json({ success: true, message: 'Embalming record updated successfully.' });
});

/* ===========================================================
   GET ALL EMBALMING RECORDS
=========================================================== */
const getAllEmbalming = asyncHandler(async (req, res) => {
  const { branch_id } = req.query;
  let query = `
    SELECT 
      e.*, d.full_name AS deceased_name,
      b.name AS branch_name,
      u.name AS embalmer_name
    FROM embalming_records e
    LEFT JOIN deceased d ON e.deceased_id = d.deceased_id
    LEFT JOIN branches b ON e.branch_id = b.id
    LEFT JOIN users u ON e.embalmed_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (branch_id) {
    query += ' AND e.branch_id = ?';
    params.push(branch_id);
  }

  query += ' ORDER BY e.created_at DESC';
  const records = await safeQuery(query, params);

  res.status(200).json({ success: true, count: records.length, data: records });
});

/* ===========================================================
   GET SINGLE EMBALMING RECORD BY ID
=========================================================== */
const getEmbalmingById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const record = await safeQuery(
    `
    SELECT 
      e.*, d.full_name AS deceased_name,
      b.name AS branch_name,
      u.name AS embalmer_name
    FROM embalming_records e
    LEFT JOIN deceased d ON e.deceased_id = d.deceased_id
    LEFT JOIN branches b ON e.branch_id = b.id
    LEFT JOIN users u ON e.embalmed_by = u.id
    WHERE e.id = ?
    `,
    [id],
  );

  if (record.length === 0)
    return res
      .status(404)
      .json({ success: false, message: 'Embalming record not found.' });

  const chemicalUsage = await safeQuery(
    'SELECT * FROM chemical_usage WHERE embalming_id = ?',
    [record[0].id],
  );

  res.status(200).json({
    success: true,
    embalming_record: record[0],
    chemical_usage: chemicalUsage,
  });
});

module.exports = {
  registerEmbalming,
  updateEmbalming,
  getAllEmbalming,
  getEmbalmingById,
};
