const express = require('express');
const {
  makeHearseBooking,
  getAllHearseBookings,
  assignDriverToBooking,
  getDriverDashboard,
  updateBookingStatus,
  postponeHearseBooking,
  getAllDrivers,
  getBookingsByDriver,
} = require('../controllers/hearseControllers/bookhearse');

const router = express.Router();

router.post('/hearse', makeHearseBooking);
router.get('/hearse-bookings', getAllHearseBookings);
router.put('/hearse-bookings/:booking_id/assign-driver', assignDriverToBooking);
router.put('/hearse-bookings/:booking_id/status', updateBookingStatus);
router.put('/hearse-bookings/:booking_id/postpone', postponeHearseBooking);
router.get('/all-drivers', getAllDrivers);
router.get('/driver/:driver_id', getBookingsByDriver);
router.get('/driver/:driver_id/dashboard', getDriverDashboard);

module.exports = router;
