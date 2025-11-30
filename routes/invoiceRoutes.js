// routes/invoiceRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllDeceasedWithFinancials,
  getDeceasedFinancialDetails,
  createPayment,
  createExtraCharge,
  createSystemInvoice,
  createInvoice,
  getAllInvoices,
  getInvoicesByDeceased,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  downloadInvoice,
} = require('../controllers/invoice/invoice'); // Fixed import path

// Financial Management Routes
router.get('/invoices/all-deceased', getAllDeceasedWithFinancials);
router.get(
  '/invoices/deceased-financials/:deceased_id',
  getDeceasedFinancialDetails,
);
router.post('/invoices/system-invoice', createSystemInvoice);
router.post('/invoices/payment', createPayment);
router.post('/invoices/extra-charge', createExtraCharge);

// Invoice Management Routes
router.post('/invoices', createInvoice);
router.get('/invoices', getAllInvoices);
router.get('/invoices/deceased/:deceased_id', getInvoicesByDeceased);
router.get('/invoices/:id', getInvoiceById);
router.put('/invoices/:id', updateInvoice);
router.delete('/invoices/:id', deleteInvoice);
router.get('/invoices/:id/download', downloadInvoice);

module.exports = router;
