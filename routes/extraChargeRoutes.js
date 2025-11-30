const express = require('express');
const router = express.Router();

const {
  addExtraCharge,
  updateExtraCharge,
  getExtraChargesForDeceased,
  deleteExtraCharge,
} = require('../controllers/extraCharges/extraCharges');

// Route to add a new extra charge
router.post('/extra-charges', addExtraCharge);

// Route to update an existing extra charge
router.put('/extra-charges/:id', updateExtraCharge);

// Route to get all extra charges for a deceased
router.get('/extra-charges/deceased/:deceased_id', getExtraChargesForDeceased);

// Route to delete an extra charge
router.delete('/extra-charges/:id', deleteExtraCharge);

module.exports = router;
