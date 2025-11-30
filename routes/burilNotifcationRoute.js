// routes/burialNotificationRoutes.js
const express = require('express');
const router = express.Router();
const {
  handleBurialNotification,
} = require('../controllers/notifications/burilNotification');

// ----------------- Generate Burial Notification -----------------
router.get('/generate-burial-notification', handleBurialNotification);

module.exports = router;
