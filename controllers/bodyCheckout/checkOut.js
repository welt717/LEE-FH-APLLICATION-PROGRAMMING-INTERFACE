const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Helper to ensure folder exists with retry
function ensureFolderExists(dir, retries = 3, delay = 100) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        resolve();
      } catch (err) {
        if (retries > 0) {
          retries--;
          setTimeout(attempt, delay); // retry after delay
        } else {
          reject(err);
        }
      }
    };
    attempt();
  });
}

// Multer storage
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const deceasedId = req.params.deceased_id;
      if (!deceasedId) return cb(new Error('deceased_id is required'), null);

      const dir = path.join(__dirname, '../../uploads/documents', deceasedId);

      // Ensure folder exists (retry mechanism)
      await ensureFolderExists(dir);

      cb(null, dir);
    } catch (err) {
      cb(err, null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// Multer upload instance
const upload = multer({ storage });

// Convert absolute path to relative for browser/DB
const normalizePath = (filePath) => {
  return filePath
    ? filePath.replace(
        /^.*[\\/]uploads[\\/]documents[\\/]/,
        '/uploads/documents/',
      )
    : null;
};

module.exports = { upload, normalizePath };
