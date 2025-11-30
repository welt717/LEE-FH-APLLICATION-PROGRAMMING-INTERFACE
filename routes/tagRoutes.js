const express = require('express');
const router = express.Router();
const { printTagHandler } = require('../controllers/zebraTags/printTag');

router.post('/print-tag/:deceasedId', printTagHandler);

module.exports = router;
