const allowedMimeTypes = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'application/pdf': 'pdf',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'document',
  'audio/mpeg': 'audio',
  'video/mp4': 'video',
};

function getFileType(mimeType) {
  return allowedMimeTypes[mimeType] || 'unknown';
}

function validateFile(file) {
  if (!file) {
    return { valid: false, message: 'No file uploaded' };
  }

  if (!allowedMimeTypes[file.mimetype]) {
    return {
      valid: false,
      message: 'Unsupported file type',
    };
  }

  // Set a file size limit of 10MB
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return {
      valid: false,
      message: 'File too large. Maximum size is 10MB',
    };
  }

  return { valid: true };
}

module.exports = {
  getFileType,
  validateFile,
};
