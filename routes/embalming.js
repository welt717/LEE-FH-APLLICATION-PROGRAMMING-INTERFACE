const express = require('express');
const router = express.Router();
const {
  registerEmbalming,
  updateEmbalming,
  getAllEmbalming,
  getEmbalmingById,
} = require('../controllers/embalming/embalming');

// Register new embalming record
router.post('/embalming', registerEmbalming);

// Update existing record
router.put('/embalming/:id', updateEmbalming);

// Get all embalming records
router.get('/embalming', getAllEmbalming);

// Get single record
router.get('/embalming/:id', getEmbalmingById);

module.exports = router;
