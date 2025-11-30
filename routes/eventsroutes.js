const express = require('express');
const router = express.Router();
const {
  createEvents,
  getAllEvents,
  getEventsByMonth,
  updateEvent,
  deleteEvent,
} = require('../controllers/calender/events');

router.post('/events/create', createEvents);

router.get('/events', getAllEvents);

router.get('/events/:year/:month', getEventsByMonth);

router.put('/:eventId', updateEvent);

router.delete('/:eventId', deleteEvent);

module.exports = router;
