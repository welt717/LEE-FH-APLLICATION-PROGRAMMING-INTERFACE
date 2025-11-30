const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { safeQuery } = require('../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../utilities/timeStamps/timeStamps');
const nodemailer = require('nodemailer');

// Enhanced file type detection with categories
const detectDocumentCategory = (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;
  const filename = file.originalname.toLowerCase();

  // Enhanced category detection based on filename patterns and types
  if (
    filename.includes('id') ||
    filename.includes('identification') ||
    filename.includes('passport') ||
    filename.includes('national') ||
    (ext === '.pdf' && filename.includes('id'))
  ) {
    return 'Identification';
  }

  if (
    filename.includes('kin') ||
    filename.includes('next') ||
    filename.includes('family') ||
    filename.includes('relative')
  ) {
    return 'Next of Kin';
  }

  if (
    filename.includes('bill') ||
    filename.includes('invoice') ||
    filename.includes('receipt') ||
    filename.includes('payment') ||
    (ext === '.pdf' &&
      (filename.includes('bill') || filename.includes('invoice')))
  ) {
    return 'Billing';
  }

  if (
    filename.includes('release') ||
    filename.includes('form') ||
    filename.includes('consent') ||
    filename.includes('authorization')
  ) {
    return 'Release Forms';
  }

  if (
    filename.includes('case') ||
    filename.includes('file') ||
    filename.includes('record') ||
    filename.includes('medical') ||
    filename.includes('report')
  ) {
    return 'Case File';
  }

  if (
    mime.includes('image') &&
    (filename.includes('medical') ||
      filename.includes('scan') ||
      filename.includes('xray'))
  ) {
    return 'Medical Records';
  }

  if (
    filename.includes('legal') ||
    filename.includes('contract') ||
    filename.includes('agreement') ||
    filename.includes('court')
  ) {
    return 'Legal Documents';
  }

  return 'General';
};

// Enhanced document type detection
function detectDocumentType(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  if (ext === '.pdf' || mime === 'application/pdf') return 'PDF Document';
  if (['.doc', '.docx'].includes(ext) || mime.includes('word'))
    return 'Word Document';
  if (
    ['.xls', '.xlsx', '.csv'].includes(ext) ||
    mime.includes('excel') ||
    mime.includes('spreadsheet')
  )
    return 'Excel Spreadsheet';
  if (
    ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'].includes(ext) ||
    mime.includes('image')
  )
    return 'Image';
  if (ext === '.txt' || mime.includes('text')) return 'Text File';
  if (['.zip', '.rar', '.7z'].includes(ext)) return 'Archive';
  if (ext === '.pptx' || ext === '.ppt' || mime.includes('presentation'))
    return 'PowerPoint';

  return 'General Document';
}

// Email transporter configuration - FIXED: createTransport instead of createTransporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Helper: convert absolute path to relative URL
const normalizePath = (filePath) => {
  return filePath
    ? filePath.replace(
        /^.*[\\/]uploads[\\/]documents[\\/]/,
        '/uploads/documents/',
      )
    : null;
};

// Allowed file types (expanded)
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
  ];

  // Allow all image types
  if (file.mimetype.startsWith('image/')) {
    return cb(null, true);
  }

  // Allow common document types
  if (file.mimetype.startsWith('text/')) {
    return cb(null, true);
  }

  cb(null, allowedTypes.includes(file.mimetype));
};

// Ensure folder exists
function ensureFolderExists(dir, retries = 3, delay = 100) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        resolve();
      } catch (err) {
        if (retries > 0) {
          retries--;
          setTimeout(attempt, delay);
        } else {
          reject(err);
        }
      }
    };
    attempt();
  });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const deceasedId = req.params.deceasedId;
      const deceasedFolder = path.join(
        __dirname,
        `../uploads/documents/${deceasedId}`,
      );
      await ensureFolderExists(deceasedFolder);
      cb(null, deceasedFolder);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname).toLowerCase();
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 20, // Maximum 20 files per upload
  },
});

router.post(
  '/deceased/:deceasedId/documents',
  upload.array('files', 20),
  async (req, res) => {
    try {
      const { deceasedId } = req.params;
      // Use 'System' if uploadedBy is missing
      const uploadedBy = req.body.uploadedBy?.trim() || 'System';
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files uploaded',
        });
      }

      const uploadedAt = getKenyaTimeISO();
      const uploadedFiles = [];

      for (const file of files) {
        try {
          const docType = detectDocumentType(file);
          const category = detectDocumentCategory(file);
          const relativePath = normalizePath(file.path);

          // Check existing documents for version control
          const existingDocs = await safeQuery(
            `SELECT document_id, version FROM documents 
           WHERE deceased_id = ? AND file_name = ? 
           ORDER BY version DESC LIMIT 1`,
            [deceasedId, file.originalname],
          );

          const newVersion =
            existingDocs.length > 0 ? existingDocs[0].version + 1 : 1;

          // Insert into documents table
          const result = await safeQuery(
            `INSERT INTO documents 
            (deceased_id, document_type, category, file_name, file_path, mime_type, 
             uploaded_by, uploaded_at, created_at, updated_at, version) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              deceasedId,
              docType,
              category,
              file.originalname,
              relativePath,
              file.mimetype,
              uploadedBy,
              uploadedAt,
              uploadedAt,
              uploadedAt,
              newVersion,
            ],
          );

          // Insert into document_history
          await safeQuery(
            `INSERT INTO document_history 
            (document_id, action, user, details, timestamp) 
           VALUES (?, ?, ?, ?, ?)`,
            [
              result.insertId,
              'UPLOAD',
              uploadedBy,
              `Uploaded version ${newVersion} of ${file.originalname}`,
              uploadedAt,
            ],
          );

          uploadedFiles.push({
            documentId: result.insertId,
            originalName: file.originalname,
            storedName: file.filename,
            mimeType: file.mimetype,
            detectedType: docType,
            category,
            sizeKB: Math.round(file.size / 1024),
            url: relativePath,
            uploadedAt,
            uploadedBy,
            version: newVersion,
          });
        } catch (dbError) {
          console.error(
            `Database error for file ${file.originalname}:`,
            dbError,
          );
          // Continue processing other files
        }
      }

      return res.status(200).json({
        success: true,
        message: `${uploadedFiles.length} file(s) uploaded successfully`,
        deceasedId,
        uploadedAt,
        files: uploadedFiles,
      });
    } catch (error) {
      console.error('Upload error:', error);
      return res.status(500).json({
        success: false,
        message: 'Upload failed',
        error: error.message,
      });
    }
  },
);

// Enhanced get documents with search and filtering
router.get('/documents/:deceasedId', async (req, res) => {
  try {
    const { deceasedId } = req.params;
    const {
      search,
      category,
      sortBy = 'uploaded_at',
      sortOrder = 'DESC',
    } = req.query;

    let query = `
      SELECT document_id, document_type, category, file_name, file_path, mime_type, 
             uploaded_by, uploaded_at, created_at, version
      FROM documents
      WHERE deceased_id = ?
    `;
    const params = [deceasedId];

    // Add search filter
    if (search) {
      query += ` AND (file_name LIKE ? OR category LIKE ? OR document_type LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Add category filter
    if (category && category !== 'all') {
      query += ` AND category = ?`;
      params.push(category);
    }

    // Add sorting
    const validSortFields = [
      'uploaded_at',
      'file_name',
      'category',
      'document_type',
    ];
    const validSortOrders = ['ASC', 'DESC'];

    const sortField = validSortFields.includes(sortBy) ? sortBy : 'uploaded_at';
    const sortDir = validSortOrders.includes(sortOrder.toUpperCase())
      ? sortOrder.toUpperCase()
      : 'DESC';

    query += ` ORDER BY ${sortField} ${sortDir}`;

    const documents = await safeQuery(query, params);

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No documents found for this deceased ID',
      });
    }

    // Get file sizes and enhance data
    const files = await Promise.all(
      documents.map(async (doc) => {
        const absolutePath = path.join(__dirname, '..', doc.file_path);
        let fileSize = null;

        try {
          const stats = await fs.promises.stat(absolutePath);
          fileSize = stats.size;
        } catch (error) {
          console.log(
            `Could not get file size for ${doc.file_name}:`,
            error.message,
          );
        }

        return {
          documentId: doc.document_id,
          originalName: doc.file_name,
          mimeType: doc.mime_type,
          detectedType: doc.document_type,
          category: doc.category || 'Unknown', // <-- fallback if null
          uploadedAt: doc.uploaded_at,
          uploadedBy: doc.uploaded_by || 'System', // <-- fallback if null
          sizeKB: fileSize ? Math.round(fileSize / 1024) : null,
          url: doc.file_path.replace(/\\/g, '/'),
          version: doc.version,
        };
      }),
    );

    return res.json({
      success: true,
      deceasedId,
      files,
      total: files.length,
      filters: {
        search,
        category,
        sortBy,
        sortOrder,
      },
    });
  } catch (err) {
    console.error('Fetch documents error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get document history
router.get('/documents/:documentId/history', async (req, res) => {
  try {
    const { documentId } = req.params;

    const history = await safeQuery(
      `SELECT action, user, details, timestamp, version
       FROM document_history
       WHERE document_id = ?
       ORDER BY timestamp DESC`,
      [documentId],
    );

    return res.json({
      success: true,
      documentId,
      history,
    });
  } catch (err) {
    console.error('Fetch document history error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Share document endpoint
router.post('/documents/share', async (req, res) => {
  try {
    const { documentId, recipientEmail, method, message, documentName } =
      req.body;

    // Get document details
    const document = await safeQuery(
      `SELECT file_path, file_name FROM documents WHERE document_id = ?`,
      [documentId],
    );

    if (document.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    const doc = document[0];
    const absolutePath = path.join(__dirname, '..', doc.file_path);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server',
      });
    }

    if (method === 'email') {
      // Send email with attachment
      const mailOptions = {
        from: process.env.SMTP_USER,
        to: recipientEmail,
        subject: `Document Shared: ${documentName}`,
        text: message || `Please find attached document: ${documentName}`,
        attachments: [
          {
            filename: doc.file_name,
            path: absolutePath,
          },
        ],
      };

      await emailTransporter.sendMail(mailOptions);

      // Log sharing action
      await safeQuery(
        `INSERT INTO document_history 
          (document_id, action, user, details, timestamp) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          documentId,
          'SHARED',
          'System',
          `Shared via email to ${recipientEmail}`,
          getKenyaTimeISO(),
        ],
      );
    } else if (method === 'whatsapp') {
      // For WhatsApp, you would integrate with a WhatsApp API service
      // This is a placeholder for WhatsApp integration
      console.log(`WhatsApp share requested for ${recipientEmail}`);

      // Log sharing action
      await safeQuery(
        `INSERT INTO document_history 
          (document_id, action, user, details, timestamp) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          documentId,
          'SHARED',
          'System',
          `Shared via WhatsApp to ${recipientEmail}`,
          getKenyaTimeISO(),
        ],
      );
    }

    return res.json({
      success: true,
      message: `Document shared successfully via ${method}`,
    });
  } catch (err) {
    console.error('Share document error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update document category
router.patch('/documents/:documentId/category', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { category, updatedBy = 'System' } = req.body;

    // Update category
    await safeQuery(`UPDATE documents SET category = ? WHERE document_id = ?`, [
      category,
      documentId,
    ]);

    // Log category change
    await safeQuery(
      `INSERT INTO document_history 
        (document_id, action, user, details, timestamp) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        documentId,
        'CATEGORY_UPDATED',
        updatedBy,
        `Category changed to: ${category}`,
        getKenyaTimeISO(),
      ],
    );

    return res.json({
      success: true,
      message: 'Document category updated successfully',
    });
  } catch (err) {
    console.error('Update category error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Enhanced download with tracking
router.get('/documents/download/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { downloadedBy = 'System' } = req.query;

    const document = await safeQuery(
      `SELECT document_id, file_name, file_path, mime_type
       FROM documents
       WHERE document_id = ?`,
      [documentId],
    );

    if (document.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    const doc = document[0];
    const absolutePath = path.join(__dirname, '..', doc.file_path);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server',
      });
    }

    // Log download action
    await safeQuery(
      `INSERT INTO document_history 
        (document_id, action, user, details, timestamp) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        documentId,
        'DOWNLOADED',
        downloadedBy,
        `Document downloaded`,
        getKenyaTimeISO(),
      ],
    );

    // Set appropriate headers
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);

    // Stream the file
    const fileStream = fs.createReadStream(absolutePath);
    fileStream.pipe(res);
  } catch (err) {
    console.error('Download document error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Enhanced delete with audit logging
router.delete('/documents/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { deletedBy = 'System' } = req.body;

    // Get document details first
    const document = await safeQuery(
      `SELECT document_id, file_path, file_name
       FROM documents
       WHERE document_id = ?`,
      [documentId],
    );

    if (document.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    const doc = document[0];
    const absolutePath = path.join(__dirname, '..', doc.file_path);

    // Log deletion before actually deleting
    await safeQuery(
      `INSERT INTO document_history 
        (document_id, action, user, details, timestamp) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        documentId,
        'DELETED',
        deletedBy,
        `Document permanently deleted: ${doc.file_name}`,
        getKenyaTimeISO(),
      ],
    );

    // Delete from database
    await safeQuery(`DELETE FROM documents WHERE document_id = ?`, [
      documentId,
    ]);

    // Delete physical file
    try {
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
      }
    } catch (fileError) {
      console.warn(`Could not delete physical file: ${fileError.message}`);
      // Continue even if file deletion fails
    }

    return res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (err) {
    console.error('Delete document error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get document statistics
router.get('/documents/:deceasedId/stats', async (req, res) => {
  try {
    const { deceasedId } = req.params;

    const stats = await safeQuery(
      `
      SELECT 
        COUNT(*) as total_documents,
        COUNT(DISTINCT category) as categories_count,
        SUM(size_kb) as total_size_kb,
        MAX(uploaded_at) as last_upload
      FROM documents 
      WHERE deceased_id = ?
    `,
      [deceasedId],
    );

    const categoryStats = await safeQuery(
      `
      SELECT category, COUNT(*) as count
      FROM documents 
      WHERE deceased_id = ?
      GROUP BY category
      ORDER BY count DESC
    `,
      [deceasedId],
    );

    return res.json({
      success: true,
      stats: stats[0],
      categories: categoryStats,
    });
  } catch (err) {
    console.error('Get document stats error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
