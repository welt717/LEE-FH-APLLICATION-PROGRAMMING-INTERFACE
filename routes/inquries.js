const express = require('express');
const router = express.Router();
const inquiryController = require('../controllers/inquiryController');

router.post('/inquiries', inquiryController.createInquiry);
router.post('/inquiries/respond', inquiryController.respondToInquiry);
router.get(
  '/inquiries/client/:client_id',
  inquiryController.getClientInquiries,
);
router.get('/inquiries', inquiryController.getAllInquiries);

module.exports = router;
