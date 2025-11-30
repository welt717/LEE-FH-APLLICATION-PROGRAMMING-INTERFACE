const asyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');
const { v4: uuidv4 } = require('uuid');
const {
  getDeceasedCached,
  mergeDeceasedCached,
  refreshAllDeceasedCache,
} = require('../../cachemanager/cachemanager'); // 🧠 cache utilities

// ---------------- Register Postmortem ----------------
const registerAutopsy = asyncHandler(async (req, res) => {
  const { deceased_id, summary, findings, cause_of_death, staff_username } =
    req.body;

  const created_at = getKenyaTimeISO();
  const date = getKenyaTimeISO();
  const autopsy_id = `PM-${uuidv4().split('-')[0].toUpperCase()}`;

  if (
    !deceased_id ||
    !summary ||
    !findings ||
    !cause_of_death ||
    !staff_username
  ) {
    return res.status(400).json({
      message:
        'Missing required fields: deceased_id, summary, findings, cause_of_death, staff_username',
    });
  }

  // ✅ Validate deceased exists
  const deceasedRows = await safeQuery(
    'SELECT deceased_id, full_name, mortuary_id FROM deceased WHERE deceased_id = ?',
    [deceased_id],
  );
  if (deceasedRows.length === 0) {
    return res
      .status(400)
      .json({ message: `Deceased record with ID '${deceased_id}' not found.` });
  }
  const deceasedRecord = deceasedRows[0];

  // ✅ Validate staff user
  const userRows = await safeQuery(
    'SELECT id, username, role FROM users WHERE username = ?',
    [staff_username],
  );
  if (userRows.length === 0) {
    return res
      .status(400)
      .json({ message: `User '${staff_username}' not found.` });
  }
  const userInfo = userRows[0];

  // ✅ Check if postmortem already exists
  const existingRows = await safeQuery(
    'SELECT autopsy_id FROM postmortem WHERE deceased_id = ?',
    [deceased_id],
  );
  if (existingRows.length > 0) {
    return res.status(409).json({
      message: 'Postmortem examination already exists for this deceased',
      existing_autopsy_id: existingRows[0].autopsy_id,
      deceased_id,
    });
  }

  // ✅ Insert postmortem
  await safeQuery(
    `INSERT INTO postmortem 
      (autopsy_id, deceased_id, summary, findings, cause_of_death, pathologist_id, mortuary_name, date, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      autopsy_id,
      deceased_id,
      summary,
      JSON.stringify(findings),
      cause_of_death,
      userInfo.id,
      deceasedRecord.mortuary_id || 'Nairobi City Mortuary',
      date,
      userInfo.id,
      created_at,
    ],
  );

  // ✅ Immediately update cache after successful insert
  mergeDeceasedCached(deceased_id, {
    has_postmortem: true,
    last_cause_of_death: cause_of_death,
    postmortem_summary: summary,
    updated_at: created_at,
  });

  console.log(
    `🧠 Deceased cache updated after postmortem for ID: ${deceased_id}`,
  );

  res.status(201).json({
    message: 'Postmortem record registered successfully.',
    autopsy_id,
    deceased_id,
    staff_username,
    status: 201,
  });
});

// ---------------- Update Postmortem ----------------
const updatePostmortem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    summary,
    findings,
    cause_of_death,
    staff_username,
    external_name,
    external_mobile,
    external_id_number,
  } = req.body;

  if (!id)
    return res.status(400).json({ message: 'Postmortem ID is required' });

  const updated_at = getKenyaTimeISO();
  const result = await safeQuery(
    `UPDATE postmortem 
       SET summary = ?, notes = ?, cause_of_death = ?,
           staff_username = ?, external_name = ?, external_mobile = ?, 
           external_id_number = ?, updated_at = ?
       WHERE id = ?`,
    [
      summary || null,
      findings ? JSON.stringify(findings) : null,
      cause_of_death || null,
      staff_username || null,
      external_name || null,
      external_mobile || null,
      external_id_number || null,
      updated_at,
      id,
    ],
  );

  if (result.affectedRows === 0) {
    return res
      .status(404)
      .json({ message: 'Postmortem examination not found' });
  }

  // ✅ Auto-update deceased cache as well
  const [postmortem] = await safeQuery(
    'SELECT deceased_id FROM postmortem WHERE id = ?',
    [id],
  );
  if (postmortem?.deceased_id) {
    mergeDeceasedCached(postmortem.deceased_id, {
      last_updated_postmortem: updated_at,
      cause_of_death,
      summary,
    });
    console.log(
      `♻️ Cache auto-updated for deceased ID: ${postmortem.deceased_id}`,
    );
  }

  res.status(200).json({
    message: 'Postmortem examination updated successfully',
    postmortem_id: id,
  });
});

module.exports = {
  registerAutopsy,
  updatePostmortem,
};
