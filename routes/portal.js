const express = require('express');
const router = express.Router();
const {
  getPortalDeceasedById,
  downloadAutopsyPDF,
  getMinisterDeceasedRecords,
} = require('../controllers/portal/portal');

router.get('/portal/deceased', getPortalDeceasedById);

router.post('/portal/download-autopsy', downloadAutopsyPDF);

router.get('/portal/ministers', getMinisterDeceasedRecords);

module.exports = router;
