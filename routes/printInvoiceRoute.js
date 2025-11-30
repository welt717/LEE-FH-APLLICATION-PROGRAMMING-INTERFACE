// routes/invoiceRoutes.js or your main router
const express = require('express');
const router = express.Router();
const { printInvoice } = require('../controllers/invoice/printinvoice');

// Make sure this comes AFTER /invoices/:id or any similar route
router.post('/invoices/:id/print', printInvoice);

module.exports = router;
