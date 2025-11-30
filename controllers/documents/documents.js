const path = require('path');
const fs = require('fs');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');

/**
 * Ensure folder exists with retry mechanism
 */
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

/**
 * Convert absolute path to relative URL for browser/DB
 */
function normalizePath(filePath) {
  return filePath
    ? filePath.replace(
        /^.*[\\/]uploads[\\/]documents[\\/]/,
        '/uploads/documents/',
      )
    : null;
}

/**
 * Upload a document for a deceased record
 */
const uploadDocument = async (req, res) => {
  try {
    // FIX: Use deceased_idd instead of deceasedId to match your database
    const { deceased_idd } = req.params;
    const { type } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!type) {
      return res.status(400).json({ message: 'Document type is required' });
    }

    // Check if deceased exists
    const deceasedCheck = await safeQuery(
      'SELECT id FROM deceased WHERE deceased_idd = ?',
      [deceased_idd],
    );

    if (deceasedCheck.length === 0) {
      return res.status(404).json({ message: 'Deceased record not found' });
    }

    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({
        message: 'Invalid file type. Only PDF and image files are allowed.',
      });
    }

    const uploadDir = path.join(
      __dirname,
      '../../uploads/documents',
      deceased_idd,
    );
    await ensureFolderExists(uploadDir);

    const uniqueName = `${Date.now()}-${Math.floor(Math.random() * 10000)}${path.extname(file.originalname)}`;
    const finalPath = path.join(uploadDir, uniqueName);
    fs.renameSync(file.path, finalPath);

    const uploadedAt = getKenyaTimeISO();
    const createdAt = getKenyaTimeISO();

    const relativePath = normalizePath(finalPath);

    const result = await safeQuery(
      `INSERT INTO documents 
        (deceased_id, document_type, file_name, file_path, mime_type, uploaded_at, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        deceased_idd, // Use deceased_idd here
        type,
        file.originalname,
        relativePath,
        file.mimetype,
        uploadedAt,
        createdAt,
      ],
    );

    return res.status(201).json({
      message: 'Document uploaded successfully',
      documentId: result.insertId,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileUrl: relativePath,
      uploaded_at: uploadedAt,
    });
  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({
      message: 'Server error while uploading document',
      details: error.message,
    });
  }
};

/**
 * Get documents for a deceased record
 */
const getDocuments = async (req, res) => {
  try {
    const { deceased_idd } = req.params;

    const documents = await safeQuery(
      `SELECT 
        id,
        document_type,
        file_name as document_name,
        file_path,
        mime_type,
        uploaded_at,
        file_size
       FROM documents 
       WHERE deceased_id = ? 
       ORDER BY uploaded_at DESC`,
      [deceased_idd],
    );

    return res.status(200).json({
      message: 'Documents fetched successfully',
      data: documents,
    });
  } catch (error) {
    console.error('Get Documents Error:', error);
    return res.status(500).json({
      message: 'Server error while fetching documents',
      details: error.message,
    });
  }
};

/**
 * Download a document
 */
const downloadDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    const document = await safeQuery(
      `SELECT file_path, file_name, mime_type 
       FROM documents 
       WHERE id = ?`,
      [documentId],
    );

    if (document.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const doc = document[0];
    const absolutePath = path.join(__dirname, '../..', doc.file_path);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${doc.file_name}"`,
    );

    const fileStream = fs.createReadStream(absolutePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Download Error:', error);
    return res.status(500).json({
      message: 'Server error while downloading document',
      details: error.message,
    });
  }
};

/**
 * Delete a document
 */
const deleteDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    const document = await safeQuery(
      `SELECT file_path FROM documents WHERE id = ?`,
      [documentId],
    );

    if (document.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const filePath = path.join(__dirname, '../..', document[0].file_path);

    // Delete file from filesystem
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete record from database
    await safeQuery(`DELETE FROM documents WHERE id = ?`, [documentId]);

    return res.status(200).json({
      message: 'Document deleted successfully',
    });
  } catch (error) {
    console.error('Delete Error:', error);
    return res.status(500).json({
      message: 'Server error while deleting document',
      details: error.message,
    });
  }
};

module.exports = {
  uploadDocument,
  getDocuments,
  downloadDocument,
  deleteDocument,
};
