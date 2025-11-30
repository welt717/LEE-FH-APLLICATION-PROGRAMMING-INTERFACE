const express = require('express');
const router = express.Router();
const { safeQuery } = require('../configurations/sqlConfig/db');

// Controller function to update mortuary rate for all records based on category
const updateMortuaryRateForAll = async (rateCategory) => {
  const rates = {
    basic: 3000,
    premium: 5000,
  };

  // Ensure the rateCategory is valid
  if (!rates[rateCategory]) {
    throw new Error('Invalid mortuary rate category');
  }

  const rate = rates[rateCategory];

  try {
    // Update all deceased records with the chosen rate category
    await safeQuery(
      `
      UPDATE deceased
      SET mortuary_charge = ?, rate_category = ?
      WHERE rate_category != ?`,
      [rate, rateCategory, rateCategory],
    );
    console.log(
      `✅ All deceased with rate category '${rateCategory}' updated to KES ${rate}.`,
    );
  } catch (err) {
    console.error(`❌ Error updating mortuary charges: ${err.message}`);
    throw err;
  }
};

// Controller function to register a new deceased (example)
const registerMortuary = async (req, res) => {
  const { deceased_id, rate_category } = req.body;

  const validRateCategories = ['basic', 'premium'];

  if (!validRateCategories.includes(rate_category)) {
    return res
      .status(400)
      .json({
        error: 'Invalid mortuary rate category. Choose "basic" or "premium".',
      });
  }

  try {
    const defaultRate = rate_category === 'premium' ? 5000 : 3000;
    await safeQuery(
      `INSERT INTO deceased (deceased_id, created_at, mortuary_charge, rate_category)
       VALUES (?, NOW(), ?, ?)`,
      [deceased_id, defaultRate, rate_category],
    );
    res.json({ message: 'Mortuary record created successfully.' });
  } catch (err) {
    console.error('❌ Error registering mortuary:', err);
    res.status(500).json({ error: 'Failed to register mortuary' });
  }
};

// Controller function to get all deceased ids
const getMortuaryIds = async (req, res) => {
  try {
    const deceasedIds = await safeQuery('SELECT deceased_id FROM deceased');
    res.json({ deceasedIds });
  } catch (err) {
    console.error('❌ Error fetching deceased ids:', err);
    res.status(500).json({ error: 'Failed to fetch deceased ids' });
  }
};

// Controller function to update mortuary charge for a single deceased record
const updateMortuaryChargeForSingle = async (req, res) => {
  const { deceased_id, rate_category } = req.body;

  const validRateCategories = ['basic', 'premium'];

  if (!deceased_id || !validRateCategories.includes(rate_category)) {
    return res
      .status(400)
      .json({
        error:
          'Invalid or missing deceased_id or mortuary rate category. Choose "basic" or "premium".',
      });
  }

  const rates = {
    basic: 3000,
    premium: 5000,
  };

  try {
    const rate = rates[rate_category];

    // Update the charge for the specific deceased record
    await safeQuery(
      `
      UPDATE deceased
      SET mortuary_charge = ?, rate_category = ?
      WHERE deceased_id = ?`,
      [rate, rate_category, deceased_id],
    );

    res.json({
      message: `Mortuary charge for ${deceased_id} updated to KES ${rate}.`,
    });
  } catch (err) {
    console.error('❌ Error updating mortuary charge:', err);
    res
      .status(500)
      .json({
        error: 'Failed to update mortuary charge for the specified deceased.',
      });
  }
};

// Routes

// Register mortuary
router.post('/register-moltuary', registerMortuary);

// Get list of mortuary ids
router.get('/moltuary-id', getMortuaryIds);

// Update mortuary rate for all records
router.post('/update-mortuary-rate', async (req, res) => {
  const { rateCategory } = req.body;

  if (
    !rateCategory ||
    (rateCategory !== 'basic' && rateCategory !== 'premium')
  ) {
    return res
      .status(400)
      .json({
        error:
          'Invalid or missing mortuary rate category. Choose "basic" or "premium".',
      });
  }

  try {
    await updateMortuaryRateForAll(rateCategory); // Update charges based on category
    res.json({
      message: `Mortuary rate updated to KES ${rateCategory === 'premium' ? 5000 : 3000} for all records.`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update mortuary rates' });
  }
});

// Update mortuary charge for a single deceased record
router.post('/update-mortuary-charge', updateMortuaryChargeForSingle);

module.exports = router;
