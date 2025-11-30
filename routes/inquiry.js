const express = require('express');
const router = express.Router();

const {
  createInquiry,
  getAllInquiries,
  getInquiryById,
  addResponse,
  updateInquiryStatus,
  updateInquiryPriority,
  getInquiryStats,
  getAvailableStaff,
} = require('../controllers/inquiry/inquiry');

// ----------------------------------------
// CLIENT ENDPOINTS
// ----------------------------------------
router.post('/inquiries', createInquiry);
router.get('/inquiries/:inquiry_id', getInquiryById);

// ----------------------------------------
// STAFF ENDPOINTS (Dashboard)
// ----------------------------------------
// TODO: Protect these with staff auth middleware
// router.use('/staff', verifyStaff);

router.get('/staff/inquiries', getAllInquiries);
router.get('/staff/inquiries/stats', getInquiryStats);
router.get('/staff/inquiries/available-staff', getAvailableStaff);

router.post('/staff/inquiries/:inquiry_id/respond', addResponse);
router.patch('/staff/inquiries/:inquiry_id/status', updateInquiryStatus);
router.patch('/staff/inquiries/:inquiry_id/priority', updateInquiryPriority);

module.exports = router;
