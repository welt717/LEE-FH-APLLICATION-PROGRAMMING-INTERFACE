const express = require('express');
const router = express.Router();
const {
  getPaymentHistoryByDeceased,
} = require('../controllers/paymentHistory/paymentHistory');

//  GET /api/v1/restpoint/deceased/payment-history?deceased_id=123
router.get(
  '/deceased/payment-history/:deceased_id',
  getPaymentHistoryByDeceased,
);
module.exports = router;
