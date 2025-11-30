// events.controller.js
const asyncHandler = require('express-async-handler');
const { v4: uuidv4 } = require('uuid');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');

// ----------------------------------------------------
//   CREATE EVENTS (single OR multiple) - FIXED VERSION
// ----------------------------------------------------
const createEvents = asyncHandler(async (req, res) => {
  const { events } = req.body;

  if (!Array.isArray(events) || events.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: 'No events provided' });
  }

  const createdAt = getKenyaTimeISO();
  const output = [];

  for (const ev of events) {
    const data = {
      title: ev.title || '',
      description: ev.description || '',
      start: ev.start,
      end: ev.end,
      category: ev.category || 'OTHER',
      priority: ev.priority || 'MEDIUM',
      status: ev.status || 'PENDING',
      staff: ev.staff || 'Unassigned',
      createdAt,
      updatedAt: createdAt,
    };

    // FIXED: Use the correct database schema with all fields
    await safeQuery(
      `INSERT INTO events (title, description, start, end, category, priority, status, staff, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title,
        data.description,
        data.start,
        data.end,
        data.category,
        data.priority,
        data.status,
        data.staff,
        data.createdAt,
        data.updatedAt,
      ],
    );

    // Get the inserted ID
    const [result] = await safeQuery('SELECT LAST_INSERT_ID() as id');
    data.id = result.id;

    output.push(data);
  }

  return res.status(201).json({
    success: true,
    message: 'Event(s) created successfully',
    events: output,
  });
});

// ----------------------------------------------------
//   GET EVENTS BY MONTH - FIXED VERSION
// ----------------------------------------------------
const getEventsByMonth = asyncHandler(async (req, res) => {
  const { year, month } = req.params;
  console.log('🔍 Fetching events for:', year, month);

  try {
    // FIXED: Query using the correct field names from your database
    const rows = await safeQuery(
      `SELECT 
                id,
                title,
                description,
                start,
                end,
                category,
                priority,
                status,
                staff,
                created_at,
                updated_at
             FROM events 
             WHERE YEAR(start) = ? AND MONTH(start) = ?
             ORDER BY start ASC`,
      [parseInt(year), parseInt(month)],
    );

    console.log(`📅 Found ${rows.length} events for ${year}-${month}`);

    // Format the response to match frontend expectations
    const formattedEvents = rows.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      start: event.start,
      end: event.end,
      category: event.category,
      priority: event.priority,
      status: event.status,
      staff:
        typeof event.staff === 'string'
          ? { id: '1', name: event.staff, role: 'Staff' }
          : event.staff,
      created_at: event.created_at,
      updated_at: event.updated_at,
    }));

    return res.json({
      success: true,
      events: formattedEvents,
      count: formattedEvents.length,
    });
  } catch (error) {
    console.error('❌ Database error:', error);
    return res.status(500).json({
      success: false,
      message: 'Database error fetching events',
      error: error.message,
    });
  }
});

// ----------------------------------------------------
//   UPDATE EVENT - FIXED VERSION
// ----------------------------------------------------
const updateEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const data = req.body;

  const updatedAt = getKenyaTimeISO();

  // FIXED: Update all fields including category, priority, staff
  await safeQuery(
    `UPDATE events 
         SET title=?, description=?, start=?, end=?, category=?, priority=?, status=?, staff=?, updated_at=?
         WHERE id=?`,
    [
      data.title || '',
      data.description || '',
      data.start,
      data.end,
      data.category || 'OTHER',
      data.priority || 'MEDIUM',
      data.status || 'PENDING',
      data.staff || 'Unassigned',
      updatedAt,
      eventId,
    ],
  );

  return res.json({
    success: true,
    message: 'Event updated successfully',
  });
});

// ----------------------------------------------------
//   DELETE EVENT
// ----------------------------------------------------
const deleteEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  await safeQuery(`DELETE FROM events WHERE id=?`, [eventId]);

  return res.json({
    success: true,
    message: 'Event deleted successfully',
  });
});

// ----------------------------------------------------
//   GET ALL EVENTS
// ----------------------------------------------------
const getAllEvents = asyncHandler(async (req, res) => {
  const rows = await safeQuery(`
        SELECT * FROM events 
        ORDER BY start ASC
    `);

  return res.json({
    success: true,
    events: rows,
    count: rows.length,
  });
});

module.exports = {
  createEvents,
  getAllEvents,
  getEventsByMonth,
  updateEvent,
  deleteEvent,
};
