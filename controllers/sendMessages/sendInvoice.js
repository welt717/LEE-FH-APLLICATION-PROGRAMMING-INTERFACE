// controllers/invoicesController.js

const asyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { AppError } = require('../../middlewares/errorHandler/errorHandler');

const { sendWhatsAppMessage } = require('./sendWatsAppMessage');

// ------------------------------------------------------
// SEND INVOICE VIA WHATSAPP
// ------------------------------------------------------

const sendInvoiceWhatsApp = asyncHandler(async (req, res) => {
  const { phone_number, invoice_id, deceased_id } = req.body;

  if (!phone_number || !invoice_id) {
    return res.status(400).json({
      status: 'error',
      message: 'Phone number and invoice ID are required',
    });
  }

  // Fetch invoice
  const invoice = await getInvoiceById(invoice_id);
  if (!invoice) {
    return res
      .status(404)
      .json({ status: 'error', message: 'Invoice not found' });
  }

  // Fetch deceased
  const deceased = await getDeceasedById(deceased_id);
  if (!deceased) {
    return res
      .status(404)
      .json({ status: 'error', message: 'Deceased not found' });
  }

  // Check PDF URL
  if (!invoice.pdf_url) {
    return res
      .status(400)
      .json({ status: 'error', message: 'Invoice PDF file not available' });
  }

  // Send via WhatsApp
  try {
    const result = await sendWhatsAppMessage(
      phone_number,
      invoice.pdf_url,
      invoice,
      deceased,
    );

    return res.status(200).json({
      status: 'success',
      message: 'Invoice sent via WhatsApp successfully',
      data: result,
    });
  } catch (err) {
    // Show real error from the service
    console.error('WhatsApp send failed:', err);

    return res.status(500).json({
      status: 'error',
      message: err.message || 'Failed to send WhatsApp message',
      details: err.response || null, // include full API response if available
    });
  }
});

// ------------------------------------------------------
// GET NEXT OF KIN
// ------------------------------------------------------

const getNextOfKinByDeceased = asyncHandler(async (req, res) => {
  const deceasedNumericId = req.params.id;

  // Fetch the deceased row first
  const deceased = await getDeceasedById(deceasedNumericId);
  if (!deceased) {
    throw new AppError('Deceased not found', 404);
  }

  const nextOfKin = await getNextOfKinByDeceasedId(deceased.deceased_id);

  return res.status(200).json({
    status: 'success',
    data: nextOfKin, // can be empty array
  });
});

// ------------------------------------------------------
// DATABASE HELPERS
// ------------------------------------------------------
const getInvoiceById = async (id) => {
  const rows = await safeQuery('SELECT * FROM invoices WHERE id = ? LIMIT 1', [
    id,
  ]);
  return rows[0] || null;
};

const getDeceasedById = async (id) => {
  const rows = await safeQuery('SELECT * FROM deceased WHERE id = ? LIMIT 1', [
    id,
  ]);
  return rows[0] || null;
};

const getNextOfKinByDeceasedId = async (id) => {
  return await safeQuery('SELECT * FROM next_of_kin WHERE deceased_id = ?', [
    id,
  ]);
};

// ------------------------------------------------------
// EXPORT ALL FUNCTIONS
// ------------------------------------------------------
module.exports = {
  sendInvoiceWhatsApp,
  getNextOfKinByDeceased,
};
