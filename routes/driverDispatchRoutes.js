const express = require('express');
const router = express.Router();
const {
  assignVehicleDispatch,
} = require('../controllers/drivers/assignDriverDispstch');

router.post('/dispatch', assignVehicleDispatch);

module.exports = router;
