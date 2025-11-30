const asyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');

/**
 * @desc Update billing currency and amount for a deceased record
 * @route POST /api/v1/restpoint/update-currency
 * @access Private/Admin
 */
const currencyUpdate = asyncHandler(async (req, res) => {
  const { deceasedId, amount, currency } = req.body;

  if (!deceasedId || !amount || !currency) {
    return res
      .status(400)
      .json({
        message: 'All fields are required: deceasedId, amount, currency',
      });
  }

  // only allow specific currencies
  const allowedCurrencies = ['KSH', 'USD'];
  if (!allowedCurrencies.includes(currency.toUpperCase())) {
    return res
      .status(400)
      .json({ message: 'Invalid currency. Allowed: KSH, USD' });
  }

  const date = getKenyaTimeISO();

  try {
    // Example query to update billing record
    const updateQuery = `
      UPDATE billing
      SET amount = ?, currency = ?, updated_at = ?
      WHERE deceased_id = ?
    `;

    await safeQuery(updateQuery, [
      amount,
      currency.toUpperCase(),
      date,
      deceasedId,
    ]);

    res.status(200).json({
      message: `Billing updated successfully for ${currency.toUpperCase()}`,
      data: {
        deceasedId,
        amount,
        currency: currency.toUpperCase(),
        updated_at: date,
      },
    });
  } catch (error) {
    console.error('Error updating currency billing:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = { currencyUpdate };
