const express = require('express');
const router = express.Router();
const uploadCoffinImage = require('../helpers/coffinsUpload');
const {
  createCoffin,
  getAllCoffins,
  getCoffinById,
  updateCoffin,
  deleteCoffin,
  assignCoffin,
  getRecentlyAssignedCoffins,
  getCoffinAnalytics,
  exportCoffinsToExcel,
} = require('../controllers/coffins/coffinControl');

// Routes for coffin management
router.post(
  '/register-coffin',
  uploadCoffinImage.array('coffin_images', 10),
  createCoffin,
);
router.get('/coffins', getAllCoffins);
router.get('/coffins/:id', getCoffinById);
router.put(
  '/coffins/:id',
  uploadCoffinImage.array('coffin_images', 5),
  updateCoffin,
);
router.delete('/coffins/:id', deleteCoffin);
router.get('/coffins/export/excel', exportCoffinsToExcel);

// Assignment routes
router.post('/assign-coffin', assignCoffin);
router.get('/assignments/recent', getRecentlyAssignedCoffins);

// Analytics route
router.get('/coffins/analytics', getCoffinAnalytics);

module.exports = router;
