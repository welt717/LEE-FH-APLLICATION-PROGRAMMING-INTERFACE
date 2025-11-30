const multer = require('multer');
const path = require('path');

const coffinsUploadDir = path.join(process.cwd(), 'uploads', 'coffins');
// Ensure that the 'uploads/coffins' directory exists
const fs = require('fs');
if (!fs.existsSync(coffinsUploadDir)) {
  fs.mkdirSync(coffinsUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, coffinsUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `coffin-${uniqueSuffix}${ext}`);
  },
});

// File filter to allow only image files
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true); // File is allowed
  } else {
    cb(
      new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed.'),
      false,
    ); // Reject file
  }
};

// Create the multer instance with file filter and storage
const uploadCoffinImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
});

module.exports = uploadCoffinImage;
