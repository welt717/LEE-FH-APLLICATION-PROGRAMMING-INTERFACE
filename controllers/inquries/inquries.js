const { safeQuery, safeQueryOne } = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/inquiries/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = {
      'image/jpeg': true,
      'image/png': true,
      'image/gif': true,
      'video/mp4': true,
      'video/mpeg': true,
      'audio/mpeg': true,
      'audio/wav': true,
      'application/pdf': true,
    };
    cb(null, !!allowedTypes[file.mimetype]);
  },
}).single('attachment');

//
// Create Inquiry
//
async function createInquiry(req, res) {
  try {
    const { deceased_id, subject, message, client_id } = req.body;

    if (!deceased_id || !subject || !message || !client_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify client exists
    const client = await safeQueryOne(
      'SELECT id, name FROM clients WHERE id = ?',
      [client_id],
    );

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const now = new Date();

    const result = await safeQuery(
      `INSERT INTO inquiries 
        (deceased_id, client_id, subject, message, status, created_at) 
       VALUES (?, ?, ?, ?, 'new', ?)`,
      [deceased_id, client_id, subject, message, now],
    );

    const newInquiry = {
      id: result.insertId,
      deceased_id,
      client_id,
      subject,
      message,
      status: 'new',
      created_at: now,
      client_name: client.name,
    };

    // Emit real-time event
    const io = req.app.get('io');
    io.emit('new_inquiry', newInquiry);

    return res.status(201).json({
      message: 'Inquiry created successfully',
      inquiry: newInquiry,
    });
  } catch (err) {
    console.error('❌ Error creating inquiry:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

//
// Respond to Inquiry with file upload
//
async function respondToInquiry(req, res) {
  upload(req, res, async function (err) {
    try {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ error: 'File upload failed' });
      }

      const { inquiry_id, staff_id, response } = req.body;

      if (!inquiry_id || !staff_id) {
        return res
          .status(400)
          .json({ error: 'inquiry_id and staff_id are required' });
      }

      // Verify inquiry exists
      const inquiry = await safeQueryOne(
        'SELECT id, client_id FROM inquiries WHERE id = ?',
        [inquiry_id],
      );

      if (!inquiry) {
        return res.status(404).json({ error: 'Inquiry not found' });
      }

      const now = new Date();
      const attachment_path = req.file ? req.file.path : null;
      const attachment_type = req.file ? getFileType(req.file.mimetype) : null;

      // Insert into inquiry_responses
      const result = await safeQuery(
        `INSERT INTO inquiry_responses 
          (inquiry_id, staff_id, response, attachment_path, attachment_type, created_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          inquiry_id,
          staff_id,
          response || null,
          attachment_path,
          attachment_type,
          now,
        ],
      );

      // Update inquiry status
      await safeQuery(
        `UPDATE inquiries 
         SET status = 'responded', updated_at = ?
         WHERE id = ?`,
        [now, inquiry_id],
      );

      const newResponse = {
        id: result.insertId,
        inquiry_id,
        staff_id,
        response: response || null,
        attachment_path,
        attachment_type,
        created_at: now,
        staff_name: req.body.staff_name || 'Staff',
      };

      // Emit real-time event to specific client
      const io = req.app.get('io');
      io.to(`client_${inquiry.client_id}`).emit('new_response', newResponse);
      io.emit('inquiry_updated', { inquiry_id, status: 'responded' });

      return res.status(200).json({
        message: 'Response sent successfully',
        response: newResponse,
      });
    } catch (err) {
      console.error('❌ Error responding to inquiry:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}

//
// Get inquiries for client
//
async function getClientInquiries(req, res) {
  try {
    const { client_id } = req.params;

    const inquiries = await safeQuery(
      `SELECT i.*, d.name as deceased_name 
       FROM inquiries i 
       LEFT JOIN deceased d ON i.deceased_id = d.id 
       WHERE i.client_id = ? 
       ORDER BY i.created_at DESC`,
      [client_id],
    );

    // Get responses for each inquiry
    for (let inquiry of inquiries) {
      const responses = await safeQuery(
        `SELECT ir.*, s.name as staff_name 
         FROM inquiry_responses ir 
         LEFT JOIN staff s ON ir.staff_id = s.id 
         WHERE ir.inquiry_id = ? 
         ORDER BY ir.created_at ASC`,
        [inquiry.id],
      );
      inquiry.responses = responses;
    }

    return res.status(200).json({ inquiries });
  } catch (err) {
    console.error('❌ Error fetching inquiries:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

//
// Get all inquiries for staff
//
async function getAllInquiries(req, res) {
  try {
    const inquiries = await safeQuery(
      `SELECT i.*, c.name as client_name, d.name as deceased_name 
       FROM inquiries i 
       LEFT JOIN clients c ON i.client_id = c.id 
       LEFT JOIN deceased d ON i.deceased_id = d.id 
       ORDER BY i.created_at DESC`,
    );

    // Get responses for each inquiry
    for (let inquiry of inquiries) {
      const responses = await safeQuery(
        `SELECT ir.*, s.name as staff_name 
         FROM inquiry_responses ir 
         LEFT JOIN staff s ON ir.staff_id = s.id 
         WHERE ir.inquiry_id = ? 
         ORDER BY ir.created_at ASC`,
        [inquiry.id],
      );
      inquiry.responses = responses;
    }

    return res.status(200).json({ inquiries });
  } catch (err) {
    console.error('❌ Error fetching inquiries:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function getFileType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype === 'application/pdf') return 'pdf';
  return 'document';
}

module.exports = {
  createInquiry,
  respondToInquiry,
  getClientInquiries,
  getAllInquiries,
};
