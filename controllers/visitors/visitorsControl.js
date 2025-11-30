// backend/controllers/visitorController.js
const expressAsyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');

// Register walk-in visitor
const registerVisitor = expressAsyncHandler(async (req, res) => {
  const { full_name, contact, relationship, deceased_id, purpose_of_visit } =
    req.body;

  // Enhanced validation with specific field names
  const missingFields = [];
  if (!full_name) missingFields.push('full_name');
  if (!contact) missingFields.push('contact');
  if (!relationship) missingFields.push('relationship');
  if (!purpose_of_visit) missingFields.push('purpose_of_visit');
  if (!deceased_id) missingFields.push('deceased_id');

  if (missingFields.length > 0) {
    return res.status(400).json({
      message: `Missing required fields: ${missingFields.join(', ')}`,
    });
  }

  // Verify deceased exists
  try {
    const deceasedCheck = await safeQuery(
      'SELECT deceased_id FROM deceased WHERE deceased_id = ?',
      [deceased_id],
    );

    if (deceasedCheck.length === 0) {
      return res.status(404).json({
        message: 'Deceased record not found',
      });
    }
  } catch (error) {
    console.error('Error verifying deceased:', error);
    return res.status(500).json({
      message: 'Error verifying deceased record',
    });
  }

  const sql = `
    INSERT INTO visitors (
      full_name,
      contact,
      relationship,
      reason_for_visit,
      deceased_id,
      check_in_time,
      visitor_type
    )
    VALUES (?, ?, ?, ?, ?, NOW(), 'walk-in')
  `;

  try {
    const result = await safeQuery(sql, [
      full_name,
      contact,
      relationship,
      purpose_of_visit,
      deceased_id,
    ]);

    res.status(201).json({
      message: '✅ Visitor registered successfully',
      id: result.insertId || null,
    });
  } catch (err) {
    console.error('❌ Error registering visitor:', err.message);
    res.status(500).json({
      message: 'Error registering visitor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// Get recent visitors (both walk-in and online)
const getRecentVisitors = expressAsyncHandler(async (req, res) => {
  const sql = `
    SELECT 
      v.visitor_id,
      v.full_name,
      v.contact,
      v.relationship,
      v.reason_for_visit,
      v.deceased_id,
      v.check_in_time,
      v.visitor_type,
      d.full_name as deceased_name,
      d.admission_number
    FROM visitors v
    LEFT JOIN deceased d ON v.deceased_id = d.deceased_id
    ORDER BY v.check_in_time DESC
    LIMIT 50
  `;

  try {
    const result = await safeQuery(sql);

    res.status(200).json({
      message: 'Recent visitors retrieved successfully',
      data: result,
    });
  } catch (err) {
    console.error('❌ Error fetching recent visitors:', err.message);
    res.status(500).json({
      message: 'Error fetching recent visitors',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// Get online bookings
const getOnlineBookings = expressAsyncHandler(async (req, res) => {
  const sql = `
    SELECT 
      ob.id,
      ob.full_name,
      ob.contact,
      ob.email,
      ob.relationship,
      ob.purpose_of_visit,
      ob.visit_date,
      ob.visit_time,
      ob.deceased_id,
      ob.status,
      ob.created_at,
      d.full_name as deceased_name,
      d.admission_number
    FROM online_bookings ob
    LEFT JOIN deceased d ON ob.deceased_id = d.deceased_id
    WHERE ob.status IN ('pending', 'confirmed')
    ORDER BY ob.created_at DESC
  `;

  try {
    const result = await safeQuery(sql);

    res.status(200).json({
      message: 'Online bookings retrieved successfully',
      data: result,
    });
  } catch (err) {
    console.error('❌ Error fetching online bookings:', err.message);
    res.status(500).json({
      message: 'Error fetching online bookings',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// Process online booking (confirm, reject, checkin)
const processBooking = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;

  if (!['confirm', 'reject', 'checkin'].includes(action)) {
    return res.status(400).json({
      message: 'Invalid action. Must be: confirm, reject, or checkin',
    });
  }

  try {
    let sql, message;

    if (action === 'confirm') {
      sql = 'UPDATE online_bookings SET status = "confirmed" WHERE id = ?';
      message = 'Booking confirmed successfully';
    } else if (action === 'reject') {
      sql = 'UPDATE online_bookings SET status = "rejected" WHERE id = ?';
      message = 'Booking rejected successfully';
    } else if (action === 'checkin') {
      // Move to visitors table and mark as checked in
      const booking = await safeQuery(
        'SELECT * FROM online_bookings WHERE id = ? AND status = "confirmed"',
        [id],
      );

      if (booking.length === 0) {
        return res.status(404).json({
          message: 'Confirmed booking not found',
        });
      }

      const visitorData = booking[0];

      // Insert into visitors table
      await safeQuery(
        `INSERT INTO visitors (
          full_name, contact, relationship, reason_for_visit, 
          deceased_id, check_in_time, visitor_type
        ) VALUES (?, ?, ?, ?, ?, NOW(), 'online')`,
        [
          visitorData.full_name,
          visitorData.contact,
          visitorData.relationship,
          visitorData.purpose_of_visit,
          visitorData.deceased_id,
        ],
      );

      // Update booking status
      sql = 'UPDATE online_bookings SET status = "checked-in" WHERE id = ?';
      message = 'Visitor checked in successfully';
    }

    const result = await safeQuery(sql, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Booking not found',
      });
    }

    res.status(200).json({
      message,
    });
  } catch (err) {
    console.error('❌ Error processing booking:', err.message);
    res.status(500).json({
      message: 'Error processing booking',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

module.exports = {
  registerVisitor,
  getRecentVisitors,
  getOnlineBookings,
  processBooking,
};
