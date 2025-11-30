const {
  safeQueryOne,
  safeQuery,
} = require('../../configurations/sqlConfig/db');
const crypto = require('crypto');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');

/**
 * Simulated mortuary tag printing (no printer connection).
 * Inserts tag record into separate `tags` table.
 */
const printTagHandler = async (req, res) => {
  try {
    const { deceasedId } = req.params;

    // 🔍 Fetch deceased info
    const deceased = await safeQueryOne(
      'SELECT * FROM deceased WHERE deceased_id = ?',
      [deceasedId],
    );

    if (!deceased) {
      return res.status(404).json({ message: 'Deceased record not found.' });
    }

    // 🏷️ Generate new Tag ID
    const tagId = `TAG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const now = getKenyaTimeISO(); // your time utility
    const formattedTime = new Date(now).toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi',
    });

    // 💾 Insert tag record into tags table
    await safeQuery(
      `INSERT INTO tags (tag_id, deceased_id, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [tagId, deceasedId, now, now],
    );

    // 🏷️ Build ZPL tag (simulated print)
    const zpl = `
^XA
^CF0,25
^FO30,20^FDMonalisa Funeral Home^FS
^FO30,50^FD---------------------------^FS
^CF0,30
^FO30,90^FDName:^FS
^FO180,90^FD${deceased.full_name || 'Unknown'}^FS
^FO30,130^FDGender:^FS
^FO180,130^FD${deceased.gender || 'N/A'}^FS
^FO30,170^FDTag ID:^FS
^FO180,170^FD${tagId}^FS
^FO30,210^FDDate of Death:^FS
^FO250,210^FD${deceased.date_of_death || 'Unknown'}^FS
^FO30,250^FDPrinted:^FS
^FO250,250^FD${formattedTime}^FS
^FO30,290^GB500,2,2^FS
^FO180,310^BQN,2,6^FDQA,${tagId}^FS
^FO30,450^FDHandle with Care - Morgue Tag^FS
^FO30,480^FD(Cold Resistant Synthetic Tag)^FS
^XZ
`;

    // ✅ Return simulated tag info
    return res.json({
      message: `🧾 Tag generated for ${deceased.full_name} and saved to database`,
      preview: {
        name: deceased.full_name,
        gender: deceased.gender,
        deceasedId: deceased.deceased_id,
        tagId,
        dateOfDeath: deceased.date_of_death,
        createdAt: now,
        updatedAt: now,
        printedAt: formattedTime,
      },
      zpl_code: zpl.trim(),
    });
  } catch (error) {
    console.error('❌ Tag printing simulation failed:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { printTagHandler };
