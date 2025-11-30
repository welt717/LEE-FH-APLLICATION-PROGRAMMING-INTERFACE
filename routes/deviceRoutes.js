const express = require('express');
const router = express.Router();

const { getAllDevices } = require('../utilities/deviceMonitor');

router.get('/devices', (req, res) => {
  getAllDevices((devices) => {
    res.json(devices);
  });
});

module.exports = router;
