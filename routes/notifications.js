const express = require('express');
const router = express.Router();

const {
  getAllNotifications,
} = require('../controllers/notifications/notifications');

router.get('/notifications', getAllNotifications);

module.exports = router;
