// routes/invoices.js

const express = require('express');
const router = express.Router();

const {
  sendInvoiceWhatsApp,
  getNextOfKinByDeceased,
} = require('../controllers/sendMessages/sendInvoice');

// -----------------------------------------
// ROUTES
// -----------------------------------------

// Send invoice PDF to WhatsApp
router.post('/invoices/send-whatsapp', sendInvoiceWhatsApp);

// Get next of kin by deceased ID
router.get('/deceased/:id/next-of-kin', getNextOfKinByDeceased);

module.exports = router;
