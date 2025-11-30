// controllers/deceased/paymentController.js
const asyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const fs = require('fs');
const path = require('path');

// Error log setup
const errorLogPath = path.join(__dirname, '../../logs/error.log');
function logError(err) {
  const logEntry = `[${new Date().toISOString()}] ${err.stack || err}\n`;
  fs.appendFile(errorLogPath, logEntry, (e) => {
    if (e) console.error('❌ Failed to write to error log:', e);
  });
}

// Fetch payment history by deceased_id
const getPaymentHistoryByDeceased = asyncHandler(async (req, res) => {
  const { deceased_id } = req.params; // now using path param

  if (!deceased_id) {
    return res.status(400).json({ message: 'deceased_id is required' });
  }

  try {
    const payments = await safeQuery(
      `SELECT payment_id, reference_code, payment_method, payment_date, amount, description
       FROM payments
       WHERE deceased_id = ?
       ORDER BY payment_date DESC`,
      [deceased_id],
    );

    if (!payments.length) {
      return res
        .status(404)
        .json({ message: 'No payment history found for this deceased.' });
    }

    res.status(200).json({
      message: 'Payment history fetched successfully',
      count: payments.length,
      data: payments,
    });
  } catch (err) {
    console.error('❌ Error fetching payment history:', err);
    logError(err);
    res
      .status(500)
      .json({ message: 'Internal Server Error', error: err.message });
  }
});

module.exports = { getPaymentHistoryByDeceased };
