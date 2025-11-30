const asyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const {
  getKenyaTimeISO,
  formatTimeAgo,
} = require('../../utilities/timeStamps/timeStamps');
const {
  getFileType,
  validateFile,
} = require('../../utilities/filehelpers/filehelpers');
const upload = require('../../utilities/uploads/inquiries');

/* 
---------------------------------------
 CREATE NEW INQUIRY (Enhanced Real-time)
---------------------------------------
*/
const createInquiry = asyncHandler(async (req, res) => {
  const {
    client_name,
    subject,
    message,
    email,
    phone,
    priority = 'medium',
  } = req.body;

  if (!client_name || !message) {
    return res.status(400).json({
      success: false,
      message: 'Client name and message are required',
    });
  }

  // Generate unique inquiry ID
  const inquiry_id =
    'INQ-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  const created_at = getKenyaTimeISO();
  const updated_at = created_at;
  const status = 'open';

  let attachment_path = null;
  let attachment_type = null;
  let attachment_original_name = null;

  if (req.file) {
    const validation = validateFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    attachment_path = `inquiries/${req.file.filename}`;
    attachment_type = getFileType(req.file.mimetype);
    attachment_original_name = req.file.originalname;
  }

  const query = `
    INSERT INTO inquiries
    (inquiry_id, client_name, subject, message, email, phone, status, priority, 
     created_at, updated_at, attachment_path, attachment_type, attachment_original_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const result = await safeQuery(query, [
    inquiry_id,
    client_name,
    subject || 'General Inquiry',
    message,
    email || null,
    phone || null,
    status,
    priority,
    created_at,
    updated_at,
    attachment_path,
    attachment_type,
    attachment_original_name,
  ]);

  const newInquiry = await getFullInquiryData(result.insertId);

  // Real-time notifications
  const io = req.app.get('io');

  // Emit to staff for new inquiry alert
  io.emit('new_inquiry', newInquiry);

  // Emit to the specific client who created the inquiry
  io.emit('inquiry_created', {
    success: true,
    data: newInquiry,
  });

  // Emit stats update to staff dashboard
  io.emit('inquiry_stats_update', await getInquiryStatistics());

  // Notify specific staff based on priority
  if (priority === 'high') {
    io.emit('priority_inquiry', newInquiry);
  }

  res.status(201).json({
    success: true,
    message: 'Inquiry submitted successfully',
    data: newInquiry,
  });
});

/* 
---------------------------------------
 ADD RESPONSE TO INQUIRY (Enhanced)
---------------------------------------
*/
const addResponse = asyncHandler(async (req, res) => {
  const { inquiry_id } = req.params;
  const { response, user_id, is_internal_note = false } = req.body;

  if (!response && !req.file) {
    return res.status(400).json({
      success: false,
      message: 'Response text or file required',
    });
  }

  const inquiryCheck = await safeQuery(
    'SELECT * FROM inquiries WHERE id = ? OR inquiry_id = ?',
    [inquiry_id, inquiry_id],
  );

  if (inquiryCheck.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'Inquiry not found',
    });
  }

  const inquiry = inquiryCheck[0];
  const user = await safeQuery(
    'SELECT id, name, role, avatar FROM users WHERE id = ?',
    [user_id],
  );

  if (user.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  const created_at = getKenyaTimeISO();

  let attachment_path = null;
  let attachment_type = null;
  let attachment_original_name = null;

  if (req.file) {
    attachment_path = `inquiries/${req.file.filename}`;
    attachment_type = getFileType(req.file.mimetype);
    attachment_original_name = req.file.originalname;
  }

  // Add response
  const responseResult = await safeQuery(
    `
    INSERT INTO inquiry_responses
    (inquiry_id, user_id, response, attachment_path, attachment_type, 
     attachment_original_name, is_internal_note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      inquiry.id,
      user_id,
      response || '',
      attachment_path,
      attachment_type,
      attachment_original_name,
      is_internal_note,
      created_at,
    ],
  );

  // Update inquiry status and timestamps
  const newStatus = is_internal_note ? inquiry.status : 'responded';
  await safeQuery(
    'UPDATE inquiries SET status = ?, updated_at = ? WHERE id = ?',
    [newStatus, getKenyaTimeISO(), inquiry.id],
  );

  const updatedInquiry = await getFullInquiryData(inquiry.id);
  const newResponse =
    updatedInquiry.responses[updatedInquiry.responses.length - 1];

  // Real-time updates
  const io = req.app.get('io');

  // Emit to staff for inquiry update
  io.emit('inquiry_updated', updatedInquiry);

  // Emit to both staff and client for new response
  io.emit('inquiry_response_added', {
    inquiry: updatedInquiry,
    response: newResponse,
  });

  res.status(201).json({
    success: true,
    message: 'Response added successfully',
    data: updatedInquiry,
  });
});

/* 
---------------------------------------
 HANDLE CLIENT MESSAGES (New Socket Event Handler)
---------------------------------------
*/
const handleClientMessage = asyncHandler(async (data) => {
  const { inquiry_id, client_name, response, created_at } = data;

  // Find the inquiry
  const inquiryCheck = await safeQuery(
    'SELECT * FROM inquiries WHERE id = ? OR inquiry_id = ?',
    [inquiry_id, inquiry_id],
  );

  if (inquiryCheck.length === 0) {
    throw new Error('Inquiry not found');
  }

  const inquiry = inquiryCheck[0];

  // Add client response (without user_id since it's from client)
  await safeQuery(
    `
    INSERT INTO inquiry_responses
    (inquiry_id, response, created_at, is_from_client)
    VALUES (?, ?, ?, ?)`,
    [inquiry.id, response, created_at || getKenyaTimeISO(), true],
  );

  // Update inquiry timestamp
  await safeQuery('UPDATE inquiries SET updated_at = ? WHERE id = ?', [
    getKenyaTimeISO(),
    inquiry.id,
  ]);

  const updatedInquiry = await getFullInquiryData(inquiry.id);
  const newResponse =
    updatedInquiry.responses[updatedInquiry.responses.length - 1];

  // Real-time updates
  const io = req.app.get('io');

  // Emit to staff for new client message
  io.emit('new_client_message', {
    inquiry_id: inquiry.id,
    client_name: client_name,
    response: response,
    created_at: created_at || getKenyaTimeISO(),
    inquiry: updatedInquiry,
  });

  // Emit to staff for inquiry update
  io.emit('inquiry_updated', updatedInquiry);

  return updatedInquiry;
});

/* 
---------------------------------------
 GET INQUIRIES WITH FILTERS
---------------------------------------
*/
const getAllInquiries = asyncHandler(async (req, res) => {
  const {
    status,
    priority,
    date_from,
    date_to,
    page = 1,
    limit = 20,
    search,
  } = req.query;

  let query = `
    SELECT i.*, 
           COUNT(r.id) as response_count,
           MAX(r.created_at) as last_response_at
    FROM inquiries i
    LEFT JOIN inquiry_responses r ON i.id = r.inquiry_id
  `;

  const conditions = [];
  const params = [];

  // Add filters
  if (status && status !== 'all') {
    conditions.push('i.status = ?');
    params.push(status);
  }

  if (priority && priority !== 'all') {
    conditions.push('i.priority = ?');
    params.push(priority);
  }

  if (date_from) {
    conditions.push('DATE(i.created_at) >= ?');
    params.push(date_from);
  }

  if (date_to) {
    conditions.push('DATE(i.created_at) <= ?');
    params.push(date_to);
  }

  if (search) {
    conditions.push(`
      (i.client_name LIKE ? OR i.email LIKE ? OR i.subject LIKE ? OR i.message LIKE ?)
    `);
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  // Add grouping and sorting
  query += ` 
    GROUP BY i.id
    ORDER BY 
      CASE i.priority 
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
      END,
      i.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const offset = (page - 1) * limit;
  params.push(parseInt(limit), offset);

  const inquiries = await safeQuery(query, params);

  // Get total count for pagination
  const countQuery = `
    SELECT COUNT(*) as total 
    FROM inquiries i
    ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
  `;
  const countParams = params.slice(0, -2); // Remove limit and offset
  const totalResult = await safeQuery(countQuery, countParams);
  const total = totalResult[0].total;

  res.status(200).json({
    success: true,
    data: inquiries,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/* 
---------------------------------------
 GET SINGLE INQUIRY WITH RESPONSES
---------------------------------------
*/
const getInquiryById = asyncHandler(async (req, res) => {
  const { inquiry_id } = req.params;

  const inquiry = await safeQuery(
    'SELECT * FROM inquiries WHERE id = ? OR inquiry_id = ? LIMIT 1',
    [inquiry_id, inquiry_id],
  );

  if (inquiry.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'Inquiry not found',
    });
  }

  const fullData = await getFullInquiryData(inquiry[0].id);
  res.status(200).json({ success: true, data: fullData });
});

/* 
---------------------------------------
 UPDATE INQUIRY STATUS
---------------------------------------
*/
const updateInquiryStatus = asyncHandler(async (req, res) => {
  const { inquiry_id } = req.params;
  const { status } = req.body;

  const validStatuses = ['open', 'responded', 'closed', 'pending'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid status',
    });
  }

  await safeQuery(
    'UPDATE inquiries SET status = ?, updated_at = ? WHERE id = ? OR inquiry_id = ?',
    [status, getKenyaTimeISO(), inquiry_id, inquiry_id],
  );

  const updatedInquiry = await getFullInquiryData(inquiry_id);

  const io = req.app.get('io');
  io.emit('inquiry_updated', updatedInquiry);
  io.emit('inquiry_status_changed', {
    inquiry_id: updatedInquiry.inquiry_id,
    status: status,
  });

  res.status(200).json({
    success: true,
    message: 'Status updated successfully',
    data: updatedInquiry,
  });
});

/* 
---------------------------------------
 UPDATE INQUIRY PRIORITY
---------------------------------------
*/
const updateInquiryPriority = asyncHandler(async (req, res) => {
  const { inquiry_id } = req.params;
  const { priority } = req.body;

  const validPriorities = ['low', 'medium', 'high'];
  if (!validPriorities.includes(priority)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid priority',
    });
  }

  await safeQuery(
    'UPDATE inquiries SET priority = ?, updated_at = ? WHERE id = ? OR inquiry_id = ?',
    [priority, getKenyaTimeISO(), inquiry_id, inquiry_id],
  );

  const updatedInquiry = await getFullInquiryData(inquiry_id);

  const io = req.app.get('io');
  io.emit('inquiry_updated', updatedInquiry);

  if (priority === 'high') {
    io.emit('priority_inquiry', updatedInquiry);
  }

  res.status(200).json({
    success: true,
    message: 'Priority updated successfully',
    data: updatedInquiry,
  });
});

/* 
---------------------------------------
 GET INQUIRY STATISTICS
---------------------------------------
*/
const getInquiryStats = asyncHandler(async (req, res) => {
  const { period = 'today' } = req.query;

  let dateFilter = '';
  const params = [];

  switch (period) {
    case 'today':
      dateFilter = 'DATE(created_at) = CURDATE()';
      break;
    case 'week':
      dateFilter = 'created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
      break;
    case 'month':
      dateFilter = 'created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
      break;
    case 'year':
      dateFilter = 'created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
      break;
  }

  const whereClause = dateFilter ? `WHERE ${dateFilter}` : '';

  const stats = await safeQuery(
    `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open,
      SUM(CASE WHEN status='responded' THEN 1 ELSE 0 END) as responded,
      SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN priority='high' THEN 1 ELSE 0 END) as high_priority,
      SUM(CASE WHEN priority='medium' THEN 1 ELSE 0 END) as medium_priority,
      SUM(CASE WHEN priority='low' THEN 1 ELSE 0 END) as low_priority,
      AVG(TIMESTAMPDIFF(MINUTE, created_at, updated_at)) as avg_response_time
    FROM inquiries
    ${whereClause}
  `,
    params,
  );

  // Response rate calculation
  const responseRate = await safeQuery(
    `
    SELECT 
      COUNT(DISTINCT i.id) as total_inquiries,
      COUNT(DISTINCT r.inquiry_id) as responded_inquiries
    FROM inquiries i
    LEFT JOIN inquiry_responses r ON i.id = r.inquiry_id
    ${whereClause}
  `,
    params,
  );

  const statsData = stats[0];
  const responseData = responseRate[0];

  statsData.response_rate =
    responseData.total_inquiries > 0
      ? (responseData.responded_inquiries / responseData.total_inquiries) * 100
      : 0;

  res.status(200).json({
    success: true,
    data: statsData,
    period: period,
  });
});

/* 
---------------------------------------
 GET STAFF PERFORMANCE
---------------------------------------
*/
const getStaffPerformance = asyncHandler(async (req, res) => {
  const staff = await safeQuery(`
    SELECT 
      u.id,
      u.name,
      u.role,
      u.avatar,
      COUNT(DISTINCT r.inquiry_id) as inquiries_handled,
      COUNT(r.id) as total_responses,
      AVG(TIMESTAMPDIFF(MINUTE, i.created_at, r.created_at)) as avg_response_time
    FROM users u
    LEFT JOIN inquiry_responses r ON u.id = r.user_id
    LEFT JOIN inquiries i ON r.inquiry_id = i.id
    WHERE u.role IN ('admin', 'mortuary-staff', 'receptionist')
    GROUP BY u.id, u.name, u.role, u.avatar
    ORDER BY inquiries_handled DESC
  `);

  res.status(200).json({
    success: true,
    data: staff,
  });
});

/* 
---------------------------------------
 HELPER: FULL INQUIRY DETAILS
---------------------------------------
*/
async function getFullInquiryData(inquiryId) {
  const inquiry = (
    await safeQuery('SELECT * FROM inquiries WHERE id = ?', [inquiryId])
  )[0];

  const responses = await safeQuery(
    `
    SELECT 
      r.*, 
      u.name AS staff_name, 
      u.role AS staff_role,
      u.avatar AS staff_avatar
    FROM inquiry_responses r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.inquiry_id = ?
    ORDER BY r.created_at ASC
  `,
    [inquiryId],
  );

  return {
    ...inquiry,
    responses,
    time_ago: formatTimeAgo(inquiry.created_at),
  };
}

/* 
---------------------------------------
 HELPER: INQUIRY STATISTICS
---------------------------------------
*/
async function getInquiryStatistics() {
  const stats = await safeQuery(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open,
      SUM(CASE WHEN status='responded' THEN 1 ELSE 0 END) as responded,
      SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed,
      SUM(CASE WHEN priority='high' THEN 1 ELSE 0 END) as high_priority
    FROM inquiries
  `);
  return stats[0];
}

/* 
---------------------------------------
 SOCKET EVENT HANDLERS SETUP
---------------------------------------
*/
const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle new client messages
    socket.on('new_client_message', async (data) => {
      try {
        const updatedInquiry = await handleClientMessage(data);

        // Emit back to the client that message was received
        socket.emit('client_message_received', {
          success: true,
          message: 'Message sent successfully',
          inquiry: updatedInquiry,
        });
      } catch (error) {
        console.error('Error handling client message:', error);
        socket.emit('client_message_error', {
          success: false,
          message: 'Failed to send message',
        });
      }
    });

    // Handle staff typing indicators
    socket.on('staff_typing', (data) => {
      // Broadcast to all clients in the same inquiry
      socket.broadcast.emit('staff_typing', data);
    });

    // Handle client joining inquiry room
    socket.on('join_inquiry', (inquiryId) => {
      socket.join(`inquiry_${inquiryId}`);
    });

    // Handle staff joining inquiry room
    socket.on('staff_join_inquiry', (inquiryId) => {
      socket.join(`inquiry_${inquiryId}`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
};

/* 
---------------------------------------
 EXPORTS
---------------------------------------
*/
module.exports = {
  createInquiry: [upload.single('attachment'), createInquiry],
  addResponse: [upload.single('attachment'), addResponse],
  getAllInquiries,
  getInquiryById,
  updateInquiryStatus,
  updateInquiryPriority,
  getInquiryStats,
  getStaffPerformance,
  handleClientMessage,
  setupSocketHandlers,
  getAvailableStaff: asyncHandler(async (req, res) => {
    const staff = await safeQuery(`
      SELECT id, name, role, email, avatar, is_online
      FROM users
      WHERE role IN ('admin', 'mortuary-staff', 'receptionist')
      AND is_online = true
      ORDER BY 
        CASE role
          WHEN 'admin' THEN 1
          WHEN 'mortuary-staff' THEN 2
          WHEN 'receptionist' THEN 3
        END,
        name
    `);
    res.status(200).json({ success: true, data: staff });
  }),
};
